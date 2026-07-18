import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'

// MINDCORD: dynamically-created rooms nested inside the MINDVERSE tab, one per
// interest domain (see migrations/022_mindcord.sql) — joining a domain is what
// materializes its room, there's no user-naming step. Phase 1 is presence + chat
// only; voice/video (mic/camera starting off by default) lands in a later phase once
// the WebRTC signaling piece is built, hence the note in RoomView below.
const pillInputClass = 'rounded-full border border-ink-600 bg-ink-900 px-3.5 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-orange-400/50 focus:outline-none'

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M2.5 10 16.5 3l-4 7 4 7z" />
    </svg>
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

function DomainList({ onJoin }) {
  const [domains, setDomains] = useState(null)
  const [joiningDomain, setJoiningDomain] = useState(null)
  const [error, setError] = useState('')

  function refresh() {
    fetch('/api/mindcord/rooms').then(r => r.json()).then(d => setDomains(d.domains || []))
  }

  useEffect(() => {
    refresh()
    const supabase = getSupabaseClient()
    if (!supabase) return
    const channel = supabase
      .channel('mindcord_rooms_watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mindcord_participants' }, refresh)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function join(domain) {
    setJoiningDomain(domain)
    setError('')
    try {
      const res = await fetch('/api/mindcord/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not join')
        return
      }
      onJoin({ room_id: data.room_id, domain: data.domain })
    } finally {
      setJoiningDomain(null)
    }
  }

  const sorted = (domains || [])
    .slice()
    .sort((a, b) => (b.live?.count || 0) - (a.live?.count || 0) || b.brains - a.brains)

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-ink-700 px-3.5 py-2.5">
        <p className="label !mb-0.5 !text-[11px] !text-orange-300">Live rooms</p>
        <p className="text-sm font-medium text-mist-100">Pick a topic to drop into</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 320, minHeight: 220 }}>
        {domains === null ? (
          <p className="text-sm text-mist-400">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-mist-400">No interest domains yet — study something in Mind to seed some.</p>
        ) : (
          sorted.map(d => (
            <button
              key={d.domain}
              onClick={() => join(d.domain)}
              disabled={joiningDomain === d.domain}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-ink-800 px-3 py-2 text-left transition hover:bg-ink-700 disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-mist-100">{d.domain}</p>
                <p className="text-xs text-mist-400">{d.brains} {d.brains === 1 ? 'brain has' : 'brains have'} studied this</p>
              </div>
              {d.live ? (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                  {d.live.count} live
                </span>
              ) : (
                <span className="shrink-0 text-xs text-mist-500">start a room</span>
              )}
            </button>
          ))
        )}
      </div>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

function RoomView({ room, onLeave }) {
  const [messages, setMessages] = useState(null)
  const [participants, setParticipants] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const leftRef = useRef(false)

  function refreshParticipants() {
    fetch('/api/mindcord/rooms').then(r => r.json()).then(d => {
      const entry = (d.domains || []).find(x => x.domain === room.domain)
      setParticipants(entry?.live?.participants || [])
    })
  }

  useEffect(() => {
    let cancelled = false
    fetch(`/api/mindcord/messages?room_id=${room.room_id}`).then(r => r.json()).then(d => {
      if (!cancelled) setMessages(d.messages || [])
    })
    refreshParticipants()

    const supabase = getSupabaseClient()
    if (!supabase) return () => { cancelled = true }
    const channel = supabase
      .channel(`mindcord_room_${room.room_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mindcord_messages', filter: `room_id=eq.${room.room_id}` }, payload => {
        setMessages(prev => ((prev || []).some(m => m.id === payload.new.id) ? prev : [...(prev || []), payload.new]))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mindcord_participants', filter: `room_id=eq.${room.room_id}` }, refreshParticipants)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_id])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  function leaveBeacon() {
    if (leftRef.current) return
    leftRef.current = true
    fetch('/api/mindcord/leave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room_id: room.room_id }),
      keepalive: true
    })
  }

  // Only registers the tab-close handler -- does NOT leave on effect cleanup. A
  // cleanup-triggered leave() is a real, non-idempotent backend mutation, which
  // React 18 StrictMode's dev-mode double-invoke (mount → cleanup → mount) turns
  // into a spurious leave a few ms after joining. Leaving in-app is handled by the
  // explicit Leave button instead; abandoned tabs beyond beforeunload are a known
  // Phase-1 gap until a server-side staleness cleanup job exists.
  useEffect(() => {
    window.addEventListener('beforeunload', leaveBeacon)
    return () => window.removeEventListener('beforeunload', leaveBeacon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_id])

  function leaveRoom() {
    leaveBeacon()
    onLeave()
  }

  async function send(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 500) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/mindcord/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room_id: room.room_id, body })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not send')
        return
      }
      setDraft('')
      setMessages(prev => ((prev || []).some(m => m.id === data.message.id) ? prev : [...(prev || []), data.message]))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="label !mb-0.5 !text-[11px] !text-orange-300">Mindcord room</p>
          <p className="truncate text-sm font-medium text-mist-100">{room.domain}</p>
        </div>
        <button onClick={leaveRoom} className="btn-secondary shrink-0 !px-3 !py-1.5 text-xs">Leave</button>
      </div>
      {participants && participants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-700 px-3.5 py-2">
          {participants.map((p, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-xs text-mist-300">
              <span>{p.avatar_key}</span>{p.display_name}
            </span>
          ))}
        </div>
      )}
      <p className="border-b border-ink-700 bg-ink-800/50 px-3.5 py-2 text-xs text-mist-400">
        Voice &amp; video are coming soon to Mindcord — mic and camera will start off by default when they land.
      </p>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 260, minHeight: 180 }}>
        {messages === null ? (
          <p className="text-sm text-mist-400">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-mist-400">Room's quiet — say hello.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} className="flex items-end gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm leading-none">{m.avatar_key}</span>
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-300 transition hover:bg-orange-500/25 disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </form>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

export default function MindcordSection() {
  const [room, setRoom] = useState(null)

  return (
    <section>
      <p className="label mb-1 !text-orange-300">Mindcord</p>
      <h2 className="mb-3 font-serif text-2xl font-light text-mist-100">Drop into a live room</h2>
      <p className="mb-3 text-sm text-mist-400">
        Rooms form automatically around what the community is studying — join one to chat live with others on the same topic.
      </p>
      <div className="h-[420px]">
        {room ? <RoomView key={room.room_id} room={room} onLeave={() => setRoom(null)} /> : <DomainList onJoin={setRoom} />}
      </div>
    </section>
  )
}
