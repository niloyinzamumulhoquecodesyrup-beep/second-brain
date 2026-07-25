import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH'])
    return res.status(405).end()
  }

  const name = (req.body?.name ?? '').trim().slice(0, 80)
  const pool = getPool()
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name || null, req.user.id])
  return res.status(200).json({ name: name || null })
}

export default requireAuth(handler)
