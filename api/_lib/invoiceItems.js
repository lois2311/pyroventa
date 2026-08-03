// =====================================================
// PyroVenta — Construcción autoritativa de los items de una factura
//
// El cliente solo dice QUÉ y CUÁNTO (presentationId + qty). El precio, el
// nombre y la etiqueta salen siempre de la base de datos. Antes el total se
// calculaba con el precio que mandaba el navegador, así que cualquiera con
// un token válido podía facturar una torta de $60.000 en $1.000 y el reporte
// cuadraba igual.
//
// `items` se guarda como snapshot JSONB en invoices.items: es lo que leen los
// recibos y el reporte de productos (report_range_products lee product_name,
// label, qty y subtotal), por eso la forma no puede cambiar.
// =====================================================

/** Tope por línea: una venta real nunca llega ahí, un error de tipeo sí. */
export const MAX_QTY = 9999

const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param clientItems  lo que llegó en el body: [{ presentationId, qty, ... }]
 * @param catalog      Map presentationId → { label, price, product_id, product_name }
 *                     ya filtrado por tenant y por presentaciones activas
 * @returns { items, total } o { error } con un mensaje para el usuario
 */
export function buildInvoiceItems(clientItems, catalog) {
  if (!Array.isArray(clientItems) || clientItems.length === 0) {
    return { error: 'La factura necesita al menos un producto' }
  }

  // Unificar líneas repetidas de la misma presentación antes de cotizar
  const qtyById = new Map()
  for (const raw of clientItems) {
    const id = raw?.presentationId
    if (typeof id !== 'string' || !id.trim()) {
      return { error: 'Item inválido: falta la presentación' }
    }
    const qty = raw?.qty
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
      return { error: `Cantidad inválida: debe ser un número entero entre 1 y ${MAX_QTY}` }
    }
    qtyById.set(id, (qtyById.get(id) || 0) + qty)
  }

  const items = []
  let total = 0
  for (const [presentationId, qty] of qtyById) {
    const pres = catalog.get(presentationId)
    // No está en el catálogo del tenant: o es de otra empresa, o se borró o
    // desactivó mientras el vendedor tenía el carrito abierto.
    if (!pres) {
      return { error: 'Un producto del carrito ya no está disponible — recarga el catálogo e intenta de nuevo' }
    }
    // Ojo: Number(null) y Number('') dan 0, que es un precio válido (cortesía).
    // Hay que descartar el dato ausente antes de convertir, o una fila corrupta
    // se facturaría como gratis en vez de fallar.
    const raw = pres.price
    if (raw === null || raw === undefined || raw === '') {
      return { error: `El precio de "${pres.product_name || 'un producto'}" no es válido` }
    }
    const price = Number(raw)
    if (!Number.isFinite(price) || price < 0) {
      return { error: `El precio de "${pres.product_name || 'un producto'}" no es válido` }
    }

    const subtotal = round2(price * qty)
    total += subtotal
    items.push({
      presentationId,
      productId:    pres.product_id,
      productName:  pres.product_name,
      product_name: pres.product_name, // lo lee report_range_products del JSONB
      label:        pres.label,
      price,
      qty,
      subtotal,
    })
  }

  return { items, total: round2(total) }
}
