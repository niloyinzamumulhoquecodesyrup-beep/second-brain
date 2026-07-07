import { useEffect, useState } from 'react'

export default function Organize() {
  const [notes, setNotes] = useState([])

  async function load() {
    const res = await fetch('/api/notes')
    const data = await res.json()
    setNotes(data)
  }

  useEffect(()=>{ load() },[])

  async function move(noteId, para) {
    await fetch('/api/para', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ id: noteId, para }) })
    load()
  }

  const groups = {
    project: [],
    area: [],
    resource: [],
    archive: []
  }
  notes.forEach(n=>groups[n.para || 'resource'].push(n))

  return (
    <div style={{padding:24}}>
      <h2>Organize (PARA)</h2>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        {Object.keys(groups).map(k=> (
          <div key={k} style={{border:'1px solid #ddd',padding:12,borderRadius:6}}>
            <h3>{k}</h3>
            {groups[k].map(n=> (
              <div key={n.id} style={{marginBottom:8}}>
                <strong>{n.title}</strong>
                <div style={{fontSize:12,color:'#444'}}>{(n.content||'').slice(0,120)}</div>
                <div style={{marginTop:6}}>
                  {['project','area','resource','archive'].map(p=> (
                    <button key={p} onClick={()=>move(n.id,p)} style={{marginRight:6}} disabled={n.para===p}>{p}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
