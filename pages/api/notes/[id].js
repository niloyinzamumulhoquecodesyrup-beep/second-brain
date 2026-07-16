import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { syncNoteLinks } from '../../../lib/links'
import { logActivity } from '../../../lib/activityLog'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  // §4h: embedding is a 384-float vector — excluded from every client-facing note
  // query below (this file and pages/api/notes/index.js) so it never bloats a
  // response the frontend has no use for. embedded_at is tiny and harmless to keep.
  const NOTE_COLUMNS = 'id, user_id, title, content, para, status, tags, source_url, executive_summary, distilled, pinned, embedded_at, created_at, updated_at'

  if (req.method === 'GET') {
    const { rows } = await pool.query(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id=$1 AND user_id=$2`, [id, userId])
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
       WHERE id = $10 AND user_id = $11 RETURNING ${NOTE_COLUMNS}`,
      [title, content, para, executive_summary, distilled, status, tags, pinned, source_url, id, userId]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    if (content !== undefined) await syncNoteLinks(pool, userId, id, rows[0].content)
    const changedFields = Object.entries({ title, content, para, executive_summary, distilled, status, tags, pinned, source_url })
      .filter(([, v]) => v !== undefined)
      .map(([k]) => k)
    await logActivity(pool, userId, 'note_edited', id, { fields: changedFields })
    return res.status(200).json(rows[0])
  } else if (req.method === 'DELETE') {
    const { rows: deleted, rowCount } = await pool.query('DELETE FROM notes WHERE id=$1 AND user_id=$2 RETURNING title, para', [id, userId])
    if (!rowCount) return res.status(404).json({ error: 'Not found' })
    await logActivity(pool, userId, 'note_deleted', id, { title: deleted[0].title, para: deleted[0].para })
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['GET', 'PUT', 'DELETE'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}

export default requireAuth(handler)
