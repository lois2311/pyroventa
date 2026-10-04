import { useCallback, useEffect, useState } from 'react'
import {
  LifeBuoy, RefreshCw, MessageSquare, CheckCircle2, Clock, AlertTriangle,
  Printer, CreditCard, Package, KeyRound, Eye, Loader2, Filter, Building2,
  Check, X, ShieldAlert,
} from 'lucide-react'
import { superApi } from '../../lib/superApi.js'
import { supabase } from '../../lib/supabase.js'
import { normalizeWhatsAppNumber } from '../../lib/whatsappSupport.js'
import Modal from '../../components/Modal.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import MetricTile from '../../components/MetricTile.jsx'
import { SectionHeader } from '../../components/PageHeader.jsx'

const CATEGORY_META = {
  printer:   { label: 'Impresora',  icon: Printer,       color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  payment:   { label: 'Cobros',     icon: CreditCard,    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  inventory: { label: 'Inventario', icon: Package,       color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  auth:      { label: 'Acceso',     icon: KeyRound,      color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  system:    { label: 'Sistema',    icon: AlertTriangle, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  other:     { label: 'Otro',       icon: LifeBuoy,      color: 'text-gray-400 bg-gray-500/10 border-gray-500/30' },
}

const PRIORITY_META = {
  critical: { label: 'Crítica', cls: 'border-red-500/40 bg-red-500/20 text-red-300 animate-pulse' },
  high:     { label: 'Alta',    cls: 'border-amber-500/40 bg-amber-500/20 text-amber-300' },
  medium:   { label: 'Media',   cls: 'border-blue-500/30 bg-blue-500/15 text-blue-300' },
  low:      { label: 'Baja',    cls: 'border-gray-500/30 bg-gray-500/15 text-gray-400' },
}

const STATUS_META = {
  open:        { label: 'Abierto',     cls: 'border-amber-500/40 bg-amber-500/15 text-amber-400' },
  in_progress: { label: 'En atención', cls: 'border-sky-500/40 bg-sky-500/15 text-sky-400' },
  resolved:    { label: 'Resuelto',    cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' },
  closed:      { label: 'Cerrado',     cls: 'border-gray-500/30 bg-gray-500/15 text-gray-400' },
}

function timeAgo(dateString) {
  if (!dateString) return ''
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (diffSec < 60) return 'Hace un momento'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Hace ${diffMin} min`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `Hace ${diffHour} h`
  const diffDays = Math.floor(diffHour / 24)
  return `Hace ${diffDays} d`
}

function playChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15) // A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Silencioso si la política del navegador bloquea audio antes de interacción
  }
}

export default function SupportDeskTab({ tenants = [] }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [justArrivedId, setJustArrivedId] = useState(null)

  // Filtros
  const [statusFilter, setStatusFilter] = useState('active') // 'active' | 'open' | 'in_progress' | 'resolved' | ''
  const [priorityFilter, setPriorityFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')

  // Detalle de ticket para inspección técnica
  const [inspectTicket, setInspectTicket] = useState(null)
  // Resolver ticket
  const [resolvingTicket, setResolvingTicket] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [savingAction, setSavingAction] = useState(false)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (tenantFilter) params.append('tenant_id', tenantFilter)

      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await superApi.get(`/super/support/tickets${query}`)
      setTickets(data?.tickets || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, tenantFilter])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  // Suscripción Realtime a support_tickets
  useEffect(() => {
    const channel = supabase
      .channel('super-support-tickets-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_tickets' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newTicket = payload.new
            setTickets((prev) => [newTicket, ...prev])
            setJustArrivedId(newTicket.id)
            setTimeout(() => setJustArrivedId(null), 6000)
            if (newTicket.priority === 'critical' || newTicket.priority === 'high') {
              playChime()
            }
          } else if (payload.eventType === 'UPDATE') {
            setTickets((prev) =>
              prev.map((t) => (t.id === payload.new.id ? payload.new : t))
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const handleUpdateStatus = async (ticketId, nextStatus, notes = null) => {
    setSavingAction(true)
    try {
      const body = { status: nextStatus }
      if (notes) body.resolution_notes = notes
      const res = await superApi.patch(`/super/support/tickets/${ticketId}`, body)
      if (res?.ticket) {
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? res.ticket : t))
        )
      }
      setResolvingTicket(null)
      setResolutionNotes('')
    } catch (err) {
      alert(`Error actualizando ticket: ${err.message}`)
    } finally {
      setSavingAction(false)
    }
  }

  // Métricas
  const openCount = tickets.filter((t) => t.status === 'open').length
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length
  const criticalCount = tickets.filter((t) => t.priority === 'critical' && t.status !== 'resolved').length

  return (
    <section className="space-y-6">
      <SectionHeader
        title="Mesa de Soporte de Plataforma"
        icon={LifeBuoy}
        description="Atención técnica e incidencias reportadas en tiempo real por los clientes."
        actions={
          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            className="btn-outline btn-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        }
      />

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile icon={Clock} label="Pendientes" value={openCount} color="text-amber-400" />
        <MetricTile icon={MessageSquare} label="En atención" value={inProgressCount} color="text-sky-400" />
        <MetricTile icon={AlertTriangle} label="Críticos / Urgentes" value={criticalCount} color={criticalCount > 0 ? 'text-red-400' : 'text-white'} />
        <MetricTile icon={CheckCircle2} label="Tickets en lista" value={tickets.length} />
      </div>

      {/* Barra de Filtros */}
      <div className="panel p-3 sm:p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-medium text-gray-300">Filtros:</span>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto text-xs py-1"
          aria-label="Filtrar por estado"
        >
          <option value="active">Activos (Abiertos + En atención)</option>
          <option value="open">Solo Abiertos</option>
          <option value="in_progress">Solo En Atención</option>
          <option value="resolved">Solo Resueltos</option>
          <option value="">Todos los estados</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="input w-auto text-xs py-1"
          aria-label="Filtrar por prioridad"
        >
          <option value="">Todas las prioridades</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>

        {tenants.length > 0 && (
          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="input w-auto text-xs py-1 max-w-[200px]"
            aria-label="Filtrar por empresa"
          >
            <option value="">Todas las empresas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {/* Tabla de Tickets */}
      {loading && tickets.length === 0 ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No hay tickets de soporte pendientes"
          description="Todos los reportes e incidencias están al día con los filtros seleccionados."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm tabular-nums text-left">
            <thead>
              <tr className="border-b border-white/5 text-xs text-gray-400">
                <th scope="col" className="py-3 pl-4 pr-2 font-medium">Ticket</th>
                <th scope="col" className="py-3 px-2 font-medium">Empresa / Punto</th>
                <th scope="col" className="py-3 px-2 font-medium">Categoría</th>
                <th scope="col" className="py-3 px-2 font-medium">Problema reportado</th>
                <th scope="col" className="py-3 px-2 font-medium">Prioridad</th>
                <th scope="col" className="py-3 px-2 font-medium">Estado</th>
                <th scope="col" className="py-3 pl-2 pr-4 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const cat = CATEGORY_META[t.category] || CATEGORY_META.other
                const prio = PRIORITY_META[t.priority] || PRIORITY_META.medium
                const stat = STATUS_META[t.status] || STATUS_META.open
                const CatIcon = cat.icon
                const waPhone = normalizeWhatsAppNumber(t.contact_phone)
                const waText = encodeURIComponent(
                  `Hola ${t.reported_by_name}, te escribo de la Mesa de Soporte VENDRA respecto a tu ticket ${t.ticket_code} (${t.tenant_name}). ¿Cómo te podemos asistir?`
                )
                const waUrl = `https://wa.me/${waPhone}?text=${waText}`

                return (
                  <tr
                    key={t.id}
                    className={`border-t border-white/5 transition ${
                      justArrivedId === t.id
                        ? 'bg-brand-500/20 ring-1 ring-brand-500/50'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {/* Código y tiempo */}
                    <td className="py-3 pl-4 pr-2">
                      <span className="font-mono font-bold text-white text-xs block">
                        {t.ticket_code}
                      </span>
                      <span className="text-[11px] text-gray-400">{timeAgo(t.created_at)}</span>
                    </td>

                    {/* Empresa y punto */}
                    <td className="py-3 px-2 min-w-[140px]">
                      <span className="font-medium text-white text-xs block truncate max-w-[150px]">
                        {t.tenant_name}
                      </span>
                      <span className="text-[11px] text-gray-400 truncate block max-w-[150px]">
                        {t.location_name || 'Sin punto'} · {t.reported_by_name}
                      </span>
                    </td>

                    {/* Categoría */}
                    <td className="py-3 px-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cat.color}`}>
                        <CatIcon className="w-3 h-3" />
                        {cat.label}
                      </span>
                    </td>

                    {/* Problema */}
                    <td className="py-3 px-2 max-w-[220px]">
                      <p className="text-xs text-gray-200 truncate font-normal">
                        {t.description || t.subcategory || 'Sin descripción'}
                      </p>
                    </td>

                    {/* Prioridad */}
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${prio.cls}`}>
                        {prio.label}
                      </span>
                    </td>

                    {/* Estado */}
                    <td className="py-3 px-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${stat.cls}`}>
                        {stat.label}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="py-3 pl-2 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Botón WhatsApp */}
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline btn-sm py-1 px-2 text-green-400 border-green-500/30 hover:bg-green-500/10 inline-flex items-center gap-1"
                          title="Abrir chat de WhatsApp con el cliente"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline text-xs">WhatsApp</span>
                        </a>

                        {/* Botón Inspección Técnica */}
                        <button
                          type="button"
                          onClick={() => setInspectTicket(t)}
                          className="btn-ghost btn-sm py-1 px-2 text-gray-300 hover:text-white"
                          title="Ver diagnóstico y telemetría"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Botones de gestión rápida */}
                        {t.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(t.id, 'in_progress')}
                            disabled={savingAction}
                            className="btn-primary btn-sm py-1 px-2 text-xs"
                            title="Atender este ticket"
                          >
                            Atender
                          </button>
                        )}

                        {t.status === 'in_progress' && (
                          <button
                            type="button"
                            onClick={() => setResolvingTicket(t)}
                            disabled={savingAction}
                            className="btn-outline btn-sm py-1 px-2 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 text-xs"
                            title="Resolver este ticket"
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Resolver
                          </button>
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

      {/* Modal de Inspección Técnica */}
      {inspectTicket && (
        <Modal
          title={`Diagnóstico: ${inspectTicket.ticket_code}`}
          icon={LifeBuoy}
          size="lg"
          onClose={() => setInspectTicket(null)}
          footer={
            <button
              type="button"
              onClick={() => setInspectTicket(null)}
              className="btn-primary"
            >
              Cerrar
            </button>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-white/10 bg-surface-400 p-3 space-y-2">
              <p className="font-semibold text-white text-sm">Información del Negocio</p>
              <div className="grid grid-cols-2 gap-2 text-gray-300">
                <div><span className="text-gray-500">Empresa:</span> {inspectTicket.tenant_name}</div>
                <div><span className="text-gray-500">Punto:</span> {inspectTicket.location_name || 'N/A'}</div>
                <div><span className="text-gray-500">Caja:</span> {inspectTicket.register_name || 'N/A'}</div>
                <div><span className="text-gray-500">Reportó:</span> {inspectTicket.reported_by_name} ({inspectTicket.reported_by_role || 'Staff'})</div>
                <div><span className="text-gray-500">Contacto:</span> {inspectTicket.contact_phone}</div>
                <div><span className="text-gray-500">Fecha:</span> {new Date(inspectTicket.created_at).toLocaleString('es-CO')}</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-surface-400 p-3 space-y-2">
              <p className="font-semibold text-white text-sm">Problema Reportado</p>
              <p className="text-gray-300">{inspectTicket.description || 'Sin descripción adicional'}</p>
              {inspectTicket.resolution_notes && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <span className="text-emerald-400 font-medium block">Notas de resolución:</span>
                  <p className="text-gray-300">{inspectTicket.resolution_notes}</p>
                </div>
              )}
            </div>

            {inspectTicket.technical_context && (
              <div className="rounded-xl border border-white/10 bg-surface-400 p-3 space-y-2">
                <p className="font-semibold text-white text-sm">Telemetría Técnica</p>
                <div className="space-y-1 font-mono text-[11px] text-gray-300 bg-black/40 p-2.5 rounded-lg overflow-x-auto">
                  <div>Estado de red: {inspectTicket.technical_context.online ? 'En línea (Online)' : 'Sin conexión (Offline)'}</div>
                  <div>Navegador: {inspectTicket.technical_context.ua || 'N/A'}</div>
                  <div>URL: {inspectTicket.technical_context.url || 'N/A'}</div>
                  <div>Pantalla: {inspectTicket.technical_context.screen || 'N/A'}</div>
                  {inspectTicket.technical_context.invoice_code && (
                    <div className="text-brand-400 font-bold">
                      Factura en pantalla: #{inspectTicket.technical_context.invoice_code}
                    </div>
                  )}
                  {inspectTicket.technical_context.qz_status && (
                    <div>Estado QZ Tray: {inspectTicket.technical_context.qz_status}</div>
                  )}
                  {inspectTicket.technical_context.sentry_event_id && (
                    <div className="text-red-400">
                      ID Sentry: {inspectTicket.technical_context.sentry_event_id}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal para Resolver Ticket */}
      {resolvingTicket && (
        <Modal
          title={`Resolver ticket: ${resolvingTicket.ticket_code}`}
          icon={CheckCircle2}
          iconClassName="text-emerald-400"
          onClose={() => setResolvingTicket(null)}
          onSubmit={(e) => {
            e.preventDefault()
            handleUpdateStatus(resolvingTicket.id, 'resolved', resolutionNotes)
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setResolvingTicket(null)}
                className="btn-ghost"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingAction}
                className="btn-primary"
              >
                {savingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Resolución'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-gray-300">
              Indica brevemente la causa o la solución aplicada para la tienda{' '}
              <span className="font-semibold text-white">{resolvingTicket.tenant_name}</span>:
            </p>
            <textarea
              required
              rows={3}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Ej: Se reinició el servicio QZ Tray en Windows y se calibró el papel a 80mm."
              className="input resize-none text-xs"
            />
          </div>
        </Modal>
      )}
    </section>
  )
}
