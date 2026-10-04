// =====================================================
// VENDRA POS — Recolector de Telemetría Técnica de Soporte
// Captura el estado del entorno sin fricción para el usuario.
// =====================================================

/**
 * Recopila el contexto técnico del cliente para adjuntar al ticket de soporte.
 * Es completamente tolerante a fallos: no lanza excepciones si algún valor no está disponible.
 */
export function collectTechnicalContext({
  location = null,
  register = null,
  activeInvoice = null,
  qzStatus = null,
  sentryEventId = null,
} = {}) {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
  const currentUrl = typeof window !== 'undefined' ? window.location?.href : ''
  const screenDimensions = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : ''

  return {
    online: Boolean(isOnline),
    ua,
    url: currentUrl,
    screen: screenDimensions,
    location_id: location?.id || null,
    location_name: location?.name || null,
    register_id: register?.id || null,
    register_name: register?.name || null,
    invoice_code: activeInvoice?.code || null,
    invoice_total: activeInvoice?.total ? Number(activeInvoice.total) : null,
    qz_status: qzStatus || null,
    sentry_event_id: sentryEventId || null,
    timestamp: new Date().toISOString(),
  }
}
