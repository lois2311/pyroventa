import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Minus, Plus, ShoppingBag } from 'lucide-react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useApi } from '../hooks/useApi.js'
import EmptyState from '../components/EmptyState.jsx'
import ErrorNotice from '../components/ErrorNotice.jsx'
import FormError from '../components/FormError.jsx'
import { SkeletonGrid } from './admin/shared.jsx'
import { MONO } from './admin/pedidos/shared.jsx'

// =====================================================
// Formulario público de pedidos (/pedir/:slug): sin sesión.
// El cliente elige productos, ve la cotización que calcula el servidor y envía la solicitud.
// Los precios nunca salen de aquí: se envían presentation_id y cantidad, y el total que el cliente vio
// (si cambió, el servidor responde 409 con la cotización nueva y hay que confirmar de nuevo).
// =====================================================

const PAYMENT_LABEL = { cash_on_delivery: 'Pago contraentrega', transfer: 'Transferencia bancaria' }
const EMPTY_FORM = { name: '', phone: '', fulfillment: 'delivery', zone_id: '', address: '', details: '', notes: '', payment_method: '', consent: false }

const storageKey = (slug) => `vp_pedido_${slug}`
function loadSaved(slug) {
  try { return JSON.parse(sessionStorage.getItem(storageKey(slug))) || null } catch { return null }
}

