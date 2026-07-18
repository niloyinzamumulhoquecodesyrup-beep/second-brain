import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'
import CommunityMap from './CommunityMap'

// "Other Brains": a cross-account space, unlike every other tab which is scoped to
// one user. Identity here is a self-chosen anonymous handle + a randomly assigned
// avatar, set once (no rename) — see migrations/021_other_brains.sql for the schema
// and anonymity contract. Chat/suggestions/books update live via Supabase Realtime
// (lib/supabaseClient.js); the interest map is a plain aggregate, refetched on mount.
const inputClass = 'rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-emerald-400/50 focus:outline-none'
// Pill-shaped, tighter — used by the three compact widgets (chat/suggestions/books)
// instead of the app's standard boxy form input, part of reading as a modern social
// panel rather than a formal input form.
const pillInputClass = 'rounded-full border border-ink-600 bg-ink-900 px-3.5 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-emerald-400/50 focus:outline-none'

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M2.5 10 16.5 3l-4 7 4 7z" />
    </svg>
  )
}

function Avatar({ children }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm leading-none">
      {children}
    </span>
  )
}

// Compact card header shared by the three widgets below — a small uppercase label
// plus a sans-serif line, not the app's usual font-serif text-2xl section heading,
// which read as a formal report title on what's meant to feel like a lightweight
// social panel.
function WidgetHeader({ eyebrow, title, accent }) {
  return (
    <div className="border-b border-ink-700 px-3.5 py-2.5">
      <p className={`label !mb-0.5 !text-[11px] ${accent}`}>{eyebrow}</p>
      <p className="text-sm font-medium text-mist-100">{title}</p>
    </div>
  )
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function IdentityGate({ onCreated }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/other-brains/identity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: name })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        return
      }
      onCreated(data.identity)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-6">
      <p className="label mb-1">Join anonymously</p>
      <h2 className="mb-2 font-serif text-xl font-light text-mist-100">Pick a name to use here</h2>
      <p className="mb-4 text-sm text-mist-400">
        Not your real name or email — this is what other members will see, along with a randomly assigned avatar. You can't change it later.
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={24}
          placeholder="e.g. Quiet Fox"
          className={inputClass}
        />
        <button type="submit" disabled={busy || name.trim().length < 2} className="btn-primary !px-4 !py-2 text-sm">
          {busy ? 'Joining…' : 'Join anonymously'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
    </section>
  )
}

function InterestClusterMap() {
  const [clusters, setClusters] = useState(null)

  useEffect(() => {
    fetch('/api/other-brains/clusters').then(r => r.json()).then(d => setClusters(d.clusters || []))
  }, [])

  return (
    <section>
      <p className="label mb-1">Other brains</p>
      <h2 className="mb-3 font-serif text-2xl font-light text-mist-100">What the community is studying</h2>
      {clusters === null ? (
        <p className="text-sm text-mist-400">Loading…</p>
      ) : (
        <CommunityMap clusters={clusters} />
      )}
    </section>
  )
}

