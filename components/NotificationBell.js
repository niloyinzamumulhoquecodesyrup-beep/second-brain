import { useEffect, useRef, useState } from 'react'

// The real bell -- badge count of currently-due reminders, dropdown to act on any of
// them without waiting for the floating toast (components/ReminderToast.js) to cycle
// through one at a time.
export default function NotificationBell({ dueReminders, onAction }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function onClickAway(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const count = dueReminders.length

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative text-mist-300 hover:text-gold-300"
        aria-label={count > 0 ? `${count} reminder${count === 1 ? '' : 's'} waiting` : 'Reminders'}
        aria-expanded={open}
        title="Reminders"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-semibold text-ink-950">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-lg border border-ink-600 bg-ink-900 py-1 shadow-xl"
        >
          {count === 0 ? (
            <p className="px-3.5 py-3 text-sm text-mist-400">Nothing waiting right now.</p>
          ) : (
            dueReminders.map(r => {
              const isSuggestion = r.kind === 'routine_suggestion'
              return (
                <div key={r.id} className="border-b border-ink-700 px-3.5 py-2.5 last:border-b-0">
                  <p className="text-sm leading-snug text-mist-100">{r.message}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {isSuggestion ? (
                      <>
                        <button onClick={() => onAction(r.id, 'accept')} className="chip !py-0.5 text-xs hover:border-emerald-400/60 hover:text-emerald-300">Yes, add it</button>
                        <button onClick={() => onAction(r.id, 'done')} className="chip !py-0.5 text-xs hover:border-mist-300/60">Not now</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => onAction(r.id, 'done')} className="chip !py-0.5 text-xs hover:border-emerald-400/60 hover:text-emerald-300">✓ Done</button>
                        <button onClick={() => onAction(r.id, 'snooze', 10)} className="chip !py-0.5 text-xs hover:border-gold-400/60 hover:text-gold-300">Snooze 10m</button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
