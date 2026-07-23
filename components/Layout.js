import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState } from 'react'
import ThemeToggle from './ThemeToggle'
import ReminderToast from './ReminderToast'
import { sounds } from '../lib/sounds'

const NAV_ITEMS = [
  { href: '/work', label: 'Work' },
  { href: '/', label: 'Organize' },
  { href: '/mind', label: 'Mind' },
  { href: '/other-brains', label: 'MINDVERSE' }
]

// Sample copy for the bell's "preview a reminder" demo — the Reminders & Alerts
// plan's exact gentle framing ("When you're ready: …"), not real reminder data.
const DEMO_REMINDERS = [
  { message: "Reply to Sam about the proposal, whenever you get a moment.", href: '/work' },
  { message: 'A quick one: water the plants before it slips your mind.', href: '/work' },
  { message: 'Your morning pages routine is coming up.', href: '/work' },
  { message: "That task you split into pieces yesterday: the first piece is still there, waiting.", href: '/work' }
]

export default function Layout({ children, user }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [reminder, setReminder] = useState(null)

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  // Bell preview — an emulation of what the Reminders & Alerts plan's delivery
  // layer would show: the in-app toast every time, plus a real OS-level browser
  // notification if permission is granted (same feel Phase B's Web Push would
  // eventually deliver even with the tab closed; here it's a same-tab preview).
  // Nothing here reads or writes a real reminders table — it's sample copy.
  function emulateNotification() {
    const demo = DEMO_REMINDERS[Math.floor(Math.random() * DEMO_REMINDERS.length)]
    setReminder(demo)
    sounds.notification()
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const fire = () => new Notification('Second Brain', { body: demo.message, icon: '/favicon.svg' })
      if (Notification.permission === 'granted') fire()
      else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') fire() })
      }
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 bg-aura text-mist-100">
      <header className="sticky top-0 z-30 border-b border-ink-700/80 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 via-violet-500/10 to-gold-500/20 text-xs text-emerald-300 font-serif">
              SB
            </span>
            <span className="font-serif text-xl tracking-wide text-mist-100">Second Brain</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" data-nav="desktop">
            {NAV_ITEMS.map(item => {
              const active = router.pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-[13px] uppercase tracking-[0.14em] transition ${
                    active ? 'text-emerald-300' : 'text-mist-300 hover:text-mist-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={emulateNotification}
              className="text-mist-300 hover:text-gold-300"
              aria-label="Preview a reminder notification"
              title="Preview a reminder notification"
            >
              🔔
            </button>
            <ThemeToggle />
            <button onClick={logout} disabled={loggingOut} className="btn-secondary !px-4 !py-1.5 text-xs">
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-5 overflow-x-auto border-t border-ink-800 px-6 py-2 md:hidden" data-nav="mobile">
          {NAV_ITEMS.map(item => {
            const active = router.pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap text-[13px] uppercase tracking-[0.14em] ${
                  active ? 'text-emerald-300' : 'text-mist-300'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>

      {reminder && (
        <ReminderToast
          reminder={reminder}
          onDismiss={() => setReminder(null)}
          onDone={() => setReminder(null)}
          onSnooze={() => setReminder(null)}
        />
      )}
    </div>
  )
}
