// =====================================================
// PyroVenta — Orden del catálogo
//
// Dentro de una categoría los productos se ordenan por la cantidad que
// declara su nombre (tiros), de menor a mayor. Es como los pide el negocio:
// "TORTA DIOSES 16 TIROS" antes que "TORTA 30 TIROS", aunque alfabéticamente
// iría al revés. Los que no declaran cantidad van después, alfabéticos.
// =====================================================

/**
 * Cantidad de tiros que declara el nombre de un producto.
 *
 *   "TORTA 30 TIROS"            → 30
 *   "TORTA ANACONDA 100 TIROS"  → 100
 *   "TORTA 36 TIROS 0,6"        → 36   (el 0,6 es calibre, no cantidad)
 *   "TORTA PERLAS 96"           → 96   (sin la palabra TIROS)
 *   "GLOBOS"                    → null
 */
export function shotsInName(name) {
  if (!name) return null
  const s = String(name)

  // 1) "<n> TIROS" es la forma canónica y gana sobre cualquier otro número
  const tiros = s.match(/(\d+)\s*TIROS?\b/i)
  if (tiros) return Number(tiros[1])

  // 2) Sin la palabra TIROS, el último entero del nombre. Se descartan antes
  //    los decimales ("0,6", "1.5"), que describen calibre y no cantidad.
  const nums = s.replace(/\d+[.,]\d+/g, ' ').match(/\d+/g)
  return nums ? Number(nums[nums.length - 1]) : null
}

/**
 * Comparador del catálogo: categoría → cantidad de tiros → nombre.
 * El nombre desempata con colación numérica ("TORTA 15" antes que "TORTA 104").
 */
export function compareProducts(a, b) {
  const orderA = a.categories?.sort_order ?? 99
  const orderB = b.categories?.sort_order ?? 99
  if (orderA !== orderB) return orderA - orderB

  const shotsA = shotsInName(a.name)
  const shotsB = shotsInName(b.name)
  if (shotsA !== null && shotsB !== null) {
    if (shotsA !== shotsB) return shotsA - shotsB
  } else if (shotsA !== null) {
    return -1 // los que declaran cantidad van primero
  } else if (shotsB !== null) {
    return 1
  }

  return String(a.name).localeCompare(String(b.name), 'es', { numeric: true, sensitivity: 'base' })
}
