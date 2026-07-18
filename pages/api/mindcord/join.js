import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

// Rooms aren't user-named or pre-created -- joining a domain IS what materializes a
// room for it. Capped at ROOM_CAP active participants because Phase 2's WebRTC is a
// mesh (see migrations/022_mindcord.sql); a domain that fills one room opens another.
const ROOM_CAP = 6

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  const domain = (req.body?.domain || '').trim()
  if (!domain) return res.status(400).json({ error: 'domain is required' })

  if (isRateLimited('mindcord_join', userId, 6, 30_000)) {
    return res.status(429).json({ error: 'Slow down — wait a moment before joining again' })
  }

  const identity = await pool.query('SELECT display_name, avatar_key FROM other_brains_identities WHERE user_id = $1', [userId])
  if (!identity.rows[0]) return res.status(400).json({ error: 'Set a display name in MINDVERSE first' })
  const { display_name, avatar_key } = identity.rows[0]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Serializes concurrent joins to the same domain so the capacity check below is
    // race-free without needing FOR UPDATE on an aggregate query (which Postgres
    // doesn't allow). Released automatically at COMMIT/ROLLBACK.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [domain])

    const existing = await client.query(
      `SELECT p.room_id FROM mindcord_participants p
       JOIN mindcord_rooms r ON r.id = p.room_id
       WHERE p.user_id = $1 AND p.left_at IS NULL AND r.domain = $2 AND r.status = 'open'
       LIMIT 1`,
      [userId, domain]
    )
    let roomId = existing.rows[0]?.room_id

    if (!roomId) {
      const candidate = await client.query(
        `SELECT r.id
         FROM mindcord_rooms r
         LEFT JOIN mindcord_participants p ON p.room_id = r.id AND p.left_at IS NULL
         WHERE r.domain = $1 AND r.status = 'open'
         GROUP BY r.id, r.created_at
         HAVING COUNT(p.id) < $2
         ORDER BY r.created_at ASC
         LIMIT 1`,
        [domain, ROOM_CAP]
      )
      roomId = candidate.rows[0]?.id
    }

    if (!roomId) {
      const created = await client.query('INSERT INTO mindcord_rooms (domain) VALUES ($1) RETURNING id', [domain])
      roomId = created.rows[0].id
    }

    await client.query(
      `INSERT INTO mindcord_participants (room_id, user_id, display_name, avatar_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, user_id) WHERE left_at IS NULL DO NOTHING`,
      [roomId, userId, display_name, avatar_key]
    )

    await client.query('COMMIT')
    return res.status(200).json({ room_id: roomId, domain })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  } finally {
    client.release()
  }
}

export default requireAuth(handler)
