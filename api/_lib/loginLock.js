// =====================================================
// PyroVenta — Bloqueo de fuerza bruta en logins
// 5 intentos fallidos en 15 min → bloqueo de 15 min.
// Falla ABIERTO: si la tabla login_attempts no existe o la BD
// falla, el login sigue funcionando (no bloquear ventas por esto).
// =====================================================

export const MAX_ATTEMPTS = 5
export const WINDOW_MS = 15 * 60 * 1000
export const LOCK_MS   = 15 * 60 * 1000

/** IP del cliente detrás del proxy de Vercel. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || ''
  return String(fwd).split(',')[0].trim() || 'unknown'
}

/**
 * Estado siguiente tras un intento fallido (lógica pura, testeable).
 * @param {{attempts, window_start, locked_until}|null} row  fila actual o null
 * @param {number} now  epoch ms
 * @returns {{attempts, window_start, locked_until}} fila a guardar
 */
export function nextAttemptState(row, now) {
  const windowStart = row ? new Date(row.window_start).getTime() : 0
  const inWindow = row && (now - windowStart) < WINDOW_MS
  const attempts = inWindow ? row.attempts + 1 : 1
  return {
    attempts,
    window_start: new Date(inWindow ? windowStart : now).toISOString(),
    locked_until: attempts >= MAX_ATTEMPTS ? new Date(now + LOCK_MS).toISOString() : null,
  }
}

/** Minutos restantes de bloqueo, o 0 si no está bloqueado (lógica pura). */
export function lockRemainingMinutes(row, now) {
  if (!row?.locked_until) return 0
  const remaining = new Date(row.locked_until).getTime() - now
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0
}

/**
 * Si la clave está bloqueada responde 429 y retorna true (el caller debe salir).
 */
export async function rejectIfLocked(supabase, key, res) {
  try {
    const { data: row } = await supabase.from('login_attempts')
      .select('attempts, window_start, locked_until').eq('key', key).single()
    const minutes = lockRemainingMinutes(row, Date.now())
    if (minutes > 0) {
      res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).` })
      return true
    }
  } catch { /* fail-open */ }
  return false
}

/** Registra un intento fallido (best effort). */
export async function recordFailedAttempt(supabase, key) {
  try {
    const { data: row } = await supabase.from('login_attempts')
      .select('attempts, window_start, locked_until').eq('key', key).single()
    const next = nextAttemptState(row, Date.now())
    await supabase.from('login_attempts').upsert({ key, ...next })
  } catch { /* fail-open */ }
}

/** Limpia el contador tras un login exitoso (best effort). */
export async function clearAttempts(supabase, key) {
  try {
    await supabase.from('login_attempts').delete().eq('key', key)
  } catch { /* fail-open */ }
}
