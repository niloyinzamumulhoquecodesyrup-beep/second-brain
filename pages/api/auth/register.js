import bcrypt from 'bcryptjs'
import { hasDb, getPool } from '../../../lib/db'
import { createSessionToken, serializeSessionCookie } from '../../../lib/auth'
import { isRateLimited, recordAttempt, requestIp } from '../../../lib/rateLimit'

const MAX_ATTEMPTS = 10
const WINDOW_MS = 60 * 60 * 1000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })

  const ip = requestIp(req)
  if (isRateLimited('register', ip, MAX_ATTEMPTS, WINDOW_MS)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' })
  }

  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  const pool = getPool()
  try {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
    if (existing.rows[0]) {
      recordAttempt('register', ip, WINDOW_MS)
      return res.status(409).json({ error: 'An account with that email already exists' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash]
    )
    const user = rows[0]

    const token = createSessionToken(user)
    res.setHeader('Set-Cookie', serializeSessionCookie(token))
    return res.status(201).json({ email: user.email })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that email already exists' })
    }
    console.error(err)
    return res.status(500).json({ error: 'Registration failed' })
  }
}
