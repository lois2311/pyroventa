import bcrypt from 'bcryptjs'

// Hash bcrypt (costo 10) precomputado de 'pyroventa-dummy' — iguala el tiempo de
// respuesta cuando el usuario no existe sin pagar el hash en cada cold start.
export const DUMMY_HASH = '$2b$10$cDwgjYniiWBg7KfhzC3lm.JZnXd7ujBEZeF4ow/0qkIhx.cn3bhPC'

export const MIN_PASSWORD = 10
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/

export function normalizeUsername(u) {
  return String(u ?? '').trim().toLowerCase()
}

export function validateUsername(u) {
  const username = normalizeUsername(u)
  return USERNAME_RE.test(username)
    ? { ok: true, username }
    : { ok: false, error: 'Usuario inválido: de 3 a 32 caracteres, solo letras, números, punto, guion o guion bajo' }
}

export function validatePassword(p) {
  return typeof p === 'string' && p.length >= MIN_PASSWORD
    ? { ok: true }
    : { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }
}

export function hashPassword(p) {
  return bcrypt.hashSync(p, 10)
}

/** Siempre ejecuta bcrypt (aunque no haya hash) para no revelar si el usuario existe. */
export function verifyPassword(p, hash) {
  const valid = bcrypt.compareSync(String(p ?? ''), hash || DUMMY_HASH)
  return valid && !!hash
}
