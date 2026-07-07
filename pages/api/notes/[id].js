import pool from '../../../../lib/db'

export default async function handler(req, res) {
  const { id } = req.query
  if (req.method === 'GET') {
    const { rows } = await pool.query('SELECT * FROM notes WHERE id=$1', [id])
    return res.status(200).json(rows[0])
  } else if (req.method === 'PUT') {
    const { title, content, para, executive_summary, distilled } = req.body
    const now = new Date()
    const { rows } = await pool.query(`UPDATE notes SET title = COALESCE($1,title), content = COALESCE($2,content), para = COALESCE($3,para), executive_summary = COALESCE($4,executive_summary), distilled = COALESCE($5,distilled), updated_at = $6 WHERE id = $7 RETURNING *`, [title, content, para, executive_summary, distilled, now, id])
    return res.status(200).json(rows[0])
  } else if (req.method === 'DELETE') {
    await pool.query('DELETE FROM notes WHERE id=$1', [id])
    return res.status(204).end()
  } else {
    res.setHeader('Allow', ['GET','PUT','DELETE'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
