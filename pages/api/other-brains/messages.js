import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT id, user_id, display_name, avatar_key, body, created_at
       FROM other_brains_messages
       ORDER BY created_at DESC
       LIMIT 50`
    )
    return res.status(200).json({ messages: rows.reverse() })
  }

  if (req.method === 'POST') {
    const body = (req.body?.body || '').trim()
    if (body.length < 1 || body.length > 500) {
      return res.status(400).json({ error: 'Message must be 1-500 characters' })
    }
    if (isRateLimited('obrains_msg', userId, 10, 30_000)) {
      return res.status(429).json({ error: 'Slow down, wait a moment before sending another' })
    }

    const identity = await pool.query('SELECT 1 FROM other_brains_identities WHERE user_id = $1', [userId])
    if (!identity.rows[0]) return res.status(400).json({ error: 'Set a display name first' })

    const { rows } = await pool.query(
      `INSERT INTO other_brains_messages (user_id, display_name, avatar_key, body)
       SELECT $1, i.display_name, i.avatar_key, $2
       FROM other_brains_identities i WHERE i.user_id = $1
       RETURNING id, user_id, display_name, avatar_key, body, created_at`,
      [userId, body]
    )
    recordAttempt('obrains_msg', userId, 30_000)
    return res.status(201).json({ message: rows[0] })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end()
}

export default requireAuth(handler)
