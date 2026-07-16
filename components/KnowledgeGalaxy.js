import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// Interest clusters + how-you-work, merged into one map: a real academic subject
// hierarchy (Science > Biology > Neuroscience > Neurobiology, etc.) rendered as a
// force-directed "galaxy" — glowing lit nodes where the account's real notes actually
// are, dim unlit nodes for the surrounding fields of knowledge that exist whether or
// not anything's been captured there yet. Pan by dragging, zoom with the wheel/trackpad
// pinch/touch pinch — a map, not a click-to-focus drill-down.
//
// v1 note: the taxonomy SHAPE below is a hardcoded seed, not cycle-generated. `goalName`
// on a leaf is the join key against real `inferred_goal` rows (data.byKind.inferred_goal
// from /api/mind/insights) — note counts and click-through detail are live; the tree
// structure itself should eventually be written by a refresh cycle into mind_sections/
// mind_knowledge (per MIND_MODEL_BRIEF §4h/§4i) instead of living here.
const TAXONOMY = {
  id: 'root', name: 'All Knowledge', cluster: 'root',
  children: [
    { id: 'science', name: 'Science', cluster: 'science', children: [
      { id: 'biology', name: 'Biology', cluster: 'science', children: [
        { id: 'neuroscience', name: 'Neuroscience', cluster: 'science', children: [
          { id: 'neurobiology', name: 'Neurobiology', cluster: 'science', goalName: 'Neurobiology' },
          { id: 'neuroanatomy', name: 'Neuroanatomy', cluster: 'science' },
          { id: 'neurophysiology', name: 'Neurophysiology', cluster: 'science' },
          { id: 'cogneuro', name: 'Cognitive Neuroscience', cluster: 'science' }
        ] },
        { id: 'genetics', name: 'Genetics', cluster: 'science' },
        { id: 'cellbio', name: 'Cell Biology', cluster: 'science' }
      ] },
      { id: 'psychology', name: 'Psychology', cluster: 'science', children: [
        { id: 'cogpsych', name: 'Cognitive Psychology', cluster: 'science' },
        { id: 'clinpsych', name: 'Clinical Psychology', cluster: 'science' }
      ] },
      { id: 'physics', name: 'Physics', cluster: 'science' }
    ] },
    { id: 'technology', name: 'Technology', cluster: 'technology', children: [
      { id: 'compsci', name: 'Computer Science', cluster: 'technology', children: [
        { id: 'ai', name: 'Artificial Intelligence', cluster: 'technology', children: [
          { id: 'ml', name: 'Machine Learning', cluster: 'technology' },
          { id: 'nlp', name: 'Natural Language Processing', cluster: 'technology' }
        ] },
        { id: 'pkm', name: 'Personal Knowledge Management', cluster: 'technology', children: [
          { id: 'secondbrain', name: 'Second Brain & PARA Method', cluster: 'technology', goalName: 'Mind Model' },
          { id: 'notetaking', name: 'Note-Taking Systems', cluster: 'technology' }
        ] }
      ] },
      { id: 'robotics', name: 'Robotics', cluster: 'technology' }
    ] },
    { id: 'business', name: 'Business', cluster: 'business', children: [
      { id: 'entrepreneurship', name: 'Entrepreneurship', cluster: 'business', children: [
        { id: 'ecommerce', name: 'E-Commerce Operations', cluster: 'business', goalName: 'Satoshi' },
        { id: 'marketing', name: 'Marketing', cluster: 'business' }
      ] },
      { id: 'finance', name: 'Finance', cluster: 'business' }
    ] }
  ]
}

const CLUSTER_RGB = {
  root: '148,163,184',
  science: '110,231,150',   // green
  technology: '96,190,250', // blue/cyan
  business: '251,113,146'   // rose/red
}

function flatten(root) {
  const nodes = []
  const edges = []
  ;(function walk(n, parent, depth) {
    nodes.push({ ref: n, depth, x: (Math.random() - 0.5) * 260, y: (Math.random() - 0.5) * 260 })
    if (parent) edges.push([parent.ref.id, n.id])
    if (n.children) n.children.forEach(c => walk(c, nodes[nodes.length - 1], depth + 1))
  })(root, null, 0)
  return { nodes, edges }
}

