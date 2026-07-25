import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

async function handleGet(req, res, pool, userId) {
  const { rows } = await pool.query(
    `SELECT id, mode, started_at, ends_at, task_id FROM focus_sessions
     WHERE user_id = $1 AND status = 'active' AND ends_at > now()
     ORDER BY started_at DESC LIMIT 1`,
    [userId]
  )
  const row = rows[0]
  if (!row) return res.status(200).json({ active: false })
  return res.status(200).json({
    active: true,
    session_id: row.id,
    mode: row.mode,
    started_at: row.started_at,
    ends_at: row.ends_at,
    task_id: row.task_id
  })
}

async function handlePost(req, res, pool, userId) {
  const { minutes, task_id, mode } = req.body || {}
  const mins = Number(minutes)
  if (!Number.isFinite(mins) || mins < 1 || mins > 1440) {
    return res.status(400).json({ error: 'minutes must be between 1 and 1440' })
  }

  if (task_id) {
    const owned = await pool.query('SELECT id FROM tasks WHERE id=$1 AND user_id=$2', [task_id, userId])
    if (!owned.rows[0]) return res.status(404).json({ error: 'Task not found' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE focus_sessions SET status = 'cancelled' WHERE user_id = $1 AND status = 'active'`,
      [userId]
    )
    const { rows } = await client.query(
      `INSERT INTO focus_sessions (user_id, task_id, mode, ends_at)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)
       RETURNING id, mode, started_at, ends_at, task_id`,
      [userId, task_id || null, mode || 'focus', mins]
    )
    await client.query('COMMIT')
    const row = rows[0]
    return res.status(201).json({
      active: true,
      session_id: row.id,
      mode: row.mode,
      started_at: row.started_at,
      ends_at: row.ends_at,
      task_id: row.task_id
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    return res.status(500).json({ error: 'db error' })
  } finally {
    client.release()
  }
}

async function handleDelete(req, res, pool, userId) {
  const status = (req.body && req.body.status) || req.query?.status || 'cancelled'
  if (status !== 'completed' && status !== 'cancelled') {
    return res.status(400).json({ error: 'status must be "completed" or "cancelled"' })
  }
  await pool.query(
    `UPDATE focus_sessions SET status = $2 WHERE user_id = $1 AND status = 'active'`,
    [userId, status]
  )
  return res.status(200).json({ ok: true })
}

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') return handleGet(req, res, pool, userId)
  if (req.method === 'POST') return handlePost(req, res, pool, userId)
  if (req.method === 'DELETE') return handleDelete(req, res, pool, userId)

  res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
  return res.status(405).end()
}

export default requireAuth(handler)
