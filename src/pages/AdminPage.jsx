import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import { BarChart3, Users, Monitor, MapPin, PartyPopper, ClipboardList, ShieldCheck, Sliders, Printer, Tag, Plus, Check, X, Pencil, Loader2 } from 'lucide-react'
import { useAuthStore }    from '../store/authStore.js'
import { useModalA11y }    from '../hooks/useModalA11y.js'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP, formatDate, formatDateShort, payMethodLabel } from '../lib/format.js'
import Topbar              from '../components/Topbar.jsx'
import DailyMetrics        from '../components/DailyMetrics.jsx'
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
import { useToast }        from '../components/Toast.jsx'
import { can, ROLE_LABELS, assignableRoles } from '../../api/_lib/roles.js'

// ---- Tabs -----------------------------------------------
const TABS = [
  { id: 'resumen',    label: 'Resumen',    icon: BarChart3,     action: 'view_reports' },
  { id: 'vendedores', label: 'Usuarios',   icon: Users,         action: 'manage_staff' },
  { id: 'cajas',      label: 'Cajas',      icon: Monitor,       action: 'manage_registers' },
  { id: 'locaciones', label: 'Puntos',     icon: MapPin,        action: 'manage_locations' },
  { id: 'productos',  label: 'Productos',  icon: PartyPopper,   action: 'manage_catalog' },
  { id: 'impresion',  label: 'Impresora',  icon: Printer,       action: 'configure_printer' },
  { id: 'auditoria',  label: 'Auditoría',  icon: ShieldCheck,   action: 'view_reports' },
  { id: 'historial',  label: 'Historial',  icon: ClipboardList, action: 'view_reports' },
]

