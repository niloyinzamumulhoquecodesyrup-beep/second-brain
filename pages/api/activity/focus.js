import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { mode, minutes, task_id } = req.body || {}

  if (mode !== 'focus' && mode !== 'break') {
    return res.status(400).json({ error: 'mode must be "focus" or "break"' })
  }

  if (task_id) {
    const owned = await pool.query('SELECT id FROM tasks WHERE id=$1 AND user_id=$2', [task_id, userId])
    if (!owned.rows[0]) return res.status(404).json({ error: 'Task not found' })
  }

  await logActivity(pool, userId, 'focus_session', task_id || null, { mode, minutes: minutes || null })
  return res.status(201).json({ ok: true })
}

export default requireAuth(handler)
