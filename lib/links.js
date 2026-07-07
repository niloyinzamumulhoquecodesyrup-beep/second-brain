const LINK_PATTERN = /\[\[([^\[\]]+)\]\]/g

export function extractLinkTitles(content) {
  if (!content) return []
  const titles = new Set()
  let match
  LINK_PATTERN.lastIndex = 0
  while ((match = LINK_PATTERN.exec(content)) !== null) {
    const title = match[1].trim()
    if (title) titles.add(title)
  }
  return Array.from(titles)
}

export async function syncNoteLinks(pool, userId, noteId, content) {
  const titles = extractLinkTitles(content)

  await pool.query('DELETE FROM note_links WHERE from_note_id = $1', [noteId])
  if (titles.length === 0) return

  const { rows: targets } = await pool.query(
    `SELECT id, title FROM notes WHERE user_id = $1 AND id != $2 AND lower(title) = ANY($3::text[])`,
    [userId, noteId, titles.map(t => t.toLowerCase())]
  )
  if (targets.length === 0) return

  const values = []
  const params = []
  targets.forEach((t, i) => {
    params.push(noteId, t.id)
    values.push(`($${params.length - 1}, $${params.length})`)
  })

  await pool.query(
    `INSERT INTO note_links (from_note_id, to_note_id) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`,
    params
  )
}
