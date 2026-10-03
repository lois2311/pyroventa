import { useState } from 'react'
import { Download, Monitor, RefreshCw, Store, TrendingUp, Trophy, UserRound } from 'lucide-react'
import { useApi } from '../../hooks/useApi.js'
import { formatRangeLabel } from '../../lib/format.js'
import { exportToExcel } from '../../lib/exportExcel.js'
import PageHeader, { SectionHeader } from '../../components/PageHeader.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import { DailyKpis, PaymentBreakdown } from '../../components/DailyMetrics.jsx'
import LocationComparison from '../../components/LocationComparison.jsx'
import SellerStats from '../../components/SellerStats.jsx'
import TopProducts from '../../components/TopProducts.jsx'
import RegisterComparison from '../../components/RegisterComparison.jsx'
import DateRangeBar from '../../components/DateRangeBar.jsx'
import DailyTrend from '../../components/DailyTrend.jsx'
import RevenueTrendChart from '../../components/RevenueTrendChart.jsx'
import CategoryBreakdown from '../../components/CategoryBreakdown.jsx'
import { transferColumns } from '../../components/TransferBreakdown.jsx'
import Select from '../../components/Select.jsx'

// ===========================================================
// TAB: Resumen
// Cada reporte es un useApi: al cambiar rango o punto los pedidos anteriores
// se cancelan (una respuesta vieja ya no puede pisar a la nueva) y un fallo
// se muestra con opción de reintentar en vez de dejar paneles vacíos.
// ===========================================================
export default function ResumenTab({ from, to, setRange, locationId, setLocationId, locations, isOwner }) {
  const q = `?from=${from}&to=${to}${locationId ? `&location_id=${locationId}` : ''}`

  const daily      = useApi(`/reports/daily${q}`)
  const sellers    = useApi(`/reports/sellers${q}`, { initialData: [] })
  const locCompar  = useApi(isOwner ? `/reports/locations?from=${from}&to=${to}` : null, { initialData: [] })
  const topProds   = useApi(`/reports/top-products${q}&limit=10`, { initialData: [] })
  const regCompar  = useApi(`/reports/registers${q}`, { initialData: [] })
  const byCategory = useApi(`/reports/by-category${q}`, { initialData: [] })

  const reports = [daily, sellers, locCompar, topProds, regCompar, byCategory]
  const anyLoading = reports.some(r => r.loading)
  const firstError = reports.find(r => r.error)?.error
  const refetchAll = () => reports.forEach(r => r.refetch())

  const d = daily.data
  const list = (r) => r.data || []

  const [dayView, setDayView] = useState('chart')
  const [rank, setRank] = useState('products')
  const rankTabs = [
    { id: 'products', label: 'Productos', icon: Trophy, count: list(topProds).length },
    { id: 'sellers', label: 'Vendedores', icon: UserRound, count: list(sellers).length },
    { id: 'registers', label: 'Cajas', icon: Monitor, count: list(regCompar).length },
    ...(isOwner && !locationId ? [{ id: 'locations', label: 'Puntos', icon: Store, count: list(locCompar).length }] : []),
  ]
  // Si la pestaña elegida deja de existir (p. ej. se filtra por un punto), vuelve a la primera.
  const activeRank = rankTabs.some(t => t.id === rank) ? rank : 'products'

  const handleExport = () => {
    if (!d) return
    const sheets = [
      { name: 'Resumen', rows: [{
          Desde: from, Hasta: to,
          'Total vendido': d.total_revenue, Facturas: d.invoice_count,
          'Ticket promedio': Math.round(d.avg_ticket), Pendientes: d.pending_count,
          Canceladas: d.cancelled_count, Efectivo: d.by_pay_method.cash,
          Transferencia: d.by_pay_method.transfer, Tarjeta: d.by_pay_method.card,
          ...transferColumns(d.by_transfer_provider),
        }] },
      { name: 'Por día', rows: (d.by_day || []).map(x => ({
          Día: x.day, Facturas: x.invoice_count, Efectivo: x.cash,
          Transferencia: x.transfer, Tarjeta: x.card, Total: x.total_revenue })) },
      { name: 'Vendedores', rows: list(sellers).map(s => ({
          Vendedor: s.seller_name, Facturas: s.count, Efectivo: s.by_method.cash,
          Transferencia: s.by_method.transfer, Tarjeta: s.by_method.card, Total: s.total })) },
      { name: 'Cajas', rows: list(regCompar).map(r => ({
          Caja: r.register_name, Cajero: r.cashier_name || '', Facturas: r.count,
          Efectivo: r.by_method.cash, Transferencia: r.by_method.transfer,
          Tarjeta: r.by_method.card, Total: r.total })) },
      { name: 'Productos', rows: list(topProds).flatMap(p => p.presentations.map(pr => ({
          Producto: p.product_name, Presentación: pr.label, Cantidad: pr.qty, Total: pr.revenue }))) },
    ]
    exportToExcel(sheets, `vendra_${from}_${to}.xlsx`)
  }

  const scopeLabel = locationId
    ? locations.find(l => l.id === locationId)?.name
    : (isOwner ? 'Todos los puntos' : null)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Resumen de ventas"
        description={[formatRangeLabel(from, to), scopeLabel].filter(Boolean).join(' · ')}
        actions={<>
          <button type="button" onClick={refetchAll} disabled={anyLoading} className="btn-outline">
            <RefreshCw className={`h-4 w-4 ${anyLoading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button type="button" onClick={handleExport} disabled={!d} className="btn-outline">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </>}
      />

      {/* Filtros: una sola fila sobre todo lo que filtran */}
      <div className="toolbar panel p-2.5 sm:p-3 lg:sticky lg:top-0 lg:z-20">
        <DateRangeBar from={from} to={to} onChange={setRange} />
        {isOwner && (
          <div className="w-full sm:w-56">
            <label htmlFor="resumen-location" className="field-label">Punto de venta</label>
            <Select
              id="resumen-location"
              value={locationId}
              onChange={setLocationId}
              options={[{ value: '', label: 'Todos (consolidado)' }, ...locations.map(l => ({ value: l.id, label: l.name }))]}
            />
          </div>
        )}
      </div>

      <ErrorNotice error={firstError} title="No se pudieron cargar algunos reportes" onRetry={refetchAll} />

      <DailyKpis data={d} loading={daily.loading} singleDay={from === to} />

      {/* Desgloses lado a lado: por método de pago y por categoría */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentBreakdown data={d} loading={daily.loading} />
        <CategoryBreakdown data={list(byCategory)} loading={byCategory.loading} />
      </div>

      {d?.by_day?.length > 1 && (
        <section>
          <SectionHeader
            title="Ventas por día"
            icon={TrendingUp}
            description={formatRangeLabel(from, to)}
            actions={
              <div className="segmented" role="group" aria-label="Vista de ventas por día">
                <button type="button" aria-pressed={dayView === 'chart'} onClick={() => setDayView('chart')}>Gráfica</button>
                <button type="button" aria-pressed={dayView === 'table'} onClick={() => setDayView('table')}>Tabla</button>
              </div>
            }
          />
          {dayView === 'chart'
            ? <RevenueTrendChart data={d.by_day} loading={daily.loading} />
            : <DailyTrend data={d.by_day} />}
        </section>
      )}

      {/* Rankings en un solo panel con pestañas: una lista visible a la vez,
          con alto máximo y scroll propio para no empujar el resto de la vista. */}
      <section className="panel overflow-hidden">
        <div className="panel-header flex-wrap">
          <h2 className="panel-title">Rankings</h2>
          <div className="segmented max-w-full overflow-x-auto scrollbar-hide" role="group" aria-label="Ranking">
            {rankTabs.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={activeRank === t.id}
                onClick={() => setRank(t.id)}
                className="inline-flex items-center gap-1.5"
              >
                <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t.label}
                <span className="font-mono tabular-nums text-gray-400">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto border-t border-white/5">
          {activeRank === 'products' && <TopProducts embedded data={list(topProds)} loading={topProds.loading} />}
          {activeRank === 'sellers' && <SellerStats embedded data={list(sellers)} loading={sellers.loading} from={from} to={to} locationId={locationId} />}
          {activeRank === 'registers' && <RegisterComparison embedded data={list(regCompar)} loading={regCompar.loading} from={from} to={to} locationId={locationId} />}
          {activeRank === 'locations' && <LocationComparison embedded data={list(locCompar)} loading={locCompar.loading} />}
        </div>
      </section>
    </div>
  )
}
