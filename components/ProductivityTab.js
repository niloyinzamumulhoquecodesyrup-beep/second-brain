import { useEffect, useMemo, useRef, useState } from 'react'
import RoutinePlanner from './RoutinePlanner'
import { ymdToDate, toYMD, addDays, weekdayIndex, dayEntries } from '../lib/plannerDay'

// Productivity support tab: a day/week planner co-authored by the refresh cycle.
// The cycle writes questions + suggestions (planner_prompts, planner_blocks with
// status='suggested'); nothing it proposes becomes real until the user taps it —
// same contract as para_fun_queue. Day entries are direct-manipulation bars on a
// gantt track: drag to move, pull the end handles to resize, drag on the empty
// lane to sketch a new block. Times snap to 15 minutes.

const CATEGORY_COLORS = {
  sleep: '#8fb8f2',
  work: '#5eead4',
  study: '#b7a6f7',
  exercise: '#6ee796',
  meals: '#f0d9a3',
  leisure: '#fb7185',
  other: '#9aa4ae'
}
const CATEGORIES = Object.keys(CATEGORY_COLORS)
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Display window for the day gantt: 05:00 -> 24:00. Blocks that cross midnight
// (sleep) render clipped at the right edge with a → marker; the pie still counts
// their full duration against the day they belong to.
const DAY_START = 5 * 60
const DAY_END = 24 * 60
const DAY_SPAN = DAY_END - DAY_START
const SNAP = 15

