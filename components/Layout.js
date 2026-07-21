import { useRouter } from 'next/router'
import Link from 'next/link'
import { useState } from 'react'
import ThemeToggle from './ThemeToggle'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Work' },
  { href: '/', label: 'Organize' },
  { href: '/mind', label: 'Mind' },
  { href: '/other-brains', label: 'MINDVERSE' }
]

export default function Layout({ children, user }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

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
                    active ? 'text-emerald-300' : 'text-mist-300 hover:text-mist-100'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-4">
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
    </div>
  )
}
