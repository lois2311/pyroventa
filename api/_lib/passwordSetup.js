import { createHash, randomBytes } from 'node:crypto'

// =====================================================
// PyroVenta — Enlaces de clave inicial (lógica pura)
// El token en crudo solo vive en la URL; en BD se guarda su SHA-256.
// =====================================================

export const SETUP_TTL_HOURS = 24
export const TOKEN_RE = /^[a-f0-9]{64}$/

export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex')

export function generateSetupToken(now = Date.now(), ttlHours = SETUP_TTL_HOURS) {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashToken(token), expiresAt: new Date(now + ttlHours * 3600_000).toISOString() }
}

/** true si la fila del token sirve: existe, no usada, no revocada y no vencida. */
export function tokenUsable(row, now = Date.now()) {
  return !!row && !row.used_at && !row.revoked_at && new Date(row.expires_at).getTime() > now
}

export const INVALID_LINK_MESSAGE = 'El enlace es inválido o ha expirado. Solicita uno nuevo al superadministrador'
