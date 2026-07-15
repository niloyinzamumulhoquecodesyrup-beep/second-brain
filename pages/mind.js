import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import WaveVisualizer from '../components/WaveVisualizer'
import ParticleField from '../components/ParticleField'
import { requireSessionSSR } from '../lib/pageAuth'

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
// cycle writes onto each mind_sections row. Read-only insight/feed/reminder sections
// paint at their section's fixed accent; actionable queue/question sections use
// PARA_COLORS per item instead (assigned below in sectionItemColor), same as before.
const ACCENT_HEX = {
  emerald: '#5eead4',
  violet: '#b7a6f7',
  gold: '#f0d9a3',
  rose: '#fb7185',
  mist: '#9aa4ae'
}

// §4f corrected shape: sections are NOT a fixed list mirroring the app's own insight
// kinds/queue types — that first version was explicitly rejected (see §4f). The brain
// field renders whatever `mind_sections` the refresh cycle last wrote (fetched via
// /api/mind/sections, with a minimal built-in fallback server-side until a cycle has
// run at least once). This function is the one place that knows how to turn a
// section's `renderer` + `metadata` into a list of displayable items from data that
// already exists — no new taxonomy invented here, just a generic reader.
function sectionItems(def, data, queue) {
  const meta = def.metadata || {}
  if (def.renderer === 'insight_list') {
    const kinds = meta.insightKinds || []
    return kinds.flatMap(kind => {
      if (kind === 'overview') return data?.overview ? [{ id: 'overview', summary: data.overview.summary, source_refs: data.overview.source_refs }] : []
      return data?.byKind?.[kind] || []
    })
  }
  if (def.renderer === 'queue' || def.renderer === 'question') {
    const types = meta.questionTypes
    const excludes = meta.excludeTypes || []
    return queue.filter(q => {
      if (excludes.includes(q.question_type)) return false
      if (types && types.length > 0) return types.includes(q.question_type)
      return true
    })
  }
  // activity_digest / feed / reminder: cycle-authored prose, self-contained in metadata.
  return (meta.items || []).map((it, i) => ({
    id: `${def.slug}-${i}`,
    summary: it.text,
    source_refs: it.url ? [...(it.source_refs || []), { type: 'resource', title: it.text, url: it.url }] : (it.source_refs || [])
  }))
}

function isQueueRenderer(def) {
  return def.renderer === 'queue' || def.renderer === 'question'
}

// §4j: the "feed" renderer ("Latest in your world") presents its items as a scrolling
// ticker rather than a one-at-a-time readout.
function isFeedRenderer(def) {
  return def.renderer === 'feed'
}

function sectionItemColor(def, item) {
  if (isQueueRenderer(def)) return PARA_COLORS[item?.note_para] || PARA_COLORS.inbox
  return ACCENT_HEX[def.accent] || ACCENT_HEX.mist
}

function sectionItemText(def, item) {
  return isQueueRenderer(def) ? item.question_text : item.summary
}

// §4f step 3: simple universal commands recognized inside any section, typed through
// the same custom-text-input path already built for answers — not open-ended chat.
function matchUniversalCommand(raw) {
  const t = (raw || '').trim().toLowerCase()
  if (!t) return null
  if (['next', 'continue', 'move on'].includes(t)) return 'next'
  if (t === 'skip') return 'skip'
  if (['back to brain', 'back', 'home', 'exit'].includes(t)) return 'home'
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

// §4f voice bug fix: (1) Chrome/most browsers silently block speechSynthesis unless
// the very first speak() in the page's lifetime happens synchronously inside a real
// click handler — every speak() call here is invoked directly from an onClick/onSubmit,
// never from a useEffect on mount, so the very first one always qualifies. (2) Chrome's
// *default* voice (when none is picked) is frequently a remote, network-fetched voice —
// if that fetch stalls, the utterance hangs forever with speaking:true and no onstart/
// onend ever firing (confirmed against a live Chrome/macOS session: this exact
// symptom, unrelated to any gesture/GC issue — see Chromium issue 374263394). The fix
// is the opposite of the brief's original guidance: explicitly prefer a *local*
// (on-device, localService===true) voice once the list has loaded, instead of leaving
// utter.voice unset. (3) the SpeechSynthesisUtterance is kept in a ref so it isn't
// garbage-collected before its events fire (a real, separately-confirmed Chrome bug).
function useBrainVoice() {
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const utteranceRef = useRef(null)
  const localVoiceRef = useRef(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])
  // Chrome's voice list is empty on first call — call getVoices() eagerly on mount
  // (not tied to a gesture, just enumeration) and again once 'voiceschanged' fires, and
  // cache the first local voice found so speak() never has to wait on it.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    function pickLocalVoice() {
      const voices = window.speechSynthesis.getVoices()
      const local = voices.find(v => v.localService && v.lang?.startsWith('en')) || voices.find(v => v.localService)
      if (local) localVoiceRef.current = local
    }
    pickLocalVoice()
    window.speechSynthesis.addEventListener('voiceschanged', pickLocalVoice)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickLocalVoice)
  }, [])

  const speak = useCallback((text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    if (mutedRef.current || !text) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    function fire() {
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 0.98
      if (localVoiceRef.current) utter.voice = localVoiceRef.current
      utter.onstart = () => setSpeaking(true)
      utter.onend = () => setSpeaking(false)
      utter.onerror = () => setSpeaking(false)
      utteranceRef.current = utter
      synth.speak(utter)
    }
    // Chrome silently drops speak() if cancel() ran in the same tick — only cancel
    // (and only then delay) when something is actually queued; the page's very first
    // speak() call, with nothing to cancel, still fires synchronously inside the
    // click handler that triggered it, which is what satisfies the gesture gating.
    if (synth.speaking || synth.pending) {
      synth.cancel()
      setTimeout(fire, 50)
    } else {
      fire()
    }
  }, [])

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const toggleMute = useCallback(() => {
    setMuted(m => {
      const next = !m
      if (next && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
      if (next) setSpeaking(false)
      return next
    })
  }, [])

  return { speak, cancel, speaking, muted, toggleMute }
}

