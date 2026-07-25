import { useEffect, useRef, useState } from 'react'

function getInitials(name, email) {
  const source = (name || '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return (email || '?').slice(0, 2).toUpperCase()
}

export default function UserMenu({ user, avatarVersion, onOpenSettings, onLogout, loggingOut }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function onClickAway(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const initials = getInitials(user?.name, user?.email)
  const label = user?.name || user?.email || 'Account'

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Account menu for ${label}`}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-mist-500/50 bg-gradient-to-br from-violet-500/20 via-emerald-500/10 to-gold-500/20 text-[11px] font-medium text-mist-100 transition hover:border-mist-300/70"
      >
        {user?.hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/auth/avatar${avatarVersion ? `?v=${avatarVersion}` : ''}`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-lg border border-ink-600 bg-ink-900 py-1 shadow-xl"
        >
          <div className="truncate border-b border-ink-700 px-3.5 py-2 text-xs text-mist-400" title={user?.email}>
            {label}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenSettings()
            }}
            className="block w-full px-3.5 py-2 text-left text-sm text-mist-200 transition hover:bg-ink-800 hover:text-mist-100"
          >
            Settings
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            disabled={loggingOut}
            className="block w-full px-3.5 py-2 text-left text-sm text-mist-200 transition hover:bg-ink-800 hover:text-mist-100"
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  )
}
