// =====================================================
// PyroVenta — Construcción autoritativa de los items de una factura
//
// El cliente dice QUÉ y CUÁNTO (presentationId + qty). Por defecto el precio,
// el nombre y la etiqueta salen de la base de datos (catálogo autoritativo).
//
// Si se negocia o edita un precio en el carrito o en la factura pendiente
// (is_price_edited: true o custom_price indicado), el sistema valida el nuevo
// precio, conserva el precio original de catálogo, calcula el total exacto
// y genera un registro de auditoría con la diferencia y el motivo.
//
// `items` se guarda como snapshot JSONB en invoices.items: es lo que leen los
// recibos y el reporte de productos (report_range_products lee product_name,
// label, qty y subtotal), por eso la forma no puede cambiar.
// =====================================================

/** Tope por línea: una venta real nunca llega ahí, un error de tipeo sí. */
export const MAX_QTY = 9999
export const MAX_PRICE = 100000000

const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param clientItems  lo que llegó en el body: [{ presentationId, qty, is_price_edited?, custom_price?, price_edit_reason?, ... }]
 * @param catalog      Map presentationId → { label, price, product_id, product_name }
 *                     ya filtrado por tenant y por presentaciones activas (y punto de venta si aplica)
 * @returns { items, total, auditLogs } o { error } con un mensaje para el usuario
 */
export function buildInvoiceItems(clientItems, catalog) {
  if (!Array.isArray(clientItems) || clientItems.length === 0) {
    return { error: 'La factura necesita al menos un producto' }
  }

  // Unificar líneas de la misma presentación y mismo precio negociado antes de cotizar
  const groups = new Map()
  for (const raw of clientItems) {
    const id = raw?.presentationId
    if (typeof id !== 'string' || !id.trim()) {
      return { error: 'Item inválido: falta la presentación' }
    }
    const qty = raw?.qty
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY) {
      return { error: `Cantidad inválida: debe ser un número entero entre 1 y ${MAX_QTY}` }
    }

    let customPrice = null
    if (raw?.custom_price !== undefined && raw?.custom_price !== null && raw?.custom_price !== '') {
      customPrice = Number(raw.custom_price)
    } else if (raw?.is_price_edited && raw?.price !== undefined && raw?.price !== null && raw?.price !== '') {
      customPrice = Number(raw.price)
    }

    if (customPrice !== null) {
      if (!Number.isFinite(customPrice) || customPrice < 0 || customPrice > MAX_PRICE) {
        return { error: 'El precio editado no es válido (debe ser un valor positivo)' }
      }
      customPrice = round2(customPrice)
    }

    const reason = typeof raw?.price_edit_reason === 'string'
      ? raw.price_edit_reason.trim()
      : (typeof raw?.reason === 'string' ? raw.reason.trim() : '')

    const groupKey = customPrice !== null ? `${id}__cprice_${customPrice}__${reason}` : id
    const prev = groups.get(groupKey)
    if (prev) {
      prev.qty += qty
    } else {
      groups.set(groupKey, { id, qty, customPrice, reason })
    }
  }

  const items = []
  const auditLogs = []
  let total = 0

  for (const group of groups.values()) {
    const { id: presentationId, qty, customPrice, reason } = group
    const pres = catalog.get(presentationId)
    // No está en el catálogo del tenant: o es de otra empresa, o se borró o
    // desactivó mientras el vendedor tenía el carrito abierto.
    if (!pres) {
      return { error: 'Un producto del carrito ya no está disponible — recarga el catálogo e intenta de nuevo' }
    }

    // Ojo: Number(null) y Number('') dan 0, que es un precio válido (cortesía).
    // Hay que descartar el dato ausente antes de convertir, o una fila corrupta
    // se facturaría como gratis en vez de fallar.
    const rawPrice = pres.price
    if (rawPrice === null || rawPrice === undefined || rawPrice === '') {
      return { error: `El precio de "${pres.product_name || 'un producto'}" no es válido` }
    }
    const catalogPrice = Number(rawPrice)
    if (!Number.isFinite(catalogPrice) || catalogPrice < 0) {
      return { error: `El precio de "${pres.product_name || 'un producto'}" no es válido` }
    }

    // Si hubo edición explícita y difiere del precio base de catálogo
    const isEdited = customPrice !== null && customPrice !== catalogPrice
    const effectivePrice = isEdited ? customPrice : catalogPrice
    const subtotal = round2(effectivePrice * qty)
    total += subtotal

    const itemObj = {
      presentationId,
      productId:    pres.product_id,
      productName:  pres.product_name,
      product_name: pres.product_name, // lo lee report_range_products del JSONB
      label:        pres.label,
      price:        effectivePrice,
      qty,
      subtotal,
    }

    if (isEdited) {
      itemObj.original_price    = catalogPrice
      itemObj.is_price_edited   = true
      itemObj.price_edit_reason = reason || null

      auditLogs.push({
        presentation_id:    presentationId,
        product_id:         pres.product_id,
        product_name:       pres.product_name,
        presentation_label: pres.label,
        original_price:     catalogPrice,
        edited_price:       effectivePrice,
        difference:         round2(effectivePrice - catalogPrice),
        qty,
        total_difference:   round2((effectivePrice - catalogPrice) * qty),
        reason:             reason || null,
      })
    }

    items.push(itemObj)
  }

  return { items, total: round2(total), auditLogs }
}
