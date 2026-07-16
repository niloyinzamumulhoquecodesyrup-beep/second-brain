import { hasDb, getPool } from '../../../../lib/db'
import { requireAuth } from '../../../../lib/withAuth'

const EMBEDDING_DIMS = 384

// §4h: writes vectors computed client-side (lib/embedWorker.js) back into notes.embedding.
// Scoped by user_id per note, same as every other notes route — never trusts the caller
// beyond that, since the request body is just numbers, not anything auth-bearing.
async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end()
  }
  if (!hasDb()) return res.status(500).json({ error: 'Database not configured' })
  const pool = getPool()

  const { embeddings } = req.body || {}
  if (!Array.isArray(embeddings)) return res.status(400).json({ error: 'embeddings must be an array' })

  let written = 0
  for (const entry of embeddings) {
    const { id, embedding } = entry || {}
    if (!id || !Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMS) continue
    if (!embedding.every(v => typeof v === 'number' && Number.isFinite(v))) continue

    const vectorLiteral = `[${embedding.join(',')}]`
    const { rowCount } = await pool.query(
      `UPDATE notes SET embedding = $1::vector, embedded_at = now() WHERE id = $2 AND user_id = $3`,
      [vectorLiteral, id, req.user.id]
    )
    written += rowCount
  }

  return res.status(200).json({ written })
}

export default requireAuth(handler)
