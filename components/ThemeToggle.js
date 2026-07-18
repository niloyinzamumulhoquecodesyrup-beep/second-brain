import { useTheme } from './ThemeProvider'

// Sun/moon glyphs, not emoji — filled shapes only, no external icon set dependency.
export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  return (
    <button
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      className={`flex h-8 w-8 items-center justify-center rounded-full border border-ink-500 text-mist-300 transition hover:border-mist-300/60 hover:text-mist-100 ${className}`}
    >
      {isLight ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm7 3a1 1 0 0 1 1 1 1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1zM5 11a1 1 0 0 1 1 1 1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1zm12.66-6.66a1 1 0 0 1 1.41 0 1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71zM6.34 17.66a1 1 0 0 1 1.41 0 1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71zM12 19a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zm5.66-1.34a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71zM6.34 4.34a1 1 0 0 1 1.41 1.41l-.71.71A1 1 0 1 1 5.63 5.05l.71-.71z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 1 0 20.354 15.354z" />
        </svg>
      )}
    </button>
  )
}
