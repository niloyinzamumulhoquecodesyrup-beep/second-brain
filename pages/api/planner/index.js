import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// GET  /api/planner?from=YYYY-MM-DD&days=7 -> { blocks, routines, prompts } — one
//      fetch drives the whole tab (day gantt, week grid, pies, prompt cards).
// POST /api/planner -> create a block. Also how a routine instance materializes for
//      one date: pass routine_id + plan_date and the day view's virtual bar becomes
//      a real row that overrides it (so it can be moved / marked done per-day).
async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { from } = req.query
    const days = Math.min(31, Math.max(1, parseInt(req.query.days, 10) || 7))
    if (!isValidDate(from)) return res.status(400).json({ error: 'from (YYYY-MM-DD) required' })
    try {
      const [blocks, routines, prompts] = await Promise.all([
        pool.query(
          `SELECT *, plan_date::text AS plan_date FROM planner_blocks
           WHERE user_id = $1 AND plan_date >= $2::date AND plan_date < $2::date + $3::int
           ORDER BY planner_blocks.plan_date ASC, start_min ASC`,
          [userId, from, days]
        ),
        pool.query(
          'SELECT * FROM planner_routines WHERE user_id = $1 ORDER BY start_min ASC, created_at ASC',
          [userId]
        ),
        pool.query(
          `SELECT * FROM planner_prompts WHERE user_id = $1 AND status = 'pending' ORDER BY created_at ASC`,
          [userId]
        )
      ])
      return res.status(200).json({ blocks: blocks.rows, routines: routines.rows, prompts: prompts.rows })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'POST') {
    const { title, plan_date, start_min, duration_min, category, routine_id, status } = req.body || {}
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' })
    if (!isValidDate(plan_date)) return res.status(400).json({ error: 'plan_date (YYYY-MM-DD) required' })
    const start = parseInt(start_min, 10)
    const dur = parseInt(duration_min, 10)
    if (!(start >= 0 && start < 1440)) return res.status(400).json({ error: 'start_min out of range' })
    if (!(dur > 0 && dur <= 1440)) return res.status(400).json({ error: 'duration_min out of range' })
    const cat = CATEGORIES.includes(category) ? category : 'other'
    // The app only ever writes user-owned statuses; 'suggested' rows are cycle territory.
    const st = ['active', 'done', 'skipped'].includes(status) ? status : 'active'
    try {
      if (routine_id) {
        const owned = await pool.query('SELECT id FROM planner_routines WHERE id=$1 AND user_id=$2', [routine_id, userId])
        if (!owned.rows[0]) return res.status(404).json({ error: 'Routine not found' })
      }
      const { rows } = await pool.query(
        `INSERT INTO planner_blocks (user_id, plan_date, title, category, start_min, duration_min, status, source, routine_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [userId, plan_date, title.trim(), cat, start, dur, st, routine_id ? 'routine' : 'user', routine_id || null]
      )
      await logActivity(pool, userId, 'plan_created', rows[0].id, { title: rows[0].title, plan_date })
      return res.status(201).json(rows[0])
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
