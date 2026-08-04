import { requireAuth } from '../../../lib/withAuth'
import { isRateLimited, recordAttempt } from '../../../lib/rateLimit'

// Metered's Get Credential endpoint (?apiKey=) takes a credential-scoped apiKey, NOT
// the account-scoped secretKey -- so this mints a short-lived TURN credential via
// Create Credential (secretKey, server-side only, never sent to the client) and then
// immediately resolves it to a region-correct ICE servers array via Get Credential,
// same two-hop flow as Metered's own "Expiring Credentials" docs. Doing both hops here
// (rather than handing the front-end just the apiKey) keeps the client-facing contract
// simple and means the dashboard's configured region/plan is honored automatically.
// Consumed by MindcordSection.js's RoomView before it opens any RTCPeerConnection,
// merged with the STUN-only ICE_SERVERS default there if this fails.
const CREDENTIAL_TTL_SECONDS = 4 * 60 * 60 // long enough to cover one room session

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end()
  }

  const domain = process.env.METERED_DOMAIN
  const secretKey = process.env.METERED_SECRET_KEY
  if (!domain || !secretKey) return res.status(500).json({ error: 'TURN server not configured' })

  if (isRateLimited('mindcord_turn', req.user.id, 20, 60_000)) {
    return res.status(429).json({ error: 'Slow down, wait a moment before retrying' })
  }
  recordAttempt('mindcord_turn', req.user.id, 60_000)

  try {
    const created = await fetch(`https://${domain}/api/v1/turn/credential?secretKey=${encodeURIComponent(secretKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiryInSeconds: CREDENTIAL_TTL_SECONDS, label: `mindcord:${req.user.id}` })
    })
    if (!created.ok) return res.status(502).json({ error: 'Could not reach TURN provider' })
    const { apiKey } = await created.json()
    if (!apiKey) return res.status(502).json({ error: 'TURN provider returned no credential' })

    const resolved = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`)
    if (!resolved.ok) return res.status(502).json({ error: 'Could not reach TURN provider' })
    const iceServers = await resolved.json()
    return res.status(200).json({ iceServers })
  } catch (err) {
    console.error(err)
    return res.status(502).json({ error: 'Could not reach TURN provider' })
  }
}

export default requireAuth(handler)
