import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '../lib/supabaseClient'

// MINDCORD: dynamically-created rooms nested inside the MINDVERSE tab, one per
// interest domain (see migrations/022_mindcord.sql) — joining a domain is what
// materializes its room, there's no user-naming step. Phase 1 is presence + chat;
// Phase 2 (this file's RoomView) layers a mesh WebRTC call on top -- one
// RTCPeerConnection per other active participant, signaled over a Supabase Realtime
// Broadcast channel (`mindcord_call:<room_id>`, ephemeral pub/sub, separate from the
// postgres_changes channel used for chat/presence). STUN only, no TURN, so some joins
// (symmetric NAT / restrictive firewalls) won't connect -- surfaced per-peer via
// peerStatusBadge rather than failing silently. Mic/camera start off every time; only
// an explicit click acquires getUserMedia (see toggleMic/toggleCam below).
const pillInputClass = 'rounded-full border border-ink-600 bg-ink-900 px-3.5 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-orange-400/50 focus:outline-none'

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M2.5 10 16.5 3l-4 7 4 7z" />
    </svg>
  )
}

function MicIcon({ on, size = 13 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="7" y="2.5" width="6" height="9" rx="3" />
      <path d="M4 9.5a6 6 0 0 0 12 0M10 15.5v2.5" strokeLinecap="round" />
      {!on && <path d="M3 3l14 14" strokeLinecap="round" />}
    </svg>
  )
}

function CamIcon({ on, size = 13 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="5.5" width="10" height="9" rx="2" />
      <path d="M12.5 9l5-2.8v7.6l-5-2.8z" strokeLinejoin="round" />
      {!on && <path d="M3 3l14 14" strokeLinecap="round" />}
    </svg>
  )
}

function HangUpIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="currentColor" aria-hidden="true" style={{ transform: 'rotate(135deg)' }}>
      <path d="M3 8.4c3.2-2.9 10.8-2.9 14 0 .4.36.42 1 .06 1.4l-1.7 1.9c-.34.38-.92.44-1.33.13l-1.6-1.2c-.32-.24-.76-.25-1.1-.02-.72.48-1.6.76-2.53.76s-1.8-.28-2.53-.76c-.34-.23-.78-.22-1.1.02l-1.6 1.2c-.4.31-.99.25-1.33-.13l-1.7-1.9c-.36-.4-.34-1.04.06-1.4z" />
    </svg>
  )
}

// Phase 2 mesh WebRTC (see migrations/022_mindcord.sql comment + ROOM_CAP in
// pages/api/mindcord/join.js): STUN only, no TURN -- an accepted gap for some
// fraction of joins (symmetric NAT / restrictive firewalls), surfaced per-peer
// below rather than failing silently.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

