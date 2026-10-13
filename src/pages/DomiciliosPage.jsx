import { useEffect, useState } from 'react'
import { Bike, CheckCircle2, MapPin, MessageCircle, Phone, RefreshCw, TriangleAlert, Banknote } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useApi } from '../hooks/useApi.js'
import Topbar from '../components/Topbar.jsx'
import PageHeader from '../components/PageHeader.jsx'
import EmptyState from '../components/EmptyState.jsx'
import ErrorNotice from '../components/ErrorNotice.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { useToast } from '../components/Toast.jsx'
import { SkeletonGrid } from './admin/shared.jsx'
import { MONO, Badge } from './admin/pedidos/shared.jsx'

const POLL_MS = 15_000
const STATUS = {
  assigned:        { label: 'Por recoger', tone: 'yellow' },
  picked_up:       { label: 'En camino', tone: 'blue' },
  delivered:       { label: 'Entregado', tone: 'green' },
  delivery_failed: { label: 'No entregado', tone: 'red' },
  ready_for_dispatch: { label: 'Listo', tone: 'gray' },
}
const VIEWS = [['active', 'Mis entregas'], ['today', 'Historial de hoy']]

const mapsUrl = (address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
const whatsappUrl = (phone) => `https://wa.me/${String(phone).replace(/\D/g, '')}`
const hhmm = (iso) => new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false })

