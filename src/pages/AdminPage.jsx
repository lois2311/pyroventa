import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import {
  BarChart3, Users, Monitor, MapPin, PartyPopper, ClipboardList, ShieldCheck, Sliders, Printer, Tag,
  Plus, Check, X, Pencil, Loader2, Package, RefreshCw, Download, TrendingUp, Trophy, Upload, Camera,
  Receipt, StickyNote, Undo2, ChevronDown, UserRound, Store, Trash2,
} from 'lucide-react'
import { useAuthStore }    from '../store/authStore.js'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP, formatDate, formatRangeLabel, formatDayShort, payMethodLabel } from '../lib/format.js'
import Topbar              from '../components/Topbar.jsx'
import Modal               from '../components/Modal.jsx'
import PageHeader, { SectionHeader } from '../components/PageHeader.jsx'
import EmptyState          from '../components/EmptyState.jsx'
import { DailyKpis, PaymentBreakdown } from '../components/DailyMetrics.jsx'
import LocationComparison  from '../components/LocationComparison.jsx'
import SellerStats         from '../components/SellerStats.jsx'
import TopProducts         from '../components/TopProducts.jsx'
import BulkUpload          from '../components/BulkUpload.jsx'
import RegisterComparison  from '../components/RegisterComparison.jsx'
import DateRangeBar, { toISO } from '../components/DateRangeBar.jsx'
import DailyTrend          from '../components/DailyTrend.jsx'
import RevenueTrendChart   from '../components/RevenueTrendChart.jsx'
import CategoryBreakdown   from '../components/CategoryBreakdown.jsx'
import { transferColumns } from '../components/TransferBreakdown.jsx'
import { exportToExcel }   from '../lib/exportExcel.js'
import LocationCatalogModal from '../components/LocationCatalogModal.jsx'
import PriceAuditTab       from '../components/PriceAuditTab.jsx'
import PrinterConfigTab    from '../components/PrinterConfigTab.jsx'
import InventarioTab       from '../components/InventarioTab.jsx'
import { useToast }        from '../components/Toast.jsx'
import { can, ROLE_LABELS, assignableRoles } from '../../api/_lib/roles.js'

// ---- Tabs -----------------------------------------------
const TABS = [
  { id: 'resumen',    label: 'Resumen',    icon: BarChart3,     action: 'view_reports' },
  { id: 'vendedores', label: 'Usuarios',   icon: Users,         action: 'manage_staff' },
  { id: 'cajas',      label: 'Cajas',      icon: Monitor,       action: 'manage_registers' },
  { id: 'locaciones', label: 'Puntos',     icon: MapPin,        action: 'manage_locations' },
  { id: 'productos',  label: 'Productos',  icon: PartyPopper,   action: 'manage_catalog' },
  { id: 'inventario', label: 'Inventario', icon: Package,       action: 'manage_catalog', requiresInventory: true },
  { id: 'impresion',  label: 'Impresora',  icon: Printer,       action: 'configure_printer' },
  { id: 'auditoria',  label: 'Auditoría',  icon: ShieldCheck,   action: 'view_reports' },
  { id: 'historial',  label: 'Historial',  icon: ClipboardList, action: 'view_reports' },
]

