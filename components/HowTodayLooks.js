import { useEffect, useState } from 'react'

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function dateOnly(v) {
  return v ? String(v).slice(0, 10) : null
}

// A small donut of today's plate: done vs. still open, scoped the same way TasksPanel's
// "Today" bucket is (due today, plus anything undated — nothing scheduled elsewhere).
export default function HowTodayLooks() {
  const [tasks, setTasks] = useState(null)

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(setTasks).catch(() => setTasks([]))
  }, [])

  if (!tasks) return <div className="card p-6" style={{ minHeight: 220 }} />

  const today = toYMD(new Date())
  const todays = tasks.filter(t => {
    const due = dateOnly(t.due_date)
    return !due || due === today || t.done
  })
  const done = todays.filter(t => t.done).length
  const total = todays.length

  if (total === 0) {
    return (
      <div className="card p-6">
        <p className="label mb-2 !text-orange-300">How today looks</p>
        <p className="text-sm text-mist-400">Nothing on your plate yet — add a task to see it here.</p>
      </div>
    )
  }

  const R = 58, SW = 22, C = 2 * Math.PI * R
  const doneLen = (done / total) * C

  return (
    <div className="card p-6">
      <p className="label mb-4 !text-orange-300">How today looks</p>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 150 150" className="h-32 w-32 shrink-0">
          <g transform="rotate(-90 75 75)">
            <circle cx="75" cy="75" r={R} fill="none" stroke="#22272c" strokeWidth={SW} />
            {done > 0 && (
              <circle cx="75" cy="75" r={R} fill="none" stroke="#fb923c" strokeWidth={SW}
                strokeDasharray={`${doneLen} ${C - doneLen}`} strokeLinecap="round" />
            )}
          </g>
          <text x="75" y="72" textAnchor="middle" style={{ fontSize: 24, fontWeight: 500, fill: 'rgb(var(--mist-100))' }}>{done}/{total}</text>
          <text x="75" y="90" textAnchor="middle" style={{ fontSize: 10, letterSpacing: 1.5, fill: 'rgb(var(--mist-300))' }}>DONE</text>
        </svg>
        <p className="text-sm text-mist-300">
          {done === total
            ? "Everything on today's plate is done."
            : `${total - done} more to go today.`}
        </p>
      </div>
    </div>
  )
}
