import { useState, useId } from 'react'
import { AlertTriangle, Banknote, CheckCircle2, FileText, Loader2, Receipt } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useApi } from '../hooks/useApi.js'
import { useToast } from './Toast.jsx'
import Modal from './Modal.jsx'
import ErrorNotice from './ErrorNotice.jsx'
import FieldError from './FieldError.jsx'

// Diferencia con color: Correcto = cuadra, Atención = sobra, Error = falta
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
 * Si el resumen no carga, el error queda en el diálogo con "Reintentar"
 * (antes se cerraba solo con un toast y había que volver a abrirlo).
 */
export default function CloseRegisterModal({ register, location, onClose }) {
  const fid = useId()
  const { success: toastSuccess } = useToast()
  const params = new URLSearchParams({ location_id: location.id })
  if (register?.id) params.set('register_id', register.id)
  const summaryQ = useApi(`/closures/summary?${params.toString()}`)
  const summary = summaryQ.data // { expected_*, invoice_count, existing }

  const [declared, setDeclared] = useState('')
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [created,  setCreated]  = useState(null)   // cierre recién creado
  const [error,    setError]    = useState('')
  const closure = created || summary?.existing || null

  const declaredNum = declared === '' ? null : Number(declared)
  const difference = declaredNum !== null && summary ? declaredNum - summary.expected_cash : null

  const handleClose = async () => {
    if (declaredNum === null || isNaN(declaredNum) || declaredNum < 0) {
      setError('Ingresa el efectivo contado')
      document.getElementById(`${fid}-declared`)?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      const data = await api.post('/closures', {
        register_id:   register?.id || undefined,
        register_name: register?.name || undefined,
        location_id:   location.id,
        declared_cash: declaredNum,
        notes:         notes.trim() || undefined,
      })
      setCreated(data)
      toastSuccess('Corte guardado.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar el corte. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const showForm = summary && !closure
  // Lo vendido en el día por todas las formas de pago (para el mensaje final)
  const soldToday = closure
    ? Number(closure.expected_cash || 0) + Number(closure.expected_transfer || 0) + Number(closure.expected_card || 0)
    : 0
  const diff = Number(closure?.difference || 0)

  return (
    <Modal
      title="Corte de caja"
      description={`${register?.name || 'Sin caja'} · ${location?.name} · ${summary?.date || 'hoy'}`}
      icon={Receipt}
      onClose={onClose}
      onSubmit={showForm ? handleClose : undefined}
      closeOnBackdrop={!showForm || declared === ''}
      footer={showForm ? <>
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar corte'}
        </button>
      </> : closure ? (
        <button type="button" onClick={onClose} className="btn btn-primary" data-autofocus>Listo</button>
      ) : null}
    >
      {summaryQ.loading && !summary ? (
        <div className="space-y-2" role="status" aria-label="Cargando resumen">{[1, 2, 3].map(i => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
      ) : summaryQ.error ? (
        <ErrorNotice error={summaryQ.error} title="No se pudo cargar el resumen del día" onRetry={summaryQ.refetch} />
      ) : closure ? (
        /* ---- Resultado del cierre (o cierre ya existente) ---- */
        <>
          <div role="status" className={`card py-5 text-center ${diff === 0 ? 'border-green-400/30 bg-green-400/10' : diff > 0 ? 'border-amber-400/30 bg-surface-400' : 'border-red-400/30 bg-surface-400'}`}>
            {diff === 0
              ? <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-green-400" />
              : <AlertTriangle className={`mx-auto mb-2 h-10 w-10 ${diff > 0 ? 'text-amber-400' : 'text-red-400'}`} />}
            <p className="mb-1 font-display text-lg font-bold text-white">
              {diff === 0
                ? <>Caja cuadrada. Vendiste <span className="font-mono">{formatCOP(soldToday)}</span> hoy.</>
                : diff > 0 ? 'Sobra efectivo en caja.' : 'Falta efectivo en caja.'}
            </p>
            {diff !== 0 && <DiffAmount value={diff} className="text-3xl" />}
          </div>
          <div className="space-y-1.5 rounded-lg bg-surface-400 p-3">
            <ExpectedRow label={`Facturas cobradas (${closure.invoice_count})`} value="" />
            <ExpectedRow label="Efectivo esperado" value={formatCOP(closure.expected_cash)} />
            <ExpectedRow label="Efectivo contado" value={formatCOP(closure.declared_cash)} strong />
            <ExpectedRow label="Transferencias" value={formatCOP(closure.expected_transfer)} />
            <ExpectedRow label="Datáfono" value={formatCOP(closure.expected_card)} />
            {closure.notes && (
              <p className="flex items-start gap-1.5 border-t border-white/5 pt-1 text-xs italic text-gray-400">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {closure.notes}
              </p>
            )}
            <p className="pt-1 text-2xs text-gray-400">
              Cerrada por {closure.cashier_name} · {new Date(closure.closed_at).toLocaleString('es-CO')}
            </p>
          </div>
        </>
      ) : summary && (
        /* ---- Formulario de cierre ---- */
        <>
          <div className="space-y-1.5 rounded-lg bg-surface-400 p-3">
            <p className="mb-1 text-2xs uppercase tracking-wider text-gray-400">Según el sistema (hoy)</p>
            <ExpectedRow label="Facturas cobradas" value={String(summary.invoice_count)} />
            <ExpectedRow label="Efectivo esperado" value={formatCOP(summary.expected_cash)} strong />
            <ExpectedRow label="Transferencias" value={formatCOP(summary.expected_transfer)} />
            <ExpectedRow label="Datáfono" value={formatCOP(summary.expected_card)} />
          </div>

          <div>
            <label htmlFor={`${fid}-declared`} className="field-label inline-flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5" /> Efectivo contado en caja
            </label>
            <input
              id={`${fid}-declared`}
              type="number"
              inputMode="numeric"
              min="0"
              value={declared}
              onChange={e => { setDeclared(e.target.value); setError('') }}
              placeholder="0"
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${fid}-error` : undefined}
              className="input font-mono text-lg"
            />
            <FieldError id={`${fid}-error`}>{error}</FieldError>
            {difference !== null && !isNaN(difference) && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs" aria-live="polite">
                <span className="text-gray-400">Diferencia:</span>
                <DiffAmount value={difference} />
                {difference !== 0 && (
                  <span className="text-gray-400">({difference > 0 ? 'sobra' : 'falta'})</span>
                )}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${fid}-notes`} className="field-label">Notas <span className="font-normal">(opcional)</span></label>
            <textarea id={`${fid}-notes`} value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Ej: se pagó domicilio $10.000 en efectivo"
              className="input resize-none text-sm" />
          </div>
        </>
      )}
    </Modal>
  )
}
