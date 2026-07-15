import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// §4f corrected shape: the brain field renders whatever the refresh cycle wrote to
// mind_sections, not the app's own insight-kind/queue-type taxonomy. If no cycle has
// ever written a section set for this account, fall back to a minimal static set so
// the page never breaks (per §4f's explicit fallback requirement) — this is not a
// hidden taxonomy, just enough to render something before the first cycle runs.
const FALLBACK_SECTIONS = [
  {
    id: 'fallback-overview',
    slug: 'overview',
    title: 'Overview',
    accent: 'emerald',
    renderer: 'insight_list',
    position: 0,
    metadata: {
      insightKinds: [
        'overview', 'interest_cluster', 'open_loop', 'attention_pattern',
        'dormant_revival', 'inferred_goal', 'user_model', 'recommendation'
      ]
    }
  },
  {
    id: 'fallback-queue',
    slug: 'queue',
    title: 'Sort, distill, express',
    accent: 'rose',
    renderer: 'queue',
    position: 1,
    metadata: {}
  }
]

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    `SELECT id, slug, title, accent, renderer, position, metadata, created_at
     FROM mind_sections
     WHERE user_id = $1 AND superseded_by IS NULL
     ORDER BY position ASC, created_at ASC`,
    [req.user.id]
  )

  if (rows.length === 0) {
    return res.status(200).json({ sections: FALLBACK_SECTIONS, isFallback: true })
  }

  return res.status(200).json({ sections: rows, isFallback: false })
}

export default requireAuth(handler)
