import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BarChart3, Users, Monitor, MapPin, PartyPopper, ClipboardList, ShieldCheck, Printer, Package,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { useApi }       from '../hooks/useApi.js'
import Topbar           from '../components/Topbar.jsx'
import ErrorNotice      from '../components/ErrorNotice.jsx'
import { toISO }        from '../components/DateRangeBar.jsx'
import { can }          from '../../api/_lib/roles.js'

// ---- Tabs -----------------------------------------------
// Cada pestaña es su propio módulo y se descarga al abrirla (o al pasar el
// puntero por su botón): entrar a Administración ya no parsea 1.700 líneas
// de formularios que casi nunca se usan juntos.
const TABS = [
  { id: 'resumen',    label: 'Resumen',    icon: BarChart3,     action: 'view_reports',      load: () => import('./admin/ResumenTab.jsx') },
  { id: 'vendedores', label: 'Usuarios',   icon: Users,         action: 'manage_staff',      load: () => import('./admin/UsuariosTab.jsx') },
  { id: 'cajas',      label: 'Cajas',      icon: Monitor,       action: 'manage_registers',  load: () => import('./admin/CajasTab.jsx') },
  { id: 'locaciones', label: 'Puntos',     icon: MapPin,        action: 'manage_locations',  load: () => import('./admin/PuntosTab.jsx') },
  { id: 'productos',  label: 'Productos',  icon: PartyPopper,   action: 'manage_catalog',    load: () => import('./admin/ProductosTab.jsx') },
  { id: 'inventario', label: 'Inventario', icon: Package,       action: 'restock',           load: () => import('../components/InventarioTab.jsx'), requiresInventory: true },
  { id: 'impresion',  label: 'Impresora',  icon: Printer,       action: 'configure_printer', load: () => import('../components/PrinterConfigTab.jsx') },
  { id: 'auditoria',  label: 'Auditoría',  icon: ShieldCheck,   action: 'view_reports',      load: () => import('../components/PriceAuditTab.jsx') },
  { id: 'historial',  label: 'Historial',  icon: ClipboardList, action: 'view_reports',      load: () => import('./admin/HistorialTab.jsx') },
]
const PANELS = Object.fromEntries(TABS.map(t => [t.id, lazy(t.load)]))

// Esqueleto mientras llega el módulo de la pestaña: misma silueta que el
// encabezado + tarjetas, para que el contenido no salte al aparecer.
function TabLoader() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <div className="space-y-2">
        <div className="skeleton h-7 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 max-w-full rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-xl" />)}
      </div>
      <span className="sr-only">Cargando sección…</span>
    </div>
  )
}

export default function AdminPage() {
  const { location: authLocation, seller, tenant } = useAuthStore()
  const role = seller?.role
  const hasInventory = Boolean(tenant?.has_inventory)
  const tabs = TABS.filter(t => can(role, t.action) && (!t.requiresInventory || hasInventory))
  const isOwner = can(role, 'view_consolidated')

  // La pestaña vive en la URL (?tab=productos): recargar o compartir el enlace
  // vuelve a la misma sección. Una pestaña sin permiso cae en la primera.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = tabs.some(t => t.id === requested) ? requested : tabs[0]?.id

  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  // Admin: fijo en su punto. Owner: el punto elegido en la barra ('' = consolidado).
  const [locationId,  setLocationId]  = useState(authLocation?.id || '')
  const navRef = useRef(null)

  // La lista de puntos la comparten casi todas las pestañas. Si falla ya no
  // queda vacía en silencio (los selectores aparecían sin opciones).
  const locationsQ = useApi('/locations', { initialData: [] })
  const locations = locationsQ.data || []

  useEffect(() => { if (isOwner) setLocationId(authLocation?.id || '') }, [authLocation?.id, isOwner])

  // En la barra horizontal (móvil/tablet) la pestaña activa siempre a la vista
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  // Cambiar de pestaña deja solo ?tab=: los filtros de una pestaña (p. ej. la
  // búsqueda de Productos) no deben quedar colgados en la URL de otra.
  const handleTabChange = (id) => {
    setSearchParams({ tab: id }, { replace: true })
    window.scrollTo({ top: 0 })
  }

  const Panel = tab ? PANELS[tab] : null
  const panelProps = {
    resumen: {
      from, to, setRange: (f, t) => { setFrom(f); setTo(t) },
      locationId, setLocationId, locations, isOwner,
    },
    vendedores: { locations, isOwner },
    cajas:      { locations },
    locaciones: { locations, onChanged: locationsQ.refetch, isOwner },
    productos:  { hasInventory },
    inventario: { locations, isOwner },
    impresion:  { locations, isOwner },
    auditoria:  { locations, isOwner },
    historial:  { locations },
  }[tab]

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Topbar title="Administración" />

      <div className="flex-1 lg:flex">
        {/* ---- Navegación de secciones ----
            Móvil/tablet: barra horizontal desplazable, fija bajo la barra
            superior (antes era un botón flotante que abría un cajón y tapaba
            el contenido). Desde lg: sidebar fijo a la altura de la ventana. */}
        <nav
          ref={navRef}
          aria-label="Secciones de administración"
          className="sticky top-14 z-30 border-b border-white/5 bg-surface-500/95 backdrop-blur
                     lg:h-[calc(100dvh-3.5rem)] lg:w-56 lg:shrink-0 lg:self-start lg:border-b-0 lg:border-r lg:bg-surface-500 lg:backdrop-blur-none"
        >
          <ul className="flex gap-1 overflow-x-auto px-gutter py-2 scrollbar-hide
                         [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]
                         lg:h-full lg:flex-col lg:overflow-y-auto lg:px-3 lg:py-4 lg:[mask-image:none]">
            {tabs.map(t => {
              const active = tab === t.id
              return (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTabChange(t.id)}
                    // Precarga el módulo de la pestaña antes del clic
                    onPointerEnter={t.load}
                    onFocus={t.load}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-[var(--control-h)] w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors
                      ${active
                        ? 'bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30'
                        : 'text-gray-400 hover:bg-surface-300 hover:text-white'
                      }`}
                  >
                    <t.icon className="h-4 w-4 shrink-0" strokeWidth={2} /> {t.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ---- Contenido: centrado, con tope de ancho y margen fluido ---- */}
        <main className="min-w-0 flex-1">
          <div className="page-container space-y-6 py-6 sm:py-8">
            <ErrorNotice
              error={locationsQ.error}
              title="No se pudieron cargar los puntos de venta"
              onRetry={locationsQ.refetch}
            />
            {Panel && (
              <Suspense fallback={<TabLoader />}>
                <Panel key={tab} {...panelProps} />
              </Suspense>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
