import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// The Knowledge Library (mind_knowledge topic "field_investigation_method"): the durable,
// cumulative record of everything a refresh cycle's field investigation has learned —
// distinct from mind_insights, which is a per-cycle snapshot superseded wholesale each
// time. Read-only here; a cycle writes/upserts rows directly via the Supabase MCP.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, domain, entry_type, title, summary, metadata, source_refs,
            first_learned_at, last_reinforced_at, cycle_count
     FROM mind_knowledge_library
     WHERE user_id = $1
     ORDER BY domain ASC, last_reinforced_at DESC`,
    [req.user.id]
  )

  return res.status(200).json({ entries: rows })
}

export default requireAuth(handler)
