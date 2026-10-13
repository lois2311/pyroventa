import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, RefreshCw, Send } from 'lucide-react'
import { api } from '../../../lib/api.js'
import { timeAgo } from '../../../lib/format.js'
import { useApi } from '../../../hooks/useApi.js'
import PageHeader from '../../../components/PageHeader.jsx'
import EmptyState from '../../../components/EmptyState.jsx'
import ErrorNotice from '../../../components/ErrorNotice.jsx'
import Select from '../../../components/Select.jsx'
import { FormError, SkeletonGrid } from '../shared.jsx'
import { MONO, Badge, useActionKeys } from './shared.jsx'

const POLL_MS = 15_000
const MAX_TEXT = 1000
const WINDOW_CLOSED = 'Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite plantillas aprobadas.'
const BOGOTA = { timeZone: 'America/Bogota' }
/** Hora si es de hoy; fecha y hora si es de otro día (repetir la fecha en cada burbuja satura el chat). */
function messageTime(iso) {
  const d = new Date(iso)
  const hm = d.toLocaleTimeString('es-CO', { ...BOGOTA, hour: '2-digit', minute: '2-digit', hour12: false })
  const day = (x) => x.toLocaleDateString('en-CA', BOGOTA)
  return day(d) === day(new Date()) ? hm : `${d.toLocaleDateString('es-CO', { ...BOGOTA, day: '2-digit', month: '2-digit' })} ${hm}`
}
const STATUS_LABEL = { queued: 'En cola', sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'No enviado' }

/** Refresca cada 15 s mientras la pestaña está visible. */
function usePolling(refetch) {
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refetch() }, POLL_MS)
    return () => clearInterval(t)
  }, [refetch])
}

