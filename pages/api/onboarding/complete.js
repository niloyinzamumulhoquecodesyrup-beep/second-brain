import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

const MAX_AGE = 120
const MAX_NAME_LEN = 80
const MAX_PERSONA_LEN = 120
const MAX_IMPORTS = 5
const MAX_IMPORT_CHARS = 300000
const SOURCE_TYPES = ['chat', 'document', 'kanban', 'journal', 'calendar', 'other']

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })

  const { display_name, age, persona, imports } = req.body || {}

  const name = typeof display_name === 'string' ? display_name.trim().slice(0, MAX_NAME_LEN) : ''
  if (!name) return res.status(400).json({ error: 'display_name is required' })

  let ageValue = null
  if (age !== null && age !== undefined && age !== '') {
    const n = Number(age)
    if (!Number.isInteger(n) || n < 1 || n > MAX_AGE) {
      return res.status(400).json({ error: 'age must be an integer between 1 and 120' })
    }
    ageValue = n
  }

  const personaValue = typeof persona === 'string' ? persona.trim().slice(0, MAX_PERSONA_LEN) : ''
  if (!personaValue) return res.status(400).json({ error: 'persona is required' })

  const importRows = Array.isArray(imports) ? imports.slice(0, MAX_IMPORTS) : []
  const cleanImports = []
  for (const item of importRows) {
    const text = typeof item?.raw_text === 'string' ? item.raw_text.trim() : ''
    if (!text) continue
    const sourceType = SOURCE_TYPES.includes(item?.source_type) ? item.source_type : 'other'
    cleanImports.push({ sourceType, text: text.slice(0, MAX_IMPORT_CHARS) })
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      'UPDATE users SET display_name = $1, age = $2, persona = $3, onboarded_at = now() WHERE id = $4',
      [name, ageValue, personaValue, req.user.id]
    )
    for (const { sourceType, text } of cleanImports) {
      await client.query(
        'INSERT INTO onboarding_imports (user_id, source_type, raw_text, char_count) VALUES ($1,$2,$3,$4)',
        [req.user.id, sourceType, text, text.length]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  return res.status(200).json({ ok: true })
}

export default requireAuth(handler)
