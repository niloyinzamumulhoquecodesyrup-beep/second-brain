import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'sb_theme'

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} })

// pages/_document.js already stamps data-theme on <html> synchronously before paint
// (reading the same localStorage key) so there's no flash-of-wrong-theme on load.
// State reads that same attribute directly in its initializer rather than syncing to
// it from a separate mount effect — a two-effect sync-then-apply split had a real
// race: the "apply" effect's first run closes over the useState('dark') default
// (React runs mount effects in declaration order using each one's own render
// closure, not the post-update value), so it clobbered the correct attribute/
// localStorage back to 'dark' for one commit before a second render corrected it.
// Usually invisible, but on some reloads the correction never visibly lands and the
// page is stuck showing dark despite a stored 'light' preference. Reading the
// attribute in the initializer means the very first render already has the right
// value, so there's nothing to race.
function initialTheme() {
  if (typeof document === 'undefined') return 'dark' // SSR has no DOM; CSS still renders correctly client-side via the blocking script
  const applied = document.documentElement.getAttribute('data-theme')
  return applied === 'light' || applied === 'dark' ? applied : 'dark'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* private mode */ }
  }, [theme])

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
