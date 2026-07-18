import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']
// Every transition the UI offers: accept a suggestion (-> active), mark done/skipped,
// dismiss a suggestion, or put a done block back to active.
const STATUSES = ['active', 'done', 'skipped', 'dismissed']

// PATCH  /api/planner/[id] -> retime (drag/resize), rename, recategorize, or change
//        status. Dragging a 'suggested' block also accepts it: the client sends the
//        new time together with status 'active'.
// DELETE /api/planner/[id] -> remove a block outright.
async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'PATCH') {
    const { title, category, start_min, duration_min, plan_date, status } = req.body || {}
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
    if (plan_date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plan_date || '')) return res.status(400).json({ error: 'bad plan_date' })
      set('plan_date', plan_date)
    }
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ error: 'bad status' })
      set('status', status)
    }
    if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' })
    sets.push('updated_at = now()')
    try {
      const { rows } = await pool.query(
        `UPDATE planner_blocks SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING *`,
        params
      )
      if (!rows[0]) return res.status(404).json({ error: 'Block not found' })
      if (status === 'done') {
        await logActivity(pool, userId, 'plan_completed', rows[0].id, { title: rows[0].title })
      }
      return res.status(200).json(rows[0])
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'DELETE') {
    try {
      const { rows } = await pool.query(
        'DELETE FROM planner_blocks WHERE user_id = $1 AND id = $2 RETURNING id',
        [userId, id]
      )
      if (!rows[0]) return res.status(404).json({ error: 'Block not found' })
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
