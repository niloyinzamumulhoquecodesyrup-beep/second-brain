import { hasDb, getPool } from '../../../lib/db'
import { requireAuth } from '../../../lib/withAuth'

// Fixed pool so the avatar is a one-time random assignment, not user-chosen — picking
// your own avatar tends to turn into a second identity leak (initials, a favorite
// animal that's already known to friends, etc).
const AVATAR_EMOJIS = ['🦊', '🦉', '🐢', '🐙', '🦋', '🐝', '🦔', '🐧', '🦥', '🐿️', '🦦', '🐬', '🦖', '🦩', '🐌', '🦎']

function looksLikeEmail(name, email) {
  const n = name.toLowerCase()
  const localPart = (email || '').split('@')[0].toLowerCase()
  return n.includes('@') || n === (email || '').toLowerCase() || (localPart && n === localPart)
}

async function handler(req, res) {
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()
  const userId = req.user.id

  if (req.method === 'GET') {
    const { rows } = await pool.query(
      'SELECT display_name, avatar_key FROM other_brains_identities WHERE user_id = $1',
      [userId]
    )
    return res.status(200).json({ identity: rows[0] ? { ...rows[0], user_id: userId } : null })
  }

  if (req.method === 'POST') {
    const { display_name } = req.body || {}
    const trimmed = (display_name || '').trim()
    if (trimmed.length < 2 || trimmed.length > 24) {
      return res.status(400).json({ error: 'Name must be 2-24 characters' })
    }
    if (looksLikeEmail(trimmed, req.user.email)) {
      return res.status(400).json({ error: 'Pick a handle that isn’t your email or real name' })
    }

    const avatarKey = AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)]
    try {
      const { rows } = await pool.query(
        'INSERT INTO other_brains_identities (user_id, display_name, avatar_key) VALUES ($1,$2,$3) RETURNING display_name, avatar_key',
        [userId, trimmed, avatarKey]
      )
      return res.status(201).json({ identity: { ...rows[0], user_id: userId } })
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'You already set a display name' })
      }
      console.error(err)
      return res.status(500).json({ error: 'db error' })
    }
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).end()
}

export default requireAuth(handler)
