import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { runSynthesis } from '../../../lib/mindSynthesis'

// Manual trigger for the synthesis job (§6.5: the daily loop is the primary trigger
// once wired up, but the user should always be able to run this on demand too).
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  try {
    const counts = await runSynthesis(pool, req.user.id)
    return res.status(200).json({ ok: true, counts })
  } catch (err) {
    console.error('synthesis failed:', err)
    return res.status(500).json({ error: 'Synthesis failed' })
  }
}

export default requireAuth(handler)
