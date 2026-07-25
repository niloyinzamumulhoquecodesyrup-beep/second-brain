import bcrypt from 'bcryptjs'
import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }

  const userId = req.user.id
  if (isRateLimited('change_password', userId, 8, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' })
  }

  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' })
  }

  const pool = getPool()
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])
  const user = rows[0]
  if (!user) return res.status(404).json({ error: 'Account not found' })

  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) {
    recordAttempt('change_password', userId, 15 * 60 * 1000)
    return res.status(401).json({ error: 'Current password is incorrect' })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId])
  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
