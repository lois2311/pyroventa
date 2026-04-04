import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      seller:   null,   // { id, name, role }
      location: null,   // { id, name, address, printer_config }
      register: null,   // { id, name } — caja/registradora seleccionada (solo cajeros)
      token:    null,

      isAuthenticated: () => !!get().seller,

      hasRole: (...roles) => {
        const s = get().seller
        return s && roles.includes(s.role)
      },

      login: (seller, location, token) => {
        localStorage.setItem('pv_token', token)
        set({ seller, location, token, register: null })
      },

      setRegister: (register) => set({ register }),

      logout: () => {
        localStorage.removeItem('pv_token')
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
