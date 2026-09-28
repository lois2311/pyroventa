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
    exportToExcel(sheets, `pyroventa_${from}_${to}.xlsx`)
  }

  const scopeLabel = locationId
    ? locations.find(l => l.id === locationId)?.name
    : (isOwner ? 'Todos los puntos' : null)

  return (
    <div className="space-y-8">
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
      <div className="toolbar panel p-3 sm:p-4">
        <DateRangeBar from={from} to={to} onChange={setRange} />
        {isOwner && (
          <div className="w-full sm:w-56">
            <label htmlFor="resumen-location" className="field-label">Punto de venta</label>
            <select
              id="resumen-location"
              value={locationId}
              onChange={e => setLocationId(e.target.value)}
              className="input"
            >
              <option value="">Todos (consolidado)</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ErrorNotice error={firstError} title="No se pudieron cargar algunos reportes" onRetry={refetchAll} />

      <DailyKpis data={d} loading={daily.loading} singleDay={from === to} />

      {/* Desgloses lado a lado: por método de pago y por categoría */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
        <PaymentBreakdown data={d} loading={daily.loading} className="xl:col-span-2" />
        <CategoryBreakdown data={list(byCategory)} loading={byCategory.loading} className="xl:col-span-3" />
      </div>

      {d?.by_day?.length > 1 && (
        <section>
          <SectionHeader title="Ventas por día" icon={TrendingUp} description={formatRangeLabel(from, to)} />
          <div className="space-y-3">
            <RevenueTrendChart data={d.by_day} loading={daily.loading} />
            <DailyTrend data={d.by_day} />
          </div>
        </section>
      )}

      {/* Rankings lado a lado en desktop, apilados en móvil */}
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        <section>
          <SectionHeader title="Top productos" icon={Trophy} />
          <TopProducts data={list(topProds)} loading={topProds.loading} />
        </section>

        <section>
          <SectionHeader title="Top vendedores" icon={UserRound} description="Toca un vendedor para ver su detalle" />
          <SellerStats data={list(sellers)} loading={sellers.loading} from={from} to={to} locationId={locationId} />
        </section>
      </div>

      <section>
        <SectionHeader title="Rendimiento por caja" icon={Monitor} />
        <RegisterComparison data={list(regCompar)} loading={regCompar.loading} from={from} to={to} locationId={locationId} />
      </section>

      {isOwner && !locationId && (
        <section>
          <SectionHeader title="Comparativa de puntos de venta" icon={Store} />
          <LocationComparison data={list(locCompar)} loading={locCompar.loading} />
        </section>
      )}
    </div>
  )
}
