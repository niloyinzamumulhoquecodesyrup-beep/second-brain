import pool from '../../lib/db'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  const { id, para } = req.body
  if (!id || !para) return res.status(400).json({ error: 'id and para required' })
  try {
    const { rows } = await pool.query('UPDATE notes SET para=$1, updated_at=now() WHERE id=$2 RETURNING *', [para, id])
    return res.status(200).json(rows[0])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}
