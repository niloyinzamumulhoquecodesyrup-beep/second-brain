import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import { requireSessionSSR } from '../lib/pageAuth'

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

// §4d: one question at a time, big tappable buttons, not a form. The assumed
// answer is highlighted as the default; "write my own" only shows up when the
// row's own options include a custom entry (sort_inbox questions don't, since
// the four PARA buckets are already exhaustive).
function ParaFunCard({ item, onAnswer, submitting }) {
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
    <div className="card border-t-2 border-emerald-400/40 p-8">
      <p className="label mb-3 !text-emerald-300">{item.section}</p>
      <h2 className="mb-6 font-serif text-2xl font-light text-white">{item.question_text}</h2>

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

export default function Mind({ user }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [queue, setQueue] = useState([])
  const [queueLoading, setQueueLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

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

  return (
    <Layout user={user}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Mind Model</p>
          <h1 className="font-serif text-4xl font-light text-white">{tab === 'overview' ? 'Overview' : 'PARA, made fun'}</h1>
        </div>
        <div className="flex gap-2">
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
        </div>
      </div>

      {tab === 'overview' ? (
        <OverviewTab data={data} loading={loading} running={running} runNow={runNow} />
      ) : (
        <ParaFunTab queue={queue} loading={queueLoading} onAnswer={answerQueue} submitting={submitting} />
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
