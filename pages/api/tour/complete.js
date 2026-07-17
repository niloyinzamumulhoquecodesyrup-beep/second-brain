import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  await pool.query('UPDATE users SET tour_completed_at = now() WHERE id = $1', [req.user.id])
  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