function peerStatusBadge(state) {
  if (state === 'connected') return { text: 'Connected', dot: 'bg-emerald-400', cls: 'text-emerald-300' }
  if (state === 'failed') return { text: "Couldn't connect", dot: 'bg-rose-400', cls: 'text-rose-300' }
  if (state === 'disconnected') return { text: 'Reconnecting…', dot: 'bg-amber-400 animate-pulse', cls: 'text-amber-300' }
  if (state === 'closed') return { text: 'Closed', dot: 'bg-ink-600', cls: 'text-mist-500' }
  return { text: 'Connecting…', dot: 'bg-amber-400 animate-pulse', cls: 'text-amber-300' }
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
          <p className="text-sm text-mist-400">No interest domains yet, study something in Mind to seed some.</p>
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

function RoomView({ room, onLeave, identity }) {
  const [messages, setMessages] = useState(null)
  const [participants, setParticipants] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [peers, setPeers] = useState({})
  const [micOn, setMicOn] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const listRef = useRef(null)
  const leftRef = useRef(false)
  const myId = identity?.user_id

  // Mesh WebRTC bookkeeping -- refs, not state, since none of this should trigger a
  // re-render on its own; `peers` (above) is the render-facing projection, patched
  // from these as connections progress.
  const pcsRef = useRef(new Map())
  const sendersRef = useRef(new Map())
  const iceQueueRef = useRef(new Map())
  const remoteStreamsRef = useRef(new Map())
  const rosterRef = useRef(new Map())
  const callChannelRef = useRef(null)
  const localStreamRef = useRef(null)

  // Real speaking-level detection (Web Audio analyser per peer + self), driving the
  // tile glow imperatively via classList rather than React state -- this ticks on
  // every animation frame, and re-rendering the whole peer list at that rate would be
  // wasteful when only a CSS class needs to change.
  const audioCtxRef = useRef(null)
  const analysersRef = useRef(new Map())
  const localAnalyserRef = useRef(null)
  const tileRefs = useRef(new Map())
  const selfTileRef = useRef(null)
  const audioRafRef = useRef(null)

  function refreshParticipants() {
    fetch('/api/mindcord/rooms').then(r => r.json()).then(d => {
      const entry = (d.domains || []).find(x => x.domain === room.domain)
      setParticipants(entry?.live?.participants || [])
    })
  }

  function updatePeer(peerId, patch) {
    setPeers(prev => (prev[peerId] ? { ...prev, [peerId]: { ...prev[peerId], ...patch } } : prev))
  }

  function sendSignal(kind, to, data) {
    callChannelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { kind, from: myId, to, ...data } })
  }

  async function flushIce(peerId, pc) {
    const queued = iceQueueRef.current.get(peerId) || []
    iceQueueRef.current.set(peerId, [])
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch { /* stale candidate, ignore */ }
    }
  }

  function queueOrAddIce(peerId, candidate) {
    const pc = pcsRef.current.get(peerId)
    if (pc && pc.remoteDescription) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    } else {
      if (!iceQueueRef.current.has(peerId)) iceQueueRef.current.set(peerId, [])
      iceQueueRef.current.get(peerId).push(candidate)
    }
  }

  function getAudioCtx() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!audioCtxRef.current) audioCtxRef.current = new AC()
    // getUserMedia/toggleMic is itself a user gesture, so this reliably unlocks the
    // context the moment someone unmutes -- without it, a context created before any
    // gesture would sit "suspended" and every analyser would read silence forever.
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
    return audioCtxRef.current
  }

  function ensureAnalyser(peerId, stream) {
    if (analysersRef.current.has(peerId)) return
    const ctx = getAudioCtx()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    analysersRef.current.set(peerId, { analyser, data: new Uint8Array(analyser.fftSize), source })
  }

  function removeAnalyser(peerId) {
    const entry = analysersRef.current.get(peerId)
    if (entry) {
      try { entry.source.disconnect() } catch { /* already torn down */ }
    }
    analysersRef.current.delete(peerId)
    tileRefs.current.get(peerId)?.classList.remove('mindcord-speaking')
  }

  function ensureLocalAnalyser(stream) {
    removeLocalAnalyser()
    const ctx = getAudioCtx()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    localAnalyserRef.current = { analyser, data: new Uint8Array(analyser.fftSize), source }
  }

  function removeLocalAnalyser() {
    if (localAnalyserRef.current) {
      try { localAnalyserRef.current.source.disconnect() } catch { /* already torn down */ }
    }
    localAnalyserRef.current = null
    selfTileRef.current?.classList.remove('mindcord-speaking')
  }

  // RMS of the time-domain waveform is a cheap, standard "is there real signal here"
  // volume meter -- good enough to tell actual speech from a live-but-silent mic
  // without pulling in a VAD library for it.
  function audioLevel(entry) {
    entry.analyser.getByteTimeDomainData(entry.data)
    let sumSquares = 0
    for (let i = 0; i < entry.data.length; i++) {
      const v = (entry.data[i] - 128) / 128
      sumSquares += v * v
    }
    return Math.sqrt(sumSquares / entry.data.length)
  }

  function tickAudioLevels() {
    for (const [peerId, entry] of analysersRef.current) {
      const el = tileRefs.current.get(peerId)
      if (el) el.classList.toggle('mindcord-speaking', audioLevel(entry) > 0.04)
    }
    if (localAnalyserRef.current && selfTileRef.current) {
      selfTileRef.current.classList.toggle('mindcord-speaking', audioLevel(localAnalyserRef.current) > 0.04)
    }
    audioRafRef.current = requestAnimationFrame(tickAudioLevels)
  }

  function ensurePeer(peerId, displayName, avatarKey) {
    const existing = pcsRef.current.get(peerId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' })
    const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' })
    sendersRef.current.set(peerId, { audio: audioTx.sender, video: videoTx.sender })

    // Attach whatever's already live locally -- a peer that joins after I've already
    // unmuted shouldn't get a silent connection just because their pc is newer.
    const local = localStreamRef.current
    const audioTrack = local?.getAudioTracks()[0]
    const videoTrack = local?.getVideoTracks()[0]
    if (audioTrack) audioTx.sender.replaceTrack(audioTrack)
    if (videoTrack) videoTx.sender.replaceTrack(videoTrack)

    pc.onicecandidate = e => {
      if (e.candidate) sendSignal('ice', peerId, { candidate: e.candidate })
    }
    // Transceivers are negotiated (and ontrack fires) from the moment the connection
    // is established, regardless of whether the remote side has attached a real track
    // yet -- direction sendrecv with no track just means "no media flowing," which
    // WebRTC surfaces as the delivered track starting muted. Listening for mute/unmute
    // (rather than treating "a track object exists" as "camera/mic is on") is what
    // lets a tile's video/mic indicator track the peer's actual toggle state live.
    pc.ontrack = e => {
      const track = e.track
      let stream = remoteStreamsRef.current.get(peerId)
      if (!stream) {
        stream = new MediaStream()
        remoteStreamsRef.current.set(peerId, stream)
      }
      stream.addTrack(track)
      if (track.kind === 'audio') ensureAnalyser(peerId, stream)
      const refresh = () => updatePeer(peerId, {
        hasVideo: stream.getVideoTracks().some(t => !t.muted),
        hasAudio: stream.getAudioTracks().some(t => !t.muted)
      })
      track.onmute = refresh
      track.onunmute = refresh
      refresh()
    }
    pc.onconnectionstatechange = () => updatePeer(peerId, { connState: pc.connectionState })

    pcsRef.current.set(peerId, pc)
    setPeers(prev => ({
      ...prev,
      [peerId]: {
        display_name: displayName || prev[peerId]?.display_name || 'Someone',
        avatar_key: avatarKey || prev[peerId]?.avatar_key || '👤',
        connState: 'new',
        hasVideo: false,
        hasAudio: false
      }
    }))
    return pc
  }

  async function initiateOffer(peerId) {
    const pc = pcsRef.current.get(peerId)
    if (!pc) return
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendSignal('offer', peerId, { sdp: pc.localDescription })
  }

  // Deterministic offerer selection (higher user_id offers) rather than a strict
  // "newcomer always offers" rule -- two joins landing close enough together can each
  // see the other as "already in the room" by the time they fetch the roster, and a
  // pure newcomer-offers rule would let both sides send an offer (glare). Comparing
  // ids is symmetric and race-free regardless of join timing.
  function connectToPeer(peerId) {
    if (!callChannelRef.current || peerId === myId || pcsRef.current.has(peerId)) return
    const meta = rosterRef.current.get(peerId) || {}
    ensurePeer(peerId, meta.display_name, meta.avatar_key)
    if (myId > peerId) initiateOffer(peerId)
  }

  function teardownPeer(peerId) {
    const pc = pcsRef.current.get(peerId)
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.close()
    }
    pcsRef.current.delete(peerId)
    sendersRef.current.delete(peerId)
    iceQueueRef.current.delete(peerId)
    remoteStreamsRef.current.delete(peerId)
    rosterRef.current.delete(peerId)
    removeAnalyser(peerId)
    setPeers(prev => {
      if (!(peerId in prev)) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }

  function teardownAllPeers() {
    for (const peerId of Array.from(pcsRef.current.keys())) teardownPeer(peerId)
  }

  function stopLocalMedia() {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null
    removeLocalAnalyser()
    setMicOn(false)
    setCamOn(false)
  }

  async function handleSignal(payload) {
    if (!payload || payload.to !== myId) return
    const { kind, from, sdp, candidate } = payload
    if (kind === 'offer') {
      const meta = rosterRef.current.get(from)
      const pc = ensurePeer(from, meta?.display_name, meta?.avatar_key)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      await flushIce(from, pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignal('answer', from, { sdp: pc.localDescription })
    } else if (kind === 'answer') {
      const pc = pcsRef.current.get(from)
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      await flushIce(from, pc)
    } else if (kind === 'ice') {
      queueOrAddIce(from, candidate)
    }
  }

  function handleParticipantChange(payload) {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old
    const peerId = row?.user_id
    if (!peerId || peerId === myId) return
    if (payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && !payload.new?.left_at)) {
      rosterRef.current.set(peerId, { display_name: payload.new.display_name, avatar_key: payload.new.avatar_key })
      connectToPeer(peerId)
    } else if ((payload.eventType === 'UPDATE' && payload.new?.left_at) || payload.eventType === 'DELETE') {
      teardownPeer(peerId)
    }
  }

  async function toggleMic() {
    if (micOn) {
      const track = localStreamRef.current?.getAudioTracks()[0]
      if (track) {
        track.stop()
        localStreamRef.current.removeTrack(track)
      }
      for (const senders of sendersRef.current.values()) senders.audio?.replaceTrack(null)
      removeLocalAnalyser()
      setMicOn(false)
      return
    }
    try {
      // echoCancellation/noiseSuppression/autoGainControl are the browser's own
      // built-in WebRTC audio processing -- the best noise cleanup available without
      // adding a third-party media service or a WASM denoiser dependency, and it costs
      // nothing extra to turn on.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      const track = stream.getAudioTracks()[0]
      if (!localStreamRef.current) localStreamRef.current = new MediaStream()
      localStreamRef.current.addTrack(track)
      for (const senders of sendersRef.current.values()) senders.audio?.replaceTrack(track)
      ensureLocalAnalyser(localStreamRef.current)
      setMediaError('')
      setMicOn(true)
    } catch {
      setMediaError('Could not access your microphone, check browser permissions')
    }
  }

  async function toggleCam() {
    if (camOn) {
      const track = localStreamRef.current?.getVideoTracks()[0]
      if (track) {
        track.stop()
        localStreamRef.current.removeTrack(track)
      }
      for (const senders of sendersRef.current.values()) senders.video?.replaceTrack(null)
      setCamOn(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      if (!localStreamRef.current) localStreamRef.current = new MediaStream()
      localStreamRef.current.addTrack(track)
      for (const senders of sendersRef.current.values()) senders.video?.replaceTrack(track)
      setMediaError('')
      setCamOn(true)
    } catch {
      setMediaError('Could not access your camera, check browser permissions')
    }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mindcord_participants', filter: `room_id=eq.${room.room_id}` }, payload => {
        refreshParticipants()
        handleParticipantChange(payload)
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_id])

  // Signaling: a dedicated Broadcast channel (ephemeral, no table/RLS) per room, kept
  // separate from the postgres_changes channel above -- that one drives presence/chat,
  // this one only ever carries offer/answer/ICE payloads addressed by user_id.
  useEffect(() => {
    let cancelled = false
    const supabase = getSupabaseClient()
    if (!supabase || !myId) return () => { cancelled = true }

    audioRafRef.current = requestAnimationFrame(tickAudioLevels)

    const channel = supabase.channel(`mindcord_call:${room.room_id}`, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => { if (!cancelled) handleSignal(payload) })
    channel.subscribe(async status => {
      if (status !== 'SUBSCRIBED' || cancelled) return
      callChannelRef.current = channel
      try {
        const res = await fetch(`/api/mindcord/participants?room_id=${room.room_id}`)
        const data = await res.json()
        if (cancelled) return
        for (const p of data.participants || []) {
          rosterRef.current.set(p.user_id, { display_name: p.display_name, avatar_key: p.avatar_key })
        }
      } catch { /* roster fetch failed -- peers who join after this will still connect via postgres_changes */ }
      if (cancelled) return
      for (const peerId of rosterRef.current.keys()) connectToPeer(peerId)
    })

    return () => {
      cancelled = true
      callChannelRef.current = null
      supabase.removeChannel(channel)
      teardownAllPeers()
      stopLocalMedia()
      if (audioRafRef.current) cancelAnimationFrame(audioRafRef.current)
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.room_id, myId])

  // See migrations/026_mindcord_heartbeat.sql: without a periodic "I'm still here",
  // closing the tab any way other than the Leave button (crash, force-quit, a
  // backgrounded mobile tab the OS kills) leaves left_at unset forever, and the
  // participant stays wrongly shown as joined. This just needs to outlive the tab;
  // the server-side expiry (in rooms.js/join.js/participants.js) does the rest.
  useEffect(() => {
    const id = setInterval(() => {
      fetch('/api/mindcord/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room_id: room.room_id }),
        keepalive: true
      })
    }, 20_000)
    return () => clearInterval(id)
  }, [room.room_id])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  function leaveBeacon() {
    if (leftRef.current) return
    leftRef.current = true
    teardownAllPeers()
    stopLocalMedia()
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
  // Phase-1 gap until a server-side staleness cleanup job exists. (The call effect's
  // own cleanup above still tears down peer connections and stops local media on
  // every unmount/StrictMode re-invoke -- that's just local browser state, not a
  // backend mutation, so it's safe to run more than once.)
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
      <div className="border-b border-ink-700 px-3.5 py-2.5">
        <p className="label !mb-0.5 !text-[11px] !text-orange-300">Mindcord room</p>
        <p className="truncate font-serif text-2xl font-medium text-mist-100">{room.domain}</p>
      </div>
      {mediaError && <p className="border-b border-ink-700 bg-rose-500/10 px-3.5 py-1.5 text-xs text-rose-300">{mediaError}</p>}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex-1 overflow-hidden border-r border-ink-700 bg-ink-950/40">
          <div className="grid h-full auto-rows-min grid-cols-3 content-start gap-2 overflow-y-auto p-2">
            <div
              ref={selfTileRef}
              className="relative aspect-[4/3] overflow-hidden rounded-lg border-2 border-transparent bg-ink-800"
            >
              {camOn ? (
                <video
                  autoPlay
                  playsInline
                  muted
                  ref={el => { if (el) el.srcObject = localStreamRef.current }}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-700 text-lg">{identity?.avatar_key || '🙂'}</span>
                </div>
              )}
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-mist-100">You</span>
              <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60">
                <MicIcon on={micOn} />
              </span>
            </div>
            {Object.entries(peers).map(([peerId, meta]) => {
              const connecting = meta.connState !== 'connected' && meta.connState !== 'failed'
              const borderCls = meta.connState === 'failed'
                ? 'border-rose-400/70'
                : connecting
                  ? 'border-amber-400/60'
                  : 'border-transparent'
              return (
                <div
                  key={peerId}
                  ref={el => { if (el) tileRefs.current.set(peerId, el); else tileRefs.current.delete(peerId) }}
                  className={`relative aspect-[4/3] overflow-hidden rounded-lg border-2 bg-ink-800 ${borderCls}`}
                >
                  {meta.hasVideo ? (
                    <video
                      autoPlay
                      playsInline
                      ref={el => { if (el) el.srcObject = remoteStreamsRef.current.get(peerId) || null }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-700 text-lg">{meta.avatar_key || '👤'}</span>
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 max-w-[75%] truncate rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-mist-100">
                    {meta.display_name}
                  </span>
                  <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60">
                    <MicIcon on={meta.hasAudio} />
                  </span>
                  {connecting && (
                    <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${peerStatusBadge(meta.connState).dot}`} />
                  )}
                  {meta.connState === 'failed' && (
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[9px] font-medium text-rose-300">Couldn't connect</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-3">
            <button
              onClick={toggleCam}
              aria-label={camOn ? 'Turn camera off' : 'Turn camera on'}
              className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition ${camOn ? 'bg-black/60 text-mist-100 hover:bg-black/70' : 'bg-mist-100 text-ink-900 hover:bg-white'}`}
            >
              <CamIcon on={camOn} size={18} />
            </button>
            <button
              onClick={leaveRoom}
              aria-label="Leave room"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600"
            >
              <HangUpIcon />
            </button>
            <button
              onClick={toggleMic}
              aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
              className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition ${micOn ? 'bg-black/60 text-mist-100 hover:bg-black/70' : 'bg-mist-100 text-ink-900 hover:bg-white'}`}
            >
              <MicIcon on={micOn} size={18} />
            </button>
          </div>
        </div>
        <div className="flex w-56 shrink-0 flex-col overflow-hidden">
          {participants && participants.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-700 px-2.5 py-2">
              {participants.map((p, i) => (
                <span key={i} className="flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-xs text-mist-300">
                  <span>{p.avatar_key}</span>{p.display_name}
                </span>
              ))}
            </div>
          )}
          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-2.5">
            {messages === null ? (
              <p className="text-sm text-mist-400">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-mist-400">Room's quiet, say hello.</p>
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
          <form onSubmit={send} className="flex items-center gap-2 border-t border-ink-700 p-2">
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
        </div>
      </div>
      {error && <p className="px-3 pb-2.5 text-xs text-rose-300">{error}</p>}
    </section>
  )
}

export default function MindcordSection({ identity }) {
  const [room, setRoom] = useState(null)

  return (
    <section>
      <div className="h-[420px]">
        {room ? (
          <RoomView key={room.room_id} room={room} identity={identity} onLeave={() => setRoom(null)} />
        ) : (
          <DomainList onJoin={setRoom} />
        )}
      </div>
    </section>
  )
}
