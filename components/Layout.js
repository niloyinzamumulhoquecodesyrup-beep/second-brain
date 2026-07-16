import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/capture', label: 'Capture' },
  { href: '/organize', label: 'Organize' },
  { href: '/distill', label: 'Distill' },
  { href: '/express', label: 'Express' },
  { href: '/focus', label: 'Focus' },
  { href: '/mind', label: 'Mind' }
]

export default function Layout({ children, user }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [headingFont, setHeadingFont] = useState('sans')
  const [calmMode, setCalmMode] = useState('on')

  useEffect(() => {
    const storedFont = localStorage.getItem('sb-heading-font') || 'sans'
    setHeadingFont(storedFont)
    document.documentElement.dataset.headingFont = storedFont

    // Calm Mode defaults on for everyone; users opt out explicitly if they want motion.
    const storedCalm = localStorage.getItem('sb-calm-mode') || 'on'
    setCalmMode(storedCalm)
    document.documentElement.dataset.calmMode = storedCalm
  }, [])

  function toggleHeadingFont() {
    const next = headingFont === 'sans' ? 'serif' : 'sans'
    setHeadingFont(next)
    document.documentElement.dataset.headingFont = next
    localStorage.setItem('sb-heading-font', next)
  }

  function toggleCalmMode() {
    const next = calmMode === 'on' ? 'off' : 'on'
    setCalmMode(next)
    document.documentElement.dataset.calmMode = next
    localStorage.setItem('sb-calm-mode', next)
  }

  async function logout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
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
                    active ? 'text-emerald-300' : 'text-mist-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleCalmMode}
              title={calmMode === 'on' ? 'Calm Mode is on — turn off to allow motion & animation' : 'Calm Mode is off — turn on to stop motion & animation'}
              aria-label="Toggle Calm Mode"
              aria-pressed={calmMode === 'on'}
              className={`rounded border px-2 py-1 text-[13px] transition ${
                calmMode === 'on'
                  ? 'border-emerald-400/50 text-emerald-300'
                  : 'border-ink-600 text-mist-300 hover:border-mist-300/50 hover:text-mist-100'
              }`}
            >
              Calm
            </button>
            <button
              onClick={toggleHeadingFont}
              title={headingFont === 'sans' ? 'Switch headings to serif' : 'Switch headings to sans-serif (more legible)'}
              aria-label="Toggle heading font"
              className="rounded border border-ink-600 px-2 py-1 text-[13px] text-mist-300 transition hover:border-mist-300/50 hover:text-mist-100"
            >
              Aa
            </button>
            {user && <span className="hidden text-xs text-mist-400 sm:inline">{user.email}</span>}
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
    </div>
  )
}
