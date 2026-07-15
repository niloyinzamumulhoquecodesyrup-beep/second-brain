import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// §4k: read-only view of the most recent refresh cycles (mind_cycle_runs), so the
// dashboard can surface cycle health honestly — including partial/failed runs, not
// just successes. Written by Claude Code at the end of each cycle (§6); the app only
// ever reads this table.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, started_at, completed_at, tokens_used, sections_written,
            insights_written, status, notes, created_at
     FROM mind_cycle_runs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [req.user.id]
  )

  return res.status(200).json({ cycles: rows, latest: rows[0] || null })
}

export default requireAuth(handler)
