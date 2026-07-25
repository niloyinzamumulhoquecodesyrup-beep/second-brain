import { useEffect, useMemo, useRef, useState } from 'react'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_OUTPUT_BYTES = 200 * 1024
const VIEWPORT = 280 // on-screen crop viewport, square, in px
const OUTPUT = 480 // initial output canvas size before compression shrinks it if needed

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function canvasToBlob(canvas, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
}

function shrinkCanvas(source, size) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  c.getContext('2d').drawImage(source, 0, 0, size, size)
  return c
}

async function compressToLimit(canvas) {
  let working = canvas
  for (let attempt = 0; attempt < 20; attempt++) {
    for (let quality = 0.9; quality >= 0.35; quality -= 0.1) {
      const blob = await canvasToBlob(working, quality)
      if (blob && blob.size <= MAX_OUTPUT_BYTES) return blob
    }
    if (working.width <= 96) return canvasToBlob(working, 0.35)
    working = shrinkCanvas(working, Math.round(working.width * 0.8))
  }
  return canvasToBlob(working, 0.35)
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function PhotoCropModal({ onClose, onUploaded }) {
  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [natural, setNatural] = useState(null) // { width, height }
  const [dragActive, setDragActive] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  const fileInputRef = useRef(null)
  const dragStateRef = useRef(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl) }
  }, [imageUrl])

  const baseScale = useMemo(() => {
    if (!natural) return 1
    return Math.max(VIEWPORT / natural.width, VIEWPORT / natural.height)
  }, [natural])

  const effectiveScale = baseScale * zoom
  const displayWidth = natural ? natural.width * effectiveScale : 0
  const displayHeight = natural ? natural.height * effectiveScale : 0
  const maxOffsetX = Math.max(0, (displayWidth - VIEWPORT) / 2)
  const maxOffsetY = Math.max(0, (displayHeight - VIEWPORT) / 2)

  function clampOffset(x, y, maxX = maxOffsetX, maxY = maxOffsetY) {
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) }
  }

  function loadFile(candidate) {
    setError('')
    if (!candidate) return
    if (!ALLOWED_MIME.has(candidate.type)) {
      setError('Use a PNG, JPEG, WebP, or GIF image')
      return
    }
    if (candidate.size > MAX_SOURCE_BYTES) {
      setError('Image must be under 15MB')
      return
    }
    const url = URL.createObjectURL(candidate)
    const img = new Image()
    img.onload = () => {
      setNatural({ width: img.naturalWidth, height: img.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setFile(candidate)
      setImageUrl(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setError('Could not read that image')
    }
    img.src = url
  }

  function onDrop(e) {
    e.preventDefault()
    setDragActive(false)
    loadFile(e.dataTransfer.files?.[0])
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y }
  }

  function onPointerMove(e) {
    if (!dragStateRef.current) return
    const dx = e.clientX - dragStateRef.current.startX
    const dy = e.clientY - dragStateRef.current.startY
    setOffset(clampOffset(dragStateRef.current.offsetX + dx, dragStateRef.current.offsetY + dy))
  }

  function onPointerUp() {
    dragStateRef.current = null
  }

  function onZoomChange(e) {
    const nextZoom = Number(e.target.value)
    const nextScale = baseScale * nextZoom
    const w = natural.width * nextScale
    const h = natural.height * nextScale
    const nextMaxX = Math.max(0, (w - VIEWPORT) / 2)
    const nextMaxY = Math.max(0, (h - VIEWPORT) / 2)
    setZoom(nextZoom)
    setOffset(prev => clampOffset(prev.x, prev.y, nextMaxX, nextMaxY))
  }

  function reset() {
    if (imageUrl) URL.revokeObjectURL(imageUrl)
    setFile(null)
    setImageUrl(null)
    setNatural(null)
    setError('')
  }

  async function applyCrop() {
    setWorking(true)
    setError('')
    try {
      const img = new Image()
      img.src = imageUrl
      await img.decode()

      const sSize = VIEWPORT / effectiveScale
      const sx = clamp((displayWidth / 2 - VIEWPORT / 2 - offset.x) / effectiveScale, 0, natural.width - sSize)
      const sy = clamp((displayHeight / 2 - VIEWPORT / 2 - offset.y) / effectiveScale, 0, natural.height - sSize)

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      canvas.getContext('2d').drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT)

      const blob = await compressToLimit(canvas)
      const data = await blobToBase64(blob)

      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, mime_type: 'image/jpeg' })
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Could not upload photo')
        setWorking(false)
        return
      }
      onUploaded({ hasAvatar: true, bumpAvatarVersion: true })
      onClose()
    } catch {
      setError('Something went wrong processing that image')
      setWorking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink-950/85 p-6 backdrop-blur-sm"
      onClick={e => { e.stopPropagation(); onClose() }}
    >
      <div className="my-8 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="label !text-emerald-300">Profile photo</p>
          <button onClick={onClose} className="text-mist-400 hover:text-mist-100" aria-label="Close">✕</button>
        </div>

        <div className="card space-y-4 p-6">
          {!imageUrl ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 text-center transition ${
                dragActive ? 'border-emerald-400/70 bg-emerald-500/5' : 'border-ink-500 hover:border-mist-300/60'
              }`}
            >
              <p className="text-sm text-mist-200">Drag a photo here</p>
              <p className="text-xs text-mist-400">or click to choose a file</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={e => loadFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <>
              <div
                className="relative mx-auto touch-none select-none overflow-hidden rounded-full border border-ink-500 bg-ink-950"
                style={{ width: VIEWPORT, height: VIEWPORT, cursor: 'grab' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2"
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    maxWidth: 'none',
                    maxHeight: 'none',
                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-mist-400">Zoom</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={onZoomChange}
                  className="w-full accent-emerald-400"
                />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={reset} disabled={working} className="btn-secondary !px-3 !py-2 text-xs">
                  Choose a different photo
                </button>
                <button type="button" onClick={applyCrop} disabled={working} className="btn-primary flex-1 !py-2 text-xs">
                  {working ? 'Saving…' : 'Use photo'}
                </button>
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
