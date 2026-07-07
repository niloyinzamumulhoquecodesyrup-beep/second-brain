import { getSessionFromReq } from '../../../lib/auth'

export default async function handler(req, res) {
  const session = getSessionFromReq(req)
  if (!session) return res.status(401).json({ error: 'Not authenticated' })
  return res.status(200).json({ email: session.email })
}
