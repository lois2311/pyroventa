import { isStockTracked, stockQty } from './stockStatus.js'

/**
 * Lo que ProductCard (toque) y el escáner (Enter) le pasan a addItem para una
 * presentación. Un solo lugar para que los dos caminos agreguen igual.
 */
export function buildCartItem(product, pres, hasInventory) {
  return {
    presentationId:   pres.id,
    productId:        product.id,
    productName:      product.name,
    label:            pres.label,
    price:            pres.price,
    isLocationPrice:  !!pres.is_differential,
    companyPrice:     pres.is_differential ? pres.base_price : undefined,
    // null = sin tope: negocio sin inventario o producto sin control
    stock:            hasInventory && isStockTracked(product) ? stockQty(product) : null,
  }
}

/** Presentaciones vendibles de un producto. */
export function activePresentations(product) {
  return (product.presentations || []).filter(p => p.active !== false)
}

/** Aviso cuando addItem no suma por stock (mismo texto en todo el POS). */
export function stockWarning(product) {
  const stock = stockQty(product)
  return stock <= 0
    ? `Sin existencia. Quedan 0 de ${product.name}.`
    : `Quedan ${stock} de ${product.name} y ya están en el ticket.`
}
