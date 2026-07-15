import { hasDb, getPool } from '../../../../../lib/db'
import { requireAuth } from '../../../../../lib/withAuth'
import { logActivity } from '../../../../../lib/activityLog'
import { syncNoteLinks } from '../../../../../lib/links'

const PARA_VALUES = ['inbox', 'project', 'area', 'resource', 'archive']

// §4d hard invariant: this is the ONLY place a tap on a para_fun_queue question is
// allowed to touch notes/tasks/packets — every write here is a direct consequence
// of the user tapping an answer, never something queued up ahead of that tap.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id
  const { id } = req.query
  const { action, value } = req.body || {}

  const { rows: queueRows } = await pool.query(
    'SELECT * FROM para_fun_queue WHERE id=$1 AND user_id=$2 AND status=$3',
    [id, userId, 'pending']
  )
  const item = queueRows[0]
  if (!item) return res.status(404).json({ error: 'Not found or already answered' })

  if (item.note_id && action !== 'create_capture') {
    const owned = await pool.query('SELECT id FROM notes WHERE id=$1 AND user_id=$2', [item.note_id, userId])
    if (!owned.rows[0]) return res.status(404).json({ error: 'Note not found' })
  }

  try {
    if (action === 'skip') {
      // no write — the point of this branch is to explicitly do nothing
    } else if (action === 'set_para') {
      if (!PARA_VALUES.includes(value)) return res.status(400).json({ error: 'invalid para value' })
      const before = await pool.query('SELECT para FROM notes WHERE id=$1 AND user_id=$2', [item.note_id, userId])
      await pool.query('UPDATE notes SET para=$1, updated_at=now() WHERE id=$2 AND user_id=$3', [value, item.note_id, userId])
      await logActivity(pool, userId, 'para_moved', item.note_id, { from: before.rows[0]?.para, to: value, via: 'para_fun' })
    } else if (action === 'distill') {
      if (!value?.executive_summary) return res.status(400).json({ error: 'executive_summary required' })
      await pool.query(
        'UPDATE notes SET executive_summary=$1, distilled=true, updated_at=now() WHERE id=$2 AND user_id=$3',
        [value.executive_summary, item.note_id, userId]
      )
      await logActivity(pool, userId, 'note_edited', item.note_id, { fields: ['executive_summary', 'distilled'], via: 'para_fun' })
    } else if (action === 'create_task') {
      if (!value?.title?.trim()) return res.status(400).json({ error: 'title required' })
      const { rows } = await pool.query(
        'INSERT INTO tasks (user_id, note_id, title) VALUES ($1,$2,$3) RETURNING *',
        [userId, item.note_id, value.title.trim()]
      )
      await logActivity(pool, userId, 'task_created', rows[0].id, { title: rows[0].title, note_id: rows[0].note_id, via: 'para_fun' })
    } else if (action === 'create_capture') {
      if (!value?.title?.trim()) return res.status(400).json({ error: 'title required' })
      const para = PARA_VALUES.includes(value.para) ? value.para : 'inbox'
      const { rows } = await pool.query(
        'INSERT INTO notes (user_id, title, content, para) VALUES ($1,$2,$3,$4) RETURNING *',
        [userId, value.title.trim(), value.content || null, para]
      )
      await syncNoteLinks(pool, userId, rows[0].id, rows[0].content)
      await logActivity(pool, userId, 'note_created', rows[0].id, { title: rows[0].title, para: rows[0].para, via: 'para_fun' })
    } else if (action === 'link_notes') {
      // §4f-addendum grouping-confirmation: the user confirms that a set of notes are
      // really about the same thing (e.g. the five unconnected Satoshi notes), so we
      // write note_links between them. note_links has no user_id column, so ownership is
      // the guard: every id must belong to this user or we reject the whole request.
      const ids = Array.isArray(value?.note_ids) ? [...new Set(value.note_ids.filter(Boolean))] : []
      if (ids.length < 2) return res.status(400).json({ error: 'link_notes needs at least 2 note_ids' })
      const owned = await pool.query('SELECT id FROM notes WHERE user_id=$1 AND id = ANY($2::uuid[])', [userId, ids])
      if (owned.rows.length !== ids.length) return res.status(404).json({ error: 'one or more notes not found' })
      // Star topology from the first note, bidirectional, so every note in the group is
      // reachable from every other via the hub without inserting a full N^2 clique.
      const [hub, ...rest] = ids
      const pairs = []
      const params = []
      for (const other of rest) {
        params.push(hub, other); pairs.push(`($${params.length - 1},$${params.length})`)
        params.push(other, hub); pairs.push(`($${params.length - 1},$${params.length})`)
      }
      await pool.query(
        `INSERT INTO note_links (from_note_id, to_note_id) VALUES ${pairs.join(',')} ON CONFLICT DO NOTHING`,
        params
      )
      await logActivity(pool, userId, 'notes_linked', hub, { note_ids: ids, via: 'para_fun' })
    } else {
      return res.status(400).json({ error: 'unknown action' })
    }

    const { rows: updated } = await pool.query(
      `UPDATE para_fun_queue SET status=$1, answer=$2, answered_at=now() WHERE id=$3 AND user_id=$4 RETURNING *`,
      [action === 'skip' ? 'skipped' : 'answered', JSON.stringify({ action, value }), id, userId]
    )

    return res.status(200).json(updated[0])
  } catch (err) {
    console.error('para_fun answer failed:', err)
    return res.status(500).json({ error: 'db error' })
  }
}

export default requireAuth(handler)
