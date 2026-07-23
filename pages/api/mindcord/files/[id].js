import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  // Gated the same way messages.js's GET is: only someone currently active in the
  // owning room can pull the bytes, regardless of who originally shared the file.
  const { rows } = await pool.query(
    `SELECT f.filename, f.mime_type, f.data
     FROM mindcord_files f
     JOIN mindcord_participants p ON p.room_id = f.room_id AND p.left_at IS NULL
     WHERE f.id = $1 AND p.user_id = $2
     LIMIT 1`,
    [id, userId]
  )
  const file = rows[0]
  if (!file) return res.status(404).json({ error: 'Not found' })

  const disposition = file.mime_type.startsWith('image/') ? 'inline' : 'attachment'
  res.setHeader('Content-Type', file.mime_type)
  res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.filename)}"`)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  return res.status(200).send(file.data)
}

export default requireAuth(handler)
