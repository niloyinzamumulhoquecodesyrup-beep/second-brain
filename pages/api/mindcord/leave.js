import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE mindcord_participants SET left_at = now()
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId]
    )
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS active FROM mindcord_participants WHERE room_id = $1 AND left_at IS NULL`,
      [roomId]
    )
    if (rows[0].active === 0) {
      await client.query(
        `UPDATE mindcord_rooms SET status = 'closed', closed_at = now() WHERE id = $1 AND status = 'open'`,
        [roomId]
      )
    }
    await client.query('COMMIT')
    return res.status(200).json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  } finally {
    client.release()
  }
}

export default requireAuth(handler)
