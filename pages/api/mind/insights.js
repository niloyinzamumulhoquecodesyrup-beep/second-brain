import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, kind, summary, source_refs, created_at
     FROM mind_insights
     WHERE user_id = $1 AND superseded_by IS NULL
     ORDER BY created_at DESC`,
    [req.user.id]
  )

  const overview = rows.find(r => r.kind === 'overview') || null
  const byKind = {}
  for (const kind of ['interest_cluster', 'open_loop', 'attention_pattern', 'dormant_revival', 'inferred_goal', 'user_model', 'recommendation']) {
    byKind[kind] = rows.filter(r => r.kind === kind)
  }

  // §6 step 5: the dashboard's staleness banner is keyed off the most recent
  // mind_insights row of any kind, not just overview — a stale overview next to
  // freshly re-run templated kinds should still count as "recently touched."
  const lastUpdated = rows.length > 0
    ? rows.reduce((max, r) => (r.created_at > max ? r.created_at : max), rows[0].created_at)
    : null

  return res.status(200).json({ overview, byKind, lastUpdated })
}

export default requireAuth(handler)
