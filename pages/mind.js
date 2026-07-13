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
const PERSONALITY_KIND_ORDER = ['user_model', 'recommendation']

const STALE_DAYS = 2

const REFRESH_PROMPT = `Refresh my Mind Model following the refinement loop (mind_knowledge topic "refinement_loop"): read all mind_knowledge rows first, then my notes, tasks, packets, activity_log, and current mind_insights via the Supabase MCP. Re-run POST /api/mind/synthesize to refresh the four templated kinds (interest_cluster, open_loop, attention_pattern, dormant_revival). Then write a fresh "overview" in your own words (mirror, not oracle — describe, don't direct), and update "user_model"/"recommendation" per the meta_map/learning_path_method/resource_research_method docs at whatever tier the data supports. Write scope='user' calibration rows back to mind_knowledge. Insert everything via the Supabase MCP, superseding prior rows of each kind.`

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

export default function Mind({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  function load() {
    setLoading(true)
    return fetch('/api/mind/insights')
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  async function runNow() {
    setRunning(true)
    await fetch('/api/mind/synthesize', { method: 'POST' })
    await load()
    setRunning(false)
  }

  const hasAnything = data && (data.overview || [...KIND_ORDER, ...PERSONALITY_KIND_ORDER].some(k => data.byKind[k]?.length))
  const hasPersonality = data && PERSONALITY_KIND_ORDER.some(k => data.byKind[k]?.length)

  return (
    <Layout user={user}>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Mind Model</p>
          <h1 className="font-serif text-4xl font-light text-white">Overview</h1>
        </div>
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

          {hasPersonality && (
            <>
              <p className="label mb-4 mt-10 !text-violet-300">What you might do</p>
              <div className="grid gap-6 md:grid-cols-2">
                {PERSONALITY_KIND_ORDER.map(kind => (
                  <KindCard key={kind} kind={kind} insights={data.byKind[kind]} accentClass="border-t-2 border-violet-400/30" />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
