// Voice-capture classification for the mobile app's "add task / capture" by voice
// feature. The app runs on-device speech-to-text (Android's SpeechRecognizer) and
// sends us the transcript text only -- no audio ever reaches this backend. This just
// turns that transcript into structured JSON the caller can insert directly.
const MODEL = 'llama-3.1-8b-instant'
const MAX_TITLE_WORDS = 12
const MAX_DESCRIPTION_LENGTH = 1000

// Same range/rounding convention as lib/gemini.js's clampMinutes (task breakdown
// estimates) -- keeps AI-estimated durations consistent across both features.
const MIN_DURATION_MIN = 5
const MAX_DURATION_MIN = 480
const DEFAULT_DURATION_MIN = 30

// Coarse time-of-day words map to a representative minutes-since-midnight value so
// "tomorrow evening" survives into tasks.start_min instead of being dropped -- see
// migrations/023_task_scheduling.sql for why that column exists (Today card ordering).
const TIME_OF_DAY_MINUTES = { morning: 9 * 60, afternoon: 14 * 60, evening: 18 * 60, night: 21 * 60 }

const PARA_VALUES = ['inbox', 'project', 'area', 'resource', 'archive']

function clampTitle(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, MAX_TITLE_WORDS).join(' ')
}

function clampStartMin(value) {
  if (value === null || value === undefined) return null
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.min(1439, Math.max(0, n))
}

function clampDescription(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_DESCRIPTION_LENGTH)
}

function clampDurationMin(value) {
  const n = Math.round(Number(value) / 5) * 5
  if (!Number.isFinite(n)) return DEFAULT_DURATION_MIN
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, n))
}

export async function classifyVoiceCapture(transcript, todayDate) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set')

  const system = `You convert a voice transcript from a productivity app into strict JSON. Output ONLY a JSON object, no prose, matching this schema:
{
  "type": "task" | "capture",
  "title": string,
  "description": string or null,
  "due_date": string (YYYY-MM-DD) or null,
  "start_min": integer (0-1439, minutes since midnight) or null,
  "duration_min": integer (${MIN_DURATION_MIN}-${MAX_DURATION_MIN}) or null,
  "para": "inbox" | "project" | "area" | "resource" | "archive",
  "para_confidence": "explicit" | "estimated",
  "project_hint": string or null
}

Rules:
- "type" is "task" if the user is asking to do something (an action, a reminder, a to-do). It's "capture" if they're just recording information, an idea, or a note to remember. If the user explicitly says they want to create/add/save a project, area, resource, note, or capture (e.g. "create a resource named X", "add this to my projects"), that framing always makes it "capture" -- even if the content they then describe includes action-sounding words like "fix" or "have to", since that's just the subject matter of the note, not an instruction to the app.
- "title" is a short label for the task or capture, at most ${MAX_TITLE_WORDS} words.
- "description": REQUIRED whenever "type" is "capture" (every PARA item needs one) -- null when "type" is "task". If the transcript contains real descriptive detail beyond a bare title (an explanation, a problem, context, steps), rewrite that detail as the description: correct grammar, prefer passive-voice sentences, and write it as clean prose -- do not just copy the rambling transcript verbatim. If the transcript is only a short label with no real description in it, write a brief 1-2 sentence description yourself, inferred from the title and context.
- "due_date": only set if the user names or implies a specific day (e.g. "tomorrow", "Friday"). Resolve relative dates against today's date, given below. Otherwise null.
- "start_min": only set if the user implies a time. For an explicit clock time, convert using this exact formula: start_min = hour_in_24_format * 60 + minute. Worked examples -- 6 PM = hour 18 = 18*60 = 1080. 9:30 AM = hour 9 = 9*60+30 = 570. 12 PM (noon) = hour 12 = 720. 12 AM (midnight) = hour 0 = 0. Show this arithmetic to yourself before writing the final number. For a vague time-of-day word, use: morning=${TIME_OF_DAY_MINUTES.morning}, afternoon=${TIME_OF_DAY_MINUTES.afternoon}, evening=${TIME_OF_DAY_MINUTES.evening}, night=${TIME_OF_DAY_MINUTES.night}. If no time is implied at all, null.
- "duration_min": REQUIRED whenever "type" is "task" (every task needs an estimated time cost) -- null when "type" is "capture". If the user states how long it takes ("for an hour", "30 minutes", "a couple minutes"), convert that to minutes. Otherwise estimate a realistic duration yourself from what the task actually involves -- a quick call or errand is short (~10-15 min), a focused chore or short admin task is ~30-60 min, something substantial (writing, deep cleaning, a long errand) can be ${MAX_DURATION_MIN / 60} hours or more. Round to the nearest 5 minutes.
- "para": if the user explicitly names a bucket or a specific project/area/resource by name, choose the matching bucket and set para_confidence to "explicit", and put the named target in "project_hint". If the user names nothing, estimate the best bucket from context and set para_confidence to "estimated" and project_hint to null.
- Valid para values: ${PARA_VALUES.join(', ')}.`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Transcript: "${transcript}"\nToday's date: ${todayDate}.` }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    })
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Groq request failed (${res.status}): ${body}`)
  }

  const data = await res.json()
  const raw = data?.choices?.[0]?.message?.content
  if (!raw) throw new Error('Groq returned no content')

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Groq returned malformed JSON')
  }

  const title = clampTitle(typeof parsed.title === 'string' ? parsed.title : '')
  if (!title) throw new Error('Groq returned no usable title')

  const type = parsed.type === 'capture' ? 'capture' : 'task'
  // Every PARA item needs a description -- fall back to the title itself in the
  // rare case Groq omits one, rather than saving a capture with no content at all.
  const description = type === 'capture' ? (clampDescription(parsed.description) || title) : null

  return {
    type,
    title,
    description,
    due_date: typeof parsed.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date) ? parsed.due_date : null,
    start_min: clampStartMin(parsed.start_min),
    duration_min: type === 'task' ? clampDurationMin(parsed.duration_min) : null,
    para: PARA_VALUES.includes(parsed.para) ? parsed.para : 'inbox',
    para_confidence: parsed.para_confidence === 'explicit' ? 'explicit' : 'estimated',
    project_hint: typeof parsed.project_hint === 'string' && parsed.project_hint.trim() ? parsed.project_hint.trim() : null
  }
}
