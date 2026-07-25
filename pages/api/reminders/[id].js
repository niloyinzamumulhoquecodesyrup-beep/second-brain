import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

const CATEGORIES = ['sleep', 'work', 'study', 'exercise', 'meals', 'leisure', 'other']

function startOfTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH'])
    return res.status(405).end()
  }
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query
  const { action, minutes } = req.body || {}
  if (!['snooze', 'done', 'dismiss', 'accept'].includes(action)) {
    return res.status(400).json({ error: 'bad action' })
  }

  const { rows } = await pool.query(`SELECT * FROM reminders WHERE id = $1 AND user_id = $2 AND status = 'active'`, [id, userId])
  const reminder = rows[0]
  if (!reminder) return res.status(404).json({ error: 'Reminder not found or already handled' })

  if (action === 'snooze') {
    const snoozeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60
    const until = new Date(Date.now() + snoozeMinutes * 60 * 1000)
    await pool.query('UPDATE reminders SET snooze_until = $2 WHERE id = $1', [id, until])
    return res.status(200).json({ ok: true, snooze_until: until })
  }

  if (action === 'done') {
    const isRecurring = Array.isArray(reminder.recur_days) && reminder.recur_days.length > 0
    if (isRecurring) {
      await pool.query('UPDATE reminders SET snooze_until = $2 WHERE id = $1', [id, startOfTomorrow()])
    } else {
      await pool.query(`UPDATE reminders SET status = 'done' WHERE id = $1`, [id])
    }
    return res.status(200).json({ ok: true })
  }

  if (action === 'dismiss') {
    await pool.query(`UPDATE reminders SET status = 'dismissed' WHERE id = $1`, [id])
    return res.status(200).json({ ok: true })
  }

  // accept -- routine_suggestion only, proxies to the same accept logic
  // pages/api/planner/prompts/[id].js uses so a suggestion becomes a real
  // planner_routines row through one write path, never a second one.
  if (reminder.kind !== 'routine_suggestion' || !reminder.prompt_id) {
    return res.status(400).json({ error: 'Not a routine suggestion' })
  }
  const promptRes = await pool.query(
    `SELECT * FROM planner_prompts WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [reminder.prompt_id, userId]
  )
  const prompt = promptRes.rows[0]
  if (!prompt) {
    await pool.query(`UPDATE reminders SET status = 'dismissed' WHERE id = $1`, [id])
    return res.status(404).json({ error: 'Suggestion no longer available' })
  }

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
    [prompt.id, JSON.stringify({ accepted_routine_id: inserted.rows[0].id })]
  )
  await pool.query(`UPDATE reminders SET status = 'done' WHERE id = $1`, [id])
  await logActivity(pool, userId, 'routine_created', inserted.rows[0].id, { title: inserted.rows[0].title, source: 'cycle' })
  return res.status(200).json({ ok: true, routine: inserted.rows[0] })
}

export default requireAuth(handler)
