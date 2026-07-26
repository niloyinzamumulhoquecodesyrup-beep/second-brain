import { useEffect, useRef, useState } from 'react'
import TodayCards from './TodayCards'
import DatePicker from './DatePicker'

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d + n, 12)
  return toYMD(date)
}
function endOfMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number)
  return toYMD(new Date(y, m, 0, 12))
}
function fmtDue(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
// Postgres DATE/TIMESTAMPTZ columns arrive as full ISO strings (e.g.
// "2026-07-21T00:00:00.000Z") — every comparison/display below wants just the date part.
function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null
}

// A pending para_fun_queue row counts as a "task suggestion" when at least one of its
// options would create a task — the same create_task action GET /api/mind/queue/:id/answer
// already supports, just surfaced here instead of inside the old PARA co-sorting tab.
function taskSuggestion(item) {
  const opt = (item.options || []).find(o => o.action === 'create_task')
  if (!opt) return null
  const title = opt.value?.title || opt.label
  if (!title) return null
  return { title }
}

function TaskRow({ task, onToggle, onDelete, onSchedule, highlighted }) {
  const due = dateOnly(task.due_date)
  const isToday = due === toYMD(new Date())
  const overdue = due && due < toYMD(new Date()) && !task.done
  return (
    <div
      id={`task-${task.id}`}
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors duration-1000 ${
        highlighted ? 'border-emerald-400 bg-emerald-400/10' : 'border-ink-700'
      }`}
    >
      <label className="flex min-w-0 items-center gap-3">
        <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} />
        <span className={`truncate text-sm ${task.done ? 'text-mist-500 line-through' : 'text-mist-100'}`}>{task.title}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {due && (
          <span className={`text-xs ${overdue ? 'text-red-400' : 'text-mist-500'}`}>{fmtDue(due)}</span>
        )}
        {onSchedule && !task.done && (
          <>
            {!isToday && (
              <button onClick={() => onSchedule(task, toYMD(new Date()))} className="text-xs text-emerald-400 hover:text-emerald-300">Add to Today</button>
            )}
            <DatePicker
              value=""
              onChange={ymd => { if (ymd) onSchedule(task, ymd) }}
              placeholder="Schedule"
              title="Schedule for another day"
              buttonClassName="w-[112px] rounded border border-ink-700 bg-ink-950 px-1 py-0.5 text-xs text-mist-400 hover:border-mist-500 focus:border-emerald-400/60 focus:outline-none"
            />
          </>
        )}
        <button onClick={() => onDelete(task)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
      </div>
    </div>
  )
}

function TaskGroup({ title, tasks, onToggle, onDelete, highlightId }) {
  if (tasks.length === 0) return null
  return (
    <div>
      <p className="label mb-3">{title} <span className="text-mist-500">({tasks.length})</span></p>
      <div className="space-y-2">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} highlighted={String(t.id) === String(highlightId)} />
        ))}
      </div>
    </div>
  )
}

// The Work tab's task view: what's on today, what's coming this week and this month,
// plus a quick-add form and any AI-suggested tasks waiting in the para_fun queue.
// onCompletion (optional) fires once per real task freshly marked done — that's
// the single choke point every completion path (list checkbox, FocusPomodoro's
// Done button) already flows through, so the reward panel above hears about all
// of them without each call site wiring it separately.
export default function TasksPanel({ onCompletion, highlightKey }) {
  const [tasks, setTasks] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [showDistillTasks, setShowDistillTasks] = useState(false)
  const [highlightId, setHighlightId] = useState(null)
  const highlightHandledRef = useRef(null)
  const highlightFadeRef = useRef(null)

  const today = toYMD(new Date())
  const weekEnd = addDays(today, 6)
  const monthEnd = endOfMonth(today)

  function load() {
    setLoading(true)
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/mind/queue').then(r => r.json()).catch(() => [])
    ]).then(([taskRows, queueRows]) => {
      setTasks(taskRows)
      setSuggestions(
        queueRows
          .map(item => ({ item, suggestion: taskSuggestion(item) }))
          .filter(x => x.suggestion)
      )
      setLoading(false)
    })
  }

  useEffect(load, [])

  // Comes from a reminder's "Open" link (?highlight=task-<id>) -- scroll the matching
  // card into view and glow it briefly. pages/work.js strips the query right after
  // mount (so a refresh doesn't replay it), which flips highlightKey to null a moment
  // later -- highlightHandledRef makes sure that doesn't cut the glow short, and the
  // fade timeout lives outside the effect so it isn't cancelled when that happens.
  useEffect(() => {
    if (!highlightKey || loading) return
    if (highlightHandledRef.current === highlightKey) return
    const match = highlightKey.match(/^task-(.+)$/)
    if (!match) return
    const id = match[1]
    const task = tasks.find(t => String(t.id) === id)
    if (!task) return
    highlightHandledRef.current = highlightKey
    // The distilled-notes list is the only group that's collapsed by default --
    // open it if that's where the highlighted task lives, otherwise it's already
    // visible in Today/This week/This month.
    if (task.note_id) setShowDistillTasks(true)
    setHighlightId(id)
    requestAnimationFrame(() => {
      document.getElementById(highlightKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    highlightFadeRef.current = setTimeout(() => setHighlightId(null), 2500)
  }, [highlightKey, loading, tasks])

  useEffect(() => () => clearTimeout(highlightFadeRef.current), [])

  async function addTask() {
    if (!title.trim()) return
    setAdding(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), due_date: dueDate || null })
    })
    setAdding(false)
    setTitle('')
    setDueDate('')
    load()
  }

  async function toggleTask(t) {
    const willBeDone = !t.done
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, done: willBeDone } : x)))
    await fetch('/api/tasks/' + t.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: willBeDone })
    })
    if (willBeDone) onCompletion?.('task')
  }

  async function deleteTask(t) {
    setTasks(prev => prev.filter(x => x.id !== t.id))
    await fetch('/api/tasks/' + t.id, { method: 'DELETE' })
  }

  // Used by the Today card list's time-edit / auto-balance popup — a partial
  // patch of just the scheduling fields (start_min, duration_min).
  async function updateTask(t, patch) {
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, ...patch } : x)))
    await fetch('/api/tasks/' + t.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    })
  }

  // Schedules a task (typically one spun off from a distilled note, which has no
  // due date by default) onto today or any other day the user picks.
  async function scheduleTask(t, due_date) {
    await updateTask(t, { due_date })
  }

  async function acceptSuggestion(item, suggestion) {
    setSuggestions(prev => prev.filter(s => s.item.id !== item.id))
    await fetch(`/api/mind/queue/${item.id}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create_task', value: { title: suggestion.title } })
    })
    load()
  }

  async function dismissSuggestion(item) {
    setSuggestions(prev => prev.filter(s => s.item.id !== item.id))
    await fetch(`/api/mind/queue/${item.id}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'skip' })
    })
  }

  if (loading) return <p className="text-mist-400">Loading your tasks…</p>

  const open = tasks.filter(t => !t.done)
  // A task finished today stays in the Today list (checked off, not gone) instead
  // of vanishing the moment it's done — same day, same card, just ticked.
  const todayTasks = tasks.filter(t => (
    t.done ? dateOnly(t.completed_at) === today : (!dateOnly(t.due_date) || dateOnly(t.due_date) === today)
  ))
  const weekTasks = open.filter(t => dateOnly(t.due_date) > today && dateOnly(t.due_date) <= weekEnd)
  const monthTasks = open.filter(t => dateOnly(t.due_date) > weekEnd && dateOnly(t.due_date) <= monthEnd)
  // Tasks spun off from a distilled note in Organize (NoteActionModal's "turn this
  // into something real") carry a note_id — the one signal that separates them from
  // hand-typed tasks, since there's no dedicated "source" column.
  const distillTasks = tasks.filter(t => t.note_id)

  return (
    <div className="space-y-8">
      <TodayCards tasks={todayTasks} onToggle={toggleTask} onDelete={deleteTask} onUpdate={updateTask} onCompletion={onCompletion} empty="Nothing due today, add the next small step above." highlightKey={highlightId ? `task-${highlightId}` : null} />

      <div className="card border-t-2 border-emerald-400/30 p-5">
        <p className="label mb-3 !text-emerald-300">Add a task</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-[200px] flex-1"
            placeholder="What's the next action?"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTask() }}
          />
          <DatePicker value={dueDate} onChange={setDueDate} />
          <button onClick={addTask} disabled={!title.trim() || adding} className="btn-primary">
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>

        {distillTasks.length > 0 && (
          <>
            <button
              onClick={() => setShowDistillTasks(v => !v)}
              className="chip mt-3 hover:border-emerald-400/60 hover:text-emerald-300"
            >
              {showDistillTasks ? 'Hide' : 'Show'} tasks from distilled notes ({distillTasks.length})
            </button>
            {showDistillTasks && (
              <div className="mt-3 space-y-2">
                {distillTasks.map(t => (
                  <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} onSchedule={scheduleTask} highlighted={String(t.id) === String(highlightId)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
          <p className="label mb-3 !text-violet-300">Your brain suggests</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(({ item, suggestion }) => (
              <span key={item.id} className="flex items-center gap-2 rounded-full border border-violet-400/40 bg-ink-950 px-3 py-1.5 text-sm text-mist-100">
                {suggestion.title}
                <button onClick={() => acceptSuggestion(item, suggestion)} className="text-emerald-300 hover:brightness-125">✓</button>
                <button onClick={() => dismissSuggestion(item)} className="text-mist-500 hover:text-mist-300">✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <TaskGroup title="This week" tasks={weekTasks} onToggle={toggleTask} onDelete={deleteTask} highlightId={highlightId} />
      <TaskGroup title="This month" tasks={monthTasks} onToggle={toggleTask} onDelete={deleteTask} highlightId={highlightId} />
    </div>
  )
}
