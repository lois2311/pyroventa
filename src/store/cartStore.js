import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Cart ahora persiste en localStorage para sobrevivir recargas y pérdidas
// de conexión. Se limpia explícitamente al generar la factura.

/**
 * Unidades de un producto en el carrito sumando todas sus presentaciones: el
 * inventario se descuenta por producto (un "Paquete x12" resta 1, igual que
 * una "Unidad"; ver groupItemsByProduct en api/_lib/services/stockService.js).
 */
export function productQtyInCart(items, productId) {
  return items.reduce((n, i) => (i.productId === productId ? n + i.qty : n), 0)
}

/** Productos del carrito con más unidades que stock: [{ productId, productName, qty, stock }]. */
export function overStockItems(items) {
  const byProduct = new Map()
  for (const i of items) {
    if (i.stock === null || i.stock === undefined) continue
    const prev = byProduct.get(i.productId)
    byProduct.set(i.productId, {
      productId: i.productId, productName: i.productName, stock: i.stock,
      qty: (prev?.qty || 0) + i.qty,
    })
  }
  return [...byProduct.values()].filter(p => p.qty > p.stock)
}

// `stock` en cada item: null/undefined = el negocio no controla inventario
// (sin tope). Con número, agregar o subir cantidad no puede pasar de ahí;
// addItem/updateQty devuelven false cuando lo impiden, para avisar al usuario.
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const { items } = get()
        const stock = item.stock ?? null
        if (stock !== null && productQtyInCart(items, item.productId) + 1 > stock) return false
        // El stock más reciente vale para todas las presentaciones del producto
        const withStock = (i) => (stock !== null && i.productId === item.productId ? { ...i, stock } : i)

        const existing = items.find(i => i.presentationId === item.presentationId)
        if (existing) {
          set({
            items: items.map(i =>
              i.presentationId === item.presentationId
                ? withStock({ ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price })
                : withStock(i)
            )
          })
          return true
        }
        const basePrice = Number(item.price) || 0
        set({
          items: [...items.map(withStock), {
            presentationId:    item.presentationId,
            productId:         item.productId,
            productName:       item.productName,
            product_name:      item.productName,
            label:             item.label,
            base_price:        basePrice,
            original_price:    basePrice,
            price:             basePrice,
            is_price_edited:   false,
            price_edit_reason: null,
            // Precio diferencial por punto de venta (distinto de una edición
            // manual del cajero): viene ya calculado del backend en `price`.
            is_location_price: !!item.isLocationPrice,
            company_price:     item.isLocationPrice ? Number(item.companyPrice) || basePrice : null,
            stock,
            qty:               1,
            subtotal:          basePrice,
          }]
        })
        return true
      },

      removeItem: (presentationId) => set(state => ({
        items: state.items.filter(i => i.presentationId !== presentationId)
      })),

      updateQty: (presentationId, qty) => {
        const { items } = get()
        if (qty <= 0) {
          set({ items: items.filter(i => i.presentationId !== presentationId) })
          return true
        }
        const item = items.find(i => i.presentationId === presentationId)
        if (!item) return false
        // Bajar siempre se puede; subir, solo dentro del stock del producto
        if (qty > item.qty && item.stock !== null && item.stock !== undefined) {
          const others = productQtyInCart(items, item.productId) - item.qty
          if (others + qty > item.stock) return false
        }
        set({
          items: items.map(i =>
            i.presentationId === presentationId
              ? { ...i, qty, subtotal: qty * i.price }
              : i
          )
        })
        return true
      },

      /** Refresca el stock de los items con el catálogo recién cargado. */
      syncStock: (stockByProduct) => set(state => {
        let changed = false
        const items = state.items.map(i => {
          if (!stockByProduct.has(i.productId)) return i
          const stock = stockByProduct.get(i.productId)
          if (stock === i.stock) return i
          changed = true
          return { ...i, stock }
        })
        return changed ? { items } : state
      }),

      updatePrice: (presentationId, newPrice, reason = '') => set(state => {
        const priceNum = Math.round(Number(newPrice) * 100) / 100
        if (!Number.isFinite(priceNum) || priceNum < 0) return state

        return {
          items: state.items.map(i => {
            if (i.presentationId !== presentationId) return i
            const base = i.base_price ?? i.original_price ?? i.price
            const isEdited = priceNum !== base
            return {
              ...i,
              base_price:        base,
              original_price:    base,
              price:             priceNum,
              is_price_edited:   isEdited,
              price_edit_reason: isEdited ? (reason?.trim() || null) : null,
              subtotal:          i.qty * priceNum,
            }
          })
        }
      }),

      resetPrice: (presentationId) => set(state => {
        return {
          items: state.items.map(i => {
            if (i.presentationId !== presentationId) return i
            const base = i.base_price ?? i.original_price ?? i.price
            return {
              ...i,
              price:             base,
              is_price_edited:   false,
              price_edit_reason: null,
              subtotal:          i.qty * base,
            }
          })
        }
      }),

      clear: () => set({ items: [] }),

      total: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),
      count: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    {
      name: 'pv_cart',
      partialize: (state) => ({ items: state.items }),
    }
  )
)
