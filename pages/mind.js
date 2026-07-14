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

// §4f: fixed accent per section for the read-only insight kinds (which have no PARA
// bucket of their own) — reuses the same emerald/violet/gold groupings the flat
// Overview tab already established. Actionable queue sections use PARA_COLORS per
// item instead (assigned below in sectionItemColor).
const ACCENT_HEX = {
  emerald: '#5eead4',
  violet: '#b7a6f7',
  gold: '#f0d9a3',
  rose: '#fb7185'
}

// §4f "Sections, selectable, not a queue" — a navigation layer over data that
// already exists, no new taxonomy. Five templated mind_insights kinds, the two
// Claude-Code-written kinds, and the two para_fun_queue groupings (actionable vs.
// new-capture proposals).
const SECTION_DEFS = [
  { id: 'interest_cluster', label: 'Interest clusters', kind: 'insight', insightKind: 'interest_cluster', accent: 'emerald' },
  { id: 'open_loop', label: 'Open loops', kind: 'insight', insightKind: 'open_loop', accent: 'emerald' },
  { id: 'dormant_revival', label: 'Dormant revival', kind: 'insight', insightKind: 'dormant_revival', accent: 'emerald' },
  { id: 'attention_pattern', label: 'Attention patterns', kind: 'insight', insightKind: 'attention_pattern', accent: 'emerald' },
  { id: 'inferred_goal', label: 'Inferred goals', kind: 'insight', insightKind: 'inferred_goal', accent: 'emerald' },
  { id: 'user_model', label: 'How you seem to work', kind: 'insight', insightKind: 'user_model', accent: 'violet' },
  { id: 'recommendation', label: 'What you might do', kind: 'insight', insightKind: 'recommendation', accent: 'gold' },
  { id: 'queue_actionable', label: 'Sort, distill, express', kind: 'queue', queueFilter: 'actionable', accent: 'rose' },
  { id: 'new_capture', label: 'New captures', kind: 'queue', queueFilter: 'new_capture_proposal', accent: 'gold' }
]

function sectionItems(def, data, queue) {
  if (def.kind === 'insight') return (data?.byKind?.[def.insightKind]) || []
  if (def.queueFilter === 'new_capture_proposal') return queue.filter(q => q.question_type === 'new_capture_proposal')
  return queue.filter(q => q.question_type !== 'new_capture_proposal')
}

function sectionItemColor(def, item) {
  if (def.kind === 'queue') return PARA_COLORS[item?.note_para] || PARA_COLORS.inbox
  return ACCENT_HEX[def.accent]
}

