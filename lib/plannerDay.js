// Shared with ProductivityTab.js's day/week gantt and TodayCards' routine cards —
// both need the same "what actually happens today" merge of concrete blocks and
// recurring routines, kept in one place so the two views can't drift apart.

export function ymdToDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12) // noon dodges DST edges
}
export function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(ymd, n) {
  const d = ymdToDate(ymd)
  d.setDate(d.getDate() + n)
  return toYMD(d)
}
export function weekdayIndex(ymd) {
  return (ymdToDate(ymd).getDay() + 6) % 7 // 0 = Monday
}

// Merge one date's concrete blocks with the routines that virtually apply to it.
// A materialized instance (block with routine_id) overrides its routine for that
// date, so moving or completing "today's yoga" never edits the routine itself.
export function dayEntries(date, blocks, routines) {
  const real = blocks
    .filter(b => String(b.plan_date).slice(0, 10) === date && b.status !== 'dismissed')
    .map(b => ({ ...b, virtual: false }))
  const covered = new Set(real.filter(b => b.routine_id).map(b => b.routine_id))
  const wd = weekdayIndex(date)
  const virtual = routines
    .filter(r => r.active && (r.days || []).includes(wd) && !covered.has(r.id))
    .map(r => ({
      id: `virtual-${r.id}-${date}`,
      virtual: true,
      routine_id: r.id,
      title: r.title,
      category: r.category,
      start_min: r.start_min,
      duration_min: r.duration_min,
      status: 'active',
      source: 'routine'
    }))
  return [...real, ...virtual].sort((a, b) => a.start_min - b.start_min || String(a.title).localeCompare(String(b.title)))
}
