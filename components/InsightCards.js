import { useState, useRef, useLayoutEffect } from 'react'
import Link from 'next/link'

// Shared visual vocabulary for mind_insights rows — split out of pages/mind.js so the
// Dashboard (Inferred goals + Field Investigation Report) and the Mind page's Knowledge
// Library shelf can both render the same cards without duplicating the logic.

export const KIND_LABELS = {
  interest_cluster: 'Interest clusters',
  open_loop: 'Reminders',
  attention_pattern: 'Attention patterns',
  dormant_revival: 'Dormant revival',
  inferred_goal: 'Inferred goals',
  user_model: 'How you seem to work',
  recommendation: 'Researched resources'
}

// §4e/§4f: same rose/emerald/violet/gold/mist accent family as lib/paraTheme.js
export const ACCENT_HEX = {
  emerald: '#5eead4',
  violet: '#b7a6f7',
  gold: '#f0d9a3',
  rose: '#fb7185',
  mist: '#9aa4ae'
}

export function SourceRefs({ refs }) {
  if (!refs || refs.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 border-t border-ink-700 pt-2">
      {refs.map((ref, i) => (
        <li key={i} className="text-xs text-mist-400">
          {ref.type === 'note' ? (
            <Link href={`/notes/${ref.id}`} className="hover:text-emerald-300">
              ↳ {ref.title}
            </Link>
          ) : ref.type === 'mind_insight' ? (
            <span>↳ {KIND_LABELS[ref.kind] || ref.kind} insight</span>
          ) : ref.type === 'resource' ? (
            <a href={ref.url} target="_blank" rel="noreferrer" className="hover:text-violet-300">
              ↳ {ref.title}{ref.url ? ' ↗' : ''}
            </a>
          ) : (
            <span>
              ↳ {ref.name || ref.type}
              {ref.total != null ? `: ${ref.followed_through}/${ref.total}` : ref.value != null ? `: ${ref.value}` : ''}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

// Short single-line banner title (no summary text shown until clicked) — first
// sentence of the insight, cut at a word boundary if still too long for the ribbon.
function shortGoalTitle(summary) {
  if (!summary) return 'Inferred goal'
  const firstSentence = (summary.split(/(?<=[.!?])\s/)[0] || summary).replace(/[.!?]+$/, '')
  const MAX = 32
  if (firstSentence.length <= MAX) return firstSentence
  const cut = firstSentence.slice(0, MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 16 ? cut.slice(0, lastSpace) : cut) + '…'
}

// Fixed coordinate space (scaled responsively via the SVG viewBox) for the goal
// arrow/target diagram below — geometry lives here once so every shape agrees.
const GOAL_VW = 1000
const GOAL_ROW_H = 112
const GOAL_BW = 320
const GOAL_BH = 60
const GOAL_TAB_W = 56
const GOAL_GAP = 70
const GOAL_TOP_PAD = 40
const GOAL_HEAD_W = 34
const GOAL_HEAD_H = 26
const GOAL_SHAFT_W = 34
const GOAL_NOTCH = 14
const GOAL_TARGET_R = 48
const GOAL_SPINE_X = GOAL_VW / 2
// The spine/arrowhead/target shapes are always violet (see GOAL_PLATE_COLORS below) —
// reads the CSS variable directly so it tracks the theme's already-contrast-corrected
// violet-400 instead of a hex frozen at the dark-mode value.
const GOAL_VIOLET = 'rgb(var(--violet-400))'

// Each goal plate gets its own color (cycling through the app's existing accent family)
// so distinct goals are visually distinct at a glance, not just by number/title text.
// Violet is excluded here — the fixed spine/arrowhead/target shapes below are always
// violet, so a plate in that same color would be indistinguishable from the structure.
const GOAL_PLATE_COLORS = [ACCENT_HEX.gold, ACCENT_HEX.emerald, ACCENT_HEX.rose, ACCENT_HEX.mist, '#f0a3c4']
function goalPlateColor(i) {
  return GOAL_PLATE_COLORS[i % GOAL_PLATE_COLORS.length]
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

// One ribbon-flag banner: a rectangle plus a triangular-notched number tab on its outer
// edge (mirrored left/right) — the literal shape from the reference infographic, redrawn
// in a per-goal accent color (goalPlateColor) rather than a single fixed violet. Title
// only; no summary text renders here at all.
function GoalRibbon({ goal, num, side, rowCenterY, active, onClick, color }) {
  const rectY = rowCenterY - GOAL_BH / 2
  const innerX = side === 'left' ? GOAL_SPINE_X - GOAL_GAP : GOAL_SPINE_X + GOAL_GAP
  const rectX = side === 'left' ? innerX - GOAL_BW : innerX
  const tabInnerX = side === 'left' ? rectX : rectX + GOAL_BW
  const tabOuterX = side === 'left' ? rectX - GOAL_TAB_W : rectX + GOAL_BW + GOAL_TAB_W
  const notchX = side === 'left' ? tabOuterX + 14 : tabOuterX - 14
  const tabPoints = `${tabInnerX},${rectY} ${notchX},${rectY} ${tabOuterX},${rowCenterY} ${notchX},${rectY + GOAL_BH} ${tabInnerX},${rectY + GOAL_BH}`
  const titleX = side === 'left' ? rectX + 16 : rectX + GOAL_BW - 16
  const tabTextX = (tabInnerX + tabOuterX) / 2
  // Prefer an explicit short name a cycle assigned (metadata.name, e.g. "Neurobiology")
  // over an algorithmically-derived first sentence — a real name reads far better than
  // a truncated "Based on your Project and Area notes..." fragment.
  const title = goal.metadata?.name || shortGoalTitle(goal.summary)

  const rgb = hexToRgb(color)
  return (
    <g onClick={onClick} className="cursor-pointer">
      <rect
        x={rectX} y={rectY} width={GOAL_BW} height={GOAL_BH} rx={10}
        fill={active ? `rgba(${rgb},0.22)` : `rgba(${rgb},0.1)`}
        stroke={color} strokeOpacity={active ? 0.9 : 0.4} strokeWidth={active ? 2 : 1.2}
      />
      <polygon points={tabPoints} fill={color} fillOpacity={active ? 0.95 : 0.7} />
      <text x={tabTextX} y={rowCenterY} textAnchor="middle" dominantBaseline="central" fill="#0b0f14" style={{ fontSize: 20, fontWeight: 700 }}>
        {num}
      </text>
      <text x={titleX} y={rowCenterY} textAnchor={side === 'left' ? 'start' : 'end'} dominantBaseline="central"
        style={{ fontSize: 15, fontWeight: 500, fill: active ? 'rgb(var(--mist-100))' : 'rgb(var(--mist-300))' }}>
        {title}
      </text>
    </g>
  )
}

// Inferred goals as a numbered ribbon-and-target infographic — the literal structure
// from the reference (flag-notched number tabs, a chevron arrow shaft, connector lines
// into a target), redrawn in the app's violet accent instead of the reference's
// cream/red. Goals split first-half-left / second-half-right (not zigzagged), matching
// the reference's 01-03 left / 04-06 right grouping; 1 goal renders alone on the left
// with the shaft/target still intact. Banners show only a short title; clicking one
// opens a detail panel below the diagram with the full summary + the same SourceRefs
// every other insight already uses — extra info only when asked for, never inline.
export function GoalArrowChart({ goals }) {
  const [activeId, setActiveId] = useState(null)
  if (!goals || goals.length === 0) {
    return (
      <div className="card p-6">
        <p className="label mb-2 !text-violet-300">Inferred goals</p>
        <p className="text-sm text-mist-400">No goals inferred yet.</p>
      </div>
    )
  }
  const half = Math.ceil(goals.length / 2)
  const left = goals.slice(0, half)
  const right = goals.slice(half)
  const rows = left.length

  const shaftBottomY = GOAL_TOP_PAD + GOAL_HEAD_H + rows * GOAL_ROW_H
  const targetCenterY = shaftBottomY + 30 + GOAL_TARGET_R
  const totalHeight = targetCenterY + GOAL_TARGET_R + 30

  const activeGoal = goals.find(g => g.id === activeId) || null
  const activeNum = activeGoal ? goals.indexOf(activeGoal) + 1 : null

  function toggle(id) {
    setActiveId(a => (a === id ? null : id))
  }

  return (
    <div className="card flex flex-col p-6">
      <p className="label mb-6 !text-violet-300">Inferred goals</p>
      {/* flex-1 + centered svg: when the grid stretches this card to match the Field
          Investigation Report card next to it, the diagram centers in the extra room
          instead of leaving a dead gap under a top-pinned chart. */}
      <div className="flex flex-1 items-center justify-center">
      <svg viewBox={`0 0 ${GOAL_VW} ${totalHeight}`} className="w-full" style={{ maxHeight: 420 }}>
        <polygon
          points={`${GOAL_SPINE_X},${GOAL_TOP_PAD} ${GOAL_SPINE_X - GOAL_HEAD_W / 2},${GOAL_TOP_PAD + GOAL_HEAD_H} ${GOAL_SPINE_X + GOAL_HEAD_W / 2},${GOAL_TOP_PAD + GOAL_HEAD_H}`}
          fill={GOAL_VIOLET} fillOpacity="0.85"
        />
        {Array.from({ length: rows }, (_, i) => {
          const topY = GOAL_TOP_PAD + GOAL_HEAD_H + i * GOAL_ROW_H
          const botY = topY + GOAL_ROW_H
          const sx0 = GOAL_SPINE_X - GOAL_SHAFT_W / 2
          const sx1 = GOAL_SPINE_X + GOAL_SHAFT_W / 2
          return (
            <path key={i}
              d={`M ${sx0},${topY} L ${sx1},${topY} L ${sx1},${botY - GOAL_NOTCH} L ${GOAL_SPINE_X},${botY} L ${sx0},${botY - GOAL_NOTCH} Z`}
              fill={GOAL_VIOLET} fillOpacity={i % 2 === 0 ? 0.55 : 0.4} stroke={GOAL_VIOLET} strokeOpacity="0.3"
            />
          )
        })}
        <line x1={GOAL_SPINE_X} y1={shaftBottomY} x2={GOAL_SPINE_X} y2={targetCenterY - GOAL_TARGET_R} stroke={GOAL_VIOLET} strokeOpacity="0.5" strokeWidth="3" />

        <ellipse cx={GOAL_SPINE_X} cy={targetCenterY + 6} rx={GOAL_TARGET_R + 14} ry={(GOAL_TARGET_R + 14) * 0.32} fill={GOAL_VIOLET} fillOpacity="0.08" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R} fill="none" stroke={GOAL_VIOLET} strokeOpacity="0.35" strokeWidth="6" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R * 0.62} fill="none" stroke={GOAL_VIOLET} strokeOpacity="0.55" strokeWidth="6" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R * 0.26} fill={GOAL_VIOLET} fillOpacity="0.85" />

        {Array.from({ length: rows }, (_, i) => {
          const rowCenterY = GOAL_TOP_PAD + GOAL_HEAD_H + i * GOAL_ROW_H + GOAL_ROW_H / 2
          const lGoal = left[i]
          const rGoal = right[i]
          return (
            <g key={i}>
              {lGoal && (
                <>
                  <line x1={GOAL_SPINE_X - GOAL_GAP} y1={rowCenterY} x2={GOAL_SPINE_X - GOAL_SHAFT_W / 2} y2={rowCenterY} stroke={goalPlateColor(i)} strokeOpacity="0.4" strokeWidth="2" />
                  <circle cx={GOAL_SPINE_X - GOAL_GAP} cy={rowCenterY} r="4" fill={goalPlateColor(i)} />
                  <GoalRibbon goal={lGoal} num={String(i + 1).padStart(2, '0')} side="left" rowCenterY={rowCenterY}
                    active={activeId === lGoal.id} onClick={() => toggle(lGoal.id)} color={goalPlateColor(i)} />
                </>
              )}
              {rGoal && (
                <>
                  <line x1={GOAL_SPINE_X + GOAL_SHAFT_W / 2} y1={rowCenterY} x2={GOAL_SPINE_X + GOAL_GAP} y2={rowCenterY} stroke={goalPlateColor(half + i)} strokeOpacity="0.4" strokeWidth="2" />
                  <circle cx={GOAL_SPINE_X + GOAL_GAP} cy={rowCenterY} r="4" fill={goalPlateColor(half + i)} />
                  <GoalRibbon goal={rGoal} num={String(half + i + 1).padStart(2, '0')} side="right" rowCenterY={rowCenterY}
                    active={activeId === rGoal.id} onClick={() => toggle(rGoal.id)} color={goalPlateColor(half + i)} />
                </>
              )}
            </g>
          )
        })}
      </svg>
      </div>

      {activeGoal && (
        <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
            Goal {String(activeNum).padStart(2, '0')}{activeGoal.metadata?.name ? `: ${activeGoal.metadata.name}` : ''}
          </p>
          <p className="text-sm leading-relaxed text-mist-100">{activeGoal.summary}</p>
          <SourceRefs refs={activeGoal.source_refs} />
        </div>
      )}
    </div>
  )
}

// §4i: a learning-path recommendation carries a machine-renderable graph in
// metadata.path (mind_knowledge 01_learning_path_method.md's format: flat `nodes` with
// `requires` dependency edges). Rendered as an actual node-and-arrow diagram — layered by
// longest-path-from-root over `requires`, so prerequisite chains read top-to-bottom and
// parallel nodes sit side by side. Tap a node for its resource/practice detail rather than
// wrapping every label in explanatory prose, per §1's ADHD rule (surface the shape first,
// detail on demand).
const PATH_NODE_TYPE_FILL = {
  concept: '#b7a6f7',
  fact: '#5eead4',
  procedure: '#f0d9a3'
}
const PATH_NODE_W = 128
const PATH_NODE_H = 40
const PATH_LEVEL_GAP = 34
const PATH_NODE_GAP = 12
const PATH_TOP_PAD = 12
const PATH_MAX_PER_ROW = 3 // wrap same-level nodes (e.g. a flat set of terms) into a 3-column grid instead of one wide squeezed row

export function PathDiagram({ path }) {
  const [activeId, setActiveId] = useState(null)
  const nodes = Array.isArray(path?.nodes) ? path.nodes : []
  if (nodes.length === 0) return null

  const byId = {}
  nodes.forEach(n => { byId[n.id] = n })

  const level = {}
  function levelOf(id, seen) {
    if (level[id] != null) return level[id]
    if (seen.has(id)) return 0 // guard against malformed cyclic `requires`
    const reqs = (byId[id].requires || []).filter(r => byId[r])
    if (reqs.length === 0) { level[id] = 0; return 0 }
    const nextSeen = new Set(seen); nextSeen.add(id)
    const l = 1 + Math.max(...reqs.map(r => levelOf(r, nextSeen)))
    level[id] = l
    return l
  }
  nodes.forEach(n => levelOf(n.id, new Set()))

  const levelRows = {}
  nodes.forEach(n => { (levelRows[level[n.id]] ||= []).push(n) })
  const levelCount = Math.max(...Object.values(level)) + 1

  // dependency levels become one or more visual rows, wrapped at PATH_MAX_PER_ROW
  const visualRows = []
  for (let l = 0; l < levelCount; l++) {
    const row = levelRows[l] || []
    for (let i = 0; i < row.length; i += PATH_MAX_PER_ROW) {
      visualRows.push(row.slice(i, i + PATH_MAX_PER_ROW))
    }
  }
  const rowCount = visualRows.length
  const maxRowLen = Math.max(...visualRows.map(r => r.length))
  const width = maxRowLen * PATH_NODE_W + (maxRowLen - 1) * PATH_NODE_GAP
  const height = PATH_TOP_PAD * 2 + rowCount * PATH_NODE_H + (rowCount - 1) * PATH_LEVEL_GAP

  const pos = {}
  visualRows.forEach((row, ri) => {
    const rowWidth = row.length * PATH_NODE_W + (row.length - 1) * PATH_NODE_GAP
    const startX = (width - rowWidth) / 2
    row.forEach((n, i) => {
      pos[n.id] = { x: startX + i * (PATH_NODE_W + PATH_NODE_GAP), y: PATH_TOP_PAD + ri * (PATH_NODE_H + PATH_LEVEL_GAP) }
    })
  })

  const edges = []
  nodes.forEach(n => {
    (n.requires || []).forEach(r => {
      if (pos[r]) edges.push({ from: r, to: n.id })
    })
  })

  const active = activeId ? byId[activeId] : null
  const activeFill = active ? (PATH_NODE_TYPE_FILL[active.type] || '#9aa4ae') : null

  return (
    <div className="mt-3">
      {path.topic && <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gold-200/80">{path.topic}</p>}
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width, display: 'block', margin: '0 auto' }}>
        <defs>
          <marker id="path-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="rgb(var(--mist-400))" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to]
          const x1 = a.x + PATH_NODE_W / 2, y1 = a.y + PATH_NODE_H
          const x2 = b.x + PATH_NODE_W / 2, y2 = b.y
          const midY = (y1 + y2) / 2
          return (
            <path key={i} d={`M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`}
              fill="none" stroke="rgb(var(--mist-400))" strokeOpacity="0.6" strokeWidth="1.5" markerEnd="url(#path-arrow)" />
          )
        })}
        {nodes.map(n => {
          const p = pos[n.id]
          const fill = PATH_NODE_TYPE_FILL[n.type] || '#9aa4ae'
          const isActive = activeId === n.id
          return (
            <g key={n.id} onClick={() => setActiveId(a => (a === n.id ? null : n.id))} style={{ cursor: 'pointer' }}>
              <rect x={p.x} y={p.y} width={PATH_NODE_W} height={PATH_NODE_H} rx="8"
                fill={fill} fillOpacity={isActive ? 0.28 : 0.12}
                stroke={fill} strokeOpacity={isActive ? 0.9 : 0.5} strokeWidth={isActive ? 2 : 1.5} />
              <foreignObject x={p.x + 6} y={p.y + 4} width={PATH_NODE_W - 12} height={PATH_NODE_H - 8}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 10, lineHeight: 1.15, color: 'rgb(var(--mist-100))' }}>
                  {n.label}
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>

      {active && (
        <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
          <p className="mb-1 flex items-center gap-2 text-xs font-medium text-mist-200">
            {active.type && (
              <span className="rounded border px-1.5 py-0.5 text-[11px] uppercase tracking-wide" style={{ borderColor: activeFill, color: activeFill }}>
                {active.type}
              </span>
            )}
            {active.label}
          </p>
          {active.resource && (
            <p className="text-xs text-mist-400">
              {active.resource.url ? (
                <a href={active.resource.url} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">
                  {active.resource.title} ↗
                </a>
              ) : (
                <span className="text-mist-200">{active.resource.title}</span>
              )}
              {active.resource.why_this_one ? <span className="text-mist-500">, {active.resource.why_this_one}</span> : null}
            </p>
          )}
          {active.practice && <p className="mt-1 text-xs text-emerald-200/80">✎ {active.practice}</p>}
        </div>
      )}

      {(path.sequencing_mode || path.timeline) && (
        <p className="mt-2 text-[13px] text-mist-500">
          {path.sequencing_mode ? `${path.sequencing_mode} sequencing` : ''}{path.sequencing_mode && path.timeline ? ' · ' : ''}{path.timeline || ''}
        </p>
      )}
    </div>
  )
}

// §4i: a small bar chart for a recommendation — ONLY rendered when the numbers carry a
// cited source (chart.source), same rule as recommendation itself. Never fabricated
// numbers dressed up as a chart.
export function MiniBarChart({ chart }) {
  const bars = Array.isArray(chart?.bars) ? chart.bars.filter(b => typeof b.value === 'number') : []
  if (bars.length === 0 || !chart.source) return null
  const max = Math.max(...bars.map(b => b.value)) || 1
  return (
    <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
      {chart.title && <p className="mb-2 text-xs font-medium text-mist-200">{chart.title}{chart.unit ? ` (${chart.unit})` : ''}</p>}
      <div className="space-y-1.5">
        {bars.map((b, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-mist-400">{b.label}</span>
            <span className="h-2 rounded-full bg-gold-400/70" style={{ width: `${Math.max(4, (b.value / max) * 100)}%` }} />
            <span className="text-mist-300">{b.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-mist-500">
        Source:{' '}
        {chart.source.url ? (
          <a href={chart.source.url} target="_blank" rel="noreferrer" className="hover:text-violet-300">{chart.source.title || chart.source.url} ↗</a>
        ) : (chart.source.title || 'cited')}
      </p>
    </div>
  )
}

// Field investigation method's "concept" shape (mind_knowledge topic
// "field_investigation_method"): a conceptual/theoretical term — definition, the branch
// of the field it belongs to, and a compact philosopher lineage. Visual-first per that
// doc: term + branch chip + one-line definition, then philosophers as a small connected
// timeline (name/era/one clause), not a paragraph of intellectual history.
export function ConceptCard({ concept }) {
  if (!concept?.term) return null
  const philosophers = Array.isArray(concept.philosophers) ? concept.philosophers.slice(0, 4) : []
  const related = Array.isArray(concept.related_concepts) ? concept.related_concepts.slice(0, 3) : []
  return (
    <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900/60 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-serif text-lg font-light text-mist-100">{concept.term}</h3>
        {concept.branch && (
          <span className="rounded border border-violet-400/40 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-violet-300">
            {concept.branch}
          </span>
        )}
      </div>
      {concept.definition && <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{concept.definition}</p>}

      {philosophers.length > 0 && (
        <div className="mt-4 flex items-start gap-0">
          {philosophers.map((p, i) => (
            <div key={i} className="relative flex-1 px-2 text-center">
              {i > 0 && <span className="absolute right-1/2 top-[5px] h-px w-full bg-ink-700" />}
              <div className="relative mx-auto mb-1.5 h-2.5 w-2.5 rounded-full bg-violet-400/70" />
              <p className="text-xs font-medium text-mist-100">{p.name}</p>
              {p.era && <p className="text-[11px] text-mist-500">{p.era}</p>}
              {p.contribution && <p className="mt-0.5 text-[11px] leading-snug text-mist-400">{p.contribution}</p>}
            </div>
          ))}
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {related.map((r, i) => (
            <span key={i} className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-mist-400">{r}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// Every card reads at exactly the same footprint no matter what a cycle wrote or which
// page of the report is showing — everything that varies in length (the visual, the
// suggestion, sources) lives inside one fixed-height scroll region instead of stretching
// the card. A cut-off fade + arrow mark the edges only when there's actually more to see,
// so content never just gets silently clipped.
const RECOMMENDATION_BODY_H = 360

export function RecommendationCardBody({ insight }) {
  const [showSources, setShowSources] = useState(false)
  const [overflow, setOverflow] = useState({ top: false, bottom: false })
  const scrollRef = useRef(null)
  const contentRef = useRef(null)

  const md = insight.metadata || {}
  const hasPath = Array.isArray(md.path?.nodes) && md.path.nodes.length > 0
  const hasConcept = !!md.concept?.term
  const hasVisual = hasPath || hasConcept

  function updateOverflow() {
    const el = scrollRef.current
    if (!el) return
    setOverflow({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1
    })
  }

  useLayoutEffect(() => {
    const el = scrollRef.current
    const content = contentRef.current
    if (!el || !content) return
    el.scrollTop = 0
    updateOverflow()
    // watch the inner content's natural size, not the (capped) scroll container's —
    // a node detail expanding, or sources unfolding, inside an already-clipped diagram
    // still needs to flip the bottom fade on even though the container's own box never
    // resizes. Set up once per report page, not per showSources toggle, so opening
    // sources doesn't yank the scroll position back to the top.
    const ro = new ResizeObserver(updateOverflow)
    ro.observe(content)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight.id])

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={updateOverflow}
        className="overflow-y-auto pr-1"
        style={{ height: RECOMMENDATION_BODY_H }}
      >
        <div ref={contentRef}>
          {!hasVisual && (
            <div className="flex items-start gap-2">
              {md.icon && <span className="text-lg leading-none">{md.icon}</span>}
              <p className="text-sm leading-relaxed text-mist-100">{insight.summary}</p>
            </div>
          )}

          {hasPath && <PathDiagram path={md.path} />}
          {hasConcept && <ConceptCard concept={md.concept} />}
          {md.chart && <MiniBarChart chart={md.chart} />}

          {md.suggestion && (
            <p className="mt-3 rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-100">
              <span className="font-medium text-violet-300">For you: </span>{md.suggestion}
            </p>
          )}

          {Array.isArray(md.keywords_used) && md.keywords_used.length > 0 && (
            <p className="mt-2 text-[13px] text-mist-500">researched via: {md.keywords_used.join(' · ')}</p>
          )}

          {insight.source_refs?.length > 0 && (
            <div className="mt-3 mb-1">
              <button onClick={() => setShowSources(s => !s)} className="text-[13px] text-mist-500 hover:text-mist-300">
                {showSources ? 'Hide sources' : `Sources (${insight.source_refs.length})`}
              </button>
              {showSources && <SourceRefs refs={insight.source_refs} />}
            </div>
          )}
        </div>
      </div>

      {overflow.top && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-ink-900 to-transparent" />
      )}
      {overflow.bottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9 items-end justify-center bg-gradient-to-t from-ink-900 via-ink-900/80 to-transparent pb-1">
          <span className="text-[11px] text-mist-500">⌄ more</span>
        </div>
      )}
    </div>
  )
}

// §4i: recommendations render as small visual cards, not prose. Standalone version with
// its own card chrome, for contexts that don't already provide one.
export function RecommendationCard({ insight }) {
  return (
    <div className="card border-t-2 border-gold-400/30 p-6">
      <RecommendationCardBody insight={insight} />
    </div>
  )
}