function sectionItemText(def, item) {
  return def.kind === 'queue' ? item.question_text : item.summary
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

const REFRESH_PROMPT = `Refresh my Mind Model following the refinement loop (mind_knowledge topic "refinement_loop"): read all mind_knowledge rows first, then my notes, tasks, packets, activity_log, and current mind_insights via the Supabase MCP. Re-run POST /api/mind/synthesize to refresh the four templated kinds (interest_cluster, open_loop, attention_pattern, dormant_revival). Then write a fresh "overview" in your own words (mirror, not oracle — describe, don't direct), and update "user_model"/"recommendation" per the meta_map/learning_path_method/resource_research_method docs at whatever tier the data supports. Write scope='user' calibration rows back to mind_knowledge. Insert everything via the Supabase MCP, superseding prior rows of each kind.

Then process the PARA-fun queue (para_fun_queue): first read all existing rows for this account. Leave still-valid pending rows untouched — do not duplicate or re-ask a question that's already waiting for an answer. Mark a row superseded if the note/data it was about has changed enough to invalidate it. Only after that, add new questions — including proposing a new capture if your processing surfaced something genuinely worth capturing. Build questions from the current open_loop/dormant_revival insights plus Inbox age, not new logic.

Hard rules, no exceptions: (1) never insert directly into notes, tasks, or packets as part of this step — every proposal, including a new capture, is a para_fun_queue row requiring the user's tap before anything real is created; (2) cap total new rows added this cycle (pending + new) at 5-8, at most 2-3 of which are new_capture_proposals — do not flood the queue; (3) before proposing a new capture, check existing notes/tags for a near-duplicate and skip the proposal if one already covers it; (4) every assumed_answer must have non-empty source_refs explaining what data or reasoning it came from — an assumed answer with no traceable source is a bug, not a shortcut; (5) an invented question_type must still use the same row shape (question_text, options, assumed_answer, section, priority_rank) — there is no side channel for writing data outside this mechanism.`

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

function StalenessBanner({ lastUpdated }) {
  const [copied, setCopied] = useState(false)
  const age = lastUpdated ? daysAgo(lastUpdated) : null
  const isStale = age === null || age >= STALE_DAYS
  if (!isStale) return null

  async function copyPrompt() {
    await navigator.clipboard.writeText(REFRESH_PROMPT)
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
          {REFRESH_PROMPT}
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

function OverviewTab({ data, loading, running, runNow }) {
  const hasAnything = data && (data.overview || [...KIND_ORDER, 'user_model', 'recommendation'].some(k => data.byKind[k]?.length))
  const hasUserModel = data && data.byKind.user_model?.length > 0
  const recommendations = data ? data.byKind.recommendation || [] : []

  return (
    <>
      <div className="mb-8 flex justify-end">
        <button onClick={runNow} disabled={running} className="btn-primary">
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>

      {loading && <p className="text-mist-400">Loading…</p>}

      {!loading && data && <StalenessBanner lastUpdated={data.lastUpdated} />}

      {!loading && !hasAnything && (
        <p className="text-sm text-mist-400">
          No insights yet. Click "Run now" to generate the four templated kinds, or ask Claude Code to write the overview (see above).
        </p>
      )}

      {!loading && hasAnything && (
        <>
          {data.overview ? (
            <div className="card mb-10 border-t-2 border-emerald-400/40 p-6">
              <p className="label mb-3 !text-emerald-300">The whole picture</p>
              <p className="text-sm leading-relaxed text-mist-100">{data.overview.summary}</p>
            </div>
          ) : (
            <div className="card mb-10 p-6">
              <p className="label mb-2">The whole picture</p>
              <p className="text-sm text-mist-400">No overview yet — ask Claude Code to write one (see the prompt above).</p>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {KIND_ORDER.map(kind => (
              <KindCard key={kind} kind={kind} insights={data.byKind[kind]} />
            ))}
          </div>

          {hasUserModel && (
            <div className="mt-10">
              <KindCard kind="user_model" insights={data.byKind.user_model} accentClass="border-t-2 border-violet-400/30" />
            </div>
          )}

          <p className="label mb-4 mt-10 !text-gold-400">What you might do</p>
          {recommendations.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {recommendations.map(insight => (
                <div key={insight.id} className="card border-t-2 border-gold-400/30 p-6">
                  <div className="divide-y divide-ink-700">
                    <InsightRow insight={insight} />
                  </div>
                </div>
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
function BrainField({ data, queue, lastUpdatedLabel, onSelectSection, fieldRef }) {
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
          {SECTION_DEFS.map(def => {
            const items = sectionItems(def, data, queue)
            const accentHex = ACCENT_HEX[def.accent]
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
                <span className="text-sm text-mist-100 group-hover:text-white">{def.label}</span>
                <span className="text-xs text-mist-500">{items.length > 0 ? items.length : 'nothing yet'}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// §4f step 2, inside a section: read-only insight kinds get a calm visualizer + voice
// readout with Next/Back to brain; actionable queue kinds (para_fun_queue) reuse the
// exact §4d/§4e mechanic — same WaveVisualizer, same AnswerControls, same onAnswer.
function BrainSection({ def, items, onAnswer, onExit, speak, cancel, speaking, muted, toggleMute, submitting }) {
  const entered = useMountTransition()
  const [index, setIndex] = useState(0)
  const isQueue = def.kind === 'queue'
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

  const color = current ? sectionItemColor(def, current) : ACCENT_HEX[def.accent]
  const caption = !current
    ? `No ${def.label.toLowerCase()} recorded yet.`
    : isQueue
      ? current.question_text
      : def.label

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
          {def.label}{items.length > 1 ? ` · ${clampedIndex + 1}/${items.length}` : ''}
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
  const [submitting, setSubmitting] = useState(false)
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

  useEffect(() => {
    load()
    loadQueue()
  }, [])

  async function runNow() {
    setRunning(true)
    await fetch('/api/mind/synthesize', { method: 'POST' })
    await load()
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

  const activeSectionDef = SECTION_DEFS.find(d => d.id === activeSectionId) || null
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
    voice.speak(first ? sectionItemText(def, first) : `No ${def.label.toLowerCase()} recorded yet.`)
  }

  function exitToField() {
    setActiveSectionId(null)
  }

  const headerTitle =
    mode === 'list'
      ? (tab === 'overview' ? 'Overview' : 'PARA, made fun')
      : (activeSectionDef ? activeSectionDef.label : 'Your Brain')

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
          <OverviewTab data={data} loading={loading} running={running} runNow={runNow} />
        ) : (
          <ParaFunTab queue={queue} loading={queueLoading} onAnswer={answerQueue} submitting={submitting} />
        )
      ) : loading || queueLoading ? (
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
