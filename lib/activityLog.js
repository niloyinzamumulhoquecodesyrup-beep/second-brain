// Always await this at the call site — in a serverless deployment, an
// un-awaited write can get silently dropped when the function's execution
// context is torn down right after the response is sent. The try/catch here
// still means a failed write can never break the primary action (creating a
// note, completing a task, ...) that triggered it; it only ever logs.
export async function logActivity(pool, userId, eventType, entityId, metadata) {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_id, event_type, entity_id, metadata) VALUES ($1,$2,$3,$4)',
      [userId, eventType, entityId || null, metadata || {}]
    )
  } catch (err) {
    console.error('activity_log write failed:', err)
  }
}
