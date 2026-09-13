import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      seller:   null,   // { id, name, role }
      location: null,   // { id, name, address, printer_config }
      tenant:   null,   // { id, name, slug }
      locations: [],   // puntos a los que tiene acceso (admin/owner)
      register: null,   // { id, name } — caja seleccionada (solo cajeros)
      token:    null,

      isAuthenticated: () => !!get().seller,

      hasRole: (...roles) => {
        const s = get().seller
        return s && roles.includes(s.role)
      },

      login: (seller, location, tenant, token, locations = location ? [location] : []) => {
        localStorage.setItem('pv_token', token)
        if (tenant?.slug) localStorage.setItem('pv_tenant_slug', tenant.slug)
        set({ seller, location, tenant, token, locations, register: null })
        // Avisa a NetworkBanner de reintentar la cola offline con la sesión
        // recién iniciada (una operación pudo quedar 'pending' por un 401
        // durante un reintento en segundo plano con la sesión anterior).
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('pv:queue-sync'))
        }
        // Limpiar cachés de API del SW ANTES de que el caller navegue,
        // para que la primera pantalla no sirva datos de otro tenant.
        if (typeof caches !== 'undefined') {
          return caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.includes('api')).map(k => caches.delete(k))))
            .catch(() => {})
        }
        return Promise.resolve()
      },

      setRegister: (register) => set({ register }),

      // Solo owner cambia de punto; null = modo administración de toda la empresa
      setLocation: (location) => set({ location, register: null }),

      logout: () => {
        localStorage.removeItem('pv_token')
        // pv_tenant_slug se conserva: el dispositivo sigue amarrado a la empresa
        set({ seller: null, location: null, locations: [], register: null, token: null })
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
        locations: state.locations,
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
