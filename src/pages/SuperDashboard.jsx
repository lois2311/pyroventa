import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Copy, Loader2, LogOut, Pause, Play, Plus, RefreshCw } from 'lucide-react'
import { superApi } from '../lib/superApi.js'
import { formatCOP } from '../lib/format.js'

const STATUS_LABEL = {
  active:              { text: 'Activo',        cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  TENANT_SUSPENDED:    { text: 'Suspendido',    cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  LICENSE_EXPIRED:     { text: 'Vencido',       cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  LICENSE_NOT_STARTED: { text: 'No iniciado',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' },
}

const STATUS_UNKNOWN = { text: 'Desconocido', cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30' }

function StatusChip({ status }) {
  const s = STATUS_LABEL[status] || STATUS_UNKNOWN
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>{s.text}</span>
}

// ---- Wizard de nuevo cliente -----------------------------
function NewTenantModal({ onClose, onCreated }) {
  const [name,   setName]   = useState('')
  const [start,  setStart]  = useState('')
  const [end,    setEnd]    = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminPin,  setAdminPin]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [created, setCreated] = useState(null) // { tenant, link }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const body = { name, license_start: start, license_end: end }
      if (adminName.trim()) body.admin = { name: adminName.trim(), pin: adminPin }
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
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus
                placeholder="Pirotecnia El Cohetón"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
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
              <p className="text-gray-400 text-sm mb-3">Primer administrador (opcional)</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Nombre"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
                <input value={adminPin} onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN (4 dígitos)" inputMode="numeric"
                  className="w-full px-3 py-2.5 rounded-xl bg-surface-400 border-2 border-white/10 text-white focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
              <button type="submit" disabled={loading || (adminName.trim() !== '' && adminPin.length !== 4)}
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
              <button onClick={() => navigator.clipboard.writeText(fullLink).catch(() => {})} className="btn btn-ghost btn-sm shrink-0">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">Listo</button>
          </div>
        )}
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
      <span className="text-gray-600 text-xs">→</span>
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

// ---- Dashboard -------------------------------------------
export default function SuperDashboard() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState(null)
  const [showNew, setShowNew] = useState(false)
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
            <p className="text-gray-500 text-sm">Panel de plataforma PyroVenta</p>
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

        {!tenants ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
        ) : tenants.length === 0 ? (
          <div className="card bg-surface-300 border-white/8 p-10 text-center">
            <Building2 className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Aún no hay clientes. Crea el primero.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map(t => (
              <div key={t.id} className="card bg-surface-300 border-white/8 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white truncate">{t.name}</p>
                      <StatusChip status={t.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      /c/{t.slug}
                      {t.last_activity && ` · última venta: ${new Date(t.last_activity).toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-semibold">{formatCOP(t.today_sales)}</p>
                    <p className="text-xs text-gray-500">{t.today_invoices} facturas hoy</p>
                  </div>
                  <button
                    onClick={() => toggleActive(t)}
                    className={`btn btn-sm ${t.active ? 'btn-ghost text-red-400' : 'btn-primary'}`}
                    title={t.active ? 'Suspender' : 'Reactivar'}
                  >
                    {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    {t.active ? 'Suspender' : 'Activar'}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5">
                  <LicenseEditor key={`${t.id}-${t.license_start}-${t.license_end}`} tenant={t} onSaved={load} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewTenantModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  )
}
