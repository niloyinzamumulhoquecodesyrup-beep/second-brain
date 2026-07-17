import { useEffect, useState } from 'react'
import { useTour, TOUR_STEPS } from './TourProvider'

// A single field's value "typing" itself into a read-only, input-styled box — the
// simulated-overlay stand-in for auto-filling the real form on this page. Never wired
// to the real page's state or a submit call; this is a mockup shown on top of it.
function TypingField({ label, value, delay = 0, multiline = false }) {
  const [shown, setShown] = useState('')

  useEffect(() => {
    setShown('')
    let i = 0
    let raf
    const start = setTimeout(() => {
      const tick = () => {
        i += 1
        setShown(value.slice(0, i))
        if (i < value.length) raf = setTimeout(tick, 14)
      }
      tick()
    }, delay)
    return () => { clearTimeout(start); clearTimeout(raf) }
  }, [value, delay])

  const Tag = multiline ? 'div' : 'div'
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-mist-500">{label}</label>
      <Tag className={`input !cursor-default text-mist-100 ${multiline ? 'min-h-[72px] whitespace-pre-wrap' : ''}`}>
        {shown}
        <span className="inline-block w-[2px] animate-pulse bg-emerald-300 align-middle" style={{ height: '1em' }} />
      </Tag>
    </div>
  )
}

// Step content: a short title/description plus an optional demo mockup. Timings are
// staggered so fields fill in one after another rather than all at once.
const STEP_CONTENT = {
  welcome: {
    title: 'A quick look at how this works',
    body: "Before your own Mind Model, here's a 90-second walkthrough with sample data — Capture, Organize, Distill, Express, and what it all builds toward.",
    cta: 'Start tour'
  },
  capture: {
    title: 'Capture',
    body: 'Everything starts as a quick capture — no deciding where it goes yet, just getting it down.',
    demo: (
      <div className="space-y-3">
        <TypingField label="Title" value="Ideas on prompt engineering" delay={200} />
        <TypingField label="Content" value="Started experimenting with few-shot prompts today — 2-3 diverse examples beats a long instruction." multiline delay={900} />
        <TypingField label="Tags" value="ai, prompting" delay={2600} />
      </div>
    ),
    cta: 'Next: Organize'
  },
  organize: {
    title: 'Organize',
    body: 'Sorted by use, not subject (the PARA method) — a five-minute weekly pass moves things from Inbox into Projects, Areas, Resources, or Archive.',
    demo: (
      <div className="flex flex-wrap items-center gap-3">
        <span className="chip border-rose-400/40 text-rose-300">Inbox</span>
        <span className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-mist-200">Ideas on prompt engineering</span>
        <span className="text-emerald-300">→</span>
        <span className="chip border-emerald-400/40 text-emerald-300">Projects</span>
      </div>
    ),
    cta: 'Next: Distill'
  },
  distill: {
    title: 'Distill',
    body: 'Read → highlight → summarize. A short executive summary is what makes a note actually reusable later.',
    demo: (
      <div className="space-y-3">
        <p className="text-sm text-mist-100">Ideas on prompt engineering</p>
        <TypingField
          label="Executive summary"
          value="Use 2-3 diverse few-shot examples; keep instructions short and imperative."
          multiline
          delay={300}
        />
      </div>
    ),
    cta: 'Next: Express'
  },
  express: {
    title: 'Express',
    body: 'Turn a distilled note into something real — a task to act on, or a packet to reuse and share.',
    demo: (
      <div className="space-y-3">
        <TypingField label="New task" value="Draft a prompt-engineering cheatsheet" delay={300} />
        <p className="text-xs text-emerald-300">✓ linked to "Ideas on prompt engineering"</p>
      </div>
    ),
    cta: 'Next: Your Mind Model'
  },
  summary: {
    title: 'That becomes your Mind Model',
    body: 'Every capture, sort, distillation, and task feeds a picture of your interests and how you work — this is sample data, not yours yet.',
    demo: (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-mist-500">The whole picture (demo)</p>
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-emerald-400/60 text-sm text-mist-100">3</div>
            <ul className="space-y-1 text-xs text-mist-300">
              <li>Projects — 1 note</li>
              <li>Resources — 1 note</li>
              <li>Inbox — 1 note</li>
            </ul>
          </div>
        </div>
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/5 p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-mist-500">Inferred goal (demo)</p>
          <p className="text-sm text-mist-100">Prompt Engineering</p>
          <p className="mt-1 text-xs text-mist-400">Based on your captures, distills, and tasks around this topic.</p>
        </div>
      </div>
    ),
    cta: 'Finish tour'
  }
}

export default function TourOverlay({ step }) {
  const tour = useTour()
  if (tour.loading || !tour.active || tour.stepKey !== step) return null

  const content = STEP_CONTENT[step]
  const index = TOUR_STEPS.indexOf(step)

  function handleCta() {
    if (step === 'summary') tour.finish()
    else tour.next()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-emerald-400/30 bg-ink-950 p-6 shadow-2xl">
        <p className="mb-1 text-[11px] uppercase tracking-wider text-emerald-300">
          Guided tour · Step {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="mb-2 font-serif text-2xl font-light text-mist-100">{content.title}</h2>
        <p className="mb-5 text-sm leading-relaxed text-mist-400">{content.body}</p>

        {content.demo && <div className="mb-6 rounded-xl border border-ink-700 bg-ink-900/40 p-4">{content.demo}</div>}

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 w-1.5 rounded-full ${i <= index ? 'bg-emerald-400' : 'bg-ink-700'}`} />
            ))}
          </div>
          <button onClick={handleCta} className="btn-primary">{content.cta}</button>
        </div>
      </div>
    </div>
  )
}
