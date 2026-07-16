// §4h: client-side embedding step, run from pages/mind.js as part of "Run now" — never
// from server code, so no embedding API key/vendor ever needs to exist in this app's
// deployment. Computes vectors in-browser (lib/embedWorker.js) only for notes that are
// new or edited since their last embed, then writes them back via the DB the app
// already uses. Best-effort: a failure here must never block the rest of a cycle.
export async function embedPendingNotes({ onProgress } = {}) {
  const pendingRes = await fetch('/api/notes/embeddings/pending')
  if (!pendingRes.ok) throw new Error('Failed to load notes pending embedding')
  const notes = await pendingRes.json()
  if (notes.length === 0) return { embedded: 0 }

  const results = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./embedWorker.js', import.meta.url))
    worker.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total)
      } else if (msg.type === 'done') {
        worker.terminate()
        resolve(msg.results)
      } else if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }
    worker.postMessage({ notes: notes.map(n => ({ id: n.id, text: n.text })) })
  })

  const writeRes = await fetch('/api/notes/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeddings: results })
  })
  if (!writeRes.ok) throw new Error('Failed to save embeddings')

  return { embedded: results.length }
}
