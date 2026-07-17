import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import TourOverlay from '../components/TourOverlay'
import ParaBadge from '../components/ParaBadge'
import { requireSessionSSR } from '../lib/pageAuth'

export default function Distill({ user }) {
  const [notes, setNotes] = useState([])
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')

  async function load() {
    const res = await fetch('/api/notes')
    const data = await res.json()
    setNotes(data)
  }

  useEffect(() => { load() }, [])

  function open(n) {
    setSelected(n)
    setSummary(n.executive_summary || '')
  }

  async function saveSummary() {
    if (!selected) return
    setSaving(true)
    const res = await fetch('/api/notes/' + selected.id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ executive_summary: summary, distilled: summary.trim().length > 0 })
    })
    setSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setSelected(updated)
      setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)))
    }
  }

  const visible = notes.filter(n => (filter === 'distilled' ? n.distilled : filter === 'pending' ? !n.distilled : true))

  return (
    <Layout user={user}>
      <TourOverlay step="distill" />
      <p className="label mb-2 !text-gold-400">Distill</p>
      <h1 className="mb-2 font-serif text-4xl font-light text-mist-100">Refine to the essence</h1>
      <p className="mb-8 max-w-2xl text-sm text-mist-400">
        Read → highlight → bold → summarize. Write an executive summary of only what matters — the most distilled
        version becomes the most accessible one later.
      </p>

      <div className="mb-5 flex gap-2">
        {['all', 'pending', 'distilled'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`chip capitalize ${filter === f ? 'border-gold-400/50 text-gold-400' : ''}`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card scrollbar-thin overflow-y-auto border-t-2 border-gold-400/30 p-2" style={{ maxHeight: 600 }}>
          {visible.length === 0 && <p className="p-4 text-sm text-mist-400">Nothing to distill yet.</p>}
          {visible.map(n => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={`block w-full rounded-md p-3 text-left transition hover:bg-ink-800 ${selected?.id === n.id ? 'bg-ink-800' : ''}`}
            >
              <p className="truncate text-sm text-mist-100">{n.title}</p>
              <div className="mt-1 flex items-center gap-2">
                <ParaBadge para={n.para} />
                {n.distilled && <span className="text-[13px] uppercase tracking-wide text-gold-400">Distilled</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="card p-6 lg:col-span-2">
          {selected ? (
            <div>
              <h3 className="font-serif text-2xl text-mist-100">{selected.title}</h3>
              <p className="mt-3 max-w-[65ch] whitespace-pre-wrap text-sm leading-relaxed text-mist-300">
                {(selected.content || '').slice(0, 1200)}
              </p>
              <label className="mb-1.5 mt-6 block text-xs uppercase tracking-wider text-mist-400">Executive summary</label>
              <textarea
                className="input min-h-[160px] focus:!border-gold-500/60 focus:!ring-gold-500/40"
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Only what feels important, in a few sentences."
              />
              <button onClick={saveSummary} disabled={saving} className="btn-gold mt-4">
                {saving ? 'Saving…' : 'Save summary'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-mist-400">Select a note to distill.</p>
          )}
        </div>
      </div>
    </Layout>
  )
}

export async function getServerSideProps(context) {
  return requireSessionSSR(context)
}
