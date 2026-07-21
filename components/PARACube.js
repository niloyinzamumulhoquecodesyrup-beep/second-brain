import { useEffect, useRef, useState } from 'react'
import { PARA_THEME } from '../lib/paraTheme'
import NoteActionModal from './NoteActionModal'

// A curated, ADHD-friendly icon set (concrete/varied shapes read faster than a single
// generic folder glyph) — assigned deterministically per note id so the same note
// always gets the same icon across reloads, with no schema change needed.
const ICONS = ['🚀', '🎯', '🛠️', '📐', '🧭', '🔭', '🌱', '🧩', '🎨', '📡', '⚙️', '🏗️']

function iconFor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ICONS[hash % ICONS.length]
}

const FACES = [
  { key: 'project', heading: 'Jump into a project', name: 'Projects', theme: PARA_THEME.project, glow: 'rgba(52,211,153,0.45)', empty: "No active projects yet — mark a note as a Project in Organize and it'll show up here." },
  { key: 'area', heading: 'Jump into an area', name: 'Areas', theme: PARA_THEME.area, glow: 'rgba(167,139,250,0.45)', empty: "No areas yet — mark a note as an Area in Organize." },
  { key: 'resource', heading: 'Jump into a resource', name: 'Resources', theme: PARA_THEME.resource, glow: 'rgba(250,204,21,0.4)', empty: "No resources yet — mark a note as a Resource in Organize." },
  { key: 'archive', heading: 'Jump into the archive', name: 'Archives', theme: PARA_THEME.archive, glow: 'rgba(148,163,184,0.35)', empty: 'Nothing archived yet.' }
]

// Faces are inset narrower than the scene so the two neighboring faces peek in at the
// edges (foreshortened by the shared rotation pivot) — that peek is what reads as a cube
// at rest, before any swipe happens.
const FACE_WIDTH_RATIO = 0.74
const CUBE_TILT_DEG = 10
const SWIPE_THRESHOLD_DEG = 22

