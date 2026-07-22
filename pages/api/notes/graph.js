import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// GET /api/notes/graph -> { nodes, edges } for the Organize tab's mind map.
// Two edge kinds, same distinction pages/api/notes/[id]/related.js already draws:
//   'link'  — explicit [[wiki-links]] the user typed (note_links, directional).
//   'ai'    — embedding cosine similarity below threshold, and only where no real
//             link already connects the pair, so the AI layer adds connections
//             instead of just repainting ones already visible as real links.
const NODE_LIMIT = 150
const AI_DISTANCE_THRESHOLD = 0.55 // vectors are normalized, so <=> distance ~= 1 - cosine similarity
const AI_EDGE_LIMIT = 400

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  try {
    const { rows: nodes } = await pool.query(
      `SELECT id, title, para, tags, distilled
       FROM notes WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [userId, NODE_LIMIT]
    )
    if (nodes.length === 0) return res.status(200).json({ nodes: [], edges: [] })

    const ids = nodes.map(n => n.id)

    const [{ rows: linkRows }, { rows: aiRows }] = await Promise.all([
      pool.query(
        `SELECT from_note_id, to_note_id FROM note_links
         WHERE from_note_id = ANY($1::uuid[]) AND to_note_id = ANY($1::uuid[])`,
        [ids]
      ),
      pool.query(
        `SELECT a.id AS from_id, b.id AS to_id, 1 - (a.embedding <=> b.embedding) AS similarity
         FROM notes a
         JOIN notes b ON b.id > a.id AND b.user_id = a.user_id
         WHERE a.user_id = $1
           AND a.id = ANY($2::uuid[]) AND b.id = ANY($2::uuid[])
           AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
           AND (a.embedding <=> b.embedding) < $3
           AND NOT EXISTS (
             SELECT 1 FROM note_links l
             WHERE (l.from_note_id = a.id AND l.to_note_id = b.id)
                OR (l.from_note_id = b.id AND l.to_note_id = a.id)
           )
         ORDER BY (a.embedding <=> b.embedding) ASC
         LIMIT $4`,
        [userId, ids, AI_DISTANCE_THRESHOLD, AI_EDGE_LIMIT]
      )
    ])

    const edges = [
      ...linkRows.map(r => ({ from: r.from_note_id, to: r.to_note_id, type: 'link' })),
      ...aiRows.map(r => ({ from: r.from_id, to: r.to_id, type: 'ai', similarity: r.similarity }))
    ]

    return res.status(200).json({ nodes, edges })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
