import { hasDb, getPool } from '../../lib/db'
import { requireAuth } from '../../lib/withAuth'

const DEFAULT_PREFS = { quiet_start_min: 1320, quiet_end_min: 480, daily_surface_cap: 30, web_push_enabled: false }

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      'SELECT quiet_start_min, quiet_end_min, daily_surface_cap, web_push_enabled FROM notification_prefs WHERE user_id = $1',
      [userId]
    )
    return res.status(200).json(rows[0] || DEFAULT_PREFS)
  }

  if (req.method === 'PUT') {
    const { quiet_start_min, quiet_end_min } = req.body || {}
    const startMin = Number.isInteger(quiet_start_min) && quiet_start_min >= 0 && quiet_start_min < 1440 ? quiet_start_min : DEFAULT_PREFS.quiet_start_min
    const endMin = Number.isInteger(quiet_end_min) && quiet_end_min >= 0 && quiet_end_min < 1440 ? quiet_end_min : DEFAULT_PREFS.quiet_end_min

    const { rows } = await pool.query(
      `INSERT INTO notification_prefs (user_id, quiet_start_min, quiet_end_min)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET quiet_start_min = $2, quiet_end_min = $3
       RETURNING quiet_start_min, quiet_end_min, daily_surface_cap, web_push_enabled`,
      [userId, startMin, endMin]
    )
    return res.status(200).json(rows[0])
  }

  res.setHeader('Allow', ['GET', 'PUT'])
  return res.status(405).end()
}

export default requireAuth(handler)
