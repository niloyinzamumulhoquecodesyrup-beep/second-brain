// Fire-and-forget: a failed activity_log write must never break the primary
// action (creating a note, completing a task, ...) that triggered it.
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
