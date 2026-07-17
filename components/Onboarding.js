import { useState } from 'react'
import EclipseAnimation from './EclipseAnimation'

const PERSONA_OPTIONS = [
  { value: 'Tech-savvy', label: 'Tech-savvy' },
  { value: 'Creative / artistic', label: 'Creative / artistic' },
  { value: 'Student', label: 'Student' },
  { value: 'Business / entrepreneur', label: 'Business / entrepreneur' },
  { value: 'Researcher / academic', label: 'Researcher / academic' },
  { value: 'Just getting organized', label: 'Just getting organized' },
  { value: 'other', label: 'Other…' }
]

const SOURCE_TYPES = [
  { value: 'chat', label: 'AI chat' },
  { value: 'document', label: 'Document' },
  { value: 'kanban', label: 'Kanban board' },
  { value: 'journal', label: 'Journal' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'other', label: 'Other' }
]

const FOLD_THRESHOLD = 400 // characters — beyond this a paste collapses into a chip, same spirit as Claude's long-paste fold
const MAX_IMPORTS = 5

function ImportSlot({ slot, onChange, onRemove, canRemove }) {
  const [expanded, setExpanded] = useState(!slot.folded)

  function handlePaste(e) {
    const pasted = e.clipboardData?.getData('text') || ''
    if (pasted.length > FOLD_THRESHOLD) {
      e.preventDefault()
      onChange({ ...slot, text: pasted, folded: true })
      setExpanded(false)
    }
  }

  function handleChange(e) {
    onChange({ ...slot, text: e.target.value })
  }

  function handleBlur() {
    if (slot.text.length > FOLD_THRESHOLD) {
      onChange({ ...slot, folded: true })
      setExpanded(false)
    }
  }

  const folded = slot.folded && !expanded

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <select
          className="input !w-auto !py-1.5 text-xs"
          value={slot.sourceType}
          onChange={e => onChange({ ...slot, sourceType: e.target.value })}
        >
          {SOURCE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-mist-500 hover:text-rose-300">
            Remove
          </button>
        )}
      </div>

      {folded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-left text-sm text-mist-200 hover:border-emerald-400/40"
        >
          <span>📄 Pasted — {slot.text.length.toLocaleString()} characters</span>
          <span className="text-xs text-mist-500">Edit</span>
        </button>
      ) : (
        <textarea
          className="input min-h-[100px] text-sm"
          placeholder="Paste a chat transcript, document, board, journal, or calendar export…"
          value={slot.text}
          onPaste={handlePaste}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      )}
    </div>
  )
}

