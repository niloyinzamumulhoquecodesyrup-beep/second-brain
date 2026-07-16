import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../../components/Layout'
import ParaBadge from '../../components/ParaBadge'
import { requireSessionSSR } from '../../lib/pageAuth'

const PARA_VALUES = ['inbox', 'project', 'area', 'resource', 'archive']

export default function NoteDetail({ user }) {
  const router = useRouter()
  const { id } = router.query
  const [note, setNote] = useState(null)
  const [links, setLinks] = useState({ outgoing: [], incoming: [] })
  const [related, setRelated] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!id) return
    const [noteRes, linksRes, relatedRes] = await Promise.all([
      fetch(`/api/notes/${id}`),
      fetch(`/api/notes/${id}/links`),
      fetch(`/api/notes/${id}/related`)
    ])
    if (noteRes.ok) {
      const data = await noteRes.json()
      setNote(data)
      setDraft({ ...data, tags: (data.tags || []).join(', ') })
    }
    if (linksRes.ok) setLinks(await linksRes.json())
    if (relatedRes.ok) setRelated(await relatedRes.json())
  }

  useEffect(() => { load() }, [id])

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        content: draft.content,
        para: draft.para,
        tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
        source_url: draft.source_url
      })
    })
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      load()
    }
  }

  async function remove() {
    if (!confirm('Delete this note permanently?')) return
    await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    router.push('/organize')
  }

  async function togglePin() {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: !note.pinned })
    })
    load()
  }

  if (!note) {
    return (
      <Layout user={user}>
        <p className="text-mist-400">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout user={user}>
      <Link href="/organize" className="btn-ghost mb-6 inline-block">← Back to Organize</Link>

      {!editing ? (
        <div>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <ParaBadge para={note.para} />
                {note.distilled && <span className="chip border-gold-400/40 text-gold-400">Distilled</span>}
                {note.pinned && <span className="chip border-gold-400/40 text-gold-400">Pinned</span>}
              </div>
              <h1 className="font-serif text-4xl font-light text-mist-100">{note.title}</h1>
              {note.source_url && (
                <a href={note.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-emerald-400 hover:underline">
                  {note.source_url}
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={togglePin} className="btn-secondary !px-4 !py-1.5 text-xs">{note.pinned ? 'Unpin' : 'Pin'}</button>
              <button onClick={() => setEditing(true)} className="btn-secondary !px-4 !py-1.5 text-xs">Edit</button>
              <button onClick={remove} className="btn-secondary !px-4 !py-1.5 text-xs hover:!border-red-400/60 hover:!text-red-400">Delete</button>
            </div>
          </div>

          {note.tags?.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {note.tags.map(t => (
                <Link key={t} href={`/organize?tag=${encodeURIComponent(t)}`} className="chip hover:border-emerald-400/50 hover:text-emerald-300">{t}</Link>
              ))}
            </div>
          )}

          {note.executive_summary && (
            <div className="card mb-6 border-t-2 border-gold-400/30 p-5">
              <p className="label mb-2 !text-gold-400">Executive summary</p>
              <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-mist-200">{note.executive_summary}</p>
            </div>
          )}

          <div className="card mb-6 p-6">
            <p className="max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-mist-300">{note.content}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="label mb-3">Links to</p>
              {links.outgoing.length === 0 ? (
                <p className="text-xs text-mist-500">No outgoing links. Reference other notes with [[Title]].</p>
              ) : (
                <ul className="space-y-2">
                  {links.outgoing.map(l => (
                    <li key={l.id}>
                      <Link href={`/notes/${l.id}`} className="text-sm text-mist-200 hover:text-emerald-300">{l.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card p-5">
              <p className="label mb-3">Linked from</p>
              {links.incoming.length === 0 ? (
                <p className="text-xs text-mist-500">No backlinks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {links.incoming.map(l => (
                    <li key={l.id}>
                      <Link href={`/notes/${l.id}`} className="text-sm text-mist-200 hover:text-emerald-300">{l.title}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* §4h: notes that are topically close by embedding similarity but share no tag
              or explicit [[link]] with this one — a different signal from the two cards above. */}
          <div className="card mt-4 p-5">
            <p className="label mb-3">Related notes</p>
            {related.length === 0 ? (
              <p className="text-xs text-mist-500">No related notes yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {related.map(r => {
                  const pct = Math.round(r.similarity * 100)
                  return (
                    <li key={r.id} className="flex items-center gap-3">
                      <Link href={`/notes/${r.id}`} className="min-w-0 flex-1 truncate text-sm text-mist-200 hover:text-emerald-300">
                        {r.title}
                      </Link>
                      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-ink-800" title={`${pct}% similar`}>
                        <span className="block h-full rounded-full bg-emerald-400/70" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs text-mist-500">{pct}%</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="card space-y-4 p-6">
          <input className="input" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          <textarea className="input min-h-[240px]" value={draft.content || ''} onChange={e => setDraft({ ...draft, content: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <select className="input" value={draft.para} onChange={e => setDraft({ ...draft, para: e.target.value })}>
              {PARA_VALUES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input className="input" placeholder="Source URL" value={draft.source_url || ''} onChange={e => setDraft({ ...draft, source_url: e.target.value })} />
          </div>
          <input className="input" placeholder="Tags (comma separated)" value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} />
          <div className="flex gap-3">
            <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
            <button onClick={() => { setEditing(false); setDraft({ ...note, tags: (note.tags || []).join(', ') }) }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
