import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { requireSessionSSR } from '../lib/pageAuth'

const PRESETS = [
  { key: 'focus25', label: '25 min focus', minutes: 25, mode: 'focus' },
  { key: 'focus50', label: '50 min focus', minutes: 50, mode: 'focus' },
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

export default function Focus({ user }) {
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
    fetch('/api/tasks').then(r => r.json()).then(data => setTasks(data.filter(t => !t.done)))
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
    <Layout user={user}>
      <p className="label mb-2 !text-orange-300">Focus</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-white">One session at a time</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Pick a task, start the timer, work until it rings. Completion over perfection.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card border-t-2 border-orange-400/30 p-8 lg:col-span-2">
          <div className="mb-6 flex flex-wrap gap-2">
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

          <div className="flex flex-col items-center py-6">
            {(selectedTask || label) && (
              <p className="mb-4 max-w-xs text-center text-sm text-mist-300">{selectedTask ? selectedTask.title : label}</p>
            )}
            <div
              className="relative flex h-56 w-56 items-center justify-center rounded-full border-4 transition-colors"
              style={{
                borderColor: justCompleted ? '#fb923c' : running ? 'rgba(251,146,60,0.5)' : 'rgba(44,50,56,1)'
              }}
            >
              <div>
                <p className="text-center font-serif text-5xl font-light text-white">{formatTime(secondsLeft)}</p>
                <p className="mt-2 text-center text-xs uppercase tracking-[0.2em] text-mist-400">
                  {justCompleted ? 'Session complete' : preset.mode === 'break' ? 'Break' : 'Focus'}
                </p>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
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
              <button onClick={completeTask} className="btn-ghost mt-4 !text-orange-300 hover:!text-orange-200">
                Mark "{selectedTask.title}" complete →
              </button>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <p className="label mb-3 !text-orange-300">What are you focusing on?</p>
            <select
              className="input mb-3"
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
                className="input"
                placeholder="Or just note what this session is for (optional)"
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            )}
            {tasks.length === 0 && (
              <p className="mt-3 text-xs text-mist-500">No open tasks. Add one in Express.</p>
            )}
          </div>

          <div className="card p-6">
            <p className="label mb-2 !text-orange-300">Today</p>
            <p className="font-serif text-4xl font-light text-white">{sessionsToday}</p>
            <p className="mt-1 text-xs text-mist-400">focus session{sessionsToday === 1 ? '' : 's'} completed</p>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
