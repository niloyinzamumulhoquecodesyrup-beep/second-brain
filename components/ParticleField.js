import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// §4f "Visit Your Brain" entry backdrop: a green/gold data-mote tunnel, particles
// drifting outward from a vanishing point at the center — the "arriving somewhere"
// feel from the reference images. 2D Canvas per the brief's explicit call (lighter
// than WebGL, the reference art is essentially 2D/2.5D anyway).
const PARTICLE_COUNT = 240
const GOLD_RATIO = 0.12
const EMERALD_RGB = '94,234,212' // emerald-400
const GOLD_RGB = '240,217,163' // gold-400

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function resetParticle(p) {
  const angle = rand(0, Math.PI * 2)
  const radius = rand(0, 1)
  p.x = Math.cos(angle) * radius
  p.y = Math.sin(angle) * radius
  p.z = 1
  return p
}

function makeParticle() {
  const p = resetParticle({})
  p.z = rand(0.15, 1)
  p.gold = Math.random() < GOLD_RATIO
  p.bar = Math.random() < 0.3
  return p
}

const ParticleField = forwardRef(function ParticleField({ className = '' }, ref) {
  const canvasRef = useRef(null)
  const boostUntilRef = useRef(0)

  useImperativeHandle(ref, () => ({
    // called on section-select for a brief "flying toward it" convergence pulse
    boost() {
      boostUntilRef.current = performance.now() + 700
    }
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const reduced =
      document.documentElement.dataset.calmMode === 'on' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let raf
    const particles = Array.from({ length: PARTICLE_COUNT }, makeParticle)

    function resize() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    function draw(now) {
      if (width === 0 || height === 0) {
        raf = requestAnimationFrame(draw)
        return
      }
      const boosting = now < boostUntilRef.current
      const speed = boosting ? 0.85 : 0.16

      ctx.fillStyle = '#050607'
      ctx.fillRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2
      const focal = Math.min(width, height) * 0.55

      for (const p of particles) {
        p.z -= speed * 0.012
        if (p.z <= 0.05) resetParticle(p)

        const sx = cx + (p.x * focal) / p.z
        const sy = cy + (p.y * focal) / p.z
        if (sx < -20 || sx > width + 20 || sy < -20 || sy > height + 20) continue

        const depth = 1 - p.z
        const size = 0.6 + depth * 2.6
        const alpha = 0.12 + depth * 0.68
        const rgb = p.gold ? GOLD_RGB : EMERALD_RGB

        ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(2)})`
        if (p.bar) {
          const h = size * 3
          ctx.fillRect(sx - size / 2, sy - h / 2, size, h)
        } else {
          ctx.beginPath()
          ctx.arc(sx, sy, size / 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (!reduced) raf = requestAnimationFrame(draw)
    }
    // Reduced-motion / Calm Mode: render one static frame instead of looping forever.
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className={`block ${className}`} />
})

export default ParticleField
