import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import ParaBadge from '../components/ParaBadge'
import { requireSessionSSR } from '../lib/pageAuth'

export default function Express({ user }) {
  const [notes, setNotes] = useState([])
  const [tasks, setTasks] = useState([])
  const [packets, setPackets] = useState([])

  const [taskTitle, setTaskTitle] = useState('')
  const [taskNoteId, setTaskNoteId] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  const [selectedId, setSelectedId] = useState('')
  const [packetTitle, setPacketTitle] = useState('')
  const [packetContent, setPacketContent] = useState('')
  const [creatingPacket, setCreatingPacket] = useState(false)
  const [copiedId, setCopiedId] = useState('')

  async function load() {
    const [notesRes, tasksRes, packetsRes] = await Promise.all([
      fetch('/api/notes'),
      fetch('/api/tasks'),
      fetch('/api/packets')
    ])
    if (notesRes.ok) setNotes(await notesRes.json())
    if (tasksRes.ok) setTasks(await tasksRes.json())
    if (packetsRes.ok) setPackets(await packetsRes.json())
  }

  useEffect(() => { load() }, [])

  const selectedNote = notes.find(n => n.id === selectedId)

  async function createTask() {
    if (!taskTitle.trim()) return
    setCreatingTask(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskTitle.trim(), note_id: taskNoteId || null, due_date: taskDueDate || null })
    })
    setCreatingTask(false)
    if (res.ok) {
      setTaskTitle('')
      setTaskNoteId('')
      setTaskDueDate('')
      load()
    }
  }

  async function toggleTask(t) {
    setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))
    await fetch('/api/tasks/' + t.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done: !t.done })
    })
  }

  async function deleteTask(t) {
    setTasks(prev => prev.filter(x => x.id !== t.id))
    await fetch('/api/tasks/' + t.id, { method: 'DELETE' })
  }

  async function createPacket() {
    if (!selectedId) return
    setCreatingPacket(true)
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
    setCreatingPacket(false)
    if (res.ok) {
      setPacketTitle('')
      setPacketContent('')
      load()
    }
  }

  async function copyPacket(p) {
    try {
      await navigator.clipboard.writeText(p.content || '')
      setCopiedId(p.id)
      setTimeout(() => setCopiedId(''), 1500)
    } catch (err) {
      // clipboard access denied — nothing to fall back to
    }
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
  const openTasks = tasks.filter(t => !t.done)
  const doneTasks = tasks.filter(t => t.done)

  return (
    <Layout user={user}>
      <p className="label mb-2">Express</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-white">Turn knowledge into outcomes</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Tasks are the next actions that move a project forward — small, realistic, one at a time. Packets are
        reusable pieces of output (a summary, a draft, a quote) worth keeping and reusing, not checking off.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card border-t-2 border-violet-400/30 p-6 lg:col-span-2">
          <p className="label mb-4 !text-violet-300">Add a task</p>
          <div className="space-y-3">
            <input
              className="input focus:!border-violet-500/60 focus:!ring-violet-500/40"
              placeholder="What's the next action?"
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createTask() }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="input" value={taskNoteId} onChange={e => setTaskNoteId(e.target.value)}>
                <option value="">Not linked to a note</option>
                {notes.map(n => (
                  <option key={n.id} value={n.id}>{n.title}</option>
                ))}
              </select>
              <input className="input" type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />
            </div>
            <button onClick={createTask} disabled={!taskTitle.trim() || creatingTask} className="btn-violet">
              {creatingTask ? 'Adding…' : 'Add task'}
            </button>
          </div>

          <p className="label mb-3 mt-8 !text-violet-300">Open ({openTasks.length})</p>
          {openTasks.length === 0 ? (
            <p className="text-sm text-mist-400">Nothing on your plate. Add the next small step on a project.</p>
          ) : (
            <div className="space-y-2">
              {openTasks.map(t => {
                const note = notes.find(n => n.id === t.note_id)
                const overdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString())
                return (
                  <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border border-ink-700 p-3">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={false} onChange={() => toggleTask(t)} className="mt-1" />
                      <div>
                        <p className="text-sm text-mist-100">{t.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist-500">
                          {note && <span>↳ {note.title}</span>}
                          {t.due_date && (
                            <span className={overdue ? 'text-red-400' : ''}>
                              due {new Date(t.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteTask(t)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
                  </div>
                )
              })}
            </div>
          )}

          {doneTasks.length > 0 && (
            <>
              <p className="label mb-3 mt-8">Completed ({doneTasks.length})</p>
              <div className="space-y-2">
                {doneTasks.map(t => (
                  <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={true} onChange={() => toggleTask(t)} className="mt-1" />
                      <p className="text-sm text-mist-400 line-through">{t.title}</p>
                    </div>
                    <button onClick={() => deleteTask(t)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card border-t-2 border-emerald-400/30 p-6">
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

      <div className="mt-6 card border-t-2 border-gold-400/30 p-6">
        <p className="label mb-1 !text-gold-400">Save a reusable packet</p>
        <p className="mb-4 text-xs text-mist-500">
          A packet is a piece of finished output worth keeping — a summary, a paragraph, a template — so you don't
          rebuild it from scratch next time.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <select className="input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">Select a source note…</option>
              {notes.map(n => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
            <input className="input" placeholder="Packet title (optional)" value={packetTitle} onChange={e => setPacketTitle(e.target.value)} />
            <textarea
              className="input min-h-[100px] focus:!border-gold-500/60 focus:!ring-gold-500/40"
              placeholder={selectedNote ? (selectedNote.executive_summary || selectedNote.content || '').slice(0, 200) : 'Packet content (optional — defaults to the note summary)'}
              value={packetContent}
              onChange={e => setPacketContent(e.target.value)}
            />
            <button onClick={createPacket} disabled={!selectedId || creatingPacket} className="btn-gold">
              {creatingPacket ? 'Saving…' : 'Save packet'}
            </button>
          </div>

          <div>
            {packets.length === 0 ? (
              <p className="text-sm text-mist-400">No packets saved yet.</p>
            ) : (
              <div className="scrollbar-thin space-y-2 overflow-y-auto" style={{ maxHeight: 320 }}>
                {packets.map(p => (
                  <div key={p.id} className="flex items-start justify-between gap-3 rounded-md border border-ink-700 p-3">
                    <div>
                      <p className="text-sm text-mist-100">{p.title}</p>
                      <p className="mt-1 text-xs text-mist-500">{(p.content || '').slice(0, 160)}</p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button onClick={() => copyPacket(p)} className="text-xs text-gold-400 hover:text-gold-500">
                        {copiedId === p.id ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={() => deletePacket(p)} className="text-xs text-mist-500 hover:text-red-400">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
