import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// Aggregate-only: counts distinct accounts per domain across mind_knowledge_library,
// never touching users. This is the entire "who's studying what" surface — a domain
// name and a headcount, nothing per-account.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT domain, COUNT(DISTINCT user_id)::int AS brains
     FROM mind_knowledge_library
     GROUP BY domain
     ORDER BY brains DESC
     LIMIT 40`
  )

  return res.status(200).json({ clusters: rows })
}

export default requireAuth(handler)
