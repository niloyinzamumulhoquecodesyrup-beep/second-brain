import pool from '../../../lib/db'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query('SELECT * FROM notes ORDER BY created_at DESC')
      res.status(200).json(rows)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'db error' })
    }
  } else if (req.method === 'POST') {
    const { title, content, tags } = req.body
    try {
      const { rows } = await pool.query('INSERT INTO notes (title, content, tags) VALUES ($1,$2,$3) RETURNING *', [title || null, content || null, tags || null])
      res.status(201).json(rows[0])
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: 'db error' })
    }
  } else {
    res.setHeader('Allow', ['GET','POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