function mondayOf(ymd) {
  return addDays(ymd, -weekdayIndex(ymd))
}
function daysBetween(a, b) {
  return Math.round((ymdToDate(b) - ymdToDate(a)) / 86400000)
}
function fmtRoutineDays(days) {
  if (!Array.isArray(days) || days.length === 0) return ''
  if (days.length === 7) return 'daily'
  return days.map(d => DAY_LABELS[d]).join(' + ')
}
function fmtTime(min) {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
function fmtDayTitle(ymd) {
  return ymdToDate(ymd).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}
function fmtHours(min) {
  const h = min / 60
  return `${Math.round(h * 10) / 10}h`
}
function snap(min) {
  return Math.round(min / SNAP) * SNAP
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function pieSlices(entries, totalMin) {
  const byCat = {}
  let sum = 0
  for (const e of entries) {
    if (e.status !== 'active' && e.status !== 'done') continue
    const dur = Math.min(e.duration_min, totalMin - sum)
    if (dur <= 0) continue
    byCat[e.category] = (byCat[e.category] || 0) + e.duration_min
    sum += e.duration_min
  }
  const slices = CATEGORIES.filter(c => byCat[c] > 0).map(c => ({ category: c, minutes: byCat[c], color: CATEGORY_COLORS[c] }))
  const planned = slices.reduce((a, s) => a + s.minutes, 0)
  if (planned < totalMin) slices.push({ category: 'unplanned', minutes: totalMin - planned, color: '#22272c' })
  return slices
}

function arcPath(cx, cy, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0 = cx + r * Math.sin(a0)
  const y0 = cy - r * Math.cos(a0)
  const x1 = cx + r * Math.sin(a1)
  const y1 = cy - r * Math.cos(a1)
  return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`
}

function TimePie({ slices, totalMin, title }) {
  const total = slices.reduce((a, s) => a + s.minutes, 0) || 1
  let angle = 0
  const paths = slices.map((s, i) => {
    const a0 = angle
    const sweep = Math.min((s.minutes / total) * Math.PI * 2, Math.PI * 2 - 0.0001)
    angle += sweep
    return <path key={i} d={arcPath(80, 80, 72, a0, a0 + sweep)} fill={s.color} stroke="#0a0c0e" strokeWidth="1.5" />
  })
  return (
    <div className="card p-5">
      <p className="label mb-3">{title}</p>
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 160 160" className="h-32 w-32 shrink-0" role="img" aria-label={title}>
          {slices.length === 1 ? <circle cx="80" cy="80" r="72" fill={slices[0].color} /> : paths}
        </svg>
        <ul className="grid flex-1 grid-cols-1 gap-1 text-[13px] sm:grid-cols-2">
          {slices.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-mist-300">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color, border: s.category === 'unplanned' ? '1px solid #2c3238' : 'none' }} />
              <span className="capitalize">{s.category}</span>
              <span className="ml-auto text-mist-400">{fmtHours(s.minutes)}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-mist-400">{fmtHours(totalMin)} total — pick another day to redraw</p>
    </div>
  )
}

// Sky clock: a neon digital clock under a parabolic sky arc. The dot rides the arc as
// the sun during daylight and as the moon after sunset. Without location it assumes a
// 06:00/18:30 horizon; enabling location (stored only in this browser's localStorage,
// rounded to ~100m) fetches real sunrise/sunset plus temperature/humidity from the
// keyless open-meteo.com API.
const DEFAULT_SUN = { sunrise: 6 * 60, sunset: 18 * 60 + 30, real: false }

// Reasons geolocation can fail without ever showing the browser's permission prompt:
// the origin already has location blocked (no re-prompt), the OS has location services
// off entirely, or an embedded/sandboxed viewer blocks the API by policy. Surfacing the
// real cause (and offering a retry) beats one flat dead-end message for all of them.
const GEO_ERROR_MESSAGES = {
  unsupported: "this browser doesn't support location.",
  1: 'location is blocked for this site — allow it in your browser\'s site settings, then retry.',
  2: "your device couldn't determine a location just now.",
  3: 'location request timed out.',
  weather: "reached your location, but the weather lookup failed."
}

function SkyClock() {
  const [now, setNow] = useState(null) // null until mounted — avoids SSR/client mismatch
  const [weather, setWeather] = useState(null)
  const [sunTimes, setSunTimes] = useState(DEFAULT_SUN)
  const [geoState, setGeoState] = useState('idle') // idle | loading | on | error
  const [geoError, setGeoError] = useState(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  function loadWeather(lat, lon) {
    setGeoState('loading')
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m&daily=sunrise,sunset&timezone=auto`)
      .then(r => r.json())
      .then(d => {
        const toMin = iso => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16))
        setWeather({ temp: Math.round(d.current.temperature_2m), humidity: Math.round(d.current.relative_humidity_2m) })
        setSunTimes({ sunrise: toMin(d.daily.sunrise[0]), sunset: toMin(d.daily.sunset[0]), real: true })
        setGeoState('on')
      })
      .catch(() => { setGeoState('error'); setGeoError('weather') })
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('planner_coords')
      if (saved) {
        const { lat, lon } = JSON.parse(saved)
        loadWeather(lat, lon)
      }
    } catch { /* stale/corrupt saved coords just mean starting from the idle state */ }
  }, [])

  function enableLocation() {
    if (!navigator.geolocation) {
      setGeoState('error')
      setGeoError('unsupported')
      return
    }
    setGeoState('loading')
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Number(pos.coords.latitude.toFixed(3))
        const lon = Number(pos.coords.longitude.toFixed(3))
        try { localStorage.setItem('planner_coords', JSON.stringify({ lat, lon })) } catch { /* private mode */ }
        loadWeather(lat, lon)
      },
      err => {
        setGeoState('error')
        setGeoError(err && err.code)
      },
      { timeout: 10000 }
    )
  }

  if (!now) return <div className="card p-6" style={{ minHeight: 220 }} />

  const h24 = now.getHours()
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const clockText = `${String(h12).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${ampm}`

  const nowM = h24 * 60 + now.getMinutes() + now.getSeconds() / 60
  const { sunrise, sunset } = sunTimes
  const isDay = nowM >= sunrise && nowM <= sunset
  let frac
  if (isDay) {
    frac = (nowM - sunrise) / (sunset - sunrise)
  } else {
    const nightLen = 1440 - sunset + sunrise
    const sinceSet = nowM > sunset ? nowM - sunset : nowM + 1440 - sunset
    frac = sinceSet / nightLen
  }
  const t = clamp(frac, 0, 1)
  // point along the quadratic bezier M 30 100 Q 200 -40 370 100
  const bx = (1 - t) * (1 - t) * 30 + 2 * t * (1 - t) * 200 + t * t * 370
  const by = (1 - t) * (1 - t) * 100 + 2 * t * (1 - t) * -40 + t * t * 100

  return (
    <div className="card relative overflow-hidden p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="label">Right now</p>
        <div className="text-right text-sm text-mist-300">
          {weather ? (
            <span>{weather.temp}°C · {weather.humidity}% humidity</span>
          ) : geoState === 'loading' ? (
            <span className="text-mist-400">finding your sky…</span>
          ) : geoState === 'error' ? (
            <span className="flex items-center gap-2">
              <span className="text-mist-400">{GEO_ERROR_MESSAGES[geoError] || 'location unavailable.'}</span>
              <button onClick={enableLocation} className="text-emerald-300 underline decoration-dotted hover:text-emerald-200">retry</button>
            </span>
          ) : (
            <button onClick={enableLocation} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">
              enable location for weather
            </button>
          )}
        </div>
      </div>

      <svg viewBox="0 0 400 118" className="mx-auto -mb-2 mt-1 block w-full max-w-lg" role="img" aria-label={isDay ? 'sun position across the day' : 'moon position across the night'}>
        <path d="M 30 100 Q 200 -40 370 100" fill="none" stroke="#2c3238" strokeWidth="1.5" strokeDasharray="4 5" />
        <line x1="12" y1="100" x2="388" y2="100" stroke="#22272c" strokeWidth="1.5" />
        {isDay ? (
          <g>
            <circle cx={bx} cy={by} r="13" fill="#f0c878" opacity="0.25" />
            <circle cx={bx} cy={by} r="8" fill="#f0c878" />
          </g>
        ) : (
          <g>
            <circle cx={bx} cy={by} r="11" fill="#cdd6e0" opacity="0.18" />
            <circle cx={bx} cy={by} r="8" fill="#cdd6e0" />
            <circle cx={bx + 4} cy={by - 3} r="7" fill="#111417" />
          </g>
        )}
        <text x="30" y="114" textAnchor="middle" style={{ fontSize: 10 }} fill="#8a929b">
          {isDay ? `↑ ${fmtTime(sunrise)}` : `↓ ${fmtTime(sunset)}`}
        </text>
        <text x="370" y="114" textAnchor="middle" style={{ fontSize: 10 }} fill="#8a929b">
          {isDay ? `↓ ${fmtTime(sunset)}` : `↑ ${fmtTime(sunrise)}`}
        </text>
      </svg>

      <div
        className="mx-auto w-fit rounded-2xl p-[3px]"
        style={{
          background: 'linear-gradient(90deg, #5eead4, #f0d9a3, #fb7185, #b7a6f7, #60bef9)',
          boxShadow: '0 0 28px rgba(94,234,212,0.3), 0 0 36px rgba(251,113,133,0.22), 0 0 44px rgba(183,166,247,0.18)'
        }}
      >
        <div className="rounded-[13px] bg-black px-8 py-3">
          <span
            className="whitespace-nowrap font-mono text-3xl font-semibold tabular-nums sm:text-4xl"
            style={{
              background: 'linear-gradient(90deg, #f0d9a3, #fb7185, #b7a6f7)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent'
            }}
          >
            {clockText}
          </span>
        </div>
      </div>
      {!sunTimes.real && geoState === 'error' && (
        <p className="mt-3 text-center text-[11px] text-mist-400/70">horizon assumed 06:00 – 18:30</p>
      )}
    </div>
  )
}

