import { useEffect, useState } from 'react'

const CATEGORY_COLORS = {
  sleep: '#8fb8f2',
  work: '#5eead4',
  study: '#b7a6f7',
  exercise: '#6ee796',
  meals: '#f0d9a3',
  leisure: '#fb7185',
  other: '#9aa4ae'
}
const CATEGORIES = Object.keys(CATEGORY_COLORS)
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Click-to-add starters shown until the user has a real routine skeleton — the
// "already suggested, just tap" set from the product brief.
const STARTER_ROUTINES = [
  { title: 'Sleep at 11 PM', category: 'sleep', start_min: 23 * 60, duration_min: 480, days: [0, 1, 2, 3, 4, 5, 6] },
  { title: 'Morning yoga + freshen up', category: 'exercise', start_min: 7 * 60, duration_min: 60, days: [0, 1, 2, 3, 4, 5, 6] },
  { title: 'Breakfast', category: 'meals', start_min: 8 * 60, duration_min: 60, days: [0, 1, 2, 3, 4, 5, 6] },
  { title: 'Deep work block', category: 'work', start_min: 9 * 60, duration_min: 180, days: [0, 1, 2, 3, 4] },
  { title: 'Lunch', category: 'meals', start_min: 13 * 60, duration_min: 60, days: [0, 1, 2, 3, 4, 5, 6] },
  { title: 'Evening reading', category: 'leisure', start_min: 21 * 60, duration_min: 60, days: [0, 1, 2, 3, 4, 5, 6] }
]

