// Persists the one active pomodoro/focus session across a page reload — without
// this, refreshing mid-session silently lost the clock and dropped the user back
// to the Today list. Only one session is ever active at a time, so a single
// localStorage slot is enough; it's always restored paused (never silently
// resumes counting down time that passed while the tab was closed).
const KEY = 'sb_focus_session'

export function saveFocusSession(itemKey, data) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify({ itemKey, ...data }))
}

export function loadFocusSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearFocusSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY)
}