// One cycle-authored question, answered by tapping an option or writing your own.
function PromptCard({ prompt, onRespond, busy }) {
  const [custom, setCustom] = useState('')
  const options = Array.isArray(prompt.options) ? prompt.options : []
  return (
    <div className="card mb-6 border-t-2 border-violet-400/40 p-6">
      <p className="label mb-2 !text-violet-400">From your last mind cycle</p>
      <h3 className="mb-4 font-serif text-xl font-light text-mist-100">{prompt.question_text}</h3>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((opt, i) => (
          <button key={i} disabled={busy} onClick={() => onRespond(prompt.id, { action: 'answer', value: opt })} className="chip hover:border-violet-400/60 hover:text-violet-300">
            {opt}
          </button>
        ))}
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onRespond(prompt.id, { action: 'answer', value: custom.trim() }) }}
          placeholder="write my own…"
          className="rounded-full border border-ink-600 bg-ink-900 px-4 py-1.5 text-sm text-mist-200 placeholder-mist-400/50 focus:border-violet-400/60 focus:outline-none"
        />
        <button disabled={busy} onClick={() => onRespond(prompt.id, { action: 'dismiss' })} className="ml-auto text-sm text-mist-400 transition hover:text-mist-200">
          dismiss
        </button>
      </div>
    </div>
  )
}

