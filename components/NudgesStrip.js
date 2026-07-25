import { useEffect, useState } from 'react'
import Link from 'next/link'
import { reminderOpenTarget } from '../lib/reminders'

const POLL_MS = 60000

// Where reminders become *active* instead of passive (see REMINDERS_PLAN.md "UI
// surfaces") -- one due nudge at a time, inline above the task list, same gentle
// framing and actions as the toast/bell in Layout.js.
export default function NudgesStrip() {
  const [dueReminders, setDueReminders] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())

  async function load() {
    try {
      const res = await fetch('/api/reminders')
      if (!res.ok) return
      const rows = await res.json()
      setDueReminders(rows.filter(r => r.due))
    } catch {
      // polling -- a failed check just tries again next interval
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [])

  async function act(id, action, minutes) {
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, minutes })
      })
    } catch {
      // best-effort -- next poll reconciles either way
    }
    load()
  }

  const current = dueReminders.find(r => !dismissedIds.has(r.id))
  if (!current) return null

  const isSuggestion = current.kind === 'routine_suggestion'
  const openTarget = reminderOpenTarget(current)
  const moreWaiting = dueReminders.length - 1

  return (
    <div className="card border-t-2 border-gold-400/40 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-gold-300">
            {isSuggestion ? 'Worth locking in?' : "When you're ready"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-mist-100">{current.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isSuggestion ? (
              <>
                <button onClick={() => act(current.id, 'accept')} className="chip hover:border-emerald-400/60 hover:text-emerald-300">Yes, add it</button>
                <button onClick={() => act(current.id, 'done')} className="chip hover:border-mist-300/60">Not now</button>
              </>
            ) : (
              <>
                <button onClick={() => act(current.id, 'done')} className="chip hover:border-emerald-400/60 hover:text-emerald-300">✓ Done</button>
                <button onClick={() => act(current.id, 'snooze', 10)} className="chip hover:border-gold-400/60 hover:text-gold-300">Snooze 10m</button>
                {openTarget && (
                  openTarget.external ? (
                    <a href={openTarget.href} target="_blank" rel="noopener noreferrer" className="chip hover:border-violet-400/60 hover:text-violet-300">{openTarget.label} →</a>
                  ) : (
                    <Link href={openTarget.href} className="chip hover:border-violet-400/60 hover:text-violet-300">{openTarget.label} →</Link>
                  )
                )}
              </>
            )}
            {moreWaiting > 0 && (
              <span className="text-xs text-mist-500">+{moreWaiting} more waiting</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setDismissedIds(prev => new Set(prev).add(current.id))}
          className="shrink-0 text-mist-500 hover:text-mist-300"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
