import { hasDb, getPool } from '../../lib/db'
import { requireAuth } from '../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id, para } = req.body || {}
  if (!id || !para) return res.status(400).json({ error: 'id and para required' })
  if (!['inbox', 'project', 'area', 'resource', 'archive'].includes(para)) {
    return res.status(400).json({ error: 'invalid para value' })
  }
  try {
    const { rows } = await pool.query(
      'UPDATE notes SET para=$1, updated_at=now() WHERE id=$2 AND user_id=$3 RETURNING *',
      [para, id, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
