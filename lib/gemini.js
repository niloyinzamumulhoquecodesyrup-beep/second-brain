// Task breakdown for the "study Arsenic Life" -> checklist feature. Uses the
// *-latest alias rather than a pinned version -- pinned snapshots (e.g.
// gemini-2.5-flash) get sunset for new API keys, while the alias auto-rolls to
// whatever's current. Flash Lite specifically because this app's free-tier quota
// gives it ~500 requests/day vs ~20/day for the standard Flash tier, and a handful
// of topics doesn't need a heavier model.
const MODEL = 'gemini-flash-lite-latest'
const MAX_SUBTASKS = 6
const MAX_WORDS_PER_TOPIC = 5
const MIN_ESTIMATED_MINUTES = 5
const MAX_ESTIMATED_MINUTES = 480

function clampWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, MAX_WORDS_PER_TOPIC).join(' ')
}

function clampMinutes(value) {
  const n = Math.round(Number(value) / 5) * 5
  if (!Number.isFinite(n)) return MIN_ESTIMATED_MINUTES
  return Math.min(MAX_ESTIMATED_MINUTES, Math.max(MIN_ESTIMATED_MINUTES, n))
}

export async function breakdownTask(taskText) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set')

  const prompt = `You are a task-breakdown assistant inside a productivity app. A user added this task to their to-do list:

"${taskText}"

Break it down into the distinct topics/subtopics it naturally covers. Rules:
- Each item is a TOPIC NAME ONLY -- a short noun phrase naming the subject matter, e.g. "GFAJ-1 bacterium biology" or "Phosphorus substitution claims". Never an instruction or action ("Read...", "Research...", "Review...", "Learn about...", "Study...").
- Each topic name is at most ${MAX_WORDS_PER_TOPIC} words.
- Use as many topics as this subject naturally breaks into -- do not pad to reach a target count. Minimum 1, maximum ${MAX_SUBTASKS}. A narrow task may only need 2-3; only use more if the subject genuinely has that many distinct parts.
- For each topic, estimate realistic minutes needed to study/complete it (estimated_minutes, a plain integer number of minutes).`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                topic: { type: 'STRING' },
                estimated_minutes: { type: 'INTEGER' }
              },
              required: ['topic', 'estimated_minutes']
            },
            minItems: 1,
            maxItems: MAX_SUBTASKS
          }
        }
      })
    }
  )

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini request failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new Error('Gemini returned no content')

  let items
  try {
    items = JSON.parse(raw)
  } catch {
    throw new Error('Gemini returned malformed JSON')
  }
  if (!Array.isArray(items)) throw new Error('Gemini returned an unexpected shape')

  return items
    .filter(item => item && typeof item.topic === 'string' && item.topic.trim())
    .map(item => ({
      topic: clampWords(item.topic),
      estimated_minutes: clampMinutes(item.estimated_minutes)
    }))
    .slice(0, MAX_SUBTASKS)
}
