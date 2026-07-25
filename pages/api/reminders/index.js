import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { computeDue, isFocusSuppressed, jsDowToAppDow } from '../../../lib/reminders'

const DEFAULT_PREFS = { quiet_start_min: 1320, quiet_end_min: 480, daily_surface_cap: 30, web_push_enabled: false }
const MAX_CYCLE_REMINDERS_PER_DAY = 5

async function loadContext(pool, userId) {
  const [prefsRes, focusRes] = await Promise.all([
    pool.query('SELECT quiet_start_min, quiet_end_min, daily_surface_cap, web_push_enabled FROM notification_prefs WHERE user_id = $1', [userId]),
    pool.query(
      `SELECT metadata FROM activity_log WHERE user_id = $1 AND event_type = 'focus_state' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    )
  ])
  const prefs = prefsRes.rows[0] || DEFAULT_PREFS
  const now = new Date()
  return {
    now,
    nowMin: now.getHours() * 60 + now.getMinutes(),
    currentDow: jsDowToAppDow(now.getDay()),
    quietStartMin: prefs.quiet_start_min,
    quietEndMin: prefs.quiet_end_min,
    focusSuppressed: isFocusSuppressed(focusRes.rows[0]?.metadata, now)
  }
}

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const ctx = await loadContext(pool, userId)
    const { rows } = await pool.query(
      `SELECT id, task_id, routine_id, block_id, prompt_id, message, payload, fire_at, recur_days,
              time_min, lead_min, kind, origin, status, snooze_until, created_at
       FROM reminders WHERE user_id = $1 AND status = 'active'
       ORDER BY fire_at ASC NULLS LAST, created_at ASC LIMIT 50`,
      [userId]
    )
    const withDue = rows.map(row => ({ ...row, due: computeDue(row, ctx) }))
    return res.status(200).json(withDue)
  }

  if (req.method === 'POST') {
    const { message, fire_at, recur_days, time_min, lead_min, kind, origin, task_id, routine_id, block_id, prompt_id, payload, source_refs } = req.body || {}
    if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' })
    if (!fire_at && !(Array.isArray(recur_days) && recur_days.length && time_min != null)) {
      return res.status(400).json({ error: 'Provide fire_at, or recur_days + time_min' })
    }

    const resolvedOrigin = origin === 'cycle' ? 'cycle' : 'user'
    if (resolvedOrigin === 'cycle') {
      const { rows: recent } = await pool.query(
        `SELECT count(*)::int AS n FROM reminders WHERE user_id = $1 AND origin = 'cycle' AND created_at > now() - interval '24 hours'`,
        [userId]
      )
      if (recent[0].n >= MAX_CYCLE_REMINDERS_PER_DAY) {
        return res.status(429).json({ error: 'Daily cycle-authored reminder cap reached' })
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO reminders (user_id, task_id, routine_id, block_id, prompt_id, message, payload, source_refs, fire_at, recur_days, time_min, lead_min, kind, origin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        userId, task_id || null, routine_id || null, block_id || null, prompt_id || null,
        message.trim(), JSON.stringify(payload || {}), JSON.stringify(source_refs || []),
        fire_at || null, recur_days || null, time_min ?? null, lead_min || 0,
        kind || 'custom', resolvedOrigin
      ]
    )
    return res.status(201).json(rows[0])
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end()
}

export default requireAuth(handler)