function fmtTime(min) {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// The recurring-schedule editor from the planner (add/pause/delete a routine,
// toggle its days, tap a starter) — self-contained so it can be dropped onto any
// page, not just the planner's own gantt view.
export default function RoutinePlanner({ onChange }) {
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [routineAnswer, setRoutineAnswer] = useState('')
  const [routineAnswerSent, setRoutineAnswerSent] = useState(false)
  const [editingRoutineId, setEditingRoutineId] = useState(null)
  const [routineEditTime, setRoutineEditTime] = useState('09:00')
  const [routineEditDuration, setRoutineEditDuration] = useState(60)

  function load() {
    setLoading(true)
    fetch('/api/planner/routines')
      .then(r => r.json())
      .then(rows => { setRoutines(rows || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  async function api(path, method, body) {
    setBusy(true)
    try {
      return await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
    } finally {
      setBusy(false)
    }
  }

  async function addStarter(s) {
    await api('/api/planner/routines', 'POST', { ...s, source: 'starter' })
    load()
    onChange && onChange()
  }

  async function patchRoutine(id, patch) {
    await api(`/api/planner/routines/${id}`, 'PATCH', patch)
    load()
    onChange && onChange()
  }

  function startEditRoutineTime(r) {
    setEditingRoutineId(r.id)
    setRoutineEditTime(fmtTime(r.start_min))
    setRoutineEditDuration(r.duration_min)
  }
  async function saveRoutineTime(r) {
    const [h, m] = routineEditTime.split(':').map(Number)
    const start_min = (h || 0) * 60 + (m || 0)
    const duration_min = Math.max(15, parseInt(routineEditDuration, 10) || r.duration_min)
    setEditingRoutineId(null)
    await patchRoutine(r.id, { start_min, duration_min })
  }

  async function deleteRoutine(id) {
    await api(`/api/planner/routines/${id}`, 'DELETE')
    load()
    onChange && onChange()
  }

  async function sendRoutineAnswer() {
    if (!routineAnswer.trim()) return
    await api('/api/planner/prompts', 'POST', { text: routineAnswer.trim() })
    setRoutineAnswer('')
    setRoutineAnswerSent(true)
  }

  if (loading) return null

  const starters = STARTER_ROUTINES.filter(s => !routines.some(r => r.title.toLowerCase() === s.title.toLowerCase()))

  return (
    <section>
      <h2 className="mb-3 font-serif text-2xl font-light text-mist-100">Routine planner</h2>

      {routines.length === 0 && (
        <div className="card mb-4 border-t-2 border-emerald-400/40 p-6">
          <p className="label mb-2">First run</p>
          <h3 className="mb-3 font-serif text-xl font-light text-mist-100">What do you do on a regular basis?</h3>
          <p className="mb-3 text-sm text-mist-400">
            Tell your brain in plain words — when you sleep and wake, what your mornings look like, which days you exercise.
            The next mind cycle turns it into suggested routines here. Or just tap the ready-made ones below.
          </p>
          {routineAnswerSent ? (
            <p className="text-sm text-emerald-300">Saved — your next mind cycle will turn this into suggestions.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <textarea
                value={routineAnswer}
                onChange={e => setRoutineAnswer(e.target.value)}
                rows={2}
                placeholder="e.g. I sleep at 11 and wake at 7, take an hour for breakfast and yoga, gym on Mon/Wed/Fri…"
                className="min-w-[260px] flex-1 rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-mist-100 placeholder-mist-400/50 focus:border-emerald-400/60 focus:outline-none"
              />
              <button disabled={busy || !routineAnswer.trim()} onClick={sendRoutineAnswer} className="chip self-start hover:border-emerald-400/60 hover:text-emerald-300">send to your brain</button>
            </div>
          )}
        </div>
      )}

      {starters.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-mist-400">Tap to add</p>
          <div className="flex flex-wrap gap-2">
            {starters.map(s => (
              <button key={s.title} disabled={busy} onClick={() => addStarter(s)} className="chip hover:border-emerald-400/60 hover:text-emerald-300">
                + {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {routines.map(r => (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-sm ${r.active ? '' : 'opacity-50'}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[r.category] }} />
            <span className="min-w-[120px] text-mist-100">{r.title}</span>
            {editingRoutineId === r.id ? (
              <span className="flex items-center gap-1">
                <input
                  type="time"
                  value={routineEditTime}
                  onChange={e => setRoutineEditTime(e.target.value)}
                  className="rounded border border-ink-600 bg-ink-950 px-1.5 py-0.5 text-xs text-mist-300 focus:border-emerald-400/60 focus:outline-none"
                />
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={routineEditDuration}
                  onChange={e => setRoutineEditDuration(e.target.value)}
                  className="w-14 rounded border border-ink-600 bg-ink-950 px-1.5 py-0.5 text-xs text-mist-300 focus:border-emerald-400/60 focus:outline-none"
                />
                <span className="text-mist-500">min</span>
                <button disabled={busy} onClick={() => saveRoutineTime(r)} className="text-emerald-300 hover:brightness-125">save</button>
                <button onClick={() => setEditingRoutineId(null)} className="text-mist-400 hover:text-mist-200">cancel</button>
              </span>
            ) : (
              <button
                onClick={() => startEditRoutineTime(r)}
                title="change timing"
                className="text-mist-400 underline decoration-dotted decoration-mist-500/50 underline-offset-2 hover:text-mist-200"
              >
                {fmtTime(r.start_min)} – {fmtTime(r.start_min + r.duration_min)}
              </button>
            )}
            <span className="flex gap-1">
              {DAY_LABELS.map((d, i) => {
                const on = (r.days || []).includes(i)
                return (
                  <button
                    key={d}
                    disabled={busy}
                    onClick={() => {
                      const next = on ? r.days.filter(x => x !== i) : [...r.days, i].sort()
                      if (next.length > 0) patchRoutine(r.id, { days: next })
                    }}
                    className={`h-6 w-7 rounded text-[10px] transition ${on ? 'bg-emerald-500/20 text-emerald-300' : 'bg-ink-800 text-mist-400/60 hover:text-mist-300'}`}
                  >
                    {d[0]}
                  </button>
                )
              })}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {r.source === 'cycle' && <span className="text-[10px] text-violet-400">from your brain</span>}
              <button disabled={busy} onClick={() => patchRoutine(r.id, { active: !r.active })} className="text-xs text-mist-400 transition hover:text-mist-200">
                {r.active ? 'pause' : 'resume'}
              </button>
              <button disabled={busy} onClick={() => deleteRoutine(r.id)} className="text-xs text-mist-400 transition hover:text-rose-300">delete</button>
            </span>
          </div>
        ))}
      </div>

      <NewRoutineForm busy={busy} onCreate={async payload => { await api('/api/planner/routines', 'POST', payload); load(); onChange && onChange() }} />
    </section>
  )
}

function NewRoutineForm({ busy, onCreate }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState(60)
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6])

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="chip mt-3 hover:border-emerald-400/60 hover:text-emerald-300">
        + new routine
      </button>
    )
  }

  async function submit() {
    if (!title.trim() || days.length === 0) return
    const [h, m] = time.split(':').map(Number)
    await onCreate({ title: title.trim(), category, days, start_min: h * 60 + m, duration_min: Math.max(15, parseInt(duration, 10) || 60) })
    setOpen(false)
    setTitle('')
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-900 px-4 py-3 text-sm">
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="routine name" className="min-w-[140px] rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm text-mist-100 placeholder-mist-400/50 focus:border-emerald-400/60 focus:outline-none" />
      <select value={category} onChange={e => setCategory(e.target.value)} className="rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm capitalize text-mist-300 focus:outline-none">
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm text-mist-300 focus:outline-none" />
      <span className="flex items-center gap-1 text-mist-400">
        <input type="number" min="15" step="15" value={duration} onChange={e => setDuration(e.target.value)} className="w-16 rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm text-mist-300 focus:outline-none" /> min
      </span>
      <span className="flex gap-1">
        {DAY_LABELS.map((d, i) => {
          const on = days.includes(i)
          return (
            <button key={d} onClick={() => setDays(on ? days.filter(x => x !== i) : [...days, i].sort())} className={`h-6 w-7 rounded text-[10px] transition ${on ? 'bg-emerald-500/20 text-emerald-300' : 'bg-ink-800 text-mist-400/60 hover:text-mist-300'}`}>
              {d[0]}
            </button>
          )
        })}
      </span>
      <button disabled={busy || !title.trim()} onClick={submit} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">add</button>
      <button onClick={() => setOpen(false)} className="text-mist-400 hover:text-mist-200">cancel</button>
    </div>
  )
}
