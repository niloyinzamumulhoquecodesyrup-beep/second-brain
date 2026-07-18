import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// Same domain aggregate as /api/other-brains/clusters, cross-referenced with any
// currently-open mindcord rooms so the room list can show a live badge without a
// separate presence layer -- mindcord_participants rows (persisted, Realtime-backed)
// already are the presence data.
async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const [{ rows: domains }, { rows: rooms }] = await Promise.all([
    pool.query(
      `SELECT domain, COUNT(DISTINCT user_id)::int AS brains
       FROM mind_knowledge_library
       GROUP BY domain
       ORDER BY brains DESC
       LIMIT 40`
    ),
    pool.query(
      `SELECT r.domain, p.display_name, p.avatar_key
       FROM mindcord_rooms r
       JOIN mindcord_participants p ON p.room_id = r.id AND p.left_at IS NULL
       WHERE r.status = 'open'`
    )
  ])

  const byDomain = new Map()
  for (const row of rooms) {
    const entry = byDomain.get(row.domain) || { count: 0, participants: [] }
    entry.count += 1
    if (entry.participants.length < 8) entry.participants.push({ display_name: row.display_name, avatar_key: row.avatar_key })
    byDomain.set(row.domain, entry)
  }

  const result = domains.map(d => ({ domain: d.domain, brains: d.brains, live: byDomain.get(d.domain) || null }))
  for (const [domain, entry] of byDomain) {
    if (!result.some(r => r.domain === domain)) result.push({ domain, brains: 0, live: entry })
  }

  return res.status(200).json({ domains: result })
}

export default requireAuth(handler)
