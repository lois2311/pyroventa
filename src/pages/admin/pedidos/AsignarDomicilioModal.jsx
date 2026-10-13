import { useId, useState } from 'react'
import { Bike } from 'lucide-react'
import { api } from '../../../lib/api.js'
import { useApi } from '../../../hooks/useApi.js'
import Modal from '../../../components/Modal.jsx'
import Select from '../../../components/Select.jsx'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import { useToast } from '../../../components/Toast.jsx'
import { FormError } from '../shared.jsx'
import { useActionKeys } from './shared.jsx'

// Asignar un domiciliario a un pedido aceptado = autorizar el despacho.
export default function AsignarDomicilioModal({ order, onClose, onAssigned }) {
  const fid = useId()
  const toast = useToast()
  const keys = useActionKeys()
  const drivers = useApi(`/orders/drivers?location_id=${order.location_id}`, { initialData: [] })
  const [driverId, setDriverId] = useState('')
  const [instructions, setInstructions] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const list = drivers.data || []
  const submit = async () => {
    if (saving) return
    if (!driverId) { setError('Elige un domiciliario'); return }
    setSaving(true); setError('')
    try {
      await api.post(`/orders/requests/${order.id}/deliveries`, { driver_id: driverId, instructions },
        { headers: { 'Idempotency-Key': keys.get('assign') } })
      keys.done('assign')
      toast.success('Domicilio asignado')
      onAssigned?.()
      onClose()
    } catch (err) {
      setError(err.message)
      if (err.status === 409 || err.status === 422) keys.done('assign') // no es un reintento de la misma operación
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Asignar domiciliario" icon={Bike} size="sm" onClose={onClose} onSubmit={submit}
      description="Al asignarlo autorizas el despacho: el domiciliario verá el pedido en su celular."
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={saving || !list.length}>{saving ? 'Asignando…' : 'Asignar'}</button>
      </>}
    >
      <div className="space-y-4">
        <ErrorNotice error={drivers.error} title="No se pudieron cargar los domiciliarios" onRetry={drivers.refetch} />
        {!drivers.loading && !drivers.error && !list.length ? (
          <p role="status" className="rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-400">
            No hay domiciliarios activos en este punto. Créalos en Usuarios con el rol Domiciliario.
          </p>
        ) : (
          <div>
            <label htmlFor={`${fid}-driver`} className="field-label">Domiciliario</label>
            <Select id={`${fid}-driver`} value={driverId} onChange={setDriverId} placeholder="Elige uno…"
              options={list.map(d => ({ value: d.id, label: d.name }))} />
          </div>
        )}
        <div>
          <label htmlFor={`${fid}-notes`} className="field-label">Indicaciones <span className="font-normal">(opcional)</span></label>
          <textarea id={`${fid}-notes`} rows={2} maxLength={300} className="input resize-none" value={instructions}
            placeholder="Ej.: llamar al llegar, dejar con el portero" onChange={e => setInstructions(e.target.value)} />
        </div>
        <FormError message={error} />
      </div>
    </Modal>
  )
}
