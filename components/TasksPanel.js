import { useEffect, useState } from 'react'

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

function TaskRow({ task, onToggle, onDelete }) {
  const due = dateOnly(task.due_date)
  const overdue = due && due < toYMD(new Date()) && !task.done
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-ink-700 px-3 py-2">
      <label className="flex min-w-0 items-center gap-3">
        <input type="checkbox" checked={task.done} onChange={() => onToggle(task)} />
        <span className={`truncate text-sm ${task.done ? 'text-mist-500 line-through' : 'text-mist-100'}`}>{task.title}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {due && (
          <span className={`text-xs ${overdue ? 'text-red-400' : 'text-mist-500'}`}>{fmtDue(due)}</span>
        )}
        <button onClick={() => onDelete(task)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
      </div>
    </div>
  )
}

function TaskGroup({ title, tasks, onToggle, onDelete, empty }) {
  return (
    <div>
      <p className="label mb-3">{title} <span className="text-mist-500">({tasks.length})</span></p>
      {tasks.length === 0 ? (
        <p className="text-sm text-mist-400">{empty}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => <TaskRow key={t.id} task={t} onToggle={onToggle} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  )
}

// The Work tab's task view: what's on today, what's coming this week and this month,
// plus a quick-add form and any AI-suggested tasks waiting in the para_fun queue.
export default function TasksPanel() {
  const [tasks, setTasks] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [adding, setAdding] = useState(false)

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
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))
    await fetch('/api/tasks/' + t.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: !t.done })
    })
  }

  async function deleteTask(t) {
    setTasks(prev => prev.filter(x => x.id !== t.id))
    await fetch('/api/tasks/' + t.id, { method: 'DELETE' })
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
  const todayTasks = open.filter(t => !dateOnly(t.due_date) || dateOnly(t.due_date) === today)
  const weekTasks = open.filter(t => dateOnly(t.due_date) > today && dateOnly(t.due_date) <= weekEnd)
  const monthTasks = open.filter(t => dateOnly(t.due_date) > weekEnd && dateOnly(t.due_date) <= monthEnd)
  const doneToday = tasks.filter(t => t.done && dateOnly(t.completed_at) === today)

  return (
    <div className="space-y-8">
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
          <input className="input !w-auto" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <button onClick={addTask} disabled={!title.trim() || adding} className="btn-primary">
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      <TaskGroup title="Today" tasks={todayTasks} onToggle={toggleTask} onDelete={deleteTask} empty="Nothing due today — add the next small step above." />
      <TaskGroup title="This week" tasks={weekTasks} onToggle={toggleTask} onDelete={deleteTask} empty="Nothing scheduled later this week." />
      <TaskGroup title="This month" tasks={monthTasks} onToggle={toggleTask} onDelete={deleteTask} empty="Nothing scheduled later this month." />

      {doneToday.length > 0 && (
        <div>
          <p className="label mb-3">Completed today <span className="text-mist-500">({doneToday.length})</span></p>
          <div className="space-y-2">
            {doneToday.map(t => <TaskRow key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />)}
          </div>
        </div>
      )}
    </div>
  )
}
