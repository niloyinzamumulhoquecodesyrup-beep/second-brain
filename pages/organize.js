import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../components/Layout'
import ParaBadge from '../components/ParaBadge'
import { requireSessionSSR } from '../lib/pageAuth'
import { PARA_THEME } from '../lib/paraTheme'

const COLUMNS = [
  { key: 'inbox', label: 'Inbox', hint: 'Unsorted — process weekly' },
  { key: 'project', label: 'Projects', hint: 'Short-term, has a deadline' },
  { key: 'area', label: 'Areas', hint: 'Ongoing, no end date' },
  { key: 'resource', label: 'Resources', hint: 'Interests to explore' },
  { key: 'archive', label: 'Archives', hint: 'No longer a priority' }
]

const SORT_TARGETS = COLUMNS.filter(c => c.key !== 'inbox')

export default function Organize({ user }) {
  const router = useRouter()
  const [notes, setNotes] = useState([])
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (tag) params.set('tag', tag)
    const res = await fetch('/api/notes?' + params.toString())
    const data = await res.json()
    setNotes(data)
    setLoading(false)
  }, [q, tag])

  useEffect(() => {
    if (router.query.tag) setTag(router.query.tag)
  }, [router.query.tag])

  useEffect(() => { load() }, [load])

  async function move(noteId, para) {
    setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, para } : n)))
    await fetch('/api/para', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: noteId, para }) })
  }

  const groups = { inbox: [], project: [], area: [], resource: [], archive: [] }
  notes.forEach(n => groups[n.para || 'inbox'].push(n))

  return (
    <Layout user={user}>
      <p className="label mb-2">Organize</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-mist-100">The PARA method</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Sorted by use, not subject — like a kitchen, not a library. Spend five minutes clearing the Inbox each
        week, archive what isn't immediately necessary, and keep actionable work close.
      </p>

      <div className="mb-8 flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search notes…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <input
          className="input max-w-[180px]"
          placeholder="Filter by tag"
          value={tag}
          onChange={e => setTag(e.target.value)}
        />
        {tag && (
          <button className="btn-ghost" onClick={() => setTag('')}>Clear tag ×</button>
        )}
      </div>

      {loading ? (
        <p className="text-mist-400">Loading…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map(col => {
            const theme = PARA_THEME[col.key]
            return (
              <div key={col.key} className={`card flex flex-col border-t-2 p-4 ${theme.border}`}>
                <div className="mb-3">
                  <div className="flex items-center justify-between">
                    <p className={`flex items-center gap-2 font-serif text-lg text-mist-100`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                      {col.label}
                    </p>
                    <span className={`chip border ${theme.border} ${theme.text}`}>{groups[col.key].length}</span>
                  </div>
                  <p className="text-xs text-mist-500">{col.hint}</p>
                </div>

                <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto" style={{ maxHeight: 520 }}>
                  {groups[col.key].length === 0 && <p className="text-xs text-mist-500">Nothing here.</p>}
                  {groups[col.key].map(n => (
                    <div key={n.id} className="rounded-md border border-ink-700 p-3">
                      <Link href={`/notes/${n.id}`} className={theme.hoverLink}>
                        {n.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-xs text-mist-400">{(n.content || '').slice(0, 120)}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {SORT_TARGETS.filter(c => c.key !== col.key).map(c => (
                          <button
                            key={c.key}
                            onClick={() => move(n.id, c.key)}
                            className={PARA_THEME[c.key].hoverMoveBtn}
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
