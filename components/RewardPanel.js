import { useMemo, useState } from 'react'
import { levelInfo, medianTarget } from '../lib/rewardLevels'

// Original, unattributed lines — short and concrete rather than "grind harder" — aimed
// at the ADHD-specific fight (starting, not effort) rather than generic motivation.
const QUOTES = [
  'Starting is the whole battle. You already won it today.',
  'Momentum doesn\'t care how small the first step was.',
  'One task, right now. The rest can wait its turn.',
  'You don\'t need to feel ready. You just need to begin.',
  'A messy start still counts as a start.',
  'Your brain isn\'t broken, it just runs on different fuel. Feed it a win.',
  'Done beats perfect, every single time.',
  'Five focused minutes is still five minutes you didn\'t have yesterday.',
  'Progress hides in the boring middle. Keep going.',
  'You showed up. That\'s the hard part, and it\'s already behind you.',
  'Small and consistent outlasts big and occasional.',
  'The next step doesn\'t have to be the right one, just a real one.',
  'Distraction is loud, but it isn\'t in charge.',
  'You\'re not behind. You\'re exactly where today needed you to start.',
  'Willpower is a muscle, not a personality trait, this rep counts.',
  'Nobody remembers the slow start. They remember the finish.',
  'Rest is not the opposite of progress.',
  'One box checked is proof, not just paperwork.',
  'Today doesn\'t need to fix every day before it.',
  'Your attention is a resource, spend a little of it here, on purpose.'
]

function todayYMD() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDaysYMD(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n, 12)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function dayOfYear() {
  const d = new Date()
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}
function toCountMap(rows) {
  const m = {}
  ;(rows || []).forEach(r => { m[String(r.day).slice(0, 10)] = r.count })
  return m
}

// A day counts as "active" if anything real happened on it — capture, focus session,
// or a completed task. Streak is framed positively: it counts consecutive active days
// ending today-or-yesterday, so a day that hasn't happened yet never reads as "broken".
function computeStreak(activeDays) {
  let streak = 0
  let cursor = todayYMD()
  if (!activeDays.has(cursor)) cursor = addDaysYMD(cursor, -1) // today not active yet — start counting from yesterday
  while (activeDays.has(cursor)) {
    streak += 1
    cursor = addDaysYMD(cursor, -1)
  }
  return streak
}

const BADGES = [
  { key: 'first_capture', label: 'First capture', icon: '🌱', check: s => s.totalNotes >= 1 },
  { key: 'ten_captures', label: '10 notes captured', icon: '📚', check: s => s.totalNotes >= 10 },
  { key: 'first_task', label: 'First task done', icon: '✅', check: s => s.tasksDone >= 1 },
  { key: 'ten_tasks', label: '10 tasks done', icon: '🏆', check: s => s.tasksDone >= 10 },
  { key: 'first_focus', label: 'First focus session', icon: '⏱️', check: s => s.focusSessionsTotal >= 1 },
  { key: 'focus_builder', label: '5 focus sessions', icon: '🔥', check: s => s.focusSessionsTotal >= 5 },
  { key: 'deep_focus', label: '25 focus sessions', icon: '💎', check: s => s.focusSessionsTotal >= 25 },
  { key: 'streak_3', label: '3-day streak', icon: '⚡', check: s => s.streak >= 3 },
  { key: 'streak_7', label: '7-day streak', icon: '🌟', check: s => s.streak >= 7 }
]