// Mounted content fades/scales in on mount rather than popping — the "convergence /
// push-in" feel §4f asks for, without needing a JS animation library.
function useMountTransition() {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return entered
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

Refresh my Mind Model following the refinement loop (mind_knowledge topic "refinement_loop"): read all mind_knowledge rows first — including "adhd_support_map" — then my notes, tasks, packets, activity_log, and current mind_insights via the Supabase MCP. Re-run POST /api/mind/synthesize to refresh the four templated kinds (interest_cluster, open_loop, attention_pattern, dormant_revival). Then write a fresh "overview" in your own words (mirror, not oracle — describe, don't direct), and update "user_model"/"recommendation" per the meta_map/learning_path_method/resource_research_method/adhd_support_map docs at whatever tier the data supports. Every user_model row must set section to exactly one of patterns | triggers | progress | cycles (per adhd_support_map — never diagnosis, defense mechanisms, transference, or risk/self-harm scoring). "inferred_goal" is one row PER distinct goal, never a single paragraph bundling several goals together — if the notes point at multiple separate things the user seems to be working toward, write one row for each. Every inferred_goal row's metadata must include a short name (e.g. metadata: {"name": "Neurobiology"}) — the dashboard renders it as a labeled banner, not a wall of prose, so a real short name beats a truncated first sentence every time. A goal that's gone quiet still counts as a goal and gets its own inferred_goal row even if a dormant_revival row already exists for the same notes — the two kinds answer different questions ("what are you working toward" vs. "what went quiet") and both can be true for the same thing at once. Write scope='user' calibration rows back to mind_knowledge. Insert everything via the Supabase MCP, superseding prior rows of each kind.

Then process the PARA-fun queue (para_fun_queue): first read all existing rows for this account. Leave still-valid pending rows untouched — do not duplicate or re-ask a question that's already waiting for an answer. Mark a row superseded if the note/data it was about has changed enough to invalidate it. Only after that, add new questions — including proposing a new capture if your processing surfaced something genuinely worth capturing. Build questions from the current open_loop/dormant_revival insights plus Inbox age, not new logic.

Hard rules, no exceptions: (1) never insert directly into notes, tasks, or packets as part of this step — every proposal, including a new capture, is a para_fun_queue row requiring the user's tap before anything real is created; (2) cap total new rows added this cycle (pending + new) at 5-8, at most 2-3 of which are new_capture_proposals — do not flood the queue; (3) before proposing a new capture, check existing notes/tags for a near-duplicate and skip the proposal if one already covers it; (4) every assumed_answer must have non-empty source_refs explaining what data or reasoning it came from — an assumed answer with no traceable source is a bug, not a shortcut; (5) an invented question_type must still use the same row shape (question_text, options, assumed_answer, section, priority_rank) — there is no side channel for writing data outside this mechanism.

Then re-emit mind_sections for "Visit Your Brain" (MIND_MODEL_BRIEF §4f, mind_knowledge topic "refinement_loop" — "Brain sections" rule): write the full section set this cycle produces (slug, title, accent, renderer, position, metadata), superseding the prior set rather than editing it in place. Ground every section in real data from this cycle — do not restate the app's own insight-kind/queue-type taxonomy as sections; include a section only when the data actually supports it (e.g. skip an interest feed with nothing real behind it). Renderer contract: insight_list -> metadata.insightKinds (mind_insights kind values, 'overview' allowed); queue/question -> metadata.questionTypes (omit for "all pending"); activity_digest/feed/reminder -> metadata.items: [{ text, url?, source_refs? }], self-contained prose so the client needs no further join. A "question" section answered via the queue mechanic (e.g. "research X deeper next cycle?") is a grant to act on next cycle.

Write those feed/reminder/question sections as a BRIEFING, not a form (§4f-addendum). This is not PARA-fun wearing a different skin — a "queue" section is just a doorway to that grind tool; feed/reminder/question sections must read like an assistant who already read everything. Concretely: (a) group by real topic understanding, not by table — if several notes are actually about the same thing but share no tag or note_links row (e.g. five unconnected notes all really about Satoshi), write ONE grouped item whose source_refs cite all of them; (b) report specifics and end each actionable item in a real question with a real consequence ("Mr. X said he can do it in five days — log that task as done and clear the loop?"), where the yes/no maps to a real airlocked answer action: set_para, distill, create_task, create_capture, or link_notes (the grouping-confirmation action) — for grouping confirmations, put the note ids to link in the assumed_answer so a tap calls link_notes; (c) when one line genuinely isn't enough, say so ("this one's more involved — want me to walk you through the notes?") and put the note ids in source_refs so the app can expand the real note content on request, rather than forcing a false one-liner; (d) you may pair "nothing pressing right now" with something aligned to user_model's sense of what the user enjoys — but the app has NO calendar/time-of-day concept (tasks.due_date is a date, not a time), so never claim "you're free at 4"; the notice-slack-and-suggest pattern is fine, a literal clock time is not. HARD CAP: 700 words total across everything Visit Your Brain would narrate/display in one visit — count words across all sections' line/summary content and trim/consolidate BEFORE writing, not after.

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

function StalenessBanner({ lastUpdated, prompt }) {
  const [copied, setCopied] = useState(false)
  const age = lastUpdated ? daysAgo(lastUpdated) : null
  const isStale = age === null || age >= STALE_DAYS
  if (!isStale) return null

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-8 rounded-xl border border-gold-400/30 bg-gold-500/5 p-4">
      <p className="text-sm text-gold-200">
        {age === null
          ? 'Your Mind Model has never been generated.'
          : `Your Mind Model is ${age} day${age === 1 ? '' : 's'} old.`}{' '}
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

function KindCard({ kind, insights, accentClass }) {
  if (!insights || insights.length === 0) return null
  return (
    <div className={`card p-6 ${accentClass || ''}`}>
      <p className={`label mb-2 ${accentClass ? '!text-violet-300' : ''}`}>{KIND_LABELS[kind]}</p>
      <div className="divide-y divide-ink-700">
        {insights.map(i => (
          <InsightRow key={i.id} insight={i} />
        ))}
      </div>
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

// One ribbon-flag banner: a rectangle plus a triangular-notched number tab on its outer
// edge (mirrored left/right) — the literal shape from the reference infographic, redrawn
// in the app's violet accent. Title only; no summary text renders here at all.
function GoalRibbon({ goal, num, side, rowCenterY, active, onClick }) {
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

  return (
    <g onClick={onClick} className="cursor-pointer">
      <rect
        x={rectX} y={rectY} width={GOAL_BW} height={GOAL_BH} rx={10}
        fill={active ? 'rgba(183,166,247,0.16)' : 'rgba(20,24,31,0.85)'}
        stroke="#b7a6f7" strokeOpacity={active ? 0.9 : 0.35} strokeWidth={active ? 2 : 1.2}
      />
      <polygon points={tabPoints} fill="#b7a6f7" fillOpacity={active ? 0.95 : 0.7} />
      <text x={tabTextX} y={rowCenterY} textAnchor="middle" dominantBaseline="central" fill="#0b0f14" style={{ fontSize: 20, fontWeight: 700 }}>
        {num}
      </text>
      <text x={titleX} y={rowCenterY} textAnchor={side === 'left' ? 'start' : 'end'} dominantBaseline="central"
        fill={active ? '#efeaff' : '#c7cbd1'} style={{ fontSize: 15, fontWeight: 500 }}>
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
                  <line x1={GOAL_SPINE_X - GOAL_GAP} y1={rowCenterY} x2={GOAL_SPINE_X - GOAL_SHAFT_W / 2} y2={rowCenterY} stroke="#b7a6f7" strokeOpacity="0.4" strokeWidth="2" />
                  <circle cx={GOAL_SPINE_X - GOAL_GAP} cy={rowCenterY} r="4" fill="#b7a6f7" />
                  <GoalRibbon goal={lGoal} num={String(i + 1).padStart(2, '0')} side="left" rowCenterY={rowCenterY}
                    active={activeId === lGoal.id} onClick={() => toggle(lGoal.id)} />
                </>
              )}
              {rGoal && (
                <>
                  <line x1={GOAL_SPINE_X + GOAL_SHAFT_W / 2} y1={rowCenterY} x2={GOAL_SPINE_X + GOAL_GAP} y2={rowCenterY} stroke="#b7a6f7" strokeOpacity="0.4" strokeWidth="2" />
                  <circle cx={GOAL_SPINE_X + GOAL_GAP} cy={rowCenterY} r="4" fill="#b7a6f7" />
                  <GoalRibbon goal={rGoal} num={String(half + i + 1).padStart(2, '0')} side="right" rowCenterY={rowCenterY}
                    active={activeId === rGoal.id} onClick={() => toggle(rGoal.id)} />
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
  if (!cycle) return null
  const s = CYCLE_STATUS_STYLE[cycle.status] || CYCLE_STATUS_STYLE.ok
  const when = cycle.completed_at || cycle.created_at
  const stat = (label, value) =>
    value == null ? null : (
      <span className="text-mist-400">{label} <span className="text-mist-200">{value}</span></span>
    )
  return (
    <div className="mb-8 rounded-xl border border-ink-700 bg-ink-950 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          <span className={s.text}>Last cycle {s.label}</span>
        </span>
        {when && <span className="text-mist-500">{relativeTimeLabel(new Date(when))}</span>}
        {stat('insights', cycle.insights_written)}
        {stat('sections', cycle.sections_written)}
        {stat('~tokens', cycle.tokens_used?.toLocaleString?.() ?? cycle.tokens_used)}
      </div>
      {cycle.notes && <p className="mt-2 text-xs text-mist-400">{cycle.notes}</p>}
    </div>
  )
}

// §4i: a learning-path recommendation carries a machine-renderable tree in
// metadata.path (mind_knowledge 01_learning_path_method.md's format: flat `nodes` with
// `requires` dependency edges). Render it as an expandable mind map — roots first, each
// node expandable to its resource/practice and its dependents. Per §1's ADHD rule, only
// the first root is open by default; everything else is collapsed behind a tap.
const NODE_TYPE_STYLE = {
  concept: 'text-violet-300 border-violet-400/40',
  fact: 'text-emerald-300 border-emerald-400/40',
  procedure: 'text-gold-300 border-gold-400/40'
}

function PathNode({ node, childrenOf, depth, defaultOpen, seen }) {
  const [open, setOpen] = useState(!!defaultOpen)
  if (seen.has(node.id)) return null // guard against malformed cyclic `requires`
  const nextSeen = new Set(seen); nextSeen.add(node.id)
  const kids = (childrenOf[node.id] || []).filter(k => !nextSeen.has(k.id))
  const hasDetail = node.resource || node.practice || kids.length > 0
  return (
    <div className={depth > 0 ? 'ml-4 border-l border-ink-700 pl-3' : ''}>
      <button
        onClick={() => hasDetail && setOpen(o => !o)}
        className="flex w-full items-center gap-2 py-1.5 text-left text-sm text-mist-100 hover:text-gold-200"
      >
        {hasDetail && <span className="text-xs text-mist-500">{open ? '▾' : '▸'}</span>}
        {node.type && (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${NODE_TYPE_STYLE[node.type] || 'text-mist-400 border-ink-700'}`}>
            {node.type}
          </span>
        )}
        <span>{node.label}</span>
      </button>
      {open && (
        <div className="mb-1 space-y-2">
          {node.resource && (
            <p className="ml-4 text-xs text-mist-400">
              {node.resource.url ? (
                <a href={node.resource.url} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">
                  {node.resource.title} ↗
                </a>
              ) : (
                <span className="text-mist-200">{node.resource.title}</span>
              )}
              {node.resource.why_this_one ? <span className="text-mist-500"> — {node.resource.why_this_one}</span> : null}
            </p>
          )}
          {node.practice && <p className="ml-4 text-xs text-emerald-200/80">✎ {node.practice}</p>}
          {kids.map(k => (
            <PathNode key={k.id} node={k} childrenOf={childrenOf} depth={depth + 1} defaultOpen={false} seen={nextSeen} />
          ))}
        </div>
      )}
    </div>
  )
}

function PathTree({ path }) {
  const nodes = Array.isArray(path?.nodes) ? path.nodes : []
  if (nodes.length === 0) return null
  const ids = new Set(nodes.map(n => n.id))
  const childrenOf = {}
  for (const n of nodes) {
    for (const req of n.requires || []) {
      if (ids.has(req)) (childrenOf[req] ||= []).push(n)
    }
  }
  // roots = nodes whose prerequisites are all outside the set (or none)
  const roots = nodes.filter(n => !(n.requires || []).some(r => ids.has(r)))
  const list = roots.length ? roots : nodes // fall back to flat if every node has an in-set req
  return (
    <div className="mt-1">
      {path.topic && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gold-200/80">{path.topic}</p>}
      {list.map((n, i) => (
        <PathNode key={n.id} node={n} childrenOf={childrenOf} depth={0} defaultOpen={i === 0} seen={new Set()} />
      ))}
      {(path.sequencing_mode || path.timeline) && (
        <p className="mt-2 text-[11px] text-mist-500">
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
      <p className="mt-2 text-[11px] text-mist-500">
        Source:{' '}
        {chart.source.url ? (
          <a href={chart.source.url} target="_blank" rel="noreferrer" className="hover:text-violet-300">{chart.source.title || chart.source.url} ↗</a>
        ) : (chart.source.title || 'cited')}
      </p>
    </div>
  )
}

// §4i: recommendations render as small visual cards, not prose. Falls back gracefully to
// the plain expandable summary when a cycle wrote no structured metadata.
function RecommendationCard({ insight }) {
  const [showSources, setShowSources] = useState(false)
  const md = insight.metadata || {}
  const hasPath = Array.isArray(md.path?.nodes) && md.path.nodes.length > 0
  return (
    <div className="card border-t-2 border-gold-400/30 p-6">
      <div className="flex items-start gap-2">
        {md.icon && <span className="text-lg leading-none">{md.icon}</span>}
        <p className="text-sm leading-relaxed text-mist-100">{insight.summary}</p>
      </div>

      {hasPath && <PathTree path={md.path} />}
      {md.chart && <MiniBarChart chart={md.chart} />}

      {md.suggestion && (
        <p className="mt-3 rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-100">
          <span className="font-medium text-violet-300">For you: </span>{md.suggestion}
        </p>
      )}

      {Array.isArray(md.keywords_used) && md.keywords_used.length > 0 && (
        <p className="mt-2 text-[11px] text-mist-500">researched via: {md.keywords_used.join(' · ')}</p>
      )}

      {insight.source_refs?.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowSources(s => !s)} className="text-[11px] text-mist-500 hover:text-mist-300">
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
        <text x="75" y="72" textAnchor="middle" fill="#fff" style={{ fontSize: 24, fontWeight: 300 }}>{total}</text>
        <text x="75" y="90" textAnchor="middle" fill="#9aa4ae" style={{ fontSize: 9, letterSpacing: 1.5 }}>NOTES</text>
      </svg>
      <ul className="space-y-1.5">
        {buckets.map(b => (
          <li key={b.key} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="text-mist-200">{b.label}</span>
            <span className="text-mist-500">— {b.count} note{b.count === 1 ? '' : 's'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function WholePictureCard({ para, overview }) {
  const [showText, setShowText] = useState(false)
  return (
    <div className="card border-t-2 border-emerald-400/40 p-6">
      <p className="label mb-4 !text-emerald-300">The whole picture</p>
      <ParaDonut para={para} />
      {overview && (
        <div className="mt-4 border-t border-ink-700 pt-3">
          <button onClick={() => setShowText(s => !s)} className="text-[11px] text-mist-500 hover:text-mist-300">
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
  if (!loops || loops.length === 0) {
    return <p className="text-sm text-mist-400">No open loops — nothing captured-but-unfinished right now.</p>
  }
  const rows = loops.map(parseOpenLoop)
  const maxDays = Math.max(1, ...rows.map(r => r.days || 0))
  return (
    <div className="relative">
      <div className="max-h-[268px] space-y-4 overflow-hidden">
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
      {rows.length > 4 && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink-950 to-transparent" />}
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
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fill="#6b7480" style={{ fontSize: 8 }}>{g}</text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="#5eead4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.count)} r={i === peakIdx ? 4 : 2.5}
            fill={i === peakIdx ? '#f0d9a3' : '#5eead4'} stroke="#0b0f14" strokeWidth="1" />
        ))}
        <text x={x(peakIdx)} y={y(pts[peakIdx].count) - 8} textAnchor="middle" fill="#f0d9a3" style={{ fontSize: 8 }}>peak {pts[peakIdx].count}</text>
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fill="#6b7480" style={{ fontSize: 7.5 }}>
            {shortDateLabel(pts[i].day)}
          </text>
        ))}
      </svg>
      {caption && <p className="mt-2 text-xs leading-relaxed text-mist-400">{caption}</p>}
    </div>
  )
}

function OverviewTab({ data, loading, running, runNow, refreshPrompt, cycle, feedItems, stats }) {
  const hasAnything = data && (data.overview || [...KIND_ORDER, 'user_model', 'recommendation'].some(k => data.byKind[k]?.length))
  const recommendations = data ? data.byKind.recommendation || [] : []

  return (
    <>
      {/* §4j: always-on breaking-news strip across the top of the Overview page */}
      <NewsStrip items={feedItems} />

      <div className="mb-8 flex justify-end">
        <button onClick={runNow} disabled={running} className="btn-primary">
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>

      {loading && <p className="text-mist-400">Loading…</p>}

      {!loading && data && <StalenessBanner lastUpdated={data.lastUpdated} prompt={refreshPrompt} />}

      {!loading && <CycleHealthCard cycle={cycle} />}

      {!loading && !hasAnything && (
        <p className="text-sm text-mist-400">
          No insights yet. Click "Run now" to generate the four templated kinds, or ask Claude Code to write the overview (see above).
        </p>
      )}

      {!loading && hasAnything && (
        <>
          {/* Mockup top row: The Whole Picture (donut) · Open Loops (bars) · Attention Patterns (line) */}
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <WholePictureCard para={stats?.para} overview={data.overview} />

            <div className="card border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Open loops</p>
              <OpenLoopBars loops={data.byKind.open_loop} />
            </div>

            <div className="card border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Attention patterns</p>
              <AttentionChart series={stats?.capturesByDay} caption={data.byKind.attention_pattern?.[0]?.summary} />
            </div>
          </div>

          <div className="mt-6">
            <KindCard kind="interest_cluster" insights={data.byKind.interest_cluster} />
          </div>

          <div className="mt-6">
            <GoalArrowChart goals={data.byKind.inferred_goal} />
          </div>

          <p className="label mb-4 mt-10 !text-gold-400">What you might do</p>
          {recommendations.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {recommendations.map(insight => (
                <RecommendationCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="card p-6">
              <p className="text-sm text-mist-400">No recommendation researched yet.</p>
            </div>
          )}
        </>
      )}
    </>
  )
}

// §4d/§4e/§4f shared: the answer-picking + custom-text-input mechanic. Used by
// ParaFunCard's card container and by Voice Flow / Visit Your Brain's immersive
// container — only the container differs, per §4e's "reuse, don't reimplement" rule.
// Keyed by item.id at the call site so its custom-text state resets cleanly between
// questions. `onCommand`, when passed (Visit Your Brain only), lets typed universal
// commands ("next"/"skip"/"back to brain") short-circuit before falling through to a
// literal answer — omitted entirely for ParaFunCard so existing §4d behavior is
// untouched.
function AnswerControls({ item, onAnswer, submitting, dimmed, onCommand }) {
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
    if (onCommand) {
      const cmd = matchUniversalCommand(customText)
      if (cmd) {
        onCommand(cmd)
        setCustomText('')
        setShowCustom(false)
        return
      }
    }
    let value
    if (item.question_type === 'sort_inbox') return // no custom path for an exhaustive choice
    if (item.question_type === 'new_capture_proposal') value = { title: customText.trim(), para: 'inbox', content: null }
    else if (item.assumed_answer?.action === 'distill') value = { executive_summary: customText.trim() }
    else value = { title: customText.trim() }
    const action = item.question_type === 'new_capture_proposal' ? 'create_capture' : (item.assumed_answer?.action === 'distill' ? 'distill' : 'create_task')
    onAnswer(item.id, { action, value })
  }

  return (
    <div className={`transition-opacity duration-500 ${dimmed ? 'opacity-40' : 'opacity-100'}`}>
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
            placeholder={onCommand ? 'Write your own… or type "next" / "skip" / "back to brain"' : 'Write your own…'}
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
      <h2 className="mb-6 font-serif text-2xl font-light text-white">{item.question_text}</h2>
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

// §4f: a small always-visible command box for read-only insight sections, which have
// no answer mechanic (and so no AnswerControls/"write my own" toggle) to hang typed
// commands off of. Actionable sections get the same command path via AnswerControls'
// onCommand instead — this is only for the other five.
function CommandInput({ onCommand, placeholder }) {
  const [text, setText] = useState('')
  function submit() {
    const cmd = matchUniversalCommand(text)
    if (cmd) {
      onCommand(cmd)
      setText('')
    }
  }
  return (
    <div className="mt-6 flex justify-center gap-2">
      <input
        className="input max-w-xs !py-2 text-xs"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      <button onClick={submit} className="btn-secondary !px-3 !py-2 text-xs">Go</button>
    </div>
  )
}

// §4f step 2: the entry screen — a full-bleed particle field with the section nodes
// floating over it. Nothing here is a list to scan top-to-bottom; it's a map to pick
// a point on. Clicking a node is the deliberate "begin" tap for that section's voice.
function BrainField({ sections, data, queue, lastUpdatedLabel, onSelectSection, fieldRef }) {
  const entered = useMountTransition()
  return (
    <div className="relative flex min-h-[560px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 px-6 py-16">
      <ParticleField ref={fieldRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950/50 via-transparent to-ink-950/80" />

      <div
        className={`relative z-10 flex flex-col items-center transition-all duration-700 ease-out ${entered ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        <p className="label mb-2 !text-emerald-300">Your brain</p>
        <p className="mb-10 text-sm text-mist-400">last updated {lastUpdatedLabel}</p>

        <div className="grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3">
          {sections.filter(def => !isFeedRenderer(def)).map(def => {
            const items = sectionItems(def, data, queue)
            const accentHex = ACCENT_HEX[def.accent] || ACCENT_HEX.mist
            return (
              <button
                key={def.id}
                onClick={() => onSelectSection(def)}
                className="group flex flex-col items-center gap-2 rounded-2xl border border-ink-600/80 bg-ink-900/60 px-4 py-6 text-center backdrop-blur transition hover:-translate-y-0.5"
                style={{ borderColor: 'var(--section-border, rgba(255,255,255,0.08))' }}
                onMouseEnter={e => { e.currentTarget.style.setProperty('--section-border', `${accentHex}80`) }}
                onMouseLeave={e => { e.currentTarget.style.setProperty('--section-border', 'rgba(255,255,255,0.08)') }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accentHex, boxShadow: `0 0 12px ${accentHex}` }} />
                <span className="text-sm text-mist-100 group-hover:text-white">{def.title}</span>
                <span className="text-xs text-mist-500">{items.length > 0 ? items.length : 'nothing yet'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// §4f-addendum "know when one line isn't enough": a feed/reminder item names the notes
// it's about in source_refs; on request we fetch the REAL note content (existing
// /api/notes/[id] path) and show it attributed per note — reading the source, not a
// paraphrase standing in for it.
function NoteRefsReader({ refs }) {
  const noteRefs = (refs || []).filter(r => r.type === 'note' && r.id)
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(null)
  const [loading, setLoading] = useState(false)
  if (noteRefs.length === 0) return null

  async function reveal() {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (notes) return
    setLoading(true)
    const fetched = await Promise.all(
      noteRefs.map(r => fetch(`/api/notes/${r.id}`).then(res => (res.ok ? res.json() : null)).catch(() => null))
    )
    setNotes(fetched)
    setLoading(false)
  }

  return (
    <div className="mt-3 text-left">
      <button onClick={reveal} className="text-xs text-emerald-300 hover:text-emerald-200">
        {open ? 'Hide notes' : noteRefs.length > 1 ? `Walk me through the ${noteRefs.length} notes` : 'Read the note'}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {loading && <p className="text-xs text-mist-500">Reading…</p>}
          {notes?.map((n, i) =>
            n ? (
              <div key={n.id} className="rounded-lg border border-ink-700 bg-ink-900/50 p-3">
                <p className="text-xs font-medium text-mist-100">{n.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-mist-400">{n.executive_summary || n.content || '(empty note)'}</p>
              </div>
            ) : (
              <p key={i} className="text-xs text-mist-500">A note couldn't be loaded.</p>
            )
          )}
        </div>
      )}
    </div>
  )
}

// §4j: "Latest in your world" — a breaking-news-style strip pinned to the top of the
// Overview page (not inside Visit Your Brain). Single line, always scrolling, cycle-
// authored items each linking a real source URL. Pauses on hover.
function NewsStrip({ items }) {
  if (!items?.length) return null
  const animate = items.length > 1
  const track = animate ? [...items, ...items] : items // duplicate for a seamless loop
  return (
    <div className="news-strip mb-6 flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
      <div className="flex shrink-0 items-center gap-2 border-r border-ink-700 bg-emerald-500/10 px-3">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Latest</span>
      </div>
      <div className="relative flex-1 overflow-hidden py-2">
        <div className={`flex w-max items-center ${animate ? 'news-strip-anim' : 'px-4'}`}>
          {track.map((it, i) => {
            const url = (it.source_refs || []).find(r => r.type === 'resource' && r.url)?.url
            return (
              <span key={i} className="flex shrink-0 items-center">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="whitespace-nowrap text-xs text-mist-200 hover:text-white">
                    {it.summary} <span className="text-gold-300">↗</span>
                  </a>
                ) : (
                  <span className="whitespace-nowrap text-xs text-mist-200">{it.summary}</span>
                )}
                <span className="px-6 text-ink-600">•</span>
              </span>
            )
          })}
        </div>
      </div>
      <style jsx>{`
        .news-strip-anim { animation: news-scroll 60s linear infinite; }
        .news-strip:hover .news-strip-anim { animation-play-state: paused; }
        @keyframes news-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  )
}

// §4f step 2, inside a section: read-only insight kinds get a calm visualizer + voice
// readout with Next/Back to brain; actionable queue kinds (para_fun_queue) reuse the
// exact §4d/§4e mechanic — same WaveVisualizer, same AnswerControls, same onAnswer.
function BrainSection({ def, items, onAnswer, onExit, speak, cancel, speaking, muted, toggleMute, submitting }) {
  const entered = useMountTransition()
  const [index, setIndex] = useState(0)
  const isQueue = isQueueRenderer(def)
  const clampedIndex = items.length ? Math.min(index, items.length - 1) : 0
  const current = items[clampedIndex]

  function goNext() {
    if (items.length < 2) return
    const nextIndex = (clampedIndex + 1) % items.length
    setIndex(nextIndex)
    speak(sectionItemText(def, items[nextIndex]))
  }

  function handleBackToBrain() {
    cancel()
    onExit()
  }

  function handleAnswer(id, payload) {
    onAnswer(id, payload)
    if (items.length > 1) goNext()
    else handleBackToBrain()
  }

  function handleCommand(cmd) {
    if (cmd === 'next') goNext()
    else if (cmd === 'skip') {
      if (isQueue && current) handleAnswer(current.id, { action: 'skip' })
      else goNext()
    } else if (cmd === 'home') handleBackToBrain()
  }

  const color = current ? sectionItemColor(def, current) : (ACCENT_HEX[def.accent] || ACCENT_HEX.mist)
  const caption = !current
    ? `No ${def.title.toLowerCase()} recorded yet.`
    : isQueue
      ? current.question_text
      : def.title

  return (
    <div className={`flex flex-col items-center transition-all duration-500 ease-out ${entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
      <div className="relative w-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-950">
        <WaveVisualizer color={color} speaking={speaking} className="h-[300px] w-full sm:h-[380px]" />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 sm:px-16">
          <p className="max-w-2xl text-center font-serif text-2xl font-light text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.7)] sm:text-3xl">
            {caption}
          </p>
        </div>

        <p className="absolute left-5 top-5 text-[11px] uppercase tracking-[0.2em] text-mist-400">
          {def.title}{items.length > 1 ? ` · ${clampedIndex + 1}/${items.length}` : ''}
        </p>

        <button
          onClick={() => (speaking ? cancel() : toggleMute())}
          className="absolute right-5 top-5 rounded-full border border-ink-600/80 bg-ink-950/60 px-3 py-1.5 text-xs text-mist-300 backdrop-blur transition hover:border-mist-300/50 hover:text-white"
        >
          {speaking ? 'Skip narration' : muted ? 'Unmute voice' : 'Mute voice'}
        </button>
      </div>

      <div className="mt-8 w-full max-w-xl">
        {!current ? null : isQueue ? (
          <AnswerControls
            key={current.id}
            item={current}
            onAnswer={handleAnswer}
            submitting={submitting}
            dimmed={speaking}
            onCommand={handleCommand}
          />
        ) : (
          <div className={`transition-opacity duration-500 ${speaking ? 'opacity-40' : 'opacity-100'}`}>
            <p className="text-sm leading-relaxed text-mist-100">{current.summary}</p>
            <NoteRefsReader refs={current.source_refs} />
          </div>
        )}
        {current && <SourceRefs refs={current.source_refs} />}
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <button onClick={handleBackToBrain} className="btn-secondary">← Back to brain</button>
        {items.length > 1 && (
          <button onClick={goNext} className="btn-ghost">Next →</button>
        )}
      </div>

      {!isQueue && <CommandInput onCommand={handleCommand} placeholder='Type "next" or "back to brain"' />}
    </div>
  )
}

export default function Mind({ user }) {
  const [tab, setTab] = useState('overview')
  const [mode, setMode] = useState('brain') // §4f: 'brain' (default, the destination) | 'list' (§1 escape hatch)
  const [activeSectionId, setActiveSectionId] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [sections, setSections] = useState([])
  const [sectionsLoading, setSectionsLoading] = useState(true)
  const [cycles, setCycles] = useState(null)
  const [stats, setStats] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const refreshPrompt = useMemo(() => buildRefreshPrompt(user), [user])
  // §4j: the feed section's items feed the Overview-page news strip (not a brain node).
  const feedItems = useMemo(() => {
    const feed = sections.find(isFeedRenderer)
    return feed ? sectionItems(feed, data, queue) : []
  }, [sections, data, queue])
  const fieldRef = useRef(null)
  const voice = useBrainVoice()

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

  // §4f: the section registry a cycle wrote (or the server's minimal fallback if none
  // has run yet) — fetched once alongside insights/queue, not derived from them.
  function loadSections() {
    setSectionsLoading(true)
    return fetch('/api/mind/sections')
      .then(r => r.json())
      .then(({ sections: rows }) => {
        setSections(rows)
        setSectionsLoading(false)
      })
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

  useEffect(() => {
    load()
    loadQueue()
    loadSections()
    loadCycles()
    loadStats()
  }, [])

  async function runNow() {
    setRunning(true)
    await fetch('/api/mind/synthesize', { method: 'POST' })
    await load()
    await loadCycles()
    await loadStats()
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

  const brainUpdatedAt = useMemo(() => {
    const dates = []
    if (data?.lastUpdated) dates.push(new Date(data.lastUpdated).getTime())
    for (const q of queue) if (q.created_at) dates.push(new Date(q.created_at).getTime())
    return dates.length ? new Date(Math.max(...dates)) : null
  }, [data, queue])
  const brainUpdatedLabel = relativeTimeLabel(brainUpdatedAt)

  const activeSectionDef = sections.find(d => d.id === activeSectionId) || null
  const activeSectionItemsList = activeSectionDef ? sectionItems(activeSectionDef, data, queue) : []

  // §4f voice fix note (1): this click handler is the "deliberate begin tap" — the
  // very first speechSynthesis.speak() in the page's life happens synchronously here,
  // inside a real user gesture, so the browser doesn't silently swallow it.
  function enterBrain() {
    setMode('brain')
    voice.speak(`Your brain, last updated ${brainUpdatedLabel}.`)
  }

  function goToListView() {
    voice.cancel()
    setActiveSectionId(null)
    setMode('list')
  }

  function selectSection(def) {
    const items = sectionItems(def, data, queue)
    setActiveSectionId(def.id)
    fieldRef.current?.boost?.()
    const first = items[0]
    voice.speak(first ? sectionItemText(def, first) : `No ${def.title.toLowerCase()} recorded yet.`)
  }

  function exitToField() {
    setActiveSectionId(null)
  }

  const headerTitle =
    mode === 'list'
      ? (tab === 'overview' ? 'Overview' : 'PARA, made fun')
      : (activeSectionDef ? activeSectionDef.title : 'Your Brain')

  return (
    <Layout user={user}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Mind Model</p>
          <h1 className="font-serif text-4xl font-light text-white">{headerTitle}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'list' && (
            <>
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
                PARA, made fun{queue.length > 0 ? ` (${queue.length})` : ''}
              </button>
            </>
          )}
          <button
            onClick={mode === 'brain' ? goToListView : enterBrain}
            className="chip border-emerald-400/50 text-emerald-300"
          >
            {mode === 'brain' ? 'List view' : 'Visit Your Brain'}
          </button>
        </div>
      </div>

      {mode === 'list' ? (
        tab === 'overview' ? (
          <OverviewTab data={data} loading={loading} running={running} runNow={runNow} refreshPrompt={refreshPrompt} cycle={cycles} feedItems={feedItems} stats={stats} />
        ) : (
          <ParaFunTab queue={queue} loading={queueLoading} onAnswer={answerQueue} submitting={submitting} />
        )
      ) : loading || queueLoading || sectionsLoading ? (
        <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-ink-700 bg-ink-950">
          <p className="text-mist-400">Arriving…</p>
        </div>
      ) : activeSectionDef ? (
        <BrainSection
          key={activeSectionDef.id}
          def={activeSectionDef}
          items={activeSectionItemsList}
          onAnswer={answerQueue}
          onExit={exitToField}
          speak={voice.speak}
          cancel={voice.cancel}
          speaking={voice.speaking}
          muted={voice.muted}
          toggleMute={voice.toggleMute}
          submitting={submitting}
        />
      ) : (
        <BrainField
          sections={sections}
          data={data}
          queue={queue}
          lastUpdatedLabel={brainUpdatedLabel}
          onSelectSection={selectSection}
          fieldRef={fieldRef}
        />
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
