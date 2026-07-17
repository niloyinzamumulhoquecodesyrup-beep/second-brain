import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { rows } = await pool.query(
    'SELECT display_name, age, persona, onboarded_at FROM users WHERE id = $1',
    [req.user.id]
  )
  const row = rows[0] || {}
  return res.status(200).json({
    onboarded: !!row.onboarded_at,
    display_name: row.display_name || null,
    age: row.age || null,
    persona: row.persona || null
  })
}

export default requireAuth(handler)
