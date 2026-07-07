import bcrypt from 'bcryptjs'
import { hasDb, getPool } from '../../../lib/db'
import { createSessionToken, serializeSessionCookie } from '../../../lib/auth'
import { isRateLimited, recordAttempt, requestIp } from '../../../lib/rateLimit'

const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })

  const ip = requestIp(req)
  if (isRateLimited('login', ip, MAX_ATTEMPTS, WINDOW_MS)) {
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
      recordAttempt('login', ip, WINDOW_MS)
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      recordAttempt('login', ip, WINDOW_MS)
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
