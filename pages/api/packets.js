import { hasDb, getPool } from 'lib/db'

export default async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  if (req.method === 'POST') {
    const { note_id, title, content } = req.body
    if (!note_id) return res.status(400).json({ error: 'note_id required' })
    try {
      const { rows } = await pool.query('INSERT INTO packets (note_id, title, content) VALUES ($1,$2,$3) RETURNING *', [note_id, title || null, content || null])
      return res.status(201).json(rows[0])
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'GET') {
    try {
      const { rows } = await pool.query('SELECT * FROM packets ORDER BY created_at DESC')
      return res.status(200).json(rows)
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['GET','POST'])
    res.status(405).end()
  }
}
