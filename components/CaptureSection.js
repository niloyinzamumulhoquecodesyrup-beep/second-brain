import { useState } from 'react'

const PARA_OPTIONS = [
  { value: 'inbox', label: 'Inbox, sort it later (recommended)' },
  { value: 'project', label: 'Project, short-term, has a deadline' },
  { value: 'area', label: 'Area, ongoing, no end date' },
  { value: 'resource', label: 'Resource, interest to explore' },
  { value: 'archive', label: 'Archive, no longer a priority' }
]

export default function CaptureSection({ onSaved }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [para, setPara] = useState('inbox')
  const [sourceUrl, setSourceUrl] = useState('')
  const [status, setStatus] = useState('')

  async function submit(e) {
    e.preventDefault()
    setStatus('Saving…')
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title || 'Untitled',
        content,
        para,
        source_url: sourceUrl || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean)
      })
    })
    if (res.ok) {
      setTitle('')
      setContent('')
      setTags('')
      setSourceUrl('')
      setStatus('Saved as a knowledge asset.')
      onSaved?.()
    } else {
      setStatus('Something went wrong.')
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 border-t-2 border-emerald-400/30 p-6">
      <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea
        className="input min-h-[220px] resize-y"
        placeholder="Write, paste, or reflect here. Use [[Title]] to connect this to another note."
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <select className="input" value={para} onChange={e => setPara(e.target.value)}>
          {PARA_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input className="input" placeholder="Source URL (optional)" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
      </div>
      <input className="input" placeholder="Tags (comma separated)" value={tags} onChange={e => setTags(e.target.value)} />

      <div className="flex items-center gap-4 pt-1">
        <button type="submit" className="btn-primary">Save capture</button>
        {status && <span className="text-sm text-mist-400">{status}</span>}
      </div>
    </form>
  )
}
