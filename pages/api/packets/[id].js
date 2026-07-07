import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'PUT') {
    const { done, title, content } = req.body || {}
    const { rows } = await pool.query(
      `UPDATE packets SET
        done = COALESCE($1, done),
        title = COALESCE($2, title),
        content = COALESCE($3, content)
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [done, title, content, id, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(rows[0])
  } else if (req.method === 'DELETE') {
    const { rowCount } = await pool.query('DELETE FROM packets WHERE id=$1 AND user_id=$2', [id, userId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['PUT', 'DELETE'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
