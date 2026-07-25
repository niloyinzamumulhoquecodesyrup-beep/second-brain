import Link from 'next/link'
import { useEffect } from 'react'
import { reminderOpenTarget } from '../lib/reminders'

// A gentle, dismissible reminder card -- soft gold, no red, no countdown, snooze is
// first-class. Dismiss (X) is local/ephemeral only (never touches the server -- it
// resurfaces on the next poll); Done/Snooze/Accept/Not-now are real actions against
// /api/reminders/[id].
export default function ReminderToast({ reminder, onSnooze, onDone, onDismiss, onAccept }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 12000) // fades out on its own if ignored -- never insists
    return () => clearTimeout(t)
  }, [onDismiss])

  const isSuggestion = reminder.kind === 'routine_suggestion'
  const openTarget = reminderOpenTarget(reminder)

  return (
    <div className="reminder-toast-in fixed bottom-6 right-6 z-50 w-[calc(100%-3rem)] max-w-sm">
      <div className="rounded-2xl border border-gold-400/30 bg-ink-900/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg leading-none">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-gold-300">
              {isSuggestion ? 'Worth locking in?' : "When you're ready"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-mist-100">{reminder.message}</p>
          </div>
          <button onClick={onDismiss} className="shrink-0 text-mist-500 hover:text-mist-300" aria-label="Dismiss">✕</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isSuggestion ? (
            <>
              <button onClick={onAccept} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">Yes, add it</button>
              <button onClick={onDone} className="chip !py-1 hover:border-mist-300/60">Not now</button>
            </>
          ) : (
            <>
              <button onClick={onDone} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">✓ Done</button>
              <button onClick={() => onSnooze(10)} className="chip !py-1 hover:border-gold-400/60 hover:text-gold-300">Snooze 10m</button>
              {openTarget && (
                openTarget.external ? (
                  <a href={openTarget.href} target="_blank" rel="noopener noreferrer" onClick={onDismiss} className="chip !py-1 hover:border-violet-400/60 hover:text-violet-300">
                    {openTarget.label} →
                  </a>
                ) : (
                  <Link href={openTarget.href} onClick={onDismiss} className="chip !py-1 hover:border-violet-400/60 hover:text-violet-300">
                    {openTarget.label} →
                  </Link>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
