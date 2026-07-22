// Client-side title shortening for the focus view — hands the task's full title to
// the tiny on-device model in lib/titleShortenWorker.js (same transformers.js setup
// clientEmbeddings.js already uses) instead of a server round trip. The worker is
// kept alive across calls so the model only loads once per session, and results are
// cached per title. Falls back to a naive word-clamp if the model can't load
// (offline, unsupported browser) so the feature still works either way.
let worker = null
let nextId = 0
const pending = new Map()
const cache = new Map()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./titleShortenWorker.js', import.meta.url))
    worker.onmessage = event => {
      const { id, short, error } = event.data
      const resolver = pending.get(id)
      if (!resolver) return
      pending.delete(id)
      if (error) resolver.reject(new Error(error))
      else resolver.resolve(short)
    }
    worker.onerror = err => {
      pending.forEach(r => r.reject(err))
      pending.clear()
    }
  }
  return worker
}

function fallbackShorten(text) {
  return text.split(/\s+/).filter(Boolean).slice(0, 4).join(' ')
}

export function shortenTitle(text) {
  const key = (text || '').trim()
  if (!key) return Promise.resolve('')
  if (cache.has(key)) return Promise.resolve(cache.get(key))

  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, text: key })
  })
    .then(short => {
      const cleaned = String(short || '').replace(/["'.]/g, '').trim()
      const result = cleaned || fallbackShorten(key)
      cache.set(key, result)
      return result
    })
    .catch(() => {
      const result = fallbackShorten(key)
      cache.set(key, result)
      return result
    })
}
