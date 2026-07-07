import bcrypt from 'bcryptjs'
import { hasDb, getPool } from '../../../lib/db'
import { createSessionToken, serializeSessionCookie } from '../../../lib/auth'

const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000
const attempts = globalThis.__loginAttempts || (globalThis.__loginAttempts = new Map())

function isRateLimited(key) {
  const entry = attempts.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

function recordFailure(key) {
  const entry = attempts.get(key)
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() })
  } else {
    entry.count += 1
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString()
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' })
  }

  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  const pool = getPool()
  try {
    const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE lower(email) = lower($1)', [email])
    const user = rows[0]
    if (!user) {
      recordFailure(ip)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      recordFailure(ip)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = createSessionToken(user)
    res.setHeader('Set-Cookie', serializeSessionCookie(token))
    return res.status(200).json({ email: user.email })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Login failed' })
  }
}
