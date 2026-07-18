import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import KnowledgeGalaxy from '../components/KnowledgeGalaxy'
import Onboarding from '../components/Onboarding'
import TourOverlay from '../components/TourOverlay'
import { requireSessionSSR } from '../lib/pageAuth'
import { embedPendingNotes } from '../lib/clientEmbeddings'

// §4e/§4f: same rose/emerald/violet/gold/mist accent family as lib/paraTheme.js
// (Tailwind class names there, hex here since the visualizer paints on canvas) —
// inbox/project/area/resource/archive in order. new_capture_proposal rows have no
// note_para, so they fall back to the inbox accent per spec.
const PARA_COLORS = {
  inbox: '#fb7185',
  project: '#5eead4',
  area: '#b7a6f7',
  resource: '#f0d9a3',
  archive: '#8a929b'
}

// §4f: accent palette shared with lib/paraTheme.js, keyed by the `accent` column a
// cycle writes onto each mind_sections row.
const ACCENT_HEX = {
  emerald: '#5eead4',
  violet: '#b7a6f7',
  gold: '#f0d9a3',
  rose: '#fb7185',
  mist: '#9aa4ae'
}

// mind_sections' only live UI consumer now is the "feed" renderer, which powers the
// Overview page's "Latest in your world" news strip (§4j) — cycle-authored prose,
// self-contained in metadata.items.
function sectionItems(def) {
  const meta = def.metadata || {}
  return (meta.items || []).map((it, i) => ({
    id: `${def.slug}-${i}`,
    summary: it.text,
    source_refs: it.url ? [...(it.source_refs || []), { type: 'resource', title: it.text, url: it.url }] : (it.source_refs || [])
  }))
}

// §4j: the "feed" renderer ("Latest in your world") presents its items as a scrolling
// ticker rather than a one-at-a-time readout.
function isFeedRenderer(def) {
  return def.renderer === 'feed'
}

// News-strip items carry no domain field (they're cycle-authored prose, not tied to a
// mind_taxonomy row), so the ticker infers one from the summary text via keyword match,
// keyed to the same science/technology/business/humanities clusters + colors as the
// knowledge galaxy (components/KnowledgeGalaxy.js CLUSTER_RGB) for a consistent palette.
const NEWS_DOMAIN_HEX = {
  science: '#6ee796',
  technology: '#60bef9',
  business: '#fb7192',
  humanities: '#c091fc'
}
const NEWS_DOMAIN_KEYWORDS = {
  science: ['brain', 'neuro', 'protein', 'cortex', 'biology', 'physics', 'chemistry', 'gene', 'cell', 'species', 'climate', 'quantum', 'cosmic', 'space', 'astronom', 'medicine', 'disease', 'vaccine', 'clinical', 'psycholog', 'cognit', 'evolution', 'ecolog', 'memory', 'decision', 'alzheimer'],
  technology: ['artificial intelligence', ' ai ', 'software', 'algorithm', 'robot', 'computer', 'chip', ' app ', 'machine learning', 'internet', 'startup app', 'llm', 'automation'],
  business: ['market', 'startup', 'finance', 'econom', 'stock', 'investment', 'revenue', 'company', 'ecommerce', 'trade', 'ipo'],
  humanities: ['philosoph', 'history', 'literature', 'ethic', 'politic', 'culture', 'language', ' art ', 'linguistic', 'society', 'religion']
}
function classifyNewsDomain(text) {
  if (!text) return null
  const lower = ` ${text.toLowerCase()} `
  for (const [domain, words] of Object.entries(NEWS_DOMAIN_KEYWORDS)) {
    if (words.some(w => lower.includes(w))) return domain
  }
  return null
}

