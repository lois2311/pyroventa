import { supabaseAdmin } from './supabaseAdmin.js'
import { resolveLocation, locationInScope } from './scope.js'

/**
 * Punto efectivo de la petición. Si no aplica, responde el error y devuelve
 * undefined (el caller debe salir). null solo para owner con allowAll.
 */
export function scopedLocation(auth, requested, res, opts) {
  const r = resolveLocation(auth.scope, requested || null, opts)
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return undefined }
  return r.locationId
}

/** true (y responde 403) si el punto no está en el alcance del usuario. */
export function denyOutOfScope(auth, locationId, res) {
  if (locationInScope(auth.scope, locationId)) return false
  res.status(403).json({ error: 'No tienes acceso a ese punto de venta' })
  return true
}

/** Caja del tenant dentro del alcance; responde 404/403 y devuelve null si no. */
export async function loadScopedRegister(auth, id, res) {
  const { data } = await supabaseAdmin.from('registers')
    .select('id, name, location_id').eq('id', id).eq('tenant_id', auth.tenantId).single()
  if (!data) { res.status(404).json({ error: 'Caja no encontrada' }); return null }
  if (denyOutOfScope(auth, data.location_id, res)) return null
  return data
}