export default function AdminPage() {
  const { location: authLocation, seller } = useAuthStore()
  const role = seller?.role
  const tabs = TABS.filter(t => can(role, t.action))
  const isOwner = can(role, 'view_consolidated')
  const { error: toastError, success: toastSuccess } = useToast()

  const [tab,         setTab]         = useState('resumen')
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  // Admin: fijo en su punto. Owner: el punto elegido en la barra ('' = consolidado).
  const [locationId,  setLocationId]  = useState(authLocation?.id || '')
  const [locations,   setLocations]   = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    api.get('/locations').then(d => setLocations(d || [])).catch(() => {})
  }, [])

  useEffect(() => { if (isOwner) setLocationId(authLocation?.id || '') }, [authLocation?.id, isOwner])

  const handleTabChange = (id) => {
    setTab(id)
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#111]">
      <Topbar title="Administración" />

      <div className="flex-1 flex min-h-0 relative">

        {/* ---- Backdrop móvil ---- */}
        {sidebarOpen && (
          <button
            className="fixed inset-0 bg-black/60 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ---- Sidebar de tabs ---- */}
        <div className={`
          fixed top-14 left-0 h-[calc(100dvh-3.5rem)] w-56 z-40
          lg:static lg:w-44 lg:z-0
          border-r border-white/5 flex flex-col bg-surface-500 py-3 gap-1 px-2
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`
                flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-100 text-left
                ${tab === t.id
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-surface-300 border border-transparent'
                }
              `}
            >
              <t.icon className="w-4 h-4 shrink-0" strokeWidth={2} /> {t.label}
            </button>
          ))}
        </div>

        {/* ---- Contenido ---- */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* Antes era un botón fixed bottom-left: quedaba flotando sobre
              cualquier contenido que scrolleara a esa posición, tapando
              texto (p. ej. el título de "Top Productos"). Al vivir en el
              flujo normal (sticky, no fixed) reserva su espacio y nunca
              se monta encima de nada. */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="sticky top-0 z-20 lg:hidden mb-3 bg-brand-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95 transition-transform"
            aria-label="Menu admin"
          >
            {(() => {
              const ActiveIcon = tabs.find(t => t.id === tab)?.icon || BarChart3
              return <ActiveIcon className="w-5 h-5" strokeWidth={2} />
            })()}
          </button>

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
            <ProductosTab />
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

  return (
    <div className="space-y-6 w-full">
      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        <DateRangeBar from={from} to={to} onChange={setRange} />
        {isOwner && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Punto de venta</label>
            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="input w-48 text-sm"
            >
              <option value="">Todos (consolidado)</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <button onClick={fetchAll} className="btn btn-ghost border border-white/10">
          ↻ Actualizar
        </button>
        <button onClick={handleExport} className="btn btn-ghost border border-white/10">
          ⬇ Exportar
        </button>
      </div>

      <section>
        <h2 className="font-syne font-semibold text-white mb-4">
          {from === to ? 'Métricas del día' : `Métricas · ${from} → ${to}`}
        </h2>
        <DailyMetrics data={daily} loading={loadDaily} />
      </section>

      {daily?.by_day?.length > 1 && (
        <section className="space-y-3">
          <h2 className="font-syne font-semibold text-white">Ventas por día</h2>
          <RevenueTrendChart data={daily.by_day} loading={loadDaily} />
          <DailyTrend data={daily.by_day} loading={loadDaily} />
        </section>
      )}

      <section>
        <h2 className="font-syne font-semibold text-white mb-4">Ventas por categoría</h2>
        <CategoryBreakdown data={byCategory} loading={loadCat} />
      </section>

      {/* Rankings lado a lado en desktop, apilados en móvil */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-syne font-semibold text-white mb-4">🏆 Top Productos</h2>
          <TopProducts data={topProds} loading={loadProds} />
        </section>

        <section>
          <h2 className="font-syne font-semibold text-white mb-4">🏆 Top Vendedores</h2>
          <SellerStats data={sellers} loading={loadSell} from={from} to={to} locationId={locationId} />
        </section>
      </div>

      <section>
        <h2 className="font-syne font-semibold text-white mb-4">🖥 Rendimiento por Caja</h2>
        <RegisterComparison data={regCompar} loading={loadRegs} from={from} to={to} locationId={locationId} />
      </section>

      {isOwner && !locationId && (
        <section>
          <h2 className="font-syne font-semibold text-white mb-4">Comparativa de puntos de venta</h2>
          <LocationComparison data={locCompar} loading={loadLoc} />
        </section>
      )}
    </div>
  )
}

// ===========================================================
// TAB: Vendedores
// ===========================================================
function VendedoresTab({ locations, isOwner }) {
  const { error: toastError, success: toastSuccess } = useToast()
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

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-syne font-semibold text-white">Usuarios</h2>
        <button onClick={() => { setEditSeller(null); setShowForm(true) }} className="btn btn-primary">
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {sellers.map(s => (
            <div key={s.id} className="card bg-surface-300 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${s.active ? 'text-white' : 'text-gray-400 line-through'}`}>{s.name}</p>
                <p className="text-xs text-gray-400">
                  {ROLE_LABELS[s.role]}
                  {s.username && <> · <span className="font-mono">{s.username}</span></>}
                  {!isOwner || s.role === 'owner' ? null : <> · {(s.seller_locations || []).map(sl => locations.find(l => l.id === sl.location_id)?.name).filter(Boolean).join(', ') || 'Sin punto'}</>}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditSeller(s); setShowForm(true) }} className="btn btn-ghost btn-sm btn-touch-safe">Editar</button>
                {s.id !== me?.id && (
                  <button onClick={() => handleToggle(s)} className={`btn btn-sm btn-touch-safe ${s.active ? 'btn-ghost text-yellow-500' : 'btn-ghost text-green-500'}`}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
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
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 id={titleId} className="font-syne font-semibold text-white">{seller ? 'Editar usuario' : 'Nuevo usuario'}</h3>

        <input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} className="input" />

        <div>
          <label className="block text-xs text-gray-400 mb-1">Rol</label>
          <select value={role} onChange={e => handleRoleChange(e.target.value)} className="input" disabled={isSelf}>
            {roleOptions.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          {isSelf && <p className="text-xs text-gray-400 mt-1">No puedes cambiar tu propio rol.</p>}
        </div>

        {usesPassword ? (
          <>
            <input placeholder="Usuario (ej: admin.norte)" value={username} autoComplete="off" autoCapitalize="none"
              onChange={e => setUsername(e.target.value.toLowerCase())} className="input font-mono" />
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={needsNewPass ? 'Contraseña (mínimo 10 caracteres)' : 'Nueva contraseña (dejar vacío para no cambiar)'}
              className="input" />
          </>
        ) : (
          <input placeholder={needsNewPin ? 'PIN (4 dígitos)' : 'Nuevo PIN (dejar vacío para no cambiar)'} maxLength={4} value={pin}
            inputMode="numeric" onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className="input font-mono" />
        )}

        {showLocations && !isSelf && (
          <fieldset>
            <legend className="text-xs text-gray-400 mb-2">{singleLocation ? 'Punto de venta que administra' : 'Puntos de venta asignados'}</legend>
            <div className="space-y-1">
              {locations.map(l => (
                <label key={l.id} className="flex items-center gap-2 cursor-pointer">
                  <input type={singleLocation ? 'radio' : 'checkbox'} name="seller-locs"
                    checked={locIds.includes(l.id)} onChange={() => toggleLoc(l.id)} className="accent-brand-500" />
                  <span className="text-sm text-gray-300">{l.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {role === 'owner' && (
          <p className="text-xs text-amber-300">El superadministrador ve y administra todos los puntos de la empresa.</p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// TAB: Puntos de venta
// ===========================================================
function LocacionesTab({ locations, setLocations, isOwner }) {
  const { error: toastError, success: toastSuccess } = useToast()
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
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-syne font-semibold text-white">Puntos de venta</h2>
        {isOwner && (
          <button onClick={() => { setEditLoc(null); setShowForm(true) }} className="btn btn-primary">+ Nuevo</button>
        )}
      </div>

      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc.id} className="card bg-surface-300 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xl hidden sm:block">📍</span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${loc.active ? 'text-white' : 'text-gray-400 line-through'}`}>{loc.name}</p>
              {loc.address && <p className="text-xs text-gray-400 truncate">{loc.address}</p>}
              {loc.printer_config?.paper_width && (
                <p className="text-xs text-gray-400">Impresora: {loc.printer_config.paper_width}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setCatalogLoc(loc)}
                  className="btn btn-ghost btn-sm btn-touch-safe text-brand-400 hover:text-brand-300 inline-flex items-center gap-1 border border-brand-500/20"
                  title="Configurar precios diferenciales y productos habilitados (Superadmin)"
                >
                  <Sliders className="w-3.5 h-3.5" /> Precios y Catálogo
                </button>
              )}
              <button onClick={() => { setEditLoc(loc); setShowForm(true) }} className="btn btn-ghost btn-sm btn-touch-safe">Editar</button>
              {isOwner && (
                <button onClick={() => handleToggle(loc)} className="btn btn-ghost btn-sm btn-touch-safe text-yellow-500">
                  {loc.active ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

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
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 id={titleId} className="font-syne font-semibold text-white">{location ? 'Editar punto de venta' : 'Nuevo punto de venta'}</h3>
        <input placeholder="Nombre del punto de venta" value={name} onChange={e => setName(e.target.value)} className="input" disabled={!isOwner} />
        <input placeholder="Dirección (opcional)" value={addr} onChange={e => setAddr(e.target.value)} className="input" disabled={!isOwner} />
        <div>
          <label className="text-xs text-gray-400 block mb-1">Ancho del papel</label>
          <select value={width} onChange={e => setWidth(e.target.value)} className="input">
            <option value="80mm">80mm (48 caracteres)</option>
            <option value="58mm">58mm (32 caracteres)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={qz} onChange={e => setQz(e.target.checked)} className="accent-brand-500" />
          <span className="text-sm text-gray-300">Usar QZ Tray para impresión térmica</span>
        </label>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// TAB: Productos
// ===========================================================
function ProductosTab() {
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

  if (showBulk) {
    return (
      <div className="max-w-3xl space-y-4">
        <BulkUpload onDone={() => { setShowBulk(false); fetch() }} onProductsChanged={fetch} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-syne font-semibold text-white">Productos</h2>
          {!loading && products.length > 0 && (
            <p className="text-xs text-gray-400">
              {products.length} en el catálogo
              {inactiveCount > 0 && ` · ${inactiveCount} inactivo(s)`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(true)} className="btn btn-ghost border border-white/10 text-sm">
            📤 Carga y borrado masivo
          </button>
          <button onClick={() => { setEditProd(null); setShowForm(true) }} className="btn btn-primary">+ Nuevo</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : products.length === 0 ? (
        <div className="card bg-surface-400 border-dashed border-white/10 text-center py-8">
          <div className="text-3xl mb-2">🎆</div>
          <p className="text-sm text-gray-300">El catálogo está vacío</p>
          <p className="text-xs text-gray-400 mt-1 mb-4">
            Crea un producto a mano o impórtalos todos desde un Excel.
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setShowBulk(true)} className="btn btn-ghost border border-white/10 text-sm">
              📤 Importar desde Excel
            </button>
            <button onClick={() => { setEditProd(null); setShowForm(true) }} className="btn btn-primary">+ Nuevo</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className={`card bg-surface-300 ${!p.active ? 'opacity-50' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} loading="lazy" className="hidden sm:block w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
                ) : (
                  <span className="hidden sm:block">{p.categories?.icon || '🎆'}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 align-middle text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-gray-500 shrink-0" />
                    <span>{p.categories?.name || 'Sin categoría'}</span>
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(p.presentations || []).map(pr => (
                      <span key={pr.id} className="text-xs bg-surface-50 text-gray-400 px-2 py-0.5 rounded-full">
                        {pr.label} · {formatCOP(pr.price)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setEditProd(p); setShowForm(true) }} className="btn btn-ghost btn-sm btn-touch-safe flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                  <button
                    onClick={() => handleToggle(p)}
                    className="btn btn-ghost btn-sm btn-touch-safe text-yellow-500"
                    title={p.active ? 'Se oculta del POS, se puede reactivar' : 'Vuelve a estar disponible en el POS'}
                  >
                    {p.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="btn btn-ghost btn-sm btn-touch-safe text-gray-400 hover:text-red-400"
                    title="Eliminar definitivamente"
                    aria-label={`Eliminar ${p.name} definitivamente`}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProductForm
          product={editProd}
          onClose={() => setShowForm(false)}
          onSave={() => { fetch(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function ProductForm({ product, onClose, onSave }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
  const [name,          setName]          = useState(product?.name || '')
  const [catId,         setCatId]         = useState(product?.category_id || product?.categories?.id || '')
  const [desc,          setDesc]          = useState(product?.description || '')
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
      const body = { name: name.trim(), category_id: catId || null, description: desc.trim() || null, presentations: presToSave }
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-lg space-y-4 my-4" onClick={e => e.stopPropagation()}>
        <h3 id={titleId} className="font-syne font-semibold text-white">{product ? 'Editar producto' : 'Nuevo producto'}</h3>
        
        <div>
          <label className="text-xs text-gray-400 block mb-1">Nombre</label>
          <input placeholder="Nombre del producto" value={name} onChange={e => setName(e.target.value)} className="input w-full" />
        </div>

        {/* Categoría con lucide-react Tag y opción nueva categoría */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="prod-category-select" className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
              <Tag className="w-3.5 h-3.5 text-brand-400" />
              Categoría
            </label>
            {!showNewCat && (
              <button
                type="button"
                onClick={() => setShowNewCat(true)}
                className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva categoría
              </button>
            )}
          </div>

          {showNewCat ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                placeholder="Nombre de la nueva categoría..."
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
                className="input flex-1 text-sm py-1.5"
                autoFocus
              />
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={savingCat || !newCatName.trim()}
                className="btn btn-primary btn-sm flex items-center gap-1 px-3"
                title="Crear categoría"
              >
                {savingCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Crear</span>
              </button>
              <button
                type="button"
                onClick={() => { setShowNewCat(false); setNewCatName('') }}
                disabled={savingCat}
                className="btn btn-ghost btn-sm px-2 text-gray-400 hover:text-white"
                title="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <select
                id="prod-category-select"
                value={catId}
                onChange={e => setCatId(e.target.value)}
                className="input w-full text-sm py-2 pr-8 appearance-none bg-surface-300 cursor-pointer text-white"
                disabled={loadingCats}
              >
                <option value="" className="bg-surface-300 text-gray-300">(Sin categoría)</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id} className="bg-surface-300 text-white">
                    {c.icon ? `${c.icon} ` : ''}{c.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 block mb-1">Descripción (opcional)</label>
          <input placeholder="Descripción (opcional)" value={desc} onChange={e => setDesc(e.target.value)} className="input w-full" />
        </div>

        {/* Foto del producto */}
        <div className="flex items-center gap-3">
          {photoPreview ? (
            <img src={photoPreview} alt={`Foto de ${name || 'producto'}`} className="w-14 h-14 rounded-lg object-cover border border-white/10" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-surface-400 flex items-center justify-center text-xl">🎆</span>
          )}
          <div className="flex flex-col gap-1">
            <label className="btn btn-ghost btn-sm border border-white/10 cursor-pointer text-xs">
              📷 {photoPreview ? 'Cambiar foto' : 'Agregar foto'}
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            </label>
            {photoPreview && (
              <button onClick={removePhoto} className="btn btn-ghost btn-sm text-xs text-gray-400 hover:text-red-400">
                Quitar foto
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Presentaciones y precios</p>
            <button onClick={addPres} className="btn btn-ghost btn-sm text-brand-400 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar</span>
            </button>
          </div>
          <div className="space-y-2">
            {presentations.map((pr, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Ej: Unidad, Pack x12"
                  value={pr.label}
                  onChange={e => updatePres(i, 'label', e.target.value)}
                  className="input flex-1"
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={pr.price}
                  onChange={e => updatePres(i, 'price', e.target.value)}
                  className="input w-28"
                />
                <button onClick={() => removePres(i)} className="text-gray-400 hover:text-red-400 px-2 flex items-center justify-center" title="Eliminar presentación">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
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
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-syne font-semibold text-white">Cajas registradoras</h2>
        <button onClick={() => { setEditReg(null); setShowForm(true) }} className="btn btn-primary">
          + Nueva caja
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : registers.length === 0 ? (
        <div className="card bg-surface-300 text-center py-8 text-gray-400">
          <span className="text-3xl block mb-2">🖥</span>
          <p className="text-sm">No hay cajas registradas.</p>
          <p className="text-xs mt-1">Crea una caja para cada registradora física de tu negocio.</p>
        </div>
      ) : (
        Object.entries(byLocation).map(([locId, group]) => (
          <div key={locId}>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              📍 {group.name}
            </p>
            <div className="space-y-1.5">
              {group.regs.map(reg => (
                <div key={reg.id} className="card bg-surface-300 flex items-center gap-3">
                  <span className="text-lg">🖥</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{reg.name}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setEditReg(reg); setShowForm(true) }}
                      className="btn btn-ghost btn-sm btn-touch-safe"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(reg)}
                      className="btn btn-ghost btn-sm btn-touch-safe text-red-400"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

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
    <div className="pt-6 border-t border-white/5 space-y-3">
      <h3 className="font-syne font-semibold text-white">🧾 Cierres de caja</h3>
      <div className="flex items-end gap-2 flex-wrap">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        {locations.length > 1 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Punto de venta</label>
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="input w-44 text-sm">
              <option value="">Todos</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!closures ? (
        <div className="space-y-2">{[1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : closures.length === 0 ? (
        <p className="text-xs text-gray-400">Sin cierres en el rango. La cajera cierra su caja desde la pantalla de Caja (botón 🧾 Cerrar caja).</p>
      ) : (
        <div className="space-y-1.5">
          {closures.map(c => {
            const diff = Number(c.difference)
            return (
              <div key={c.id} className="card bg-surface-300 py-2.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm text-white font-medium">🖥 {c.register_name || 'Sin caja'}</p>
                    <p className="text-[10px] text-gray-400">
                      {c.business_date} · {locName(c.location_id)} · {c.cashier_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">Esperado</p>
                    <p className="font-mono text-xs text-gray-300">{formatCOP(c.expected_cash)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">Contado</p>
                    <p className="font-mono text-xs text-white">{formatCOP(c.declared_cash)}</p>
                  </div>
                  <div className="text-right w-24">
                    <p className="text-[10px] text-gray-400">Diferencia</p>
                    <p className={`font-mono text-sm font-bold ${diff === 0 ? 'text-green-400' : diff > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {diff > 0 ? '+' : ''}{formatCOP(diff)}
                    </p>
                  </div>
                </div>
                {c.notes && <p className="text-[10px] text-gray-400 italic mt-1.5">📝 {c.notes}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RegisterForm({ register, locations, onClose, onSave }) {
  const { error: toastError } = useToast()
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
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
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="card bg-surface-200 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 id={titleId} className="font-syne font-semibold text-white">{register ? 'Editar caja' : 'Nueva caja'}</h3>
        <input
          placeholder="Ej: Caja 1, Caja Principal, Caja Norte"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          autoFocus
        />
        {!register && locations.length > 1 && (
          <div>
            <label className="text-xs text-gray-400 block mb-1">Punto de venta</label>
            <select value={locationId} onChange={e => setLocationId(e.target.value)} className="input">
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn btn-ghost">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================
// TAB: Historial de facturas
// ===========================================================
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

  const STATUS_STYLES = {
    pending:   'badge-pending',
    paid:      'badge-paid',
    cancelled: 'badge-cancelled',
    refunded:  'badge-cancelled',
  }
  const STATUS_LABEL  = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada', refunded: 'Devuelta' }

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
    <div className="w-full space-y-4">
      <h2 className="font-syne font-semibold text-white">Historial de facturas</h2>

      <div className="flex items-end gap-3 flex-wrap">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        {locations.length > 1 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Punto de venta</label>
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="input w-48 text-sm">
              <option value="">Todos</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Estado</label>
          <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)} className="input w-36 text-sm">
            <option value="">Todos</option>
            <option value="paid">Pagadas</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Canceladas</option>
            <option value="refunded">Devueltas</option>
          </select>
        </div>
        <button onClick={fetchInvoices} className="btn btn-ghost border border-white/10">↻</button>
      </div>

      <p className="text-xs text-gray-400">{total} facturas encontradas</p>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : invoices.length === 0 ? (
        <div className="card bg-surface-300 text-center py-12 text-gray-400">
          <p className="text-sm">Sin facturas para los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {invoices.map(inv => (
            <div key={inv.id}>
              <button
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                className="card bg-surface-300 w-full text-left hover:bg-surface-200 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="font-mono font-bold text-brand-400 text-lg w-16 shrink-0">#{inv.code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{inv.seller_name}</p>
                    <p className="text-xs text-gray-400">
                      {inv.location_name}
                      {inv.register_name && <span> · 🖥 {inv.register_name}</span>}
                      {inv.cashier_name && inv.cashier_name !== inv.seller_name && <span> · Cajero: {inv.cashier_name}</span>}
                    </p>
                  </div>
                  <span className={STATUS_STYLES[inv.status]}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                  {inv.pay_method && (
                    <span className="text-xs text-gray-400">{payMethodLabel(inv.pay_method, inv.transfer_provider)}</span>
                  )}
                  <span className="font-mono font-semibold text-white text-sm">{formatCOP(inv.total)}</span>
                  <span className="text-xs text-gray-400 w-28 text-right shrink-0">
                    {formatDate(inv.created_at)}
                  </span>
                </div>
              </button>

              {/* Detalle expandido */}
              {expanded === inv.id && (
                <div className="card bg-surface-400 border-brand-500/20 ml-0 sm:ml-4 mt-1 animate-fade-in">
                  <p className="text-xs text-gray-400 mb-2">Items de la factura:</p>
                  <div className="space-y-1">
                    {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-300">
                          {item.product_name || item.label}
                          {item.label && item.product_name ? ` (${item.label})` : ''}
                          <span className="text-gray-400"> x{item.qty}</span>
                        </span>
                        <span className="font-mono text-brand-400">{formatCOP(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  {Number(inv.discount) > 0 && (
                    <div className="flex justify-between mt-2 text-xs">
                      <span className="text-amber-400">🏷 Descuento</span>
                      <span className="font-mono text-amber-400">−{formatCOP(inv.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between mt-3 pt-2 border-t border-white/5">
                    <span className="font-semibold text-white text-sm">Total</span>
                    <span className="font-mono font-bold text-brand-400">{formatCOP(inv.total)}</span>
                  </div>
                  {inv.paid_at && (
                    <p className="text-xs text-gray-400 mt-2">Cobrada: {formatDate(inv.paid_at)}</p>
                  )}
                  {inv.edited_at && (
                    <p className="text-[10px] text-yellow-500/70 mt-1">✏️ Editada: {formatDate(inv.edited_at)}</p>
                  )}
                  {inv.status === 'refunded' && (
                    <div className="mt-2 bg-red-500/10 rounded-lg px-2 py-1.5 border border-red-500/20">
                      <p className="text-[10px] text-red-400">↩ Devuelta{inv.refunded_at ? `: ${formatDate(inv.refunded_at)}` : ''}</p>
                      {inv.refund_reason && <p className="text-xs text-red-300 italic">"{inv.refund_reason}"</p>}
                    </div>
                  )}
                  {inv.observations && (
                    <div className="mt-2 bg-surface-300 rounded-lg px-2 py-1.5 border border-white/5">
                      <p className="text-[10px] text-gray-400">📝 Observaciones:</p>
                      <p className="text-xs text-gray-300 italic">{inv.observations}</p>
                    </div>
                  )}
                  {inv.status === 'paid' && (
                    <div className="mt-3 pt-2 border-t border-white/5 flex justify-end">
                      <button onClick={() => handleRefund(inv)} className="btn btn-ghost btn-sm text-xs text-red-400 border border-red-500/20">
                        ↩ Registrar devolución
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
