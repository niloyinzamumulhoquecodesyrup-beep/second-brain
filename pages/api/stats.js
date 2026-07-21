import { hasDb, getPool } from '../../lib/db'
import { requireAuth } from '../../lib/withAuth'

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  try {
    const [paraCounts, distilledCount, packetCount, taskCounts, openTasks, linkCount, recent, tagRows, capturesByDay, focusSessionsByDay, focusSessionsTotal, tasksDoneByDay] = await Promise.all([
      pool.query('SELECT para, count(*)::int AS count FROM notes WHERE user_id=$1 GROUP BY para', [userId]),
      pool.query('SELECT count(*)::int AS count FROM notes WHERE user_id=$1 AND distilled=true', [userId]),
      pool.query('SELECT count(*)::int AS count FROM packets WHERE user_id=$1', [userId]),
      pool.query('SELECT done, count(*)::int AS count FROM tasks WHERE user_id=$1 GROUP BY done', [userId]),
      pool.query(
        `SELECT t.id, t.title, t.due_date, t.note_id, n.title AS note_title
         FROM tasks t LEFT JOIN notes n ON n.id = t.note_id
         WHERE t.user_id=$1 AND t.done=false
         ORDER BY t.due_date NULLS LAST, t.created_at DESC LIMIT 6`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM note_links l JOIN notes n ON n.id = l.from_note_id WHERE n.user_id=$1`,
        [userId]
      ),
      pool.query('SELECT id, title, para, created_at FROM notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 6', [userId]),
      pool.query('SELECT tags FROM notes WHERE user_id=$1', [userId]),
      // §4j attention-over-time: notes captured per day over the last 21 days, oldest first
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM notes WHERE user_id=$1 AND created_at > now() - interval '21 days'
         GROUP BY 1 ORDER BY 1`,
        [userId]
      ),
      // Reward panel: a completed focus session per day, same 21-day window as capturesByDay.
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM activity_log
         WHERE user_id=$1 AND event_type='focus_session' AND metadata->>'mode'='focus' AND created_at > now() - interval '21 days'
         GROUP BY 1 ORDER BY 1`,
        [userId]
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM activity_log WHERE user_id=$1 AND event_type='focus_session' AND metadata->>'mode'='focus'`,
        [userId]
      ),
      pool.query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM activity_log
         WHERE user_id=$1 AND event_type='task_completed' AND created_at > now() - interval '21 days'
         GROUP BY 1 ORDER BY 1`,
        [userId]
      )
    ])

    const paraMap = { inbox: 0, project: 0, area: 0, resource: 0, archive: 0 }
    paraCounts.rows.forEach(r => { paraMap[r.para] = r.count })

    const tagCounts = {}
    tagRows.rows.forEach(r => {
      (r.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1 })
    })
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }))

    const totalNotes = Object.values(paraMap).reduce((a, b) => a + b, 0)

    const tasksOpen = taskCounts.rows.find(r => r.done === false)?.count || 0
    const tasksDone = taskCounts.rows.find(r => r.done === true)?.count || 0

    res.status(200).json({
      totalNotes,
      para: paraMap,
      distilled: distilledCount.rows[0].count,
      packets: packetCount.rows[0].count,
      tasksOpen,
      tasksDone,
      openTasks: openTasks.rows,
      links: linkCount.rows[0].count,
      recent: recent.rows,
      topTags,
      capturesByDay: capturesByDay.rows,
      focusSessionsByDay: focusSessionsByDay.rows,
      focusSessionsTotal: focusSessionsTotal.rows[0].count,
      tasksDoneByDay: tasksDoneByDay.rows
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
