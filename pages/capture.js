import { useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '../components/Layout'
import TourOverlay from '../components/TourOverlay'
import { requireSessionSSR } from '../lib/pageAuth'

const PARA_OPTIONS = [
  { value: 'inbox', label: 'Inbox — sort it later (recommended)' },
  { value: 'project', label: 'Project — short-term, has a deadline' },
  { value: 'area', label: 'Area — ongoing, no end date' },
  { value: 'resource', label: 'Resource — interest to explore' },
  { value: 'archive', label: 'Archive — no longer a priority' }
]

export default function Capture({ user }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [para, setPara] = useState('inbox')
  const [sourceUrl, setSourceUrl] = useState('')
  const [status, setStatus] = useState('')
  const [recent, setRecent] = useState([])

  function loadRecent() {
    fetch('/api/notes').then(r => r.json()).then(data => setRecent(data.slice(0, 6)))
  }

  useEffect(() => { loadRecent() }, [])

  async function submit(e) {
    e.preventDefault()
    setStatus('Saving…')
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title || 'Untitled',
        content,
        para,
        source_url: sourceUrl || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean)
      })
    })
    if (res.ok) {
      setTitle('')
      setContent('')
      setTags('')
      setSourceUrl('')
      setStatus('Saved as a knowledge asset.')
      loadRecent()
    } else {
      setStatus('Something went wrong.')
    }
  }

  return (
    <Layout user={user}>
      <TourOverlay step="capture" />
      <p className="label mb-2">Capture</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-mist-100">What resonated with you?</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Reflect on the last 24 hours. Capture what genuinely sparks interest — not everything, just what feels like
        a knowledge asset. Don't stop to decide where it belongs — everything lands in your Inbox by default and
        gets sorted during your weekly review in Organize. Link to related notes with{' '}
        <code className="rounded bg-ink-800 px-1 py-0.5 text-emerald-300">[[Note Title]]</code>.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={submit} className="card space-y-4 border-t-2 border-emerald-400/30 p-6 lg:col-span-2">
          <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea
            className="input min-h-[220px] resize-y"
            placeholder="Write, paste, or reflect here. Use [[Title]] to connect this to another note."
            value={content}
            onChange={e => setContent(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <select className="input" value={para} onChange={e => setPara(e.target.value)}>
              {PARA_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input className="input" placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
          </div>
          <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={e => setTags(e.target.value)} />

          <div className="flex items-center gap-4 pt-1">
            <button type="submit" className="btn-primary">Save capture</button>
            {status && <span className="text-sm text-mist-400">{status}</span>}
          </div>
        </form>

        <div className="card p-6">
          <p className="label mb-4">Just captured</p>
          {recent.length === 0 ? (
            <p className="text-sm text-mist-400">Your captures will show up here.</p>
          ) : (
            <div className="space-y-3">
              {recent.map(n => (
                <Link key={n.id} href={`/notes/${n.id}`} className="block rounded-md border border-ink-700 p-3 transition hover:border-emerald-400/40">
                  <p className="truncate text-sm text-mist-100">{n.title}</p>
                  <p className="mt-1 text-xs text-mist-400">{new Date(n.created_at).toLocaleString()}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
