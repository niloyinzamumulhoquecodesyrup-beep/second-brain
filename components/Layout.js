import { useRouter } from 'next/router'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import ReminderToast from './ReminderToast'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import SettingsModal from './SettingsModal'
import { sounds } from '../lib/sounds'

const NAV_ITEMS = [
  { href: '/work', label: 'Work' },
  { href: '/', label: 'Organize' },
  { href: '/mind', label: 'Mind' },
  { href: '/other-brains', label: 'MINDVERSE' }
]

const POLL_MS = 60000

export default function Layout({ children, user }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [profile, setProfile] = useState({ name: user?.name || null, hasAvatar: !!user?.hasAvatar })
  const [avatarVersion, setAvatarVersion] = useState(0)

  const [reminders, setReminders] = useState([])
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const seenDueIdsRef = useRef(new Set())
  const askedPermissionRef = useRef(false)

  async function fetchReminders() {
    try {
      const res = await fetch('/api/reminders')
      if (!res.ok) return
      const rows = await res.json()
      setReminders(rows)

      const dueNow = rows.filter(r => r.due)
      const freshlyDue = dueNow.filter(r => !seenDueIdsRef.current.has(r.id))
      if (freshlyDue.length > 0) {
        dueNow.forEach(r => seenDueIdsRef.current.add(r.id))
        sounds.notification()
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('Second Brain', { body: freshlyDue[0].message, icon: '/favicon.svg' })
          } else if (Notification.permission === 'default' && !askedPermissionRef.current) {
            askedPermissionRef.current = true
            Notification.requestPermission()
          }
        }
      }
    } catch {
      // polling -- a failed check just tries again next interval
    }
  }

  useEffect(() => {
    fetchReminders()
    const id = setInterval(fetchReminders, POLL_MS)
    return () => clearInterval(id)
  }, [])

  async function actOnReminder(id, action, minutes) {
    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, minutes })
      })
    } catch {
      // best-effort -- next poll reconciles either way
    }
    fetchReminders()
  }

  function dismissLocally(id) {
    setDismissedIds(prev => new Set(prev).add(id))
  }

  function updateProfile(patch) {
    setProfile(p => ({ ...p, ...patch }))
    if (patch.bumpAvatarVersion) setAvatarVersion(v => v + 1)
  }

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const dueReminders = reminders.filter(r => r.due)
  const toastReminder = dueReminders.find(r => !dismissedIds.has(r.id)) || null

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
            <NotificationBell dueReminders={dueReminders} onAction={actOnReminder} />
            <ThemeToggle />
            <UserMenu
              user={{ email: user?.email, ...profile }}
              avatarVersion={avatarVersion}
              onOpenSettings={() => setShowSettings(true)}
              onLogout={logout}
              loggingOut={loggingOut}
            />
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

      {toastReminder && (
        <ReminderToast
          reminder={toastReminder}
          onDismiss={() => dismissLocally(toastReminder.id)}
          onDone={() => actOnReminder(toastReminder.id, 'done')}
          onSnooze={minutes => actOnReminder(toastReminder.id, 'snooze', minutes)}
          onAccept={() => actOnReminder(toastReminder.id, 'accept')}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={{ email: user?.email, ...profile }}
          avatarVersion={avatarVersion}
          onClose={() => setShowSettings(false)}
          onProfileUpdate={updateProfile}
        />
      )}
    </div>
  )
}
