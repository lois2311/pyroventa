import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Cart ahora persiste en localStorage para sobrevivir recargas y pérdidas
// de conexión. Se limpia explícitamente al generar la factura.

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => set(state => {
        const existing = state.items.find(i => i.presentationId === item.presentationId)
        if (existing) {
          return {
            items: state.items.map(i =>
              i.presentationId === item.presentationId
                ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
                : i
            )
          }
        }
        const basePrice = Number(item.price) || 0
        return {
          items: [...state.items, {
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
            qty:               1,
            subtotal:          basePrice,
          }]
        }
      }),

      removeItem: (presentationId) => set(state => ({
        items: state.items.filter(i => i.presentationId !== presentationId)
      })),

      updateQty: (presentationId, qty) => set(state => {
        if (qty <= 0) {
          return { items: state.items.filter(i => i.presentationId !== presentationId) }
        }
        return {
          items: state.items.map(i =>
            i.presentationId === presentationId
              ? { ...i, qty, subtotal: qty * i.price }
              : i
          )
        }
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
