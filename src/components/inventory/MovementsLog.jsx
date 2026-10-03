import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, History, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api.js'
import { exportToExcel } from '../../lib/exportExcel.js'
import { movementTone, movementsToRows, REASON_LABELS, ROLE_LABELS_SHORT } from '../../lib/inventoryUi.js'
import { useToast } from '../Toast.jsx'
import Select from '../Select.jsx'
import ErrorNotice from '../ErrorNotice.jsx'
import EmptyState from '../EmptyState.jsx'

const PAGE = 100
const isoDay = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d) }

const TONE = {
  outflow: { row: 'bg-red-400/[0.07]', delta: 'text-red-400', badge: 'bg-red-400/15 text-red-400 border border-red-400/20' },
  restock: { row: '', delta: 'text-brand-400', badge: 'bg-brand-500/15 text-brand-300 border border-brand-500/25' },
  neutral: { row: '', delta: 'text-gray-300', badge: 'bg-white/5 text-gray-300 border border-white/10' },
}

const fmtWhen = (iso) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Bitácora de movimientos de stock (GET /inventory/movements).
 * Admin: solo su punto. Superadmin: filtra por punto, motivo y fechas.
 */
export default function MovementsLog({ locations = [], isOwner = false, fixedLocationId = '' }) {
  const { error: toastError } = useToast()
  const [locationId, setLocationId] = useState('')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(isoDay(new Date()))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasMore, setHasMore] = useState(false)

  const buildQuery = useCallback((offset) => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
    const loc = isOwner ? locationId : fixedLocationId
    if (loc) p.set('location_id', loc)
    if (reason) p.set('reason', reason)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p.toString()
  }, [isOwner, locationId, fixedLocationId, reason, from, to])

  const load = useCallback(async (append = false) => {
    setLoading(true); setError(null)
    try {
      const data = await api.get(`/inventory/movements?${buildQuery(append ? rows.length : 0)}`)
      setRows(prev => (append ? [...prev, ...data] : data))
      setHasMore(data.length === PAGE)
    } catch (err) { setError(err) }
    finally { setLoading(false) }
    // rows.length solo importa al paginar; no debe relanzar la carga al cambiar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQuery])

  useEffect(() => { load(false) }, [load])

  const handleExport = async () => {
    try {
      await exportToExcel([{ name: 'Movimientos', rows: movementsToRows(rows) }], `movimientos_stock_${from}_${to}.xlsx`)
    } catch (err) { toastError(err.message || 'No se pudo exportar') }
  }

  const outflowCount = rows.filter(r => r.flag === 'outflow').length
  const showLocationCol = isOwner && !locationId

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 bg-surface-400 p-3">
        {isOwner && (
          <div className="min-w-[11rem]">
            <label className="field-label" htmlFor="mv-loc">Punto</label>
            <Select id="mv-loc" value={locationId} onChange={setLocationId}
              options={[{ value: '', label: 'Todos los puntos' }, ...locations.map(l => ({ value: l.id, label: l.name }))]} />
          </div>
        )}
        <div className="min-w-[11rem]">
          <label className="field-label" htmlFor="mv-reason">Motivo</label>
          <Select id="mv-reason" value={reason} onChange={setReason}
            options={[{ value: '', label: 'Todos los motivos' }, ...Object.entries(REASON_LABELS).map(([value, label]) => ({ value, label }))]} />
        </div>
        <div>
          <label className="field-label" htmlFor="mv-from">Desde</label>
          <input id="mv-from" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="input font-mono text-xs" />
        </div>
        <div>
          <label className="field-label" htmlFor="mv-to">Hasta</label>
          <input id="mv-to" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input font-mono text-xs" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => load(false)} disabled={loading} className="btn-outline" title="Refrescar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> <span>Refrescar</span>
          </button>
          <button type="button" onClick={handleExport} disabled={rows.length === 0} className="btn-outline" title="Exportar lo filtrado a Excel">
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" /> <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-gray-400">
          <span className="font-mono tabular-nums text-white">{rows.length}</span> movimientos
          {outflowCount > 0 && <> · <span className="font-mono tabular-nums text-red-400">{outflowCount}</span> salidas resaltadas (mermas, traslados, conteos a la baja)</>}
        </p>
      )}

      <ErrorNotice error={error} title="No se pudo cargar la bitácora" onRetry={() => load(false)} />

      {loading && rows.length === 0 && !error ? (
        <div className="space-y-2" role="status" aria-label="Cargando movimientos">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-11 rounded-lg" />)}
        </div>
      ) : !error && rows.length === 0 ? (
        <EmptyState icon={History} title="Sin movimientos en este rango"
          description="Aquí quedan las reposiciones, mermas, ajustes y ventas que afectan el stock." />
      ) : (
        <div className="card overflow-hidden bg-surface-300 p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-surface-400 font-medium text-gray-400">
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Usuario</th>
                  <th className="px-3 py-2.5">Producto</th>
                  <th className="px-3 py-2.5 text-right">Variación</th>
                  <th className="px-3 py-2.5">Motivo</th>
                  <th className="px-3 py-2.5">Referencia y notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map(m => {
                  const tone = TONE[movementTone(m)]
                  const delta = Number(m.delta)
                  return (
                    <tr key={m.id} className={tone.row}>
                      <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-gray-300">{fmtWhen(m.created_at)}</td>
                      <td className="px-3 py-2">
                        {m.user_name ? (
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-gray-200">{m.user_name}</span>
                            {m.user_role && (
                              <span className="rounded bg-white/5 px-1.5 py-px text-2xs text-gray-400">{ROLE_LABELS_SHORT[m.user_role] ?? m.user_role}</span>
                            )}
                          </span>
                        ) : <span className="text-gray-400">{m.reason === 'sale' || m.reason === 'refund' ? 'Venta' : 'Sistema'}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="truncate text-white">{m.product_name ?? '—'}</p>
                        {showLocationCol && m.location_name && <p className="text-2xs text-gray-400">{m.location_name}</p>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">
                        <span className="text-gray-400">{m.stock_before ?? '·'} → {m.final_stock}</span>
                        <span className={`ml-2 font-bold ${tone.delta}`}>{delta > 0 ? '+' : '−'}{Math.abs(delta)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${tone.badge}`}>
                          {REASON_LABELS[m.reason] ?? m.reason}
                        </span>
                      </td>
                      <td className="max-w-xs px-3 py-2">
                        {m.reference && <p className="truncate font-mono text-gray-300">{m.reference}</p>}
                        {m.notes && <p className="truncate text-gray-400" title={m.notes}>{m.notes}</p>}
                        {!m.reference && !m.notes && <span className="text-gray-500">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="border-t border-white/5 p-3 text-center">
              <button type="button" onClick={() => load(true)} disabled={loading} className="btn btn-ghost btn-sm">
                {loading ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
