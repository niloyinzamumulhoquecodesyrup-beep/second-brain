import { getSessionFromReq } from './auth'

export function requireAuth(handler) {
  return async function (req, res) {
    const session = getSessionFromReq(req)
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' })
    }
    req.user = { id: session.sub, email: session.email }
    return handler(req, res)
  }
}

export function requireAuthPage(req) {
  return getSessionFromReq(req)
}
