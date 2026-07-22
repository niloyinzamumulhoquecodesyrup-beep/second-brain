import { useEffect, useRef, useState } from 'react'
import { shortenTitle } from '../lib/titleShorten'
import { sounds } from '../lib/sounds'
import { saveFocusSession, loadFocusSession, clearFocusSession } from '../lib/focusSession'

const MODES = [
  { key: 'pomodoro', label: 'pomodoro', minutes: 25 },
  { key: 'short', label: 'short break', minutes: 5 },
  { key: 'long', label: 'long break', minutes: 15 }
]

// Restores this item's saved clock, if the localStorage session belongs to it —
// otherwise a fresh mode/time. Read once, synchronously, at mount (as the
// initial state values below) so there's no flash of 25:00 before snapping to
// the resumed time.
function restoreFor(item) {
  const saved = loadFocusSession()
  if (saved && saved.itemKey === item.key) {
    const mode = MODES.find(m => m.key === saved.mode) || MODES[0]
    return { mode, secondsLeft: saved.secondsLeft, focusSeconds: saved.focusSeconds || 0 }
  }
  return { mode: MODES[0], secondsLeft: MODES[0].minutes * 60, focusSeconds: 0 }
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// The focus view a Today card expands into: one section — a pomodoro ring tinted
// with that card's own color, a short on-device-generated label standing in for
// the task name ("Deep work block" instead of the full title), and the same
// section breaking the task into smaller pieces while working it.
export default function FocusPomodoro({ item, bgColorClass, textColorClass, pieces, onPiecesChange, onExit, onComplete, onLogFocus }) {
  const [initial] = useState(() => restoreFor(item))
  const [mode, setMode] = useState(initial.mode)
  const [secondsLeft, setSecondsLeft] = useState(initial.secondsLeft)
  const [running, setRunning] = useState(false) // always resumes paused — never silently counts closed-tab time
  const [newPiece, setNewPiece] = useState('')
  const [finishing, setFinishing] = useState(false)
  const [shortTitle, setShortTitle] = useState('')
  const intervalRef = useRef(null)
  const focusSecondsRef = useRef(initial.focusSeconds)
  const [pauseFlash, setPauseFlash] = useState(false)
  const pauseFlashTimeoutRef = useRef(null)

  // A brief transparent-red pulse in the ring's center, timed to land exactly
  // when a pause sound plays (the one-off pause blip, or the 15s "still paused"
  // reminder) — a visual echo of the sound, not a separate warning.
  function flashPause() {
    setPauseFlash(true)
    clearTimeout(pauseFlashTimeoutRef.current)
    pauseFlashTimeoutRef.current = setTimeout(() => setPauseFlash(false), 350)
  }
  useEffect(() => () => clearTimeout(pauseFlashTimeoutRef.current), [])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  // Keeps the clock resumable across a refresh — mode/time/accumulated focus
  // seconds are the only things that need to survive; running never does (see
  // restoreFor's paused-on-load contract above).
  useEffect(() => {
    saveFocusSession(item.key, { mode: mode.key, secondsLeft, focusSeconds: focusSecondsRef.current })
  }, [item.key, mode.key, secondsLeft])

  useEffect(() => {
    let cancelled = false
    setShortTitle('')
    shortenTitle(item.title).then(s => { if (!cancelled) setShortTitle(s) })
    return () => { cancelled = true }
  }, [item.title])

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          sounds.pomodoroEnd()
          // Only a finished focus round is followed by a break suggestion — a
          // finished break just means it's over, not another cue to rest.
          if (mode.key === 'pomodoro') setTimeout(sounds.takeABreak, 900)
          return 0
        }
        if (mode.key === 'pomodoro') focusSecondsRef.current += 1
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, mode.key])

  // A seatbelt-chime-style nudge: every 15s while genuinely paused mid-session
  // (not before a first Start, when secondsLeft still sits at the mode's full
  // length), a soft reminder plays so a paused clock doesn't just go forgotten.
  useEffect(() => {
    if (running || secondsLeft === mode.minutes * 60) return
    const id = setInterval(() => { sounds.pausedReminder(); flashPause() }, 15000)
    return () => clearInterval(id)
  }, [running, secondsLeft, mode.minutes])

  function toggleRun() {
    if (running) { sounds.pomodoroPause(); flashPause() }
    else sounds.startingTask()
    setRunning(r => !r)
  }

  function selectMode(m) {
    clearInterval(intervalRef.current)
    setRunning(false)
    setMode(m)
    setSecondsLeft(m.minutes * 60)
  }

  function reset() {
    clearInterval(intervalRef.current)
    setRunning(false)
    setSecondsLeft(mode.minutes * 60)
  }

  function addPiece() {
    if (!newPiece.trim()) return
    onPiecesChange([...pieces, { id: `${Date.now()}`, text: newPiece.trim(), done: false }])
    setNewPiece('')
  }
  function togglePiece(id) {
    onPiecesChange(pieces.map(p => (p.id === id ? { ...p, done: !p.done } : p)))
  }
  function removePiece(id) {
    onPiecesChange(pieces.filter(p => p.id !== id))
  }

  async function finish() {
    clearInterval(intervalRef.current)
    setFinishing(true)
    if (focusSecondsRef.current >= 60) onLogFocus(Math.round(focusSecondsRef.current / 60))
    clearFocusSession()
    await onComplete()
  }

  const total = mode.minutes * 60
  const pct = total > 0 ? (total - secondsLeft) / total : 0
  const R = 84
  const SW = 10
  const C = 2 * Math.PI * R
  const headline = shortTitle || item.title
  const showFullTitle = headline.toLowerCase() !== item.title.toLowerCase()

  return (
    <div className={`rounded-2xl border border-ink-700 bg-ink-950 p-6 text-center ${textColorClass}`}>
      <button onClick={onExit} className="mb-1 text-xs text-mist-500 hover:text-mist-300">‹ back to today</button>

      <p className="mt-3 truncate px-4 text-lg font-medium text-mist-100">{headline}</p>
      {showFullTitle && <p className="mt-0.5 truncate px-4 text-xs text-mist-500">{item.title}</p>}

      <div className="mb-6 mt-4 flex justify-center gap-2">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => selectMode(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${mode.key === m.key ? `${bgColorClass} text-white` : 'bg-ink-800 text-mist-400 hover:text-mist-200'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(var(--ink-700))" strokeWidth={SW} />
          <circle
            cx="100" cy="100" r={R} fill="none" stroke="currentColor" strokeWidth={SW}
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className={`absolute h-36 w-36 rounded-full transition-colors duration-200 ${pauseFlash ? 'bg-red-500/25' : 'bg-transparent'}`} />
        <div>
          <p className="font-serif text-3xl font-light text-mist-100">{formatTime(secondsLeft)}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-mist-400">
            {running ? 'focus' : secondsLeft === total ? 'ready' : 'pause'}
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <button onClick={toggleRun} className={`rounded-full px-6 py-2 text-sm font-semibold text-white ${bgColorClass} hover:brightness-110`}>
          {running ? 'Pause' : secondsLeft === total ? 'Start' : 'Resume'}
        </button>
        <button onClick={reset} className="btn-secondary">Reset</button>
      </div>

      <div className="mt-8 border-t border-ink-700 pt-5 text-left">
        <p className="label mb-3">Break it into pieces</p>
        <div className="space-y-2">
          {pieces.length === 0 && <p className="text-sm text-mist-400">Split this task into smaller steps if it helps.</p>}
          {pieces.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-sm">
              <input type="checkbox" checked={p.done} onChange={() => togglePiece(p.id)} />
              <span className={`min-w-0 flex-1 truncate ${p.done ? 'text-mist-500 line-through' : 'text-mist-100'}`}>{p.text}</span>
              <button onClick={() => removePiece(p.id)} className="text-xs text-mist-500 hover:text-red-400">✕</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1 !py-1.5 text-sm"
            placeholder="Add a piece…"
            value={newPiece}
            onChange={e => setNewPiece(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPiece() }}
          />
          <button onClick={addPiece} className="btn-secondary !py-1.5 text-sm">Add</button>
        </div>

        <button disabled={finishing} onClick={finish} className={`mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white ${bgColorClass} hover:brightness-110 disabled:opacity-60`}>
          ✓ Done — mark task complete
        </button>
      </div>
    </div>
  )
}
