// Mind Model v1 synthesis — see MIND_MODEL_BRIEF.md §4.
//
// device_activity is deliberately not read here (§3 is deferred; do not treat its
// absence as a bug). Every computation below reads only notes/tasks/packets/
// activity_log, which are already populated by normal use.
//
// inferred_goal is intentionally NOT implemented yet — the brief calls it the
// riskiest kind to get wrong, and it needs its own careful pass.
//
// Mirror, not oracle (§1): every summary below states a fact traceable to
// source_refs. None of them tell the user what to do.

const DORMANT_DAYS = 21
const RECENT_DAYS = 14
const MIN_CLUSTER_NOTES = 2
const MIN_COMPLETED_TASKS_FOR_LATENCY = 3

function daysAgo(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

async function insertInsight(pool, userId, kind, summary, sourceRefs) {
  const { rows } = await pool.query(
    'INSERT INTO mind_insights (user_id, kind, summary, source_refs) VALUES ($1,$2,$3,$4) RETURNING id',
    [userId, kind, summary, JSON.stringify(sourceRefs)]
  )
  return rows[0].id
}

// Marks prior current rows of this kind as superseded by the first row of the new
// batch. Not a precise per-entity chain (see code review notes) — just enough to
// satisfy "history isn't overwritten in place" per the schema's own intent.
async function supersedePriorInsights(pool, userId, kind, newFirstId, excludeIds) {
  if (!newFirstId) return
  await pool.query(
    `UPDATE mind_insights SET superseded_by = $1
     WHERE user_id = $2 AND kind = $3 AND superseded_by IS NULL AND id != ALL($4::uuid[])`,
    [newFirstId, userId, kind, excludeIds]
  )
}

async function synthesizeInterestClusters(pool, userId) {
  const { rows: clusters } = await pool.query(
    `SELECT tag, count(*)::int AS note_count,
            max(updated_at) AS last_activity,
            count(*) FILTER (WHERE updated_at >= now() - interval '${RECENT_DAYS} days')::int AS recent_count
     FROM notes, unnest(tags) AS tag
     WHERE user_id = $1
     GROUP BY tag
     HAVING count(*) >= $2
     ORDER BY note_count DESC`,
    [userId, MIN_CLUSTER_NOTES]
  )

  const insertedIds = []
  for (const cluster of clusters) {
    const { rows: notes } = await pool.query(
      'SELECT id, title FROM notes WHERE user_id=$1 AND $2 = ANY(tags) ORDER BY created_at DESC',
      [userId, cluster.tag]
    )
    const lastActivityDays = daysAgo(cluster.last_activity)
    const trend = lastActivityDays > DORMANT_DAYS ? 'fading' : cluster.recent_count > cluster.note_count / 2 ? 'growing' : 'steady'
    const summary = `${cluster.note_count} notes tagged "${cluster.tag}", ${cluster.recent_count} touched in the last ${RECENT_DAYS} days, most recent activity ${lastActivityDays} day${lastActivityDays === 1 ? '' : 's'} ago (${trend}).`
    const id = await insertInsight(pool, userId, 'interest_cluster', summary, notes.map(n => ({ type: 'note', id: n.id, title: n.title })))
    insertedIds.push(id)
  }
  await supersedePriorInsights(pool, userId, 'interest_cluster', insertedIds[0], insertedIds)
  return insertedIds.length
}

async function synthesizeOpenLoops(pool, userId) {
  const { rows: notes } = await pool.query(
    `SELECT n.id, n.title, n.para, n.created_at
     FROM notes n
     WHERE n.user_id = $1
       AND n.status = 'active'
       AND n.para IN ('project','area')
       AND n.distilled = false
       AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.note_id = n.id)
       AND NOT EXISTS (SELECT 1 FROM packets p WHERE p.note_id = n.id)
     ORDER BY n.created_at ASC`,
    [userId]
  )

  const insertedIds = []
  for (const note of notes) {
    const age = daysAgo(note.created_at)
    const summary = `"${note.title}" has been in ${note.para === 'project' ? 'Projects' : 'Areas'} for ${age} day${age === 1 ? '' : 's'} with no executive summary and no task or packet attached.`
    const id = await insertInsight(pool, userId, 'open_loop', summary, [{ type: 'note', id: note.id, title: note.title }])
    insertedIds.push(id)
  }
  await supersedePriorInsights(pool, userId, 'open_loop', insertedIds[0], insertedIds)
  return insertedIds.length
}

async function synthesizeDormantRevival(pool, userId) {
  const { rows: notes } = await pool.query(
    `SELECT n.id, n.title, n.para, n.updated_at
     FROM notes n
     WHERE n.user_id = $1
       AND n.status = 'active'
       AND n.para IN ('project','area')
       AND n.updated_at < now() - interval '${DORMANT_DAYS} days'
     ORDER BY n.updated_at ASC`,
    [userId]
  )

  const insertedIds = []
  for (const note of notes) {
    const age = daysAgo(note.updated_at)
    const summary = `"${note.title}" (${note.para === 'project' ? 'Project' : 'Area'}) has had no activity for ${age} days, last touched ${new Date(note.updated_at).toLocaleDateString()}.`
    const id = await insertInsight(pool, userId, 'dormant_revival', summary, [{ type: 'note', id: note.id, title: note.title }])
    insertedIds.push(id)
  }
  await supersedePriorInsights(pool, userId, 'dormant_revival', insertedIds[0], insertedIds)
  return insertedIds.length
}

async function synthesizeAttentionPatterns(pool, userId) {
  const insertedIds = []

  const { rows: followRows } = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (
              WHERE distilled = true
                 OR EXISTS (SELECT 1 FROM tasks t WHERE t.note_id = notes.id)
                 OR EXISTS (SELECT 1 FROM packets p WHERE p.note_id = notes.id)
            )::int AS followed_through
     FROM notes WHERE user_id = $1 AND para != 'inbox'`,
    [userId]
  )
  const { total, followed_through } = followRows[0]
  if (total > 0) {
    const pct = Math.round((followed_through / total) * 100)
    const summary = `${followed_through} of ${total} sorted notes (${pct}%) have been distilled or turned into a task/packet.`
    const id = await insertInsight(pool, userId, 'attention_pattern', summary, [{ type: 'stat', name: 'follow_through_rate', total, followed_through }])
    insertedIds.push(id)
  }

  const { rows: latencyRows } = await pool.query(
    `SELECT extract(epoch FROM (completed_at - created_at)) / 3600 AS hours
     FROM tasks WHERE user_id = $1 AND done = true AND completed_at IS NOT NULL`,
    [userId]
  )
  if (latencyRows.length >= MIN_COMPLETED_TASKS_FOR_LATENCY) {
    const hours = latencyRows.map(r => Number(r.hours)).sort((a, b) => a - b)
    const median = hours[Math.floor(hours.length / 2)]
    const summary = median < 48
      ? `Median time from creating a task to completing it: ${median.toFixed(1)} hours, across ${hours.length} completed tasks.`
      : `Median time from creating a task to completing it: ${(median / 24).toFixed(1)} days, across ${hours.length} completed tasks.`
    const id = await insertInsight(pool, userId, 'attention_pattern', summary, [{ type: 'stat', name: 'task_completion_latency_hours', median, sample_size: hours.length }])
    insertedIds.push(id)
  }

  await supersedePriorInsights(pool, userId, 'attention_pattern', insertedIds[0], insertedIds)
  return insertedIds.length
}

export async function runSynthesis(pool, userId) {
  const counts = {
    interest_cluster: await synthesizeInterestClusters(pool, userId),
    open_loop: await synthesizeOpenLoops(pool, userId),
    dormant_revival: await synthesizeDormantRevival(pool, userId),
    attention_pattern: await synthesizeAttentionPatterns(pool, userId)
  }
  return counts
}