export default function AdminPage() {
  const { location: authLocation, seller, tenant } = useAuthStore()
  const role = seller?.role
  const hasInventory = Boolean(tenant?.has_inventory)
  const tabs = TABS.filter(t => can(role, t.action) && (!t.requiresInventory || hasInventory))
  const isOwner = can(role, 'view_consolidated')

  const [tab,         setTab]         = useState('resumen')
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  // Admin: fijo en su punto. Owner: el punto elegido en la barra ('' = consolidado).
  const [locationId,  setLocationId]  = useState(authLocation?.id || '')
  const [locations,   setLocations]   = useState([])
  const navRef = useRef(null)

  useEffect(() => {
    api.get('/locations').then(d => setLocations(d || [])).catch(() => {})
  }, [])

  useEffect(() => { if (isOwner) setLocationId(authLocation?.id || '') }, [authLocation?.id, isOwner])

  // En la barra horizontal (móvil/tablet) la pestaña activa siempre a la vista
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  const handleTabChange = (id) => {
    setTab(id)
    window.scrollTo({ top: 0 })
  }

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
          <div className="page-container py-6 sm:py-8">
            {tab === 'resumen' && (
              <ResumenTab
                from={from}
                to={to}
                setRange={(f, t) => { setFrom(f); setTo(t) }}
                locationId={locationId}
                setLocationId={setLocationId}
                locations={locations}
                isOwner={isOwner}
              />
            )}

            {tab === 'vendedores' && (
              <VendedoresTab locations={locations} isOwner={isOwner} />
            )}

            {tab === 'cajas' && (
              <CajasTab locations={locations} />
            )}

            {tab === 'locaciones' && (
              <LocacionesTab locations={locations} setLocations={setLocations} isOwner={isOwner} />
            )}

            {tab === 'productos' && (
              <ProductosTab hasInventory={hasInventory} />
            )}

            {tab === 'inventario' && (
              <InventarioTab locations={locations} isOwner={isOwner} />
            )}

            {tab === 'impresion' && (
              <PrinterConfigTab locations={locations} isOwner={isOwner} />
            )}

            {tab === 'auditoria' && (
              <PriceAuditTab locations={locations} isOwner={isOwner} />
            )}

            {tab === 'historial' && (
              <HistorialTab locations={locations} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ===========================================================
// TAB: Resumen
// ===========================================================
function ResumenTab({ from, to, setRange, locationId, setLocationId, locations, isOwner }) {
  const [daily,      setDaily]      = useState(null)
  const [sellers,    setSellers]    = useState([])
  const [locCompar,  setLocCompar]  = useState([])
  const [topProds,   setTopProds]   = useState([])
  const [regCompar,  setRegCompar]  = useState([])
  const [byCategory, setByCategory] = useState([])
  const [loadDaily,  setLoadDaily]  = useState(false)
  const [loadSell,   setLoadSell]   = useState(false)
  const [loadLoc,    setLoadLoc]    = useState(false)
  const [loadProds,  setLoadProds]  = useState(false)
  const [loadRegs,   setLoadRegs]   = useState(false)
  const [loadCat,    setLoadCat]    = useState(false)

  const fetchAll = useCallback(() => {
    const locParam = locationId ? `&location_id=${locationId}` : ''
    const q = `?from=${from}&to=${to}${locParam}`

    setLoadDaily(true)
    api.get(`/reports/daily${q}`)
      .then(d => setDaily(d))
      .catch(() => {})
      .finally(() => setLoadDaily(false))

    setLoadSell(true)
    api.get(`/reports/sellers${q}`)
      .then(d => setSellers(d || []))
      .catch(() => {})
      .finally(() => setLoadSell(false))

    if (isOwner) {
      setLoadLoc(true)
      api.get(`/reports/locations?from=${from}&to=${to}`)
        .then(d => setLocCompar(d || []))
        .catch(() => {})
        .finally(() => setLoadLoc(false))
    }

    setLoadProds(true)
    api.get(`/reports/top-products${q}&limit=10`)
      .then(d => setTopProds(d || []))
      .catch(() => {})
      .finally(() => setLoadProds(false))

    setLoadRegs(true)
    api.get(`/reports/registers${q}`)
      .then(d => setRegCompar(d || []))
      .catch(() => {})
      .finally(() => setLoadRegs(false))

    setLoadCat(true)
    api.get(`/reports/by-category${q}`)
      .then(d => setByCategory(d || []))
      .catch(() => {})
      .finally(() => setLoadCat(false))
  }, [from, to, locationId, isOwner])

  const handleExport = () => {
    if (!daily) return
    const sheets = [
      { name: 'Resumen', rows: daily ? [{
          Desde: from, Hasta: to,
          'Total vendido': daily.total_revenue, Facturas: daily.invoice_count,
          'Ticket promedio': Math.round(daily.avg_ticket), Pendientes: daily.pending_count,
          Canceladas: daily.cancelled_count, Efectivo: daily.by_pay_method.cash,
          Transferencia: daily.by_pay_method.transfer, Tarjeta: daily.by_pay_method.card,
          ...transferColumns(daily.by_transfer_provider),
        }] : [] },
      { name: 'Por día', rows: (daily?.by_day || []).map(d => ({
          Día: d.day, Facturas: d.invoice_count, Efectivo: d.cash,
          Transferencia: d.transfer, Tarjeta: d.card, Total: d.total_revenue })) },
      { name: 'Vendedores', rows: sellers.map(s => ({
          Vendedor: s.seller_name, Facturas: s.count, Efectivo: s.by_method.cash,
          Transferencia: s.by_method.transfer, Tarjeta: s.by_method.card, Total: s.total })) },
      { name: 'Cajas', rows: regCompar.map(r => ({
          Caja: r.register_name, Cajero: r.cashier_name || '', Facturas: r.count,
          Efectivo: r.by_method.cash, Transferencia: r.by_method.transfer,
          Tarjeta: r.by_method.card, Total: r.total })) },
      { name: 'Productos', rows: topProds.flatMap(p => p.presentations.map(pr => ({
          Producto: p.product_name, Presentación: pr.label, Cantidad: pr.qty, Total: pr.revenue }))) },
    ]
    exportToExcel(sheets, `pyroventa_${from}_${to}.xlsx`)
  }

  useEffect(() => { fetchAll() }, [fetchAll])

  const anyLoading = loadDaily || loadSell || loadLoc || loadProds || loadRegs || loadCat
  const scopeLabel = locationId
    ? locations.find(l => l.id === locationId)?.name
    : (isOwner ? 'Todos los puntos' : null)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Resumen de ventas"
        description={[formatRangeLabel(from, to), scopeLabel].filter(Boolean).join(' · ')}
        actions={<>
          <button type="button" onClick={fetchAll} disabled={anyLoading} className="btn-outline">
            <RefreshCw className={`h-4 w-4 ${anyLoading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button type="button" onClick={handleExport} disabled={!daily} className="btn-outline">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </>}
      />

      {/* Filtros: una sola fila sobre todo lo que filtran */}
      <div className="toolbar panel p-3 sm:p-4">
        <DateRangeBar from={from} to={to} onChange={setRange} />
        {isOwner && (
          <div className="w-full sm:w-56">
            <label htmlFor="resumen-location" className="field-label">Punto de venta</label>
            <select
              id="resumen-location"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="input"
            >
              <option value="">Todos (consolidado)</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <DailyKpis data={daily} loading={loadDaily} singleDay={from === to} />

      {/* Desgloses lado a lado: por método de pago y por categoría */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <PaymentBreakdown data={daily} loading={loadDaily} className="xl:col-span-2" />
        <CategoryBreakdown data={byCategory} loading={loadCat} className="xl:col-span-3" />
      </div>

      {daily?.by_day?.length > 1 && (
        <section>
          <SectionHeader title="Ventas por día" icon={TrendingUp} description={formatRangeLabel(from, to)} />
          <div className="space-y-3">
            <RevenueTrendChart data={daily.by_day} loading={loadDaily} />
            <DailyTrend data={daily.by_day} />
          </div>
        </section>
      )}

      {/* Rankings lado a lado en desktop, apilados en móvil */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        <section>
          <SectionHeader title="Top productos" icon={Trophy} />
          <TopProducts data={topProds} loading={loadProds} />
        </section>

        <section>
          <SectionHeader title="Top vendedores" icon={UserRound} description="Toca un vendedor para ver su detalle" />
          <SellerStats data={sellers} loading={loadSell} from={from} to={to} locationId={locationId} />
        </section>
      </div>

      <section>
        <SectionHeader title="Rendimiento por caja" icon={Monitor} />
        <RegisterComparison data={regCompar} loading={loadRegs} from={from} to={to} locationId={locationId} />
      </section>

      {isOwner && !locationId && (
        <section>
          <SectionHeader title="Comparativa de puntos de venta" icon={Store} />
          <LocationComparison data={locCompar} loading={loadLoc} />
        </section>
      )}
    </div>
  )
}

// ===========================================================
// Piezas compartidas por las pestañas de gestión
// ===========================================================

/** Iniciales en círculo: identifica a la persona sin depender de una foto. */
function Initials({ name }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-50 text-sm font-semibold text-gray-300">
      {initials}
    </span>
  )
}

/** Grilla de tarjetas de las pestañas de gestión: 1 → 2 → 3 columnas. */
const CARD_GRID = 'grid gap-3 sm:grid-cols-2 2xl:grid-cols-3'

function SkeletonGrid({ count = 3, height = 'h-32' }) {
  return (
    <div className={CARD_GRID}>
      {Array.from({ length: count }).map((_, i) => <div key={i} className={`skeleton rounded-xl ${height}`} />)}
    </div>
  )
}

// ===========================================================
// TAB: Vendedores
// ===========================================================
function VendedoresTab({ locations, isOwner }) {
  const { error: toastError } = useToast()
  const { seller: me } = useAuthStore()
  const [sellers,   setSellers]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editSeller,setEditSeller]= useState(null)

  const fetch = () => {
    setLoading(true)
    api.get('/sellers')
      .then(d => setSellers(d || []))
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetch, [])

  const handleToggle = async (s) => {
    try {
      await api.put(`/sellers/${s.id}`, { active: !s.active })
      fetch()
    } catch (err) { toastError(err.message) }
  }

  const activeCount = sellers.filter(s => s.active).length
  const locNames = (s) => (s.seller_locations || [])
    .map(sl => locations.find(l => l.id === sl.location_id)?.name).filter(Boolean).join(', ')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description={loading ? 'Cargando…' : `${sellers.length} usuario${sellers.length !== 1 ? 's' : ''} · ${activeCount} activo${activeCount !== 1 ? 's' : ''}`}
        actions={
          <button type="button" onClick={() => { setEditSeller(null); setShowForm(true) }} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo usuario
          </button>
        }
      />

      {loading ? (
        <SkeletonGrid count={6} height="h-28" />
      ) : sellers.length === 0 ? (
        <EmptyState icon={Users} title="Aún no hay usuarios" description="Crea vendedores, cajeros y administradores para empezar a operar." />
      ) : (
        <ul className={CARD_GRID}>
          {sellers.map(s => (
            <li key={s.id} className="card flex flex-col gap-3 bg-surface-300">
              <div className="flex items-start gap-3">
                <Initials name={s.name} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${s.active ? 'text-white' : 'text-gray-400 line-through'}`}>{s.name}</p>
                  <p className="truncate text-xs text-gray-400">
                    {ROLE_LABELS[s.role]}
                    {s.username && <> · <span className="font-mono">{s.username}</span></>}
                  </p>
                </div>
                {!s.active && <span className="badge-cancelled shrink-0">Inactivo</span>}
              </div>

              {isOwner && s.role !== 'owner' && (
                <p className="flex items-start gap-1.5 text-xs text-gray-400">
                  <MapPin className="mt-px h-3.5 w-3.5 shrink-0" />
                  <span>{locNames(s) || 'Sin punto'}</span>
                </p>
              )}

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                <button type="button" onClick={() => { setEditSeller(s); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                {s.id !== me?.id && (
                  <button type="button" onClick={() => handleToggle(s)} className={`btn-ghost btn-sm btn-touch-safe ${s.active ? 'text-yellow-500' : 'text-green-500'}`}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <SellerForm
          seller={editSeller}
          locations={locations}
          onClose={() => setShowForm(false)}
          onSave={() => { fetch(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function SellerForm({ seller, locations, onClose, onSave }) {
  const { error: toastError } = useToast()
  const { seller: me } = useAuthStore()
  const fid = useId()
  const roleOptions = [...new Set([...assignableRoles(me?.role), ...(seller?.role ? [seller.role] : [])])]
  const isSelf = seller?.id === me?.id

  const [name,     setName]     = useState(seller?.name || '')
  const [role,     setRole]     = useState(seller?.role || 'seller')
  const [pin,      setPin]      = useState('')
  const [username, setUsername] = useState(seller?.username || '')
  const [password, setPassword] = useState('')
  const [locIds,   setLocIds]   = useState((seller?.seller_locations || []).map(sl => sl.location_id))
  const [saving,   setSaving]   = useState(false)

  const usesPassword = role === 'admin' || role === 'owner'
  const needsLocations = role !== 'owner'
  const singleLocation = role === 'admin'
  // El admin solo tiene su punto: se asigna solo, sin mostrar selección
  const showLocations = needsLocations && locations.length > 1

  const toggleLoc = (lid) => setLocIds(prev =>
    singleLocation ? [lid] : prev.includes(lid) ? prev.filter(x => x !== lid) : [...prev, lid])

  const handleRoleChange = (newRole) => {
    setRole(newRole)
    if (newRole === 'admin') {
      setLocIds(prev => prev.length > 1 ? [prev[0]] : prev)
    } else if (newRole === 'owner') {
      setLocIds([])
    }
  }

  const needsNewPin = !usesPassword && !seller?.has_pin
  const needsNewPass = usesPassword && !seller?.has_password

  const handleSave = async () => {
    if (!name.trim()) return toastError('El nombre es requerido')
    if (usesPassword && needsNewPass && password.length < 10) {
      return toastError('La contraseña debe tener al menos 10 caracteres')
    }
    if (usesPassword && (!seller || username !== (seller?.username || '')) && username.trim().length < 3) {
      return toastError('El usuario debe tener al menos 3 caracteres')
    }
    if (!usesPassword && needsNewPin && pin.length !== 4) {
      return toastError('PIN de 4 dígitos requerido')
    }
    if (!usesPassword && pin && pin.length !== 4) {
      return toastError('PIN de 4 dígitos requerido')
    }
    if (needsLocations && !isSelf && locations.length > 1 && locIds.length === 0) {
      return toastError('Asigna al menos un punto de venta')
    }
    const body = { name: name.trim() }
    if (!isSelf) body.role = role
    if (usesPassword) {
      if (username !== (seller?.username || '')) body.username = username
      if (password) body.password = password
    } else if (pin) {
      body.pin = pin
    }
    if (!isSelf && needsLocations) {
      body.location_ids = locations.length === 1 ? [locations[0].id] : locIds
    }
    setSaving(true)
    try {
      if (seller?.id) await api.put(`/sellers/${seller.id}`, body)
      else            await api.post('/sellers', body)
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={seller ? 'Editar usuario' : 'Nuevo usuario'}
      icon={seller ? Pencil : Users}
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      <div>
        <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
        <input id={`${fid}-name`} placeholder="Nombre y apellido" value={name} onChange={e => setName(e.target.value)} className="input" />
      </div>

      <div>
        <label htmlFor={`${fid}-role`} className="field-label">Rol</label>
        <select id={`${fid}-role`} value={role} onChange={e => handleRoleChange(e.target.value)} className="input" disabled={isSelf}>
          {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        {isSelf && <p className="field-hint">No puedes cambiar tu propio rol.</p>}
      </div>

      {usesPassword ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fid}-user`} className="field-label">Usuario</label>
            <input id={`${fid}-user`} placeholder="ej: admin.norte" value={username} autoComplete="off" autoCapitalize="none"
              onChange={e => setUsername(e.target.value.toLowerCase())} className="input font-mono" />
          </div>
          <div>
            <label htmlFor={`${fid}-pass`} className="field-label">{needsNewPass ? 'Contraseña' : 'Nueva contraseña'}</label>
            <input id={`${fid}-pass`} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={needsNewPass ? 'Mínimo 10 caracteres' : 'Vacío = no cambiar'}
              className="input" />
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor={`${fid}-pin`} className="field-label">{needsNewPin ? 'PIN' : 'Nuevo PIN'}</label>
          <input id={`${fid}-pin`} placeholder={needsNewPin ? '4 dígitos' : 'Vacío = no cambiar'} maxLength={4} value={pin}
            inputMode="numeric" onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="input font-mono sm:w-40" />
        </div>
      )}

      {showLocations && !isSelf && (
        <fieldset>
          <legend className="field-label">{singleLocation ? 'Punto de venta que administra' : 'Puntos de venta asignados'}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {locations.map(l => (
              <label key={l.id} className="flex min-h-[var(--control-h)] cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-surface-300 px-3 has-[:checked]:border-brand-500/50 has-[:checked]:bg-brand-500/10">
                <input type={singleLocation ? 'radio' : 'checkbox'} name="seller-locs"
                  checked={locIds.includes(l.id)} onChange={() => toggleLoc(l.id)} className="accent-brand-500" />
                <span className="text-sm text-gray-300">{l.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {role === 'owner' && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          El superadministrador ve y administra todos los puntos de la empresa.
        </p>
      )}
    </Modal>
  )
}

// ===========================================================
// TAB: Puntos de venta
// ===========================================================
function LocacionesTab({ locations, setLocations, isOwner }) {
  const { error: toastError } = useToast()
  const [showForm,   setShowForm]   = useState(false)
  const [editLoc,    setEditLoc]    = useState(null)
  const [catalogLoc, setCatalogLoc] = useState(null)

  const reload = () =>
    api.get('/locations').then(d => setLocations(d || [])).catch(() => {})

  const handleToggle = async (loc) => {
    try {
      await api.put(`/locations/${loc.id}`, { active: !loc.active })
      reload()
    } catch (err) { toastError(err.message) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Puntos de venta"
        description={`${locations.length} punto${locations.length !== 1 ? 's' : ''} de venta`}
        actions={isOwner && (
          <button type="button" onClick={() => { setEditLoc(null); setShowForm(true) }} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo punto
          </button>
        )}
      />

      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="Sin puntos de venta" description="Crea el primero para que el personal pueda iniciar sesión." />
      ) : (
        <ul className={CARD_GRID}>
          {locations.map(loc => (
            <li key={loc.id} className="card flex flex-col gap-3 bg-surface-300">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${loc.active ? 'text-white' : 'text-gray-400 line-through'}`}>{loc.name}</p>
                  {loc.address && <p className="truncate text-xs text-gray-400">{loc.address}</p>}
                  {loc.printer_config?.paper_width && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                      <Printer className="h-3 w-3" /> Papel {loc.printer_config.paper_width}
                    </p>
                  )}
                </div>
                {!loc.active && <span className="badge-cancelled shrink-0">Inactivo</span>}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => setCatalogLoc(loc)}
                    className="btn-ghost btn-sm btn-touch-safe text-brand-400 hover:text-brand-300"
                    title="Configurar precios diferenciales y productos habilitados (Superadmin)"
                  >
                    <Sliders className="h-3.5 w-3.5" /> Precios y catálogo
                  </button>
                )}
                <button type="button" onClick={() => { setEditLoc(loc); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                {isOwner && (
                  <button type="button" onClick={() => handleToggle(loc)} className="btn-ghost btn-sm btn-touch-safe text-yellow-500">
                    {loc.active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {catalogLoc && (
        <LocationCatalogModal
          location={catalogLoc}
          onClose={() => setCatalogLoc(null)}
          onSaved={() => reload()}
        />
      )}

      {showForm && (
        <LocationForm
          location={editLoc}
          onClose={() => setShowForm(false)}
          onSave={() => { reload(); setShowForm(false) }}
          isOwner={isOwner}
        />
      )}
    </div>
  )
}

function LocationForm({ location, onClose, onSave, isOwner }) {
  const { error: toastError } = useToast()
  const fid = useId()
  const [name,   setName]   = useState(location?.name || '')
  const [addr,   setAddr]   = useState(location?.address || '')
  const [width,  setWidth]  = useState(location?.printer_config?.paper_width || '80mm')
  const [qz,     setQz]     = useState(location?.printer_config?.use_qz_tray ?? false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name) return toastError('El nombre es requerido')
    setSaving(true)
    const printer_config = {
      paper_width:    width,
      chars_per_line: width === '80mm' ? 48 : 32,
      use_qz_tray:    qz,
      header_lines:   ['PIROTÉCNICA LA CHISPA', addr || name],
      footer_lines:   ['¡Gracias por su compra!', 'Manipule con responsabilidad'],
    }
    try {
      if (location?.id) {
        await api.put(`/locations/${location.id}`, isOwner ? { name, address: addr, printer_config } : { printer_config })
      } else {
        await api.post('/locations', { name, address: addr, printer_config })
      }
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={location ? 'Editar punto de venta' : 'Nuevo punto de venta'}
      icon={MapPin}
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      <div>
        <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
        <input id={`${fid}-name`} placeholder="Ej: Local Principal, Stand Norte" value={name} onChange={e => setName(e.target.value)} className="input" disabled={!isOwner} />
      </div>
      <div>
        <label htmlFor={`${fid}-addr`} className="field-label">Dirección <span className="font-normal">(opcional)</span></label>
        <input id={`${fid}-addr`} placeholder="Calle, número, barrio" value={addr} onChange={e => setAddr(e.target.value)} className="input" disabled={!isOwner} />
      </div>
      <div>
        <label htmlFor={`${fid}-width`} className="field-label">Ancho del papel</label>
        <select id={`${fid}-width`} value={width} onChange={e => setWidth(e.target.value)} className="input">
          <option value="80mm">80mm (48 caracteres)</option>
          <option value="58mm">58mm (32 caracteres)</option>
        </select>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5">
        <input type="checkbox" checked={qz} onChange={e => setQz(e.target.checked)} className="h-4 w-4 accent-brand-500" />
        <span className="text-sm text-gray-300">Usar QZ Tray para impresión térmica</span>
      </label>
    </Modal>
  )
}

// ===========================================================
// TAB: Productos
// ===========================================================
function ProductosTab({ hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const [products,  setProducts]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editProd,  setEditProd]  = useState(null)
  const [showBulk,  setShowBulk]  = useState(false)

  const fetch = () => {
    setLoading(true)
    // include_inactive: sin esto, desactivar un producto lo hacía desaparecer de
    // esta lista y el botón "Activar" quedaba inalcanzable.
    api.get('/products?include_inactive=1')
      .then(d => setProducts(d || []))
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetch, [])

  const handleToggle = async (p) => {
    try {
      await api.put(`/products/${p.id}`, { active: !p.active })
      clearProductsCache() // que el POS deje de ofrecerlo sin esperar el TTL
      fetch()
    } catch (err) { toastError(err.message) }
  }

  const handleDelete = async (p) => {
    const msg = `¿Eliminar "${p.name}" definitivamente?\n\n` +
      'Se borran también sus presentaciones y su foto. No se puede deshacer.\n' +
      'El histórico de facturas no se ve afectado.'
    if (!window.confirm(msg)) return
    try {
      await api.post('/products/bulk-delete', { ids: [p.id], hard: true })
      clearProductsCache()
      toastSuccess(`"${p.name}" eliminado`)
      fetch()
    } catch (err) { toastError(err.message) }
  }

  const inactiveCount = products.filter(p => !p.active).length
  const openNew = () => { setEditProd(null); setShowForm(true) }

  if (showBulk) {
    return (
      <div className="max-w-3xl space-y-4">
        <BulkUpload onDone={() => { setShowBulk(false); fetch() }} onProductsChanged={fetch} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description={loading ? 'Cargando…' : `${products.length} en el catálogo${inactiveCount > 0 ? ` · ${inactiveCount} inactivo${inactiveCount !== 1 ? 's' : ''}` : ''}`}
        actions={<>
          <button type="button" onClick={() => setShowBulk(true)} className="btn-outline">
            <Upload className="h-4 w-4" /> Carga y borrado masivo
          </button>
          <button type="button" onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </>}
      />

      {loading ? (
        <SkeletonGrid count={6} height="h-36" />
      ) : products.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title="El catálogo está vacío"
          description="Crea un producto a mano o impórtalos todos desde un Excel."
          action={<>
            <button type="button" onClick={() => setShowBulk(true)} className="btn-outline">
              <Upload className="h-4 w-4" /> Importar desde Excel
            </button>
            <button type="button" onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Nuevo producto
            </button>
          </>}
        />
      ) : (
        <ul className={CARD_GRID}>
          {products.map(p => (
            <li key={p.id} className={`card flex flex-col gap-3 bg-surface-300 ${!p.active ? 'border-dashed' : ''}`}>
              <div className={`flex items-start gap-3 ${!p.active ? 'opacity-60' : ''}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-50 text-xl">
                    {p.categories?.icon || '🎆'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-white">{p.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                    <Tag className="h-3 w-3 shrink-0 text-gray-500" />
                    <span className="truncate">{p.categories?.name || 'Sin categoría'}</span>
                  </p>
                </div>
                {!p.active && <span className="badge-pending shrink-0">Inactivo</span>}
              </div>

              <div className={`flex flex-wrap gap-1 ${!p.active ? 'opacity-60' : ''}`}>
                {hasInventory && p.stock_quantity !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium ${p.stock_quantity <= 0 ? 'bg-red-500/15 text-red-400' : p.stock_quantity <= 5 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    <Package className="h-3 w-3" /> Stock: {p.stock_quantity}
                  </span>
                )}
                {(p.presentations || []).map(pr => (
                  <span key={pr.id} className="rounded-full bg-surface-50 px-2 py-0.5 text-xs text-gray-300">
                    {pr.label} · <span className="font-mono">{formatCOP(pr.price)}</span>
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                <button type="button" onClick={() => { setEditProd(p); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(p)}
                  className="btn-ghost btn-sm btn-touch-safe text-yellow-500"
                  title={p.active ? 'Se oculta del POS, se puede reactivar' : 'Vuelve a estar disponible en el POS'}
                >
                  {p.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="btn-ghost btn-sm btn-touch-safe ml-auto text-gray-400 hover:text-red-400"
                  title="Eliminar definitivamente"
                  aria-label={`Eliminar ${p.name} definitivamente`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <ProductForm
          product={editProd}
          hasInventory={hasInventory}
          onClose={() => setShowForm(false)}
          onSave={() => { fetch(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function ProductForm({ product, onClose, onSave, hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const fid = useId()
  const [name,          setName]          = useState(product?.name || '')
  const [catId,         setCatId]         = useState(product?.category_id || product?.categories?.id || '')
  const [desc,          setDesc]          = useState(product?.description || '')
  const [stock,         setStock]         = useState(product?.stock_quantity !== undefined ? String(product.stock_quantity) : '')
  const [presentations, setPresentations] = useState(
    (product?.presentations || []).map(p => ({ label: p.label, price: String(p.price) }))
  )
  const [saving, setSaving] = useState(false)
  // Foto: url existente, File nuevo pendiente de subir, o null explícito (quitar)
  const [imageUrl,  setImageUrl]  = useState(product?.image_url || null)
  const [imageFile, setImageFile] = useState(null)
  const photoRef = useRef(null)

  // Categorías
  const [categories,  setCategories]  = useState([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [showNewCat,  setShowNewCat]  = useState(false)
  const [newCatName,  setNewCatName]  = useState('')
  const [savingCat,   setSavingCat]   = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/categories')
      .then(d => {
        if (mounted && Array.isArray(d)) setCategories(d)
      })
      .catch(() => {
        if (mounted && product?.categories) {
          setCategories([product.categories])
        }
      })
      .finally(() => {
        if (mounted) setLoadingCats(false)
      })
    return () => { mounted = false }
  }, [product])

  const handleCreateCategory = async (e) => {
    e?.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setSavingCat(true)
    try {
      const created = await api.post('/categories', { name: trimmed })
      if (created?.id) {
        setCategories(prev => {
          if (prev.some(c => c.id === created.id)) return prev
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        })
        setCatId(created.id)
        setNewCatName('')
        setShowNewCat(false)
        toastSuccess?.(`Categoría "${created.name}" creada`)
      }
    } catch (err) {
      toastError(err.message || 'Error al crear la categoría')
    } finally {
      setSavingCat(false)
    }
  }

  const filePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile])
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview])
  const photoPreview = filePreview || imageUrl

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (file) setImageFile(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  const removePhoto = () => { setImageFile(null); setImageUrl(null) }

  const addPres = () => setPresentations(p => [...p, { label: '', price: '' }])
  const updatePres = (i, field, val) => setPresentations(p =>
    p.map((pr, idx) => idx === i ? { ...pr, [field]: val } : pr)
  )
  const removePres = (i) => setPresentations(p => p.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name.trim()) return toastError('El nombre es requerido')
    if (presentations.some(p => !p.label || !p.price)) return toastError('Completa todas las presentaciones')
    setSaving(true)
    const presToSave = presentations.map(p => ({ label: p.label, price: Number(p.price) }))
    try {
      let finalImageUrl = imageUrl
      if (imageFile) {
        const { uploadProductImage } = await import('../lib/imageCompress.js')
        finalImageUrl = await uploadProductImage(imageFile)
      }
      const body = {
        name: name.trim(),
        category_id: catId || null,
        description: desc.trim() || null,
        presentations: presToSave,
        ...(hasInventory && stock !== '' && !isNaN(Number(stock)) ? { stock: Math.max(0, parseInt(stock, 10)) } : {}),
      }
      // Solo enviar image_url si cambió (evita tocar la columna en BDs sin la migración)
      if (finalImageUrl !== (product?.image_url ?? null)) body.image_url = finalImageUrl
      if (product?.id) {
        await api.put(`/products/${product.id}`, body)
      } else {
        await api.post('/products', body)
      }
      clearProductsCache() // que el POS vea el cambio sin esperar el TTL
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={product ? 'Editar producto' : 'Nuevo producto'}
      icon={product ? Pencil : PartyPopper}
      size="lg"
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      {/* Foto + nombre: lo primero que identifica al producto */}
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {photoPreview ? (
            <img src={photoPreview} alt={`Foto de ${name || 'producto'}`} className="h-20 w-20 rounded-xl border border-white/10 object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-white/15 bg-surface-400 text-2xl">🎆</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
            <input id={`${fid}-name`} placeholder="Nombre del producto" value={name} onChange={e => setName(e.target.value)} className="input" />
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-outline btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-500">
              <Camera className="h-3.5 w-3.5" /> {photoPreview ? 'Cambiar foto' : 'Agregar foto'}
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
            </label>
            {photoPreview && (
              <button type="button" onClick={removePhoto} className="btn-ghost btn-sm text-gray-400 hover:text-red-400">
                Quitar foto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Categoría, con opción de crear una nueva sin salir del formulario */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={`${fid}-cat`} className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <Tag className="h-3.5 w-3.5 text-brand-400" />
            Categoría
          </label>
          {!showNewCat && (
            <button
              type="button"
              onClick={() => setShowNewCat(true)}
              className="flex items-center gap-1 text-xs text-brand-400 transition-colors hover:text-brand-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva categoría
            </button>
          )}
        </div>

        {showNewCat ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Nombre de la nueva categoría..."
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
              className="input flex-1"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={savingCat || !newCatName.trim()}
              className="btn-primary"
              title="Crear categoría"
            >
              {savingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Crear</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowNewCat(false); setNewCatName('') }}
              disabled={savingCat}
              className="btn-ghost btn-icon text-gray-400 hover:text-white"
              aria-label="Cancelar nueva categoría"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <select
            id={`${fid}-cat`}
            value={catId}
            onChange={e => setCatId(e.target.value)}
            className="input cursor-pointer"
            disabled={loadingCats}
          >
            <option value="">(Sin categoría)</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={hasInventory ? 'grid gap-4 sm:grid-cols-[1fr_9rem]' : ''}>
        <div>
          <label htmlFor={`${fid}-desc`} className="field-label">Descripción <span className="font-normal">(opcional)</span></label>
          <input id={`${fid}-desc`} placeholder="Detalle corto para el vendedor" value={desc} onChange={e => setDesc(e.target.value)} className="input" />
        </div>

        {hasInventory && (
          <div>
            <label htmlFor={`${fid}-stock`} className="field-label" title={product ? 'Actualizar existencias' : 'Inventario inicial'}>
              {product ? 'Stock disponible' : 'Stock inicial'}
            </label>
            <input
              id={`${fid}-stock`}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Ej: 50"
              value={stock}
              onChange={e => setStock(e.target.value)}
              className="input font-mono"
            />
          </div>
        )}
      </div>

      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-xs font-medium text-gray-400">Presentaciones y precios</legend>
          <button type="button" onClick={addPres} className="btn-ghost btn-sm text-brand-400">
            <Plus className="h-3.5 w-3.5" />
            <span>Agregar</span>
          </button>
        </div>
        {presentations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-gray-400">
            Sin presentaciones. Agrega al menos una (Unidad, Pack x12…) con su precio.
          </p>
        ) : (
          <div className="space-y-2">
            {presentations.map((pr, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Ej: Unidad, Pack x12"
                  aria-label={`Presentación ${i + 1}`}
                  value={pr.label}
                  onChange={e => updatePres(i, 'label', e.target.value)}
                  className="input flex-1"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Precio"
                  aria-label={`Precio de la presentación ${i + 1}`}
                  value={pr.price}
                  onChange={e => updatePres(i, 'price', e.target.value)}
                  className="input w-28 font-mono sm:w-32"
                />
                <button type="button" onClick={() => removePres(i)} className="btn-ghost btn-icon text-gray-400 hover:text-red-400" aria-label={`Eliminar presentación ${i + 1}`}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </Modal>
  )
}

// ===========================================================
// TAB: Cajas / Registradoras
// ===========================================================
function CajasTab({ locations }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const [registers,  setRegisters]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showForm,   setShowForm]   = useState(false)
  const [editReg,    setEditReg]    = useState(null)

  const fetch = () => {
    setLoading(true)
    api.get('/registers')
      .then(d => setRegisters(d || []))
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetch, [])

  const handleDelete = async (reg) => {
    if (!window.confirm(`¿Desactivar ${reg.name}?`)) return
    try {
      await api.delete(`/registers/${reg.id}`)
      fetch()
      toastSuccess('Caja desactivada')
    } catch (err) { toastError(err.message) }
  }

  // Agrupar por location
  const byLocation = {}
  registers.forEach(r => {
    const locName = locations.find(l => l.id === r.location_id)?.name || 'Sin punto'
    if (!byLocation[r.location_id]) byLocation[r.location_id] = { name: locName, regs: [] }
    byLocation[r.location_id].regs.push(r)
  })

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <PageHeader
          title="Cajas registradoras"
          description="Una caja por cada registradora física. Los cobros y cierres quedan asociados a ella."
          actions={
            <button type="button" onClick={() => { setEditReg(null); setShowForm(true) }} className="btn-primary">
              <Plus className="h-4 w-4" /> Nueva caja
            </button>
          }
        />

        {loading ? (
          <SkeletonGrid count={3} height="h-16" />
        ) : registers.length === 0 ? (
          <EmptyState icon={Monitor} title="No hay cajas registradas" description="Crea una caja para cada registradora física de tu negocio." />
        ) : (
          Object.entries(byLocation).map(([locId, group]) => (
            <section key={locId} aria-label={group.name}>
              <p className="eyebrow mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {group.name}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.regs.map(reg => (
                  <li key={reg.id} className="card flex items-center gap-3 bg-surface-300 py-3 sm:py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-50 text-gray-400">
                      <Monitor className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{reg.name}</p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => { setEditReg(reg); setShowForm(true) }}
                        className="btn-ghost btn-sm btn-touch-safe"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(reg)}
                        className="btn-ghost btn-sm btn-touch-safe text-red-400"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {showForm && (
        <RegisterForm
          register={editReg}
          locations={locations}
          onClose={() => setShowForm(false)}
          onSave={() => { fetch(); setShowForm(false) }}
        />
      )}

      <ClosuresSection locations={locations} />
    </div>
  )
}

// ---- Cierres de caja (arqueos) ---------------------------
function ClosuresSection({ locations }) {
  const { error: toastError } = useToast()
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locFilter, setLocFilter] = useState('')
  const [closures, setClosures] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams({ from, to })
    if (locFilter) params.set('location_id', locFilter)
    api.get(`/closures?${params.toString()}`)
      .then(d => setClosures(d || []))
      .catch(err => { setClosures([]); toastError(err.message) })
  }, [from, to, locFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const locName = (id) => locations.find(l => l.id === id)?.name || ''

  return (
    <section className="space-y-4 border-t border-white/5 pt-8">
      <SectionHeader
        title="Cierres de caja"
        icon={Receipt}
        description="Arqueos registrados por las cajeras desde la pantalla de Caja."
      />
      <div className="toolbar panel p-3 sm:p-4">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        {locations.length > 1 && (
          <div className="w-full sm:w-48">
            <label htmlFor="closures-location" className="field-label">Punto de venta</label>
            <select id="closures-location" value={locFilter} onChange={e => setLocFilter(e.target.value)} className="input">
              <option value="">Todos</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!closures ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : closures.length === 0 ? (
        <EmptyState
          compact
          icon={Receipt}
          title="Sin cierres en el rango"
          description="La cajera cierra su caja desde la pantalla de Caja (botón Cerrar caja)."
        />
      ) : (
        <ul className="panel divide-y divide-white/5 overflow-hidden">
          {closures.map(c => {
            const diff = Number(c.difference)
            return (
              <li key={c.id} className="px-4 py-3 sm:px-5">
                <div className="grid grid-cols-3 items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7.5rem]">
                  <div className="col-span-3 min-w-0 sm:col-span-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-white">
                      <Monitor className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {c.register_name || 'Sin caja'}
                    </p>
                    <p className="truncate text-2xs text-gray-400">
                      {formatDayShort(c.business_date, { weekday: true })} · {locName(c.location_id)} · {c.cashier_name}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-2xs text-gray-400">Esperado</p>
                    <p className="font-mono text-xs tabular-nums text-gray-300">{formatCOP(c.expected_cash)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-2xs text-gray-400">Contado</p>
                    <p className="font-mono text-xs tabular-nums text-white">{formatCOP(c.declared_cash)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-gray-400">Diferencia</p>
                    <p className={`font-mono text-sm font-bold tabular-nums ${diff === 0 ? 'text-green-400' : diff > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {diff > 0 ? '+' : ''}{formatCOP(diff)}
                    </p>
                  </div>
                </div>
                {c.notes && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs italic text-gray-400">
                    <StickyNote className="mt-px h-3.5 w-3.5 shrink-0" /> {c.notes}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RegisterForm({ register, locations, onClose, onSave }) {
  const { error: toastError } = useToast()
  const fid = useId()
  const [name,       setName]       = useState(register?.name || '')
  const [locationId, setLocationId] = useState(register?.location_id || locations[0]?.id || '')
  const [saving,     setSaving]     = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return toastError('Nombre requerido')
    if (!locationId) return toastError('Selecciona un punto de venta')
    setSaving(true)
    try {
      if (register?.id) {
        await api.put(`/registers/${register.id}`, { name: name.trim() })
      } else {
        await api.post('/registers', { name: name.trim(), location_id: locationId })
      }
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal
      title={register ? 'Editar caja' : 'Nueva caja'}
      icon={Monitor}
      size="sm"
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      <div>
        <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
        <input
          id={`${fid}-name`}
          placeholder="Ej: Caja 1, Caja Principal"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          autoFocus
        />
      </div>
      {!register && locations.length > 1 && (
        <div>
          <label htmlFor={`${fid}-loc`} className="field-label">Punto de venta</label>
          <select id={`${fid}-loc`} value={locationId} onChange={e => setLocationId(e.target.value)} className="input">
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      )}
    </Modal>
  )
}

// ===========================================================
// TAB: Historial de facturas
// ===========================================================
const STATUS_STYLES = {
  pending:   'badge-pending',
  paid:      'badge-paid',
  cancelled: 'badge-cancelled',
  refunded:  'badge-cancelled',
}
const STATUS_LABEL = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada', refunded: 'Devuelta' }

// Columnas de la fila de factura en desktop: todas las filas alinean igual
const INVOICE_ROW_COLS = 'xl:grid xl:grid-cols-[4.5rem_minmax(0,1fr)_6.5rem_9rem_7.5rem_8.5rem_1rem] xl:items-center xl:gap-4'

function HistorialTab({ locations }) {
  const { error: toastError } = useToast()
  const [invoices,   setInvoices]   = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locFilter,  setLocFilter]  = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [expanded,   setExpanded]   = useState(null)

  const handleRefund = async (inv) => {
    const reason = window.prompt(`Motivo de la devolución de la factura #${inv.code} (${formatCOP(inv.total)}):`)
    if (reason === null) return
    if (!reason.trim()) return toastError('El motivo es requerido')
    try {
      await api.post(`/invoices/${inv.id}/refund`, { reason: reason.trim() })
      fetchInvoices()
    } catch (err) { toastError(err.message) }
  }

  const fetchInvoices = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ from, to })
    if (locFilter)  params.set('location_id', locFilter)
    if (statusFilt) params.set('status', statusFilt)
    params.set('limit', '100')

    api.get(`/invoices/history?${params.toString()}`)
      .then(data => {
        setInvoices(data.invoices || [])
        setTotal(data.total || 0)
      })
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }, [from, to, locFilter, statusFilt])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de facturas"
        description={`${formatRangeLabel(from, to)} · ${total} factura${total !== 1 ? 's' : ''}`}
        actions={
          <button type="button" onClick={fetchInvoices} disabled={loading} className="btn-outline">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        }
      />

      <div className="toolbar panel p-3 sm:p-4">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        {locations.length > 1 && (
          <div className="w-full sm:w-48">
            <label htmlFor="history-location" className="field-label">Punto de venta</label>
            <select id="history-location" value={locFilter} onChange={e => setLocFilter(e.target.value)} className="input">
              <option value="">Todos</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div className="w-full sm:w-40">
          <label htmlFor="history-status" className="field-label">Estado</label>
          <select id="history-status" value={statusFilt} onChange={e => setStatusFilt(e.target.value)} className="input">
            <option value="">Todos</option>
            <option value="paid">Pagadas</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Canceladas</option>
            <option value="refunded">Devueltas</option>
          </select>
        </div>
      </div>

      {loading && !invoices.length ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : invoices.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin facturas para los filtros seleccionados" description="Prueba con otro rango de fechas o estado." />
      ) : (
        <div className={`panel overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Encabezado de columnas (solo pantallas anchas) */}
          <div className={`hidden border-b border-white/5 px-5 py-2.5 text-2xs font-medium uppercase tracking-wider text-gray-400 ${INVOICE_ROW_COLS}`}>
            <span>Código</span>
            <span>Vendedor · punto</span>
            <span>Estado</span>
            <span>Método</span>
            <span className="text-right">Total</span>
            <span className="text-right">Fecha</span>
            <span />
          </div>

          <ul className="divide-y divide-white/5">
            {invoices.map(inv => {
              const open = expanded === inv.id
              return (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : inv.id)}
                    aria-expanded={open}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03] sm:px-5 ${open ? 'bg-white/[0.03]' : ''}`}
                  >
                    <div className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 ${INVOICE_ROW_COLS}`}>
                      <span className="font-mono text-base font-bold text-brand-400">#{inv.code}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-white">{inv.seller_name}</p>
                        <p className="truncate text-xs text-gray-400">
                          {inv.location_name}
                          {inv.register_name && <span> · {inv.register_name}</span>}
                          {inv.cashier_name && inv.cashier_name !== inv.seller_name && <span> · Cajero: {inv.cashier_name}</span>}
                        </p>
                      </div>
                      <span className="justify-self-end xl:justify-self-start">
                        <span className={STATUS_STYLES[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                      </span>
                      <span className="col-span-2 truncate text-xs text-gray-400 xl:col-span-1">
                        {inv.pay_method ? payMethodLabel(inv.pay_method, inv.transfer_provider) : '—'}
                      </span>
                      <span className="text-right font-mono text-sm font-semibold tabular-nums text-white">{formatCOP(inv.total)}</span>
                      <span className="col-span-3 text-xs text-gray-400 xl:col-span-1 xl:text-right">
                        {formatDate(inv.created_at)}
                      </span>
                      <ChevronDown className={`hidden h-4 w-4 text-gray-500 transition-transform xl:block ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </div>
                  </button>

                  {/* Detalle expandido */}
                  {open && (
                    <div className="animate-fade-in border-t border-white/5 bg-surface-400/60 px-4 py-4 sm:px-5">
                      <div className="max-w-2xl xl:ml-[5.5rem]">
                        <p className="eyebrow mb-2">Ítems de la factura</p>
                        <div className="space-y-1">
                          {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                            <div key={idx} className="flex justify-between gap-3 text-sm">
                              <span className="min-w-0 text-gray-300">
                                {item.product_name || item.label}
                                {item.label && item.product_name ? ` (${item.label})` : ''}
                                <span className="text-gray-400"> ×{item.qty}</span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-gray-200">{formatCOP(item.subtotal)}</span>
                            </div>
                          ))}
                        </div>
                        {Number(inv.discount) > 0 && (
                          <div className="mt-2 flex justify-between text-xs">
                            <span className="inline-flex items-center gap-1 text-amber-400"><Tag className="h-3 w-3" /> Descuento</span>
                            <span className="font-mono text-amber-400">−{formatCOP(inv.discount)}</span>
                          </div>
                        )}
                        <div className="mt-3 flex justify-between border-t border-white/5 pt-2">
                          <span className="text-sm font-semibold text-white">Total</span>
                          <span className="font-mono font-bold tabular-nums text-brand-400">{formatCOP(inv.total)}</span>
                        </div>
                        {inv.paid_at && (
                          <p className="mt-2 text-xs text-gray-400">Cobrada: {formatDate(inv.paid_at)}</p>
                        )}
                        {inv.edited_at && (
                          <p className="mt-1 inline-flex items-center gap-1 text-2xs text-yellow-500/80"><Pencil className="h-3 w-3" /> Editada: {formatDate(inv.edited_at)}</p>
                        )}
                        {inv.status === 'refunded' && (
                          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                            <p className="inline-flex items-center gap-1 text-2xs text-red-400"><Undo2 className="h-3 w-3" /> Devuelta{inv.refunded_at ? `: ${formatDate(inv.refunded_at)}` : ''}</p>
                            {inv.refund_reason && <p className="text-xs italic text-red-300">"{inv.refund_reason}"</p>}
                          </div>
                        )}
                        {inv.observations && (
                          <div className="mt-2 rounded-lg border border-white/5 bg-surface-300 px-3 py-2">
                            <p className="inline-flex items-center gap-1 text-2xs text-gray-400"><StickyNote className="h-3 w-3" /> Observaciones</p>
                            <p className="text-xs italic text-gray-300">{inv.observations}</p>
                          </div>
                        )}
                        {inv.status === 'paid' && (
                          <div className="mt-3 flex justify-end border-t border-white/5 pt-3">
                            <button type="button" onClick={() => handleRefund(inv)} className="btn-outline btn-sm border-red-500/25 text-red-400 hover:border-red-500/40 hover:text-red-300">
                              <Undo2 className="h-3.5 w-3.5" /> Registrar devolución
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
