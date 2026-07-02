/** In-memory idempotency cache for duplicate POST protection (dev/single-instance). */
const cache = new Map()
const TTL_MS = 5 * 60 * 1000

function read(key) {
  if (!key) return null
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry
}

function write(key, status, body) {
  if (!key) return
  cache.set(key, { at: Date.now(), status, body })
}

function idempotencyKey(req, scope) {
  const header = req.headers['idempotency-key']
  if (!header || !req.user?._id) return null
  return `${scope}:${req.user._id}:${header}`
}

module.exports = { read, write, idempotencyKey }
