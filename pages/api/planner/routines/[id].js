import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']

function cleanDays(days) {
  if (!Array.isArray(days)) return null
  const uniq = [...new Set(days.map(d => parseInt(d, 10)))].filter(d => d >= 0 && d <= 6).sort()
  return uniq.length > 0 ? uniq : null
}

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'PATCH') {
    const { title, category, days, start_min, duration_min, active } = req.body || {}
    const sets = []
    const params = [userId, id]
    function set(col, val) {
      params.push(val)
      sets.push(`${col} = $${params.length}`)
    }
    if (title !== undefined) {
      if (!title || !title.trim()) return res.status(400).json({ error: 'title cannot be empty' })
      set('title', title.trim())
    }
    if (category !== undefined) {
      if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'bad category' })
      set('category', category)
    }
    if (days !== undefined) {
      const cleaned = cleanDays(days)
      if (!cleaned) return res.status(400).json({ error: 'days must be a non-empty array of 0-6' })
      set('days', cleaned)
    }
    if (start_min !== undefined) {
      const v = parseInt(start_min, 10)
      if (!(v >= 0 && v < 1440)) return res.status(400).json({ error: 'start_min out of range' })
      set('start_min', v)
    }
    if (duration_min !== undefined) {
      const v = parseInt(duration_min, 10)
      if (!(v > 0 && v <= 1440)) return res.status(400).json({ error: 'duration_min out of range' })
      set('duration_min', v)
    }
    if (active !== undefined) set('active', !!active)
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' })
    sets.push('updated_at = now()')
    try {
      const { rows } = await pool.query(
        `UPDATE planner_routines SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING *`,
        params
      )
      if (!rows[0]) return res.status(404).json({ error: 'Routine not found' })
      return res.status(200).json(rows[0])
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'DELETE') {
    try {
      const { rows } = await pool.query(
        'DELETE FROM planner_routines WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Routine not found' })
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['PATCH', 'DELETE'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
