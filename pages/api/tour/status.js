import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query('SELECT tour_completed_at FROM users WHERE id = $1', [req.user.id])
  return res.status(200).json({ completed: !!rows[0]?.tour_completed_at })
}

export default requireAuth(handler)
