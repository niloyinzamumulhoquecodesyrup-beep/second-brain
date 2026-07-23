import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// See migrations/026_mindcord_heartbeat.sql. Called every ~20s from RoomView while a
// participant is actually in the room, so a stale/expiry check elsewhere (rooms.js,
// join.js, participants.js) can tell "still here" apart from "tab closed without
// hitting Leave" without needing a cron job.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const roomId = req.body?.room_id
  if (!roomId) return res.status(400).json({ error: 'room_id is required' })

  await pool.query(
    `UPDATE mindcord_participants SET last_seen_at = now() WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [roomId, userId]
  )
  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
