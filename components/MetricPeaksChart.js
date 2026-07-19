import { useState } from 'react'

// A row of triangular "peaks" on a shared axis — one per metric, height = value.
// Chosen over the earlier streamgraph because these are 9 unrelated snapshot
// counts, not a time series or a stack that sums to a whole: a plain magnitude
// comparison (bar-chart job) reads more honestly than anything stacked/flowing.
// Knowledge assets is the sum of the five PARA counts, so it's colored neutral
// (not a categorical hue) to mark it as a derived total rather than a peer bucket.
const METRICS = [
  { key: 'inbox', label: 'Inbox', varName: '--stream-blue', get: s => s.para.inbox },
  { key: 'project', label: 'Projects', varName: '--stream-green', get: s => s.para.project },
  { key: 'area', label: 'Areas', varName: '--stream-magenta', get: s => s.para.area },
  { key: 'resource', label: 'Resources', varName: '--stream-yellow', get: s => s.para.resource },
  { key: 'archive', label: 'Archives', varName: '--stream-aqua', get: s => s.para.archive },
  { key: 'knowledge', label: 'Knowledge assets', varName: '--mist-400', get: s => s.totalNotes, sub: () => 'total captures' },
  { key: 'distilled', label: 'Distilled', varName: '--stream-orange', get: s => s.distilled, sub: () => 'refined to their essence' },
  { key: 'connections', label: 'Connections', varName: '--stream-violet', get: s => s.links, sub: s => `${s.packets} packets saved` },
  { key: 'tasks', label: 'Open tasks', varName: '--stream-red', get: s => s.tasksOpen, sub: s => `${s.tasksDone} completed` }
]

const VIEW_W = 960
const VIEW_H = 360
const PLOT_LEFT = 46
const PLOT_RIGHT = VIEW_W - 16
const PLOT_TOP = 26
const PLOT_BOTTOM = VIEW_H - 56

function niceScale(max) {
  if (max <= 0) return { niceMax: 5, step: 1 }
  const rough = max / 5
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm = rough / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  return { niceMax: Math.ceil(max / step) * step, step }
}

export default function MetricPeaksChart({ stats }) {
  const [hovered, setHovered] = useState(null)

  if (!stats) return null

  const metrics = METRICS.map(m => ({ ...m, value: m.get(stats), sub: m.sub ? m.sub(stats) : null }))
  const { niceMax, step } = niceScale(Math.max(...metrics.map(m => m.value)))

  const plotWidth = PLOT_RIGHT - PLOT_LEFT
  const plotHeight = PLOT_BOTTOM - PLOT_TOP
  const slotWidth = plotWidth / metrics.length
  const halfBase = slotWidth * 0.34

  const ticks = []
  for (let v = 0; v <= niceMax; v += step) ticks.push(v)

  const hoveredInfo = metrics.find(m => m.key === hovered) || null

  return (
    <div className="card mb-10 p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <p className="label">Your second brain, at a glance</p>
        <p className="min-h-[1.25rem] text-xs text-mist-400">
          {hoveredInfo
            ? <>
                <strong className="text-mist-100">{hoveredInfo.label}</strong> · {hoveredInfo.value}
                {hoveredInfo.sub ? <> — {hoveredInfo.sub}</> : null}
              </>
            : 'Hover or focus a peak for details'}
        </p>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" style={{ height: 'auto' }} role="img" aria-label="Peak chart of second-brain stats">
        {ticks.map(v => {
          const y = PLOT_BOTTOM - (v / niceMax) * plotHeight
          return (
            <g key={v}>
              <line x1={PLOT_LEFT} y1={y} x2={PLOT_RIGHT} y2={y} stroke="rgb(var(--ink-700))" strokeWidth="1" />
              <text x={PLOT_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="rgb(var(--mist-500))">
                {v}
              </text>
            </g>
          )
        })}

        {metrics.map((m, i) => {
          const cx = PLOT_LEFT + slotWidth * (i + 0.5)
          const peakY = PLOT_BOTTOM - (m.value / niceMax) * plotHeight
          const isDim = hovered && hovered !== m.key
          const labelLines = m.label.split(' ')
          return (
            <g key={m.key}>
              <polygon
                points={`${(cx - halfBase).toFixed(1)},${PLOT_BOTTOM} ${cx.toFixed(1)},${peakY.toFixed(1)} ${(cx + halfBase).toFixed(1)},${PLOT_BOTTOM}`}
                fill={`rgb(var(${m.varName}))`}
                fillOpacity={isDim ? 0.4 : 1}
                stroke="rgb(var(--ink-950))"
                strokeWidth="1.5"
                strokeLinejoin="round"
                style={{ cursor: 'pointer', transition: 'fill-opacity 150ms ease' }}
                tabIndex={0}
                role="button"
                aria-label={`${m.label}: ${m.value}${m.sub ? ', ' + m.sub : ''}`}
                onMouseEnter={() => setHovered(m.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(m.key)}
                onBlur={() => setHovered(null)}
              />
              <text x={cx} y={peakY - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="rgb(var(--mist-100))" pointerEvents="none">
                {m.value}
              </text>
              <text x={cx} y={PLOT_BOTTOM + 16} textAnchor="middle" fontSize="10" fill="rgb(var(--mist-400))" pointerEvents="none">
                {labelLines.map((line, li) => (
                  <tspan key={li} x={cx} dy={li === 0 ? 0 : 11}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}

        <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM} stroke="rgb(var(--ink-600))" strokeWidth="1" />
      </svg>
    </div>
  )
}
