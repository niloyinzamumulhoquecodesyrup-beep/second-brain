import { getSessionFromReq } from './auth'
import { hasDb, getPool } from './db'

export async function requireSessionSSR(context) {
  const session = getSessionFromReq(context.req)
  if (!session) {
    return {
      redirect: { destination: '/login', permanent: false }
    }
  }

  const user = { id: session.sub, email: session.email, name: null, hasAvatar: false }

  if (hasDb()) {
    const pool = getPool()
    const { rows } = await pool.query(
      'SELECT name, deactivated_at, (avatar_data IS NOT NULL) AS has_avatar FROM users WHERE id = $1',
      [session.sub]
    )
    const row = rows[0]
    if (row?.deactivated_at) {
      return { redirect: { destination: '/login', permanent: false } }
    }
    if (row) {
      user.name = row.name
      user.hasAvatar = row.has_avatar
    }
  }

  return { props: { user } }
}
