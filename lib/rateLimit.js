const store = globalThis.__rateLimitStore || (globalThis.__rateLimitStore = new Map())

export function isRateLimited(bucket, key, maxAttempts, windowMs) {
  const mapKey = `${bucket}:${key}`
  const entry = store.get(mapKey)
  if (!entry) return false
  if (Date.now() - entry.first > windowMs) {
    store.delete(mapKey)
    return false
  }
  return entry.count >= maxAttempts
}

export function recordAttempt(bucket, key, windowMs) {
  const mapKey = `${bucket}:${key}`
  const entry = store.get(mapKey)
  if (!entry || Date.now() - entry.first > windowMs) {
    store.set(mapKey, { count: 1, first: Date.now() })
  } else {
    entry.count += 1
  }
}

export function requestIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString()
}