// ===========================================================
// Vista del domiciliario (móvil primero). El servidor solo le devuelve SUS entregas;
// el operador (admin/owner) que abre esta pantalla ve las de su punto.
// Entregar no cobra en caja ni toca inventario: el efectivo se anota para que el domiciliario lo recaude.
// ===========================================================
export default function DomiciliosPage() {
  const [view, setView] = useState('active')
  const q = useApi(`/orders/deliveries?view=${view}`, { initialData: [] })
  const confirm = useConfirm()
  const toast = useToast()
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const { refetch } = q
  useEffect(() => {
    if (view !== 'active') return undefined
    const t = setInterval(() => { if (document.visibilityState === 'visible') refetch() }, POLL_MS)
    return () => clearInterval(t)
  }, [view, refetch])

  const list = q.data || []

  const setStatus = async (d, status, reason) => {
    if (busyId) return // evita doble toque
    setBusyId(d.id); setActionError(null)
    try {
      await api.post(`/orders/deliveries/${d.id}/status`, { status, ...(reason && { reason }) })
      toast.success(status === 'picked_up' ? 'Marcado como recogido' : status === 'delivered' ? 'Entrega confirmada' : 'Novedad reportada')
      refetch()
    } catch (err) {
      setActionError(err)
      if (err.status === 409) refetch() // otro cambió el estado: se muestra el real
    } finally { setBusyId(null) }
  }

  const markDelivered = async (d) => {
    const ok = await confirm({
      title: `¿Entregaste el pedido #${d.order_code}?`,
      description: d.collect_amount > 0 ? `Recuerda cobrar ${formatCOP(d.collect_amount)} en efectivo.` : 'El pedido ya está pagado.',
      confirmLabel: 'Sí, entregado',
    })
    if (ok) setStatus(d, 'delivered')
  }

  const reportIssue = async (d) => {
    const reason = await confirm({
      title: 'Reportar novedad', tone: 'danger', confirmLabel: 'Reportar',
      description: 'La entrega queda como no entregada y el negocio la reprograma.',
      input: { label: '¿Qué pasó?', required: true, multiline: true, requiredMessage: 'Cuenta qué pasó' },
    })
    if (reason) setStatus(d, 'delivery_failed', reason)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Topbar title="Domicilios" />
      <main className="page-container w-full max-w-2xl space-y-4 py-4 sm:py-8">
        <PageHeader
          title="Domicilios"
          icon={Bike}
          actions={
            <button type="button" onClick={q.refetch} className="btn-outline" disabled={q.loading}>
              <RefreshCw className={`h-4 w-4 ${q.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Actualizar
            </button>
          }
        />
        <div className="segmented w-full" role="group" aria-label="Vista">
          {VIEWS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className="flex-1 justify-center">
              {label}{id === 'active' && view === 'active' && list.length > 0 && <span className={`${MONO} ml-1.5 text-gray-400`}>{list.length}</span>}
            </button>
          ))}
        </div>

        <ErrorNotice error={q.error} title="No se pudieron cargar las entregas" onRetry={q.refetch} />
        <ErrorNotice error={actionError} title="No se pudo actualizar la entrega" />

        {q.loading && !list.length ? (
          <SkeletonGrid count={2} height="h-56" />
        ) : list.length === 0 ? (
          !q.error && (
            <EmptyState
              icon={view === 'active' ? Bike : CheckCircle2}
              title={view === 'active' ? 'No tienes entregas pendientes' : 'Aún no has terminado entregas hoy'}
              description={view === 'active' ? 'Cuando te asignen un pedido aparecerá aquí.' : 'Las entregas que completes o reportes hoy se listan aquí.'}
            />
          )
        ) : view === 'active' ? (
          <ul className="space-y-3" aria-label="Entregas activas">
            {list.map(d => (
              <li key={d.id}>
                <ActiveCard d={d} busy={busyId === d.id} onPickup={() => setStatus(d, 'picked_up')} onDeliver={() => markDelivered(d)} onIssue={() => reportIssue(d)} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2" aria-label="Entregas de hoy">
            {list.map(d => <HistoryRow key={d.id} d={d} />)}
          </ul>
        )}
      </main>
    </div>
  )
}

function ActiveCard({ d, busy, onPickup, onDeliver, onIssue }) {
  const s = STATUS[d.status] || STATUS.assigned
  return (
    <article className="card space-y-4" aria-label={`Pedido ${d.order_code}`}>
      <header className="flex items-center justify-between gap-2">
        <span className={`${MONO} text-sm text-gray-400`}>#{d.order_code}</span>
        <Badge tone={s.tone}>{s.label}</Badge>
      </header>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-white">{d.recipient_name}</h2>
        <p className="text-base text-gray-200">{d.delivery_address}</p>
        {d.instructions && <p className="text-sm text-gray-400">Indicaciones: {d.instructions}</p>}
        {d.driver?.name && <p className="text-xs text-gray-400">Domiciliario: {d.driver.name}</p>}
      </div>

      {d.collect_amount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-3 text-yellow-400">
          <Banknote className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm">Cobrar en efectivo</span>
          <span className={`${MONO} ml-auto text-xl font-semibold`}>{formatCOP(d.collect_amount)}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <a href={mapsUrl(d.delivery_address)} target="_blank" rel="noopener noreferrer" className="btn-outline flex-col gap-0.5 py-1 text-xs">
          <MapPin className="h-4 w-4" aria-hidden="true" /> Cómo llegar
        </a>
        <a href={`tel:${d.recipient_phone}`} className="btn-outline flex-col gap-0.5 py-1 text-xs">
          <Phone className="h-4 w-4" aria-hidden="true" /> Llamar
        </a>
        <a href={whatsappUrl(d.recipient_phone)} target="_blank" rel="noopener noreferrer" className="btn-outline flex-col gap-0.5 py-1 text-xs">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> WhatsApp
        </a>
      </div>

      <div className="space-y-2">
        {d.status === 'assigned' && (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={onPickup}>Marcar recogido</button>
        )}
        {d.status === 'picked_up' && (
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={onDeliver}>Marcar entregado</button>
        )}
        <button type="button" className="btn-outline w-full text-red-400" disabled={busy} onClick={onIssue}>
          <TriangleAlert className="h-4 w-4" aria-hidden="true" /> Reportar novedad
        </button>
      </div>
    </article>
  )
}

function HistoryRow({ d }) {
  const s = STATUS[d.status] || STATUS.delivered
  return (
    <li className="card flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className={`${MONO} text-xs text-gray-400`}>#{d.order_code}</span>
          <span className="truncate text-sm font-medium text-white">{d.recipient_name}</span>
        </p>
        <p className="truncate text-xs text-gray-400">{d.delivery_address}</p>
        {d.failure_reason && <p className="mt-1 text-xs text-red-400">{d.failure_reason}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={s.tone}>{s.label}</Badge>
        <span className={`${MONO} text-xs text-gray-400`}>{hhmm(d.delivered_at || d.updated_at)}</span>
        {d.collect_amount > 0 && d.status === 'delivered' && <span className={`${MONO} text-xs text-gray-300`}>{formatCOP(d.collect_amount)}</span>}
      </div>
    </li>
  )
}
