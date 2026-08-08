import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'
import { composeTaskMessage, taskFireAt } from '../../../lib/reminders'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'PUT') {
    const { title, done, due_date, start_min, duration_min, pieces } = req.body || {}
    if (start_min !== undefined && start_min !== null && !(start_min >= 0 && start_min < 1440)) {
      return res.status(400).json({ error: 'start_min out of range' })
    }
    if (duration_min !== undefined && duration_min !== null && !(duration_min > 0 && duration_min <= 1440)) {
      return res.status(400).json({ error: 'duration_min out of range' })
    }
    const before = await pool.query('SELECT done FROM tasks WHERE id=$1 AND user_id=$2', [id, userId])
    if (!before.rows[0]) return res.status(404).json({ error: 'Not found' })
    const wasDone = before.rows[0].done
    const piecesParam = Array.isArray(pieces) ? JSON.stringify(pieces) : null

    const { rows } = await pool.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        done = COALESCE($2, done),
        due_date = COALESCE($3, due_date),
        start_min = COALESCE($4, start_min),
        duration_min = COALESCE($5, duration_min),
        pieces = COALESCE($6::jsonb, pieces),
        completed_at = CASE WHEN $2 = true THEN now() WHEN $2 = false THEN NULL ELSE completed_at END
       WHERE id = $7 AND user_id = $8 RETURNING *`,
      [title, done, due_date, start_min, duration_min, piecesParam, id, userId]
    )
    const task = rows[0]
    if (!task) return res.status(404).json({ error: 'Not found' })
    if (done === true && !wasDone) {
      await logActivity(pool, userId, 'task_completed', id, { title: task.title, note_id: task.note_id })
    }

    if (task.done) {
      await pool.query(`UPDATE reminders SET status = 'done' WHERE task_id = $1 AND origin = 'system' AND status = 'active'`, [id])
    } else if (task.due_date) {
      const existing = await pool.query(
        `SELECT id FROM reminders WHERE task_id = $1 AND origin = 'system' LIMIT 1`,
        [id]
      )
      const fireAt = taskFireAt(task.due_date, task.start_min)
      const message = composeTaskMessage(task.title)
      if (existing.rows[0]) {
        await pool.query(
          `UPDATE reminders SET fire_at = $2, message = $3, status = 'active', snooze_until = NULL WHERE id = $1`,
          [existing.rows[0].id, fireAt, message]
        )
      } else {
        await pool.query(
          `INSERT INTO reminders (user_id, task_id, message, fire_at, kind, origin) VALUES ($1,$2,$3,$4,'task','system')`,
          [userId, id, message, fireAt]
        )
      }
    }

    return res.status(200).json(task)
  } else if (req.method === 'DELETE') {
    const { rows: deleted, rowCount } = await pool.query('DELETE FROM tasks WHERE id=$1 AND user_id=$2 RETURNING title, done', [id, userId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    await logActivity(pool, userId, 'task_deleted', id, { title: deleted[0].title, was_done: deleted[0].done })
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['PUT', 'DELETE'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
