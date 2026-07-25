// Shared logic for the reminders system (see REMINDERS_PLAN.md) -- kept out of the
// API route files since both pages/api/reminders/index.js (the due computation) and
// pages/api/tasks/*.js (auto-create) need the same gentle-copy composition.

export const DEFAULT_DUE_TIME_MIN = 9 * 60 // date-only tasks default to a morning nudge, never "midnight"

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
  if (reminder.kind === 'task' || reminder.kind === 'routine' || reminder.kind === 'block') {
    return { href: '/work', label: 'Open', external: false }
  }
  if (reminder.kind === 'interest_event' && reminder.payload?.source_url) {
    return { href: reminder.payload.source_url, label: 'Learn more', external: true }
  }
  return null
}
