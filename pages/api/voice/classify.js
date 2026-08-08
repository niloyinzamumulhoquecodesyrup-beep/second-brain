import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'
import { logActivity } from '../../../lib/activityLog'
import { classifyVoiceCapture } from '../../../lib/groq'
import { composeTaskMessage, taskFireAt, resolveTaskStartConflict } from '../../../lib/reminders'

const MAX_TRANSCRIPT_LENGTH = 500

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  const { transcript } = req.body || {}
  const text = typeof transcript === 'string' ? transcript.trim() : ''
  if (!text) return res.status(400).json({ error: 'transcript is required' })
  if (text.length > MAX_TRANSCRIPT_LENGTH) {
    return res.status(400).json({ error: `transcript must be ${MAX_TRANSCRIPT_LENGTH} characters or fewer` })
  }

  try {
    const todayDate = new Date().toISOString().slice(0, 10)
    const classification = await classifyVoiceCapture(text, todayDate)

    if (classification.type === 'task') {
      let startMin = classification.start_min
      if (classification.due_date && startMin != null) {
        const { rows: sameDay } = await pool.query(
          'SELECT start_min, duration_min FROM tasks WHERE user_id=$1 AND due_date=$2 AND done=false AND start_min IS NOT NULL',
          [userId, classification.due_date]
        )
        startMin = resolveTaskStartConflict(startMin, classification.duration_min, sameDay)
      }

      const { rows } = await pool.query(
        'INSERT INTO tasks (user_id, title, due_date, start_min, duration_min) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [userId, classification.title, classification.due_date, startMin, classification.duration_min]
      )
      const task = rows[0]
      await logActivity(pool, userId, 'task_created', task.id, { title: task.title, source: 'voice' })

      if (task.due_date) {
        await pool.query(
          `INSERT INTO reminders (user_id, task_id, message, fire_at, kind, origin)
           VALUES ($1,$2,$3,$4,'task','system')`,
          [userId, task.id, composeTaskMessage(task.title), taskFireAt(task.due_date, task.start_min)]
        )
      }

      return res.status(201).json({ transcript: text, classification, record: task })
    }

    const { rows } = await pool.query(
      `INSERT INTO notes (user_id, title, content, para) VALUES ($1,$2,$3,$4) RETURNING *`,
      [userId, classification.title.slice(0, 30), classification.description, classification.para]
    )
    const note = rows[0]
    await logActivity(pool, userId, 'note_created', note.id, { title: note.title, para: note.para, source: 'voice' })

    return res.status(201).json({ transcript: text, classification, record: note })
  } catch (err) {
    console.error('voice classify failed:', err)
    return res.status(500).json({ error: 'Classification failed' })
  }
}

export default requireAuth(handler)
