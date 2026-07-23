import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// Room-scoped active roster, including user_id -- unlike /api/mindcord/rooms (which
// aggregates live participants by domain, across every open room for that domain, and
// omits user_id since it's only ever used for the presence-pill display), Phase 2's
// WebRTC mesh needs to know exactly who is active in THIS room, keyed by user_id, to
// open one RTCPeerConnection per peer. Used once on room entry for the initial roster
// snapshot; live join/leave after that comes from the existing postgres_changes
// subscription on mindcord_participants in RoomView.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const roomId = req.query.room_id
  if (!roomId) return res.status(400).json({ error: 'room_id is required' })

  // See migrations/026_mindcord_heartbeat.sql -- expire anyone whose heartbeat has
  // gone stale (tab closed without hitting Leave) before building the roster, so a
  // caller never opens a peer connection to someone who isn't actually still here.
  await pool.query(
    `UPDATE mindcord_participants SET left_at = now() WHERE left_at IS NULL AND last_seen_at < now() - interval '45 seconds'`
  )

  const active = await pool.query(
    `SELECT 1 FROM mindcord_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [roomId, userId]
  )
  if (!active.rows[0]) return res.status(403).json({ error: 'Join this room first' })

  const { rows } = await pool.query(
    `SELECT user_id, display_name, avatar_key FROM mindcord_participants WHERE room_id = $1 AND left_at IS NULL`,
    [roomId]
  )
  return res.status(200).json({ participants: rows })
}

export default requireAuth(handler)
