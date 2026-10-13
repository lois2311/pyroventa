import { requireCan } from '../auth.js'

// =====================================================
// Vendra Pedidos — contratos de API (PR 1: solo stubs).
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
export const publicCatalogGet     = publicStub  // GET  /public/orders/:slug/catalog
export const publicQuotePost      = publicStub  // POST /public/orders/:slug/quote
export const publicRequestCreate  = publicStub  // POST /public/orders/:slug/requests
export const publicRequestGet     = publicStub  // GET  /public/orders/requests/:token

// ---- Administración (PR 3-5) ----------------------
export const ordersSettingsGet      = stub('manage_connect')       // GET  /orders/settings
export const ordersSettingsPut      = stub('manage_connect')       // PUT  /orders/settings
export const ordersRequestsList     = stub('manage_orders')        // GET  /orders/requests
export const ordersRequestGet       = stub('manage_orders')        // GET  /orders/requests/:id
export const ordersRequestAccept    = stub('manage_orders')        // POST /orders/requests/:id/accept
export const ordersRequestReject    = stub('manage_orders')        // POST /orders/requests/:id/reject
export const ordersPaymentVerify    = stub('manage_orders')        // POST /orders/requests/:id/payment-verifications
export const ordersInvoiceConvert   = stub('manage_orders')        // POST /orders/requests/:id/invoice-conversions (PR 8, fuera del piloto)
