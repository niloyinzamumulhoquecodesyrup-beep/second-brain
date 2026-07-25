import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

// Live Pomodoro on/off signal (see REMINDERS_PLAN.md "Do-not-disturb"). Distinct from
// /api/activity/focus, which logs completed focus minutes after the fact for stats --
// this is a real-time "don't notify me right now" flag the reminders evaluator reads.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const { active, ends_at } = req.body || {}

  await logActivity(pool, req.user.id, 'focus_state', null, {
    active: !!active,
    ends_at: active ? (ends_at || null) : null
  })
  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
