import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'
import { logActivity } from '../../../../lib/activityLog'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']

function cleanDays(days) {
  if (!Array.isArray(days)) return null
  const uniq = [...new Set(days.map(d => parseInt(d, 10)))].filter(d => d >= 0 && d <= 6).sort()
  return uniq.length > 0 ? uniq : null
}

// The recurring skeleton behind the planner. POST is the single path by which a
// routine comes to exist — typed in by hand or via an accepted suggestion chip
// (the client passes source 'starter'; accepted cycle suggestions go through
// /api/planner/prompts/[id] instead so the prompt row gets closed out).
async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM planner_routines WHERE user_id = $1 ORDER BY start_min ASC, created_at ASC',
        [userId]
      )
      return res.status(200).json(rows)
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'POST') {
    const { title, category, days, start_min, duration_min, source } = req.body || {}
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' })
    const start = parseInt(start_min, 10)
    const dur = parseInt(duration_min, 10)
    if (!(start >= 0 && start < 1440)) return res.status(400).json({ error: 'start_min out of range' })
    if (!(dur > 0 && dur <= 1440)) return res.status(400).json({ error: 'duration_min out of range' })
    const cat = CATEGORIES.includes(category) ? category : 'other'
    const cleanedDays = cleanDays(days) || [0, 1, 2, 3, 4, 5, 6]
    const src = source === 'starter' ? 'starter' : 'user'
    try {
      const { rows } = await pool.query(
        `INSERT INTO planner_routines (user_id, title, category, days, start_min, duration_min, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [userId, title.trim(), cat, cleanedDays, start, dur, src]
      )
      await logActivity(pool, userId, 'routine_created', rows[0].id, { title: rows[0].title, source: src })
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
