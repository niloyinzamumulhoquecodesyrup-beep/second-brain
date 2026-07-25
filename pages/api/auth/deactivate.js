import bcrypt from 'bcryptjs'
import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { serializeLogoutCookie } from '../../../lib/auth'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }

  const userId = req.user.id
  const { password } = req.body || {}
  if (!password) return res.status(400).json({ error: 'Enter your password to confirm' })

  const pool = getPool()
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])
  const user = rows[0]
  if (!user) return res.status(404).json({ error: 'Account not found' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Incorrect password' })

  await pool.query('UPDATE users SET deactivated_at = now() WHERE id = $1', [userId])
  res.setHeader('Set-Cookie', serializeLogoutCookie())
  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
