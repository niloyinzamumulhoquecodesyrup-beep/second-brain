import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import ParaBadge from '../components/ParaBadge'
import { requireSessionSSR } from '../lib/pageAuth'

export default function Express({ user }) {
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [packetTitle, setPacketTitle] = useState('')
  const [packetContent, setPacketContent] = useState('')
  const [packets, setPackets] = useState([])
  const [creating, setCreating] = useState(false)

  async function load() {
    const [notesRes, packetsRes] = await Promise.all([fetch('/api/notes'), fetch('/api/packets')])
    if (notesRes.ok) setNotes(await notesRes.json())
    if (packetsRes.ok) setPackets(await packetsRes.json())
  }

  useEffect(() => { load() }, [])

  const selectedNote = notes.find(n => n.id === selectedId)

  async function createPacket() {
    if (!selectedId) return
    setCreating(true)
    const note = notes.find(n => n.id === selectedId)
    const res = await fetch('/api/packets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        note_id: selectedId,
        title: packetTitle || note.title,
        content: packetContent || (note.executive_summary || note.content || '').slice(0, 1000)
      })
    })
    setCreating(false)
    if (res.ok) {
      setPacketTitle('')
      setPacketContent('')
      load()
    }
  }

  async function togglePacket(p) {
    setPackets(prev => prev.map(x => (x.id === p.id ? { ...x, done: !x.done } : x)))
    await fetch('/api/packets/' + p.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: !p.done })
    })
  }

  async function deletePacket(p) {
    setPackets(prev => prev.filter(x => x.id !== p.id))
    await fetch('/api/packets/' + p.id, { method: 'DELETE' })
  }

  async function markCompleted(note) {
    await fetch('/api/notes/' + note.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: note.status === 'completed' ? 'active' : 'completed', para: 'archive' })
    })
    load()
  }

  const projects = notes.filter(n => n.para === 'project')

  return (
    <Layout user={user}>
      <p className="label mb-2">Express</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-white">Turn knowledge into outcomes</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Break work into intermediate packets — small, reusable pieces, like Lego bricks. Be realistic. Completion
        over perfection.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <p className="label mb-4">Create an intermediate packet</p>
          <div className="space-y-3">
            <select className="input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">Select a source note…</option>
              {notes.map(n => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
            <input className="input" placeholder="Packet title (optional)" value={packetTitle} onChange={e => setPacketTitle(e.target.value)} />
            <textarea
              className="input min-h-[120px]"
              placeholder={selectedNote ? (selectedNote.executive_summary || selectedNote.content || '').slice(0, 200) : 'Packet content (optional — defaults to the note summary)'}
              value={packetContent}
              onChange={e => setPacketContent(e.target.value)}
            />
            <button onClick={createPacket} disabled={!selectedId || creating} className="btn-primary">
              {creating ? 'Creating…' : 'Create packet'}
            </button>
          </div>

          <p className="label mb-4 mt-8">Packets</p>
          {packets.length === 0 ? (
            <p className="text-sm text-mist-400">No packets yet — turn a distilled note into a first small step.</p>
          ) : (
            <div className="space-y-2">
              {packets.map(p => (
                <div key={p.id} className={`flex items-start justify-between gap-3 rounded-md border p-3 ${p.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-ink-700'}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={!!p.done} onChange={() => togglePacket(p)} className="mt-1" />
                    <div>
                      <p className={`text-sm ${p.done ? 'text-mist-400 line-through' : 'text-mist-100'}`}>{p.title}</p>
                      <p className="mt-1 text-xs text-mist-500">{(p.content || '').slice(0, 200)}</p>
                    </div>
                  </div>
                  <button onClick={() => deletePacket(p)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <p className="label mb-4">Projects</p>
          {projects.length === 0 ? (
            <p className="text-sm text-mist-400">No active projects. Move a note to Projects in Organize.</p>
          ) : (
            <div className="space-y-3">
              {projects.map(n => (
                <div key={n.id} className="rounded-md border border-ink-700 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-sm text-mist-100">{n.title}</p>
                    <ParaBadge para={n.para} />
                  </div>
                  <button onClick={() => markCompleted(n)} className="btn-ghost mt-1 text-xs">
                    {n.status === 'completed' ? 'Reopen' : 'Mark complete & archive →'}
                  </button>
                </div>
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