function relativeTimeLabel(date) {
  if (!date) return 'never'
  const ms = Date.now() - date.getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

const KIND_LABELS = {
  interest_cluster: 'Interest clusters',
  open_loop: 'Open loops',
  attention_pattern: 'Attention patterns',
  dormant_revival: 'Dormant revival',
  inferred_goal: 'Inferred goals',
  user_model: 'How you seem to work',
  recommendation: 'Researched resources'
}

const KIND_ORDER = ['interest_cluster', 'open_loop', 'attention_pattern', 'dormant_revival', 'inferred_goal']

const STALE_DAYS = 2

// §4l: the refresh prompt is account-scoped, not a static const. Claude Code's Supabase
// MCP access has no session boundary the way the app's API routes do (req.user.id from
// the cookie), so every refresh instruction must name the target account explicitly at
// the top and scope every query to it. The app already knows the logged-in email here,
// so we auto-fill it rather than leaving the user to type it.
function buildRefreshPrompt(user) {
  const email = user?.email || ''
  const anchor = email
    ? `Target account: ${email}. Before anything else, resolve this account's user_id once (SELECT id FROM users WHERE email = '${email}') and scope EVERY query and write this cycle to that user_id — Claude Code's Supabase MCP access has no session boundary, so this explicit anchor is required (MIND_MODEL_BRIEF §4l).`
    : `Target account: the single account in this database. Resolve its user_id once (SELECT id FROM users LIMIT 1) and scope EVERY query and write this cycle to that user_id (§4l).`

  return `${anchor}

First, check for unprocessed onboarding imports (mind_knowledge topic "onboarding_import_method"): SELECT * FROM onboarding_imports WHERE user_id = <this account's id> AND processed = false. If any exist, work through that doc before anything else — mine each pasted chat/document/board/journal/calendar for recurring topics (feeding inferred_goal/mind_topics), working-style signals (feeding user_model, cited via source_refs: [{"type":"stat","name":"onboarding_import","value":"<source_type>"}]), and concrete open threads worth a new_capture_proposal in para_fun_queue — filtered hard, since pasted material is noisier than the user's own notes. Mark each one UPDATE onboarding_imports SET processed = true, processed_at = now() once handled, even if nothing in it cleared the bar. If none are unprocessed, skip this step entirely.

Refresh my Mind Model following the refinement loop (mind_knowledge topic "refinement_loop"): read all mind_knowledge rows first — including "adhd_support_map", "topic_map_method", and "field_investigation_method" — then my notes, tasks, packets, activity_log, and current mind_insights via the Supabase MCP. Re-run POST /api/mind/synthesize to refresh the four templated kinds (interest_cluster, open_loop, attention_pattern, dormant_revival). Then write a fresh "overview" in your own words (mirror, not oracle — describe, don't direct), and update "user_model"/"recommendation" per the meta_map/learning_path_method/resource_research_method/adhd_support_map docs at whatever tier the data supports. Ground "patterns"/"cycles" evidence in real nearest-neighbor queries against notes.embedding (ORDER BY embedding <=> embedding LIMIT N, cosine distance — §4h) instead of eyeballing keyword overlap wherever notes have an embedding; notes still missing one (client-side step hasn't run for them yet) just don't participate — don't treat that as a gap to fill manually. Every user_model row must set section to exactly one of patterns | triggers | progress | cycles (per adhd_support_map — never diagnosis, defense mechanisms, transference, or risk/self-harm scoring). "inferred_goal" is one row PER distinct goal, never a single paragraph bundling several goals together — if the notes point at multiple separate things the user seems to be working toward, write one row for each. Every inferred_goal row's metadata must include a short name (e.g. metadata: {"name": "Neurobiology"}) — the dashboard renders it as a labeled banner, not a wall of prose, so a real short name beats a truncated first sentence every time. This name is also the live join onto the knowledge-galaxy map: read mind_knowledge topic "topic_map_method" and the current mind_topics rows for this account, and use goal_name (set on the one leaf node that matches this exact name) so the interest lights up in the right place. Before writing a new inferred_goal, check whether its topic already has a home in mind_topics — if not, grow the tree per that doc's rules (upsert by (user_id, slug), never touch the root row, never rename a slug, cap new nodes at 5 per cycle, only add a node for a topic with real recurring evidence, one leaf if it fits an existing hub, a short hub+leaf chain only if the field genuinely has that structure) rather than leaving every non-fitting interest stuck in Science/Tech/Business/Humanities by default. A goal that's gone quiet still counts as a goal and gets its own inferred_goal row even if a dormant_revival row already exists for the same notes — the two kinds answer different questions ("what are you working toward" vs. "what went quiet") and both can be true for the same thing at once. Write scope='user' calibration rows back to mind_knowledge. Insert everything via the Supabase MCP, superseding prior rows of each kind.

Then run the field investigation (mind_knowledge topic "field_investigation_method") behind the "recommendation" kind, now labeled "Field Investigation Report" on the dashboard — this is the brain's own investigation, not a summary of what I captured. For every real lead this cycle surfaced (a stated interest, a recurring theme, an inferred_goal, a term implied but never defined in my own notes), investigate it the way a well-informed person would: learn what my notes don't already say — definitions, the field/branch something belongs to, the people who originated or shaped it. The "worth knowing" bar (genuinely new — not already sitting in mind_knowledge_library for me — and not textbook trivia) decides what makes this cycle's report, not what gets remembered: every finding you actually investigate, filtered out of the report or not, still gets persisted to mind_knowledge_library, since the library's job is to hold everything the investigation has learned, not just the polished subset shown to me. Pick the shape per resource_research_method/field_investigation_method for whatever clears the report bar: a roadmap (metadata.path) for a bare stated interest in a whole field, a cited chart (metadata.chart) only when the numbers have a real source, terms with one-liners for a review/consolidation ask, or metadata.concept = { term, definition, branch, philosophers: [{name, era, contribution}] (cap 2-4), related_concepts? } for a conceptual/theoretical term (ontology, epistemology, and similarly foundational terms in any field), naming which branch of the field it belongs to and who's responsible for it. Whichever shape you pick, the row's summary is a short title-level line, never a paragraph restating what the diagram/card already shows — see field_investigation_method's worked example before writing it. That "visual-first, no restating prose" rule covers the summary and the compact card only — actually reading through real sources on a concept or field turns up more than a one-line definition (history of the idea, its real limitations, how later work reinterpreted it, a genuinely surprising result), and that substance belongs in the library entry's own metadata.detail (a plain string, paragraphs separated by \n\n, grounded in source_refs, empty when there truly isn't more than the one-liner) — it renders in the library entry's own detail window, not on the compact report or shelf tile, which is exactly why that window exists. Persist every investigated finding — report-worthy or filtered-out — to mind_knowledge_library (upsert by (user_id, domain, title): update summary/metadata only if this cycle's version is a real improvement, else just bump cycle_count and last_reinforced_at, never delete), setting surfaced = true for the subset also written to mind_insights (kind='recommendation', this cycle's report, superseded like every other kind) and surfaced = false for filtered-out background research the library alone remembers — domain should match the finding's hub name in mind_topics where one exists. mind_knowledge_library is the durable Knowledge Library the dashboard shows separately from this cycle's report; it must never be superseded or cleared, only added to.

Then process the PARA-fun queue (para_fun_queue): first read all existing rows for this account. Leave still-valid pending rows untouched — do not duplicate or re-ask a question that's already waiting for an answer. Mark a row superseded if the note/data it was about has changed enough to invalidate it. Only after that, add new questions — including proposing a new capture if your processing surfaced something genuinely worth capturing. Build questions from the current open_loop/dormant_revival insights plus Inbox age, not new logic.

Hard rules, no exceptions: (1) never insert directly into notes, tasks, or packets as part of this step — every proposal, including a new capture, is a para_fun_queue row requiring the user's tap before anything real is created; (2) cap total new rows added this cycle (pending + new) at 5-8, at most 2-3 of which are new_capture_proposals — do not flood the queue; (3) before proposing a new capture, check existing notes/tags for a near-duplicate and skip the proposal if one already covers it; (4) every assumed_answer must have non-empty source_refs explaining what data or reasoning it came from — an assumed answer with no traceable source is a bug, not a shortcut; (5) an invented question_type must still use the same row shape (question_text, options, assumed_answer, section, priority_rank) — there is no side channel for writing data outside this mechanism.

Then re-emit the "feed" mind_sections row that powers the Overview page's "Latest in your world" news strip (§4j; mind_knowledge topic "refinement_loop" — "Brain sections" rule, superseding language still applies even though "Visit Your Brain" itself has been removed): metadata.items: [{ text, url?, source_refs? }], sourced from real web research (same posture as the field investigation above), capped at 6 items, filtered to what's genuinely currently notable and against user_model so it resonates with this specific person. Supersede the prior feed row rather than editing it in place. Skip writing a feed section entirely when there's nothing real behind it — an empty ticker is worse than none. Other mind_sections renderer types (insight_list, queue, question, activity_digest, reminder) have no UI consumer anymore and should not be written.

Finally, record the cycle: write one mind_cycle_runs row (started_at, completed_at, tokens_used = your own honest estimate of tokens spent this cycle, sections_written, insights_written, status = ok | partial | error, notes = free text on anything that failed). Record partial and failed cycles honestly — the dashboard surfaces them so I can tell whether the refresh actually did what it claimed (§4k).`
}

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function SourceRefs({ refs }) {
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

function InsightRow({ insight }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-3">
      <button onClick={() => setOpen(o => !o)} className="block w-full text-left text-sm text-mist-100 hover:text-emerald-300">
        {insight.summary}
      </button>
      {open && <SourceRefs refs={insight.source_refs} />}
    </div>
  )
}

// Never-generated (age === null) is the first-run/just-onboarded state — the raw
// "paste this into a Claude Code session" instructions are developer-facing plumbing,
// not something to hand the end user before they've seen any real output. That case
// renders a calm processing notice instead (see ProcessingNotice below); this banner
// only ever shows the re-prompt for an account that has real (now-stale) data already.
function StalenessBanner({ lastUpdated, prompt }) {
  const [copied, setCopied] = useState(false)
  const age = lastUpdated ? daysAgo(lastUpdated) : null
  if (age === null || age < STALE_DAYS) return null

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-8 rounded-xl border border-gold-400/30 bg-gold-500/5 p-4">
      <p className="text-sm text-gold-200">
        {`Your Mind Model is ${age} day${age === 1 ? '' : 's'} old.`}{' '}
        <strong className="text-gold-300">Ask Claude Code to refresh it</strong> — paste the prompt below into a
        Claude Code session with the Supabase MCP connected.
      </p>
      <div className="mt-3 flex items-start gap-2">
        <pre className="flex-1 whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-900 p-3 text-xs text-mist-300">
          {prompt}
        </pre>
        <button onClick={copyPrompt} className="btn-secondary !px-3 !py-1.5 text-xs whitespace-nowrap">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// First-run calm state: nothing has ever been generated yet, so there's nothing real
// to show — a spinner-and-sentence rather than the technical Claude Code instructions
// (those still surface once real data exists and later goes stale, via StalenessBanner).
function ProcessingNotice() {
  return (
    <div className="mb-8 flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-950 p-6">
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
      <p className="text-sm text-mist-300">Your second brain is processing the information.</p>
    </div>
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

// Each goal plate gets its own color (cycling through the app's existing accent family)
// so distinct goals are visually distinct at a glance, not just by number/title text.
const GOAL_PLATE_COLORS = [ACCENT_HEX.violet, ACCENT_HEX.gold, ACCENT_HEX.emerald, ACCENT_HEX.rose, ACCENT_HEX.mist]
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
        fill={active ? '#f2f0ff' : '#c7cbd1'} style={{ fontSize: 15, fontWeight: 500 }}>
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
function GoalArrowChart({ goals }) {
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
    <div className="card p-6">
      <p className="label mb-6 !text-violet-300">Inferred goals</p>
      <svg viewBox={`0 0 ${GOAL_VW} ${totalHeight}`} className="w-full" style={{ maxHeight: 420 }}>
        <polygon
          points={`${GOAL_SPINE_X},${GOAL_TOP_PAD} ${GOAL_SPINE_X - GOAL_HEAD_W / 2},${GOAL_TOP_PAD + GOAL_HEAD_H} ${GOAL_SPINE_X + GOAL_HEAD_W / 2},${GOAL_TOP_PAD + GOAL_HEAD_H}`}
          fill="#b7a6f7" fillOpacity="0.85"
        />
        {Array.from({ length: rows }, (_, i) => {
          const topY = GOAL_TOP_PAD + GOAL_HEAD_H + i * GOAL_ROW_H
          const botY = topY + GOAL_ROW_H
          const sx0 = GOAL_SPINE_X - GOAL_SHAFT_W / 2
          const sx1 = GOAL_SPINE_X + GOAL_SHAFT_W / 2
          return (
            <path key={i}
              d={`M ${sx0},${topY} L ${sx1},${topY} L ${sx1},${botY - GOAL_NOTCH} L ${GOAL_SPINE_X},${botY} L ${sx0},${botY - GOAL_NOTCH} Z`}
              fill="#b7a6f7" fillOpacity={i % 2 === 0 ? 0.55 : 0.4} stroke="#b7a6f7" strokeOpacity="0.3"
            />
          )
        })}
        <line x1={GOAL_SPINE_X} y1={shaftBottomY} x2={GOAL_SPINE_X} y2={targetCenterY - GOAL_TARGET_R} stroke="#b7a6f7" strokeOpacity="0.5" strokeWidth="3" />

        <ellipse cx={GOAL_SPINE_X} cy={targetCenterY + 6} rx={GOAL_TARGET_R + 14} ry={(GOAL_TARGET_R + 14) * 0.32} fill="#b7a6f7" fillOpacity="0.08" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R} fill="none" stroke="#b7a6f7" strokeOpacity="0.35" strokeWidth="6" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R * 0.62} fill="none" stroke="#b7a6f7" strokeOpacity="0.55" strokeWidth="6" />
        <circle cx={GOAL_SPINE_X} cy={targetCenterY} r={GOAL_TARGET_R * 0.26} fill="#b7a6f7" fillOpacity="0.85" />

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

      {activeGoal && (
        <div className="mt-4 rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-300">
            Goal {String(activeNum).padStart(2, '0')}{activeGoal.metadata?.name ? ` — ${activeGoal.metadata.name}` : ''}
          </p>
          <p className="text-sm leading-relaxed text-mist-100">{activeGoal.summary}</p>
          <SourceRefs refs={activeGoal.source_refs} />
        </div>
      )}
    </div>
  )
}

// §4k: honest cycle-health readout — surfaces the last refresh's status, spend, and
// counts, including partial/failed cycles (not just clean ones), so the user can tell
// whether the last refresh actually did what it claimed. Reads mind_cycle_runs, which
// Claude Code writes at the end of each cycle (§6).
const CYCLE_STATUS_STYLE = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'ok' },
  partial: { dot: 'bg-gold-400', text: 'text-gold-300', label: 'partial' },
  error: { dot: 'bg-rose-400', text: 'text-rose-300', label: 'error' }
}