// A filling tank/cylinder gauge — a visual, game-like read on today's progress toward a
// small soft target rather than a bare number, since a rising fill line reads faster and
// feels more rewarding than digits for an ADHD dopamine-on-progress loop. The target is
// intentionally small and never punitive: reaching it just means a full, glowing tank.
function TankGauge({ label, value, target, color }) {
  const W = 64
  const TOP_Y = 15
  const BOTTOM_Y = 92
  const RX = 25
  const RY = 9
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const fillTopY = BOTTOM_Y - pct * (BOTTOM_Y - TOP_Y)
  const uid = label.replace(/\s+/g, '-')
  const clipId = `tank-clip-${uid}`
  const bodyGradId = `tank-body-${uid}`
  const fillGradId = `tank-fill-${uid}`
  const rimGradId = `tank-rim-${uid}`
  const surfaceGradId = `tank-surface-${uid}`
  const bodyPath = `M ${W / 2 - RX},${TOP_Y} L ${W / 2 - RX},${BOTTOM_Y} A ${RX} ${RY} 0 0 0 ${W / 2 + RX} ${BOTTOM_Y} L ${W / 2 + RX},${TOP_Y}`

  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-mist-500">{label}</p>
      <svg viewBox={`0 0 ${W} 100`} width="58" height="82">
        <defs>
          <clipPath id={clipId}>
            <path d={`${bodyPath} Z`} />
          </clipPath>
          {/* horizontal light/dark bands simulate a curved glass tube wall */}
          <linearGradient id={bodyGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.01)" />
            <stop offset="18%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="42%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="75%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.01)" />
          </linearGradient>
          <linearGradient id={fillGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="22%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="48%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id={rimGradId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="55%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
          </radialGradient>
          <linearGradient id={surfaceGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.6" />
            <stop offset="30%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} stopOpacity="0.7" />
          </linearGradient>
        </defs>

        <ellipse cx={W / 2} cy={BOTTOM_Y + 4} rx={RX * 0.85} ry={RY * 0.6} fill="rgba(0,0,0,0.35)" />

        <path d={bodyPath} fill="rgba(255,255,255,0.03)" stroke={color} strokeOpacity="0.4" strokeWidth="2" />
        <g clipPath={`url(#${clipId})`}>
          <rect x={W / 2 - RX} y={fillTopY} width={RX * 2} height={BOTTOM_Y - fillTopY} fill={`url(#${fillGradId})`} />
          {pct > 0 && (
            <ellipse cx={W / 2} cy={fillTopY} rx={RX} ry={RY * 0.85} fill={`url(#${surfaceGradId})`} />
          )}
          {/* glass reflection streak */}
          <rect x={W / 2 - RX + RX * 0.32} y={TOP_Y} width={RX * 0.22} height={BOTTOM_Y - TOP_Y} rx={RX * 0.11} fill="#ffffff" opacity="0.1" />
        </g>
        <path d={bodyPath} fill={`url(#${bodyGradId})`} stroke="none" />
        <path d={`M ${W / 2 - RX},${BOTTOM_Y} A ${RX} ${RY} 0 0 0 ${W / 2 + RX},${BOTTOM_Y}`} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="2" />
        <ellipse cx={W / 2} cy={TOP_Y} rx={RX} ry={RY} fill={`url(#${rimGradId})`} stroke={color} strokeOpacity="0.6" strokeWidth="2" />
        <text x={W / 2} y="56" textAnchor="middle" style={{ fontSize: 17, fontWeight: 700, fill: 'rgb(var(--mist-100))' }}>{value}</text>
      </svg>
    </div>
  )
}

// TankGauge (today's fill) plus a lifetime level + progress bar toward the next
// one underneath — level is a pure function of the lifetime total (see
// lib/rewardLevels.js), so unlike the streak itself it never goes backward.
function DimensionColumn({ label, value, target, color, level, progress }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <TankGauge label={label} value={value} target={target} color={color} />
      <p className="text-[10px] font-semibold text-mist-300">Lv {level}</p>
      <div className="h-1 w-14 overflow-hidden rounded-full bg-ink-700">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round(progress * 100)}%`, background: color }} />
      </div>
    </div>
  )
}

export default function RewardPanel({ stats }) {
  const { streak, todayNotes, todayFocus, todayTasks, earned, next } = useMemo(() => {
    if (!stats) return { streak: 0, todayNotes: 0, todayFocus: 0, todayTasks: 0, earned: [], next: null }
    const today = todayYMD()
    const capMap = toCountMap(stats.capturesByDay)
    const focusMap = toCountMap(stats.focusSessionsByDay)
    const taskMap = toCountMap(stats.tasksDoneByDay)

    const activeDays = new Set([
      ...Object.keys(capMap).filter(d => capMap[d] > 0),
      ...Object.keys(focusMap).filter(d => focusMap[d] > 0),
      ...Object.keys(taskMap).filter(d => taskMap[d] > 0)
    ])

    const streak = computeStreak(activeDays)
    const withStreak = { ...stats, streak }
    const earned = BADGES.filter(b => b.check(withStreak))
    const next = BADGES.find(b => !b.check(withStreak)) || null

    return {
      streak,
      todayNotes: capMap[today] || 0,
      todayFocus: focusMap[today] || 0,
      todayTasks: taskMap[today] || 0,
      earned,
      next
    }
  }, [stats])

  const quote = QUOTES[dayOfYear() % QUOTES.length]

  // Four fixed dimensions (Consistency/Capture/Follow-through/Focus). Today's
  // gauge target adapts to what's actually typical — the median of the last 7
  // days for that dimension — instead of a flat 3, so the tank stays reachable.
  // Streak keeps a steady target: it isn't a per-day count to take a median of,
  // and 7 already lines up with the existing streak_7 badge below.
  const gauges = [
    { label: 'Streak', value: streak, target: 7, color: '#f0d9a3', ...levelInfo(streak) },
    { label: 'Captures', value: todayNotes, target: medianTarget(stats?.capturesByDay), color: '#5eead4', ...levelInfo(stats?.totalNotes) },
    { label: 'Tasks done', value: todayTasks, target: medianTarget(stats?.tasksDoneByDay), color: '#b7a6f7', ...levelInfo(stats?.tasksDone) },
    { label: 'Focus sessions', value: todayFocus, target: medianTarget(stats?.focusSessionsByDay), color: '#fb923c', ...levelInfo(stats?.focusSessionsTotal) }
  ]

  return (
    <div className="card overflow-hidden border-t-2 border-gold-400/40 p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label mb-1 !text-gold-400">You're doing great</p>
              <p className="font-serif text-3xl font-light text-mist-100">
                {streak > 0 ? `${streak}-day streak` : (todayNotes + todayFocus + todayTasks) > 0 ? 'Today\'s in motion' : 'Ready when you are'}
              </p>
            </div>
            {earned.length > 0 && (
              <div className="flex flex-wrap justify-end gap-1.5 max-w-[180px]">
                {earned.slice(-6).map(b => (
                  <span key={b.key} title={b.label} className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-400/40 bg-gold-500/10 text-base">
                    {b.icon}
                  </span>
                ))}
              </div>
            )}
          </div>

          {next && (
            <p className="mt-2 text-xs text-mist-500">
              Next: <span className="text-mist-300">{next.icon} {next.label}</span>
            </p>
          )}

          <div className="mt-4 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-950/60 p-4">
            <p className="flex-1 text-sm italic leading-relaxed text-mist-200">{quote}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-700 bg-ink-950/40 px-3 py-4 sm:grid-cols-4">
          {gauges.map(g => (
            <DimensionColumn key={g.label} {...g} />
          ))}
        </div>
      </div>
    </div>
  )
}
