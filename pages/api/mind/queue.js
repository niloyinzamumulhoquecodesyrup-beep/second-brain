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

  const { rows } = await pool.query(
    `SELECT id, note_id, question_type, question_text, options, assumed_answer, section, priority_rank, source_refs, created_at
     FROM para_fun_queue
     WHERE user_id = $1 AND status = 'pending'
     ORDER BY priority_rank ASC, created_at ASC`,
    [req.user.id]
  )

  return res.status(200).json(rows)
}

export default requireAuth(handler)
