import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

// Client sends the file as base64 JSON rather than multipart -- no multipart parser
// (formidable/multer) exists anywhere else in this app, and base64-in-JSON fits the
// existing fetch()-with-JSON-body pattern every other pages/api/mindcord/*.js route
// uses. 8mb covers the 5MB cap below plus base64's ~1.37x expansion and JSON overhead.
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  const pool = getPool()
  const userId = req.user.id

  const roomId = req.body?.room_id
  const filename = (req.body?.filename || '').trim().slice(0, 200)
  const mimeType = (req.body?.mime_type || '').trim()
  const dataB64 = req.body?.data || ''
  if (!roomId || !filename || !dataB64) {
    return res.status(400).json({ error: 'room_id, filename, and data are required' })
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return res.status(400).json({ error: 'Unsupported file type' })
  }
  if (isRateLimited('mindcord_upload', userId, 6, 60_000)) {
    return res.status(429).json({ error: 'Slow down, wait a moment before sharing another file' })
  }

  const active = await pool.query(
    `SELECT display_name, avatar_key FROM mindcord_participants WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [roomId, userId]
  )
  if (!active.rows[0]) return res.status(403).json({ error: 'Join this room first' })

  const buffer = Buffer.from(dataB64, 'base64')
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'File must be under 5MB' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const fileRes = await client.query(
      `INSERT INTO mindcord_files (room_id, user_id, filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [roomId, userId, filename, mimeType, buffer.length, buffer]
    )
    const msgRes = await client.query(
      `INSERT INTO mindcord_messages (room_id, user_id, display_name, avatar_key, file_id, file_name, file_mime, file_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, room_id, user_id, display_name, avatar_key, body, file_id, file_name, file_mime, file_size, created_at`,
      [roomId, userId, active.rows[0].display_name, active.rows[0].avatar_key, fileRes.rows[0].id, filename, mimeType, buffer.length]
    )
    await client.query('COMMIT')
    recordAttempt('mindcord_upload', userId, 60_000)
    return res.status(201).json({ message: msgRes.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export default requireAuth(handler)