// ===========================================================
// TAB: Conversaciones de WhatsApp (permiso manage_conversations).
// Una conversación no es un pedido: aquí solo se atiende al cliente.
// ===========================================================
export default function ConversacionesTab({ locations, isOwner }) {
  const [picked, setPicked] = useState('')
  const locationId = picked || (isOwner ? '' : (locations[0]?.id || ''))
  const [status, setStatus] = useState('open')
  const [selectedId, setSelectedId] = useState(null)

  const qs = new URLSearchParams({ status, ...(locationId && { location_id: locationId }) })
  const q = useApi(!isOwner && !locationId ? null : `/orders/conversations?${qs}`, { initialData: [] })
  const list = useMemo(() => q.data || [], [q.data])
  usePolling(q.refetch)

  const selected = list.find(c => c.id === selectedId) || null
  const showPicker = isOwner || locations.length > 1

  return (
    <div className="space-y-6">
      {/* En móvil, con un chat abierto el encabezado y los filtros ceden el lugar al chat */}
      <div className={`space-y-6 ${selected ? 'hidden lg:block' : ''}`}>
      <PageHeader
        title="Conversaciones"
        description="Mensajes de WhatsApp de tus clientes. Responde desde aquí; un pedido se crea aparte."
        actions={
          <button type="button" onClick={q.refetch} className="btn-outline" disabled={q.loading}>
            <RefreshCw className={`h-4 w-4 ${q.loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Actualizar
          </button>
        }
      />
      <ErrorNotice error={q.error} title="No se pudieron cargar las conversaciones" onRetry={q.refetch} />

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        {showPicker && (
          <div className="col-span-2 sm:min-w-48">
            <label htmlFor="conv-loc" className="field-label">Punto de venta</label>
            <Select id="conv-loc" value={locationId} onChange={v => { setPicked(v); setSelectedId(null) }}
              options={[...(isOwner ? [{ value: '', label: 'Todos los puntos' }] : []), ...locations.map(l => ({ value: l.id, label: l.name }))]} />
          </div>
        )}
        <div className="col-span-2 sm:col-span-1">
          <span className="field-label">Estado</span>
          <div className="segmented" role="group" aria-label="Estado de la conversación">
            {[['open', 'Abiertas'], ['closed', 'Cerradas']].map(([v, label]) => (
              <button key={v} type="button" aria-pressed={status === v} onClick={() => { setStatus(v); setSelectedId(null) }}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        {/* Cola: en pantallas angostas se oculta al abrir un chat (maestro → detalle) */}
        <section aria-label="Cola de conversaciones" className={`panel overflow-hidden ${selected ? 'hidden lg:block' : ''}`}>
          {q.loading && !list.length ? (
            <div className="p-3"><SkeletonGrid count={4} height="h-16" /></div>
          ) : list.length === 0 ? (
            !q.error && (
              <EmptyState compact icon={MessageSquare} title={status === 'open' ? 'No hay conversaciones abiertas' : 'No hay conversaciones cerradas'}
                description="Los mensajes de WhatsApp de tus clientes aparecerán aquí." />
            )
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-white/5 overflow-y-auto">
              {list.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-current={c.id === selectedId ? 'true' : undefined}
                    className={`block w-full min-h-[var(--control-h)] px-4 py-3 text-left transition-colors hover:bg-surface-50 ${c.id === selectedId ? 'bg-brand-500/10' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">{c.customer.name || c.customer.phone}</span>
                      <span className="shrink-0 text-xs text-gray-400">{timeAgo(c.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-400">{c.last_message_preview || 'Sin mensajes'}</span>
                    <span className="mt-1 flex items-center gap-2">
                      {c.customer.name && <span className={`${MONO} text-xs text-gray-400`}>{c.customer.phone}</span>}
                      {!c.window_open && <Badge tone="yellow">Fuera de la ventana de 24 h</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Chat" className={selected ? '' : 'hidden lg:block'}>
          {selected
            ? <ChatPanel key={selected.id} conversation={selected} onBack={() => setSelectedId(null)} onSent={q.refetch} />
            : <EmptyState icon={MessageSquare} title="Elige una conversación" description="Selecciona un chat de la cola para leer y responder." className="h-full min-h-60" />}
        </section>
      </div>
    </div>
  )
}

function ChatPanel({ conversation, onBack, onSent }) {
  const fid = useId()
  const keys = useActionKeys()
  const latest = useApi(`/orders/conversations/${conversation.id}/messages`)
  usePolling(latest.refetch)
  const [older, setOlder] = useState({ messages: [], next_before: undefined, loading: false })
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const stick = useRef(true) // seguir el final solo si el operador ya estaba abajo

  const page = latest.data
  const messages = useMemo(() => {
    const seen = new Set()
    return [...older.messages, ...(page?.messages || [])].filter(m => !seen.has(m.id) && seen.add(m.id))
  }, [older.messages, page])
  const nextBefore = older.next_before === undefined ? page?.next_before : older.next_before
  const windowOpen = page ? page.conversation.window_open : conversation.window_open
  const lastId = messages.at(-1)?.id

  useEffect(() => { if (stick.current) endRef.current?.scrollIntoView?.({ block: 'end' }) }, [lastId])

  const loadOlder = async () => {
    setOlder(o => ({ ...o, loading: true }))
    try {
      const r = await api.get(`/orders/conversations/${conversation.id}/messages?before=${encodeURIComponent(nextBefore)}`)
      stick.current = false
      setOlder(o => ({ messages: [...r.messages, ...o.messages], next_before: r.next_before, loading: false }))
    } catch (err) { setError(err.message); setOlder(o => ({ ...o, loading: false })) }
  }

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending || !windowOpen) return
    setSending(true); setError('')
    try {
      await api.post(`/orders/conversations/${conversation.id}/messages`, { text: body }, { headers: { 'Idempotency-Key': keys.get('send') } })
      keys.done('send')
      setText(''); stick.current = true
      latest.refetch(); onSent?.()
    } catch (err) {
      setError(err.message)
      if (err.status === 409) keys.done('send') // ventana cerrada: no es un reintento
    } finally { setSending(false) }
  }

  return (
    <div className="panel flex h-[70dvh] min-h-[420px] flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button type="button" onClick={onBack} className="btn-ghost btn-icon lg:hidden" aria-label="Volver a la cola">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-white">{conversation.customer.name || conversation.customer.phone}</h2>
          {conversation.customer.name && <p className={`${MONO} text-xs text-gray-400`}>{conversation.customer.phone}</p>}
        </div>
        {!windowOpen && <Badge tone="yellow">Fuera de la ventana de 24 h</Badge>}
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}
      >
        <ErrorNotice error={latest.error} title="No se pudo cargar el chat" onRetry={latest.refetch} />
        {latest.loading && !page && <div className="skeleton h-40 rounded-lg" role="status" aria-label="Cargando mensajes" />}
        {nextBefore && (
          <div className="mb-3 text-center">
            <button type="button" className="btn-ghost btn-sm" onClick={loadOlder} disabled={older.loading}>
              {older.loading ? 'Cargando…' : 'Ver mensajes anteriores'}
            </button>
          </div>
        )}
        <ol role="log" aria-live="polite" aria-label="Mensajes" className="space-y-2">
          {messages.map(m => {
            const out = m.direction === 'outbound'
            return (
              <li key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${out ? 'border-brand-500/20 bg-brand-500/15 text-white' : 'border-white/5 bg-surface-300 text-white'}`}>
                  {m.type === 'image' && <p className="mb-1 text-xs text-gray-400">Imagen</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body || (m.type === 'image' ? '' : '—')}</p>
                  <p className="mt-1 flex items-center justify-end gap-2 text-xs text-gray-400">
                    <span className={MONO}>{messageTime(m.created_at)}</span>
                    {out && <span className={m.status === 'failed' ? 'font-medium text-red-400' : ''}>{STATUS_LABEL[m.status] || m.status}</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="space-y-2 border-t border-white/5 p-3">
        <FormError message={error} />
        {!windowOpen && <p role="status" className="rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-400">{WINDOW_CLOSED}</p>}
        <label htmlFor={`${fid}-reply`} className="sr-only">Respuesta</label>
        <div className="flex items-end gap-2">
          <textarea
            id={`${fid}-reply`} rows={2} maxLength={MAX_TEXT} className="input min-h-12 flex-1 resize-none"
            placeholder={windowOpen ? 'Escribe tu respuesta…' : 'No se puede responder fuera de la ventana de 24 h'}
            value={text} disabled={!windowOpen}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e) }}
          />
          <button type="submit" className="btn-primary" disabled={!windowOpen || sending || !text.trim()}>
            <Send className="h-4 w-4" aria-hidden="true" /> Enviar
          </button>
        </div>
        <p className="text-xs text-gray-400">Enter envía · Mayús + Enter agrega una línea</p>
      </form>
    </div>
  )
}
