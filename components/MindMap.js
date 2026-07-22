import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from './ThemeProvider'
import { shortenTitle } from '../lib/titleShorten'

// The Organize tab's mind map: every note as a node, connected by the links the
// user actually typed ([[wiki-links]], note_links) plus AI-inferred connections
// from embedding similarity (see pages/api/notes/graph.js) — an Obsidian-style
// graph view, except the AI layer fills in connections between notes that are
// clearly related but were never manually linked. Pan by dragging, zoom with the
// wheel/trackpad pinch, click a node to see it and open the note.

const PARA_RGB = {
  inbox: '251,113,146',    // rose
  project: '192,145,252',  // violet
  area: '110,231,150',     // emerald
  resource: '224,192,126', // gold
  archive: '148,163,184'   // mist/gray
}
const PARA_RGB_LIGHT = {
  inbox: '184,48,90',
  project: '124,79,209',
  area: '21,128,61',
  resource: '160,120,40',
  archive: '90,98,110'
}

const PALETTES = {
  dark: {
    bg: '5,6,8',
    label: '226,232,240',
    dimLabel: '148,163,184',
    labelShadow: 'rgba(0,0,0,0.9)',
    selectionRing: 'rgba(255,255,255,0.9)',
    vignette: '0,0,0',
    vignetteAlpha: 0.5
  },
  light: {
    bg: '223,231,238',
    label: '20,22,26',
    dimLabel: '90,100,112',
    labelShadow: 'rgba(255,255,255,0.85)',
    selectionRing: 'rgba(20,22,26,0.85)',
    vignette: '70,80,95',
    vignetteAlpha: 0.2
  }
}

// Minimal dependency-free force layout (same pattern as KnowledgeGalaxy/CommunityMap):
// pairwise repulsion + edge springs + gentle centering, settled once on mount.
function runForceLayout(nodes, edges) {
  const laid = nodes.map(n => ({ ref: n, x: (Math.random() - 0.5) * 320, y: (Math.random() - 0.5) * 320 }))
  const byId = {}
  laid.forEach(n => { byId[n.ref.id] = n })
  const simEdges = edges.map(e => ({ a: byId[e.from], b: byId[e.to], type: e.type })).filter(e => e.a && e.b)

  const iterations = laid.length > 80 ? 160 : 240
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        const a = laid[i], b = laid[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const distSq = Math.max(dx * dx + dy * dy, 0.02)
        const dist = Math.sqrt(distSq)
        const force = 2200 / distSq
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        a.x += fx; a.y += fy
        b.x -= fx; b.y -= fy
      }
    }
    simEdges.forEach(({ a, b, type }) => {
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.02
      const target = type === 'link' ? 62 : 88
      const diff = (dist - target) * (type === 'link' ? 0.07 : 0.04)
      const fx = (dx / dist) * diff, fy = (dy / dist) * diff
      a.x += fx; a.y += fy
      b.x -= fx; b.y -= fy
    })
    laid.forEach(n => { n.x *= 0.994; n.y *= 0.994 })
  }
  return { nodes: laid, edges: simEdges }
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

