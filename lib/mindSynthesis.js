// Mind Model v1 synthesis — see MIND_MODEL_BRIEF.md §4.
//
// device_activity is deliberately not read here (§3 is deferred; do not treat its
// absence as a bug). Every computation below reads only notes/tasks/packets/
// activity_log, which are already populated by normal use.
//
// inferred_goal is intentionally NOT implemented yet — the brief calls it the
// riskiest kind to get wrong, and it needs its own careful pass.
//
// overview (§4a) is intentionally NOT computed here — per the brief, it's written
// directly by Claude Code via its Supabase MCP connection, not by an API call
// embedded in this app. No ANTHROPIC_API_KEY anywhere in this codebase.
//
// Mirror, not oracle (§1): every summary below states a fact traceable to
// source_refs. None of them tell the user what to do.

const DORMANT_DAYS = 21
const RECENT_DAYS = 14
const MIN_CLUSTER_NOTES = 2
const MIN_COMPLETED_TASKS_FOR_LATENCY = 3
// §4h: normalized vectors, so <=> distance ~= 1 - cosine similarity. 0.45 favors
// precision (genuinely related notes) over recall, since a wrong grouping here is
// asserted as fact in the summary, same mirror-not-oracle bar as everything else.
const SEMANTIC_DISTANCE_THRESHOLD = 0.45

function daysAgo(date) {
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24))
}

async function insertInsight(pool, userId, kind, summary, sourceRefs, metadata) {
  const { rows } = await pool.query(
    'INSERT INTO mind_insights (user_id, kind, summary, source_refs, metadata) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [userId, kind, summary, JSON.stringify(sourceRefs), JSON.stringify(metadata || {})]
  )
  return rows[0].id
}

function find(parent, x) {
  if (parent[x] !== x) parent[x] = find(parent, parent[x])
  return parent[x]
}

function union(parent, a, b) {
  const ra = find(parent, a)
  const rb = find(parent, b)
  if (ra !== rb) parent[ra] = rb
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

async function tagBasedClusters(pool, userId) {
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

  const results = []
  for (const cluster of clusters) {
    const { rows: notes } = await pool.query(
      'SELECT id, title FROM notes WHERE user_id=$1 AND $2 = ANY(tags) ORDER BY created_at DESC',
      [userId, cluster.tag]
    )
    const lastActivityDays = daysAgo(cluster.last_activity)
    const trend = lastActivityDays > DORMANT_DAYS ? 'fading' : cluster.recent_count > cluster.note_count / 2 ? 'growing' : 'steady'
    const summary = `${cluster.note_count} notes tagged "${cluster.tag}", ${cluster.recent_count} touched in the last ${RECENT_DAYS} days, most recent activity ${lastActivityDays} day${lastActivityDays === 1 ? '' : 's'} ago (${trend}).`
    results.push({ summary, sourceRefs: notes.map(n => ({ type: 'note', id: n.id, title: n.title })), metadata: { method: 'tag', tag: cluster.tag } })
  }
  return results
}

// §4h: real semantic clustering via pgvector cosine similarity — augments the
// tag-based pass above with groupings that share no tag (tag overlap already covers
// that case; this is deliberately the complementary, non-overlapping signal). Notes
// without an embedding yet (client-side step in pages/mind.js hasn't run, or a
// browser couldn't run it) simply don't participate — never treated as a bug.
async function semanticClusters(pool, userId) {
  const { rows: pairs } = await pool.query(
    `SELECT a.id AS a_id, b.id AS b_id
     FROM notes a
     JOIN notes b ON a.id < b.id AND a.user_id = b.user_id
     WHERE a.user_id = $1
       AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
       AND NOT (a.tags && b.tags)
       AND (a.embedding <=> b.embedding) < $2`,
    [userId, SEMANTIC_DISTANCE_THRESHOLD]
  )
  if (pairs.length === 0) return []

  const parent = {}
  const ensure = id => { if (!(id in parent)) parent[id] = id }
  for (const { a_id, b_id } of pairs) {
    ensure(a_id); ensure(b_id)
    union(parent, a_id, b_id)
  }

  const groups = {}
  for (const id of Object.keys(parent)) {
    const root = find(parent, id)
    groups[root] = groups[root] || []
    groups[root].push(id)
  }

  const results = []
  for (const ids of Object.values(groups)) {
    if (ids.length < MIN_CLUSTER_NOTES) continue
    const { rows: notes } = await pool.query(
      'SELECT id, title, updated_at FROM notes WHERE id = ANY($1::uuid[]) ORDER BY updated_at DESC',
      [ids]
    )
    const lastActivityDays = daysAgo(notes[0].updated_at)
    const recentCount = notes.filter(n => daysAgo(n.updated_at) <= RECENT_DAYS).length
    const trend = lastActivityDays > DORMANT_DAYS ? 'fading' : recentCount > notes.length / 2 ? 'growing' : 'steady'
    const examples = notes.slice(0, 3).map(n => `"${n.title}"`).join(', ')
    const summary = `${notes.length} notes are semantically related (embedding similarity) despite sharing no tag, e.g. ${examples}. Most recent activity ${lastActivityDays} day${lastActivityDays === 1 ? '' : 's'} ago (${trend}).`
    results.push({ summary, sourceRefs: notes.map(n => ({ type: 'note', id: n.id, title: n.title })), metadata: { method: 'embedding' } })
  }
  return results
}

async function synthesizeInterestClusters(pool, userId) {
  const clusters = [...await tagBasedClusters(pool, userId), ...await semanticClusters(pool, userId)]
  const insertedIds = []
  for (const c of clusters) {
    const id = await insertInsight(pool, userId, 'interest_cluster', c.summary, c.sourceRefs, c.metadata)
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
