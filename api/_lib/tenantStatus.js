/**
 * Evalúa si un tenant puede operar hoy.
 * license_start / license_end son strings DATE de Postgres ('2026-12-31').
 * Comparación por string ISO (YYYY-MM-DD) — license_end es inclusivo.
 * La frontera del día se calcula en hora local de Colombia (America/Bogota),
 * no en UTC: una licencia vigente hasta el 31 dic sigue válida hasta la
 * medianoche de Bogotá.
 */
export function getTenantStatus(tenant, today = new Date()) {
  if (!tenant) {
    return { ok: false, code: 'TENANT_NOT_FOUND', message: 'Empresa no encontrada' }
  }
  if (!tenant.active) {
    return { ok: false, code: 'TENANT_SUSPENDED', message: 'Empresa suspendida. Contacte a su proveedor.' }
  }
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(today)
  if (d < tenant.license_start) {
    return { ok: false, code: 'LICENSE_NOT_STARTED', message: 'La licencia aún no está vigente.' }
  }
  if (d > tenant.license_end) {
    return { ok: false, code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacte a su proveedor.' }
  }
  return { ok: true }
}
