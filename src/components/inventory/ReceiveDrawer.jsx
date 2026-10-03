import { useMemo, useRef, useState } from 'react'
import { PackagePlus, Search, Trash2, Loader2, Check } from 'lucide-react'
import { api, clearProductsCache } from '../../lib/api.js'
import { buildReceivePayload, parseQty, sortByUrgency } from '../../lib/inventoryUi.js'
import { getStockStatus, stockQty } from '../../lib/stockStatus.js'
import { normalizeText } from '../../lib/search.js'
import { useToast } from '../Toast.jsx'
import Drawer from '../Drawer.jsx'
import FormError from '../FormError.jsx'

/**
 * Recepción de mercancía por lote: varios productos, una referencia común y un
 * solo POST /inventory/receive. Solo ofrece productos que este punto controla.
 */
export default function ReceiveDrawer({ items, locationId, locationName, onClose, onDone }) {
  const { success: toastSuccess } = useToast()
  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState([]) // [{ productId, quantity }]
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [failures, setFailures] = useState([])

  const controllable = useMemo(() => sortByUrgency(items.filter(i => getStockStatus(i) !== 'untracked')), [items])
  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const inLines = useMemo(() => new Set(lines.map(l => l.productId)), [lines])

  const results = useMemo(() => {
    const q = normalizeText(query)
    return controllable
      .filter(i => !inLines.has(i.id) && (!q || normalizeText(`${i.name} ${i.categories?.name || ''}`).includes(q)))
      .slice(0, 8)
  }, [controllable, inLines, query])

  const addLine = (item) => {
    setLines(prev => [...prev, { productId: item.id, quantity: '' }])
    setQuery('')
    // La cantidad de la línea nueva recibe el foco para escribir sin tocar el mouse
    requestAnimationFrame(() => document.getElementById(`recv-qty-${item.id}`)?.focus())
  }
  const setQty = (productId, quantity) => setLines(prev => prev.map(l => (l.productId === productId ? { ...l, quantity } : l)))
  const removeLine = (productId) => setLines(prev => prev.filter(l => l.productId !== productId))

  const validLines = lines.filter(l => parseQty(l.quantity) !== null)
  const totalUnits = validLines.reduce((s, l) => s + parseQty(l.quantity), 0)
  const canSave = lines.length > 0 && validLines.length === lines.length && !saving

  const submit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setError(''); setFailures([])
    try {
      const res = await api.post('/inventory/receive', buildReceivePayload(locationId, lines, reference, notes), { retries: 0 })
      clearProductsCache()
      if (res.failures?.length) {
        // 207: parte del lote se aplicó. Se quitan esas líneas para no repetirlas y se muestran las fallidas
        const done = new Set(res.applied.map(a => a.product_id))
        setLines(prev => prev.filter(l => !done.has(l.productId)))
        setFailures(res.failures)
        onDone(false)
        return
      }
      toastSuccess(`Recepción registrada: ${res.applied.length} producto${res.applied.length !== 1 ? 's' : ''}, +${totalUnits} unidades`)
      onDone(true)
    } catch (err) {
      setError(err.message || 'No se pudo registrar la recepción')
    } finally { setSaving(false) }
  }

  return (
    <Drawer
      title="Recibir mercancía"
      icon={PackagePlus}
      description={`Suma al inventario de ${locationName}. Cada producto queda en la bitácora con tu nombre.`}
      onClose={onClose}
      footer={
        <form onSubmit={submit} className="flex items-center justify-between gap-3">
          <p className="font-mono text-sm tabular-nums text-gray-300" aria-live="polite">
            {lines.length} producto{lines.length !== 1 ? 's' : ''} · <span className="text-brand-400">+{totalUnits}</span> uds
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
            <button type="submit" disabled={!canSave} className="btn btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Confirmar recepción</span>
            </button>
          </div>
        </form>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div>
            <label htmlFor="recv-ref" className="field-label">Referencia <span className="font-normal">(factura o remisión, opcional)</span></label>
            <input id="recv-ref" value={reference} maxLength={100} onChange={e => setReference(e.target.value)}
              placeholder="Ej: FAC-1234" className="input font-mono" />
          </div>
          <div>
            <label htmlFor="recv-notes" className="field-label">Notas <span className="font-normal">(opcional)</span></label>
            <input id="recv-notes" value={notes} maxLength={500} onChange={e => setNotes(e.target.value)}
              placeholder="Ej: pedido de octubre" className="input" />
          </div>
        </div>

        <div>
          <label htmlFor="recv-search" className="field-label">Agregar producto</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              id="recv-search" ref={searchRef} type="search" autoFocus value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) addLine(results[0]) } }}
              placeholder="Buscar por nombre o categoría · Enter agrega el primero"
              className="input pl-8 text-sm"
            />
          </div>
          {results.length > 0 ? (
            <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-lg border border-white/5 bg-surface-300">
              {results.map(i => (
                <li key={i.id}>
                  <button type="button" onClick={() => addLine(i)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-400/60">
                    <span className="min-w-0 truncate text-sm text-white">{i.name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-gray-400">stock {stockQty(i)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-gray-400">
              {query ? 'Ningún producto con control de inventario coincide.' : 'No quedan más productos con control de inventario por agregar.'}
            </p>
          )}
        </div>

        <section aria-label="Productos de la recepción">
          <h3 className="mb-2 text-xs font-medium text-gray-400">Productos a recibir</h3>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-gray-400">
              Busca un producto y agrégalo. Los agotados y con stock bajo aparecen primero.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lines.map(l => {
                const item = byId.get(l.productId)
                const q = parseQty(l.quantity)
                return (
                  <li key={l.productId} className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface-300 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{item?.name}</p>
                      <p className="font-mono text-2xs tabular-nums text-gray-400">
                        {stockQty(item)} → <span className={q ? 'text-brand-400' : ''}>{q ? stockQty(item) + q : '—'}</span>
                      </p>
                    </div>
                    <label className="sr-only" htmlFor={`recv-qty-${l.productId}`}>Cantidad de {item?.name}</label>
                    <input id={`recv-qty-${l.productId}`} type="number" min="1" step="1" inputMode="numeric" value={l.quantity}
                      onChange={e => setQty(l.productId, e.target.value)} placeholder="0"
                      className="input w-24 text-right font-mono tabular-nums" />
                    <button type="button" onClick={() => removeLine(l.productId)} className="btn btn-ghost btn-icon text-gray-400 hover:text-red-400"
                      aria-label={`Quitar ${item?.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {failures.length > 0 && (
          <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400" role="alert">
            <p className="font-medium">Estos productos no se pudieron registrar (el resto sí quedó aplicado):</p>
            <ul className="mt-1 list-disc pl-4">{failures.map(f => <li key={f.product_id}>{f.name}: {f.error}</li>)}</ul>
          </div>
        )}
        <FormError message={error} />
      </div>
    </Drawer>
  )
}
