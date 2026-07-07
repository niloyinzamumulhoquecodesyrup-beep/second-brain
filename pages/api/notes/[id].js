import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { syncNoteLinks } from '../../../lib/links'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  if (req.method === 'GET') {
    const { rows } = await pool.query('SELECT * FROM notes WHERE id=$1 AND user_id=$2', [id, userId])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(rows[0])
  } else if (req.method === 'PUT') {
    const { title, content, para, executive_summary, distilled, status, tags, pinned, source_url } = req.body || {}
    const { rows } = await pool.query(
      `UPDATE notes SET
        title = COALESCE($1,title),
        content = COALESCE($2,content),
        para = COALESCE($3,para),
        executive_summary = COALESCE($4,executive_summary),
        distilled = COALESCE($5,distilled),
        status = COALESCE($6,status),
        tags = COALESCE($7,tags),
        pinned = COALESCE($8,pinned),
        source_url = COALESCE($9,source_url),
        updated_at = now()
       WHERE id = $10 AND user_id = $11 RETURNING *`,
      [title, content, para, executive_summary, distilled, status, tags, pinned, source_url, id, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    if (content !== undefined) await syncNoteLinks(pool, userId, id, rows[0].content)
    return res.status(200).json(rows[0])
  } else if (req.method === 'DELETE') {
    const { rowCount } = await pool.query('DELETE FROM notes WHERE id=$1 AND user_id=$2', [id, userId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}

export default requireAuth(handler)