export default function PedidoPublicoPage() {
  const { slug } = useParams()
  const catalogQ = useApi(`/public/orders/${slug}/catalog`)
  const saved = useMemo(() => loadSaved(slug), [slug])
  const [cart, setCart] = useState(saved?.cart || {})
  const [form, setForm] = useState({ ...EMPTY_FORM, ...saved?.form, consent: false })
  const [step, setStep] = useState('shop') // shop | checkout | done
  const [done, setDone] = useState(null)

  // El carrito y los datos no se pierden al recargar (el consentimiento sí se vuelve a pedir)
  useEffect(() => {
    try { sessionStorage.setItem(storageKey(slug), JSON.stringify({ cart, form: { ...form, consent: false } })) } catch { /* sin almacenamiento */ }
  }, [slug, cart, form])

  const catalog = catalogQ.data
  const presentations = useMemo(() => {
    const m = new Map()
    for (const p of catalog?.products || []) for (const pr of p.presentations) m.set(pr.id, { ...pr, product: p.name })
    return m
  }, [catalog])
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && presentations.has(id))
  const count = lines.reduce((s, [, q]) => s + q, 0)
  const estimate = lines.reduce((s, [id, q]) => s + presentations.get(id).price * q, 0)
  const setQty = (id, q) => setCart(c => ({ ...c, [id]: Math.max(0, Math.min(99, q)) }))

  if (catalogQ.error?.status === 404) {
    return <Shell><EmptyState icon={ShoppingBag} title="Este negocio no recibe pedidos en línea" description="Verifica el enlace o comunícate directamente con el negocio." /></Shell>
  }
  if (!catalog) {
    return (
      <Shell>
        <ErrorNotice error={catalogQ.error} title="No se pudo cargar el catálogo" onRetry={catalogQ.refetch} />
        {!catalogQ.error && <SkeletonGrid count={3} height="h-28" />}
      </Shell>
    )
  }

  if (step === 'done') return <Shell name={catalog.business.name}><Confirmation slug={slug} done={done} business={catalog.business} /></Shell>

  if (step === 'checkout') {
    return (
      <Shell name={catalog.business.name}>
        <Checkout
          slug={slug} catalog={catalog} lines={lines} form={form} setForm={setForm}
          onBack={() => setStep('shop')}
          onDone={(result) => { setDone(result); setCart({}); setStep('done'); window.scrollTo({ top: 0 }) }}
        />
      </Shell>
    )
  }

  const groups = [...(catalog.products || [])].reduce((acc, p) => {
    const key = p.category?.name || 'Productos'
    ;(acc[key] ||= []).push(p)
    return acc
  }, {})

  return (
    <Shell name={catalog.business.name} footerPad>
      {!catalog.products.length ? (
        <EmptyState icon={ShoppingBag} title="Aún no hay productos disponibles" description="Vuelve a intentarlo más tarde." />
      ) : Object.entries(groups).map(([group, products]) => (
        <section key={group} aria-label={group} className="space-y-3">
          <h2 className="eyebrow">{group}</h2>
          <ul className="space-y-3">
            {products.map(p => (
              <li key={p.id} className="card flex gap-3">
                {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg bg-surface-50 object-cover" />}
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <h3 className="text-base font-semibold text-white">{p.name}</h3>
                    {p.description && <p className="line-clamp-2 text-sm text-gray-400">{p.description}</p>}
                  </div>
                  {p.presentations.map(pr => (
                    <div key={pr.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm text-gray-300">{pr.label} · <span className={`${MONO} text-white`}>{formatCOP(pr.price)}</span></span>
                      <Stepper label={`${p.name} ${pr.label}`} value={cart[pr.id] || 0} onChange={q => setQty(pr.id, q)} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-surface-500/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-gutter py-3">
            <p className="min-w-0 flex-1 text-sm text-gray-300">
              <span className={`${MONO} font-semibold text-white`}>{count}</span> {count === 1 ? 'producto' : 'productos'}
              <span className="block text-xs text-gray-400">Subtotal <span className={MONO}>{formatCOP(estimate)}</span></span>
            </p>
            <button type="button" className="btn-primary" onClick={() => { setStep('checkout'); window.scrollTo({ top: 0 }) }}>Continuar</button>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ name, footerPad, children }) {
  return (
    <div className={`min-h-[100dvh] ${footerPad ? 'pb-24' : 'pb-8'}`}>
      <header className="border-b border-white/5 bg-surface-500">
        <div className="mx-auto max-w-2xl px-gutter py-4">
          <h1 className="page-title">{name || 'Pedidos en línea'}</h1>
          {name && <p className="text-sm text-gray-400">Haz tu pedido en línea</p>}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-gutter py-6">{children}</main>
    </div>
  )
}

function Stepper({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="btn-outline btn-icon" aria-label={`Quitar uno de ${label}`} disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className={`${MONO} w-8 text-center text-base text-white`} aria-live="polite">{value}</span>
      <button type="button" className="btn-outline btn-icon" aria-label={`Agregar uno de ${label}`} onClick={() => onChange(value + 1)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function Checkout({ slug, catalog, lines, form, setForm, onBack, onDone }) {
  const fid = useId()
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const zones = catalog.delivery_zones || []
  const methods = catalog.business.payment_methods || []
  const delivery = form.fulfillment === 'delivery'
  const items = useMemo(() => lines.map(([id, q]) => ({ presentation_id: id, quantity: q })), [lines])

  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [changed, setChanged] = useState(false) // los precios cambiaron: hay que confirmar la cotización nueva
  const key = useRef(null)

  // La cotización la calcula el servidor cada vez que cambia el carrito, la entrega o la zona
  useEffect(() => {
    const controller = new AbortController()
    setQuote(null); setQuoteError('')
    api.post(`/public/orders/${slug}/quote`, { items, fulfillment: form.fulfillment, zone_id: form.zone_id || undefined }, { signal: controller.signal, retries: 0 })
      .then(q => { setQuote(q); setChanged(false) })
      .catch(err => { if (!err.canceled) setQuoteError(err.message) })
    return () => controller.abort()
  }, [slug, items, form.fulfillment, form.zone_id])

  const method = form.payment_method || (methods.length === 1 ? methods[0] : '')
  const valid = quote && form.name.trim().length >= 2 && form.phone.trim() && method && form.consent && (!delivery || form.address.trim().length >= 5)

  const submit = async (e) => {
    e.preventDefault()
    if (!valid || sending) return
    setSending(true); setError('')
    key.current ||= crypto.randomUUID() // mismo envío = misma clave: un doble toque no crea dos pedidos
    try {
      const result = await api.post(`/public/orders/${slug}/requests`, {
        items, fulfillment: form.fulfillment, zone_id: form.zone_id || undefined, expected_total: quote.total,
        customer: { name: form.name, phone: form.phone },
        address: delivery ? { address: form.address, details: form.details || undefined } : undefined,
        payment_method: method, consent: true, notes: form.notes || undefined,
      }, { headers: { 'Idempotency-Key': key.current } })
      onDone({ ...result, payment_method: method })
    } catch (err) {
      setError(err.message)
      if (err.status === 409 || err.status === 422) key.current = null // no es un reintento del mismo envío
      if (err.status === 409) setChanged(true)
      // Con 409 el servidor ya calculó la cotización vigente: se vuelve a pedir para mostrarla
      if (err.status === 409) api.post(`/public/orders/${slug}/quote`, { items, fulfillment: form.fulfillment, zone_id: form.zone_id || undefined }, { retries: 0 }).then(setQuote).catch(() => {})
    } finally { setSending(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <button type="button" className="btn-ghost -ml-3" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Seguir comprando</button>

      <section className="card space-y-2" aria-label="Resumen del pedido">
        <h2 className="panel-title">Tu pedido</h2>
        {!quote && !quoteError && <div className="skeleton h-20 rounded-lg" role="status" aria-label="Calculando" />}
        {quoteError && <FormError message={quoteError} />}
        {quote && (
          <>
            <ul className="divide-y divide-white/5">
              {quote.items.map(i => (
                <li key={i.presentation_id} className="flex items-baseline gap-2 py-2 text-sm">
                  <span className={`${MONO} text-gray-400`}>{i.quantity}×</span>
                  <span className="min-w-0 flex-1 text-white">{i.product_name} <span className="text-gray-400">· {i.label}</span></span>
                  <span className={`${MONO} text-white`}>{formatCOP(i.subtotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-white/10 pt-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-400">Subtotal</dt><dd className={MONO}>{formatCOP(quote.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-400">{delivery ? 'Domicilio' : 'Recoges en tienda'}</dt><dd className={MONO}>{formatCOP(quote.delivery_fee)}</dd></div>
              <div className="flex justify-between text-base font-semibold text-white"><dt>Total</dt><dd className={MONO}>{formatCOP(quote.total)}</dd></div>
            </dl>
            {changed && <p role="status" className="rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-sm text-yellow-400">Los precios cambiaron. Revisa el total y vuelve a enviar.</p>}
          </>
        )}
      </section>

      <section className="card space-y-4" aria-label="Entrega">
        <h2 className="panel-title">Entrega</h2>
        <div className="segmented w-full" role="group" aria-label="Forma de entrega">
          {[['delivery', 'Domicilio'], ['pickup', 'Recoger en tienda']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={form.fulfillment === v} className="flex-1 justify-center" onClick={() => set({ fulfillment: v })}>{l}</button>
          ))}
        </div>
        {delivery && zones.length > 1 && (
          <div>
            <label htmlFor={`${fid}-zone`} className="field-label">Zona</label>
            <select id={`${fid}-zone`} className="input" value={form.zone_id} onChange={e => set({ zone_id: e.target.value })}>
              <option value="">Elige tu zona…</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name} · {formatCOP(z.fee)}</option>)}
            </select>
          </div>
        )}
        {delivery && (
          <>
            <div>
              <label htmlFor={`${fid}-addr`} className="field-label">Dirección</label>
              <input id={`${fid}-addr`} className="input" autoComplete="street-address" value={form.address} onChange={e => set({ address: e.target.value })} placeholder="Calle 45 # 12-30" />
            </div>
            <div>
              <label htmlFor={`${fid}-det`} className="field-label">Apartamento, torre o referencia <span className="font-normal">(opcional)</span></label>
              <input id={`${fid}-det`} className="input" value={form.details} onChange={e => set({ details: e.target.value })} />
            </div>
          </>
        )}
      </section>

      <section className="card space-y-4" aria-label="Tus datos">
        <h2 className="panel-title">Tus datos</h2>
        <div>
          <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
          <input id={`${fid}-name`} className="input" autoComplete="name" value={form.name} onChange={e => set({ name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${fid}-phone`} className="field-label">Celular</label>
          <input id={`${fid}-phone`} className={`input ${MONO}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" value={form.phone} onChange={e => set({ phone: e.target.value })} />
          <p className="field-hint">Te avisaremos del estado de tu pedido a este número.</p>
        </div>
        <div>
          <label htmlFor={`${fid}-notes`} className="field-label">Notas <span className="font-normal">(opcional)</span></label>
          <textarea id={`${fid}-notes`} rows={2} maxLength={500} className="input resize-none" value={form.notes} onChange={e => set({ notes: e.target.value })} />
        </div>
      </section>

      <section className="card space-y-3" aria-label="Pago">
        <h2 className="panel-title">Pago</h2>
        <div role="radiogroup" aria-label="Forma de pago" className="space-y-2">
          {methods.map(m => (
            <label key={m} className="flex min-h-[var(--control-h)] cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-surface-400 px-3 has-[:checked]:border-brand-500/50 has-[:checked]:bg-brand-500/10">
              <input type="radio" name={`${fid}-pay`} className="h-5 w-5 accent-brand-500" checked={method === m} onChange={() => set({ payment_method: m })} />
              <span className="text-sm text-white">{PAYMENT_LABEL[m] || m}</span>
            </label>
          ))}
        </div>
        {method === 'transfer' && catalog.business.transfer_instructions && (
          <p className="whitespace-pre-wrap rounded-lg bg-surface-400 px-3 py-2 text-sm text-gray-300">{catalog.business.transfer_instructions}</p>
        )}
      </section>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-300">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" checked={form.consent} onChange={e => set({ consent: e.target.checked })} />
        <span>Autorizo el tratamiento de mis datos personales para gestionar este pedido y recibir avisos sobre su estado.</span>
      </label>

      <FormError message={error} />
      <button type="submit" className="btn-primary w-full" disabled={!valid || sending}>
        {sending ? 'Enviando…' : quote ? `Enviar pedido · ${formatCOP(quote.total)}` : 'Enviar pedido'}
      </button>
    </form>
  )
}

function Confirmation({ slug, done, business }) {
  const link = `/pedir/${slug}/pedido/${done.public_token}`
  return (
    <section className="card space-y-4 text-center" aria-live="polite">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-400/15 text-green-400"><Check className="h-6 w-6" aria-hidden="true" /></span>
      <h2 className="section-title justify-center">¡Recibimos tu pedido!</h2>
      <p className="text-sm text-gray-300">Total <span className={`${MONO} font-semibold text-white`}>{formatCOP(done.total)}</span>. El negocio lo revisará y te avisará.</p>
      {done.payment_method === 'transfer' && (
        <div className="rounded-lg bg-surface-400 px-3 py-2 text-left text-sm text-gray-300">
          <p className="font-medium text-white">Falta tu transferencia</p>
          <p>El pedido se acepta cuando el negocio verifica el pago.</p>
          {business.transfer_instructions && <p className="mt-2 whitespace-pre-wrap">{business.transfer_instructions}</p>}
        </div>
      )}
      <Link to={link} className="btn-primary w-full">Ver el estado de mi pedido</Link>
      <p className="text-xs text-gray-400">Guarda este enlace: es la única forma de consultar tu pedido.</p>
    </section>
  )
}

const STATUS_COPY = {
  submitted: ['Recibimos tu pedido', 'El negocio lo está revisando.'],
  under_review: ['Estamos revisando tu pedido', 'Te avisaremos apenas lo confirmemos.'],
  accepted: ['Tu pedido fue aceptado', 'El negocio lo está preparando.'],
  rejected: ['No pudimos aceptar tu pedido', null],
  cancelled: ['Tu pedido fue cancelado', null],
}

/** /pedir/:slug/pedido/:token — estado del pedido por token opaco (sin sesión). */
export function PedidoEstadoPage() {
  const { slug, token } = useParams()
  const q = useApi(`/public/orders/requests/${token}`)
  const { refetch } = q
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') refetch() }, 20_000)
    return () => clearInterval(t)
  }, [refetch])
  const o = q.data
  const [title, hint] = STATUS_COPY[o?.status] || ['Tu pedido', null]

  return (
    <Shell>
      {q.error?.status === 404 ? (
        <EmptyState icon={ShoppingBag} title="No encontramos este pedido" description="Revisa que el enlace esté completo." />
      ) : (
        <>
          <ErrorNotice error={q.error} title="No se pudo consultar el pedido" onRetry={q.refetch} />
          {!o && !q.error && <div className="skeleton h-40 rounded-lg" role="status" aria-label="Cargando" />}
          {o && (
            <section className="card space-y-3" aria-live="polite">
              <h2 className="section-title">{title}</h2>
              {hint && <p className="text-sm text-gray-300">{hint}</p>}
              {o.status === 'rejected' && o.reject_reason && <p className="text-sm text-red-400">Motivo: {o.reject_reason}</p>}
              {o.payment?.method === 'transfer' && <p className="text-sm text-gray-300">Pago por transferencia: {{ pending: 'pendiente de verificar', proof_submitted: 'comprobante recibido', manually_verified: 'verificado', rejected: 'no se pudo verificar' }[o.payment.status]}</p>}
              <ul className="divide-y divide-white/5">
                {o.items.map((i, n) => (
                  <li key={n} className="flex items-baseline gap-2 py-2 text-sm">
                    <span className={`${MONO} text-gray-400`}>{i.quantity}×</span>
                    <span className="min-w-0 flex-1 text-white">{i.product_name} <span className="text-gray-400">· {i.label}</span></span>
                    <span className={`${MONO} text-white`}>{formatCOP(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <p className="flex justify-between border-t border-white/10 pt-2 text-base font-semibold text-white"><span>Total</span><span className={MONO}>{formatCOP(o.total)}</span></p>
            </section>
          )}
          <Link to={`/pedir/${slug}`} className="btn-outline w-full">Hacer otro pedido</Link>
        </>
      )}
    </Shell>
  )
}
