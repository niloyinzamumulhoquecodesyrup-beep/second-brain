import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// Base64-in-JSON upload, same pattern as pages/api/mindcord/upload.js -- no
// multipart parser exists elsewhere in this app. Stored as bytea on the user row
// (no object storage configured), same approach as mindcord_files.
// The client (components/PhotoCropModal.js) crops to 1:1 and compresses to this
// same 200KB ceiling before sending -- this check is the backend backstop, not
// the primary enforcement.
export const config = { api: { bodyParser: { sizeLimit: '400kb' } } }

const MAX_BYTES = 200 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { rows } = await pool.query('SELECT avatar_data, avatar_mime FROM users WHERE id = $1', [userId])
    const row = rows[0]
    if (!row?.avatar_data) return res.status(404).json({ error: 'No profile photo set' })
    res.setHeader('Content-Type', row.avatar_mime)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).send(row.avatar_data)
  }

  if (req.method === 'POST') {
    const mimeType = (req.body?.mime_type || '').trim()
    const dataB64 = req.body?.data || ''
    if (!dataB64) return res.status(400).json({ error: 'Image data is required' })
    if (!ALLOWED_MIME.has(mimeType)) return res.status(400).json({ error: 'Unsupported image type' })

    const buffer = Buffer.from(dataB64, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Image must be under 200KB' })
    }

    await pool.query('UPDATE users SET avatar_data = $1, avatar_mime = $2 WHERE id = $3', [buffer, mimeType, userId])
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    await pool.query('UPDATE users SET avatar_data = NULL, avatar_mime = NULL WHERE id = $1', [userId])
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
  return res.status(405).end()
}

export default requireAuth(handler)
