import { useEffect, useRef, useState } from 'react'
import { useTheme } from './ThemeProvider'

// "What the community is studying" as the same glowing force-directed map style as
// the personal Interest Clusters (components/KnowledgeGalaxy.js): a fixed taxonomy of
// human knowledge (Science, Technology, Politics, Arts, Commerce, Humanities and their
// subfields) rendered as a tree with real edges, not a flat bag of dots. Every field
// is always shown — lit and sized where the community aggregate (domain, brains) has
// real accounts studying it, dim and small everywhere else — so the map reads as "all
// of knowledge, here's where the community actually is" rather than only ever showing
// whatever domain strings happen to already exist in mind_knowledge_library.
//
// `clusters` (domain, brains) is matched against taxonomy leaf names case-insensitively.
// Any real domain that doesn't match a known field (free text, so it never fully will)
// still gets its own node under "Other Fields" rather than being dropped — real
// community data always wins over the fixed list.
const TAXONOMY = [
  { slug: 'root', parent: null, name: 'All Knowledge', cluster: 'root' },

  { slug: 'science', parent: 'root', name: 'Science', cluster: 'science' },
  { slug: 'physics', parent: 'science', name: 'Physics', cluster: 'science' },
  { slug: 'biology', parent: 'science', name: 'Biology', cluster: 'science' },
  { slug: 'chemistry', parent: 'science', name: 'Chemistry', cluster: 'science' },
  { slug: 'mathematics', parent: 'science', name: 'Mathematics', cluster: 'science' },
  { slug: 'astronomy', parent: 'science', name: 'Astronomy', cluster: 'science' },
  { slug: 'earthscience', parent: 'science', name: 'Earth Science', cluster: 'science' },
  { slug: 'medicine', parent: 'science', name: 'Medicine', cluster: 'science' },
  { slug: 'neuroscience', parent: 'biology', name: 'Neuroscience', cluster: 'science' },
  { slug: 'genetics', parent: 'biology', name: 'Genetics', cluster: 'science' },
  { slug: 'psychology', parent: 'science', name: 'Psychology', cluster: 'science' },

  { slug: 'technology', parent: 'root', name: 'Technology', cluster: 'technology' },
  { slug: 'compsci', parent: 'technology', name: 'Computer Science', cluster: 'technology' },
  { slug: 'ai', parent: 'compsci', name: 'Artificial Intelligence', cluster: 'technology' },
  { slug: 'engineering', parent: 'technology', name: 'Engineering', cluster: 'technology' },
  { slug: 'robotics', parent: 'engineering', name: 'Robotics', cluster: 'technology' },

  { slug: 'politics', parent: 'root', name: 'Politics', cluster: 'politics' },
  { slug: 'polphil', parent: 'politics', name: 'Political Theory', cluster: 'politics' },
  { slug: 'intlrelations', parent: 'politics', name: 'International Relations', cluster: 'politics' },
  { slug: 'publicpolicy', parent: 'politics', name: 'Public Policy', cluster: 'politics' },
  { slug: 'law', parent: 'politics', name: 'Law', cluster: 'politics' },
  { slug: 'government', parent: 'politics', name: 'Government', cluster: 'politics' },

  { slug: 'arts', parent: 'root', name: 'Arts', cluster: 'arts' },
  { slug: 'visualarts', parent: 'arts', name: 'Visual Arts', cluster: 'arts' },
  { slug: 'music', parent: 'arts', name: 'Music', cluster: 'arts' },
  { slug: 'literature', parent: 'arts', name: 'Literature', cluster: 'arts' },
  { slug: 'film', parent: 'arts', name: 'Film', cluster: 'arts' },
  { slug: 'design', parent: 'arts', name: 'Design', cluster: 'arts' },
  { slug: 'performingarts', parent: 'arts', name: 'Performing Arts', cluster: 'arts' },

  { slug: 'commerce', parent: 'root', name: 'Commerce', cluster: 'commerce' },
  { slug: 'business', parent: 'commerce', name: 'Business', cluster: 'commerce' },
  { slug: 'finance', parent: 'commerce', name: 'Finance', cluster: 'commerce' },
  { slug: 'economics', parent: 'commerce', name: 'Economics', cluster: 'commerce' },
  { slug: 'marketing', parent: 'commerce', name: 'Marketing', cluster: 'commerce' },
  { slug: 'entrepreneurship', parent: 'commerce', name: 'Entrepreneurship', cluster: 'commerce' },
  { slug: 'trade', parent: 'commerce', name: 'Trade', cluster: 'commerce' },

  { slug: 'humanities', parent: 'root', name: 'Humanities', cluster: 'humanities' },
  { slug: 'philosophy', parent: 'humanities', name: 'Philosophy', cluster: 'humanities' },
  { slug: 'ethics', parent: 'philosophy', name: 'Ethics', cluster: 'humanities' },
  { slug: 'history', parent: 'humanities', name: 'History', cluster: 'humanities' },
  { slug: 'sociology', parent: 'humanities', name: 'Sociology', cluster: 'humanities' },
  { slug: 'linguistics', parent: 'humanities', name: 'Linguistics', cluster: 'humanities' },
  { slug: 'religion', parent: 'humanities', name: 'Religion', cluster: 'humanities' }
]