function CycleHealthCard({ cycle }) {
  const [showNotes, setShowNotes] = useState(false)
  if (!cycle) return null
  const s = CYCLE_STATUS_STYLE[cycle.status] || CYCLE_STATUS_STYLE.ok
  const when = cycle.completed_at || cycle.created_at
  const tiles = [
    { label: 'Insights', value: cycle.insights_written },
    { label: 'Sections', value: cycle.sections_written },
    { label: '~Tokens', value: cycle.tokens_used?.toLocaleString?.() ?? cycle.tokens_used }
  ].filter(t => t.value != null)
  return (
    <div className="mb-8 rounded-xl border border-ink-700 bg-ink-950 p-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <div className="flex flex-col justify-center gap-0.5 rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 sm:min-w-[140px]">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
            <span className={s.text}>Last cycle {s.label}</span>
          </span>
          {when && <span className="text-[11px] text-mist-500">{relativeTimeLabel(new Date(when))}</span>}
        </div>
        {tiles.map(t => (
          <div key={t.label} className="flex flex-col justify-center rounded-lg border border-ink-700 bg-ink-900/40 px-3 py-2 sm:min-w-[90px]">
            <span className="text-lg font-semibold text-mist-100">{t.value}</span>
            <span className="text-[11px] uppercase tracking-wide text-mist-500">{t.label}</span>
          </div>
        ))}
      </div>
      {cycle.notes && (
        <div className="mt-3 border-t border-ink-800 pt-2">
          <button onClick={() => setShowNotes(v => !v)} className="text-[11px] text-mist-500 hover:text-mist-300">
            {showNotes ? 'Hide details' : 'Show details'}
          </button>
          {showNotes && <p className="mt-2 text-xs leading-relaxed text-mist-400">{cycle.notes}</p>}
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
const PATH_NODE_W = 168
const PATH_NODE_H = 52
const PATH_LEVEL_GAP = 72
const PATH_NODE_GAP = 20
const PATH_TOP_PAD = 20
const PATH_MAX_PER_ROW = 4 // wrap same-level nodes (e.g. a flat set of terms) instead of one wide squeezed row

function PathDiagram({ path }) {
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
            <path d="M0,0 L8,4 L0,8 z" fill="#5c6570" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos[e.from], b = pos[e.to]
          const x1 = a.x + PATH_NODE_W / 2, y1 = a.y + PATH_NODE_H
          const x2 = b.x + PATH_NODE_W / 2, y2 = b.y
          const midY = (y1 + y2) / 2
          return (
            <path key={i} d={`M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`}
              fill="none" stroke="#5c6570" strokeOpacity="0.6" strokeWidth="1.5" markerEnd="url(#path-arrow)" />
          )
        })}
        {nodes.map(n => {
          const p = pos[n.id]
          const fill = PATH_NODE_TYPE_FILL[n.type] || '#9aa4ae'
          const isActive = activeId === n.id
          return (
            <g key={n.id} onClick={() => setActiveId(a => (a === n.id ? null : n.id))} style={{ cursor: 'pointer' }}>
              <rect x={p.x} y={p.y} width={PATH_NODE_W} height={PATH_NODE_H} rx="10"
                fill={fill} fillOpacity={isActive ? 0.28 : 0.12}
                stroke={fill} strokeOpacity={isActive ? 0.9 : 0.5} strokeWidth={isActive ? 2 : 1.5} />
              <foreignObject x={p.x + 8} y={p.y + 6} width={PATH_NODE_W - 16} height={PATH_NODE_H - 12}>
                <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: 12, lineHeight: 1.25, color: '#e7ebf0' }}>
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
              {active.resource.why_this_one ? <span className="text-mist-500"> — {active.resource.why_this_one}</span> : null}
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
function MiniBarChart({ chart }) {
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
function ConceptCard({ concept }) {
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

// §4i: recommendations render as small visual cards, not prose. Falls back gracefully to
// the plain expandable summary when a cycle wrote no structured metadata. Per
// field_investigation_method's visual-first rule: when a diagram/card already carries the
// meaning (a roadmap or a concept card), the prose summary is dropped entirely rather than
// rendered as a redundant paragraph above it.
function RecommendationCard({ insight }) {
  const [showSources, setShowSources] = useState(false)
  const md = insight.metadata || {}
  const hasPath = Array.isArray(md.path?.nodes) && md.path.nodes.length > 0
  const hasConcept = !!md.concept?.term
  const hasVisual = hasPath || hasConcept
  return (
    <div className="card border-t-2 border-gold-400/30 p-6">
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
        <div className="mt-3">
          <button onClick={() => setShowSources(s => !s)} className="text-[13px] text-mist-500 hover:text-mist-300">
            {showSources ? 'Hide sources' : `Sources (${insight.source_refs.length})`}
          </button>
          {showSources && <SourceRefs refs={insight.source_refs} />}
        </div>
      )}
    </div>
  )
}

// "The whole picture" — a donut of PARA-bucket note counts (from /api/stats), with a
// legend and an expandable link to the §4a overview narrative underneath.
const PARA_LABELS = { inbox: 'Inbox', project: 'Projects', area: 'Areas', resource: 'Resources', archive: 'Archive' }
const PARA_DONUT_ORDER = ['project', 'area', 'resource', 'archive', 'inbox']

function ParaDonut({ para }) {
  const buckets = PARA_DONUT_ORDER
    .map(k => ({ key: k, label: PARA_LABELS[k], count: para?.[k] || 0, color: PARA_COLORS[k] }))
    .filter(b => b.count > 0)
  const total = buckets.reduce((s, b) => s + b.count, 0)
  if (total === 0) return <p className="text-sm text-mist-400">No notes yet.</p>
  const R = 58, SW = 22, C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 150 150" className="h-36 w-36 shrink-0">
        <g transform="rotate(-90 75 75)">
          {buckets.map(b => {
            const len = (b.count / total) * C
            const el = (
              <circle key={b.key} cx="75" cy="75" r={R} fill="none" stroke={b.color} strokeWidth={SW}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
            )
            offset += len
            return el
          })}
        </g>
        <text x="75" y="72" textAnchor="middle" fill="#e7e9eb" style={{ fontSize: 24, fontWeight: 500 }}>{total}</text>
        <text x="75" y="90" textAnchor="middle" fill="#a7aeb5" style={{ fontSize: 10, letterSpacing: 1.5 }}>NOTES</text>
      </svg>
      <ul className="space-y-1.5">
        {buckets.map(b => (
          <li key={b.key} className="flex items-start gap-2 text-xs">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="text-mist-200">
              {b.label}
              <span className="text-mist-500 whitespace-nowrap"> — {b.count} note{b.count === 1 ? '' : 's'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WholePictureCard({ para, overview }) {
  const [showText, setShowText] = useState(false)
  return (
    <div className="card flex h-full flex-col border-t-2 border-emerald-400/40 p-6">
      <p className="label mb-4 !text-emerald-300">The whole picture</p>
      <ParaDonut para={para} />
      {overview && (
        <div className="mt-4 border-t border-ink-700 pt-3">
          <button onClick={() => setShowText(s => !s)} className="text-[13px] text-mist-500 hover:text-mist-300">
            {showText ? 'Hide narrative' : 'Read the narrative'}
          </button>
          {showText && <p className="mt-2 text-xs leading-relaxed text-mist-300">{overview.summary}</p>}
        </div>
      )}
    </div>
  )
}

// "Open loops" — captured-but-unfinished notes as progress-bar rows, days-open on the
// right, bar width proportional to how long it's been open. Parses the day count and
// title out of the template-generated open_loop summaries.
function parseOpenLoop(insight) {
  const summary = insight.summary || ''
  const daysMatch = summary.match(/(\d+)\s*days?/)
  const days = daysMatch ? parseInt(daysMatch[1], 10) : null
  const noteRef = (insight.source_refs || []).find(r => r.type === 'note')
  let title = noteRef?.title
  if (!title) {
    const q = summary.match(/"([^"]+)"/)
    title = q ? q[1] : summary.slice(0, 40)
  }
  return { id: insight.id, title, days, noteId: noteRef?.id }
}

function OpenLoopBars({ loops }) {
  const scrollRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)

  const rows = useMemo(() => (loops || []).map(parseOpenLoop), [loops])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [rows])

  if (!loops || loops.length === 0) {
    return <p className="text-sm text-mist-400">No open loops — nothing captured-but-unfinished right now.</p>
  }
  const maxDays = Math.max(1, ...rows.map(r => r.days || 0))
  return (
    <div className="relative">
      <div ref={scrollRef} className="max-h-[268px] space-y-4 overflow-y-auto scrollbar-thin pr-1">
        {rows.map((r, i) => {
          const color = i === 0 ? PARA_COLORS.project : PARA_COLORS.resource
          const pct = Math.max(12, Math.round(((r.days || 1) / maxDays) * 100))
          return (
            <div key={r.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                {r.noteId ? (
                  <Link href={`/notes/${r.noteId}`} className="truncate text-sm text-mist-100 hover:text-emerald-300">{r.title}</Link>
                ) : (
                  <span className="truncate text-sm text-mist-100">{r.title}</span>
                )}
                <span className="shrink-0 text-xs text-mist-500">{r.days != null ? `${r.days} day${r.days === 1 ? '' : 's'} open` : 'open'}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}66` }} />
              </div>
            </div>
          )
        })}
      </div>
      {overflowing && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-950 to-transparent" />}
    </div>
  )
}

// day ("YYYY-MM-DD") -> compact "M/D" label, parsed as a local calendar date (not UTC)
// so it can't drift a day depending on the browser's timezone.
function shortDateLabel(day) {
  const [, m, d] = day.split('-').map(Number)
  return `${m}/${d}`
}

// "Attention patterns" — a line chart of notes captured per day (from /api/stats), with
// the day of peak activity marked and real dates along the x-axis (not a generic "TIME"
// label) so the timeline is actually readable. The template attention_pattern insight
// rides along as the caption beneath it.
function AttentionChart({ series, caption }) {
  const pts = (series || []).filter(d => d && typeof d.count === 'number')
  if (pts.length < 2) {
    return <p className="text-sm text-mist-400">{caption || 'Not enough activity yet to chart attention over time.'}</p>
  }
  const W = 300, H = 150, padL = 26, padR = 12, padT = 16, padB = 24
  const maxV = Math.max(...pts.map(p => p.count))
  const niceMax = Math.max(4, Math.ceil(maxV / 2) * 2)
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR)
  const y = v => padT + (1 - v / niceMax) * (H - padT - padB)
  const line = pts.map((p, i) => `${x(i)},${y(p.count)}`).join(' ')
  const peakIdx = pts.reduce((m, p, i) => (p.count > pts[m].count ? i : m), 0)

  // Thin the date ticks so labels never overlap: show every point up to 6, otherwise
  // sample ~5 evenly-spaced indices (always including the first and last day).
  const maxLabels = 6
  const labelIdx = pts.length <= maxLabels
    ? pts.map((_, i) => i)
    : [...new Set([
        ...Array.from({ length: maxLabels - 1 }, (_, i) => Math.round(i * (pts.length - 1) / (maxLabels - 2))),
        peakIdx // always show the peak day's date, not just its count
      ])].sort((a, b) => a - b)

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0, niceMax / 2, niceMax].map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.08)" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fill="#a7aeb5" style={{ fontSize: 10 }}>{g}</text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.count)} r={i === peakIdx ? 4 : 2.5}
            fill={i === peakIdx ? '#f0d9a3' : '#5eead4'} stroke="#0b0f14" strokeWidth="1" />
        ))}
        <text x={x(peakIdx)} y={y(pts[peakIdx].count) - 8} textAnchor="middle" fill="#f0d9a3" style={{ fontSize: 10 }}>peak {pts[peakIdx].count}</text>
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fill="#a7aeb5" style={{ fontSize: 9 }}>
            {shortDateLabel(pts[i].day)}
          </text>
        ))}
      </svg>
      {caption && <p className="mt-2 text-xs leading-relaxed text-mist-400">{caption}</p>}
    </div>
  )
}

function OverviewTab({ data, loading, running, runStage, runNow, refreshPrompt, cycle, feedItems, stats, topics }) {
  const hasAnything = data && (data.overview || [...KIND_ORDER, 'user_model', 'recommendation'].some(k => data.byKind[k]?.length))
  const recommendations = data ? data.byKind.recommendation || [] : []
  const runLabel = runStage === 'embedding' ? 'Indexing notes…' : runStage === 'synthesizing' ? 'Running…' : 'Run now'

  return (
    <>
      {/* §4j: always-on breaking-news strip across the top of the Overview page */}
      <NewsStrip items={feedItems} />

      <div className="mb-8 flex justify-end">
        <button onClick={runNow} disabled={running} className="btn-primary">
          {runLabel}
        </button>
      </div>

      {loading && <p className="text-mist-400">Loading…</p>}

      {!loading && data && <StalenessBanner lastUpdated={data.lastUpdated} prompt={refreshPrompt} />}

      {!loading && <CycleHealthCard cycle={cycle} />}

      {!loading && !hasAnything && !data?.lastUpdated && <ProcessingNotice />}

      {!loading && !hasAnything && data?.lastUpdated && (
        <p className="text-sm text-mist-400">
          No insights yet. Click "Run now" to generate the four templated kinds, or ask Claude Code to write the overview (see above).
        </p>
      )}

      {!loading && hasAnything && (
        <>
          {/* Mockup top row: The Whole Picture (donut) · Open Loops (bars) · Attention Patterns (line) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <WholePictureCard para={stats?.para} overview={data.overview} />

            <div className="card flex h-full flex-col border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Open loops</p>
              <OpenLoopBars loops={data.byKind.open_loop} />
            </div>

            <div className="card flex h-full flex-col border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Attention patterns</p>
              <AttentionChart series={stats?.capturesByDay} caption={data.byKind.attention_pattern?.[0]?.summary} />
            </div>
          </div>

          <div className="mt-6">
            <KnowledgeGalaxy goals={data.byKind.inferred_goal} topics={topics} />
          </div>

          <div className="mt-6">
            <GoalArrowChart goals={data.byKind.inferred_goal} />
          </div>

          <p className="label mb-4 mt-10 !text-gold-400">Field Investigation Report</p>
          {recommendations.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {recommendations.map(insight => (
                <RecommendationCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="card p-6">
              <p className="text-sm text-mist-400">Nothing investigated yet.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}

// §4d: the answer-picking + custom-text-input mechanic for a PARA-fun queue item.
// Keyed by item.id at the call site so its custom-text state resets cleanly between
// questions.
function AnswerControls({ item, onAnswer, submitting }) {
  const [customText, setCustomText] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const assumedLabel = item.assumed_answer?.label

  function pick(option) {
    if (option.action === 'custom') {
      setShowCustom(true)
      return
    }
    onAnswer(item.id, { action: option.action, value: option.value })
  }

  function submitCustom() {
    if (!customText.trim()) return
    let value
    if (item.question_type === 'sort_inbox') return // no custom path for an exhaustive choice
    if (item.question_type === 'new_capture_proposal') value = { title: customText.trim(), para: 'inbox', content: null }
    else if (item.assumed_answer?.action === 'distill') value = { executive_summary: customText.trim() }
    else value = { title: customText.trim() }
    const action = item.question_type === 'new_capture_proposal' ? 'create_capture' : (item.assumed_answer?.action === 'distill' ? 'distill' : 'create_task')
    onAnswer(item.id, { action, value })
  }

  return (
    <div>
      {!showCustom ? (
        <div className="flex flex-wrap gap-3">
          {item.options.map((opt, i) => {
            const isAssumed = opt.label === assumedLabel
            const isSkip = opt.action === 'skip'
            return (
              <button
                key={i}
                onClick={() => pick(opt)}
                disabled={submitting}
                className={
                  isAssumed
                    ? 'btn-primary !px-6 !py-3 text-base'
                    : isSkip
                      ? 'btn-ghost !px-4'
                      : 'btn-secondary !px-6 !py-3 text-base'
                }
              >
                {isAssumed ? `${opt.label} (suggested)` : opt.label}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <input
            className="input"
            autoFocus
            placeholder="Write your own…"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitCustom() }}
          />
          <div className="flex gap-3">
            <button onClick={submitCustom} disabled={submitting || !customText.trim()} className="btn-primary">Submit</button>
            <button onClick={() => setShowCustom(false)} className="btn-secondary">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}

// §4d: one question at a time, big tappable buttons, not a form. The assumed
// answer is highlighted as the default; "write my own" only shows up when the
// row's own options include a custom entry (sort_inbox questions don't, since
// the four PARA buckets are already exhaustive).
function ParaFunCard({ item, onAnswer, submitting }) {
  return (
    <div className="card border-t-2 border-emerald-400/40 p-8">
      <p className="label mb-3 !text-emerald-300">{item.section}</p>
      <h2 className="mb-6 font-serif text-2xl font-light text-mist-100">{item.question_text}</h2>
      <AnswerControls key={item.id} item={item} onAnswer={onAnswer} submitting={submitting} />
      <SourceRefs refs={item.source_refs} />
    </div>
  )
}

function ParaFunTab({ queue, loading, onAnswer, submitting }) {
  if (loading) return <p className="text-mist-400">Loading…</p>
  if (queue.length === 0) {
    return (
      <p className="text-sm text-mist-400">
        Nothing waiting right now. Ask Claude Code to refresh the Mind Model (Overview tab) to generate new questions.
      </p>
    )
  }

  const [current, ...rest] = queue

  return (
    <>
      <ParaFunCard key={current.id} item={current} onAnswer={onAnswer} submitting={submitting} />
      {rest.length > 0 && (
        <p className="mt-4 text-center text-xs text-mist-500">{rest.length} more waiting</p>
      )}
    </>
  )
}

// §4j: "Latest in your world" — a breaking-news-style strip pinned to the top of the
// Overview page. Single line, always scrolling, cycle-authored items each linking a
// real source URL. Pauses on hover.
function NewsStrip({ items }) {
  const [paused, setPaused] = useState(false)
  if (!items?.length) return null
  const animate = items.length > 1 && !paused
  const track = items.length > 1 ? [...items, ...items] : items // duplicate for a seamless loop
  return (
    <div className="news-strip mb-6 flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
      <div className="flex shrink-0 items-center gap-2 border-r border-ink-700 bg-emerald-500/10 px-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Latest</span>
      </div>
      <div className="relative flex-1 overflow-hidden py-2">
        <div className={`flex w-max items-center ${animate ? 'news-strip-anim' : 'px-4'}`}>
          {track.map((it, i) => {
            const url = (it.source_refs || []).find(r => r.type === 'resource' && r.url)?.url
            const domain = classifyNewsDomain(it.summary)
            const color = domain ? NEWS_DOMAIN_HEX[domain] : '#c7ccd1'
            return (
              <span key={i} className="flex shrink-0 items-center">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="whitespace-nowrap text-[16.8px] hover:brightness-125" style={{ color }}>
                    {it.summary} <span className="text-gold-300">↗</span>
                  </a>
                ) : (
                  <span className="whitespace-nowrap text-[16.8px]" style={{ color }}>{it.summary}</span>
                )}
                <span className="px-6 text-ink-600">•</span>
              </span>
            )
          })}
        </div>
      </div>
      {items.length > 1 && (
        <button
          onClick={() => setPaused(p => !p)}
          aria-label={paused ? 'Resume scrolling' : 'Pause scrolling'}
          aria-pressed={paused}
          className="flex shrink-0 items-center border-l border-ink-700 px-3 text-mist-400 transition hover:text-mist-100"
        >
          {paused ? '▶' : '❚❚'}
        </button>
      )}
      <style jsx>{`
        .news-strip-anim { animation: news-scroll 69s linear infinite; }
        .news-strip:hover .news-strip-anim { animation-play-state: paused; }
        @keyframes news-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  )
}

// Knowledge Library (mind_knowledge topic "field_investigation_method"): the durable,
// cumulative archive of EVERYTHING the field investigation has learned across every
// cycle — not only the polished subset shown to the user in a given cycle's Field
// Investigation Report. An entry's `surfaced` flag marks whether it ever made that
// report; entries that didn't (filtered-out background research — definitions, sources,
// context read along the way) still live here. Browsed like a library: a shelf of
// recently-reinforced covers up top, a searchable/filterable grid below, domains as a
// sidebar — one accent color per domain, cycle_count doubling as a star rating (more
// reinforcement = better known). Visual-first per entry type once opened — the same
// rendered shapes as the report (roadmap/concept/chart).
const LIBRARY_ACCENTS = ['#f0d9a3', '#5eead4', '#b7a6f7', '#f0a3c4', '#96befa', '#a3e0a0']
const ENTRY_TYPE_LABEL = { concept: 'Concept', roadmap: 'Roadmap', fact: 'Fact', method: 'Method' }

function StarRating({ count }) {
  const stars = Math.min(5, Math.max(1, count || 1))
  return (
    <span className="text-[11px] tracking-tight text-gold-400" title={`reinforced ${count}×`}>
      {'★'.repeat(stars)}
      <span className="text-ink-500">{'★'.repeat(5 - stars)}</span>
    </span>
  )
}

function LibraryBookTile({ entry, accent, onOpen }) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg p-4 text-left transition hover:brightness-110"
      style={{ background: `linear-gradient(160deg, ${accent}2e, ${accent}0d)`, borderTop: `3px solid ${accent}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
          {ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
        </span>
        {!entry.surfaced && (
          <span className="rounded-full border border-ink-500 px-1.5 py-0.5 text-[10px] text-mist-500">background research</span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 font-serif text-lg font-light text-mist-100">{entry.title}</h3>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mist-400">{entry.summary}</p>
      <div className="mt-3 flex items-center justify-between">
        <StarRating count={entry.cycle_count} />
        <span className="text-[11px] text-mist-500">{entry.domain}</span>
      </div>
    </button>
  )
}

// Documents backing a library entry (source material, full diagrams/concept writeups) can run
// long, so the tile itself only ever shows a cover — the full content opens in its own window
// rather than pushing the grid around.
function LibraryEntryModal({ entry, accent, onClose }) {
  const [showSources, setShowSources] = useState(false)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!entry) return null
  const md = entry.metadata || {}
  const hasPath = Array.isArray(md.path?.nodes) && md.path.nodes.length > 0
  const hasConcept = !!md.concept?.term
  const hasVisual = hasPath || hasConcept

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card my-8 w-full max-w-2xl p-6"
        style={{ borderTop: `2px solid ${accent}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: accent }}>
                {ENTRY_TYPE_LABEL[entry.entry_type] || entry.entry_type}
              </span>
              {!entry.surfaced && (
                <span className="rounded-full border border-ink-500 px-1.5 py-0.5 text-[10px] text-mist-500">background research</span>
              )}
            </div>
            <h2 className="mt-2 font-serif text-2xl font-light text-mist-100">{entry.title}</h2>
            <p className="mt-1 text-[11px] text-mist-500">{entry.domain}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-mist-400 hover:text-mist-100" aria-label="Close">✕</button>
        </div>

        <div className="mt-5">
          {!hasVisual && <p className="text-sm leading-relaxed text-mist-100">{entry.summary}</p>}
          {hasPath && <PathDiagram path={md.path} />}
          {hasConcept && <ConceptCard concept={md.concept} />}
          {md.chart && <MiniBarChart chart={md.chart} />}
        </div>

        {md.detail && (
          <div className="mt-5 border-t border-ink-700 pt-4">
            <p className="label mb-2 !text-mist-300">Notes</p>
            <div className="space-y-3 text-sm leading-relaxed text-mist-300">
              {md.detail.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-ink-700 pt-3">
          <p className="text-[11px] text-mist-500">
            known since {new Date(entry.first_learned_at).toLocaleDateString()} · reinforced {entry.cycle_count}×
          </p>
          {entry.source_refs?.length > 0 && (
            <button onClick={() => setShowSources(s => !s)} className="text-[11px] text-mist-500 hover:text-mist-300">
              {showSources ? 'Hide sources' : `Sources (${entry.source_refs.length})`}
            </button>
          )}
        </div>
        {showSources && <SourceRefs refs={entry.source_refs} />}
      </div>
    </div>
  )
}

function KnowledgeLibraryTab() {
  const [entries, setEntries] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState(null)
  const [typeFilter, setTypeFilter] = useState('all')
  const [openEntry, setOpenEntry] = useState(null)
  const shelfRef = useRef(null)

  useEffect(() => {
    fetch('/api/mind/library')
      .then(r => r.json())
      .then(({ entries }) => setEntries(entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [])

  const accentByDomain = useMemo(() => {
    const domains = [...new Set((entries || []).map(e => e.domain))]
    return new Map(domains.map((d, i) => [d, LIBRARY_ACCENTS[i % LIBRARY_ACCENTS.length]]))
  }, [entries])

  const domainCounts = useMemo(() => {
    const counts = new Map()
    for (const e of entries || []) counts.set(e.domain, (counts.get(e.domain) || 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [entries])

  const recentlyReinforced = useMemo(
    () => [...(entries || [])].sort((a, b) => new Date(b.last_reinforced_at) - new Date(a.last_reinforced_at)).slice(0, 6),
    [entries]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (entries || []).filter(e => {
      if (domainFilter && e.domain !== domainFilter) return false
      if (typeFilter !== 'all' && e.entry_type !== typeFilter) return false
      if (q && !`${e.title} ${e.summary} ${e.domain}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [entries, search, domainFilter, typeFilter])

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-mist-400">Reading the library…</p>
      </div>
    )
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-sm text-mist-400">Nothing learned yet — this fills in as refresh cycles run their field investigation.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-mist-400">
        Everything the brain has learned across every cycle — including background research that never made a Field Investigation Report, not just what's been shown to you.
      </p>

      {recentlyReinforced.length > 0 && (
        <div>
          <p className="label mb-3 !text-mist-300">Recently reinforced</p>
          <div ref={shelfRef} className="flex gap-4 overflow-x-auto pb-2">
            {recentlyReinforced.map(entry => (
              <div key={entry.id} className="w-56 shrink-0">
                <LibraryBookTile
                  entry={entry}
                  accent={accentByDomain.get(entry.domain)}
                  onOpen={() => setOpenEntry(entry)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the library…"
          className="w-full rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-emerald-400/50 focus:outline-none sm:max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-mist-200 focus:border-emerald-400/50 focus:outline-none"
        >
          <option value="all">All types</option>
          {Object.entries(ENTRY_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {domainFilter && (
          <button onClick={() => setDomainFilter(null)} className="chip">
            {domainFilter} ✕
          </button>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_200px]">
        <div>
          <p className="label mb-4 !text-mist-300">{domainFilter || 'Library'} <span className="text-[11px] text-mist-500">{filtered.length}</span></p>
          {filtered.length === 0 ? (
            <p className="text-sm text-mist-400">No entries match.</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(entry => (
                <LibraryBookTile
                  key={entry.id}
                  entry={entry}
                  accent={accentByDomain.get(entry.domain)}
                  onOpen={() => setOpenEntry(entry)}
                />
              ))}
            </div>
          )}
        </div>
        <aside>
          <p className="label mb-3 !text-mist-300">Domains</p>
          <ul className="space-y-1">
            {domainCounts.map(([domain, count]) => (
              <li key={domain}>
                <button
                  onClick={() => setDomainFilter(d => (d === domain ? null : domain))}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition ${
                    domainFilter === domain ? 'bg-ink-800 text-mist-100' : 'text-mist-400 hover:text-mist-200'
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accentByDomain.get(domain) }} />
                  <span className="truncate">{domain}</span>
                  <span className="ml-auto text-[11px] text-mist-500">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {openEntry && (
        <LibraryEntryModal
          entry={openEntry}
          accent={accentByDomain.get(openEntry.domain)}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </div>
  )
}

export default function Mind({ user }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [runStage, setRunStage] = useState('') // §4h: 'embedding' | 'synthesizing' | '' — shown on the Run now button
  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [sections, setSections] = useState([])
  const [topics, setTopics] = useState([])
  const [cycles, setCycles] = useState(null)
  const [stats, setStats] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [onboarding, setOnboarding] = useState(null) // null = not yet checked; {onboarded:bool} once known
  const refreshPrompt = useMemo(() => buildRefreshPrompt(user), [user])
  // §4j: the feed section's items feed the Overview page's news strip.
  const feedItems = useMemo(() => {
    const feed = sections.find(isFeedRenderer)
    return feed ? sectionItems(feed) : []
  }, [sections])

  function load() {
    setLoading(true)
    return fetch('/api/mind/insights')
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
  }

  function loadQueue() {
    setQueueLoading(true)
    return fetch('/api/mind/queue')
      .then(r => r.json())
      .then(rows => {
        setQueue(rows)
        setQueueLoading(false)
      })
  }

  // The section registry a cycle wrote (or the server's minimal fallback if none has
  // run yet) — only the "feed" renderer is consumed today, by the news strip below.
  function loadSections() {
    return fetch('/api/mind/sections')
      .then(r => r.json())
      .then(({ sections: rows }) => setSections(rows))
      .catch(() => setSections([]))
  }

  // The knowledge-galaxy tree a cycle wrote (or the server's fallback seed if none
  // has run yet, per mind_knowledge topic "topic_map_method") — read-only here.
  function loadTopics() {
    return fetch('/api/mind/topics')
      .then(r => r.json())
      .then(({ topics: rows }) => setTopics(rows))
      .catch(() => setTopics([]))
  }

  // §4k: cycle-run history for the health card — read-only, refreshed after Run now too.
  function loadCycles() {
    return fetch('/api/mind/cycles')
      .then(r => r.json())
      .then(({ latest }) => setCycles(latest))
      .catch(() => setCycles(null))
  }

  // Bucket counts + per-day capture series that drive the donut and attention chart.
  function loadStats() {
    return fetch('/api/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }

  function loadOnboarding() {
    return fetch('/api/onboarding/status')
      .then(r => r.json())
      .then(setOnboarding)
      .catch(() => setOnboarding({ onboarded: true })) // fail open — never trap a real user behind a broken check
  }

  useEffect(() => {
    load()
    loadQueue()
    loadSections()
    loadTopics()
    loadCycles()
    loadStats()
    loadOnboarding()
  }, [])

  async function runNow() {
    setRunning(true)
    // §4h: embed any new/edited notes client-side first, so the synthesis job below
    // (interest_cluster's semantic grouping) sees fresh vectors. Best-effort — a
    // browser without Worker/WebGPU-ish support, or a failed model load, should never
    // block the deterministic synthesis the rest of this cycle depends on.
    try {
      setRunStage('embedding')
      await embedPendingNotes()
    } catch (err) {
      console.error('embedding step failed:', err)
    }
    setRunStage('synthesizing')
    await fetch('/api/mind/synthesize', { method: 'POST' })
    await load()
    await loadCycles()
    await loadStats()
    setRunStage('')
    setRunning(false)
  }

  async function answerQueue(id, { action, value }) {
    setSubmitting(true)
    setQueue(prev => prev.filter(q => q.id !== id))
    try {
      const res = await fetch(`/api/mind/queue/${id}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, value })
      })
      if (!res.ok) await loadQueue() // resync if the optimistic removal was wrong
    } finally {
      setSubmitting(false)
    }
  }

  if (onboarding === null) {
    return (
      <Layout user={user}>
        <div className="flex min-h-[70vh] items-center justify-center">
          <p className="text-mist-400">Arriving…</p>
        </div>
      </Layout>
    )
  }

  if (!onboarding.onboarded) {
    return (
      <Layout user={user}>
        <Onboarding onComplete={() => { setOnboarding({ onboarded: true }); load(); loadQueue(); loadSections(); loadTopics(); loadCycles(); loadStats() }} />
      </Layout>
    )
  }

  const headerTitle = tab === 'overview' ? 'Overview' : tab === 'library' ? 'Knowledge library' : 'PARA co-sorting'

  return (
    <Layout user={user}>
      <TourOverlay step="welcome" />
      <TourOverlay step="summary" />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Mind Model</p>
          <h1 className="font-serif text-4xl font-light text-mist-100">{headerTitle}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('overview')}
            className={`chip capitalize ${tab === 'overview' ? 'border-emerald-400/50 text-emerald-300' : ''}`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('parafun')}
            className={`chip capitalize ${tab === 'parafun' ? 'border-emerald-400/50 text-emerald-300' : ''}`}
          >
            PARA co-sorting{queue.length > 0 ? ` (${queue.length})` : ''}
          </button>
          <button
            onClick={() => setTab('library')}
            className={`chip capitalize ${tab === 'library' ? 'border-emerald-400/50 text-emerald-300' : ''}`}
          >
            Knowledge library
          </button>
        </div>
      </div>

      {tab === 'overview' ? (
        <OverviewTab data={data} loading={loading} running={running} runStage={runStage} runNow={runNow} refreshPrompt={refreshPrompt} cycle={cycles} feedItems={feedItems} stats={stats} topics={topics} />
      ) : tab === 'library' ? (
        <KnowledgeLibraryTab />
      ) : (
        <ParaFunTab queue={queue} loading={queueLoading} onAnswer={answerQueue} submitting={submitting} />
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
