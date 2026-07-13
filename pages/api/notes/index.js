import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { syncNoteLinks } from '../../../lib/links'
import { logActivity } from '../../../lib/activityLog'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { para, tag, q, status } = req.query
    const clauses = ['user_id = $1']
    const params = [userId]

    if (para) {
      params.push(para)
      clauses.push(`para = $${params.length}`)
    }
    if (status) {
      params.push(status)
      clauses.push(`status = $${params.length}`)
    }
    if (tag) {
      params.push(tag)
      clauses.push(`$${params.length} = ANY(tags)`)
    }
    if (q) {
      params.push(`%${q}%`)
      clauses.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length} OR executive_summary ILIKE $${params.length})`)
    }

    try {
      const { rows } = await pool.query(
        `SELECT * FROM notes WHERE ${clauses.join(' AND ')} ORDER BY pinned DESC, created_at DESC`,
        params
      )
      res.status(200).json(rows)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'POST') {
    const { title, content, tags, para, source_url } = req.body || {}
    try {
      const { rows } = await pool.query(
        `INSERT INTO notes (user_id, title, content, tags, para, source_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [userId, title || 'Untitled', content || null, tags || null, para || 'inbox', source_url || null]
      )
      const note = rows[0]
      await syncNoteLinks(pool, userId, note.id, note.content)
      await logActivity(pool, userId, 'note_created', note.id, { title: note.title, para: note.para })
      res.status(201).json(note)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}

export default requireAuth(handler)