export default function MindMap() {
  const canvasRef = useRef(null)
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selected }, [selected])

  const [showAI, setShowAI] = useState(true)
  const showAIRef = useRef(true)
  useEffect(() => { showAIRef.current = showAI }, [showAI])

  const { theme } = useTheme()
  const themeRef = useRef(theme)
  useEffect(() => { themeRef.current = theme }, [theme])

  // Node labels only — the note's real title (n.ref.title) is never touched, and
  // nothing shortened ever gets written back anywhere. The same tiny on-device
  // model FocusPomodoro uses (lib/titleShorten.js) trims each title down to a
  // couple words for the canvas label; results land here as they resolve so the
  // map renders immediately with full titles and tidies up node by node instead
  // of blocking on the whole graph.
  const shortTitlesRef = useRef({})

  useEffect(() => {
    fetch('/api/notes/graph')
      .then(r => r.json())
      .then(d => { setGraph(d); setLoading(false) })
      .catch(() => { setGraph({ nodes: [], edges: [] }); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!graph) return
    graph.nodes.forEach(n => {
      shortenTitle(n.title).then(short => { shortTitlesRef.current[n.id] = short })
    })
  }, [graph])

  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduced =
      document.documentElement.dataset.calmMode === 'on' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const degree = {}
    graph.edges.forEach(e => {
      degree[e.from] = (degree[e.from] || 0) + 1
      degree[e.to] = (degree[e.to] || 0) + 1
    })

    const { nodes, edges } = runForceLayout(graph.nodes, graph.edges)
    nodes.forEach(n => {
      const d = degree[n.ref.id] || 0
      n.r = 5 + Math.sqrt(d) * 3.2
    })
    const byId = {}
    nodes.forEach(n => { byId[n.ref.id] = n })

    const minX = Math.min(...nodes.map(n => n.x - n.r)), maxX = Math.max(...nodes.map(n => n.x + n.r))
    const minY = Math.min(...nodes.map(n => n.y - n.r)), maxY = Math.max(...nodes.map(n => n.y + n.r))
    const bboxW = Math.max(40, maxX - minX), bboxH = Math.max(40, maxY - minY)

    let width = 0, height = 0
    let zoom = 1, offsetX = 0, offsetY = 0, fitZoom = 1
    let raf, dragging = false, dragMoved = false, lastX = 0, lastY = 0
    let pinchDist = null
    let hasFitted = false

    function fitView() {
      if (width === 0 || height === 0) return
      fitZoom = clamp(Math.min(width / bboxW, height / bboxH) * 0.85, 0.05, 4)
      zoom = fitZoom
      offsetX = width / 2 - (minX + bboxW / 2) * zoom
      offsetY = height / 2 - (minY + bboxH / 2) * zoom
      hasFitted = true
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width; height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!hasFitted) fitView()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function worldToScreen(x, y) { return [x * zoom + offsetX, y * zoom + offsetY] }
    function screenToWorld(x, y) { return [(x - offsetX) / zoom, (y - offsetY) / zoom] }

    function zoomAt(cx, cy, factor) {
      const newZoom = clamp(zoom * factor, fitZoom * 0.35, fitZoom * 14)
      offsetX = cx - (cx - offsetX) * (newZoom / zoom)
      offsetY = cy - (cy - offsetY) * (newZoom / zoom)
      zoom = newZoom
    }

    function onWheel(e) {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016))
      zoomAt(cx, cy, factor)
    }
    function onPointerDown(e) {
      dragging = true; dragMoved = false
      lastX = e.clientX; lastY = e.clientY
      try { canvas.setPointerCapture(e.pointerId) } catch (err) {}
    }
    function onPointerMove(e) {
      if (!dragging) return
      const dx = e.clientX - lastX, dy = e.clientY - lastY
      if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true
      offsetX += dx; offsetY += dy
      lastX = e.clientX; lastY = e.clientY
    }
    function onPointerUp(e) {
      dragging = false
      if (!dragMoved) handleClick(e)
    }
    function touchDist(t) {
      const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }
    function onTouchStart(e) {
      if (e.touches.length === 2) { pinchDist = touchDist(e.touches); dragging = false }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2 && pinchDist != null) {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const d = touchDist(e.touches)
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
        zoomAt(mx, my, d / pinchDist)
        pinchDist = d
      }
    }
    function onTouchEnd(e) { if (e.touches.length < 2) pinchDist = null }

    function handleClick(e) {
      const rect = canvas.getBoundingClientRect()
      const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      let best = null, bestDist = Infinity
      nodes.forEach(n => {
        const d = Math.hypot(n.x - wx, n.y - wy)
        if (d < Math.max(n.r, 10) && d < bestDist) { best = n; bestDist = d }
      })
      setSelected(best)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    function draw() {
      if (width === 0 || height === 0) { raf = requestAnimationFrame(draw); return }
      const pal = PALETTES[themeRef.current] || PALETTES.dark
      const paraRgb = themeRef.current === 'light' ? PARA_RGB_LIGHT : PARA_RGB
      ctx.fillStyle = `rgb(${pal.bg})`
      ctx.fillRect(0, 0, width, height)

      const sel = selectedRef.current
      const showAI2 = showAIRef.current

      edges.forEach(({ a, b, type }) => {
        if (type === 'ai' && !showAI2) return
        const [ax, ay] = worldToScreen(a.x, a.y)
        const [bx, by] = worldToScreen(b.x, b.y)
        const touchesSelection = sel && (a === sel || b === sel)
        const rgb = paraRgb[b.ref.para] || paraRgb.resource
        ctx.setLineDash(type === 'ai' ? [3, 3] : [])
        ctx.strokeStyle = `rgba(${rgb},${touchesSelection ? 0.85 : type === 'ai' ? 0.18 : 0.35})`
        ctx.lineWidth = Math.max(0.6, (touchesSelection ? 1.6 : 1) * zoom / fitZoom)
        ctx.beginPath()
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
        ctx.stroke()
      })
      ctx.setLineDash([])

      nodes.forEach(n => {
        const [sx, sy] = worldToScreen(n.x, n.y)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return
        const rgb = paraRgb[n.ref.para] || paraRgb.resource
        const r = Math.max(1, n.r * zoom)
        const dim = sel && sel !== n
        ctx.shadowColor = `rgba(${rgb},0.85)`
        ctx.shadowBlur = dim ? 0 : 8
        ctx.fillStyle = `rgba(${rgb},${dim ? 0.35 : 0.85})`
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (sel === n) {
          ctx.strokeStyle = pal.selectionRing
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, r + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      nodes.forEach(n => {
        const [sx, sy] = worldToScreen(n.x, n.y)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return
        const r = n.r * zoom
        if (r > 8 || sel === n) {
          ctx.font = sel === n ? '600 12px -apple-system,system-ui,sans-serif' : '400 11px -apple-system,system-ui,sans-serif'
          ctx.fillStyle = sel === n ? `rgba(${pal.label},0.95)` : `rgba(${pal.dimLabel},0.7)`
          ctx.textAlign = 'center'
          ctx.shadowColor = pal.labelShadow
          ctx.shadowBlur = 6
          ctx.fillText(shortTitlesRef.current[n.ref.id] || n.ref.title, sx, sy + Math.max(1, r) + 14)
          ctx.shadowBlur = 0
        }
      })

      const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.4, width / 2, height / 2, Math.max(width, height) * 0.75)
      vg.addColorStop(0, `rgba(${pal.vignette},0)`)
      vg.addColorStop(1, `rgba(${pal.vignette},${pal.vignetteAlpha})`)
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, width, height)

      raf = reduced ? null : requestAnimationFrame(draw)
      if (reduced && !raf) draw._done = true
    }
    raf = requestAnimationFrame(draw)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  if (loading) return <div className="card" style={{ height: 460 }} />

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="card p-6">
        <p className="label mb-2 !text-emerald-300">Mind map</p>
        <p className="text-sm text-mist-400">Capture a few notes and this fills in — a note's connections come from links you type and ones the AI notices in the embeddings.</p>
      </div>
    )
  }

  const aiEdgeCount = graph.edges.filter(e => e.type === 'ai').length

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3 sm:px-6">
        <p className="label !mb-0 !text-emerald-300">Mind map</p>
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="hidden text-[11px] text-mist-500 sm:block">drag to pan · scroll or pinch to zoom · click a note</p>
          {aiEdgeCount > 0 && (
            <button
              onClick={() => setShowAI(v => !v)}
              className={`chip !py-1 !text-[11px] ${showAI ? 'border-violet-400/50 text-violet-300' : ''}`}
              title="Toggle AI-inferred connections (dashed lines)"
            >
              AI connections: {showAI ? 'on' : 'off'}
            </button>
          )}
        </div>
      </div>
      <div className="relative" style={{ height: 460 }}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ cursor: 'grab' }} />
      </div>
      {selected && (
        <div className="border-t border-ink-700 bg-ink-950/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-mist-100">{selected.ref.title}</p>
              <p className="text-xs capitalize text-mist-500">
                {selected.ref.para}{selected.ref.tags?.length > 0 ? ` · ${selected.ref.tags.join(', ')}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Link href={`/notes/${selected.ref.id}`} className="text-xs text-emerald-300 hover:text-emerald-200">Open note →</Link>
              <button onClick={() => setSelected(null)} className="text-xs text-mist-500 hover:text-mist-300">close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
