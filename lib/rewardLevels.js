// Shared math for the Work page's reward system (components/RewardPanel.js,
// pages/work.js): a gentle rising level curve per dimension, and an adaptive
// "soft target" for the daily tank gauges — both computed straight from stats
// already returned by GET /api/stats, no extra tracking or migration needed.

// Seed curve from the build spec, then keep growing gently forever so heavy
// lifetime use never caps out at a fixed max level.
const SEED_THRESHOLDS = [0, 3, 8, 15, 25, 40, 60, 85, 120]

function buildThresholds(count) {
  const arr = [...SEED_THRESHOLDS]
  while (arr.length < count) {
    const last = arr[arr.length - 1]
    const prev = arr[arr.length - 2]
    const step = Math.round((last - prev) * 1.3)
    arr.push(last + Math.max(step, 25))
  }
  return arr
}

export const LEVEL_THRESHOLDS = buildThresholds(24)

// Level = how many thresholds a lifetime total has passed. Purely a function of
// the total, so it only ever goes up — there's no "losing" a level.
export function levelInfo(total) {
  const t = Math.max(0, total || 0)
  let level = 0
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (t >= LEVEL_THRESHOLDS[i]) level = i
    else break
  }
  const current = LEVEL_THRESHOLDS[level]
  const next = LEVEL_THRESHOLDS[level + 1] ?? null
  const progress = next ? Math.min(1, Math.max(0, (t - current) / (next - current))) : 1
  return { level, current, next, progress }
}

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The median of the last `days` entries in a [{day, count}] array, floored at 1 —
// a target that bends to what's actually typical instead of a fixed 3, and can
// never land on 0 (an empty tank with no way to fill it reads as punitive).
export function medianTarget(dailyRows, days = 7) {
  const map = {}
  ;(dailyRows || []).forEach(r => { map[String(r.day).slice(0, 10)] = r.count })
  const vals = []
  const today = new Date()
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    vals.push(map[toYMD(d)] || 0)
  }
  vals.sort((a, b) => a - b)
  const mid = Math.floor(vals.length / 2)
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
  return Math.max(1, Math.round(median))
}
