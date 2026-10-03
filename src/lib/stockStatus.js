// Única definición del estado de stock de un producto en el POS.
// Lee los campos que arma el backend (api/_lib/services/stockService.js):
//   stock_quantity, stock_tracked, low_stock_threshold
// ProductCard, InventarioTab, ProductosTab, productFilters y el carrito dependen de aquí.

/** Umbral cuando el payload viene de un catálogo en caché anterior a la migración. */
export const LOW_STOCK_FALLBACK = 5

/**
 * Colores de la marca (tailwind.config.js VENDRA): Error / Atención / Correcto.
 * `badge` usa las clases red/yellow/green, que ya mapean a esos tokens y
 * cambian a su tinta oscura en el tema claro; `color` y `cssVar` son para
 * quien necesite el valor directo (gráficos, estilos inline).
 */
export const STOCK_STATUS = {
  untracked:    { label: 'Sin control',    badge: 'bg-white/5 text-gray-400 border border-white/10',            color: null,      cssVar: null },
  out_of_stock: { label: 'Sin existencia', badge: 'bg-red-400/15 text-red-400 border border-red-400/20',         color: '#FF7A66', cssVar: 'var(--vd-error)' },
  low_stock:    { label: 'Stock bajo',     badge: 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/20', color: '#FFB547', cssVar: 'var(--vd-warn)' },
  in_stock:     { label: 'Disponible',     badge: 'bg-green-400/15 text-green-400 border border-green-400/20',    color: '#B4E854', cssVar: 'var(--vd-ok)' },
}

export const stockQty = (p) => Number(p?.stock_quantity ?? 0)

/**
 * `false` solo cuando el servidor lo dice. Un payload sin el campo (caché
 * previa) se trata como controlado: es el comportamiento anterior y evita
 * vender de más hasta que llegue el catálogo nuevo.
 */
export const isStockTracked = (p) => p?.stock_tracked !== false

export function getStockStatus(p) {
  if (!isStockTracked(p)) return 'untracked'
  const qty = stockQty(p)
  if (qty <= 0) return 'out_of_stock'
  if (qty <= (p.low_stock_threshold ?? LOW_STOCK_FALLBACK)) return 'low_stock'
  return 'in_stock'
}

/** Tope de unidades vendibles en el carrito: null = sin tope (no controlado). */
export const stockCap = (p) => (isStockTracked(p) ? stockQty(p) : null)
