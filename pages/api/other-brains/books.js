import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// One row per account — a "currently studying" upsert, not a history log.
async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      `SELECT user_id, display_name, avatar_key, title, note, updated_at
       FROM other_brains_books
       ORDER BY updated_at DESC`
    )
    return res.status(200).json({ books: rows })
  }

  if (req.method === 'POST') {
    const title = (req.body?.title || '').trim()
    const note = (req.body?.note || '').trim()
    if (title.length < 1 || title.length > 140) {
      return res.status(400).json({ error: 'Title must be 1-140 characters' })
    }
    if (note.length > 280) {
      return res.status(400).json({ error: 'Note must be 280 characters or fewer' })
    }

    const identity = await pool.query('SELECT 1 FROM other_brains_identities WHERE user_id = $1', [userId])
    if (!identity.rows[0]) return res.status(400).json({ error: 'Set a display name first' })

    const { rows } = await pool.query(
      `INSERT INTO other_brains_books (user_id, display_name, avatar_key, title, note, updated_at)
       SELECT $1, i.display_name, i.avatar_key, $2, $3, now()
       FROM other_brains_identities i WHERE i.user_id = $1
       ON CONFLICT (user_id) DO UPDATE SET title = EXCLUDED.title, note = EXCLUDED.note, updated_at = now()
       RETURNING user_id, display_name, avatar_key, title, note, updated_at`,
      [userId, title, note || null]
    )
    return res.status(200).json({ book: rows[0] })
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end()
}

export default requireAuth(handler)
