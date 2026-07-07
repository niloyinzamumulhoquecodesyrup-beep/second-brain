import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query

  try {
    const [outgoing, incoming] = await Promise.all([
      pool.query(
        `SELECT n.id, n.title, n.para FROM note_links l JOIN notes n ON n.id = l.to_note_id
         WHERE l.from_note_id = $1 AND n.user_id = $2 ORDER BY n.title`,
        [id, userId]
      ),
      pool.query(
        `SELECT n.id, n.title, n.para FROM note_links l JOIN notes n ON n.id = l.from_note_id
         WHERE l.to_note_id = $1 AND n.user_id = $2 ORDER BY n.title`,
        [id, userId]
      )
    ])
    return res.status(200).json({ outgoing: outgoing.rows, incoming: incoming.rows })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
