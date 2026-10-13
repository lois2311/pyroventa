import { useEffect, useId, useState } from 'react'
import { Save } from 'lucide-react'
import { api } from '../../../lib/api.js'
import { useApi } from '../../../hooks/useApi.js'
import PageHeader from '../../../components/PageHeader.jsx'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import Select from '../../../components/Select.jsx'
import { useToast } from '../../../components/Toast.jsx'
import { FormError } from '../shared.jsx'
import { MONO } from './shared.jsx'

const DAYS = [
  ['mon', 'Lun'], ['tue', 'Mar'], ['wed', 'Mié'], ['thu', 'Jue'], ['fri', 'Vie'], ['sat', 'Sáb'], ['sun', 'Dom'],
]

/** Respuesta del servidor → estado editable del formulario. */
const toForm = (s) => ({
  enabled: s.enabled,
  public_slug: s.public_slug || '',
  payment_methods: s.payment_methods,
  transfer_instructions: s.transfer_details?.instructions || '',
  accept_policy: s.accept_policy,
  quote_ttl_minutes: String(s.quote_ttl_minutes),
  delivery_fee: s.delivery_fee == null ? '' : String(s.delivery_fee),
  days: s.business_hours?.days || [],
  open: s.business_hours?.open || '',
  close: s.business_hours?.close || '',
})

const toBody = (f) => ({
  enabled: f.enabled,
  public_slug: f.public_slug.trim(),
  payment_methods: f.payment_methods,
  transfer_details: { instructions: f.transfer_instructions },
  accept_policy: f.accept_policy,
  quote_ttl_minutes: Number(f.quote_ttl_minutes),
  delivery_fee: f.delivery_fee === '' ? null : Number(f.delivery_fee),
  business_hours: f.days.length || f.open || f.close ? { days: f.days, open: f.open, close: f.close } : {},
})

// ===========================================================
// TAB: Configuración de Pedidos (por sede). Permiso manage_connect.
// ===========================================================
export default function PedidosConfigTab({ locations, isOwner }) {
  // La lista de puntos llega después del primer render: se resuelve al leerla, no al montar
  const [picked, setPicked] = useState('')
  const locationId = picked || locations[0]?.id || ''
  const setLocationId = setPicked
  const q = useApi(locationId ? `/orders/settings?location_id=${locationId}` : null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración de pedidos"
        description="Horario, formas de pago y reglas con las que tu negocio recibe pedidos en línea."
      />
      {(isOwner || locations.length > 1) && (
        <div className="max-w-xs">
          <label htmlFor="pcfg-loc" className="field-label">Sede de despacho</label>
          <Select id="pcfg-loc" value={locationId} onChange={setLocationId}
            options={locations.map(l => ({ value: l.id, label: l.name }))} />
        </div>
      )}
      <ErrorNotice error={q.error} title="No se pudo cargar la configuración" onRetry={q.refetch} />
      {q.loading && !q.data && <div className="skeleton h-72 rounded-lg" role="status" aria-label="Cargando configuración" />}
      {q.data && q.data.location_id === locationId && (
        <SettingsForm key={locationId} settings={q.data} locationId={locationId} onSaved={q.setData} />
      )}
    </div>
  )
}

