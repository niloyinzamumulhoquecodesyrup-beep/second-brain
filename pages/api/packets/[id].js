import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'PUT') {
    const { title, content } = req.body || {}
    const { rows } = await pool.query(
      `UPDATE packets SET
        title = COALESCE($1, title),
        content = COALESCE($2, content)
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [title, content, id, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(rows[0])
  } else if (req.method === 'DELETE') {
    const { rows: deleted, rowCount } = await pool.query('DELETE FROM packets WHERE id=$1 AND user_id=$2 RETURNING title', [id, userId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    await logActivity(pool, userId, 'packet_deleted', id, { title: deleted[0].title })
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['PUT', 'DELETE'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
