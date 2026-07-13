/**
 * Evalúa si un tenant puede operar hoy.
 * license_start / license_end son strings DATE de Postgres ('2026-12-31').
 * Comparación por string ISO (YYYY-MM-DD) — license_end es inclusivo.
 */
export function getTenantStatus(tenant, today = new Date()) {
  if (!tenant) {
    return { ok: false, code: 'TENANT_NOT_FOUND', message: 'Empresa no encontrada' }
  }
  if (!tenant.active) {
    return { ok: false, code: 'TENANT_SUSPENDED', message: 'Empresa suspendida. Contacte a su proveedor.' }
  }
  const d = today.toISOString().slice(0, 10)
  if (d < tenant.license_start) {
    return { ok: false, code: 'LICENSE_NOT_STARTED', message: 'La licencia aún no está vigente.' }
  }
  if (d > tenant.license_end) {
    return { ok: false, code: 'LICENSE_EXPIRED', message: 'Licencia vencida. Contacte a su proveedor.' }
  }
  return { ok: true }
}
