import { useEffect, useState } from 'react'
import NoteActionModal from './NoteActionModal'

// Where distilled notes land once someone taps Graduate on them in the PARA cube —
// finished with the CODE loop on purpose, so they're pulled out of the Project/Area/
// Resource/Archive faces entirely instead of just sitting there as one more card.
export default function GraduatedSection({ refreshKey }) {
  const [notes, setNotes] = useState(null)
  const [openNote, setOpenNote] = useState(null)

  useEffect(() => {
    fetch('/api/notes?graduated=true')
      .then(r => r.json())
      .then(setNotes)
      .catch(() => setNotes([]))
  }, [refreshKey])

  if (notes && notes.length === 0) return null

  return (
    <div className="card border-t-2 border-emerald-400/40 p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <p className="label !text-[13px] text-emerald-300">🎓 Graduated</p>
      </div>

      {notes === null && <p className="text-sm text-mist-400">Loading…</p>}

      {notes && notes.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => setOpenNote(n)}
              className="flex flex-col items-start gap-2 rounded-xl border border-ink-600 bg-ink-950/40 p-3.5 text-left transition hover:border-emerald-400/50 hover:bg-ink-900/60"
            >
              <span className="line-clamp-2 text-sm font-medium text-mist-100">{n.title}</span>
            </button>
          ))}
        </div>
      )}

      {openNote && <NoteActionModal note={openNote} onClose={() => setOpenNote(null)} />}
    </div>
  )
}
