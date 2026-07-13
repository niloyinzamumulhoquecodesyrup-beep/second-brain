import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { note_id } = req.query
    const clauses = ['user_id = $1']
    const params = [userId]
    if (note_id) {
      params.push(note_id)
      clauses.push(`note_id = $${params.length}`)
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM tasks WHERE ${clauses.join(' AND ')} ORDER BY done ASC, due_date NULLS LAST, created_at DESC`,
        params
      )
      return res.status(200).json(rows)
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'POST') {
    const { title, note_id, due_date } = req.body || {}
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' })

    try {
      if (note_id) {
        const owned = await pool.query('SELECT id FROM notes WHERE id=$1 AND user_id=$2', [note_id, userId])
        if (!owned.rows[0]) return res.status(404).json({ error: 'Note not found' })
      }
      const { rows } = await pool.query(
        'INSERT INTO tasks (user_id, note_id, title, due_date) VALUES ($1,$2,$3,$4) RETURNING *',
        [userId, note_id || null, title.trim(), due_date || null]
      )
      await logActivity(pool, userId, 'task_created', rows[0].id, { title: rows[0].title, note_id: rows[0].note_id })
      return res.status(201).json(rows[0])
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    res.status(405).end()
  }
}

export default requireAuth(handler)
