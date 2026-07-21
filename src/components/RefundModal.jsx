import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { toISO } from './DateRangeBar.jsx'
import { useToast } from './Toast.jsx'

/**
 * Devolución de una factura pagada HOY: se busca por código entre las
 * cobradas del día en este punto de venta, se confirma con motivo y
 * queda anulada (status refunded) con evidencia de quién y por qué.
 */
export default function RefundModal({ location, onClose }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const [code,      setCode]      = useState('')
  const [searching, setSearching] = useState(false)
  const [invoice,   setInvoice]   = useState(null)
  const [reason,    setReason]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [done,      setDone]      = useState(null)

  const handleSearch = async () => {
    if (code.length !== 4) return
    setSearching(true)
    setInvoice(null)
    try {
      const hoy = toISO(new Date())
      const params = new URLSearchParams({
        location_id: location.id, status: 'paid', from: hoy, to: hoy, limit: '100',
      })
      const data = await api.get(`/invoices/history?${params.toString()}`)
      // Puede haber más de una con el mismo código en el día: tomar la más reciente
      const matches = (data.invoices || []).filter(i => String(i.code).trim() === code)
      if (!matches.length) {
        toastError(`No hay factura PAGADA hoy con código ${code} en este punto`)
      } else {
        setInvoice(matches[0])
      }
    } catch (err) {
      toastError(err.message || 'Error buscando la factura')
    } finally {
      setSearching(false)
    }
  }

  const handleRefund = async () => {
    if (!reason.trim()) return toastError('Escribe el motivo de la devolución')
    setSaving(true)
    try {
      const data = await api.post(`/invoices/${invoice.id}/refund`, { reason: reason.trim() })
      setDone(data)
      toastSuccess(`Factura #${data.code} devuelta`)
    } catch (err) {
      toastError(err.message || 'Error al registrar la devolución')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="card bg-surface-200 w-full max-w-md my-4 space-y-4 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-syne font-bold text-lg text-white">↩ Devolución</h2>
            <p className="text-xs text-gray-500">Facturas pagadas hoy en {location?.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="text-center space-y-4 py-2">
            <div className="text-4xl">↩️</div>
            <p className="font-syne font-bold text-lg text-white">Devolución registrada</p>
            <p className="text-sm text-gray-300">
              Factura <span className="font-mono text-brand-400">#{done.code}</span> por {formatCOP(done.total)}
            </p>
            <p className="text-xs text-gray-400 italic">"{done.refund_reason}"</p>
            <button onClick={onClose} className="btn btn-primary w-full">Listo</button>
          </div>
        ) : !invoice ? (
          <div className="space-y-3">
            <label className="block text-xs text-gray-400">Código de la factura pagada</label>
            <div className="flex items-center gap-2">
              <input
                type="text" inputMode="numeric" maxLength={4}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && code.length === 4) handleSearch() }}
                placeholder="_ _ _ _"
                autoFocus
                className="input text-center font-mono text-xl tracking-[0.4em] placeholder-gray-700 flex-1"
              />
              <button onClick={handleSearch} disabled={code.length !== 4 || searching} className="btn btn-primary shrink-0">
                {searching ? <Loader2 className="animate-spin h-4 w-4" /> : 'Buscar'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500">
              Solo se pueden devolver facturas pagadas hoy. Para días anteriores, el administrador puede hacerlo desde el Historial.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface-400 rounded-xl p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-brand-400 text-xl">#{invoice.code}</span>
                <span className="font-syne font-bold text-white">{formatCOP(invoice.total)}</span>
              </div>
              <p className="text-xs text-gray-400">
                {invoice.seller_name} · {new Date(invoice.paid_at || invoice.created_at).toLocaleTimeString('es-CO')}
              </p>
              <div className="pt-1 space-y-0.5">
                {(Array.isArray(invoice.items) ? invoice.items : []).map((item, i) => (
                  <p key={i} className="text-xs text-gray-300">
                    {item.product_name || item.label} <span className="text-gray-500">×{item.qty}</span>
                  </p>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Motivo de la devolución *</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="Ej: producto defectuoso, no encendió"
                autoFocus
                className="input text-xs resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setInvoice(null); setReason('') }} className="btn btn-ghost flex-1">← Atrás</button>
              <button onClick={handleRefund} disabled={saving || !reason.trim()} className="btn btn-primary flex-1 bg-red-600 hover:bg-red-500">
                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : 'Confirmar devolución'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
