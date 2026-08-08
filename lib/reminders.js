// Shared logic for the reminders system (see REMINDERS_PLAN.md) -- kept out of the
// API route files since both pages/api/reminders/index.js (the due computation) and
// pages/api/tasks/*.js (auto-create) need the same gentle-copy composition.

export const DEFAULT_DUE_TIME_MIN = 9 * 60 // date-only tasks default to a morning nudge, never "midnight"

// Same fallback TodayCards' auto-balance uses (components/TodayCards.js) when a task
// has no duration_min set, kept consistent so conflict resolution and manual
// auto-balance agree on how much room an undated-duration task occupies.
const DEFAULT_TASK_DURATION_MIN = 30

// If startMin lands inside an existing same-day task's time block, push it to right
// after that task ends instead. existingTasks is that day's other tasks
// ({ start_min, duration_min }), does not need to be pre-sorted. Single forward pass
// over tasks sorted by start_min: since a bump only ever moves the candidate later,
// and earlier tasks (lower start_min) were already resolved before later ones are
// checked, a later bump can never re-collide with an earlier task -- one pass suffices.
export function resolveTaskStartConflict(startMin, durationMin, existingTasks) {
  if (startMin == null) return startMin
  const duration = durationMin || DEFAULT_TASK_DURATION_MIN
  let candidateStart = startMin

  const sorted = (existingTasks || [])
    .filter(t => t.start_min != null)
    .sort((a, b) => a.start_min - b.start_min)

  for (const task of sorted) {
    const taskEnd = task.start_min + (task.duration_min || DEFAULT_TASK_DURATION_MIN)
    const candidateEnd = candidateStart + duration
    const overlaps = candidateStart < taskEnd && candidateEnd > task.start_min
    if (overlaps) candidateStart = taskEnd
  }

  return Math.min(candidateStart, 1439)
}

export function composeTaskMessage(title) {
  return `When you're ready: ${title}`
}

// due_date is a DATE, start_min (if set) is minutes-since-midnight -- combine into an
// absolute fire_at. Naive, server-local time, same convention the rest of the planner
// (start_min/duration_min) already uses -- no per-user timezone stored anywhere.
export function taskFireAt(dueDate, startMin) {
  const d = new Date(dueDate)
  const minutes = startMin != null ? startMin : DEFAULT_DUE_TIME_MIN
  d.setHours(0, minutes, 0, 0)
  return d
}

// planner_routines.days / reminders.recur_days both use 0=Mon..6=Sun; JS Date#getDay()
// is 0=Sun..6=Sat.
export function jsDowToAppDow(jsDay) {
  return (jsDay + 6) % 7
}

export function isInQuietHours(nowMin, quietStartMin, quietEndMin) {
  if (quietStartMin === quietEndMin) return false
  if (quietStartMin < quietEndMin) return nowMin >= quietStartMin && nowMin < quietEndMin
  return nowMin >= quietStartMin || nowMin < quietEndMin // wraps past midnight
}

// Is a currently-active focus session recorded, and not yet expired?
export function isFocusSuppressed(latestFocusState, now) {
  if (!latestFocusState?.active || !latestFocusState.ends_at) return false
  return new Date(latestFocusState.ends_at).getTime() > now.getTime()
}

// The one gating function both the in-app poller and a future push dispatcher share:
// has this reminder's trigger passed, and is nothing (snooze/quiet hours/focus) holding
// it back right now?
export function computeDue(row, ctx) {
  if (row.status !== 'active') return false
  if (row.snooze_until && new Date(row.snooze_until).getTime() > ctx.now.getTime()) return false

  let triggerPassed = false
  if (row.fire_at) {
    triggerPassed = new Date(row.fire_at).getTime() <= ctx.now.getTime()
  } else if (Array.isArray(row.recur_days) && row.recur_days.length && row.time_min != null) {
    const triggerMin = row.time_min - (row.lead_min || 0)
    triggerPassed = row.recur_days.includes(ctx.currentDow) && ctx.nowMin >= triggerMin
  }
  if (!triggerPassed) return false

  if (isInQuietHours(ctx.nowMin, ctx.quietStartMin, ctx.quietEndMin)) return false
  if (ctx.focusSuppressed) return false
  return true
}

// Shared by ReminderToast/NudgesStrip -- where "Open" should point for a given kind.
// Pure display logic, no server imports, safe to use from client components too.
export function reminderOpenTarget(reminder) {
  if (reminder.kind === 'task' && reminder.task_id) {
    return { href: `/work?highlight=task-${reminder.task_id}`, label: 'Open', external: false }
  }
  if (reminder.kind === 'task' || reminder.kind === 'routine' || reminder.kind === 'block') {
    return { href: '/work', label: 'Open', external: false }
  }
  if (reminder.kind === 'interest_event' && reminder.payload?.source_url) {
    return { href: reminder.payload.source_url, label: 'Learn more', external: true }
  }
  return null
}
