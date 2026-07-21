import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'

// Diferencia con color: verde = cuadra, ámbar = sobra, rojo = falta
function DiffAmount({ value, className = '' }) {
  const cls = value === 0 ? 'text-green-400' : value > 0 ? 'text-amber-400' : 'text-red-400'
  return (
    <span className={`font-mono font-bold ${cls} ${className}`}>
      {value > 0 ? '+' : ''}{formatCOP(value)}
    </span>
  )
}

function ExpectedRow({ label, value, strong }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={strong ? 'text-white font-medium' : 'text-gray-400'}>{label}</span>
      <span className={`font-mono ${strong ? 'text-white font-bold' : 'text-gray-300'}`}>{value}</span>
    </div>
  )
}

/**
 * Cierre de caja (arqueo): muestra lo esperado según el sistema,
 * la cajera declara el efectivo contado y se registra la diferencia.
 */
export default function CloseRegisterModal({ register, location, onClose }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const [summary,  setSummary]  = useState(null)   // { expected_*, invoice_count, existing }
  const [declared, setDeclared] = useState('')
  const [notes,    setNotes]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [closure,  setClosure]  = useState(null)   // cierre recién creado

  useEffect(() => {
    const params = new URLSearchParams({ location_id: location.id })
    if (register?.id) params.set('register_id', register.id)
    api.get(`/closures/summary?${params.toString()}`)
      .then(d => {
        setSummary(d)
        if (d.existing) setClosure(d.existing)
      })
      .catch(err => { toastError(err.message); onClose() })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const declaredNum = declared === '' ? null : Number(declared)
  const difference = declaredNum !== null && summary ? declaredNum - summary.expected_cash : null

  const handleClose = async () => {
    if (declaredNum === null || isNaN(declaredNum) || declaredNum < 0) {
      return toastError('Ingresa el efectivo contado')
    }
    setSaving(true)
    try {
      const data = await api.post('/closures', {
        register_id:   register?.id || undefined,
        register_name: register?.name || undefined,
        location_id:   location.id,
        declared_cash: declaredNum,
        notes:         notes.trim() || undefined,
      })
      setClosure(data)
      toastSuccess('Cierre de caja registrado')
    } catch (err) {
      toastError(err.message || 'Error al cerrar la caja')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="card bg-surface-200 w-full max-w-md my-4 space-y-4 animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-syne font-bold text-lg text-white">Cierre de caja</h2>
            <p className="text-xs text-gray-500">
              🖥 {register?.name || 'Sin caja'} · {location?.name} · {summary?.date || 'hoy'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="btn-touch-safe inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-surface-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
        ) : closure ? (
          /* ---- Resultado del cierre (o cierre ya existente) ---- */
          <div className="space-y-4">
            <div className={`card text-center py-5 ${Number(closure.difference) === 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-surface-400 border-amber-500/30'}`}>
              <p className="text-4xl mb-2">{Number(closure.difference) === 0 ? '✅' : '⚠️'}</p>
              <p className="font-syne font-bold text-lg text-white mb-1">
                {Number(closure.difference) === 0 ? '¡Caja cuadrada!' : Number(closure.difference) > 0 ? 'Sobra efectivo' : 'Falta efectivo'}
              </p>
              <DiffAmount value={Number(closure.difference)} className="text-2xl" />
            </div>
            <div className="bg-surface-400 rounded-xl p-3 space-y-1.5">
              <ExpectedRow label={`Facturas cobradas (${closure.invoice_count})`} value="" />
              <ExpectedRow label="Efectivo esperado" value={formatCOP(closure.expected_cash)} />
              <ExpectedRow label="Efectivo contado" value={formatCOP(closure.declared_cash)} strong />
              <ExpectedRow label="Transferencias" value={formatCOP(closure.expected_transfer)} />
              <ExpectedRow label="Datáfono" value={formatCOP(closure.expected_card)} />
              {closure.notes && <p className="text-xs text-gray-400 italic pt-1 border-t border-white/5">📝 {closure.notes}</p>}
              <p className="text-[10px] text-gray-500 pt-1">
                Cerrada por {closure.cashier_name} · {new Date(closure.closed_at).toLocaleString('es-CO')}
              </p>
            </div>
            <button onClick={onClose} className="btn btn-primary w-full">Listo</button>
          </div>
        ) : (
          /* ---- Formulario de cierre ---- */
          <div className="space-y-4">
            <div className="bg-surface-400 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Según el sistema (hoy)</p>
              <ExpectedRow label="Facturas cobradas" value={String(summary.invoice_count)} />
              <ExpectedRow label="Efectivo esperado" value={formatCOP(summary.expected_cash)} strong />
              <ExpectedRow label="Transferencias" value={formatCOP(summary.expected_transfer)} />
              <ExpectedRow label="Datáfono" value={formatCOP(summary.expected_card)} />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">💵 Efectivo contado en caja</label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={declared}
                onChange={e => setDeclared(e.target.value)}
                placeholder="0"
                autoFocus
                className="input font-mono text-lg"
              />
              {difference !== null && !isNaN(difference) && (
                <p className="text-xs mt-1.5 flex items-center gap-1.5">
                  <span className="text-gray-400">Diferencia:</span>
                  <DiffAmount value={difference} />
                  {difference !== 0 && (
                    <span className="text-gray-500">({difference > 0 ? 'sobra' : 'falta'})</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Notas (opcional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Ej: se pagó domicilio $10.000 en efectivo"
                className="input text-xs resize-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="btn btn-ghost flex-1">Cancelar</button>
              <button onClick={handleClose} disabled={saving || declared === ''} className="btn btn-primary flex-1">
                {saving ? <Loader2 className="animate-spin h-4 w-4" /> : 'Registrar cierre'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
