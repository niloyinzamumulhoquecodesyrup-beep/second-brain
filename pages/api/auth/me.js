import { getSessionFromReq } from '../../../lib/auth'
import { hasDb, getPool } from '../../../lib/db'

export default async function handler(req, res) {
  const session = getSessionFromReq(req)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })

  if (!hasDb()) return res.status(200).json({ email: session.email })

  const pool = getPool()
  const { rows } = await pool.query(
    'SELECT name, (avatar_data IS NOT NULL) AS has_avatar FROM users WHERE id = $1',
    [session.sub]
  )
  const row = rows[0] || {}
  return res.status(200).json({ email: session.email, name: row.name || null, hasAvatar: !!row.has_avatar })
}
