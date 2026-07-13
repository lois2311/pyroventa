import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      seller:   null,   // { id, name, role }
      location: null,   // { id, name, address, printer_config }
      tenant:   null,   // { id, name, slug }
      register: null,   // { id, name } — caja seleccionada (solo cajeros)
      token:    null,

      isAuthenticated: () => !!get().seller,

      hasRole: (...roles) => {
        const s = get().seller
        return s && roles.includes(s.role)
      },

      login: (seller, location, tenant, token) => {
        localStorage.setItem('pv_token', token)
        if (tenant?.slug) localStorage.setItem('pv_tenant_slug', tenant.slug)
        set({ seller, location, tenant, token, register: null })
      },

      setRegister: (register) => set({ register }),

      logout: () => {
        localStorage.removeItem('pv_token')
        // pv_tenant_slug se conserva: el dispositivo sigue amarrado a la empresa
        set({ seller: null, location: null, register: null, token: null })
      },

      updatePrinterConfig: (printerConfig) =>
        set(state => ({
          location: state.location
            ? { ...state.location, printer_config: printerConfig }
            : state.location
        })),
    }),
    {
      name: 'pv_auth',
      partialize: (state) => ({
        seller:   state.seller,
        location: state.location,
        tenant:   state.tenant,
        register: state.register,
        token:    state.token,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          localStorage.setItem('pv_token', state.token)
        }
      },
    }
  )
)