function emptySlot() {
  return { sourceType: 'chat', text: '', folded: false }
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState('hello') // hello | name | age | persona | imports | saving | done
  const [boosting, setBoosting] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [persona, setPersona] = useState('')
  const [personaCustom, setPersonaCustom] = useState('')
  const [slots, setSlots] = useState([emptySlot()])
  const [error, setError] = useState('')

  function start() {
    setBoosting(true)
    setTimeout(() => setBoosting(false), 1200)
    setStep('name')
  }

  function updateSlot(i, next) {
    setSlots(prev => prev.map((s, idx) => (idx === i ? next : s)))
  }

  function addSlot() {
    setSlots(prev => (prev.length >= MAX_IMPORTS ? prev : [...prev, emptySlot()]))
  }

  function removeSlot(i) {
    setSlots(prev => prev.filter((_, idx) => idx !== i))
  }

  async function finish() {
    setError('')
    setStep('saving')
    const resolvedPersona = persona === 'other' ? personaCustom.trim() : persona
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          display_name: name,
          age: age === '' ? null : Number(age),
          persona: resolvedPersona,
          imports: slots
            .filter(s => s.text.trim().length > 0)
            .map(s => ({ source_type: s.sourceType, raw_text: s.text }))
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      setStep('done')
      setTimeout(() => onComplete(), 1600)
    } catch (err) {
      setError(err.message)
      setStep('imports')
    }
  }

  const canContinueName = name.trim().length > 0
  const canContinueAge = age === '' || (Number.isInteger(Number(age)) && Number(age) > 0 && Number(age) <= 120)
  const canContinuePersona = persona && (persona !== 'other' || personaCustom.trim().length > 0)

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-2xl border border-ink-700">
      <div className="absolute inset-0">
        <EclipseAnimation boosting={boosting} className="h-full w-full" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-6 text-center">
        {step === 'hello' && (
          <>
            <h1 className="font-serif text-4xl font-light text-mist-100 [text-shadow:0_2px_30px_rgba(0,0,0,0.8)]">Hello.</h1>
            <p className="mt-3 text-sm text-mist-400">Press start to initiate your second brain.</p>
            <button onClick={start} className="btn-primary mt-8 !px-8 !py-3 text-base">Start</button>
          </>
        )}

        {step === 'name' && (
          <>
            <p className="mb-4 text-sm text-mist-400">What should I call you?</p>
            <input
              autoFocus
              className="input text-center text-lg"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canContinueName) setStep('age') }}
            />
            <button onClick={() => setStep('age')} disabled={!canContinueName} className="btn-primary mt-6 !px-8 !py-2.5">
              Continue
            </button>
          </>
        )}

        {step === 'age' && (
          <>
            <p className="mb-4 text-sm text-mist-400">And how old are you, {name.trim()}?</p>
            <input
              autoFocus
              type="number"
              min="1"
              max="120"
              className="input text-center text-lg"
              placeholder="Age (optional)"
              value={age}
              onChange={e => setAge(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canContinueAge) setStep('persona') }}
            />
            <button onClick={() => setStep('persona')} disabled={!canContinueAge} className="btn-primary mt-6 !px-8 !py-2.5">
              Continue
            </button>
          </>
        )}

        {step === 'persona' && (
          <>
            <p className="mb-1 text-sm text-mist-400">Hey, it's empty in here.</p>
            <p className="mb-4 text-sm text-mist-400">Let's start by knowing you — what best describes you?</p>
            <select className="input text-center" value={persona} onChange={e => setPersona(e.target.value)}>
              <option value="" disabled>Choose one…</option>
              {PERSONA_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {persona === 'other' && (
              <input
                autoFocus
                className="input mt-3 text-center"
                placeholder="Describe yourself"
                value={personaCustom}
                onChange={e => setPersonaCustom(e.target.value)}
              />
            )}
            <button onClick={() => setStep('imports')} disabled={!canContinuePersona} className="btn-primary mt-6 !px-8 !py-2.5">
              Continue
            </button>
          </>
        )}

        {(step === 'imports' || step === 'saving') && (
          <div className="w-full max-w-lg text-left">
            <p className="mb-1 text-center text-sm text-mist-400">Last step.</p>
            <p className="mb-5 text-center text-sm text-mist-400">
              Paste up to 5 things that already hold your knowledge elsewhere — old AI chats, documents, a kanban board, journal entries, calendar exports. I'll go through all of it on the next refresh cycle.
            </p>

            <div className="max-h-[40vh] space-y-3 overflow-y-auto pr-1">
              {slots.map((slot, i) => (
                <ImportSlot
                  key={i}
                  slot={slot}
                  onChange={next => updateSlot(i, next)}
                  onRemove={() => removeSlot(i)}
                  canRemove={slots.length > 1}
                />
              ))}
            </div>

            {slots.length < MAX_IMPORTS && (
              <button type="button" onClick={addSlot} className="btn-ghost mt-3 !px-3 !py-1.5 text-xs">
                + Add another
              </button>
            )}

            {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

            <div className="mt-6 flex justify-center gap-3">
              <button onClick={finish} disabled={step === 'saving'} className="btn-primary !px-8 !py-2.5">
                {step === 'saving' ? 'Saving…' : 'Finish'}
              </button>
              <button
                onClick={finish}
                disabled={step === 'saving'}
                className="btn-ghost !px-4 !py-2.5 text-xs"
              >
                Skip pasting for now
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <>
            <h2 className="font-serif text-2xl font-light text-mist-100">Got it, {name.trim()}.</h2>
            <p className="mt-2 text-sm text-mist-400">I'll go through everything on the next refresh cycle.</p>
          </>
        )}
      </div>
    </div>
  )
}
