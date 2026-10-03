import { useId, useState } from 'react'
import { MapPin, Monitor, Plus, Receipt, StickyNote } from 'lucide-react'
import { api } from '../../lib/api.js'
import { formatCOP, formatDayShort } from '../../lib/format.js'
import { useApi } from '../../hooks/useApi.js'
import { useFieldErrors } from '../../hooks/useFieldErrors.js'
import Modal from '../../components/Modal.jsx'
import PageHeader, { SectionHeader } from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import FieldError from '../../components/FieldError.jsx'
import DateRangeBar, { toISO } from '../../components/DateRangeBar.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { useToast } from '../../components/Toast.jsx'
import { FormError, SkeletonGrid } from './shared.jsx'
import Select from '../../components/Select.jsx'

// ===========================================================
// TAB: Cajas / Registradoras
// ===========================================================
export default function CajasTab({ locations }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()
  const registersQ = useApi('/registers', { initialData: [] })
  const registers = registersQ.data || []
  const [showForm,   setShowForm]   = useState(false)
  const [editReg,    setEditReg]    = useState(null)

  const handleDelete = async (reg) => {
    const ok = await confirm({
      title: `¿Desactivar ${reg.name}?`,
      description: 'La caja deja de aparecer para cobrar. Sus cobros y cierres anteriores se conservan.',
      confirmLabel: 'Desactivar',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.delete(`/registers/${reg.id}`)
      registersQ.refetch()
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

        <ErrorNotice error={registersQ.error} title="No se pudieron cargar las cajas" onRetry={registersQ.refetch} />

        {registersQ.loading && !registers.length ? (
          <SkeletonGrid count={3} height="h-16" />
        ) : registers.length === 0 ? (
          !registersQ.error && <EmptyState icon={Monitor} title="No hay cajas registradas" description="Crea una caja para cada registradora física de tu negocio." />
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
                        aria-label={`Editar ${reg.name}`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(reg)}
                        className="btn-ghost btn-sm btn-touch-safe text-red-400"
                        aria-label={`Quitar ${reg.name}`}
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
          onSave={() => { registersQ.refetch(); setShowForm(false) }}
        />
      )}

      <ClosuresSection locations={locations} />
    </div>
  )
}

// ---- Cierres de caja (arqueos) ---------------------------
function ClosuresSection({ locations }) {
  const hoy = toISO(new Date())
  const [from, setFrom] = useState(hoy)
  const [to,   setTo]   = useState(hoy)
  const [locFilter, setLocFilter] = useState('')

  const params = new URLSearchParams({ from, to })
  if (locFilter) params.set('location_id', locFilter)
  // Cambiar el rango rápido ya no puede dejar en pantalla la respuesta de un
  // rango anterior que llegó tarde: useApi cancela el pedido viejo.
  const closuresQ = useApi(`/closures?${params.toString()}`, { initialData: null })
  const closures = closuresQ.data

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
            <Select id="closures-location" value={locFilter} onChange={setLocFilter}
              options={[{ value: '', label: 'Todos' }, ...locations.map(l => ({ value: l.id, label: l.name }))]} />
          </div>
        )}
      </div>

      <ErrorNotice error={closuresQ.error} title="No se pudieron cargar los cierres" onRetry={closuresQ.refetch} />

      {!closures ? (
        !closuresQ.error && <div className="space-y-2">{[1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
      ) : closures.length === 0 ? (
        <EmptyState
          compact
          icon={Receipt}
          title="Sin cierres en el rango"
          description="La cajera hace el cierre desde la pantalla de caja (botón Cierre de caja, F3)."
        />
      ) : (
        <ul className={`panel divide-y divide-white/5 overflow-hidden transition-opacity ${closuresQ.loading ? 'opacity-60' : ''}`}>
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
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)
  const [name,       setName]       = useState(register?.name || '')
  const [locationId, setLocationId] = useState(register?.location_id || locations[0]?.id || '')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  const handleSave = async () => {
    setFormError('')
    const ok = validate({
      name: !name.trim() && 'El nombre es requerido',
      loc: !register && !locationId && 'Selecciona un punto de venta',
    })
    if (!ok) return
    setSaving(true)
    try {
      if (register?.id) {
        await api.put(`/registers/${register.id}`, { name: name.trim() })
      } else {
        await api.post('/registers', { name: name.trim(), location_id: locationId })
      }
      onSave()
    } catch (err) { setFormError(err.message) }
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
          {...describe('name')}
          onChange={e => { setName(e.target.value); clear('name') }}
          className="input"
          autoFocus
        />
        <FieldError id={`${fid}-name-error`}>{errors.name}</FieldError>
      </div>
      {!register && locations.length > 1 && (
        <div>
          <label htmlFor={`${fid}-loc`} className="field-label">Punto de venta</label>
          <Select id={`${fid}-loc`} value={locationId} {...describe('loc')}
            onChange={v => { setLocationId(v); clear('loc') }}
            options={locations.map(l => ({ value: l.id, label: l.name }))} />
          <FieldError id={`${fid}-loc-error`}>{errors.loc}</FieldError>
        </div>
      )}
      {!register && !locationId && locations.length <= 1 && (
        <FieldError id={`${fid}-loc-error`}>{errors.loc}</FieldError>
      )}
      <FormError message={formError} />
    </Modal>
  )
}
