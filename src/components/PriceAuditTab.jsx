import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Search, Filter, Calendar, TrendingDown, TrendingUp, AlertCircle, Clock, User, Tag } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP, formatDate } from '../lib/format.js'
import { toISO } from './DateRangeBar.jsx'
import { useToast } from './Toast.jsx'

export default function PriceAuditTab({ locations = [], isOwner = false }) {
  const { error: toastError } = useToast()
  const hoy = toISO(new Date())

  const [from,       setFrom]       = useState(hoy)
  const [to,         setTo]         = useState(hoy)
  const [locationId, setLocationId] = useState('')
  const [query,      setQuery]      = useState('')
  const [logs,       setLogs]       = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading,    setLoading]    = useState(true)

  const fetchLogs = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to)   params.set('to', to)
    if (locationId) params.set('location_id', locationId)
    params.set('limit', '100')

    api.get(`/audit/price-changes?${params.toString()}`)
      .then(res => {
        setLogs(res.logs || [])
        setTotalCount(res.total || 0)
      })
      .catch(err => toastError(err.message || 'Error cargando auditoría de precios'))
      .finally(() => setLoading(false))
  }, [from, to, locationId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Filtrado local por búsqueda de texto (factura, producto o usuario)
  const filteredLogs = logs.filter(log => {
    if (!query.trim()) return true
    const q = query.toLowerCase().trim()
    return (
      (log.invoice_code && log.invoice_code.toLowerCase().includes(q)) ||
      (log.product_name && log.product_name.toLowerCase().includes(q)) ||
      (log.user_name && log.user_name.toLowerCase().includes(q)) ||
      (log.reason && log.reason.toLowerCase().includes(q))
    )
  })

  // Totales de métricas
  const totalDifferenceSum = logs.reduce((sum, l) => sum + Number(l.total_difference || 0), 0)
  const totalEditsCount = totalCount

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="font-syne font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-400" /> Auditoría de Edición de Precios
          </h2>
          <p className="text-xs text-gray-400">
            Registro de todas las variaciones manuales de precio realizadas en piso (carrito) y en caja.
          </p>
        </div>
      </div>

      {/* Tarjetas de métricas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card bg-surface-300 border border-white/5 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Modificaciones en el período</p>
            <p className="font-mono font-bold text-xl text-white">{totalEditsCount}</p>
          </div>
        </div>

        <div className="card bg-surface-300 border border-white/5 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
            totalDifferenceSum < 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
          }`}>
            {totalDifferenceSum < 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
          </div>
          <div>
            <p className="text-xs text-gray-400">Impacto total sobre catálogo</p>
            <p className={`font-mono font-bold text-xl ${totalDifferenceSum < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {totalDifferenceSum > 0 ? `+${formatCOP(totalDifferenceSum)}` : formatCOP(totalDifferenceSum)}
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="card bg-surface-300 border border-white/5 p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span>Desde</span>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="input py-1 px-2 text-xs"
          />
          <span>Hasta</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="input py-1 px-2 text-xs"
          />
        </div>

        {isOwner && locations.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="input py-1 px-2 text-xs"
            >
              <option value="">Todos los puntos de venta</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por código #, producto, usuario o motivo..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="input pl-8 py-1 text-xs w-full"
          />
        </div>
      </div>

      {/* Lista / Tabla de Auditoría */}
      <div className="card bg-surface-300 border border-white/5 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-gray-500 opacity-60" />
            <p className="text-sm">No se encontraron ediciones de precio en este rango</p>
            <p className="text-xs text-gray-500 mt-1">Todos los artículos se cobraron al precio estricto de catálogo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-400/70 border-b border-white/5 text-gray-400 font-medium">
                <tr>
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Factura</th>
                  <th className="py-2.5 px-3">Punto / Responsable</th>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3 text-right">Cant</th>
                  <th className="py-2.5 px-3 text-right">Precio Base</th>
                  <th className="py-2.5 px-3 text-right">Precio Editado</th>
                  <th className="py-2.5 px-3 text-right">Diferencia</th>
                  <th className="py-2.5 px-3">Motivo / Momento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLogs.map(log => {
                  const diff = Number(log.difference || 0)
                  const totalDiff = Number(log.total_difference || 0)

                  return (
                    <tr key={log.id} className="hover:bg-surface-400/40 transition-colors">
                      <td className="py-2.5 px-3 text-gray-300 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {formatDate(log.created_at)}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-mono font-bold text-brand-400 whitespace-nowrap">
                        #{log.invoice_code || '—'}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="text-white font-medium truncate max-w-[140px]">{log.user_name}</div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          <span className="capitalize">{log.user_role}</span>
                          {log.location_name && ` · ${log.location_name}`}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="text-white font-medium truncate max-w-[180px]">{log.product_name}</div>
                        <div className="text-[10px] text-gray-400">{log.presentation_label}</div>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-gray-300">
                        {log.qty}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-gray-400 whitespace-nowrap">
                        {formatCOP(log.original_price)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-white whitespace-nowrap">
                        {formatCOP(log.edited_price)}
                      </td>

                      <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                        diff < 0 ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {diff > 0 ? `+${formatCOP(totalDiff)}` : formatCOP(totalDiff)}
                      </td>

                      <td className="py-2.5 px-3 max-w-[200px]">
                        <div className="truncate text-gray-200" title={log.reason}>
                          {log.reason ? `"${log.reason}"` : <span className="text-gray-500 italic">Sin motivo</span>}
                        </div>
                        <div className="text-[9px] mt-0.5">
                          {log.stage === 'cart_creation' ? (
                            <span className="text-brand-400">Piso de venta (Carrito)</span>
                          ) : (
                            <span className="text-cyan-400">En Caja (Edición)</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
