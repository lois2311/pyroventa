import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Copy, Loader2, LogOut, MapPin, Pause, Play, Plus,
  RefreshCw, ShieldCheck, Users,
} from 'lucide-react'
import { superApi } from '../lib/superApi.js'
import { formatCOP } from '../lib/format.js'
import { toISO } from '../components/DateRangeBar.jsx'

const STATUS_LABEL = {
  active:              { text: 'Activo',        cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  TENANT_SUSPENDED:    { text: 'Suspendido',    cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  LICENSE_EXPIRED:     { text: 'Vencido',       cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  LICENSE_NOT_STARTED: { text: 'No iniciado',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

const STATUS_UNKNOWN = { text: 'Desconocido', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }

function StatusChip({ status }) {
  const s = STATUS_LABEL[status] || STATUS_UNKNOWN
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

/** Días restantes de licencia (positivo = por vencer, negativo = ya vencida). */
function daysUntil(dateStr) {
  if (!dateStr) return null
  const ms = new Date(`${dateStr}T00:00:00`) - new Date(new Date().toDateString())
  return Math.round(ms / 86400000)
}

/** Aviso de vencimiento próximo — solo se muestra si el estado ya no lo dice todo. */
function LicenseCountdown({ status, licenseEnd }) {
  if (status !== 'active') return null
  const days = daysUntil(licenseEnd)
  if (days == null || days > 15) return null
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30">
      Vence en {days} día{days === 1 ? '' : 's'}
    </span>
  )
}

const ROLE_COUNT_META = [
  { key: 'admin',   label: 'admin' },
  { key: 'cashier', label: 'cajero' },
  { key: 'seller',  label: 'vendedor' },
]

/** Resumen de staff activo por rol (admins de punto, cajeros, vendedores). */
function StaffSummary({ staffCount }) {
  const parts = ROLE_COUNT_META
    .map(r => ({ ...r, n: staffCount?.[r.key] || 0 }))
    .filter(r => r.n > 0)
  if (parts.length === 0) return <span className="text-gray-500">Sin personal por punto</span>
  return (
    <span className="text-gray-400">
      {parts.map((r, i) => (
        <span key={r.key}>
          {i > 0 && ' · '}
          <span className="text-white font-medium">{r.n}</span> {r.label}{r.n === 1 ? '' : 's'}
        </span>
      ))}
    </span>
  )
}

// ---- Wizard de nuevo cliente -----------------------------
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')

function NewTenantModal({ onClose, onCreated }) {
  const [name,   setName]   = useState('')
  const [slug,   setSlug]   = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [start,  setStart]  = useState('')
  const [end,    setEnd]    = useState('')
  const [ownerName,  setOwnerName]  = useState('')
  const [ownerUser,  setOwnerUser]  = useState('')
  const [ownerPass,  setOwnerPass]  = useState('')
  const [locName,    setLocName]    = useState('Principal')
  const [locAddress, setLocAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [created, setCreated] = useState(null) // { tenant, link }
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const body = { name, slug, license_start: start, license_end: end }
      if (ownerName.trim()) body.owner = { name: ownerName.trim(), username: ownerUser.trim(), password: ownerPass }
      if (locName.trim())   body.location = { name: locName.trim(), address: locAddress.trim() || undefined }
      const data = await superApi.post('/super/tenants', body)
      setCreated(data)
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fullLink = created ? `${window.location.origin}${created.link}` : ''

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card bg-surface-300 border-white/10 p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {!created ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="font-syne text-lg font-bold text-white">Nuevo cliente</h2>
            <div>
              <label className="text-gray-400 text-sm block mb-1.5">Nombre de la empresa</label>
              <input value={name} onChange={e => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }} required autoFocus
                placeholder="Pirotecnia El Cohetón"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1.5">Código (slug) — será el link /c/&lt;código&gt;</label>
              <input value={slug}
                onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                placeholder="pirotecnia-el-coheton"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white font-mono text-sm focus:border-brand-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-sm block mb-1.5">Inicio licencia</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-400 text-sm block mb-1.5">Fin licencia</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} required
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-gray-400 text-sm mb-1">Primer punto de venta</p>
              <p className="text-gray-400 text-xs mb-3">Sin al menos un punto de venta, nadie puede iniciar sesión en la empresa.</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={locName} onChange={e => setLocName(e.target.value)} placeholder="Nombre (ej: Principal)"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input value={locAddress} onChange={e => setLocAddress(e.target.value)} placeholder="Dirección (opcional)"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <p className="text-gray-400 text-sm mb-1">Superadministrador de la empresa</p>
              <p className="text-gray-400 text-xs mb-3">Ve todos los puntos y crea a los administradores. Entra con usuario y contraseña.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Nombre"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input value={ownerUser} onChange={e => setOwnerUser(e.target.value.toLowerCase())} placeholder="Usuario"
                  autoComplete="off" className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input type="password" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} placeholder="Contraseña (mín. 10)"
                  autoComplete="new-password" className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={loading || (ownerName.trim() !== '' && (ownerUser.trim().length < 3 || ownerPass.length < 10))}
                className="btn btn-primary flex-1">
                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <h2 className="font-syne text-lg font-bold text-white">¡Cliente creado!</h2>
            <p className="text-gray-400 text-sm">Comparte este link con tu cliente — sus dispositivos quedarán amarrados a su empresa:</p>
            <div className="flex items-center gap-2 bg-surface-400 rounded-xl p-3">
              <code className="text-brand-400 text-sm flex-1 break-all text-left">{fullLink}</code>
              <button onClick={() => {
                navigator.clipboard.writeText(fullLink)
                  .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                  .catch(() => {})
              }} className="btn btn-ghost btn-sm shrink-0">
                {copied ? <span className="text-green-400 text-xs">Copiado ✓</span> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">Listo</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Nuevo punto de venta para una empresa existente ------
function AddLocationModal({ tenant, onClose, onCreated }) {
  const [name,    setName]    = useState(tenant.locations_count === 0 ? 'Principal' : '')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await superApi.post(`/super/tenants/${tenant.id}/locations`, { name, address: address.trim() || undefined })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card bg-surface-300 border-white/10 p-6 w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="font-syne text-lg font-bold text-white">Nuevo punto de venta</h2>
          <p className="text-gray-400 text-sm">Para <span className="text-white">{tenant.name}</span></p>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            placeholder="Nombre (ej: Principal, Stand Norte)"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
          <input value={address} onChange={e => setAddress(e.target.value)}
            placeholder="Dirección (opcional)"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading || !name.trim()} className="btn btn-primary flex-1">
              {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Nuevo superadministrador para una empresa existente ------
function AddOwnerModal({ tenant, onClose, onCreated }) {
  const [name,     setName]     = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      await superApi.post(`/super/tenants/${tenant.id}/admin`, { name: name.trim(), username: username.trim(), password })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="card bg-surface-300 border-white/10 p-6 w-full max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="font-syne text-lg font-bold text-white">Nuevo superadministrador</h2>
          <p className="text-gray-400 text-sm">Para <span className="text-white">{tenant.name}</span></p>
          <p className="text-gray-400 text-xs mb-3">Ve todos los puntos y crea a los administradores. Entra con usuario y contraseña.</p>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            placeholder="Nombre"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
          <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
            placeholder="Usuario" autoComplete="off"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña (mín. 10)" autoComplete="new-password"
            className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
            <button type="submit" disabled={loading || !name.trim() || username.trim().length < 3 || password.length < 10} className="btn btn-primary flex-1">
              {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Edición de vigencia ---------------------------------
function LicenseEditor({ tenant, onSaved }) {
  const [start, setStart] = useState(tenant.license_start)
  const [end,   setEnd]   = useState(tenant.license_end)
  const [saving, setSaving] = useState(false)

  const dirty = start !== tenant.license_start || end !== tenant.license_end

  const save = async () => {
    setSaving(true)
    try {
      await superApi.patch(`/super/tenants/${tenant.id}`, { license_start: start, license_end: end })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input type="date" value={start} onChange={e => setStart(e.target.value)}
        className="px-2 py-1 rounded-lg bg-surface-400 border border-white/10 text-white text-xs" />
      <span className="text-gray-400 text-xs">→</span>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)}
        className="px-2 py-1 rounded-lg bg-surface-400 border border-white/10 text-white text-xs" />
      {dirty && (
        <button onClick={save} disabled={saving} className="btn btn-primary btn-sm">
          {saving ? <Loader2 className="animate-spin h-3 w-3" /> : 'Guardar'}
        </button>
      )}
    </div>
  )
}

// ---- Métricas por rango -----------------------------------
function MetricsSection() {
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setData(await superApi.get(`/super/metrics?from=${from}&to=${to}`)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-line */ }, []) // carga inicial (hoy)

  return (
    <div className="mt-8">
      <h2 className="font-syne text-xl font-bold text-white mb-3">Métricas globales</h2>
      <div className="flex items-end gap-2 flex-wrap mb-3">
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-400 border border-white/10 text-white text-sm" />
        <span className="text-gray-400 pb-2">→</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
          className="px-3 py-2 rounded-xl bg-surface-400 border border-white/10 text-white text-sm" />
        <button onClick={load} disabled={loading} className="btn btn-primary btn-sm">
          {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Consultar'}
        </button>
      </div>
      {data?.tenants?.length > 0 ? (
        <div className="card bg-surface-300 border-white/8 overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="py-1.5 pr-3 font-medium">Cliente</th>
                <th className="py-1.5 pr-3 font-medium text-right">Facturas</th>
                <th className="py-1.5 font-medium text-right">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {data.tenants.map(t => (
                <tr key={t.tenant_id} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-white">{t.tenant_name}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-400">{t.invoice_count}</td>
                  <td className="py-1.5 text-right font-mono text-brand-400">{formatCOP(t.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">{loading ? 'Cargando…' : 'Sin ventas en el rango.'}</p>
      )}
    </div>
  )
}

// ---- Resumen de plataforma ---------------------------------
function PlatformSummary({ tenants }) {
  const active = tenants.filter(t => t.status === 'active')
  const totalLocations = tenants.reduce((n, t) => n + t.locations_count, 0)
  const totalOwners = tenants.reduce((n, t) => n + t.owners.length, 0)
  const expiringSoon = active.filter(t => {
    const d = daysUntil(t.license_end)
    return d != null && d <= 15
  }).length
  const salesToday = tenants.reduce((n, t) => n + t.today_sales, 0)

  const tiles = [
    { label: 'Empresas activas', value: `${active.length}/${tenants.length}` },
    { label: 'Puntos de venta', value: totalLocations },
    { label: 'Superadmins', value: totalOwners },
    { label: 'Licencias por vencer', value: expiringSoon, warn: expiringSoon > 0 },
    { label: 'Ventas hoy (todas)', value: formatCOP(salesToday) },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
      {tiles.map(tile => (
        <div key={tile.label} className="card bg-surface-300 border-white/8 p-3">
          <p className={`text-xl font-bold ${tile.warn ? 'text-amber-400' : 'text-white'}`}>{tile.value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{tile.label}</p>
        </div>
      ))}
    </div>
  )
}

// ---- Dashboard -------------------------------------------
export default function SuperDashboard() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [locTenant, setLocTenant] = useState(null) // tenant al que se le agrega punto de venta
  const [ownerTenant, setOwnerTenant] = useState(null) // tenant al que se le agrega superadministrador
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    try {
      setTenants(await superApi.get('/super/tenants'))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('pv_super_token')) { navigate('/super/login'); return }
    load()
  }, [load, navigate])

  const toggleActive = async (t) => {
    await superApi.patch(`/super/tenants/${t.id}`, { active: !t.active })
    load()
  }

  const handleLogout = () => {
    localStorage.removeItem('pv_super_token')
    navigate('/super/login')
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-syne text-2xl font-bold text-white">Clientes</h1>
            <p className="text-gray-400 text-sm">Panel de plataforma PyroVenta</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn btn-ghost btn-sm"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={() => setShowNew(true)} className="btn btn-primary btn-sm">
              <Plus className="w-4 h-4" /> Nuevo cliente
            </button>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {tenants?.length > 0 && <PlatformSummary tenants={tenants} />}

        {!tenants ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
        ) : tenants.length === 0 ? (
          <div className="card bg-surface-300 border-white/8 p-10 text-center">
            <Building2 className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-400">Aún no hay clientes. Crea el primero.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map(t => (
              <div key={t.id} className="card bg-surface-300 border-white/8 p-4">
                {/* Encabezado: identidad, estado y ventas de hoy */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white truncate">{t.name}</p>
                      <StatusChip status={t.status} />
                      <LicenseCountdown status={t.status} licenseEnd={t.license_end} />
                      {t.locations_count === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30">
                          Sin puntos de venta — no pueden ingresar
                        </span>
                      )}
                      {t.owners.length === 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30">
                          Sin superadministrador
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      /c/{t.slug}
                      {t.last_activity && ` · última venta: ${new Date(t.last_activity).toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-semibold">{formatCOP(t.today_sales)}</p>
                    <p className="text-xs text-gray-400">{t.today_invoices} factura{t.today_invoices === 1 ? '' : 's'} hoy</p>
                  </div>
                </div>

                {/* Cuerpo: puntos de venta, superadmins y personal */}
                <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Puntos de venta ({t.locations.length})
                    </p>
                    {t.locations.length === 0 ? (
                      <p className="text-gray-500 text-xs">Ninguno todavía</p>
                    ) : (
                      <ul className="space-y-1">
                        {t.locations.map(l => (
                          <li key={l.id} className={`flex items-baseline gap-1.5 ${l.active ? 'text-white' : 'text-gray-500 line-through'}`}>
                            <span className="font-medium">{l.name}</span>
                            {l.address && <span className="text-gray-400 text-xs font-normal truncate">— {l.address}</span>}
                            {!l.active && <span className="text-xs">(inactivo)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Superadministradores ({t.owners.length})
                    </p>
                    {t.owners.length === 0 ? (
                      <p className="text-gray-500 text-xs">Ninguno — crea uno para que la empresa pueda administrarse</p>
                    ) : (
                      <ul className="space-y-1">
                        {t.owners.map(o => (
                          <li key={o.id} className="text-white">
                            {o.name} <span className="text-gray-400 text-xs font-mono">· {o.username}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs mt-1.5 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-gray-500" /> <StaffSummary staffCount={t.staff_count} />
                    </p>
                  </div>
                </div>

                {/* Pie: vigencia y acciones */}
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap items-center gap-2 justify-between">
                  <LicenseEditor key={`${t.id}-${t.license_start}-${t.license_end}`} tenant={t} onSaved={load} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLocTenant(t)}
                      className="btn btn-ghost btn-sm btn-touch-safe"
                      title="Agregar punto de venta"
                    >
                      <Plus className="w-4 h-4" /> Punto
                    </button>
                    <button
                      onClick={() => setOwnerTenant(t)}
                      className="btn btn-ghost btn-sm btn-touch-safe"
                      title="Agregar superadministrador"
                    >
                      <Plus className="w-4 h-4" /> Superadmin
                    </button>
                    <button
                      onClick={() => toggleActive(t)}
                      className={`btn btn-sm btn-touch-safe ${t.active ? 'btn-ghost text-red-400' : 'btn-primary'}`}
                      title={t.active ? 'Suspender' : 'Reactivar'}
                    >
                      {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {t.active ? 'Suspender' : 'Activar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <MetricsSection />
      </div>

      {showNew && <NewTenantModal onClose={() => setShowNew(false)} onCreated={load} />}
      {locTenant && <AddLocationModal tenant={locTenant} onClose={() => setLocTenant(null)} onCreated={load} />}
      {ownerTenant && <AddOwnerModal tenant={ownerTenant} onClose={() => setOwnerTenant(null)} onCreated={load} />}
    </div>
  )
}
