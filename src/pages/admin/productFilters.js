// Filtros, facetas y orden del catálogo en Administración → Productos.
// Funciones puras (se prueban sin React): la pestaña solo guarda el estado.
import { matchesQuery } from '../../lib/search.js'

/** Mismo umbral que el color ámbar del badge de stock. */
export const LOW_STOCK = 5
export const NO_CATEGORY = 'none'

export const SORTS = [
  { id: 'name',       label: 'Nombre (A–Z)' },
  { id: 'category',   label: 'Categoría' },
  { id: 'price-asc',  label: 'Precio: menor a mayor' },
  { id: 'price-desc', label: 'Precio: mayor a menor' },
  { id: 'stock-asc',  label: 'Stock: menor primero', inventoryOnly: true },
]

export const DEFAULT_FILTERS = { q: '', cat: '', status: 'all', stock: 'all', sort: 'name' }

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true })

const prices = (p) => (p.presentations || []).map(pr => Number(pr.price)).filter(Number.isFinite)
export const minPrice = (p) => (prices(p).length ? Math.min(...prices(p)) : null)
export const maxPrice = (p) => (prices(p).length ? Math.max(...prices(p)) : null)
const stockOf = (p) => Number(p.stock_quantity ?? 0)

/** Sin presentaciones con precio: el POS no lo muestra (ProductCard devuelve null). */
export const isIncomplete = (p) => prices(p).length === 0

const categoryId = (p) => p.categories?.id || p.category_id || NO_CATEGORY

const byStatus = {
  all:        () => true,
  active:     (p) => p.active !== false,
  inactive:   (p) => p.active === false,
  incomplete: (p) => isIncomplete(p),
}
const byStock = {
  all: () => true,
  out: (p) => stockOf(p) <= 0,
  low: (p) => stockOf(p) > 0 && stockOf(p) <= LOW_STOCK,
}

const comparators = {
  name:         (a, b) => collator.compare(a.name, b.name),
  category:     (a, b) => collator.compare(a.categories?.name || '~', b.categories?.name || '~') || collator.compare(a.name, b.name),
  // Sin precio al final en los dos sentidos
  'price-asc':  (a, b) => (minPrice(a) ?? Infinity) - (minPrice(b) ?? Infinity) || collator.compare(a.name, b.name),
  'price-desc': (a, b) => (maxPrice(b) ?? -Infinity) - (maxPrice(a) ?? -Infinity) || collator.compare(a.name, b.name),
  'stock-asc':  (a, b) => stockOf(a) - stockOf(b) || collator.compare(a.name, b.name),
}

/**
 * Aplica búsqueda, filtros y orden. La búsqueda mira nombre, categoría,
 * descripción y nombres de presentación ("pack", "x12").
 */
export function filterProducts(products, filters = {}) {
  const { q, cat, status, stock, sort } = { ...DEFAULT_FILTERS, ...filters }
  const list = (products || []).filter(p =>
    (byStatus[status] || byStatus.all)(p)
    && (byStock[stock] || byStock.all)(p)
    && (!cat || categoryId(p) === cat)
    && matchesQuery([p.name, p.categories?.name, p.description, ...(p.presentations || []).map(pr => pr.label)], q))
  return list.sort(comparators[sort] || comparators.name)
}

/** Conteos para los filtros (sobre el catálogo completo, no el filtrado). */
export function productFacets(products) {
  const cats = new Map()
  const counts = { all: 0, active: 0, inactive: 0, incomplete: 0, out: 0, low: 0 }
  for (const p of products || []) {
    counts.all++
    if (byStatus.active(p)) counts.active++
    else counts.inactive++
    if (isIncomplete(p)) counts.incomplete++
    if (byStock.out(p)) counts.out++
    if (byStock.low(p)) counts.low++
    const id = categoryId(p)
    const entry = cats.get(id) || { id, name: p.categories?.name || 'Sin categoría', icon: p.categories?.icon || '', count: 0 }
    entry.count++
    cats.set(id, entry)
  }
  const categories = [...cats.values()].sort((a, b) =>
    (a.id === NO_CATEGORY) - (b.id === NO_CATEGORY) || collator.compare(a.name, b.name))
  return { categories, counts }
}

/** Hay algún filtro distinto del valor por defecto (el orden no cuenta). */
export const hasActiveFilters = (f) => Boolean(f.q?.trim() || f.cat || (f.status && f.status !== 'all') || (f.stock && f.stock !== 'all'))
