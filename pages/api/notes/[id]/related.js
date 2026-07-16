import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

// §4h: nearest-neighbor notes by embedding cosine similarity, deliberately excluding
// anything that already shares a tag or a note_links row — this surfaces connections
// the existing "Links to"/"Linked from" cards (links.js) and tag filters can't show,
// not a duplicate of them.
const SIMILARITY_THRESHOLD_DISTANCE = 0.6 // vectors are normalized, so <=> distance ~= 1 - cosine similarity
const LIMIT = 5

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  const { rows: selfRows } = await pool.query(
    `SELECT embedding::text AS embedding, tags FROM notes WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )
  const note = selfRows[0]
  if (!note) return res.status(404).json({ error: 'Not found' })
  if (!note.embedding) return res.status(200).json([])

  const { rows } = await pool.query(
    `SELECT n.id, n.title, n.para, (n.embedding <=> $1::vector) AS distance
     FROM notes n
     WHERE n.user_id = $2
       AND n.id != $3
       AND n.embedding IS NOT NULL
       AND NOT (n.tags && $4::text[])
       AND NOT EXISTS (
         SELECT 1 FROM note_links l
         WHERE (l.from_note_id = $3 AND l.to_note_id = n.id)
            OR (l.from_note_id = n.id AND l.to_note_id = $3)
       )
       AND (n.embedding <=> $1::vector) < $5
     ORDER BY distance ASC
     LIMIT $6`,
    [note.embedding, userId, id, note.tags || [], SIMILARITY_THRESHOLD_DISTANCE, LIMIT]
  )

  return res.status(200).json(rows.map(r => ({ id: r.id, title: r.title, para: r.para, similarity: 1 - r.distance })))
}

export default requireAuth(handler)
