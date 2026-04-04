import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Flame, LogOut, MapPin, Menu, ShoppingCart, Shield, X } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { useCartStore }  from '../store/cartStore.js'

const ROLE_LABELS = { seller: 'Vendedor', cashier: 'Cajera', admin: 'Admin' }

export default function Topbar({ title }) {
  const navigate = useNavigate()
  const route = useLocation()
  const { seller, location, register, logout } = useAuthStore()
  const cartCount = useCartStore(s => s.count())
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navLinks = useMemo(() => {
    if (seller?.role === 'admin') {
      return [
        { label: 'Admin', path: '/admin' },
        { label: 'Vender', path: '/vender' },
        { label: 'Caja', path: '/caja' },
      ]
    }
    if (seller?.role === 'cashier') {
      return [{ label: 'Caja', path: '/caja' }]
    }
    if (seller?.role === 'seller') {
      return [{ label: 'Vender', path: '/vender' }]
    }
    return []
  }, [seller?.role])

  useEffect(() => {
    setDrawerOpen(false)
  }, [route.pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <>
      <header className="h-14 bg-surface-400 border-b border-white/5 flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0 z-40">
        <button
          onClick={() => setDrawerOpen(true)}
          className="btn-touch-safe inline-flex md:hidden items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-surface-50 px-2"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <Flame className="w-5 h-5 text-brand-500" />
          <span className="font-syne font-bold text-brand-500 text-base hidden sm:block">PyroVenta</span>
        </div>

        {title && (
          <span className="font-syne text-white font-semibold text-sm ml-1 truncate">{title}</span>
        )}

        {cartCount > 0 && (
          <span className="bg-brand-500/90 text-white text-xs font-bold rounded-full px-2 py-0.5 ml-1 inline-flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" />
            {cartCount}
          </span>
        )}

        <div className="flex-1" />

        <div className="hidden md:flex items-center gap-2">
          {navLinks.map(link => {
            const active = route.pathname === link.path
            return (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`text-xs transition-colors px-2 py-1 rounded-md ${active ? 'text-white bg-surface-50' : 'text-gray-400 hover:text-white hover:bg-surface-50'}`}
              >
                {link.label}
              </button>
            )
          })}
        </div>

        {location && (
          <div className="hidden sm:flex items-center gap-1.5 bg-brand-500/15 border border-brand-500/30 rounded-lg px-2.5 py-1.5 max-w-[220px]">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="text-brand-400 text-xs font-medium truncate">
              {location.name}
              {register && <span className="text-brand-300/60"> · {register.name}</span>}
            </span>
          </div>
        )}

        {seller && (
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <span className="hidden lg:block">
              <span className="inline-flex items-center gap-1.5">
                {seller.role === 'admin' && <Shield className="w-3.5 h-3.5 text-brand-500" />}
                {seller.name} · <span className="text-gray-500">{ROLE_LABELS[seller.role]}</span>
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm text-gray-400 hover:text-red-400"
              title="Cerrar sesion"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        )}
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-[1200] md:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menu"
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-surface-300 border-r border-white/10 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-brand-500" />
                <span className="font-syne font-bold text-brand-500">PyroVenta</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 px-2"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {location && (
              <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/25 rounded-lg px-3 py-2">
                <MapPin className="w-4 h-4 text-brand-400" />
                <span className="text-sm text-brand-300 truncate">{location.name}</span>
              </div>
            )}

            <nav className="flex flex-col gap-2">
              {navLinks.map(link => {
                const active = route.pathname === link.path
                return (
                  <button
                    key={link.path}
                    onClick={() => navigate(link.path)}
                    className={`text-left rounded-lg px-3 py-2.5 text-sm border transition-colors ${active ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'bg-surface-400 border-white/5 text-gray-300 hover:text-white hover:border-white/20'}`}
                  >
                    {link.label}
                  </button>
                )
              })}
            </nav>

            {seller && (
              <div className="mt-auto space-y-3">
                <div className="text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    {seller.role === 'admin' && <Shield className="w-3.5 h-3.5 text-brand-500" />}
                    {seller.name} · <span className="text-gray-500">{ROLE_LABELS[seller.role]}</span>
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn btn-ghost w-full justify-start text-gray-300 hover:text-red-400 border border-white/10"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesion
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
