import { useEffect, useState } from 'react'

export default function Distill() {
  const [notes, setNotes] = useState([])
  const [selected, setSelected] = useState(null)
  const [summary, setSummary] = useState('')

  async function load() {
    const res = await fetch('/api/notes')
    const data = await res.json()
    setNotes(data)
  }

  useEffect(()=>{ load() },[])

  function open(n) {
    setSelected(n)
    setSummary(n.executive_summary || '')
  }

  async function saveSummary() {
    if(!selected) return
    await fetch('/api/notes/' + selected.id, { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify({ executive_summary: summary, distilled: true }) })
    load()
    alert('Saved')
  }

  return (
    <div style={{padding:24}}>
      <h2>Distill</h2>
      <div style={{display:'flex',gap:12}}>
        <div style={{width:300}}>
          <h4>Notes</h4>
          {notes.map(n=> (
            <div key={n.id} style={{borderBottom:'1px solid #eee',padding:8,cursor:'pointer'}} onClick={()=>open(n)}>
              <strong>{n.title}</strong>
              <div style={{fontSize:12}}>{n.executive_summary ? '(distilled)' : ''}</div>
            </div>
          ))}
        </div>
        <div style={{flex:1}}>
          {selected ? (
            <div>
              <h3>{selected.title}</h3>
              <div style={{marginBottom:8}}><em>{(selected.content||'').slice(0,400)}</em></div>
              <textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={8} style={{width:'100%'}} placeholder="Write executive summary here"></textarea>
              <div style={{marginTop:8}}>
                <button onClick={saveSummary}>Save Summary</button>
              </div>
            </div>
          ) : <div>Select a note to distill.</div>}
        </div>
      </div>
    </div>
  )
}