// Flat taxonomy + live (domain, brains) aggregate -> the nested {id, name, cluster,
// brains, children} shape the force layout expects. Real domains that don't match any
// fixed name land under a synthesized "Other Fields" hub instead of being dropped.
function buildTree(clusters) {
  const byDomain = {}
  ;(clusters || []).forEach(c => {
    const key = (c.domain || '').trim().toLowerCase()
    if (!key) return
    byDomain[key] = { brains: (byDomain[key]?.brains || 0) + c.brains, domain: c.domain }
  })

  const flat = TAXONOMY.map(t => ({ ...t }))
  const matched = new Set()
  flat.forEach(t => {
    const hit = byDomain[t.name.toLowerCase()]
    if (hit) { t.brains = hit.brains; matched.add(t.name.toLowerCase()) }
  })

  const unmatched = Object.entries(byDomain).filter(([key]) => !matched.has(key))
  if (unmatched.length > 0) {
    flat.push({ slug: 'other', parent: 'root', name: 'Other Fields', cluster: 'other' })
    unmatched.forEach(([key, hit], i) => {
      flat.push({ slug: `other-${i}`, parent: 'other', name: hit.domain, cluster: 'other', brains: hit.brains })
    })
  }

  const bySlug = {}
  flat.forEach(t => { bySlug[t.slug] = { id: t.slug, name: t.name, cluster: t.cluster, brains: t.brains || 0 } })
  let root = null
  flat.forEach(t => {
    const node = bySlug[t.slug]
    if (!t.parent) { root = node; return }
    const parent = bySlug[t.parent]
    if (!parent) return
    if (!parent.children) parent.children = []
    parent.children.push(node)
  })
  return root || bySlug.root
}

// Dark-mode values tuned to glow against the near-black canvas; light mode gets its
// own deeper hue set so the same fields stay recognizable against the sky background.
const CLUSTER_RGB = {
  root: '148,163,184',
  science: '110,231,150',      // green
  technology: '96,190,250',    // blue
  politics: '244,114,114',     // red
  arts: '240,163,196',         // pink
  commerce: '240,217,163',     // gold
  humanities: '192,145,252',   // violet
  other: '150,214,214'         // teal
}
const CLUSTER_RGB_LIGHT = {
  root: '75,85,99',
  science: '21,128,61',
  technology: '21,104,168',
  politics: '185,45,45',
  arts: '180,60,110',
  commerce: '168,124,24',
  humanities: '124,79,209',
  other: '20,110,110'
}

const PALETTES = {
  dark: {
    bg: '5,6,8',
    star: '226,232,240',
    unlitNode: '148,163,184',
    unlitLabel: '180,190,200',
    litLabel: '255,255,255',
    labelShadow: 'rgba(0,0,0,0.9)',
    selectionRing: 'rgba(255,255,255,0.9)',
    vignette: '0,0,0',
    vignetteAlpha: 0.55,
    unlitNodeAlpha: 0.35,
    unlitEdgeAlpha: 0.12
  },
  light: {
    bg: '223,231,238',
    star: '90,102,115',
    unlitNode: '100,112,128',
    unlitLabel: '90,100,112',
    litLabel: '20,22,26',
    labelShadow: 'rgba(255,255,255,0.85)',
    selectionRing: 'rgba(20,22,26,0.85)',
    vignette: '70,80,95',
    vignetteAlpha: 0.22,
    unlitNodeAlpha: 0.45,
    unlitEdgeAlpha: 0.16
  }
}

