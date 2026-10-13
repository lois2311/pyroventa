import { buildInvoiceItems } from '../invoiceItems.js'

// =====================================================
// Vendra Pedidos — cotizador autoritativo (puro, sin BD).
// El cliente dice QUÉ y CUÁNTO; precios, nombres y tarifa salen del servidor.
// Reutiliza buildInvoiceItems pero solo le pasa { presentationId, qty }:
// jamás un precio editado. No toca inventario ni crea facturas.
// =====================================================

export const DEFAULT_TTL_MINUTES = 15
export const MAX_LINES = 50

const round2 = (n) => Math.round(n * 100) / 100
const isoPlus = (date, minutes) => new Date(date.getTime() + minutes * 60_000).toISOString()

/** Valida la forma del body público. Devuelve { value } o { status, error }. */
export function parseQuoteRequest(body = {}) {
  const raw = body?.items
  if (!Array.isArray(raw) || raw.length === 0) return { status: 422, error: 'El pedido necesita al menos un producto' }
  if (raw.length > MAX_LINES) return { status: 422, error: `Máximo ${MAX_LINES} productos por pedido` }
  const lines = raw.map(i => ({ presentationId: i?.presentation_id, qty: i?.quantity }))
  const fulfillment = body.fulfillment ?? 'delivery'
  if (!['delivery', 'pickup'].includes(fulfillment)) return { status: 422, error: 'fulfillment inválido' }
  const expectedTotal = body.expected_total ?? null
  if (expectedTotal !== null && !Number.isFinite(Number(expectedTotal))) return { status: 422, error: 'expected_total inválido' }
  return { value: { lines, fulfillment, zoneId: body.zone_id ?? null, expectedTotal: expectedTotal === null ? null : Number(expectedTotal) } }
}

/**
 * Tarifa de domicilio desde delivery_zones (ya filtradas por tenant, sede y activas).
 * Sin zona pedida: una sola zona activa = tarifa fija del piloto; sin zonas = 0; varias = hay que elegir.
 */
export function resolveDeliveryFee(zones, { fulfillment, zoneId }) {
  if (fulfillment === 'pickup') return { fee: 0, zone: null }
  if (zoneId) {
    const zone = zones.find(z => z.id === zoneId)
    return zone ? { fee: Number(zone.fee), zone } : { status: 422, error: 'Zona de entrega no disponible' }
  }
  if (zones.length === 0) return { fee: 0, zone: null }
  if (zones.length === 1) return { fee: Number(zones[0].fee), zone: zones[0] }
  return { status: 422, error: 'Selecciona una zona de entrega' }
}

/**
 * @param catalog  Map presentationId → { label, price, product_id, product_name } (solo disponibles)
 * @returns { quote } o { status, error, quote? }
 */
export function buildQuote({ lines, catalog, zones = [], fulfillment, zoneId, expectedTotal = null, now = new Date(), ttlMinutes = DEFAULT_TTL_MINUTES, currency = 'COP' }) {
  const built = buildInvoiceItems(lines, catalog)
  if (built.error) return { status: 422, error: built.error }

  const fee = resolveDeliveryFee(zones, { fulfillment, zoneId })
  if (fee.error) return { status: fee.status, error: fee.error }

  const subtotal = built.total
  const quote = {
    currency,
    items: built.items.map(i => ({
      presentation_id: i.presentationId,
      product_name: i.productName,
      label: i.label,
      quantity: i.qty,
      unit_price: i.price,
      subtotal: i.subtotal,
    })),
    subtotal,
    delivery_fee: fee.fee,
    total: round2(subtotal + fee.fee),
    zone: fee.zone ? { id: fee.zone.id, name: fee.zone.name } : null,
    quoted_at: now.toISOString(),
    expires_at: isoPlus(now, ttlMinutes),
  }

  // El cliente confirmó otro total: no se conserva el precio viejo en silencio
  if (expectedTotal !== null && round2(expectedTotal) !== quote.total) {
    return { status: 409, error: 'Los precios cambiaron. Revisa la nueva cotización', quote }
  }
  return { quote }
}

export const isQuoteExpired = (expiresAt, now = new Date()) => new Date(expiresAt).getTime() <= now.getTime()
