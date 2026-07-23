import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PARA_THEME } from '../lib/paraTheme'

// The Organize cube's per-note action sheet: distill it, move it to another PARA
// bucket, or (once distilled) spin it out into real work — one or more tasks, or a
// reusable packet. Replaces the old separate Organize/Distill/Express pages with one
// popover reachable from wherever a note shows up (cube face or the Inbox strip).
const MOVE_TARGETS = ['project', 'area', 'resource', 'archive']

export default function NoteActionModal({ note, onClose, onMoved, onGraduated }) {
  const [mode, setMode] = useState('view') // 'view' | 'distill'
  const [summary, setSummary] = useState(note.executive_summary || '')
  const [saving, setSaving] = useState(false)
  const [distilled, setDistilled] = useState(note.distilled)
  const [moving, setMoving] = useState(false)
  const [graduated, setGraduated] = useState(note.graduated)
  const [graduating, setGraduating] = useState(false)
  const [taskTitle, setTaskTitle] = useState(note.title)
  const [addingTask, setAddingTask] = useState(false)
  const [addedTasks, setAddedTasks] = useState([])
  const [savingPacket, setSavingPacket] = useState(false)
  const [packetSaved, setPacketSaved] = useState(false)

  const theme = PARA_THEME[note.para] || PARA_THEME.inbox

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function saveDistill() {
    if (!summary.trim()) return
    setSaving(true)
    const res = await fetch('/api/notes/' + note.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ executive_summary: summary, distilled: true })
    })
    setSaving(false)
    if (res.ok) setDistilled(true)
  }

  async function graduate() {
    setGraduating(true)
    const res = await fetch('/api/notes/' + note.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ graduated: true })
    })
    setGraduating(false)
    if (res.ok) {
      setGraduated(true)
      onGraduated?.(note.id)
    }
  }

  async function moveTo(para) {
    setMoving(true)
    await fetch('/api/para', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: note.id, para })
    })
    setMoving(false)
    onMoved?.(note.id, para)
    onClose()
  }

  async function addTask() {
    if (!taskTitle.trim()) return
    setAddingTask(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: taskTitle.trim(), note_id: note.id })
    })
    setAddingTask(false)
    if (res.ok) {
      setAddedTasks(prev => [...prev, taskTitle.trim()])
      setTaskTitle('')
    }
  }

  async function savePacket() {
    setSavingPacket(true)
    const res = await fetch('/api/packets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note_id: note.id, title: note.title, content: summary || note.content })
    })
    setSavingPacket(false)
    if (res.ok) setPacketSaved(true)
  }

  const preview = note.executive_summary || note.content || 'Nothing written here yet.'
  const moveOptions = MOVE_TARGETS.filter(p => p !== note.para)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className={`card my-8 w-full max-w-xl border-t-2 p-6 ${theme.border}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-serif text-2xl font-light text-mist-100">{note.title}</h2>
          <button onClick={onClose} className="shrink-0 text-mist-400 hover:text-mist-100" aria-label="Close">✕</button>
        </div>

        {note.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.map(t => (
              <span key={t} className="rounded-full border border-ink-700 px-2 py-0.5 text-[11px] text-mist-400">{t}</span>
            ))}
          </div>
        )}

        {mode === 'view' ? (
          <>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-mist-200">{preview}</p>
            <div className="mt-2 flex items-center gap-3">
              {distilled && <p className="text-[11px] uppercase tracking-wide text-gold-400">Distilled</p>}
              {graduated && <p className="text-[11px] uppercase tracking-wide text-emerald-300">Graduated</p>}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-4">
              <button onClick={() => setMode('distill')} className="btn-gold !py-1.5 text-sm">Distill</button>
              {distilled && !graduated && (
                <button onClick={graduate} disabled={graduating} className="chip !py-1.5 hover:border-emerald-400/60 hover:text-emerald-300">
                  {graduating ? 'Graduating…' : '🎓 Graduate'}
                </button>
              )}
              <span className="text-xs text-mist-500">Move to</span>
              {moveOptions.map(p => (
                <button key={p} disabled={moving} onClick={() => moveTo(p)} className={PARA_THEME[p].hoverMoveBtn}>
                  → {p}
                </button>
              ))}
              <Link href={`/notes/${note.id}`} className="ml-auto text-xs text-mist-400 underline decoration-dotted underline-offset-2 hover:text-mist-200">
                open full note →
              </Link>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <p className="mb-1.5 text-xs uppercase tracking-wider text-mist-400">Executive summary</p>
            <textarea
              className="input min-h-[140px] focus:!border-gold-500/60 focus:!ring-gold-500/40"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Only what feels important, in a few sentences."
              autoFocus
            />
            <div className="mt-3 flex items-center gap-3">
              <button onClick={saveDistill} disabled={saving || !summary.trim()} className="btn-gold">
                {saving ? 'Saving…' : 'Save distillation'}
              </button>
              <button onClick={() => setMode('view')} className="btn-secondary">Back</button>
              {distilled && <span className="text-xs text-emerald-300">Saved</span>}
            </div>

            {distilled && (
              <div className="mt-6 border-t border-ink-700 pt-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-mist-400">Turn this into something real</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-[180px] flex-1 rounded border border-ink-600 bg-ink-950 px-2 py-1.5 text-sm text-mist-100 placeholder-mist-400/50 focus:border-violet-400/60 focus:outline-none"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTask() }}
                    placeholder="Task title"
                  />
                  <button disabled={addingTask || !taskTitle.trim()} onClick={addTask} className="chip !py-1 hover:border-violet-400/60 hover:text-violet-300">
                    + add task
                  </button>
                  <button disabled={savingPacket || packetSaved} onClick={savePacket} className="chip !py-1 hover:border-gold-400/60 hover:text-gold-400">
                    {packetSaved ? '✓ saved as packet' : 'save as packet'}
                  </button>
                </div>
                {addedTasks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {addedTasks.map((t, i) => (
                      <li key={i} className="text-xs text-emerald-300">✓ task added: {t}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
