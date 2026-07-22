import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'

// A one-time, forced guided tour: Mind (welcome) -> Work -> Capture -> Organize ->
// Distill -> Express -> Mind (summary), run once right after onboarding, before the
// account sees its own (still empty) Mind Model. Work comes right after welcome so
// the ADHD-support side (tasks, planner, focus, rewards) — the app's actual "doing"
// core — gets introduced before the knowledge-management side. Purely a simulated
// overlay per the product decision this was built to — no demo notes/tasks/packets
// are ever written; each page's own TourOverlay renders a self-contained mockup
// instead of touching real state.
//
// `active` is the single source of truth for "is the tour still owed" (users.
// tour_completed_at IS NULL, mirrored from GET /api/tour/status). `step` is UI-only
// progress within an already-active tour, kept in localStorage so a reload resumes
// where it left off rather than silently skipping ahead or restarting — losing it just
// means the tour restarts at step 0, which is an acceptable one-time-experience cost.
const STEP_KEY = 'sb_tour_step'
export const TOUR_STEPS = ['welcome', 'work', 'capture', 'organize', 'distill', 'express', 'summary']
export const TOUR_PATH = {
  welcome: '/mind',
  work: '/work',
  capture: '/',
  organize: '/',
  distill: '/',
  express: '/',
  summary: '/mind'
}
// Paths the lock never redirects away from, even mid-tour (auth pages, and the tour's
// own API routes if ever fetched from a non-page context).
const EXEMPT_PATHS = ['/login', '/register']

const TourContext = createContext(null)

export function TourProvider({ children }) {
  const router = useRouter()
  const [completed, setCompleted] = useState(null) // null = not yet checked
  const [step, setStep] = useState(0)

  // Re-checked on every route change, not just once at app mount: _app.js (and this
  // provider) persists across the register -> /mind SPA transition, and that first
  // mount happens on the unauthenticated /register page — a 401 there would otherwise
  // fail the check open (tour inactive) for the rest of the session with no way to
  // recover short of a hard reload, since a plain mount-only effect never re-fires.
  useEffect(() => {
    fetch('/api/tour/status')
      .then(r => (r.ok ? r.json() : { completed: true }))
      .then(d => setCompleted(!!d.completed))
      .catch(() => setCompleted(true)) // fail open — never trap a real user behind a broken check
    if (typeof window !== 'undefined') {
      const saved = parseInt(window.localStorage.getItem(STEP_KEY) || '0', 10)
      setStep(Number.isFinite(saved) && saved >= 0 && saved < TOUR_STEPS.length ? saved : 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.pathname])

  const goToStep = useCallback(n => {
    setStep(n)
    if (typeof window !== 'undefined') window.localStorage.setItem(STEP_KEY, String(n))
  }, [])

  const next = useCallback(() => {
    setStep(s => {
      const n = Math.min(s + 1, TOUR_STEPS.length - 1)
      if (typeof window !== 'undefined') window.localStorage.setItem(STEP_KEY, String(n))
      return n
    })
  }, [])

  const finish = useCallback(async () => {
    await fetch('/api/tour/complete', { method: 'POST' }).catch(() => {})
    if (typeof window !== 'undefined') window.localStorage.removeItem(STEP_KEY)
    setCompleted(true)
  }, [])

  const active = completed === false
  const stepKey = TOUR_STEPS[step]

  // The "no skip ahead" lock: whatever page just loaded, if it isn't the one the
  // current step expects, replace it — centralized here (mounted once at the app
  // root) instead of guarded per-page, so a manual nav-link click or typed URL can't
  // escape the sequence.
  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    if (EXEMPT_PATHS.includes(router.pathname)) return
    const expected = TOUR_PATH[stepKey]
    if (expected && router.pathname !== expected) router.replace(expected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepKey, router.pathname])

  const value = { loading: completed === null, active, step, stepKey, goToStep, next, finish }
  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour() {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within TourProvider')
  return ctx
}