function ChatPanel() {
  const [messages, setMessages] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/other-brains/messages').then(r => r.json()).then(d => {
      if (!cancelled) setMessages(d.messages || [])
    })

    const supabase = getSupabaseClient()
    if (!supabase) return () => { cancelled = true }
    const channel = supabase
      .channel('other_brains_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'other_brains_messages' }, payload => {
        setMessages(prev => ((prev || []).some(m => m.id === payload.new.id) ? prev : [...(prev || []), payload.new]))
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 500) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/other-brains/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not send')
        return
      }
      setDraft('')
      // Realtime delivers this same row back; the id-based dedupe in the handler
      // above keeps it from appearing twice.
      setMessages(prev => ((prev || []).some(m => m.id === data.message.id) ? prev : [...(prev || []), data.message]))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <WidgetHeader eyebrow="Live chat" title="Talk to other brains" accent="!text-emerald-300" />
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 260, minHeight: 180 }}>
        {messages === null ? (
          <p className="text-sm text-mist-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-mist-400">Nobody's said anything yet — be the first.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="flex items-end gap-2">
              <Avatar>{m.avatar_key}</Avatar>
              <div className="min-w-0 max-w-[85%] rounded-2xl rounded-bl-sm bg-ink-800 px-3 py-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-mist-200">{m.display_name}</span>
                  <span className="text-[10px] text-mist-500">{timeAgo(m.created_at)}</span>
                </div>
                <p className="text-sm leading-snug text-mist-100">{m.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t border-ink-700 p-2.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Say something…"
          className={`flex-1 ${pillInputClass}`}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </form>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

function SuggestionBox() {
  const [suggestions, setSuggestions] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/other-brains/suggestions').then(r => r.json()).then(d => {
      if (!cancelled) setSuggestions(d.suggestions || [])
    })

    const supabase = getSupabaseClient()
    if (!supabase) return () => { cancelled = true }
    const channel = supabase
      .channel('other_brains_suggestions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'other_brains_suggestions' }, payload => {
        setSuggestions(prev => ((prev || []).some(s => s.id === payload.new.id) ? prev : [payload.new, ...(prev || [])]))
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 1000) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/other-brains/suggestions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not submit')
        return
      }
      setDraft('')
      setSuggestions(prev => ((prev || []).some(s => s.id === data.suggestion.id) ? prev : [data.suggestion, ...(prev || [])]))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <WidgetHeader eyebrow="Suggestion box" title="Ideas for the community" accent="!text-violet-300" />
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 260, minHeight: 140 }}>
        {suggestions === null ? (
          <p className="text-sm text-mist-400">Loading…</p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-mist-400">No suggestions yet.</p>
        ) : (
          suggestions.map(s => (
            <div key={s.id} className="flex items-start gap-2 rounded-xl bg-ink-800 px-3 py-2">
              <Avatar>{s.avatar_key}</Avatar>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-mist-200">{s.display_name}</span>
                  <span className="text-[10px] text-mist-500">{timeAgo(s.created_at)}</span>
                </div>
                <p className="text-sm leading-snug text-mist-100">{s.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink-700 p-2.5">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={1000}
          rows={1}
          placeholder="Suggest something…"
          className={`flex-1 resize-none rounded-2xl border border-ink-600 bg-ink-900 px-3.5 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-emerald-400/50 focus:outline-none`}
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Submit suggestion"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-300 transition hover:bg-violet-500/25 disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </form>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

function BookBoard({ viewerUserId }) {
  const [books, setBooks] = useState(null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  function upsertBooks(list, row) {
    const idx = list.findIndex(b => b.user_id === row.user_id)
    const next = idx === -1 ? [row, ...list] : list.map((b, i) => (i === idx ? row : b))
    return next.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/other-brains/books').then(r => r.json()).then(d => {
      if (cancelled) return
      const list = d.books || []
      setBooks(list)
      const mine = list.find(b => b.user_id === viewerUserId)
      if (mine) {
        setTitle(mine.title)
        setNote(mine.note || '')
      }
    })

    const supabase = getSupabaseClient()
    if (!supabase) return () => { cancelled = true }
    const handler = payload => setBooks(prev => upsertBooks(prev || [], payload.new))
    const channel = supabase
      .channel('other_brains_books')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'other_brains_books' }, handler)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'other_brains_books' }, handler)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [viewerUserId])

  async function submit(e) {
    e.preventDefault()
    const t = title.trim()
    if (!t || t.length > 140) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/other-brains/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t, note: note.trim() })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save')
        return
      }
      setBooks(prev => upsertBooks(prev || [], data.book))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <WidgetHeader eyebrow="Currently studying" title="What book are you studying now?" accent="!text-gold-300" />
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 260, minHeight: 140 }}>
        {books === null ? (
          <p className="text-sm text-mist-400">Loading…</p>
        ) : books.length === 0 ? (
          <p className="text-sm text-mist-400">No one's shared what they're studying yet.</p>
        ) : (
          books.map(b => (
            <div key={b.user_id} className="flex items-start gap-2 rounded-xl bg-ink-800 px-3 py-2">
              <Avatar>{b.avatar_key}</Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-medium text-mist-200">{b.display_name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-mist-500">{timeAgo(b.updated_at)}</span>
                </div>
                <p className="text-sm leading-snug text-mist-100">{b.title}</p>
                {b.note && <p className="text-xs leading-snug text-mist-400">{b.note}</p>}
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={submit} className="space-y-2 border-t border-ink-700 p-2.5">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={140}
            placeholder="Book title"
            className={`flex-1 ${pillInputClass}`}
          />
          <button
            type="submit"
            disabled={sending || !title.trim()}
            aria-label="Save"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-500/10 text-gold-300 transition hover:bg-gold-500/25 disabled:opacity-30"
          >
            <SendIcon />
          </button>
        </div>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={280}
          placeholder="A line about it (optional)"
          className={`w-full ${pillInputClass}`}
        />
      </form>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

export default function OtherBrainsTab() {
  const [identity, setIdentity] = useState(undefined)

  useEffect(() => {
    fetch('/api/other-brains/identity').then(r => r.json()).then(d => setIdentity(d.identity))
  }, [])

  if (identity === undefined) {
    return <p className="text-sm text-mist-400">Loading…</p>
  }

  return (
    <div className="space-y-8">
      <InterestClusterMap />
      {!identity ? (
        <IdentityGate onCreated={setIdentity} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChatPanel />
          <SuggestionBox />
          <BookBoard viewerUserId={identity.user_id} />
        </div>
      )}
    </div>
  )
}
