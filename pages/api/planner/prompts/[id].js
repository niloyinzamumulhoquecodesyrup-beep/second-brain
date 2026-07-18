import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'
import { logActivity } from '../../../../lib/activityLog'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']

// POST /api/planner/prompts/[id] with { action, value }:
//   action 'answer'  -> store the picked option / free text on a question row; the next
//                       cycle reads it (same read-back pattern as para_fun_queue answers).
//   action 'accept'  -> a routine_suggestion chip becomes a real planner_routines row
//                       (the one place a cycle-authored routine turns concrete — only
//                       ever on this explicit user tap).
//   action 'dismiss' -> close the prompt without effect.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query
  const { action, value } = req.body || {}
  if (!['answer', 'accept', 'dismiss'].includes(action)) {
    return res.status(400).json({ error: 'bad action' })
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM planner_prompts WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
      [id, userId]
    )
    const prompt = rows[0]
    if (!prompt) return res.status(404).json({ error: 'Prompt not found or already handled' })

    if (action === 'dismiss') {
      await pool.query(
        `UPDATE planner_prompts SET status = 'dismissed', answered_at = now() WHERE id = $1`,
        [id]
      )
      return res.status(200).json({ ok: true })
    }

    if (action === 'answer') {
      if (prompt.prompt_type !== 'question') return res.status(400).json({ error: 'not a question' })
      await pool.query(
        `UPDATE planner_prompts SET status = 'answered', answer = $2, answered_at = now() WHERE id = $1`,
        [id, JSON.stringify({ value: value ?? null })]
      )
      return res.status(200).json({ ok: true })
    }

    // accept
    if (prompt.prompt_type !== 'routine_suggestion') return res.status(400).json({ error: 'not a suggestion' })
    const s = prompt.suggestion || {}
    const start = parseInt(s.start_min, 10)
    const dur = parseInt(s.duration_min, 10)
    if (!s.title || !(start >= 0 && start < 1440) || !(dur > 0 && dur <= 1440)) {
      return res.status(422).json({ error: 'suggestion payload is malformed' })
    }
    const days = Array.isArray(s.days)
      ? [...new Set(s.days.map(d => parseInt(d, 10)))].filter(d => d >= 0 && d <= 6).sort()
      : [0, 1, 2, 3, 4, 5, 6]
    const cat = CATEGORIES.includes(s.category) ? s.category : 'other'
    const inserted = await pool.query(
      `INSERT INTO planner_routines (user_id, title, category, days, start_min, duration_min, source, source_refs)
       VALUES ($1,$2,$3,$4,$5,$6,'cycle',$7) RETURNING *`,
      [userId, String(s.title).trim(), cat, days.length ? days : [0, 1, 2, 3, 4, 5, 6], start, dur, JSON.stringify(prompt.source_refs || [])]
    )
    await pool.query(
      `UPDATE planner_prompts SET status = 'answered', answer = $2, answered_at = now() WHERE id = $1`,
      [id, JSON.stringify({ accepted_routine_id: inserted.rows[0].id })]
    )
    await logActivity(pool, userId, 'routine_created', inserted.rows[0].id, { title: inserted.rows[0].title, source: 'cycle' })
    return res.status(200).json({ ok: true, routine: inserted.rows[0] })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
