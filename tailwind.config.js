/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        // Every shade below resolves through a CSS custom property (see
        // styles/globals.css :root / [data-theme='light']) instead of a literal hex,
        // so the entire site's existing bg-ink-950 / text-mist-400 / etc. usage
        // re-themes automatically from one place — no page-by-page changes needed.
        // rgb(var(...) / <alpha-value>) keeps Tailwind's opacity modifiers (e.g.
        // bg-ink-950/85) working.
        ink: {
          950: 'rgb(var(--ink-950) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)'
        },
        mist: {
          500: 'rgb(var(--mist-500) / <alpha-value>)',
          400: 'rgb(var(--mist-400) / <alpha-value>)',
          300: 'rgb(var(--mist-300) / <alpha-value>)',
          200: 'rgb(var(--mist-200) / <alpha-value>)',
          100: 'rgb(var(--mist-100) / <alpha-value>)'
        },
        emerald: {
          200: 'rgb(var(--emerald-200) / <alpha-value>)',
          300: 'rgb(var(--emerald-300) / <alpha-value>)',
          400: 'rgb(var(--emerald-400) / <alpha-value>)',
          500: 'rgb(var(--emerald-500) / <alpha-value>)',
          600: 'rgb(var(--emerald-600) / <alpha-value>)'
        },
        violet: {
          100: 'rgb(var(--violet-100) / <alpha-value>)',
          200: 'rgb(var(--violet-200) / <alpha-value>)',
          300: 'rgb(var(--violet-300) / <alpha-value>)',
          400: 'rgb(var(--violet-400) / <alpha-value>)',
          500: 'rgb(var(--violet-500) / <alpha-value>)',
          600: 'rgb(var(--violet-600) / <alpha-value>)'
        },
        gold: {
          200: 'rgb(var(--gold-200) / <alpha-value>)',
          300: 'rgb(var(--gold-300) / <alpha-value>)',
          400: 'rgb(var(--gold-400) / <alpha-value>)',
          500: 'rgb(var(--gold-500) / <alpha-value>)',
          600: 'rgb(var(--gold-600) / <alpha-value>)'
        },
        // Overrides of Tailwind's own default rose/orange/red (used for the Inbox
        // banner, the Focus page accent, and error/overdue text) — same var-driven
        // pattern as the custom families above, so these also darken correctly in
        // light mode instead of silently falling through to Tailwind's dark-tuned
        // pastel defaults.
        rose: {
          200: 'rgb(var(--rose-200) / <alpha-value>)',
          300: 'rgb(var(--rose-300) / <alpha-value>)',
          400: 'rgb(var(--rose-400) / <alpha-value>)',
          500: 'rgb(var(--rose-500) / <alpha-value>)'
        },
        orange: {
          200: 'rgb(var(--orange-200) / <alpha-value>)',
          300: 'rgb(var(--orange-300) / <alpha-value>)',
          400: 'rgb(var(--orange-400) / <alpha-value>)'
        },
        red: {
          400: 'rgb(var(--red-400) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
}
