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
        serif: ['var(--font-heading)', '"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif']
      },
      colors: {
        ink: {
          950: '#050607',
          900: '#0a0c0e',
          800: '#111417',
          700: '#181c20',
          600: '#22272c',
          500: '#2c3238'
        },
        mist: {
          400: '#8a929b',
          300: '#a7aeb5',
          200: '#c7ccd1',
          100: '#e7e9eb'
        },
        emerald: {
          400: '#5eead4',
          500: '#2dd4bf',
          600: '#14b8a6'
        },
        violet: {
          400: '#b7a6f7',
          500: '#a78bfa',
          600: '#8b6ef2'
        },
        gold: {
          400: '#f0d9a3',
          500: '#e0c07e',
          600: '#c9a35e'
        }
      }
    }
  },
  plugins: []
}
