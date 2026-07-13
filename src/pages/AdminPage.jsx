import { useState, useEffect, useCallback } from 'react'
import { useAuthStore }    from '../store/authStore.js'
import { api }             from '../lib/api.js'
import { formatCOP, formatDate, formatDateShort } from '../lib/format.js'
import Topbar              from '../components/Topbar.jsx'
import DailyMetrics        from '../components/DailyMetrics.jsx'
import LocationComparison  from '../components/LocationComparison.jsx'
import SellerStats         from '../components/SellerStats.jsx'
import TopProducts         from '../components/TopProducts.jsx'
import BulkUpload          from '../components/BulkUpload.jsx'
import RegisterComparison  from '../components/RegisterComparison.jsx'
import DateRangeBar        from '../components/DateRangeBar.jsx'
import DailyTrend          from '../components/DailyTrend.jsx'
import { exportToExcel }   from '../lib/exportExcel.js'
import { useToast }        from '../components/Toast.jsx'

// ---- Tabs -----------------------------------------------
const TABS = [
  { id: 'resumen',   label: 'Resumen',     icon: '📊' },
  { id: 'vendedores',label: 'Vendedores',  icon: '👥' },
  { id: 'cajas',     label: 'Cajas',       icon: '🖥' },
  { id: 'locaciones',label: 'Puntos',      icon: '📍' },
  { id: 'productos', label: 'Productos',   icon: '🎆' },
  { id: 'historial', label: 'Historial',   icon: '📋' },
]

