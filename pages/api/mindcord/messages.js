import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const roomId = req.query.room_id
    if (!roomId) return res.status(400).json({ error: 'room_id is required' })

    const active = await pool.query(
      `SELECT 1 FROM mindcord_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId]
    )
    if (!active.rows[0]) return res.status(403).json({ error: 'Join this room first' })

    const { rows } = await pool.query(
      `SELECT id, room_id, user_id, display_name, avatar_key, body, file_id, file_name, file_mime, file_size, created_at
       FROM mindcord_messages
       WHERE room_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [roomId]
    )
    return res.status(200).json({ messages: rows.reverse() })
  }

  if (req.method === 'POST') {
    const roomId = req.body?.room_id
    const body = (req.body?.body || '').trim()
    if (!roomId) return res.status(400).json({ error: 'room_id is required' })
    if (body.length < 1 || body.length > 500) {
      return res.status(400).json({ error: 'Message must be 1-500 characters' })
    }
    if (isRateLimited('mindcord_msg', userId, 10, 30_000)) {
      return res.status(429).json({ error: 'Slow down, wait a moment before sending another' })
    }

    const active = await pool.query(
      `SELECT display_name, avatar_key FROM mindcord_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId]
    )
    if (!active.rows[0]) return res.status(403).json({ error: 'Join this room first' })

    const { rows } = await pool.query(
      `INSERT INTO mindcord_messages (room_id, user_id, display_name, avatar_key, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, room_id, user_id, display_name, avatar_key, body, created_at`,
      [roomId, userId, active.rows[0].display_name, active.rows[0].avatar_key, body]
    )
    recordAttempt('mindcord_msg', userId, 30_000)
    return res.status(201).json({ message: rows[0] })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end()
}

export default requireAuth(handler)
