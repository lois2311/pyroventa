import { useId, useRef, useEffect, useState } from 'react'
import { Check, Loader2, Minus, Plus } from 'lucide-react'
import { api, clearProductsCache } from '../../lib/api.js'
import { parseQty, previewBalance } from '../../lib/inventoryUi.js'
import { stockQty } from '../../lib/stockStatus.js'
import { useToast } from '../Toast.jsx'
import FormError from '../FormError.jsx'

const QUICK = [1, 10, 50]

/**
 * Reposición (+N) o merma (−N) de un producto, desplegada bajo su fila.
 * Enter confirma, Escape cancela. La vista previa muestra el saldo resultante.
 */
export default function StockEntryRow({ item, locationId, onDone, onCancel }) {
  const { success: toastSuccess } = useToast()
  const fid = useId()
  const qtyRef = useRef(null)
  const [mode, setMode] = useState('restock') // 'restock' | 'waste'
  const [qty, setQty] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { qtyRef.current?.focus() }, [])

  const current = stockQty(item)
  const waste = mode === 'waste'
  const preview = previewBalance(current, qty, waste ? -1 : 1)
  const overdraw = waste && preview.valid && preview.next < 0
  const needsReason = waste && notes.trim().length < 3
  const canSave = preview.valid && !overdraw && !needsReason && !saving

  const add = (n) => setQty(String((parseQty(qty) ?? 0) + n))

  const submit = async (e) => {
    e?.preventDefault()
    if (!canSave) return
    setSaving(true); setError('')
    try {
      // Sin reintentos: reponer dos veces por un reintento de red duplicaría el stock
      if (waste) {
        await api.post('/inventory/waste', {
          location_id: locationId, product_id: item.id, quantity: parseQty(qty),
          notes: notes.trim(), ...(reference.trim() ? { reference: reference.trim() } : {}),
        }, { retries: 0 })
      } else {
        await api.post('/inventory/receive', {
          location_id: locationId, reference: reference.trim() || undefined, notes: notes.trim() || undefined,
          items: [{ product_id: item.id, quantity: parseQty(qty) }],
        }, { retries: 0 })
      }
      clearProductsCache()
      toastSuccess(`${item.name}: ${current} → ${preview.next}`)
      onDone()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el movimiento')
    } finally { setSaving(false) }
  }

  return (
    // Escape cancela la edición en curso (atajo de teclado del formulario, no un control propio)
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      onSubmit={submit}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
      className="space-y-3 bg-surface-400/60 px-3 py-3"
      aria-label={`${waste ? 'Registrar merma' : 'Reponer'} ${item.name}`}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div role="group" aria-label="Tipo de movimiento" className="segmented whitespace-nowrap">
          <button type="button" aria-pressed={!waste} onClick={() => setMode('restock')} className="inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Reponer
          </button>
          <button type="button" aria-pressed={waste} onClick={() => setMode('waste')} className="inline-flex items-center gap-1">
            <Minus className="h-3.5 w-3.5" /> Merma
          </button>
        </div>

        <div>
          <label htmlFor={`${fid}-qty`} className="field-label">{waste ? 'Unidades dañadas' : 'Unidades que llegan'}</label>
          <div className="flex items-center gap-1.5">
            <input
              id={`${fid}-qty`} ref={qtyRef} type="number" min="1" step="1" inputMode="numeric"
              value={qty} onChange={e => setQty(e.target.value)} placeholder="0"
              className="input w-24 text-right font-mono tabular-nums"
            />
            {QUICK.map(n => (
              <button key={n} type="button" onClick={() => add(n)} className="btn btn-outline btn-sm font-mono tabular-nums">
                +{n}
              </button>
            ))}
          </div>
        </div>

        <p className="pb-2 font-mono text-sm tabular-nums text-gray-300" aria-live="polite">
          <span className="text-gray-400">{current}</span>
          <span className="px-1.5 text-gray-400">→</span>
          <span className={overdraw ? 'text-red-400' : preview.valid ? (waste ? 'text-yellow-400' : 'text-brand-400') : 'text-gray-400'}>
            {preview.valid ? preview.next : '—'}
          </span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div>
          <label htmlFor={`${fid}-ref`} className="field-label">Referencia <span className="font-normal">(factura o remisión)</span></label>
          <input id={`${fid}-ref`} value={reference} maxLength={100} onChange={e => setReference(e.target.value)}
            placeholder="Ej: FAC-1234" className="input font-mono" />
        </div>
        <div>
          <label htmlFor={`${fid}-notes`} className="field-label">
            {waste ? 'Motivo de la merma' : 'Notas'} <span className="font-normal">({waste ? 'obligatorio' : 'opcional'})</span>
          </label>
          <input id={`${fid}-notes`} value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} required={waste}
            placeholder={waste ? 'Ej: caja mojada, producto vencido' : 'Ej: lote nuevo del proveedor'} className="input" />
        </div>
      </div>

      {overdraw && <p className="text-xs text-red-400" role="alert">La merma supera el stock disponible ({current}).</p>}
      <FormError message={error} />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">Cancelar</button>
        <button type="submit" disabled={!canSave} className="btn btn-primary btn-sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{waste ? 'Registrar merma' : 'Confirmar reposición'}</span>
        </button>
      </div>
    </form>
  )
}
