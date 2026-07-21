import { useEffect, useRef, useState } from 'react'

// Full pomodoro timer as a dashboard widget — same behavior pages/focus.js used to own
// (presets, task-linking, chime, session logging to activity_log, today's count), just
// without its own page/Layout since the Dashboard is now its only home.

const PRESETS = [
  { key: 'focus25', label: '25 min', minutes: 25, mode: 'focus' },
  { key: 'focus50', label: '50 min', minutes: 50, mode: 'focus' },
  { key: 'break5', label: '5 min break', minutes: 5, mode: 'break' }
]

function todayKey() {
  return `sb_focus_sessions_${new Date().toDateString()}`
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function playChime(ctx) {
  const now = ctx.currentTime
  const freqs = [880, 1108.73, 1318.51]
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const start = now + i * 0.16
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.45)
  })
}

export default function PomodoroWidget() {
  const [tasks, setTasks] = useState([])
  const [taskId, setTaskId] = useState('')
  const [label, setLabel] = useState('')
  const [preset, setPreset] = useState(PRESETS[0])
  const [secondsLeft, setSecondsLeft] = useState(PRESETS[0].minutes * 60)
  const [running, setRunning] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [sessionsToday, setSessionsToday] = useState(0)
  const intervalRef = useRef(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(data => setTasks(data.filter(t => !t.done))).catch(() => {})
    const stored = Number(localStorage.getItem(todayKey()) || 0)
    setSessionsToday(stored)
    return () => { audioCtxRef.current?.close() }
  }, [])

  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          setRunning(false)
          setJustCompleted(true)
          if (audioCtxRef.current) playChime(audioCtxRef.current)
          fetch('/api/activity/focus', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: preset.mode, minutes: preset.minutes, task_id: taskId || null })
          }).catch(() => {})
          if (preset.mode === 'focus') {
            const next = sessionsToday + 1
            setSessionsToday(next)
            localStorage.setItem(todayKey(), String(next))
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [running, preset.mode, preset.minutes, sessionsToday, taskId])

  useEffect(() => {
    const original = document.title
    if (running) {
      document.title = `${formatTime(secondsLeft)} · Second Brain`
    } else {
      document.title = original
    }
    return () => { document.title = original }
  }, [running, secondsLeft])

  function selectPreset(p) {
    clearInterval(intervalRef.current)
    setRunning(false)
    setJustCompleted(false)
    setPreset(p)
    setSecondsLeft(p.minutes * 60)
  }

  function start() {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (AudioContextClass) audioCtxRef.current = new AudioContextClass()
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    setJustCompleted(false)
    setRunning(true)
  }

  function pause() {
    setRunning(false)
  }

  function reset() {
    clearInterval(intervalRef.current)
    setRunning(false)
    setJustCompleted(false)
    setSecondsLeft(preset.minutes * 60)
  }

  async function completeTask() {
    if (!taskId) return
    await fetch('/api/tasks/' + taskId, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: true })
    })
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setTaskId('')
  }

  const selectedTask = tasks.find(t => t.id === taskId)

  return (
    <div className="card border-t-2 border-orange-400/30 p-6">
      <div className="mb-4 flex items-center justify-between">
        <p className="label !text-orange-300">Pomodoro</p>
        <p className="text-xs text-mist-400">{sessionsToday} session{sessionsToday === 1 ? '' : 's'} today</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => selectPreset(p)}
            className={`chip capitalize ${preset.key === p.key ? 'border-orange-400/50 text-orange-300' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center py-2">
        {(selectedTask || label) && (
          <p className="mb-3 max-w-xs text-center text-sm text-mist-300">{selectedTask ? selectedTask.title : label}</p>
        )}
        <div
          className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 transition-colors"
          style={{
            borderColor: justCompleted ? '#fb923c' : running ? 'rgba(251,146,60,0.5)' : 'rgba(44,50,56,1)'
          }}
        >
          <div>
            <p className="text-center font-serif text-3xl font-light text-mist-100">{formatTime(secondsLeft)}</p>
            <p className="mt-1 text-center text-[11px] uppercase tracking-[0.2em] text-mist-400">
              {justCompleted ? 'Complete' : preset.mode === 'break' ? 'Break' : 'Focus'}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          {!running ? (
            <button onClick={start} className="btn-orange">
              {secondsLeft === preset.minutes * 60 ? 'Start' : 'Resume'}
            </button>
          ) : (
            <button onClick={pause} className="btn-secondary">Pause</button>
          )}
          <button onClick={reset} className="btn-secondary">Reset</button>
        </div>

        {justCompleted && selectedTask && (
          <button onClick={completeTask} className="btn-ghost mt-3 !text-orange-300 hover:!text-orange-200">
            Mark "{selectedTask.title}" complete →
          </button>
        )}
      </div>

      <div className="mt-5 border-t border-ink-700 pt-4">
        <select
          className="input mb-2 !py-1.5 text-sm"
          value={taskId}
          onChange={e => { setTaskId(e.target.value); setLabel('') }}
        >
          <option value="">Not tied to a task</option>
          {tasks.map(t => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        {!taskId && (
          <input
            className="input !py-1.5 text-sm"
            placeholder="Or note what this session is for (optional)"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        )}
      </div>
    </div>
  )
}
