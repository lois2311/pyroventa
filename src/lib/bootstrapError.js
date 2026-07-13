/**
 * Clasifica el error del bootstrap de empresa (GET /public/tenant/:slug).
 * Solo un rechazo definitivo del servidor (404/403) suelta el amarre del dispositivo.
 */
export function classifyBootstrapError(err) {
  if (err.status === 404 || err.status === 403) {
    return { clearSlug: true, message: err.message }
  }
  if (err.status) {
    return { clearSlug: false, message: 'Error del servidor — reintenta en un momento' }
  }
  return { clearSlug: false, message: err.message || 'Sin conexión — reintenta en un momento' }
}
