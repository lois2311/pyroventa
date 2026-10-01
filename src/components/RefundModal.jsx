import { useState, useId } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Undo2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { toISO } from './DateRangeBar.jsx'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'
import FieldError from './FieldError.jsx'

/**
 * Devolución de una factura pagada HOY: se busca por código entre las
 * cobradas del día en este punto de venta, se confirma con motivo y
 * queda anulada (status refunded) con evidencia de quién y por qué.
 *
 * Tres pasos en el mismo diálogo: buscar → confirmar con motivo → listo.
 * Los errores (código sin factura, motivo vacío, fallo del servidor) se
 * muestran junto al campo en vez de en un toast que desaparece.
 */
export default function RefundModal({ location, onClose }) {
  const fid = useId()
  const { success: toastSuccess } = useToast()
  const [code,      setCode]      = useState('')
  const [searching, setSearching] = useState(false)
  const [invoice,   setInvoice]   = useState(null)
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(null)
  const [error,     setError]     = useState('')

  const handleSearch = async () => {
    if (code.length !== 4) return setError('Escribe los 4 dígitos del código')
    setSearching(true)
    setInvoice(null)
    setError('')
    try {
      const hoy = toISO(new Date())
      const params = new URLSearchParams({
        location_id: location.id, status: 'paid', from: hoy, to: hoy, limit: '100',
      })
      const data = await api.get(`/invoices/history?${params.toString()}`)
      // Puede haber más de una con el mismo código en el día: tomar la más reciente
      const matches = (data.invoices || []).filter(i => String(i.code).trim() === code)
      if (!matches.length) {
        setError(`No hay factura pagada hoy con el código ${code} en este punto`)
      } else {
        setInvoice(matches[0])
      }
    } catch (err) {
      setError(err.message || 'Error buscando la factura')
    } finally {
      setSearching(false)
    }
  }

  const handleRefund = async () => {
    if (!reason.trim()) {
      setError('Escribe el motivo: queda en el historial de la factura')
      document.getElementById(`${fid}-reason`)?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      const data = await api.post(`/invoices/${invoice.id}/refund`, { reason: reason.trim() })
      setDone(data)
      toastSuccess(`Factura #${data.code} devuelta`)
    } catch (err) {
      setError(err.message || 'Error al registrar la devolución')
    } finally {
      setSaving(false)
    }
  }

  const step = done ? 'done' : invoice ? 'confirm' : 'search'

  const footer = {
    search: <>
      <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
      <button type="submit" disabled={searching} className="btn btn-primary">
        {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
      </button>
    </>,
    confirm: <>
      <button type="button" onClick={() => { setInvoice(null); setReason(''); setError('') }} className="btn btn-ghost">
        <ArrowLeft className="h-4 w-4" /> Atrás
      </button>
      <button type="submit" disabled={saving} className="btn btn-danger">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar devolución'}
      </button>
    </>,
    done: <button type="button" onClick={onClose} className="btn btn-primary" data-autofocus>Listo</button>,
  }[step]

  return (
    <Modal
      title="Devolución"
      description={`Facturas pagadas hoy en ${location?.name || 'este punto'}`}
      icon={Undo2}
      iconClassName="text-gray-400"
      onClose={onClose}
      onSubmit={step === 'search' ? handleSearch : step === 'confirm' ? handleRefund : undefined}
      closeOnBackdrop={step !== 'confirm'}
      footer={footer}
    >
      {step === 'done' ? (
        <div className="space-y-3 py-2 text-center" role="status">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
          <p className="font-display text-lg font-bold text-white">Devolución registrada</p>
          <p className="text-sm text-gray-300">
            Factura <span className="font-mono text-brand-400">#{done.code}</span> por {formatCOP(done.total)}
          </p>
          <p className="text-xs italic text-gray-400">“{done.refund_reason}”</p>
        </div>
      ) : step === 'search' ? (
        <div className="space-y-2">
          <label htmlFor={`${fid}-code`} className="field-label">Código de la factura pagada</label>
          <input
            id={`${fid}-code`}
            type="text" inputMode="numeric" maxLength={4} autoComplete="off"
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError('') }}
            placeholder="_ _ _ _"
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fid}-hint${error ? ` ${fid}-error` : ''}`}
            className="input text-center font-mono text-xl tracking-[0.4em] placeholder-gray-400"
          />
          <FieldError id={`${fid}-error`}>{error}</FieldError>
          <p id={`${fid}-hint`} className="field-hint">
            Solo se pueden devolver facturas pagadas hoy. Para días anteriores, el administrador puede hacerlo desde el Historial.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1 rounded-xl bg-surface-400 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xl font-bold text-brand-400">#{invoice.code}</span>
              <span className="font-mono font-bold text-white">{formatCOP(invoice.total)}</span>
            </div>
            <p className="text-xs text-gray-400">
              {invoice.seller_name} · {new Date(invoice.paid_at || invoice.created_at).toLocaleTimeString('es-CO')}
            </p>
            <ul className="space-y-0.5 pt-1">
              {(Array.isArray(invoice.items) ? invoice.items : []).map((item, i) => (
                <li key={i} className="text-xs text-gray-300">
                  {item.product_name || item.label} <span className="text-gray-400">×{item.qty}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label htmlFor={`${fid}-reason`} className="field-label">Motivo de la devolución</label>
            <textarea
              id={`${fid}-reason`}
              value={reason}
              onChange={e => { setReason(e.target.value); setError('') }}
              rows={2}
              placeholder="Ej: producto defectuoso, no encendió"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fid}-error` : undefined}
              className="input resize-none text-sm"
            />
            <FieldError id={`${fid}-error`}>{error}</FieldError>
          </div>
        </>
      )}
    </Modal>
  )
}
