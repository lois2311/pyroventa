import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Building2, CalendarClock, CheckCircle2, Copy, Flame, Loader2, LogOut, MapPin, Package,
  Pause, Play, Plus, RefreshCw, ShieldCheck, Users, Wallet,
} from 'lucide-react'
import { superApi } from '../lib/superApi.js'
import { formatCOP, formatRangeLabel } from '../lib/format.js'
import DateRangeBar, { toISO } from '../components/DateRangeBar.jsx'
import Modal from '../components/Modal.jsx'
import PageHeader, { SectionHeader } from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import MetricTile from '../components/MetricTile.jsx'

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
  if (parts.length === 0) return <span className="text-gray-400">Sin personal por punto</span>
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
  const [hasInventory, setHasInventory] = useState(false)
  const [ownerName,  setOwnerName]  = useState('')
  const [ownerUser,  setOwnerUser]  = useState('')
  const [ownerPass,  setOwnerPass]  = useState('')
  const [locName,    setLocName]    = useState('Principal')
  const [locAddress, setLocAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [created, setCreated] = useState(null) // { tenant, link }
  const [copied, setCopied] = useState(null) // null | 'ok' | 'fail'
  const linkRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const body = { name, slug, license_start: start, license_end: end, has_inventory: hasInventory }
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
  const ownerIncomplete = ownerName.trim() !== '' && (ownerUser.trim().length < 3 || ownerPass.length < 10)

  if (created) {
    return (
      <Modal
        title="¡Cliente creado!"
        icon={CheckCircle2}
        description="Comparte este link con tu cliente: sus dispositivos quedarán amarrados a su empresa."
        onClose={onClose}
        footer={<button type="button" onClick={onClose} className="btn-primary">Listo</button>}
      >
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-surface-400 p-3">
          <code ref={linkRef} className="flex-1 break-all text-left text-sm text-brand-400">{fullLink}</code>
          <button type="button" onClick={async () => {
            try {
              // Sin HTTPS navigator.clipboard no existe: también cae al catch
              await navigator.clipboard.writeText(fullLink)
              setCopied('ok')
              setTimeout(() => setCopied(null), 2000)
            } catch {
              // Deja el link seleccionado para copiarlo a mano
              const range = document.createRange()
              range.selectNodeContents(linkRef.current)
              window.getSelection()?.removeAllRanges()
              window.getSelection()?.addRange(range)
              setCopied('fail')
            }
          }} className="btn-outline btn-sm shrink-0" aria-label="Copiar link">
            {copied === 'ok' ? <span className="text-xs text-green-400">Copiado ✓</span> : <><Copy className="h-4 w-4" /> Copiar</>}
          </button>
        </div>
        {copied === 'fail' && (
          <p role="status" className="mt-2 text-xs text-amber-300">
            No se pudo copiar automáticamente: el link quedó seleccionado, cópialo con Ctrl+C (o mantén presionado en el celular).
          </p>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="Nuevo cliente"
      icon={Building2}
      size="lg"
      closeOnBackdrop={false}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={loading || ownerIncomplete} className="btn-primary">
          {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear cliente'}
        </button>
      </>}
    >
      <div>
        <label htmlFor="nt-name" className="field-label">Nombre de la empresa</label>
        <input id="nt-name" value={name} onChange={e => {
            setName(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }} required autoFocus
          placeholder="Pirotecnia El Cohetón"
          className="input" />
      </div>
      <div>
        <label htmlFor="nt-slug" className="field-label">Código (slug) — será el link /c/&lt;código&gt;</label>
        <input id="nt-slug" value={slug}
          onChange={e => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
          placeholder="pirotecnia-el-coheton"
          className="input font-mono" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="nt-start" className="field-label">Inicio licencia</label>
          <input id="nt-start" type="date" value={start} onChange={e => setStart(e.target.value)} required className="input" />
        </div>
        <div>
          <label htmlFor="nt-end" className="field-label">Fin licencia</label>
          <input id="nt-end" type="date" value={end} onChange={e => setEnd(e.target.value)} required className="input" />
        </div>
      </div>

      <label htmlFor="modal-has-inventory" className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-surface-400 p-3 has-[:checked]:border-brand-500/40">
        <input
          type="checkbox"
          id="modal-has-inventory"
          checked={hasInventory}
          onChange={e => setHasInventory(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-500"
        />
        <span className="select-none text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <Package className="h-4 w-4 text-brand-400" />
            Control de inventario
          </span>
          <span className="mt-0.5 block text-xs text-gray-400">
            Permite cargar stock a productos y descontar existencias automáticamente en cada venta.
          </span>
        </span>
      </label>

      <fieldset className="space-y-3 border-t border-white/10 pt-4">
        <legend className="sr-only">Primer punto de venta</legend>
        <div>
          <p className="text-sm font-medium text-gray-200">Primer punto de venta</p>
          <p className="text-xs text-gray-400">Sin al menos un punto de venta, nadie puede iniciar sesión en la empresa.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={locName} onChange={e => setLocName(e.target.value)} placeholder="Nombre (ej: Principal)"
            aria-label="Nombre del punto de venta" className="input" />
          <input value={locAddress} onChange={e => setLocAddress(e.target.value)} placeholder="Dirección (opcional)"
            aria-label="Dirección del punto de venta" className="input" />
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t border-white/10 pt-4">
        <legend className="sr-only">Superadministrador de la empresa</legend>
        <div>
          <p className="text-sm font-medium text-gray-200">Superadministrador de la empresa</p>
          <p className="text-xs text-gray-400">Ve todos los puntos y crea a los administradores. Entra con usuario y contraseña.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <input value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Nombre"
            aria-label="Nombre del superadministrador" className="input" />
          <input value={ownerUser} onChange={e => setOwnerUser(e.target.value.toLowerCase())} placeholder="Usuario"
            aria-label="Usuario del superadministrador" autoComplete="off" className="input" />
          <input type="password" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} placeholder="Contraseña (mín. 10)"
            aria-label="Contraseña del superadministrador" autoComplete="new-password" className="input" />
        </div>
      </fieldset>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </Modal>
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
    <Modal
      title="Nuevo punto de venta"
      icon={MapPin}
      description={<>Para <span className="text-white">{tenant.name}</span></>}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={loading || !name.trim()} className="btn-primary">
          {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear punto'}
        </button>
      </>}
    >
      <div>
        <label htmlFor="al-name" className="field-label">Nombre</label>
        <input id="al-name" value={name} onChange={e => setName(e.target.value)} required autoFocus
          placeholder="Ej: Principal, Stand Norte" className="input" />
      </div>
      <div>
        <label htmlFor="al-address" className="field-label">Dirección <span className="font-normal">(opcional)</span></label>
        <input id="al-address" value={address} onChange={e => setAddress(e.target.value)}
          placeholder="Calle, número, barrio" className="input" />
      </div>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </Modal>
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
    <Modal
      title="Nuevo superadministrador"
      icon={ShieldCheck}
      description={<>Para <span className="text-white">{tenant.name}</span>. Ve todos los puntos y crea a los administradores; entra con usuario y contraseña.</>}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={loading || !name.trim() || username.trim().length < 3 || password.length < 10} className="btn-primary">
          {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Crear superadmin'}
        </button>
      </>}
    >
      <div>
        <label htmlFor="ao-name" className="field-label">Nombre</label>
        <input id="ao-name" value={name} onChange={e => setName(e.target.value)} required autoFocus
          placeholder="Nombre y apellido" className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ao-user" className="field-label">Usuario</label>
          <input id="ao-user" value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
            placeholder="Mínimo 3 caracteres" autoComplete="off" className="input" />
        </div>
        <div>
          <label htmlFor="ao-pass" className="field-label">Contraseña</label>
          <input id="ao-pass" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Mínimo 10 caracteres" autoComplete="new-password" className="input" />
        </div>
      </div>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
    </Modal>
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow w-full sm:w-auto">Licencia</span>
      <input type="date" value={start} onChange={e => setStart(e.target.value)}
        aria-label={`Inicio de licencia de ${tenant.name}`}
        className="input w-auto text-xs" />
      <span className="text-xs text-gray-400" aria-hidden="true">→</span>
      <input type="date" value={end} onChange={e => setEnd(e.target.value)}
        aria-label={`Fin de licencia de ${tenant.name}`}
        className="input w-auto text-xs" />
      {dirty && (
        <button type="button" onClick={save} disabled={saving} className="btn-primary btn-sm">
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

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await superApi.get(`/super/metrics?from=${from}&to=${to}`)) }
    catch { setData(null) }
    finally { setLoading(false) }
  }, [from, to])
  // Se consulta solo al cambiar el rango: sin botón extra de por medio
  useEffect(() => { load() }, [load])

  const totalRevenue = (data?.tenants || []).reduce((n, t) => n + Number(t.revenue || 0), 0)

  return (
    <section>
      <SectionHeader
        title="Métricas globales"
        icon={BarChart3}
        description={formatRangeLabel(from, to)}
        actions={
          <button type="button" onClick={load} disabled={loading} className="btn-outline btn-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        }
      />
      <div className="space-y-3">
        <div className="toolbar panel p-3 sm:p-4">
          <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
        </div>
        {data?.tenants?.length > 0 ? (
          <div className={`panel relative overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[420px] text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-gray-400">
                  <th scope="col" className="py-2.5 pl-4 pr-3 font-medium sm:pl-5">Cliente</th>
                  <th scope="col" className="py-2.5 pr-3 text-right font-medium">Facturas</th>
                  <th scope="col" className="py-2.5 pr-4 text-right font-medium sm:pr-5">Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {data.tenants.map(t => (
                  <tr key={t.tenant_id} className="border-t border-white/5">
                    <td className="py-2 pl-4 pr-3 text-white sm:pl-5">{t.tenant_name}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{t.invoice_count}</td>
                    <td className="py-2 pr-4 text-right font-mono text-gray-200 sm:pr-5">{formatCOP(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              {data.tenants.length > 1 && (
                <tfoot>
                  <tr className="border-t border-white/10">
                    <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-semibold text-white sm:pl-5">Total</th>
                    <td className="py-2.5 pr-3 text-right text-gray-300">{data.tenants.reduce((n, t) => n + Number(t.invoice_count || 0), 0)}</td>
                    <td className="py-2.5 pr-4 text-right font-mono font-semibold text-brand-400 sm:pr-5">{formatCOP(totalRevenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : loading ? (
          <div className="skeleton h-24 rounded-xl" />
        ) : (
          <EmptyState compact icon={BarChart3} title="Sin ventas en el rango" />
        )}
      </div>
    </section>
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
  const int = (n) => Math.round(n)

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <MetricTile icon={Building2} label="Empresas activas" value={`${active.length}/${tenants.length}`} />
      <MetricTile icon={MapPin} label="Puntos de venta" value={totalLocations} format={int} />
      <MetricTile icon={ShieldCheck} label="Superadmins" value={totalOwners} format={int} />
      <MetricTile icon={CalendarClock} label="Licencias por vencer" value={expiringSoon} format={int}
        color={expiringSoon > 0 ? 'text-amber-400' : 'text-white'} sub="en 15 días o menos" />
      <MetricTile icon={Wallet} label="Ventas hoy (todas)" value={salesToday} format={formatCOP}
        color="text-brand-400" className="col-span-2 sm:col-span-1" />
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

  const toggleInventory = async (t) => {
    try {
      await superApi.patch(`/super/tenants/${t.id}`, { has_inventory: !t.has_inventory })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('pv_super_token')
    navigate('/super/login')
  }

  return (
    <div className="min-h-[100dvh] bg-surface-600">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-gutter py-8 sm:py-10">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-500">
            <Flame className="h-4 w-4" /> <span className="font-syne">PyroVenta</span>
            <span className="font-normal text-gray-400">· Plataforma</span>
          </p>
          <PageHeader
            title="Clientes"
            description={tenants ? `${tenants.length} empresa${tenants.length !== 1 ? 's' : ''} registrada${tenants.length !== 1 ? 's' : ''}` : 'Panel de plataforma PyroVenta'}
            actions={<>
              <button type="button" onClick={load} className="btn-outline btn-icon" aria-label="Actualizar lista" title="Actualizar">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setShowNew(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Nuevo cliente
              </button>
              <button type="button" onClick={handleLogout} className="btn-ghost btn-icon" aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </button>
            </>}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{error}</p>
        )}

        {tenants?.length > 0 && <PlatformSummary tenants={tenants} />}

        {!tenants ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-40 rounded-xl" />)}</div>
        ) : tenants.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aún no hay clientes"
            description="Crea el primero: su link de acceso queda listo para compartir."
            action={<button type="button" onClick={() => setShowNew(true)} className="btn-primary"><Plus className="h-4 w-4" /> Nuevo cliente</button>}
          />
        ) : (
          <ul className="space-y-3">
            {tenants.map(t => (
              <li key={t.id} className="card bg-surface-300 border-white/8">
                {/* Encabezado: identidad, estado y ventas de hoy */}
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-white">{t.name}</h2>
                      <StatusChip status={t.status} />
                      <LicenseCountdown status={t.status} licenseEnd={t.license_end} />
                      {t.has_inventory ? (
                        <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          <Package className="w-3 h-3" /> Con inventario
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-gray-400">
                          Sin inventario
                        </span>
                      )}
                      {t.locations_count === 0 && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          Sin puntos de venta — no pueden ingresar
                        </span>
                      )}
                      {t.owners.length === 0 && (
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          Sin superadministrador
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      <span className="font-mono">/c/{t.slug}</span>
                      {t.last_activity && ` · última venta: ${new Date(t.last_activity).toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono font-semibold tabular-nums text-white">{formatCOP(t.today_sales)}</p>
                    <p className="text-xs text-gray-400">{t.today_invoices} factura{t.today_invoices === 1 ? '' : 's'} hoy</p>
                  </div>
                </div>

                {/* Cuerpo: puntos de venta, superadmins y personal */}
                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/5 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="eyebrow mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Puntos de venta ({t.locations.length})
                    </p>
                    {t.locations.length === 0 ? (
                      <p className="text-gray-400 text-xs">Ninguno todavía</p>
                    ) : (
                      <ul className="space-y-1">
                        {t.locations.map(l => (
                          <li key={l.id} className={`flex items-baseline gap-1.5 ${l.active ? 'text-white' : 'text-gray-400 line-through'}`}>
                            <span className="font-medium">{l.name}</span>
                            {l.address && <span className="text-gray-400 text-xs font-normal truncate">— {l.address}</span>}
                            {!l.active && <span className="text-xs">(inactivo)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="eyebrow mb-1.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" /> Superadministradores ({t.owners.length})
                    </p>
                    {t.owners.length === 0 ? (
                      <p className="text-gray-400 text-xs">Ninguno — crea uno para que la empresa pueda administrarse</p>
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
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
                  <LicenseEditor key={`${t.id}-${t.license_start}-${t.license_end}`} tenant={t} onSaved={load} />
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setLocTenant(t)}
                      className="btn-ghost btn-sm btn-touch-safe"
                      title="Agregar punto de venta"
                    >
                      <Plus className="w-4 h-4" /> Punto
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnerTenant(t)}
                      className="btn-ghost btn-sm btn-touch-safe"
                      title="Agregar superadministrador"
                    >
                      <Plus className="w-4 h-4" /> Superadmin
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleInventory(t)}
                      aria-pressed={t.has_inventory}
                      className={`btn-ghost btn-sm btn-touch-safe ${t.has_inventory ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-400'}`}
                      title={t.has_inventory ? 'Desactivar inventario para este cliente' : 'Activar inventario para este cliente'}
                    >
                      <Package className="w-4 h-4" />
                      {t.has_inventory ? 'Inventario: Sí' : 'Inventario: No'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(t)}
                      className={`btn-sm btn-touch-safe ${t.active ? 'btn-ghost text-red-400' : 'btn-primary'}`}
                      title={t.active ? 'Suspender' : 'Reactivar'}
                    >
                      {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {t.active ? 'Suspender' : 'Activar'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <MetricsSection />
      </div>

      {showNew && <NewTenantModal onClose={() => setShowNew(false)} onCreated={load} />}
      {locTenant && <AddLocationModal tenant={locTenant} onClose={() => setLocTenant(null)} onCreated={load} />}
      {ownerTenant && <AddOwnerModal tenant={ownerTenant} onClose={() => setOwnerTenant(null)} onCreated={load} />}
    </div>
  )
}
