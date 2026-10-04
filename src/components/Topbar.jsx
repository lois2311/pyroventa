import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Keyboard, LifeBuoy, LogOut, MapPin, Menu, ShoppingCart, Shield, X } from 'lucide-react'
import ThemeToggle from './ThemeToggle.jsx'
import VendraLogo from './VendraLogo.jsx'
import SupportModal from './SupportModal.jsx'
import { useTheme } from '../lib/theme.js'
import Kbd from './Kbd.jsx'
import ShortcutsHelp from './ShortcutsHelp.jsx'
import { isTypingTarget } from '../lib/device.js'
import { useAuthStore } from '../store/authStore.js'
import { useCartStore }  from '../store/cartStore.js'
import { can, ROLE_LABELS } from '../../api/_lib/roles.js'
import Select from './Select.jsx'

export default function Topbar({ title }) {
  const navigate = useNavigate()
  const route = useLocation()
  const { seller, location, locations, register, tenant, logout, setLocation } = useAuthStore()
  const locationOptions = [{ value: '', label: 'Todos los puntos' }, ...locations.map(l => ({ value: l.id, label: l.name }))]
  const cartCount = useCartStore(s => s.count())
  const clearCart = useCartStore(s => s.clear)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [supportContext, setSupportContext] = useState({})
  const helpContext = route.pathname === '/vender' ? 'vender' : route.pathname === '/caja' ? 'caja' : null
  const theme = useTheme()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // El owner puede cambiar de punto sin cerrar sesión: si queda carrito de
  // otro punto, se podría facturar una venta en el punto equivocado.
  const handleLocationChange = (next) => {
    if (next?.id !== location?.id) clearCart()
    setLocation(next)
    if (!next && route.pathname !== '/admin') navigate('/admin')
  }

  // Módulos VENDRA con su tecla de función: F1 Vender · F2 Inventario ·
  // F3 Cierre (caja: cobro y cierre) · F4 Reportes. Cada uno aparece solo si
  // el rol puede usarlo; Vender y Cierre necesitan un punto elegido.
  const hasInventory = Boolean(tenant?.has_inventory)
  const navLinks = useMemo(() => {
    const role = seller?.role
    const links = []
    if (location && can(role, 'sell'))   links.push({ key: 'F1', label: 'Vender', path: '/vender' })
    // Con inventario, F2 lo usan también los admins de punto (reposición); sin él, solo el catálogo del superadmin
    if (hasInventory ? can(role, 'restock') : can(role, 'manage_catalog')) {
      links.push({ key: 'F2', label: 'Inventario', path: '/admin', tab: hasInventory ? 'inventario' : 'productos' })
    }
    if (location && can(role, 'charge')) links.push({ key: 'F3', label: 'Cierre', path: '/caja' })
    if (can(role, 'view_reports'))       links.push({ key: 'F4', label: 'Reportes', path: '/admin', tab: 'resumen' })
    return links
  }, [seller?.role, location, hasInventory])

  const currentTab = new URLSearchParams(route.search).get('tab')
  const isActive = (link) => {
    if (route.pathname !== link.path) return false
    if (!link.tab) return true
    // En /admin, Inventario marca sus pestañas y Reportes todas las demás
    const catalogTab = ['inventario', 'productos'].includes(currentTab)
    return link.label === 'Inventario' ? catalogTab : !catalogTab
  }
  const go = (link) => navigate(link.tab ? `${link.path}?tab=${link.tab}` : link.path)

  useEffect(() => {
    const handleGlobalSupport = (e) => {
      setSupportContext(e.detail || {})
      setSupportOpen(true)
    }
    window.addEventListener('vendra:open-support', handleGlobalSupport)
    return () => window.removeEventListener('vendra:open-support', handleGlobalSupport)
  }, [])

  // Teclas de función: navegan desde cualquier pantalla salvo con un diálogo
  // abierto (F1 ya no abre la ayuda del navegador dentro de la app).
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      // F12 abre el soporte VENDRA
      if (e.key === 'F12' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        setSupportContext({})
        setSupportOpen(true)
        return
      }
      // "?" abre la hoja de atajos (fuera de los campos)
      if (e.key === '?' && !isTypingTarget(e.target) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        setHelpOpen(true)
        return
      }
      const link = navLinks.find(l => l.key === e.key)
      if (!link || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      go(link)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
      <header className="sticky top-0 z-40 h-14 shrink-0 bg-surface-400 border-b border-white/5 flex items-center px-3 sm:px-4 lg:px-5 gap-2 sm:gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="btn btn-ghost btn-icon md:hidden -ml-1"
          aria-label="Abrir menú"
          aria-expanded={drawerOpen}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 shrink-0 min-w-0">
          {/* Menú de la caja: con distintivo POS y sin "by flightdev" */}
          <VendraLogo variant="pos" size="sm" theme={theme} title="VENDRA POS" className="hidden sm:block" />
          <VendraLogo variant="symbol" size={24} theme={theme} title="VENDRA POS" className="sm:hidden" />
        </div>

        {title && (
          <span className="ml-1 truncate border-l border-white/10 pl-3 font-display text-sm font-semibold text-white">{title}</span>
        )}

        {cartCount > 0 && (
          <span className="bg-brand-500 text-surface-700 text-xs font-bold rounded-full px-2 py-0.5 ml-1 inline-flex items-center gap-1">
            <ShoppingCart className="w-3 h-3" />
            {cartCount}
          </span>
        )}

        <div className="flex-1" />

        <nav aria-label="Módulos" className="hidden md:flex items-stretch gap-1 self-stretch">
          {navLinks.map(link => {
            const active = isActive(link)
            return (
              <button
                key={link.key}
                onClick={() => go(link)}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={link.key}
                className={`relative inline-flex items-center gap-2 px-3 text-sm font-medium transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Kbd className={active ? 'border-brand-500/50 text-brand-400' : ''}>{link.key}</Kbd>
                {link.label}
                {/* Indicador activo: línea Voltaje */}
                {active && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </nav>

        {seller?.role === 'owner' && locations.length > 0 ? (
          <div className="hidden sm:flex items-center gap-1.5 bg-brand-500/15 border border-brand-500/30 rounded-lg px-2 py-1 max-w-[240px]">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="sr-only">Punto de venta</span>
            <Select
              variant="bare"
              aria-label="Punto de venta"
              value={location?.id || ''}
              onChange={v => handleLocationChange(locations.find(l => l.id === v) || null)}
              className="max-w-[190px] text-xs font-medium text-brand-300"
              options={locationOptions}
            />
          </div>
        ) : location && (
          <div className="hidden sm:flex items-center gap-1.5 bg-brand-500/15 border border-brand-500/30 rounded-lg px-2.5 py-1.5 max-w-[220px]">
            <MapPin className="w-3.5 h-3.5 text-brand-400 shrink-0" />
            <span className="text-brand-400 text-xs font-medium truncate">
              {location.name}
              {register && <span className="text-gray-300"> · {register.name}</span>}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => { setSupportContext({}); setSupportOpen(true) }}
          aria-keyshortcuts="F12"
          aria-label="Soporte técnico VENDRA"
          title="Soporte Vendra (F12)"
          className="btn btn-ghost btn-sm px-2 text-brand-400 hover:text-brand-300 flex items-center gap-1.5"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline text-xs font-medium">Soporte</span>
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-keyshortcuts="?"
          aria-label="Atajos de teclado"
          title="Atajos de teclado"
          className="btn btn-ghost btn-sm hidden px-2 text-gray-400 lg:[@media(any-pointer:fine)]:inline-flex"
        >
          <Keyboard className="h-4 w-4" aria-hidden="true" /> <Kbd>?</Kbd>
        </button>

        <ThemeToggle />

        {seller && (
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            {/* Desde 1280px: en un equipo de 12" (1024px) el nombre + rol del
                superadministrador empujaba "Salir" fuera de la pantalla */}
            <span className="hidden xl:block">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {can(seller.role, 'view_reports') && <Shield className="w-3.5 h-3.5 text-brand-500" />}
                {seller.name} · <span className="text-gray-400">{ROLE_LABELS[seller.role]}</span>
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="btn btn-ghost btn-sm text-gray-400 hover:text-red-400"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        )}
      </header>

      {helpOpen && <ShortcutsHelp context={helpContext} onClose={() => setHelpOpen(false)} />}

      {drawerOpen && (
        <div className="fixed inset-0 z-[1200] md:hidden">
          <button
            className="absolute inset-0 bg-black/70"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-surface-300 border-r border-white/10 p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <VendraLogo variant="pos" size="sm" theme={theme} title="VENDRA POS" />
              <button
                onClick={() => setDrawerOpen(false)}
                className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 px-2"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {seller?.role === 'owner' && locations.length > 0 ? (
              <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/25 rounded-lg px-3 py-2">
                <MapPin className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="sr-only">Punto de venta</span>
                <Select
                  variant="bare"
                  aria-label="Punto de venta"
                  value={location?.id || ''}
                  onChange={v => handleLocationChange(locations.find(l => l.id === v) || null)}
                  className="w-full text-sm text-brand-300"
                  options={locationOptions}
                />
              </div>
            ) : location && (
              <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/25 rounded-lg px-3 py-2">
                <MapPin className="w-4 h-4 text-brand-400" />
                <span className="text-sm text-brand-300 truncate">{location.name}</span>
              </div>
            )}

            <nav className="flex flex-col gap-2">
              {navLinks.map(link => {
                const active = isActive(link)
                return (
                  <button
                    key={link.key}
                    onClick={() => go(link)}
                    aria-current={active ? 'page' : undefined}
                    className={`press flex min-h-[var(--control-h)] items-center gap-2 text-left rounded-lg px-3 text-sm font-medium border transition-colors ${active ? 'row-active bg-brand-500/15 border-brand-500/40 text-brand-300' : 'bg-surface-400 border-white/5 text-gray-300 hover:text-white hover:border-white/20'}`}
                  >
                    <span className="font-mono text-kbd text-gray-400">{link.key}</span>
                    {link.label}
                  </button>
                )
              })}
            </nav>

            <button
              onClick={() => { setDrawerOpen(false); setSupportContext({}); setSupportOpen(true) }}
              className="btn btn-ghost w-full justify-start gap-2 text-brand-400 mt-2"
            >
              <LifeBuoy className="w-4 h-4" />
              Soporte Vendra
            </button>

            {seller && (
              <div className="mt-auto space-y-3">
                <div className="text-xs text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    {can(seller.role, 'view_reports') && <Shield className="w-3.5 h-3.5 text-brand-500" />}
                    {seller.name} · <span className="text-gray-400">{ROLE_LABELS[seller.role]}</span>
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-outline w-full justify-start text-gray-300 hover:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {supportOpen && (
        <SupportModal
          contextData={supportContext}
          onClose={() => setSupportOpen(false)}
        />
      )}
    </>
  )
}
