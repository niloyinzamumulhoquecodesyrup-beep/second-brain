import { useEffect, useRef } from 'react'

// §4e Voice Flow centerpiece. 5 layers, back-to-front: rear layers get more blur and
// less opacity so they recede into the dark background (depth via layering, not 3D).
// speaking/color live in refs so prop changes never restart the rAF loop or canvas —
// that's what keeps transitions (idle -> speaking, PARA color shift) smooth instead of
// a jump-cut.
const LAYERS = [
  { freq: 0.016, speedMul: 1.00, phase: 0.0, ampMul: 1.00, opacity: 0.90, blur: 0 },
  { freq: 0.012, speedMul: 0.80, phase: 1.7, ampMul: 0.82, opacity: 0.62, blur: 2.5 },
  { freq: 0.020, speedMul: 0.62, phase: 3.1, ampMul: 0.66, opacity: 0.42, blur: 5 },
  { freq: 0.010, speedMul: 0.46, phase: 4.6, ampMul: 0.50, opacity: 0.24, blur: 8 },
  { freq: 0.022, speedMul: 0.34, phase: 5.9, ampMul: 0.38, opacity: 0.13, blur: 12 }
]

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export default function WaveVisualizer({ color = '#5eead4', speaking = false, className = '' }) {
  const canvasRef = useRef(null)
  const speakingRef = useRef(speaking)
  const targetRgbRef = useRef(hexToRgb(color))

  useEffect(() => { speakingRef.current = speaking }, [speaking])
  useEffect(() => { targetRgbRef.current = hexToRgb(color) }, [color])

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

    const state = { amp: 0.34, t: 0, glowT: 0, rgb: targetRgbRef.current.slice() }

    function draw() {
      if (width === 0 || height === 0) {
        raf = requestAnimationFrame(draw)
        return
      }

      const targetAmp = speakingRef.current ? 1 : 0.34
      state.amp += (targetAmp - state.amp) * 0.035
      state.t += speakingRef.current ? 0.026 : 0.012
      state.glowT += 0.014

      const tr = targetRgbRef.current
      state.rgb[0] += (tr[0] - state.rgb[0]) * 0.02
      state.rgb[1] += (tr[1] - state.rgb[1]) * 0.02
      state.rgb[2] += (tr[2] - state.rgb[2]) * 0.02
      const [r, g, b] = state.rgb.map(Math.round)

      ctx.clearRect(0, 0, width, height)

      const midY = height / 2
      // idle "breathing" — a slow modulation on top of the base amplitude so the
      // section is never fully static while the user is deciding.
      const breathing = Math.sin(state.t * 0.9) * 0.05

      // soft glowing origin point, pulsing — waves read as surfacing from here
      const glowPulse = 0.5 + Math.sin(state.glowT) * 0.18 + (speakingRef.current ? 0.22 : 0)
      const glowRadius = Math.min(width, height) * (0.32 + glowPulse * 0.18)
      const grad = ctx.createRadialGradient(width / 2, midY, 0, width / 2, midY, Math.max(1, glowRadius))
      grad.addColorStop(0, `rgba(${r},${g},${b},${(0.4 * glowPulse).toFixed(3)})`)
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      const baseAmp = height * 0.15 * (state.amp + breathing)
      const step = width > 900 ? 5 : 3

      for (let i = LAYERS.length - 1; i >= 0; i--) {
        const layer = LAYERS[i]
        ctx.save()
        ctx.filter = layer.blur ? `blur(${layer.blur}px)` : 'none'
        ctx.beginPath()
        const amp = baseAmp * layer.ampMul
        for (let x = 0; x <= width; x += step) {
          const y = midY + Math.sin(x * layer.freq + state.t * layer.speedMul * 6 + layer.phase) * amp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},${layer.opacity})`
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.restore()
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
}
