import { useEffect, useState } from 'react'

export default function Express() {
  const [notes, setNotes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [packetTitle, setPacketTitle] = useState('')
  const [packets, setPackets] = useState([])

  async function load() {
    const res = await fetch('/api/notes')
    if (!res.ok) return
    const data = await res.json()
    setNotes(data)

    const resp = await fetch('/api/packets')
    if (resp.ok) {
      const ps = await resp.json()
      setPackets(ps)
    }
  }

  useEffect(()=>{ load() },[])

  async function createPacket() {
    if(!selectedId) return alert('Select a note')
    const note = notes.find(n=>n.id===selectedId)
    const res = await fetch('/api/packets', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ note_id: selectedId, title: packetTitle || note.title, content: (note.executive_summary || note.content || '').slice(0,1000) }) })
    if (res.ok) {
      alert('Packet created')
      setPacketTitle('')
      load()
    } else {
      const err = await res.json()
      alert('Error: ' + (err.error || res.status))
    }
  }

  return (
    <div style={{padding:24}}>
      <h2>Express</h2>
      <div style={{display:'flex',gap:12}}>
        <div style={{width:300}}>
          <h4>Notes</h4>
          {notes.map(n=> (
            <div key={n.id} style={{borderBottom:'1px solid #eee',padding:8}}>
              <label>
                <input type="radio" name="note" value={n.id} onChange={()=>setSelectedId(n.id)} /> {n.title}
              </label>
            </div>
          ))}
        </div>
        <div style={{flex:1}}>
          <h4>Create intermediate packet</h4>
          <input placeholder="Packet title (optional)" value={packetTitle} onChange={e=>setPacketTitle(e.target.value)} style={{width:'100%',marginBottom:8}} />
          <button onClick={createPacket}>Create Packet from Note</button>

          <h4 style={{marginTop:20}}>Packets</h4>
          {packets.map(p=> (
            <div key={p.id} style={{border:'1px solid #eee',padding:8,marginBottom:8}}>
              <strong>{p.title}</strong>
              <div style={{fontSize:13}}>{(p.content||'').slice(0,300)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
