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
        return {
          items: [...state.items, {
            presentationId: item.presentationId,
            productId:      item.productId,
            productName:    item.productName,
            product_name:   item.productName,
            label:          item.label,
            price:          item.price,
            qty:            1,
            subtotal:       item.price,
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
