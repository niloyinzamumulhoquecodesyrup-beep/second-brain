import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import KnowledgeGalaxy from '../components/KnowledgeGalaxy'
import Onboarding from '../components/Onboarding'
import TourOverlay from '../components/TourOverlay'
import { useTheme } from '../components/ThemeProvider'
import { requireSessionSSR } from '../lib/pageAuth'
import { embedPendingNotes } from '../lib/clientEmbeddings'
import { KIND_LABELS, SourceRefs, PathDiagram, MiniBarChart, ConceptCard } from '../components/InsightCards'

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
// Dark-mode values are bright/pale — meant to glow against a near-black ticker strip.
// Drawn directly as link text (not a tinted background), those same values measure
// well under 4.5:1 against a light/cream page, so light mode gets its own darker,
// still-recognizable-hue set. Kept in step with KnowledgeGalaxy.js's CLUSTER_RGB,
// which faces the identical dark-glow-vs-light-page problem for the same four domains.
const NEWS_DOMAIN_HEX = {
  science: '#6ee796',
  technology: '#60bef9',
  business: '#fb7192',
  humanities: '#c091fc'
}
const NEWS_DOMAIN_HEX_LIGHT = {
  science: '#15803d',
  technology: '#1568a8',
  business: '#b8305a',
  humanities: '#7c4fd1'
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

Then tend the productivity planner (mind_knowledge topic "productivity_planner_method"; tables planner_routines / planner_blocks / planner_prompts). Read all three for this account first, including answered planner_prompts rows — a free-text answer to "What do you do on a regular basis?" or a picked option on one of your earlier questions is user-provided ground truth waiting to be turned into structure. From those answers plus the user_model, tasks with due dates, open loops, and recurring themes in the notes, write: (a) at most 2-3 new planner_blocks rows with status='suggested' and source='cycle', each pinned to a real upcoming plan_date with a sensible start_min/duration_min (minutes from midnight) and category (sleep|work|study|exercise|meals|leisure|other), and non-empty source_refs naming the evidence — a suggestion with no traceable source is a bug; (b) at most 1-2 new planner_prompts rows — prompt_type='question' (with options) only when a real evidence gap blocks a better suggestion (e.g. the notes hint at swimming but never say which days), or prompt_type='routine_suggestion' with a complete suggestion payload {"title", "category", "days" (0=Mon..6=Sun), "start_min", "duration_min"}. Planner hard rules, same posture as the PARA queue: never INSERT or UPDATE planner_routines directly and never create or edit planner_blocks rows whose status is active/done/skipped — acceptance happens only through the user's tap in the app; don't re-suggest anything already pending or dismissed within the last two weeks; mark your own stale still-'suggested' blocks whose plan_date has passed as dismissed; if the user has no routines and no answered prompts yet, skip suggestions entirely and leave at most the single standing question.

Style rule for every piece of text you write this cycle — overview, user_model, recommendation summaries and metadata.detail, feed items, para_fun_queue question_text/options, planner_prompts, mind_knowledge calibration rows, mind_cycle_runs notes, all of it: no em dashes (—). Use a period, comma, colon, or "and" instead. No exceptions, no kind is exempt.

Finally, record the cycle: write one mind_cycle_runs row (started_at, completed_at, tokens_used = your own honest estimate of tokens spent this cycle, sections_written, insights_written, status = ok | partial | error, notes = free text on anything that failed). Record partial and failed cycles honestly, the dashboard surfaces them so I can tell whether the refresh actually did what it claimed (§4k).`
}

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
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
        <text x="75" y="72" textAnchor="middle" style={{ fontSize: 24, fontWeight: 500, fill: 'rgb(var(--mist-100))' }}>{total}</text>
        <text x="75" y="90" textAnchor="middle" style={{ fontSize: 10, letterSpacing: 1.5, fill: 'rgb(var(--mist-300))' }}>NOTES</text>
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

// "Reminders" (formerly "Open loops") — things captured but never finished, read as
// generic nudges ("go swimming", not "note X has sat in your inbox N days") with a
// one-tap way to put one on today's Work plan. Parses the day count and title out of
// the template-generated open_loop summaries the same way the old bars did.
function parseReminder(insight) {
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

function ReminderRows({ reminders }) {
  const scrollRef = useRef(null)
  const [overflowing, setOverflowing] = useState(false)
  const [added, setAdded] = useState(() => new Set())

  const rows = useMemo(() => (reminders || []).map(parseReminder), [reminders])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [rows])

  async function addToDay(r) {
    setAdded(prev => new Set(prev).add(r.id))
    const today = new Date()
    const due = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: r.title, note_id: r.noteId || null, due_date: due })
    })
  }

  if (!reminders || reminders.length === 0) {
    return <p className="text-sm text-mist-400">No reminders right now.</p>
  }
  return (
    <div className="relative">
      <div ref={scrollRef} className="max-h-[268px] space-y-3 overflow-y-auto scrollbar-thin pr-1">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {r.noteId ? (
                <Link href={`/notes/${r.noteId}`} className="truncate text-sm text-mist-100 hover:text-emerald-300 block">{r.title}</Link>
              ) : (
                <span className="truncate text-sm text-mist-100 block">{r.title}</span>
              )}
              {r.days != null && <span className="text-xs text-mist-500">sitting for {r.days} day{r.days === 1 ? '' : 's'}</span>}
            </div>
            <button
              onClick={() => addToDay(r)}
              disabled={added.has(r.id)}
              className="shrink-0 chip !py-1 hover:border-emerald-400/60 hover:text-emerald-300"
            >
              {added.has(r.id) ? '✓ added' : '+ add to my day'}
            </button>
          </div>
        ))}
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
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="rgb(var(--mist-500) / 0.18)" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" style={{ fontSize: 10, fill: 'rgb(var(--mist-300))' }}>{g}</text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="rgb(var(--emerald-400))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.count)} r={i === peakIdx ? 4 : 2.5}
            fill={i === peakIdx ? 'rgb(var(--gold-400))' : 'rgb(var(--emerald-400))'} stroke="rgb(var(--ink-900))" strokeWidth="1" />
        ))}
        <text x={x(peakIdx)} y={y(pts[peakIdx].count) - 8} textAnchor="middle" style={{ fontSize: 10, fill: 'rgb(var(--gold-400))' }}>peak {pts[peakIdx].count}</text>
        {labelIdx.map(i => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" style={{ fontSize: 9, fill: 'rgb(var(--mist-300))' }}>
            {shortDateLabel(pts[i].day)}
          </text>
        ))}
      </svg>
      {caption && <p className="mt-2 text-xs leading-relaxed text-mist-400">{caption}</p>}
    </div>
  )
}

function OverviewTab({ data, loading, running, runStage, refreshPrompt, cycle, feedItems, stats, topics, library }) {
  const hasAnything = data && (data.overview || [...KIND_ORDER, 'user_model', 'recommendation'].some(k => data.byKind[k]?.length))
  const runLabel = runStage === 'embedding' ? 'Indexing notes…' : 'Syncing…'

  return (
    <>
      {/* §4j: always-on breaking-news strip across the top of the Overview page */}
      <NewsStrip items={feedItems} />

      {running && (
        <div className="mb-8 flex justify-end">
          <span className="text-xs uppercase tracking-[0.14em] text-mist-500">{runLabel}</span>
        </div>
      )}

      {loading && <p className="text-mist-400">Loading…</p>}

      {!loading && data && <StalenessBanner lastUpdated={data.lastUpdated} prompt={refreshPrompt} />}

      {!loading && <CycleHealthCard cycle={cycle} />}

      {!loading && !hasAnything && !data?.lastUpdated && <ProcessingNotice />}

      {!loading && !hasAnything && data?.lastUpdated && (
        <p className="text-sm text-mist-400">
          No insights yet. The Mind Model refreshes automatically every couple of minutes while this page is open,
          or ask Claude Code to write the overview (see above).
        </p>
      )}

      {!loading && hasAnything && (
        <>
          {/* Mockup top row: The Whole Picture (donut) · Reminders (rows) · Attention Patterns (line) */}
          <div className="grid gap-6 lg:grid-cols-3">
            <WholePictureCard para={stats?.para} overview={data.overview} />

            <div className="card flex h-full flex-col border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Reminders</p>
              <ReminderRows reminders={data.byKind.open_loop} />
            </div>

            <div className="card flex h-full flex-col border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-4 !text-emerald-300">Attention patterns</p>
              <AttentionChart series={stats?.capturesByDay} caption={data.byKind.attention_pattern?.[0]?.summary} />
            </div>
          </div>

          <div className="mt-6">
            <KnowledgeGalaxy goals={data.byKind.inferred_goal} topics={topics} library={library} />
          </div>
        </>
      )}
    </>
  )
}

// §4j: "Latest in your world" — a breaking-news-style strip pinned to the top of the
// Overview page. Single line, always scrolling, cycle-authored items each linking a
// real source URL. Pauses on hover.
function NewsStrip({ items }) {
  const [paused, setPaused] = useState(false)
  const { theme } = useTheme()
  if (!items?.length) return null
  const domainHex = theme === 'light' ? NEWS_DOMAIN_HEX_LIGHT : NEWS_DOMAIN_HEX
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
            const color = domain ? domainHex[domain] : 'rgb(var(--mist-300))'
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
  const runningRef = useRef(false) // mirrors `running` for the auto-run interval's closure, which otherwise sees a stale value
  const [runStage, setRunStage] = useState('') // §4h: 'embedding' | 'synthesizing' | '' — shown while auto-running
  const [sections, setSections] = useState([])
  const [topics, setTopics] = useState([])
  const [libraryEntries, setLibraryEntries] = useState([])
  const [cycles, setCycles] = useState(null)
  const [stats, setStats] = useState(null)
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

  // The durable field-investigation archive (mind_knowledge_library) — the galaxy
  // joins this by title alongside inferred_goal so a genuinely investigated topic
  // (e.g. Ontology, surfaced as a "recommendation"/concept, not a standalone goal)
  // still lights up and gets a heat gradient instead of sitting dim forever.
  function loadLibrary() {
    return fetch('/api/mind/library')
      .then(r => r.json())
      .then(({ entries }) => setLibraryEntries(entries || []))
      .catch(() => setLibraryEntries([]))
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
    loadSections()
    loadTopics()
    loadLibrary()
    loadCycles()
    loadStats()
    loadOnboarding()
  }, [])

  // Auto-run the cycle every 2 minutes while this page stays open — replaces the old
  // manual "Run now" button. Skips a tick if the previous run is still in flight.
  useEffect(() => {
    const id = setInterval(() => {
      if (!runningRef.current) runNow()
    }, 2 * 60 * 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runNow() {
    runningRef.current = true
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
    runningRef.current = false
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
        <Onboarding onComplete={() => { setOnboarding({ onboarded: true }); load(); loadSections(); loadTopics(); loadLibrary(); loadCycles(); loadStats() }} />
      </Layout>
    )
  }

  const headerTitle = tab === 'overview' ? 'Overview' : 'Knowledge library'

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
            onClick={() => setTab('library')}
            className={`chip capitalize ${tab === 'library' ? 'border-emerald-400/50 text-emerald-300' : ''}`}
          >
            Knowledge library
          </button>
        </div>
      </div>

      {tab === 'overview' ? (
        <OverviewTab data={data} loading={loading} running={running} runStage={runStage} refreshPrompt={refreshPrompt} cycle={cycles} feedItems={feedItems} stats={stats} topics={topics} library={libraryEntries} />
      ) : (
        <KnowledgeLibraryTab />
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
