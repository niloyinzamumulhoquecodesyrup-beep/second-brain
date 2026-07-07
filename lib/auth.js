import jwt from 'jsonwebtoken'

const COOKIE_NAME = 'sb_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET environment variable is not set')
  return secret
}

export function createSessionToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, getSecret(), { expiresIn: SESSION_TTL_SECONDS })
}

export function verifySessionToken(token) {
  try {
    return jwt.verify(token, getSecret())
  } catch (err) {
    return null
  }
}

export function serializeSessionCookie(token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function serializeLogoutCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function getSessionFromReq(req) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null
  if (!token) return null
  return verifySessionToken(token)
}

export { COOKIE_NAME }
