import { useEffect, useState } from 'react'
import { IdentityGate } from './OtherBrainsTab'
import MindcordSection from './MindcordSection'

// Mindcord shares its anonymous identity with the Other Brains tab (same
// other_brains_identities row) but is a separate top-level tab in MINDVERSE, so it
// fetches identity independently rather than relying on OtherBrainsTab's own state.
export default function MindcordTab() {
  const [identity, setIdentity] = useState(undefined)

  useEffect(() => {
    fetch('/api/other-brains/identity').then(r => r.json()).then(d => setIdentity(d.identity))
  }, [])

  if (identity === undefined) {
    return <p className="text-sm text-mist-400">Loading…</p>
  }

  if (!identity) {
    return <IdentityGate onCreated={setIdentity} />
  }

  return <MindcordSection identity={identity} />
}