// Minimal dependency-free force layout: pairwise repulsion + edge springs + light
// centering, settled once on mount. ~30 nodes so an O(n^2) pass for ~220 iterations
// is trivial (well under a frame budget run synchronously before first paint).
function runForceLayout(root) {
  const { nodes, edges } = flatten(root)
  const byId = {}
  nodes.forEach(n => { byId[n.ref.id] = n })
  const simEdges = edges.map(([a, b]) => [byId[a], byId[b]])

  for (let iter = 0; iter < 220; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const distSq = Math.max(dx * dx + dy * dy, 0.02)
        const dist = Math.sqrt(distSq)
        const force = 2400 / distSq
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        a.x += fx; a.y += fy
        b.x -= fx; b.y -= fy
      }
    }
    simEdges.forEach(([a, b]) => {
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.02
      const target = 68 + a.depth * 6
      const diff = (dist - target) * 0.06
      const fx = (dx / dist) * diff, fy = (dy / dist) * diff
      a.x += fx; a.y += fy
      b.x -= fx; b.y -= fy
    })
    nodes.forEach(n => { n.x *= 0.995; n.y *= 0.995 })
  }
  return { nodes, edges: simEdges }
}

function leafRadius(notes) {
  return notes > 0 ? 6 + Math.sqrt(notes) * 3.4 : 3
}
function hubRadius(depth) {
  return Math.max(5, 15 - depth * 2.6)
}
function heatFor(notes) {
  return Math.min(1, 0.18 + notes * 0.1)
}

function makeStars(count, spread) {
  const stars = []
  for (let i = 0; i < count; i++) {
    stars.push({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
      r: 0.5 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.2
    })
  }
  return stars
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)) }

