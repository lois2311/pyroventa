import { create } from 'zustand'

export const useInvoiceStore = create((set, get) => ({
  pendingInvoices: [],
  currentInvoice:  null,
  lastCreated:     null, // factura recién creada (para mostrar código en VendedorPage)

  setPending: (invoices) => set({ pendingInvoices: invoices }),

  addPending: (invoice) => set(state => {
    // Evitar duplicados
    const exists = state.pendingInvoices.some(i => i.id === invoice.id)
    if (exists) return state
    return { pendingInvoices: [invoice, ...state.pendingInvoices] }
  }),

  removePending: (invoiceId) => set(state => ({
    pendingInvoices: state.pendingInvoices.filter(i => i.id !== invoiceId)
  })),

  updatePending: (invoiceId, updates) => set(state => ({
    pendingInvoices: state.pendingInvoices.map(i =>
      i.id === invoiceId ? { ...i, ...updates } : i
    )
  })),

  setCurrentInvoice: (invoice) => set({ currentInvoice: invoice }),
  clearCurrentInvoice: () => set({ currentInvoice: null }),

  setLastCreated: (invoice) => set({ lastCreated: invoice }),
  clearLastCreated: () => set({ lastCreated: null }),

  // Helpers
  pendingCount: () => get().pendingInvoices.length,
}))
