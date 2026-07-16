import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

// §4h: notes that are new or edited since their last embed — what a cycle's client-side
// embedding step (lib/clientEmbeddings.js) needs to catch up on. Never the full table.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, title, content FROM notes
     WHERE user_id = $1 AND (embedding IS NULL OR embedded_at IS NULL OR updated_at > embedded_at)
     ORDER BY updated_at ASC`,
    [req.user.id]
  )

  const notes = rows.map(n => ({ id: n.id, text: `${n.title || ''}\n\n${n.content || ''}`.trim() }))
  return res.status(200).json(notes)
}

export default requireAuth(handler)
