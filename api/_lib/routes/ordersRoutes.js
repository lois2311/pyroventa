import { requireCan } from '../auth.js'
import { clientIp } from '../loginLock.js'
import { rejectIfRateLimited } from '../rateLimit.js'
import { resolvePublicOrderContext, fetchLocationCatalog, fetchActiveZones, toPresentationMap } from '../services/publicCatalogService.js'
import { parseQuoteRequest, buildQuote, DEFAULT_TTL_MINUTES } from '../services/quoteService.js'

// =====================================================
// Vendra Pedidos — contratos de API (catálogo/cotización desde PR-02, solicitudes desde PR-03; el resto stubs).
// Cada ruta aplica auth/permiso real y responde 501 hasta su PR.
// Nada aquí toca facturas, caja ni inventario.
// =====================================================

const notImplemented = (res) => res.status(501).json({ error: 'No implementado' })

/** Ruta autenticada con permiso `action`; el cuerpo real llega en PRs posteriores. */
export const stub = (action) => async (req, res) => {
  const auth = await requireCan(req, res, action)
  if (!auth) return
  return notImplemented(res)
}

/** Ruta pública (formulario web): sin JWT; rate limit y validación llegan con su implementación. */
export const publicStub = async (_req, res) => notImplemented(res)

// ---- Públicas (PR 2-3) ----------------------------

const notFound = (res) => res.status(404).json({ error: 'Pedidos no disponibles' })

// GET /public/orders/:slug/catalog — sin JWT; solo campos comerciales de la sede piloto
export async function publicCatalogGet(req, res, slug) {
  if (rejectIfRateLimited(res, `orders:${clientIp(req)}`)) return
  const ctx = await resolvePublicOrderContext(slug); if (!ctx) return notFound(res)
  const [products, zones] = await Promise.all([
    fetchLocationCatalog(ctx.tenantId, ctx.locationId),
    fetchActiveZones(ctx.tenantId, ctx.locationId),
  ])
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  const methods = ctx.settings.payment_methods || []
  return res.json({
    business: {
      name: ctx.businessName, currency: ctx.settings.currency, payment_methods: methods,
      // Instrucciones pensadas para el cliente: solo se publican si la transferencia está habilitada
      transfer_instructions: methods.includes('transfer') ? ctx.settings.transfer_details?.instructions ?? null : null,
    },
    products, delivery_zones: zones,
  })
}

// POST /public/orders/:slug/quote — recalcula todo en servidor; no persiste nada
export async function publicQuotePost(req, res, slug) {
  if (rejectIfRateLimited(res, `orders:${clientIp(req)}`)) return
  const ctx = await resolvePublicOrderContext(slug); if (!ctx) return notFound(res)
  const parsed = parseQuoteRequest(req.body)
  if (parsed.error) return res.status(parsed.status).json({ error: parsed.error })
  const [products, zones] = await Promise.all([
    fetchLocationCatalog(ctx.tenantId, ctx.locationId),
    fetchActiveZones(ctx.tenantId, ctx.locationId),
  ])
  const result = buildQuote({
    ...parsed.value, catalog: toPresentationMap(products), zones,
    currency: ctx.settings.currency, ttlMinutes: ctx.settings.quote_ttl_minutes ?? DEFAULT_TTL_MINUTES,
  })
  if (result.error) return res.status(result.status).json({ error: result.error, quote: result.quote })
  return res.json(result.quote)
}

// Solicitudes de pedido (PR-03): implementación en orderRequestRoutes.js
export {
  publicRequestCreate, publicRequestGet,
  ordersRequestsList, ordersRequestGet, ordersRequestAccept, ordersRequestReject, ordersPaymentVerify,
} from './orderRequestRoutes.js'

// Configuración comercial por sede (PR-04)
export { ordersSettingsGet, ordersSettingsPut } from './orderSettingsRoutes.js'

// ---- Pendientes ----------------------
export const ordersInvoiceConvert   = stub('manage_orders')        // POST /orders/requests/:id/invoice-conversions (PR 8, fuera del piloto)
