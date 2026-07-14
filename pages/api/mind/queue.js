import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// §4d: the queue is read one-at-a-time on the dashboard (ADHD constraint — never a
// big undifferentiated list), but we return the full pending set here so the client
// can advance locally after each answer without an extra round trip.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  // note_para is joined in (not stored on the queue row itself) so the client can theme
  // by PARA bucket — needed for Voice Flow's (§4e) wave-visualizer accent color.
  const { rows } = await pool.query(
    `SELECT q.id, q.note_id, q.question_type, q.question_text, q.options, q.assumed_answer,
            q.section, q.priority_rank, q.source_refs, q.created_at, n.para AS note_para
     FROM para_fun_queue q
     LEFT JOIN notes n ON n.id = q.note_id AND n.user_id = q.user_id
     WHERE q.user_id = $1 AND q.status = 'pending'
     ORDER BY q.priority_rank ASC, q.created_at ASC`,
    [req.user.id]
  )

  return res.status(200).json(rows)
}

export default requireAuth(handler)
