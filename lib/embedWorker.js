// §4h: runs off the main thread so embedding a batch of notes never janks the /mind
// page. Loaded lazily via `new Worker(new URL('./embedWorker.js', import.meta.url))` —
// see lib/clientEmbeddings.js. Model + weights are fetched from the Hugging Face CDN on
// first use and cached by the browser after that (~20-25MB, one-time).
let extractorPromise = null

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = import('@xenova/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    )
  }
  return extractorPromise
}

// Keeps embedding input bounded regardless of note length — this model's useful
// context is a couple hundred tokens, well under this character budget.
const MAX_CHARS = 2000

self.onmessage = async (event) => {
  const { notes } = event.data
  try {
    const extractor = await getExtractor()
    const results = []
    for (const note of notes) {
      const text = note.text.slice(0, MAX_CHARS)
      const output = await extractor(text, { pooling: 'mean', normalize: true })
      results.push({ id: note.id, embedding: Array.from(output.data) })
      self.postMessage({ type: 'progress', id: note.id, done: results.length, total: notes.length })
    }
    self.postMessage({ type: 'done', results })
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) })
  }
}
