import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { breakdownTask } from '../../../lib/gemini'

const DAILY_LIMIT = 5
const MAX_TASK_LENGTH = 300

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  const { task } = req.body || {}
  const taskText = typeof task === 'string' ? task.trim() : ''
  if (!taskText) return res.status(400).json({ error: 'task is required' })
  if (taskText.length > MAX_TASK_LENGTH) {
    return res.status(400).json({ error: `task must be ${MAX_TASK_LENGTH} characters or fewer` })
  }

  try {
    // Calendar day in UTC, not the server's local time -- see lib/db.js's DATE
    // type-parser comment for why local-time day boundaries have bitten this app before.
    const { rows: countRows } = await pool.query(
      `SELECT count(*)::int AS count FROM task_breakdowns
       WHERE user_id = $1
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [userId]
    )
    const usedToday = countRows[0].count
    if (usedToday >= DAILY_LIMIT) {
      return res.status(429).json({ error: '5 task breakdown limit exceeded' })
    }

    const subtasks = await breakdownTask(taskText)
    if (!subtasks.length) return res.status(502).json({ error: 'Breakdown failed, try again' })

    await pool.query(
      'INSERT INTO task_breakdowns (user_id, task_text, subtasks) VALUES ($1,$2,$3)',
      [userId, taskText, JSON.stringify(subtasks)]
    )

    return res.status(200).json({
      task: taskText,
      subtasks,
      remaining_today: DAILY_LIMIT - usedToday - 1
    })
  } catch (err) {
    console.error('task breakdown failed:', err)
    return res.status(500).json({ error: 'Breakdown failed' })
  }
}

export default requireAuth(handler)
