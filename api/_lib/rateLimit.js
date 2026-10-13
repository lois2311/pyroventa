// =====================================================
// Límite de uso por clave (IP) para rutas públicas. Ventana fija en memoria.
// ponytail: el contador vive en cada instancia serverless (no se comparte entre
// instancias ni sobrevive a un cold start), así que frena abuso casual, no un
// ataque distribuido. Si hace falta, moverlo a Vercel WAF rate limiting o a BD.
// =====================================================

export const PUBLIC_LIMIT = 60
export const PUBLIC_WINDOW_MS = 60_000
const MAX_KEYS = 5000

const buckets = new Map() // key → { count, resetAt }

/** Cuenta un hit. Devuelve { ok, retryAfter } (segundos). */
export function hit(key, { max = PUBLIC_LIMIT, windowMs = PUBLIC_WINDOW_MS, now = Date.now() } = {}) {
  let b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    if (buckets.size >= MAX_KEYS) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k)
    if (buckets.size >= MAX_KEYS) buckets.clear() // memoria acotada ante un barrido de IPs
    b = { count: 0, resetAt: now + windowMs }
    buckets.set(key, b)
  }
  b.count++
  return { ok: b.count <= max, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
}

/** Si la IP excede el límite responde 429 y retorna true (el caller debe salir). */
export function rejectIfRateLimited(res, key, opts) {
  const r = hit(key, opts)
  if (r.ok) return false
  res.setHeader('Retry-After', String(r.retryAfter))
  res.status(429).json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' })
  return true
}

export const _resetForTests = () => buckets.clear()
