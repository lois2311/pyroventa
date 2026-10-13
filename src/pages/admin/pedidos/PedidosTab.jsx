import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ClipboardCheck, RefreshCw, ShoppingBag } from 'lucide-react'
import { useApi } from '../../../hooks/useApi.js'
import { formatCOP, timeAgo } from '../../../lib/format.js'
import PageHeader from '../../../components/PageHeader.jsx'
import EmptyState from '../../../components/EmptyState.jsx'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import Select from '../../../components/Select.jsx'
import { SkeletonGrid } from '../shared.jsx'
import PedidoDetalleModal from './PedidoDetalleModal.jsx'
import { MONO, StatusBadge, PaymentBadge, needsPaymentCheck, shortId, bogotaDay } from './shared.jsx'

const POLL_MS = 15_000
const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'submitted', label: 'Nuevos' },
  { value: 'under_review', label: 'En revisión' },
  { value: 'accepted', label: 'Aceptados' },
  { value: 'rejected', label: 'Rechazados' },
]
const PAYMENT_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'proof_submitted', label: 'Comprobante enviado' },
  { value: 'manually_verified', label: 'Verificado' },
]

// ===========================================================
// TAB: Pedidos (solicitudes de Vendra Pedidos)
// Una solicitud no es una factura: aquí no se cobra ni se toca caja.
// ===========================================================
export default function PedidosTab({ locations, isOwner }) {
  // Owner: consolidado ('') o una sede. Resto: una de sus sedes.
  // '' = consolidado (solo owner). Los demás roles caen en su primera sede cuando la lista llega.
  const [picked, setPicked] = useState('')
  const locationId = picked || (isOwner ? '' : (locations[0]?.id || ''))
  const setLocationId = setPicked
  const [status, setStatus] = useState('')
  const [payment, setPayment] = useState('')
  const [day, setDay] = useState('')
  // Cola de trabajo (tarjetas): 'review' = por revisar, 'verify' = transferencias por verificar
  const [queue, setQueue] = useState('')
  const [openId, setOpenId] = useState(null)

  const path = `/orders/requests${locationId ? `?location_id=${locationId}` : ''}`
  const q = useApi(!isOwner && !locationId ? null : path, { initialData: [] })
  const orders = useMemo(() => q.data || [], [q.data])

  // Actualización automática cada 15 s mientras la pestaña está visible
  const { refetch } = q
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refetch() }, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])

  const toReview = orders.filter(o => ['submitted', 'under_review'].includes(o.status)).length
  const toVerify = orders.filter(needsPaymentCheck).length

  const inQueue = { review: o => ['submitted', 'under_review'].includes(o.status), verify: needsPaymentCheck }[queue]
  const rows = orders.filter(o =>
    (!inQueue || inQueue(o))
    && (!status || o.status === status)
    && (!payment || o.payment?.status === payment)
    && (!day || bogotaDay(o.created_at) === day))

  const filtered = Boolean(queue || status || payment || day)
  const showLocationPicker = isOwner || locations.length > 1
  const locName = (id) => locations.find(l => l.id === id)?.name

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos"
        description="Solicitudes que llegan del formulario web. Aceptar un pedido no genera factura ni autoriza el despacho."
        actions={
          <button type="button" onClick={q.refetch} className="btn-outline" disabled={q.loading}>
            <RefreshCw className={`h-4 w-4 ${q.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Actualizar
          </button>
        }
      />

      <ErrorNotice error={q.error} title="No se pudieron cargar los pedidos" onRetry={q.refetch} />

      {/* Cola de trabajo: cada contador filtra la lista */}
      <div className="grid gap-3 sm:grid-cols-2">
        <QueueCard
          icon={ClipboardCheck} label="Por revisar" count={toReview}
          active={queue === 'review'}
          onClick={() => { setQueue(queue === 'review' ? '' : 'review'); setStatus(''); setPayment('') }}
        />
        <QueueCard
          icon={AlertTriangle} label="Transferencias por verificar" count={toVerify} attention
          active={queue === 'verify'}
          onClick={() => { setQueue(queue === 'verify' ? '' : 'verify'); setStatus(''); setPayment('') }}
        />
      </div>

      {/* Móvil: dos columnas, para que la lista asome sin bajar tres pantallas de filtros */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        {showLocationPicker && (
          <div className="col-span-2 sm:min-w-48">
            <label htmlFor="ped-loc" className="field-label">Punto de venta</label>
            <Select id="ped-loc" value={locationId} onChange={setLocationId}
              options={[...(isOwner ? [{ value: '', label: 'Todos los puntos' }] : []), ...locations.map(l => ({ value: l.id, label: l.name }))]} />
          </div>
        )}
        <div className="sm:min-w-44">
          <label htmlFor="ped-status" className="field-label">Estado</label>
          <Select id="ped-status" value={status} onChange={v => { setStatus(v); setQueue('') }} options={STATUS_OPTIONS} />
        </div>
        <div className="sm:min-w-48">
          <label htmlFor="ped-pay" className="field-label">Pago</label>
          <Select id="ped-pay" value={payment} onChange={v => { setPayment(v); setQueue('') }} options={PAYMENT_OPTIONS} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="ped-day" className="field-label">Fecha</label>
          <input id="ped-day" type="date" value={day} onChange={e => setDay(e.target.value)} className={`input ${MONO}`} />
        </div>
        {filtered && (
          <button type="button" className="btn-ghost col-span-2 sm:col-span-1" onClick={() => { setQueue(''); setStatus(''); setPayment(''); setDay('') }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {q.loading && !orders.length ? (
        <SkeletonGrid count={4} height="h-16" />
      ) : rows.length === 0 ? (
        !q.error && (
          <EmptyState
            icon={ShoppingBag}
            title={filtered ? 'Ningún pedido coincide con los filtros' : 'Aún no hay pedidos'}
            description={filtered ? 'Prueba quitando algún filtro.' : 'Cuando un cliente envíe una solicitud aparecerá aquí.'}
          />
        )
      ) : (
        <section className="panel overflow-hidden">
          <ul aria-label="Lista de pedidos" className="divide-y divide-white/5">
            {rows.map(o => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(o.id)}
                  className="grid w-full min-h-[var(--control-h)] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-surface-50
                             sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className={`${MONO} text-xs text-gray-400`}>#{shortId(o.id)}</span>
                      <span className="truncate text-sm font-medium text-white">{o.customer?.name || 'Cliente'}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-400">
                      <span className={MONO}>{o.customer?.phone}</span>
                      {isOwner && !locationId && locName(o.location_id) && <span>{locName(o.location_id)}</span>}
                      <span>{timeAgo(o.created_at)}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    <StatusBadge status={o.status} />
                    <PaymentBadge payment={o.payment} />
                  </span>
                  <span className={`${MONO} text-sm font-semibold text-white sm:text-right`}>{formatCOP(o.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {orders.length >= 100 && (
        <p className="text-xs text-gray-400">Se muestran los 100 pedidos más recientes. Usa los filtros para acotar.</p>
      )}

      {openId && (
        <PedidoDetalleModal
          orderId={openId}
          onClose={() => setOpenId(null)}
          onChanged={q.refetch}
        />
      )}
    </div>
  )
}

function QueueCard({ icon: Icon, label, count, onClick, active, attention = false }) {
  const hot = attention && count > 0
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`card flex min-h-[var(--control-h)] items-center gap-3 text-left transition-colors hover:border-white/20
        ${active ? 'border-brand-500/60 bg-brand-500/10' : ''}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${hot ? 'bg-yellow-400/15 text-yellow-400' : 'bg-surface-50 text-gray-300'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-gray-300">{label}</span>
      <span className={`${MONO} text-2xl font-semibold ${hot ? 'text-yellow-400' : 'text-white'}`}>{count}</span>
    </button>
  )
}