// The draggable day gantt. All pointer math lives here: px -> minutes through the
// track's bounding box, snapped to 15min. A drag on a virtual (routine) entry or a
// 'suggested' block commits through onCommit, which materializes/accepts it.
function DayGantt({ date, entries, nowMin, selectedId, onSelect, onCommit, onDraft }) {
  const trackRef = useRef(null)
  const [drag, setDrag] = useState(null) // { id, mode, start_min, duration_min, moved }
  const dragRef = useRef(null)

  function pxToMin(dx) {
    const w = trackRef.current ? trackRef.current.getBoundingClientRect().width : 1
    return (dx / w) * DAY_SPAN
  }

  function beginDrag(e, entry, mode) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const orig = { start: entry.start_min, dur: entry.duration_min }
    const state = { id: entry.id, mode, start_min: orig.start, duration_min: orig.dur, moved: false }
    dragRef.current = state
    setDrag({ ...state })

    function onMove(ev) {
      const dmin = pxToMin(ev.clientX - startX)
      const s = dragRef.current
      if (Math.abs(ev.clientX - startX) > 3) s.moved = true
      if (mode === 'move') {
        s.start_min = clamp(snap(orig.start + dmin), 0, 1440 - SNAP)
      } else if (mode === 'resize-r') {
        s.duration_min = clamp(snap(orig.dur + dmin), SNAP, 1440)
      } else if (mode === 'resize-l') {
        const newStart = clamp(snap(orig.start + dmin), 0, orig.start + orig.dur - SNAP)
        s.duration_min = orig.dur + (orig.start - newStart)
        s.start_min = newStart
      }
      setDrag({ ...s })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const s = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (s.moved) {
        onCommit(entry, { start_min: s.start_min, duration_min: s.duration_min })
      } else {
        onSelect(selectedId === entry.id ? null : entry.id)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Sketch a new block by dragging across the create lane.
  function beginCreate(e) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const at = snap(DAY_START + ((e.clientX - rect.left) / rect.width) * DAY_SPAN)
    const state = { id: '__draft', mode: 'create', start_min: at, duration_min: SNAP, moved: false }
    dragRef.current = state
    setDrag({ ...state })
    const startX = e.clientX

    function onMove(ev) {
      const s = dragRef.current
      const dmin = pxToMin(ev.clientX - startX)
      s.moved = true
      if (dmin >= 0) {
        s.duration_min = clamp(snap(SNAP + dmin), SNAP, DAY_END - s.start_min)
      } else {
        const newStart = clamp(snap(at + dmin), DAY_START, at)
        s.start_min = newStart
        s.duration_min = at + SNAP - newStart
      }
      setDrag({ ...s })
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const s = dragRef.current
      dragRef.current = null
      setDrag(null)
      onDraft({ start_min: s.start_min, duration_min: Math.max(s.duration_min, 30) })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const hourMarks = []
  for (let h = 6; h <= 23; h += 2) hourMarks.push(h)

  return (
    <div className="overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
      <div className="flex border-b border-ink-700 bg-ink-950">
        <div className="relative h-7 flex-1" style={{ marginLeft: 0 }}>
          {hourMarks.map(h => (
            <span key={h} className="absolute top-1.5 -translate-x-1/2 text-[11px] text-mist-400" style={{ left: `${((h * 60 - DAY_START) / DAY_SPAN) * 100}%` }}>
              {h <= 12 ? `${h}${h === 12 ? 'pm' : 'am'}` : `${h - 12}pm`}
            </span>
          ))}
        </div>
      </div>

      <div className="relative select-none py-1" ref={trackRef}>
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `repeating-linear-gradient(to right, #181c20 0 1px, transparent 1px calc(100% / ${DAY_SPAN / 60}))` }}
        />
        {nowMin !== null && nowMin >= DAY_START && nowMin < DAY_END && (
          <>
            <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-emerald-400" style={{ left: `${((nowMin - DAY_START) / DAY_SPAN) * 100}%` }} />
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-b bg-emerald-400 px-1.5 text-[10px] font-semibold text-ink-950" style={{ left: `${((nowMin - DAY_START) / DAY_SPAN) * 100}%` }}>
              {fmtTime(nowMin)}
            </div>
          </>
        )}

        {entries.length === 0 && (
          <p className="relative z-10 px-4 py-6 text-sm text-mist-400">
            Nothing planned for {fmtDayTitle(date)} yet — add a routine below, or sketch a block on the lane underneath.
          </p>
        )}

        {entries.map(entry => {
          const live = drag && drag.id === entry.id ? drag : null
          const start = live ? live.start_min : entry.start_min
          const dur = live ? live.duration_min : entry.duration_min
          const end = start + dur
          const clippedEnd = Math.min(end, DAY_END)
          const left = ((Math.max(start, DAY_START) - DAY_START) / DAY_SPAN) * 100
          const width = Math.max(((clippedEnd - Math.max(start, DAY_START)) / DAY_SPAN) * 100, 1.2)
          const color = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.other
          const suggested = entry.status === 'suggested'
          const done = entry.status === 'done'
          const skipped = entry.status === 'skipped'
          const selected = selectedId === entry.id
          const crossesMidnight = end > DAY_END
          const showInside = width > 12

          return (
            <div key={entry.id} className="relative h-10">
              <div
                onPointerDown={e => beginDrag(e, entry, 'move')}
                className="absolute top-1.5 z-20 flex h-7 cursor-grab items-center overflow-visible active:cursor-grabbing"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  borderRadius: crossesMidnight ? '999px 4px 4px 999px' : '999px',
                  background: suggested ? 'transparent' : color,
                  border: suggested ? `1.5px dashed ${color}` : 'none',
                  opacity: done ? 0.45 : skipped ? 0.3 : 1,
                  outline: selected ? `2px solid ${color}` : 'none',
                  outlineOffset: '2px',
                  touchAction: 'none'
                }}
                title={`${entry.title} · ${fmtTime(start)}–${fmtTime(end)}${suggested ? ' · suggested' : ''}`}
              >
                <span
                  className={`w-full truncate px-2.5 text-[12px] font-medium ${skipped ? 'line-through' : ''}`}
                  style={{ color: suggested ? color : '#0a0c0e', display: showInside ? 'block' : 'none' }}
                >
                  {done ? '✓ ' : ''}{entry.title}
                </span>
                {crossesMidnight && <span className="pr-1 text-[10px]" style={{ color: suggested ? color : '#0a0c0e' }}>→</span>}
                {selected && !suggested && (
                  <>
                    <span onPointerDown={e => beginDrag(e, entry, 'resize-l')} className="absolute -left-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 bg-mist-100" style={{ borderColor: color }} />
                    {!crossesMidnight && (
                      <span onPointerDown={e => beginDrag(e, entry, 'resize-r')} className="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-ew-resize rounded-full border-2 bg-mist-100" style={{ borderColor: color }} />
                    )}
                  </>
                )}
              </div>
              {!showInside && (
                <span className="pointer-events-none absolute top-2.5 z-10 whitespace-nowrap text-[11px] text-mist-400" style={{ left: `calc(${Math.min(left + width, 94)}% + 8px)` }}>
                  {entry.title}
                </span>
              )}
              {live && live.moved && (
                <span className="pointer-events-none absolute -top-0.5 z-30 whitespace-nowrap rounded bg-ink-950 px-1.5 text-[11px] text-emerald-300" style={{ left: `${left}%` }}>
                  {fmtTime(start)} – {fmtTime(end)}
                </span>
              )}
            </div>
          )
        })}

        <div
          onPointerDown={beginCreate}
          className="relative mx-0 h-9 cursor-crosshair"
          style={{ touchAction: 'none' }}
          title="Drag across this lane to sketch a new block"
        >
          {drag && drag.mode === 'create' ? (
            <div
              className="absolute top-1.5 h-6 rounded-lg border-2 border-dashed border-emerald-400/70"
              style={{
                left: `${((drag.start_min - DAY_START) / DAY_SPAN) * 100}%`,
                width: `${(drag.duration_min / DAY_SPAN) * 100}%`
              }}
            />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-[11px] text-mist-400/60">+ drag across this lane to sketch a new block</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProductivityTab() {
  const today = toYMD(new Date())
  const [selectedDate, setSelectedDate] = useState(today)
  const [blocks, setBlocks] = useState([])
  const [routines, setRoutines] = useState([])
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null) // { start_min, duration_min } from drag-create
  const [draftTitle, setDraftTitle] = useState('')
  const [draftCategory, setDraftCategory] = useState('other')
  const [renaming, setRenaming] = useState(false)
  const [renameText, setRenameText] = useState('')
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })

  const weekStart = mondayOf(selectedDate)
  // Suggestions (a swim session "next Tuesday", a study block three weeks out) can
  // land well past the week currently on screen. Fetch a window that always covers
  // both the viewed week and a rolling 21-day horizon from today, so the "Suggested
  // for you" list below never misses one just because it's not the visible week.
  const todayMonday = mondayOf(today)
  const fetchFrom = weekStart < todayMonday ? weekStart : todayMonday
  const weekEnd = addDays(weekStart, 7)
  const horizonEnd = addDays(today, 22)
  const fetchUntil = weekEnd > horizonEnd ? weekEnd : horizonEnd
  const fetchDays = Math.min(31, Math.max(7, daysBetween(fetchFrom, fetchUntil)))

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }, 60000)
    return () => clearInterval(t)
  }, [])

  function load(silent) {
    if (!silent) setLoading(true)
    return fetch(`/api/planner?from=${fetchFrom}&days=${fetchDays}`)
      .then(r => r.json())
      .then(d => {
        setBlocks(d.blocks || [])
        setRoutines(d.routines || [])
        setPrompts(d.prompts || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => dayEntries(selectedDate, blocks, routines), [selectedDate, blocks, routines])
  const selectedEntry = entries.find(e => e.id === selectedId) || null
  const actionable = entries.filter(e => e.status === 'active' || e.status === 'done')
  const doneCount = entries.filter(e => e.status === 'done').length

  const daySlices = useMemo(() => pieSlices(entries, 1440), [entries])
  const weekSlices = useMemo(() => {
    const all = []
    for (let i = 0; i < 7; i++) all.push(...dayEntries(addDays(weekStart, i), blocks, routines))
    return pieSlices(all, 7 * 1440)
  }, [weekStart, blocks, routines])

  const questionPrompts = prompts.filter(p => p.prompt_type === 'question')
  const routineSuggestions = prompts.filter(p => p.prompt_type === 'routine_suggestion')

  // Every cycle-suggested one-off block across the whole fetched window, not just
  // whichever day happens to be selected — this is what makes "swim next Tuesday"
  // visible today instead of only when you happen to click over to that date.
  const suggestedBlocks = useMemo(
    () => blocks
      .filter(b => b.status === 'suggested')
      .sort((a, b) => (a.plan_date === b.plan_date ? a.start_min - b.start_min : (a.plan_date < b.plan_date ? -1 : 1))),
    [blocks]
  )

  function fmtSuggestionWhen(planDate, startMin) {
    const dateStr = String(planDate).slice(0, 10)
    const label = dateStr === today ? 'today' : dateStr === addDays(today, 1) ? 'tomorrow' : fmtDayTitle(dateStr)
    return `${label}, ${fmtTime(startMin)}`
  }

  async function api(path, method, body) {
    setBusy(true)
    try {
      const res = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })
      return res
    } finally {
      setBusy(false)
    }
  }

  // A drag commit: real blocks PATCH in place (a dragged suggestion is thereby
  // accepted); virtual routine instances materialize as a block for this date.
  async function commitEntry(entry, { start_min, duration_min }) {
    setSelectedId(null)
    if (entry.virtual) {
      await api('/api/planner', 'POST', {
        title: entry.title, category: entry.category, plan_date: selectedDate,
        start_min, duration_min, routine_id: entry.routine_id
      })
    } else {
      const patch = { start_min, duration_min }
      if (entry.status === 'suggested') patch.status = 'active'
      await api(`/api/planner/${entry.id}`, 'PATCH', patch)
    }
    load(true)
  }

  async function setEntryStatus(entry, status) {
    setSelectedId(null)
    if (entry.virtual) {
      await api('/api/planner', 'POST', {
        title: entry.title, category: entry.category, plan_date: selectedDate,
        start_min: entry.start_min, duration_min: entry.duration_min,
        routine_id: entry.routine_id, status
      })
    } else {
      await api(`/api/planner/${entry.id}`, 'PATCH', { status })
    }
    load(true)
  }

  async function deleteEntry(entry) {
    setSelectedId(null)
    await api(`/api/planner/${entry.id}`, 'DELETE')
    load(true)
  }

  async function renameEntry(entry) {
    if (!renameText.trim()) return
    setRenaming(false)
    setSelectedId(null)
    await api(`/api/planner/${entry.id}`, 'PATCH', { title: renameText.trim() })
    load(true)
  }

  async function createDraft() {
    if (!draftTitle.trim() || !draft) return
    const d = draft
    setDraft(null)
    setDraftTitle('')
    await api('/api/planner', 'POST', {
      title: draftTitle.trim(), category: draftCategory, plan_date: selectedDate,
      start_min: d.start_min, duration_min: d.duration_min
    })
    load(true)
  }

  async function respondPrompt(id, payload) {
    setPrompts(prev => prev.filter(p => p.id !== id))
    const res = await api(`/api/planner/prompts/${id}`, 'POST', payload)
    if (!res.ok) load(true)
    else load(true)
  }

  // Accept/dismiss for a suggested one-off block regardless of which day is
  // currently selected — always a real (non-virtual) row, so no materialize branch.
  async function acceptSuggestedBlock(block) {
    await api(`/api/planner/${block.id}`, 'PATCH', { status: 'active' })
    load(true)
  }
  async function dismissSuggestedBlock(block) {
    await api(`/api/planner/${block.id}`, 'PATCH', { status: 'dismissed' })
    load(true)
  }

  if (loading) return <p className="text-mist-400">Loading your planner…</p>

  const dayChips = [
    { date: today, label: 'Today' },
    { date: addDays(today, 1), label: 'Tomorrow' }
  ]

  return (
    <div className="space-y-8">
      <SkyClock />

      {questionPrompts.map(p => (
        <PromptCard key={p.id} prompt={p} onRespond={respondPrompt} busy={busy} />
      ))}

      {/* ---- Suggested for you ---- */}
      {(suggestedBlocks.length > 0 || routineSuggestions.length > 0) && (
        <section>
          <h2 className="mb-1 font-serif text-2xl font-light text-mist-100">Suggested for you</h2>
          <p className="mb-3 text-sm text-mist-400">Pulled from your notes, tasks, and packets — nothing here is on your plan until you add it.</p>
          <div className="space-y-2">
            {suggestedBlocks.map(b => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/30 bg-ink-900 px-4 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[b.category] }} />
                <span className="text-mist-100">{b.title}</span>
                <button
                  onClick={() => { setSelectedDate(String(b.plan_date).slice(0, 10)); setSelectedId(null) }}
                  className="text-mist-400 underline decoration-dotted underline-offset-2 hover:text-mist-200"
                  title="jump to this day"
                >
                  {fmtSuggestionWhen(b.plan_date, b.start_min)}
                </button>
                {(b.source_refs || [])[0]?.name && (
                  <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-[10px] text-violet-400">{b.source_refs[0].name}</span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button disabled={busy} onClick={() => acceptSuggestedBlock(b)} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">✓ add</button>
                  <button disabled={busy} onClick={() => dismissSuggestedBlock(b)} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">✕ dismiss</button>
                </span>
              </div>
            ))}
            {routineSuggestions.map(p => {
              const s = p.suggestion || {}
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-400/30 bg-ink-900 px-4 py-2.5 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLORS[s.category] || CATEGORY_COLORS.other }} />
                  <span className="text-mist-100">{s.title}</span>
                  <span className="text-mist-400">{fmtRoutineDays(s.days)}, {fmtTime(s.start_min)}</span>
                  <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-[10px] text-violet-400">recurring</span>
                  <span className="ml-auto flex items-center gap-2">
                    <button disabled={busy} onClick={() => respondPrompt(p.id, { action: 'accept' })} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">✓ add</button>
                    <button disabled={busy} onClick={() => respondPrompt(p.id, { action: 'dismiss' })} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">✕ dismiss</button>
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- Your day ---- */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-serif text-2xl font-light text-mist-100">Your day</h2>
            <span className="text-sm text-mist-400">{fmtDayTitle(selectedDate)}</span>
            {actionable.length > 0 && (
              <span className="text-xs text-emerald-300">{doneCount} of {actionable.length} done</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dayChips.map(c => (
              <button key={c.date} onClick={() => { setSelectedDate(c.date); setSelectedId(null) }} className={`chip ${selectedDate === c.date ? 'border-emerald-400/50 text-emerald-300' : ''}`}>
                {c.label}
              </button>
            ))}
            <input
              type="date"
              value={selectedDate}
              onChange={e => { if (e.target.value) { setSelectedDate(e.target.value); setSelectedId(null) } }}
              className="rounded-full border border-ink-600 bg-ink-900 px-3 py-1 text-sm text-mist-300 focus:border-emerald-400/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <DayGantt
              date={selectedDate}
              entries={entries}
              nowMin={selectedDate === today ? nowMin : null}
              selectedId={selectedId}
              onSelect={id => { setSelectedId(id); setRenaming(false) }}
              onCommit={commitEntry}
              onDraft={d => { setDraft(d); setDraftTitle(''); setDraftCategory('other') }}
            />

            {selectedEntry && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-ink-600 bg-ink-900 px-4 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[selectedEntry.category] }} />
                {renaming ? (
                  <>
                    <input
                      autoFocus
                      value={renameText}
                      onChange={e => setRenameText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameEntry(selectedEntry) }}
                      className="rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm text-mist-100 focus:border-emerald-400/60 focus:outline-none"
                    />
                    <button onClick={() => renameEntry(selectedEntry)} className="text-emerald-300 hover:brightness-125">save</button>
                    <button onClick={() => setRenaming(false)} className="text-mist-400 hover:text-mist-200">cancel</button>
                  </>
                ) : (
                  <>
                    <span className="text-mist-100">{selectedEntry.title}</span>
                    <span className="text-mist-400">{fmtTime(selectedEntry.start_min)} – {fmtTime(selectedEntry.start_min + selectedEntry.duration_min)}</span>
                    {selectedEntry.status === 'suggested' && (
                      <span className="rounded border border-violet-400/50 px-1.5 py-0.5 text-[10px] text-violet-400">
                        suggested{(selectedEntry.source_refs || [])[0]?.name ? ` · ${selectedEntry.source_refs[0].name}` : ''}
                      </span>
                    )}
                  </>
                )}
                <span className="mx-1 flex-1" />
                {selectedEntry.status === 'suggested' ? (
                  <>
                    <button disabled={busy} onClick={() => setEntryStatus(selectedEntry, 'active')} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">✓ add to my day</button>
                    <button disabled={busy} onClick={() => setEntryStatus(selectedEntry, 'dismissed')} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">✕ dismiss</button>
                  </>
                ) : (
                  <>
                    {selectedEntry.status !== 'done' && (
                      <button disabled={busy} onClick={() => setEntryStatus(selectedEntry, 'done')} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">✓ done</button>
                    )}
                    {selectedEntry.status === 'done' && (
                      <button disabled={busy} onClick={() => setEntryStatus(selectedEntry, 'active')} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">↩ not done</button>
                    )}
                    {selectedEntry.status === 'active' && (
                      <button disabled={busy} onClick={() => setEntryStatus(selectedEntry, 'skipped')} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">skip today</button>
                    )}
                    {!selectedEntry.virtual && (
                      <>
                        <button disabled={busy} onClick={() => { setRenaming(true); setRenameText(selectedEntry.title) }} className="chip !py-1 hover:border-ink-500 hover:text-mist-200">✎ rename</button>
                        <button disabled={busy} onClick={() => deleteEntry(selectedEntry)} className="chip !py-1 hover:border-rose-400/60 hover:text-rose-300">delete</button>
                      </>
                    )}
                    {selectedEntry.virtual && (
                      <span className="text-[11px] text-mist-400">from your routine — edit it in the routine planner below</span>
                    )}
                  </>
                )}
              </div>
            )}

            {draft && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/40 bg-ink-900 px-4 py-2.5 text-sm">
                <span className="text-mist-400">{fmtTime(draft.start_min)} – {fmtTime(draft.start_min + draft.duration_min)}</span>
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createDraft() }}
                  placeholder="what's this block?"
                  className="min-w-[160px] flex-1 rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm text-mist-100 placeholder-mist-400/50 focus:border-emerald-400/60 focus:outline-none"
                />
                <select value={draftCategory} onChange={e => setDraftCategory(e.target.value)} className="rounded border border-ink-600 bg-ink-950 px-2 py-1 text-sm capitalize text-mist-300 focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button disabled={busy || !draftTitle.trim()} onClick={createDraft} className="chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300">add</button>
                <button onClick={() => setDraft(null)} className="text-mist-400 hover:text-mist-200">cancel</button>
              </div>
            )}

            <p className="mt-2 text-[11px] text-mist-400">
              drag a bar to move it · pull the round handles to resize · tap for done / skip / rename · dashed bars are cycle suggestions — inert until you add them
            </p>
          </div>

          <TimePie slices={daySlices} totalMin={1440} title={`How ${selectedDate === today ? 'today' : fmtDayTitle(selectedDate)} looks`} />
        </div>
      </section>

      {/* ---- Your week ---- */}
      <section>
        <h2 className="mb-3 font-serif text-2xl font-light text-mist-100">Your week <span className="ml-2 align-middle text-sm text-mist-400">{fmtDayTitle(weekStart)} – {fmtDayTitle(addDays(weekStart, 6))}</span></h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-ink-600 bg-ink-900">
            <div className="flex border-b border-ink-700 bg-ink-950 text-[12px] text-mist-400">
              <div className="w-36 shrink-0 px-3 py-1.5 text-[11px] uppercase tracking-wider">Routine</div>
              {DAY_LABELS.map((d, i) => {
                const dayDate = addDays(weekStart, i)
                return (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(dayDate); setSelectedId(null) }}
                    className={`flex-1 py-1.5 text-center transition hover:text-mist-100 ${dayDate === selectedDate ? 'font-semibold text-emerald-300' : ''}`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-36 right-0" style={{ background: 'repeating-linear-gradient(to right, #181c20 0 1px, transparent 1px calc(100% / 7))' }} />
              {routines.filter(r => r.active).length === 0 && (
                <p className="px-4 py-5 text-sm text-mist-400">No routines yet — build your skeleton in the routine planner below.</p>
              )}
              {routines.filter(r => r.active).map(r => (
                <div key={r.id} className="flex items-center">
                  <div className="w-36 shrink-0 truncate px-3 py-2 text-[13px]" style={{ color: CATEGORY_COLORS[r.category] }}>{r.title}</div>
                  <div className="relative h-8 flex-1">
                    {(r.days || []).map(d => (
                      <div key={d} className="absolute top-2.5 h-3 rounded-full" style={{ left: `calc(${(d / 7) * 100}% + 6px)`, width: 'calc(100% / 7 - 12px)', background: CATEGORY_COLORS[r.category] }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <TimePie slices={weekSlices} totalMin={7 * 1440} title="Week in hours" />
        </div>
      </section>

      <RoutinePlanner onChange={() => load(true)} />
    </div>
  )
}
