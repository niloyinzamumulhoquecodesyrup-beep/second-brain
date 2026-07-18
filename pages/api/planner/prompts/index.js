import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

// POST /api/planner/prompts -> record the user's own free-text answer to the standing
// first-run question ("What do you do on a regular basis?"). The row is written
// already-answered: the app never parses natural language into schedule rows itself —
// the next refresh cycle reads answered prompts and turns them into concrete
// routine_suggestion chips / suggested blocks, keeping all interpretation in the cycle.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const { text } = req.body || {}
  if (!text || !text.trim()) return res.status(400).json({ error: 'text required' })

  try {
    const { rows } = await pool.query(
      `INSERT INTO planner_prompts (user_id, prompt_type, question_text, status, answer, answered_at, source_refs)
       VALUES ($1, 'question', $2, 'answered', $3, now(), $4) RETURNING *`,
      [
        req.user.id,
        'What do you do on a regular basis?',
        JSON.stringify({ text: text.trim() }),
        JSON.stringify([{ type: 'stat', name: 'self_reported_routine', value: 'user free-text, awaiting cycle processing' }])
      ]
    )
    return res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