const HEAT_STOPS = [
  [0.00, [59, 130, 246]],
  [0.35, [16, 185, 129]],
  [0.60, [250, 204, 21]],
  [0.80, [251, 146, 60]],
  [1.00, [239, 68, 68]]
]
function heatColor(t) {
  t = clamp(t, 0, 1)
  for (let i = 0; i < HEAT_STOPS.length - 1; i++) {
    const [t0, c0] = HEAT_STOPS[i]
    const [t1, c1] = HEAT_STOPS[i + 1]
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * f)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * f)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * f)
      return `${r},${g},${b}`
    }
  }
  return HEAT_STOPS[HEAT_STOPS.length - 1][1].join(',')
}

function hubRadius(depth) { return Math.max(5, 15 - depth * 2.6) }
function leafRadius(brains) { return brains > 0 ? 6 + Math.sqrt(brains) * 3.4 : 3 }
function heatFor(brains) { return Math.min(1, 0.22 + brains * 0.12) }

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

// Pairwise repulsion + edge springs so parent/child fields pull toward each other at a
// depth-scaled resting distance — the same mechanic as KnowledgeGalaxy's personal map,
// applied here to the community taxonomy so fields read as connected, not scattered.
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

export default function CommunityMap({ clusters }) {
  const canvasRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selected }, [selected])

  const [heatOn, setHeatOn] = useState(true)
  const heatOnRef = useRef(true)
  useEffect(() => { heatOnRef.current = heatOn }, [heatOn])

  const { theme } = useTheme()
  const themeRef = useRef(theme)
  useEffect(() => { themeRef.current = theme }, [theme])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduced =
      document.documentElement.dataset.calmMode === 'on' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const { nodes, edges } = runForceLayout(buildTree(clusters))
    nodes.forEach(n => {
      const brains = n.ref.brains || 0
      n.lit = brains > 0
      n.heat = n.lit ? heatFor(brains) : 0
      n.r = n.ref.children ? hubRadius(n.depth) : leafRadius(brains)
    })

    const minX = Math.min(...nodes.map(n => n.x - n.r)), maxX = Math.max(...nodes.map(n => n.x + n.r))
    const minY = Math.min(...nodes.map(n => n.y - n.r)), maxY = Math.max(...nodes.map(n => n.y + n.r))
    const bboxW = Math.max(40, maxX - minX), bboxH = Math.max(40, maxY - minY)

    let stars = []
    let width = 0, height = 0
    let zoom = 1, offsetX = 0, offsetY = 0, fitZoom = 1
    let raf, dragging = false, dragMoved = false, lastX = 0, lastY = 0
    let pinchDist = null
    let hasFitted = false
    const MIN_ZOOM_FACTOR = 0.35

    function fitView() {
      if (width === 0 || height === 0) return
      fitZoom = clamp(Math.min(width / bboxW, height / bboxH) * 0.82, 0.05, 4)
      zoom = fitZoom
      offsetX = width / 2 - (minX + bboxW / 2) * zoom
      offsetY = height / 2 - (minY + bboxH / 2) * zoom
      hasFitted = true
    }

    function refreshStars() {
      if (width === 0 || height === 0 || fitZoom === 0) return
      const minZoom = fitZoom * MIN_ZOOM_FACTOR
      const worstW = width / minZoom
      const worstH = height / minZoom
      const spread = Math.max(bboxW, bboxH, worstW, worstH) * 1.4
      const density = 220 / (Math.max(bboxW, bboxH, 1) * 2.4) ** 2
      const count = clamp(Math.round(density * spread * spread), 220, 900)
      stars = makeStars(count, spread)
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width; height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!hasFitted) fitView()
      refreshStars()
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
      setSelected(best || null)
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
      const pal = PALETTES[themeRef.current] || PALETTES.dark
      const clusterRgb = themeRef.current === 'light' ? CLUSTER_RGB_LIGHT : CLUSTER_RGB
      ctx.fillStyle = `rgb(${pal.bg})`
      ctx.fillRect(0, 0, width, height)

      const t = now / 1000
      stars.forEach(s => {
        const [sx, sy] = worldToScreen(s.x, s.y)
        if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) return
        const tw = reduced ? 0.6 : 0.45 + 0.4 * Math.sin(t * s.speed + s.phase)
        ctx.fillStyle = `rgba(${pal.star},${(0.25 + tw * 0.5).toFixed(2)})`
        ctx.beginPath()
        ctx.arc(sx, sy, s.r, 0, Math.PI * 2)
        ctx.fill()
      })

      edges.forEach(([a, b]) => {
        const [ax, ay] = worldToScreen(a.x, a.y)
        const [bx, by] = worldToScreen(b.x, b.y)
        const rgb = clusterRgb[b.ref.cluster] || clusterRgb.root
        const alpha = b.lit ? 0.32 : pal.unlitEdgeAlpha
        ctx.strokeStyle = `rgba(${rgb},${alpha})`
        ctx.lineWidth = Math.max(0.6, 1 * zoom / fitZoom)
        ctx.beginPath()
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
        ctx.stroke()
      })

      nodes.forEach(n => {
        const [sx, sy] = worldToScreen(n.x, n.y)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return
        const rgb = clusterRgb[n.ref.cluster] || clusterRgb.root
        const r = n.r * zoom
        if (n.lit) {
          ctx.shadowColor = `rgba(${rgb},0.9)`
          ctx.shadowBlur = 8 + n.heat * 22
          ctx.fillStyle = `rgba(${rgb},${0.55 + n.heat * 0.4})`
        } else {
          ctx.shadowBlur = 0
          ctx.fillStyle = n.ref.children ? `rgba(${rgb},0.28)` : `rgba(${pal.unlitNode},${pal.unlitNodeAlpha})`
        }
        ctx.beginPath()
        ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        if (selectedRef.current === n) {
          ctx.strokeStyle = pal.selectionRing
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(sx, sy, Math.max(1, r) + 4, 0, Math.PI * 2)
          ctx.stroke()
        }
      })

      if (heatOnRef.current) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        nodes.forEach(n => {
          if (!n.lit) return
          const [sx, sy] = worldToScreen(n.x, n.y)
          if (sx < -200 || sx > width + 200 || sy < -200 || sy > height + 200) return
          const radius = (n.r * 4 + 24 + n.heat * 60) * zoom
          const rgb = heatColor(n.heat)
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius)
          grad.addColorStop(0, `rgba(${rgb},${(0.5 * n.heat + 0.18).toFixed(2)})`)
          grad.addColorStop(1, `rgba(${rgb},0)`)
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(sx, sy, radius, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.restore()
      }

      nodes.forEach(n => {
        const [sx, sy] = worldToScreen(n.x, n.y)
        if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) return
        const r = n.r * zoom
        const screenR = n.r * zoom
        if (screenR > 9 || (n.lit && screenR > 5)) {
          ctx.font = n.lit ? '600 12px -apple-system,system-ui,sans-serif' : '400 11px -apple-system,system-ui,sans-serif'
          ctx.fillStyle = n.lit ? `rgba(${pal.litLabel},0.95)` : `rgba(${pal.unlitLabel},0.55)`
          ctx.textAlign = 'center'
          ctx.shadowColor = pal.labelShadow
          ctx.shadowBlur = 6
          ctx.fillText(n.ref.name, sx, sy + Math.max(1, r) + 14)
          ctx.shadowBlur = 0
        }
      })

      const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.7)
      vg.addColorStop(0, `rgba(${pal.vignette},0)`)
      vg.addColorStop(1, `rgba(${pal.vignette},${pal.vignetteAlpha})`)
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
  }, [clusters])

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3 sm:px-6">
        <p className="label !mb-0 !text-emerald-300">Other brains</p>
        <div className="flex items-center gap-3 sm:gap-4">
          <p className="hidden text-[11px] text-mist-500 sm:block">drag to pan · scroll or pinch to zoom · tap a region</p>
          <button
            onClick={() => setHeatOn(v => !v)}
            className={`chip !py-1 !text-[11px] ${heatOn ? 'border-gold-400/50 text-gold-300' : ''}`}
            title="Toggle the heat-gradient overlay"
          >
            Heat layer: {heatOn ? 'on' : 'off'}
          </button>
        </div>
      </div>
      <div className="relative" style={{ height: 380 }}>
        <canvas ref={canvasRef} className="block h-full w-full touch-none" style={{ cursor: 'grab' }} />
      </div>
      {selected && (
        <div className="border-t border-ink-700 bg-ink-950/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-mist-100">{selected.ref.name}</p>
              <p className="text-xs text-mist-500">
                {selected.ref.brains > 0
                  ? `${selected.ref.brains} ${selected.ref.brains === 1 ? 'brain' : 'brains'} studying this`
                  : 'no brains studying this yet'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-mist-500 hover:text-mist-300">close</button>
          </div>
        </div>
      )}
    </div>
  )
}