export default function KnowledgeGalaxy({ goals }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [selected, setSelected] = useState(null)
  // Read inside the draw loop via ref, not the `selected` state directly — the canvas
  // effect below must NOT re-run (and rebuild the whole force layout + reset pan/zoom)
  // every time the user selects or deselects a node.
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selected }, [selected])

  // live join: taxonomy leaf `goalName` -> real inferred_goal row (notes/source_refs)
  const goalByName = {}
  ;(goals || []).forEach(g => { if (g.metadata?.name) goalByName[g.metadata.name] = g })

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduced =
      document.documentElement.dataset.calmMode === 'on' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const { nodes, edges } = runForceLayout(TAXONOMY)
    nodes.forEach(n => {
      const g = n.ref.goalName ? goalByName[n.ref.goalName] : null
      n.notes = g ? (g.source_refs?.length || 1) : 0
      n.lit = n.notes > 0
      n.heat = heatFor(n.notes)
      n.r = n.ref.children ? hubRadius(n.depth) : leafRadius(n.notes)
      n.goal = g || null
    })
    const byId = {}
    nodes.forEach(n => { byId[n.ref.id] = n })

    const minX = Math.min(...nodes.map(n => n.x - n.r)), maxX = Math.max(...nodes.map(n => n.x + n.r))
    const minY = Math.min(...nodes.map(n => n.y - n.r)), maxY = Math.max(...nodes.map(n => n.y + n.r))
    const bboxW = Math.max(40, maxX - minX), bboxH = Math.max(40, maxY - minY)
    const stars = makeStars(220, Math.max(bboxW, bboxH) * 2.4)

    let width = 0, height = 0
    let zoom = 1, offsetX = 0, offsetY = 0, fitZoom = 1
    let raf, dragging = false, dragMoved = false, lastX = 0, lastY = 0
    let pinchDist = null
    let hasFitted = false

    function fitView() {
      if (width === 0 || height === 0) return
      fitZoom = clamp(Math.min(width / bboxW, height / bboxH) * 0.82, 0.05, 4)
      zoom = fitZoom
      offsetX = width / 2 - (minX + bboxW / 2) * zoom
      offsetY = height / 2 - (minY + bboxH / 2) * zoom
      hasFitted = true
    }

    // Only auto-fit once, on the first real measurement — an explicit `hasFitted` flag
    // rather than inferring "not fitted yet" from zoom===1, which a legitimately
    // computed fit could coincidentally equal, silently disabling future intent.
    // Later container resizes (responsive layout, orientation change) keep the user's
    // current pan/zoom instead of snapping back to a fresh fit.
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
      // Capture is a nice-to-have (keeps dragging tracked if the pointer leaves the
      // canvas bounds) — never let a capture failure break the drag/click interaction.
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
      setSelected(best && best.lit ? best : null)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    function draw(now) {
      if (width === 0 || height === 0) { raf = requestAnimationFrame(draw); return }
      ctx.fillStyle = '#050608'
      ctx.fillRect(0, 0, width, height)

      // star field
      const t = now / 1000
      stars.forEach(s => {
        const [sx, sy] = worldToScreen(s.x, s.y)
        if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) return
        const tw = reduced ? 0.6 : 0.45 + 0.4 * Math.sin(t * s.speed + s.phase)
        ctx.fillStyle = `rgba(226,232,240,${(0.25 + tw * 0.5).toFixed(2)})`
        ctx.beginPath()
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
        ctx.fill()
      })

      // edges
      edges.forEach(([a, b]) => {
        const [ax, ay] = worldToScreen(a.x, a.y)
        const [bx, by] = worldToScreen(b.x, b.y)
        const rgb = CLUSTER_RGB[b.ref.cluster] || CLUSTER_RGB.root
        const alpha = b.lit ? 0.32 : 0.12
        ctx.strokeStyle = `rgba(${rgb},${alpha})`
        ctx.lineWidth = Math.max(0.6, 1 * zoom / fitZoom)
        ctx.beginPath()
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
        ctx.stroke()
      })

      // nodes
      nodes.forEach(n => {
        const [sx, sy] = worldToScreen(n.x, n.y)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return
        const rgb = CLUSTER_RGB[n.ref.cluster] || CLUSTER_RGB.root
        const r = n.r * zoom
        if (n.lit) {
          ctx.shadowColor = `rgba(${rgb},0.9)`
          ctx.shadowBlur = 8 + n.heat * 22
          ctx.fillStyle = `rgba(${rgb},${0.55 + n.heat * 0.4})`
        } else {
          ctx.shadowBlur = 0
          ctx.fillStyle = n.ref.children ? `rgba(${rgb},0.28)` : 'rgba(148,163,184,0.35)'
        }
        ctx.beginPath()
        ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (selectedRef.current === n) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, Math.max(1, r) + 4, 0, Math.PI * 2)
          ctx.stroke()
        }

        // labels: only once on-screen size clears a legibility threshold, so zooming
        // in reveals names the way map labels appear as you get closer.
        const screenR = n.r * zoom
        if (screenR > 9 || (n.lit && screenR > 5)) {
          ctx.font = n.lit ? '600 12px -apple-system,system-ui,sans-serif' : '400 11px -apple-system,system-ui,sans-serif'
          ctx.fillStyle = n.lit ? 'rgba(255,255,255,0.95)' : 'rgba(180,190,200,0.55)'
          ctx.textAlign = 'center'
          ctx.shadowColor = 'rgba(0,0,0,0.9)'
          ctx.shadowBlur = 6
          ctx.fillText(n.ref.name, sx, sy + Math.max(1, r) + 14)
          ctx.shadowBlur = 0
        }
      })

      // vignette
      const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.7)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, width, height)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
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
  }, [goals])

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-ink-700 px-6 py-3">
        <p className="label !mb-0 !text-emerald-300">Interest clusters &amp; how you work</p>
        <p className="text-[11px] text-mist-500">drag to pan · scroll or pinch to zoom · tap a lit region</p>
      </div>
      <div ref={wrapRef} className="relative" style={{ height: 460 }}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ cursor: 'grab' }} />
      </div>
      {selected && (
        <div className="border-t border-ink-700 bg-ink-950/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-mist-100">{selected.ref.name}</p>
              <p className="text-xs text-mist-500">{selected.notes} note{selected.notes === 1 ? '' : 's'}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-mist-500 hover:text-mist-300">close</button>
          </div>
          {selected.goal?.summary && <p className="mt-2 text-xs leading-relaxed text-mist-300">{selected.goal.summary}</p>}
          {selected.goal?.source_refs?.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-ink-700 pt-2">
              {selected.goal.source_refs.filter(r => r.type === 'note').map((ref, i) => (
                <li key={i} className="text-xs text-mist-400">
                  <Link href={`/notes/${ref.id}`} className="hover:text-emerald-300">↳ {ref.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
