import { useState } from 'react'

export default function Capture() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState('')

  async function submit(e) {
    e.preventDefault()
    setStatus('Saving...')
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, content, tags: tags.split(',').map(t=>t.trim()).filter(Boolean) })
    })
    if (res.ok) {
      setTitle('')
      setContent('')
      setTags('')
      setStatus('Saved')
    } else {
      setStatus('Error')
    }
  }

  return (
    <div style={{padding:24}}>
      <h2>Capture</h2>
      <form onSubmit={submit} style={{display:'grid',gap:8,maxWidth:800}}>
        <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea placeholder="Content" rows={10} value={content} onChange={e=>setContent(e.target.value)} />
        <input placeholder="Tags (comma separated)" value={tags} onChange={e=>setTags(e.target.value)} />
        <button type="submit">Save</button>
      </form>
      <div style={{marginTop:12}}>Status: {status}</div>
    </div>
  )
}