function Face({ face, notes, onOpen }) {
  return (
    <div className={`relative flex h-full flex-col overflow-hidden rounded-xl border border-ink-600 border-t-2 bg-ink-900 p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] ${face.theme.border}`}>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-black/20" />
      <div className="relative mb-3 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${face.theme.dot}`} />
        <p className={`label !text-[13px] ${face.theme.text}`}>{face.name}</p>
      </div>

      {notes === null && <p className="text-sm text-mist-400">Loading…</p>}

      {notes && notes.length === 0 && (
        <p className="text-sm text-mist-400">{face.empty}</p>
      )}

      {notes && notes.length > 0 && (
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
          {notes.map(n => (
            <button
              key={n.id}
              onClick={() => onOpen(n)}
              className="flex flex-col items-start gap-2 rounded-xl border border-ink-600 bg-ink-950/40 p-3.5 text-left transition hover:border-ink-400/60 hover:bg-ink-900/60"
            >
              <span className="text-2xl leading-none">{iconFor(n.id)}</span>
              <span className="line-clamp-2 text-sm font-medium text-mist-100">{n.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PARACube({ tag }) {
  const [notesByPara, setNotesByPara] = useState(null)
  const [openNote, setOpenNote] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [width, setWidth] = useState(360)
  const [dragDeg, setDragDeg] = useState(0)
  const [dragging, setDragging] = useState(false)

  const sceneRef = useRef(null)
  const startXRef = useRef(0)
  const movedRef = useRef(false)
  const pointerIdRef = useRef(null)

  useEffect(() => {
    const qs = tag ? `?tag=${encodeURIComponent(tag)}` : ''
    fetch('/api/notes' + qs)
      .then(r => r.json())
      .then(notes => {
        const grouped = { project: [], area: [], resource: [], archive: [] }
        notes.forEach(n => {
          if (n.para === 'project' && n.status && n.status !== 'active') return
          if (grouped[n.para]) grouped[n.para].push(n)
        })
        setNotesByPara(grouped)
      })
      .catch(() => setNotesByPara({ project: [], area: [], resource: [], archive: [] }))
  }, [tag])

  useEffect(() => {
    const el = sceneRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width
      if (w) setWidth(w)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const faceWidth = width * FACE_WIDTH_RATIO
  const half = faceWidth / 2
  const leftOffset = (width - faceWidth) / 2
  const activeFace = FACES[activeIndex]

  function goTo(i) {
    setActiveIndex(((i % FACES.length) + FACES.length) % FACES.length)
  }

  // A real swipe needs to travel roughly a quarter of the cube's width before it even
  // rotates a face (SWIPE_THRESHOLD_DEG), so "was this a drag" can afford to be far
  // more forgiving than a hair-trigger pixel count.
  const CLICK_JITTER_PX = 24

  function onPointerDown(e) {
    setDragging(true)
    movedRef.current = false
    startXRef.current = e.clientX
    pointerIdRef.current = e.pointerId
    // Capture is NOT taken here. Calling setPointerCapture unconditionally on every
    // pointerdown — including a plain click — retargets the matching pointerup (and,
    // downstream, the synthesized click) to this scene div instead of whatever note
    // button is actually under the cursor. Since real mice/trackpads almost always
    // report a pixel or two of movement between press and release, that reliably ate
    // every real click while still "working" under an automated, zero-jitter click.
    // Capture is instead acquired lazily in onPointerMove, once movement crosses the
    // jitter threshold and this is confirmably a drag rather than a tap.
  }

  function onPointerMove(e) {
    if (!dragging) return
    const dx = e.clientX - startXRef.current
    if (Math.abs(dx) > CLICK_JITTER_PX) {
      if (!movedRef.current) sceneRef.current?.setPointerCapture?.(pointerIdRef.current)
      movedRef.current = true
    }
    setDragDeg((dx / width) * 90)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (dragDeg <= -SWIPE_THRESHOLD_DEG) goTo(activeIndex + 1)
    else if (dragDeg >= SWIPE_THRESHOLD_DEG) goTo(activeIndex - 1)
    setDragDeg(0)
  }

  function openNoteGuarded(note) {
    if (movedRef.current) return
    setOpenNote(note)
  }

  // A note moved out of its current face via the action modal — drop it from this
  // face's list locally instead of a full refetch; it'll show up on its new face
  // next time that face's data is touched (grouped once on load, per-face is fine
  // to go slightly stale until reload since this cube favors browsing over editing).
  function handleMoved(noteId) {
    setNotesByPara(prev => {
      if (!prev) return prev
      const next = {}
      for (const key of Object.keys(prev)) next[key] = prev[key].filter(n => n.id !== noteId)
      return next
    })
  }

  const totalDeg = -(activeIndex * 90) + dragDeg

  return (
    <div className={`card border-t-2 p-6 transition-colors ${activeFace.theme.border}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className={`label !text-[13px] ${activeFace.theme.text}`}>{activeFace.heading}</p>
      </div>

      <div className="relative">
        <div
          ref={sceneRef}
          className="relative h-[340px] w-full touch-pan-y select-none overflow-hidden rounded-xl"
          style={{ perspective: '1300px' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div
            className="pointer-events-none absolute inset-0 blur-2xl transition-colors duration-500"
            style={{ background: `radial-gradient(55% 55% at 50% 35%, ${activeFace.glow}, transparent 72%)` }}
          />

          {/* Constant tilt — reads as a box even before any swipe happens. */}
          <div className="relative h-full w-full" style={{ transformStyle: 'preserve-3d', transform: `rotateX(${CUBE_TILT_DEG}deg)` }}>
            <div
              className={`relative h-full w-full cursor-grab active:cursor-grabbing ${dragging ? '' : 'transition-transform duration-500 ease-out'}`}
              style={{
                transformStyle: 'preserve-3d',
                transform: `translateZ(${-half}px) rotateY(${totalDeg}deg)`
              }}
            >
              {FACES.map((face, i) => (
                <div
                  key={face.key}
                  className="absolute top-0"
                  style={{
                    width: faceWidth,
                    left: leftOffset,
                    height: '100%',
                    transform: `rotateY(${i * 90}deg) translateZ(${half}px)`,
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden'
                  }}
                >
                  <Face
                    face={face}
                    notes={notesByPara ? notesByPara[face.key] : null}
                    onOpen={openNoteGuarded}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => goTo(activeIndex - 1)}
          aria-label="Previous face"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-ink-600 bg-ink-950/70 p-1.5 text-mist-300 backdrop-blur transition hover:border-mist-300/60 hover:text-mist-100"
        >
          ‹
        </button>
        <button
          onClick={() => goTo(activeIndex + 1)}
          aria-label="Next face"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-ink-600 bg-ink-950/70 p-1.5 text-mist-300 backdrop-blur transition hover:border-mist-300/60 hover:text-mist-100"
        >
          ›
        </button>
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {FACES.map((face, i) => (
          <button
            key={face.key}
            onClick={() => goTo(i)}
            aria-label={`Go to ${face.name}`}
            className={`h-1.5 w-1.5 rounded-full transition ${i === activeIndex ? face.theme.dot : 'bg-ink-600'}`}
          />
        ))}
      </div>

      {openNote && (
        <NoteActionModal note={openNote} onClose={() => setOpenNote(null)} onMoved={handleMoved} />
      )}
    </div>
  )
}
