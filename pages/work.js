import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import TasksPanel from '../components/TasksPanel'
import RoutinePlanner from '../components/RoutinePlanner'
import RewardPanel from '../components/RewardPanel'
import CompletionCelebration from '../components/CompletionCelebration'
import TourOverlay from '../components/TourOverlay'
import { requireSessionSSR } from '../lib/pageAuth'
import { levelInfo } from '../lib/rewardLevels'

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Rare, celebratory lines for the plain variable-ratio bonus (no fresh level to
// name) — a different flavor from RewardPanel's QUOTES, which are about starting,
// not this "didn't see that coming" surprise.
const SURPRISE_LINES = [
  "Didn't see that coming, did you? Bonus round.",
  'Extra credit, you weren\'t even trying for this one.',
  'A little gift from future-you to present-you.',
  'Surprise! The universe noticed.',
  'Unlocked out of nowhere. Enjoy it.',
  'That one was on the house.'
]

// The Work tab: what's on today/this week/this month (with per-task pomodoro focus
// sessions via Start), the reward panel, and the routine planner. Capture lives as
// a popup on Organize now — this page is about doing the work itself.
export default function Work({ user }) {
  const [stats, setStats] = useState(null)
  const [bonus, setBonus] = useState(null) // { message } | null

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {})
  }, [])

  // Every real task completion (list checkbox or FocusPomodoro's Done button) and
  // every logged focus session flows through here via TasksPanel/TodayCards'
  // onCompletion. Bumps the relevant lifetime/today counters locally so the
  // reward panel updates immediately — no full reload, no extra /api/stats
  // round trip — then decides whether this moment earns the rare surprise-bonus
  // celebration: a freshly crossed level always does, otherwise a plain ~15%
  // variable-ratio roll. Never guaranteed, and missing it costs nothing.
  function handleCompletion(type) {
    const totalKey = type === 'focus' ? 'focusSessionsTotal' : 'tasksDone'
    const dailyKey = type === 'focus' ? 'focusSessionsByDay' : 'tasksDoneByDay'
    const dimLabel = type === 'focus' ? 'Focus' : 'Follow-through'
    const prevTotal = stats?.[totalKey] || 0
    const nextTotal = prevTotal + 1
    const prevLevel = levelInfo(prevTotal).level
    const nextLevel = levelInfo(nextTotal).level

    setStats(prev => {
      if (!prev) return prev
      const today = todayYMD()
      const daily = prev[dailyKey] || []
      const idx = daily.findIndex(r => String(r.day).slice(0, 10) === today)
      const nextDaily = idx >= 0
        ? daily.map((r, i) => (i === idx ? { ...r, count: r.count + 1 } : r))
        : [...daily, { day: today, count: 1 }]
      return { ...prev, [totalKey]: nextTotal, [dailyKey]: nextDaily }
    })

    if (nextLevel > prevLevel) {
      setBonus({ message: `Level up: ${dimLabel} Lv ${nextLevel}!` })
    } else if (Math.random() < 0.15) {
      setBonus({ message: SURPRISE_LINES[Math.floor(Math.random() * SURPRISE_LINES.length)] })
    }
  }

  return (
    <Layout user={user}>
      <TourOverlay step="work" />

      <div className="mb-8">
        <p className="label mb-2 !text-gold-400">Work</p>
        <h1 className="font-serif text-4xl font-light text-mist-100">What's on today</h1>
      </div>

      <div className="space-y-6">
        <RewardPanel stats={stats} />

        <TasksPanel onCompletion={handleCompletion} />

        <RoutinePlanner />
      </div>

      {bonus && (
        <CompletionCelebration variant="bonus" message={bonus.message} onDone={() => setBonus(null)} />
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