function SettingsForm({ settings, locationId, onSaved }) {
  const fid = useId()
  const toast = useToast()
  const [form, setForm] = useState(() => toForm(settings))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => setForm(f => ({ ...f, ...patch }))

  // Tras guardar, el formulario vuelve a coincidir con lo persistido
  useEffect(() => { setForm(toForm(settings)) }, [settings])
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings))

  const toggle = (key, value) => set({ [key]: form[key].includes(value) ? form[key].filter(v => v !== value) : [...form[key], value] })
  const transfer = form.payment_methods.includes('transfer')
  const multiZone = settings.zones_count > 1

  const save = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    try {
      const saved = await api.put(`/orders/settings?location_id=${locationId}`, toBody({ ...form, delivery_fee: multiZone ? '' : form.delivery_fee }))
      onSaved(saved)
      toast.success('Configuración guardada')
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Card title="Recepción de pedidos">
        <Check checked={form.enabled} onChange={v => set({ enabled: v })}
          label="Recibir pedidos en línea" hint="Si está apagado, el formulario público no responde." />
        <div className="max-w-md">
          <label htmlFor={`${fid}-slug`} className="field-label">Identificador del enlace público</label>
          <input id={`${fid}-slug`} className={`input ${MONO}`} value={form.public_slug} maxLength={64} autoComplete="off"
            placeholder="mi-negocio" onChange={e => set({ public_slug: e.target.value.toLowerCase() })} />
          <p className="field-hint">Letras minúsculas, números y guiones. Identifica a tu negocio en la dirección del formulario.</p>
        </div>
      </Card>

      <Card title="Horario de atención">
        <div role="group" aria-label="Días de atención" className="flex flex-wrap gap-2">
          {DAYS.map(([id, label]) => (
            <label key={id} className="flex min-h-[var(--control-h)] min-w-14 cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-surface-400 px-3 text-sm text-gray-300 has-[:checked]:border-brand-500/50 has-[:checked]:bg-brand-500/10 has-[:checked]:text-brand-300">
              <input type="checkbox" className="sr-only" checked={form.days.includes(id)} onChange={() => toggle('days', id)} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor={`${fid}-open`} className="field-label">Abre</label>
            <input id={`${fid}-open`} type="time" className={`input ${MONO}`} value={form.open} onChange={e => set({ open: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${fid}-close`} className="field-label">Cierra</label>
            <input id={`${fid}-close`} type="time" className={`input ${MONO}`} value={form.close} onChange={e => set({ close: e.target.value })} />
          </div>
        </div>
      </Card>

      <Card title="Pagos">
        <div className="space-y-2">
          <Check checked={form.payment_methods.includes('cash_on_delivery')} onChange={() => toggle('payment_methods', 'cash_on_delivery')} label="Contraentrega" />
          <Check checked={transfer} onChange={() => toggle('payment_methods', 'transfer')} label="Transferencia bancaria" />
        </div>
        {transfer && (
          <div className="max-w-xl">
            <label htmlFor={`${fid}-tr`} className="field-label">Instrucciones para transferir</label>
            <textarea id={`${fid}-tr`} rows={3} maxLength={500} className="input resize-none" value={form.transfer_instructions}
              placeholder="Banco, tipo y número de cuenta, titular, a dónde enviar el comprobante"
              onChange={e => set({ transfer_instructions: e.target.value })} />
          </div>
        )}
        <Check
          checked={form.accept_policy === 'allow_pending_transfer'}
          onChange={v => set({ accept_policy: v ? 'allow_pending_transfer' : 'require_verified' })}
          label="Aceptar pedidos con transferencia pendiente"
          hint="Por defecto un pedido por transferencia solo se acepta cuando verificas el pago."
        />
      </Card>

      <Card title="Cotización y domicilio">
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor={`${fid}-fee`} className="field-label">Tarifa de domicilio (COP)</label>
            <input id={`${fid}-fee`} type="number" inputMode="numeric" min="0" step="100" className={`input w-44 ${MONO}`}
              value={form.delivery_fee} disabled={multiZone} placeholder="0"
              onChange={e => set({ delivery_fee: e.target.value })} />
            {multiZone && <p className="field-hint">Hay {settings.zones_count} zonas activas: la tarifa se maneja por zona.</p>}
          </div>
          <div>
            <label htmlFor={`${fid}-ttl`} className="field-label">Vigencia de la cotización (min)</label>
            <input id={`${fid}-ttl`} type="number" inputMode="numeric" min="5" max="60" className={`input w-44 ${MONO}`}
              value={form.quote_ttl_minutes} onChange={e => set({ quote_ttl_minutes: e.target.value })} />
          </div>
        </div>
      </Card>

      <FormError message={error} />
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving || !dirty}>
          <Save className="h-4 w-4" aria-hidden="true" /> {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

function Card({ title, children }) {
  return (
    <section className="card space-y-4">
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  )
}

function Check({ checked, onChange, label, hint }) {
  return (
    <label className="flex min-h-[var(--control-h)] cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" />
      <span className="text-sm text-white">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-gray-400">{hint}</span>}
      </span>
    </label>
  )
}