export default function AdminPage() {
  const { location: authLocation } = useAuthStore()
  const { error: toastError, success: toastSuccess } = useToast()

  const [tab,         setTab]         = useState('resumen')
  const hoy = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locationId,  setLocationId]  = useState('')
  const [locations,   setLocations]   = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    api.get('/locations').then(d => setLocations(d || [])).catch(() => {})
  }, [])

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
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`
                flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-100 text-left
                ${tab === t.id
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-gray-500 hover:text-white hover:bg-surface-300 border border-transparent'
                }
              `}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* ---- Botón hamburguesa para sidebar en móvil ---- */}
        <button
          onClick={() => setSidebarOpen(o => !o)}
          className="fixed bottom-4 left-4 z-50 lg:hidden bg-brand-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg shadow-brand-500/30 active:scale-95 transition-transform"
          aria-label="Menu admin"
        >
          <span className="text-lg">{TABS.find(t => t.id === tab)?.icon || '📊'}</span>
        </button>

        {/* ---- Contenido ---- */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {tab === 'resumen' && (
            <ResumenTab
              from={from}
              to={to}
              setRange={(f, t) => { setFrom(f); setTo(t) }}
              locationId={locationId}
              setLocationId={setLocationId}
              locations={locations}
            />
          )}

          {tab === 'vendedores' && (
            <VendedoresTab locations={locations} />
          )}

          {tab === 'cajas' && (
            <CajasTab locations={locations} />
          )}

          {tab === 'locaciones' && (
            <LocacionesTab locations={locations} setLocations={setLocations} />
          )}

          {tab === 'productos' && (
            <ProductosTab />
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
function ResumenTab({ from, to, setRange, locationId, setLocationId, locations }) {
  const [daily,      setDaily]      = useState(null)
  const [sellers,    setSellers]    = useState([])
  const [locCompar,  setLocCompar]  = useState([])
  const [topProds,   setTopProds]   = useState([])
  const [regCompar,  setRegCompar]  = useState([])
  const [loadDaily,  setLoadDaily]  = useState(false)
  const [loadSell,   setLoadSell]   = useState(false)
  const [loadLoc,    setLoadLoc]    = useState(false)
  const [loadProds,  setLoadProds]  = useState(false)
  const [loadRegs,   setLoadRegs]   = useState(false)

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

    setLoadLoc(true)
    api.get(`/reports/locations?from=${from}&to=${to}`)
      .then(d => setLocCompar(d || []))
      .catch(() => {})
      .finally(() => setLoadLoc(false))

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
  }, [from, to, locationId])

  const handleExport = () => {
    const sheets = [
      { name: 'Resumen', rows: daily ? [{
          Desde: from, Hasta: to,
          'Total vendido': daily.total_revenue, Facturas: daily.invoice_count,
          'Ticket promedio': Math.round(daily.avg_ticket), Pendientes: daily.pending_count,
          Canceladas: daily.cancelled_count, Efectivo: daily.by_pay_method.cash,
          Transferencia: daily.by_pay_method.transfer, Tarjeta: daily.by_pay_method.card,
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
    <div className="space-y-6 max-w-5xl">
      {/* Filtros */}
      <div className="flex items-end gap-3 flex-wrap">
        <DateRangeBar from={from} to={to} onChange={setRange} />
        <div>
          <label className="block text-xs text-gray-600 mb-1">Punto de venta</label>
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
        <section>
          <h2 className="font-syne font-semibold text-white mb-4">📈 Ventas por día</h2>
          <DailyTrend data={daily.by_day} loading={loadDaily} />
        </section>
      )}

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

      {!locationId && (
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
function VendedoresTab({ locations }) {
  const { error: toastError, success: toastSuccess } = useToast()
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

  const ROLE_LABEL = { seller: 'Vendedor', cashier: 'Cajera', admin: 'Admin' }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-syne font-semibold text-white">Vendedores</h2>
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
                <p className={`font-medium ${s.active ? 'text-white' : 'text-gray-600 line-through'}`}>{s.name}</p>
                <p className="text-xs text-gray-500">{ROLE_LABEL[s.role]} · PIN: {s.pin}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { setEditSeller(s); setShowForm(true) }} className="btn btn-ghost btn-sm">Editar</button>
                <button onClick={() => handleToggle(s)} className={`btn btn-sm ${s.active ? 'btn-ghost text-yellow-500' : 'btn-ghost text-green-500'}`}>
                  {s.active ? 'Desactivar' : 'Activar'}
                </button>
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
  const [name,     setName]     = useState(seller?.name || '')
  const [pin,      setPin]      = useState(seller?.pin || '')
  const [role,     setRole]     = useState(seller?.role || 'seller')
  const [locIds,   setLocIds]   = useState(
    (seller?.seller_locations || []).map(sl => sl.location_id)
  )
  const [saving,   setSaving]   = useState(false)

  const toggleLoc = (lid) =>
    setLocIds(prev => prev.includes(lid) ? prev.filter(x => x !== lid) : [...prev, lid])

  const handleSave = async () => {
    if (!name || pin.length !== 4) return toastError('Nombre y PIN de 4 dígitos son requeridos')
    setSaving(true)
    try {
      if (seller?.id) {
        await api.put(`/sellers/${seller.id}`, { name, pin, role, location_ids: locIds })
      } else {
        await api.post('/sellers', { name, pin, role, location_ids: locIds })
      }
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card bg-surface-200 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-syne font-semibold text-white">{seller ? 'Editar vendedor' : 'Nuevo vendedor'}</h3>
        <input placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} className="input" />
        <input placeholder="PIN (4 dígitos)" maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,4))} className="input font-mono" />
        <select value={role} onChange={e => setRole(e.target.value)} className="input">
          <option value="seller">Vendedor</option>
          <option value="cashier">Cajera</option>
          <option value="admin">Admin</option>
        </select>
        <div>
          <p className="text-xs text-gray-500 mb-2">Puntos de venta asignados</p>
          <div className="space-y-1">
            {locations.map(l => (
              <label key={l.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={locIds.includes(l.id)}
                  onChange={() => toggleLoc(l.id)} className="accent-brand-500" />
                <span className="text-sm text-gray-300">{l.name}</span>
              </label>
            ))}
          </div>
        </div>
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
function LocacionesTab({ locations, setLocations }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editLoc,  setEditLoc]  = useState(null)

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
        <button onClick={() => { setEditLoc(null); setShowForm(true) }} className="btn btn-primary">+ Nuevo</button>
      </div>

      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc.id} className="card bg-surface-300 flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xl hidden sm:block">📍</span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium ${loc.active ? 'text-white' : 'text-gray-600 line-through'}`}>{loc.name}</p>
              {loc.address && <p className="text-xs text-gray-500 truncate">{loc.address}</p>}
              {loc.printer_config?.paper_width && (
                <p className="text-xs text-gray-600">Impresora: {loc.printer_config.paper_width}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => { setEditLoc(loc); setShowForm(true) }} className="btn btn-ghost btn-sm">Editar</button>
              <button onClick={() => handleToggle(loc)} className="btn btn-ghost btn-sm text-yellow-500">
                {loc.active ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <LocationForm
          location={editLoc}
          onClose={() => setShowForm(false)}
          onSave={() => { reload(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function LocationForm({ location, onClose, onSave }) {
  const { error: toastError } = useToast()
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
        await api.put(`/locations/${location.id}`, { name, address: addr, printer_config })
      } else {
        await api.post('/locations', { name, address: addr, printer_config })
      }
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card bg-surface-200 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-syne font-semibold text-white">{location ? 'Editar punto de venta' : 'Nuevo punto de venta'}</h3>
        <input placeholder="Nombre del punto de venta" value={name} onChange={e => setName(e.target.value)} className="input" />
        <input placeholder="Dirección (opcional)" value={addr} onChange={e => setAddr(e.target.value)} className="input" />
        <div>
          <label className="text-xs text-gray-500 block mb-1">Ancho del papel</label>
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
    api.get('/products')
      .then(d => setProducts(d || []))
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(fetch, [])

  const handleToggle = async (p) => {
    try {
      await api.put(`/products/${p.id}`, { active: !p.active })
      fetch()
    } catch (err) { toastError(err.message) }
  }

  if (showBulk) {
    return (
      <div className="max-w-3xl space-y-4">
        <BulkUpload onDone={() => { setShowBulk(false); fetch() }} />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="font-syne font-semibold text-white">Productos</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowBulk(true)} className="btn btn-ghost border border-white/10 text-sm">
            📤 Carga masiva
          </button>
          <button onClick={() => { setEditProd(null); setShowForm(true) }} className="btn btn-primary">+ Nuevo</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className={`card bg-surface-300 ${!p.active ? 'opacity-50' : ''}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <span className="hidden sm:block">{p.categories?.icon || '🎆'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.categories?.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(p.presentations || []).map(pr => (
                      <span key={pr.id} className="text-xs bg-surface-50 text-gray-400 px-2 py-0.5 rounded-full">
                        {pr.label} · {formatCOP(pr.price)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => { setEditProd(p); setShowForm(true) }} className="btn btn-ghost btn-sm">Editar</button>
                  <button onClick={() => handleToggle(p)} className="btn btn-ghost btn-sm text-yellow-500">
                    {p.active ? 'Desactivar' : 'Activar'}
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
  const { error: toastError } = useToast()
  const [name,        setName]        = useState(product?.name || '')
  const [catId,       setCatId]       = useState(product?.categories?.id || '')
  const [desc,        setDesc]        = useState(product?.description || '')
  const [presentations, setPresentations] = useState(
    (product?.presentations || []).map(p => ({ label: p.label, price: String(p.price) }))
  )
  const [saving, setSaving] = useState(false)

  const addPres = () => setPresentations(p => [...p, { label: '', price: '' }])
  const updatePres = (i, field, val) => setPresentations(p =>
    p.map((pr, idx) => idx === i ? { ...pr, [field]: val } : pr)
  )
  const removePres = (i) => setPresentations(p => p.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!name) return toastError('El nombre es requerido')
    if (presentations.some(p => !p.label || !p.price)) return toastError('Completa todas las presentaciones')
    setSaving(true)
    const presToSave = presentations.map(p => ({ label: p.label, price: Number(p.price) }))
    try {
      if (product?.id) {
        await api.put(`/products/${product.id}`, { name, category_id: catId || null, description: desc, presentations: presToSave })
      } else {
        await api.post('/products', { name, category_id: catId || null, description: desc, presentations: presToSave })
      }
      onSave()
    } catch (err) { toastError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="card bg-surface-200 w-full max-w-lg space-y-4 my-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-syne font-semibold text-white">{product ? 'Editar producto' : 'Nuevo producto'}</h3>
        <input placeholder="Nombre del producto" value={name} onChange={e => setName(e.target.value)} className="input" />
        <input placeholder="Descripción (opcional)" value={desc} onChange={e => setDesc(e.target.value)} className="input" />

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Presentaciones y precios</p>
            <button onClick={addPres} className="btn btn-ghost btn-sm text-brand-400">+ Agregar</button>
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
                <button onClick={() => removePres(i)} className="text-gray-600 hover:text-red-400 px-2">✕</button>
              </div>
            ))}
          </div>
        </div>

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
        <div className="card bg-surface-300 text-center py-8 text-gray-600">
          <span className="text-3xl block mb-2">🖥</span>
          <p className="text-sm">No hay cajas registradas.</p>
          <p className="text-xs mt-1">Crea una caja para cada registradora física de tu negocio.</p>
        </div>
      ) : (
        Object.entries(byLocation).map(([locId, group]) => (
          <div key={locId}>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
                      className="btn btn-ghost btn-sm"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(reg)}
                      className="btn btn-ghost btn-sm text-red-400"
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
    </div>
  )
}

function RegisterForm({ register, locations, onClose, onSave }) {
  const { error: toastError } = useToast()
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
      <div className="card bg-surface-200 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-syne font-semibold text-white">{register ? 'Editar caja' : 'Nueva caja'}</h3>
        <input
          placeholder="Ej: Caja 1, Caja Principal, Caja Norte"
          value={name}
          onChange={e => setName(e.target.value)}
          className="input"
          autoFocus
        />
        {!register && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Punto de venta</label>
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
  const hoy = new Date().toISOString().split('T')[0]
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locFilter,  setLocFilter]  = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [expanded,   setExpanded]   = useState(null)

  const STATUS_STYLES = {
    pending:   'badge-pending',
    paid:      'badge-paid',
    cancelled: 'badge-cancelled',
  }
  const STATUS_LABEL  = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Cancelada' }
  const METHOD_LABEL  = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Datáfono' }

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
    <div className="max-w-5xl space-y-4">
      <h2 className="font-syne font-semibold text-white">Historial de facturas</h2>

      <div className="flex items-end gap-3 flex-wrap">
        <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        <div>
          <label className="block text-xs text-gray-600 mb-1">Punto de venta</label>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} className="input w-48 text-sm">
            <option value="">Todos</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Estado</label>
          <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)} className="input w-36 text-sm">
            <option value="">Todos</option>
            <option value="paid">Pagadas</option>
            <option value="pending">Pendientes</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
        <button onClick={fetchInvoices} className="btn btn-ghost border border-white/10">↻</button>
      </div>

      <p className="text-xs text-gray-600">{total} facturas encontradas</p>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : invoices.length === 0 ? (
        <div className="card bg-surface-300 text-center py-12 text-gray-600">
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
                    <p className="text-xs text-gray-600">
                      {inv.location_name}
                      {inv.register_name && <span> · 🖥 {inv.register_name}</span>}
                      {inv.cashier_name && inv.cashier_name !== inv.seller_name && <span> · Cajero: {inv.cashier_name}</span>}
                    </p>
                  </div>
                  <span className={STATUS_STYLES[inv.status]}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                  {inv.pay_method && (
                    <span className="text-xs text-gray-500">{METHOD_LABEL[inv.pay_method]}</span>
                  )}
                  <span className="font-mono font-semibold text-white text-sm">{formatCOP(inv.total)}</span>
                  <span className="text-xs text-gray-600 w-28 text-right shrink-0">
                    {formatDate(inv.created_at)}
                  </span>
                </div>
              </button>

              {/* Detalle expandido */}
              {expanded === inv.id && (
                <div className="card bg-surface-400 border-brand-500/20 ml-0 sm:ml-4 mt-1 animate-fade-in">
                  <p className="text-xs text-gray-500 mb-2">Items de la factura:</p>
                  <div className="space-y-1">
                    {(Array.isArray(inv.items) ? inv.items : []).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-300">
                          {item.product_name || item.label}
                          {item.label && item.product_name ? ` (${item.label})` : ''}
                          <span className="text-gray-600"> x{item.qty}</span>
                        </span>
                        <span className="font-mono text-brand-400">{formatCOP(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-3 pt-2 border-t border-white/5">
                    <span className="font-semibold text-white text-sm">Total</span>
                    <span className="font-mono font-bold text-brand-400">{formatCOP(inv.total)}</span>
                  </div>
                  {inv.paid_at && (
                    <p className="text-xs text-gray-600 mt-2">Cobrada: {formatDate(inv.paid_at)}</p>
                  )}
                  {inv.edited_at && (
                    <p className="text-[10px] text-yellow-500/70 mt-1">✏️ Editada: {formatDate(inv.edited_at)}</p>
                  )}
                  {inv.observations && (
                    <div className="mt-2 bg-surface-300 rounded-lg px-2 py-1.5 border border-white/5">
                      <p className="text-[10px] text-gray-500">📝 Observaciones:</p>
                      <p className="text-xs text-gray-300 italic">{inv.observations}</p>
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
