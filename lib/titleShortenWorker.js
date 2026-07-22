// Tiny on-device model (same transformers.js pattern as lib/embedWorker.js) used to
// compress a task's full title down to a short 2-4 word label for the focus view.
// Runs off the main thread; weights are fetched from the Hugging Face CDN on first
// use and cached by the browser after that.
let generatorPromise = null

function getGenerator() {
  if (!generatorPromise) {
    generatorPromise = import('@xenova/transformers').then(({ pipeline }) =>
      pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M')
    )
  }
  return generatorPromise
}

self.onmessage = async (event) => {
  const { id, text } = event.data
  try {
    const generator = await getGenerator()
    const prompt = `Shorten this task to a concrete 2-4 word label, no punctuation: ${text}`
    const output = await generator(prompt, { max_new_tokens: 10 })
    const short = (output?.[0]?.generated_text || '').trim()
    self.postMessage({ id, short })
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) })
  }
}
