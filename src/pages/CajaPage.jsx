import { useState, useEffect, useRef, useCallback, useId } from 'react'
import {
  CheckCircle2, Clock, CreditCard, FileText, Hash, Loader2, Monitor,
  Pencil, Receipt, Search, Tag, Undo2, WifiOff, X,
} from 'lucide-react'
import { useAuthStore }    from '../store/authStore.js'
import { useModalA11y }    from '../hooks/useModalA11y.js'
import { useApi }          from '../hooks/useApi.js'
import { useInvoiceStore } from '../store/invoiceStore.js'
import { supabase }        from '../lib/supabase.js'
import { api, getProductsCache, setProductsCache } from '../lib/api.js'
import { can } from '../../api/_lib/roles.js'
import Topbar          from '../components/Topbar.jsx'
import PendingList     from '../components/PendingList.jsx'
import InvoiceDetail   from '../components/InvoiceDetail.jsx'
import PaymentMethods, { METHODS, PROVIDER_KEYS } from '../components/PaymentMethods.jsx'
import PrintButton     from '../components/PrintButton.jsx'
import EditInvoiceModal from '../components/EditInvoiceModal.jsx'
import CloseRegisterModal from '../components/CloseRegisterModal.jsx'
import RefundModal     from '../components/RefundModal.jsx'
import { useToast }    from '../components/Toast.jsx'
import { useConfirm }  from '../components/ConfirmDialog.jsx'
import { formatCOP }   from '../lib/format.js'
import EmptyState      from '../components/EmptyState.jsx'
import ErrorNotice     from '../components/ErrorNotice.jsx'
import Kbd             from '../components/Kbd.jsx'

// Enfoca el campo de código visible (desktop y móvil tienen el suyo)
function focusCodeInput() {
  const el = [...document.querySelectorAll('[data-code-input]')].find(x => x.offsetParent !== null)
  el?.focus()
  el?.select?.()
}

// ---- Campo de código ------------------------------------
function CodeInput({ id, value, onChange, onSearch, loading }) {
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const handleKey = (e) => {
    if (e.key === 'Enter' && value.length === 4) onSearch()
  }
  return (
    <div className="flex items-stretch gap-2">
      <input
        id={id}
        ref={inputRef}
        data-code-input
        aria-keyshortcuts="/"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={handleKey}
        placeholder="____"
        className="input input-lg min-w-0 flex-1 text-center font-mono text-2xl tracking-[0.5em] indent-[0.5em]"
      />
      <button
        type="button"
        onClick={onSearch}
        disabled={value.length !== 4 || loading}
        className="btn-primary btn-lg shrink-0 px-5"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        Buscar
      </button>
    </div>
  )
}

// ---- Overlay de cobro exitoso ---------------------------
function PaidOverlay({ invoice, onDone }) {
  const titleId = useId()
  const panelRef = useModalA11y(onDone)
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="bg-surface-300 border border-green-500/30 rounded-2xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl animate-scale-in">
        <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 text-green-400 mx-auto mb-4" />
        <h2 id={titleId} className="font-syne font-bold text-xl sm:text-2xl text-green-400 mb-2">¡Cobrado!</h2>
        <div className="font-mono font-bold text-brand-400 text-3xl sm:text-5xl tracking-[0.2em] mb-2">
          {invoice?.code}
        </div>
        <p className="font-mono font-bold text-xl sm:text-3xl text-white mb-2">{formatCOP(invoice?.total)}</p>

        {Number(invoice?.discount) > 0 && (
          <p className="text-xs text-amber-400 mb-2 inline-flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Descuento aplicado: −{formatCOP(invoice.discount)}
          </p>
        )}

        {invoice?.register_name && (
          <p className="text-xs text-gray-400 mb-2 inline-flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" /> {invoice.register_name}
          </p>
        )}

        {invoice?.observations && (
          <p className="text-xs text-gray-400 italic mb-3 bg-surface-400 rounded-lg px-3 py-2 flex items-start gap-1.5 text-left">
            <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {invoice.observations}
          </p>
        )}

        <div className="mb-5 flex justify-center">
          <PrintButton invoice={invoice} />
        </div>

        {/* data-autofocus: Enter tras cobrar continúa (no reimprime) */}
        <button type="button" onClick={onDone} data-autofocus className="btn-outline w-full">
          Continuar →
        </button>
      </div>
    </div>
  )
}

// ---- Selector de caja (pantalla completa) ---------------
function RegisterGate({ locationId, onSelect }) {
  const registersQ = useApi(locationId ? `/registers?location_id=${locationId}` : null, { initialData: [] })
  const registers = registersQ.data || []

  if (registersQ.loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-64">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      </div>
    )
  }

  // Antes un fallo de red caía en "No hay cajas registradas" y mandaba a
  // pedirle al administrador que las creara.
  if (registersQ.error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <ErrorNotice error={registersQ.error} title="No se pudieron cargar las cajas" onRetry={registersQ.refetch} className="text-left" />
          <button type="button" onClick={() => onSelect(null)} className="btn-ghost btn-sm text-gray-400">
            Continuar sin caja asignada
          </button>
        </div>
      </div>
    )
  }

  if (registers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="font-syne font-bold text-xl text-white mb-2">No hay cajas registradas</h2>
          <p className="text-gray-400 text-sm mb-4">
            Un administrador debe crear cajas para este punto de venta desde el panel de Administración → Cajas.
          </p>
          <button
            onClick={() => onSelect(null)}
            className="btn-outline"
          >
            Continuar sin caja asignada
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <Monitor className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h2 className="font-syne font-bold text-xl text-white mb-1">Selecciona tu caja</h2>
        <p className="text-gray-400 text-sm mb-6">¿En cuál caja vas a cobrar hoy?</p>

        <div className="grid grid-cols-2 gap-3">
          {registers.map(reg => (
            <button
              key={reg.id}
              onClick={() => onSelect(reg)}
              className="card-hover bg-surface-300 flex flex-col items-center gap-2 py-5 transition-all hover:scale-[1.02]"
            >
              <Monitor className="w-7 h-7 text-gray-400" />
              <span className="font-semibold text-white">{reg.name}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => onSelect(null)}
          className="text-xs text-gray-400 hover:text-white transition-colors mt-4"
        >
          Continuar sin seleccionar caja
        </button>
      </div>
    </div>
  )
}

// ---- Mobile Tab Bar para caja ---------------------------
const CAJA_TABS = [
  { id: 'pendientes', label: 'Pendientes', Icon: Clock },
  { id: 'cobrar',     label: 'Cobrar',     Icon: Hash },
  { id: 'pagar',      label: 'Pagar',      Icon: CreditCard },
]

// ---- CajaPage -------------------------------------------
export default function CajaPage() {
  const { location, seller, register, setRegister } = useAuthStore()
  const { pendingInvoices, setPending, addPending, removePending, updatePending } = useInvoiceStore()
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()

  const [code,         setCode]         = useState('')
  const [searching,    setSearching]    = useState(false)
  const [invoice,      setInvoice]      = useState(null)
  const [payMethod,    setPayMethod]    = useState(null)
  const [paying,       setPaying]       = useState(false)
  const [paidInv,      setPaidInv]      = useState(null)
  const [notFound,     setNotFound]     = useState(false)
  const [mobileTab,    setMobileTab]    = useState('cobrar')
  const [editing,      setEditing]      = useState(false)
  const [observations, setObservations] = useState('')
  const [changingReg,  setChangingReg]  = useState(false) // cambiar caja
  const [closingReg,   setClosingReg]   = useState(false) // cierre de caja (arqueo)
  const [refunding,    setRefunding]    = useState(false) // devolución
  const [discountStr,  setDiscountStr]  = useState('')    // descuento al cobrar
  const [cashReceived, setCashReceived] = useState('')    // con cuánto paga (efectivo)
  const [transferProv, setTransferProv] = useState(null)  // nequi | daviplata | bancolombia

  // Cambiar de método limpia el detalle de transferencia: si no, quedaría
  // colgado un proveedor de una selección anterior y el API lo rechazaría.
  const selectPayMethod = (m) => {
    setPayMethod(m)
    if (m !== 'transfer') setTransferProv(null)
  }

  const canEdit = can(seller?.role, 'charge')
  const needsRegister = !register && !changingReg

  const pollRef = useRef(null)
  const payingRef = useRef(false) // Enter repetido no cobra dos veces
  const [pendingError, setPendingError] = useState(null)

  // ---- Fotos de productos (productId → image_url) --------
  // Los items de la factura son snapshots sin foto; el catálogo la aporta.
  const [productImages, setProductImages] = useState({})
  useEffect(() => {
    if (!location?.id) return
    const build = (list) => {
      const m = {}
      ;(list || []).forEach(p => { if (p.image_url) m[p.id] = p.image_url })
      setProductImages(m)
    }
    const cached = getProductsCache(location.id)
    if (cached) build(cached)
    if (!cached || navigator.onLine) {
      api.get(`/products?location_id=${location.id}`)
        .then(data => { if (data?.length) { build(data); setProductsCache(location.id, data) } })
        .catch(() => {}) // sin fotos no se bloquea el cobro
    }
  }, [location?.id])

  // ---- Si no hay caja seleccionada, mostrar gate --------
  const handleRegisterSelect = (reg) => {
    setRegister(reg)
    setChangingReg(false)
  }

  // ---- Cargar pendientes al montar ----------------------
  // Se consulta cada 30 s: un fallo no merece un toast por intento, pero sí
  // quedar a la vista (antes la lista vacía parecía "no hay pendientes").
  const fetchPending = useCallback(async () => {
    if (!location?.id) return
    try {
      const data = await api.get(`/invoices/pending?location_id=${location.id}`)
      setPending(data || [])
      setPendingError(null)
    } catch (err) {
      setPendingError(err)
    }
  }, [location?.id, setPending])

  useEffect(() => { fetchPending() }, [fetchPending])

  // ---- Supabase Realtime ----------------------------------
  useEffect(() => {
    if (!location?.id) return
    const channel = supabase
      .channel(`invoices_caja_${location.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'invoices',
        filter: `location_id=eq.${location.id}`,
      }, (payload) => {
        const { eventType, new: newRow } = payload
        if (eventType === 'INSERT' && newRow.status === 'pending') {
          addPending(newRow)
        }
        if (eventType === 'UPDATE') {
          if (newRow.status !== 'pending') {
            removePending(newRow.id)
            if (invoice?.id === newRow.id) {
              setInvoice(null); setCode(''); setPayMethod(null); setTransferProv(null); setObservations('')
            }
          } else {
            updatePending(newRow.id, newRow)
            if (invoice?.id === newRow.id) setInvoice(newRow)
          }
        }
      })
      .subscribe()
    pollRef.current = setInterval(fetchPending, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(pollRef.current) }
  }, [location?.id, addPending, removePending, updatePending, fetchPending, invoice?.id])

  // ---- Buscar factura por código -------------------------
  const handleSearch = async () => {
    if (code.length !== 4 || !location?.id) return
    setSearching(true); setNotFound(false); setInvoice(null); setPayMethod(null); setTransferProv(null); setObservations('')
    setDiscountStr(''); setCashReceived('')
    try {
      const data = await api.get(`/invoices/${code}?location_id=${location.id}`)
      setInvoice(data)
      setObservations(data.observations || '')
      setMobileTab('pagar')
    } catch (err) {
      setNotFound(true)
      toastError(err.message || 'Factura no encontrada')
    } finally { setSearching(false) }
  }

  const handleSelectPending = (inv) => {
    setCode(inv.code); setInvoice(inv); setPayMethod(null); setTransferProv(null)
    setNotFound(false); setObservations(inv.observations || ''); setMobileTab('pagar')
    setDiscountStr(''); setCashReceived('')
  }

  // Total a cobrar con el descuento aplicado
  const discountNum = Number(discountStr) || 0
  const invalidDiscount = invoice && (discountNum < 0 || discountNum > Number(invoice.total))
  const totalToPay = invoice ? Math.max(0, Number(invoice.total) - (invalidDiscount ? 0 : discountNum)) : 0

  const handleInvoiceSaved = (updatedInvoice) => {
    setInvoice(updatedInvoice); updatePending(updatedInvoice.id, updatedInvoice); setEditing(false)
  }

  // Mismas reglas que deshabilitan el botón Cobrar (PaymentMethods), para
  // que el atajo Enter no cobre lo que el botón no permitiría.
  const receivedNum = cashReceived === '' ? null : Number(cashReceived)
  const insufficientCash = payMethod === 'cash' && receivedNum !== null && !isNaN(receivedNum) && receivedNum < totalToPay
  const missingProvider = payMethod === 'transfer' && !transferProv
  const payBlocked = !invoice || !payMethod || paying || insufficientCash || missingProvider

  // ---- Cobrar --------------------------------------------
  const handlePay = async () => {
    if (!invoice || !payMethod || payingRef.current) return
    if (invalidDiscount) return toastError('El descuento no puede superar el total')
    payingRef.current = true
    setPaying(true)
    try {
      const paid = await api.post(`/invoices/${invoice.code}/pay`, {
        location_id:   location.id,
        pay_method:    payMethod,
        ...(payMethod === 'transfer' ? { transfer_provider: transferProv } : {}),
        observations:  observations.trim() || undefined,
        register_id:   register?.id || undefined,
        register_name: register?.name || undefined,
        ...(discountNum > 0 ? { discount: discountNum } : {}),
      })
      removePending(paid.id)
      setPaidInv(paid)
      setInvoice(null); setCode(''); setPayMethod(null); setTransferProv(null); setObservations(''); setMobileTab('cobrar')
      setDiscountStr(''); setCashReceived('')
      toastSuccess(`Factura #${paid.code} cobrada · ${register?.name || 'Sin caja'}`)
    } catch (err) {
      toastError(err.message || 'Error al cobrar la factura')
    } finally { setPaying(false); payingRef.current = false }
  }

  // ---- Cancelar ------------------------------------------
  const handleCancel = async () => {
    if (!invoice) return
    const ok = await confirm({
      title: `¿Cancelar la factura #${invoice.code}?`,
      description: `Sale de pendientes y ya no se podrá cobrar (${formatCOP(invoice.total)}). Para venderla de nuevo, el vendedor genera otra factura.`,
      confirmLabel: 'Cancelar factura',
      cancelLabel: 'Volver',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.post(`/invoices/${invoice.code}/cancel`, { location_id: location.id })
      removePending(invoice.id)
      setInvoice(null); setCode(''); setPayMethod(null); setTransferProv(null); setObservations(''); setMobileTab('cobrar')
      toastSuccess('Factura cancelada')
    } catch (err) { toastError(err.message || 'Error al cancelar') }
  }

  // ---- Atajos de teclado (cajeros con teclado físico) ----
  //   /        enfoca el código de factura
  //   1 2 3    Efectivo / Transferencia / Datáfono
  //   N D B    Nequi / Daviplata / Bancolombia (con Transferencia)
  //   Enter    cobra (desde cualquier lugar salvo botones, enlaces y el código)
  // Los números no actúan mientras se escribe en un campo (descuento, efectivo)
  // ni con un diálogo abierto. El listener lee el estado por ref para no
  // re-suscribirse en cada render.
  const shortcuts = useRef(null)
  shortcuts.current = {
    invoice, payMethod, payBlocked, handlePay, selectPayMethod, setTransferProv,
    busy: editing || closingReg || refunding || Boolean(paidInv),
  }
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const st = shortcuts.current
      if (st.busy || document.querySelector('[role="dialog"]')) return
      const target = e.target instanceof Element ? e.target : null
      const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))

      if (e.key === '/' && !typing) { e.preventDefault(); focusCodeInput(); return }
      if (!st.invoice) return

      if (e.key === 'Enter') {
        if (e.repeat || target?.closest('button, a, textarea, select, [data-code-input]')) return
        if (st.payBlocked) return
        e.preventDefault()
        st.handlePay()
        return
      }
      if (typing) return

      const method = METHODS.find(m => m.key === e.key)
      if (method) { e.preventDefault(); st.selectPayMethod(method.id); return }
      if (st.payMethod === 'transfer') {
        const provider = Object.keys(PROVIDER_KEYS).find(id => PROVIDER_KEYS[id] === e.key.toUpperCase())
        if (provider) { e.preventDefault(); st.setTransferProv(provider) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ==========================================================
  // RENDER — si no hay caja seleccionada, mostrar selector
  // ==========================================================
  if (needsRegister || changingReg) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <Topbar title="Caja" />
        <RegisterGate
          locationId={location?.id}
          onSelect={handleRegisterSelect}
        />
      </div>
    )
  }

  const pendingBadge = (
    <span className="flex items-center gap-2">
      {pendingError && (
        <button
          type="button"
          onClick={fetchPending}
          title={pendingError.offline ? 'Sin conexión. Toca para reintentar.' : `${pendingError.message} Toca para reintentar.`}
          className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-2xs font-medium text-red-300"
        >
          <WifiOff className="h-3 w-3" aria-hidden="true" /> Sin actualizar
        </button>
      )}
      {pendingInvoices.length > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-surface-700">
          {pendingInvoices.length}
        </span>
      )}
    </span>
  )

  // ---- Búsqueda + detalle de la factura (columna central / pestaña Cobrar)
  const renderCenter = (prefix) => (
    <div className="space-y-6">
      {/* Caja activa y acciones de turno */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-surface-300 px-2.5 py-1.5 text-xs text-gray-400">
          <Monitor className="h-3.5 w-3.5" /> <span className="font-medium text-white">{register?.name || 'Sin caja'}</span>
        </span>
        <button type="button" onClick={() => setChangingReg(true)} className="btn-ghost btn-sm text-gray-400 hover:text-brand-400">
          <span className="sm:hidden">Cambiar</span><span className="hidden sm:inline">Cambiar caja</span>
        </button>
        <div className="flex-1" />
        {canEdit && (
          <button type="button" onClick={() => setRefunding(true)} aria-label="Devolución" className="btn-outline btn-sm btn-touch-safe">
            <Undo2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Devolución</span>
          </button>
        )}
        {canEdit && (
          <button type="button" onClick={() => setClosingReg(true)} className="btn-outline btn-sm btn-touch-safe">
            <Receipt className="h-3.5 w-3.5" /> Cerrar caja
          </button>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-code`} className="eyebrow mb-2 flex items-center gap-2">
          Código de factura <Kbd>/</Kbd>
        </label>
        <CodeInput id={`${prefix}-code`} value={code} onChange={setCode} onSearch={handleSearch} loading={searching} />
        {notFound && !invoice && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            No hay factura pendiente con el código <strong>{code}</strong>
          </p>
        )}
      </div>

      {searching ? (
        <div className="space-y-3">
          <div className="skeleton h-8 w-40 rounded-lg" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
      ) : invoice ? (
        <div className="space-y-4">
          <InvoiceDetail invoice={invoice} productImages={productImages} />
          {invoice.edited_at && (
            <p className="inline-flex items-center gap-1 text-2xs text-yellow-400/80">
              <Pencil className="h-3 w-3" /> Editada el {new Date(invoice.edited_at).toLocaleString('es-CO')}
            </p>
          )}
          {invoice.observations && (
            <div className="rounded-lg border border-white/5 bg-surface-400 px-3 py-2">
              <p className="eyebrow mb-0.5">Observaciones</p>
              <p className="text-xs italic text-gray-300">{invoice.observations}</p>
            </div>
          )}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setEditing(true)} className="btn-ghost btn-sm text-brand-400 hover:text-brand-300">
                <Pencil className="h-3.5 w-3.5" /> Editar factura
              </button>
              <button type="button" onClick={handleCancel} className="btn-ghost btn-sm text-gray-400 hover:text-red-400">
                <X className="h-3.5 w-3.5" /> Cancelar factura
              </button>
            </div>
          )}
        </div>
      ) : !notFound ? (
        <EmptyState
          icon={Hash}
          title="Ingresa un código de 4 dígitos"
          description="O elige una factura de la lista de pendientes."
        />
      ) : null}
    </div>
  )

  // ---- Cobro: total, ajustes opcionales y método de pago ----------------
  const renderPayForm = (prefix) => (
    <div className="space-y-5">
      <div className="rounded-xl border border-white/5 bg-surface-300 p-4 text-center">
        <p className="eyebrow">Total a cobrar</p>
        <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-white">{formatCOP(totalToPay)}</p>
        {discountNum > 0 && !invalidDiscount && (
          <p className="mt-0.5 text-xs text-gray-400">
            <span className="line-through">{formatCOP(invoice.total)}</span> · descuento {formatCOP(discountNum)}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Factura <span className="font-mono font-semibold text-brand-400">#{invoice.code}</span> · {invoice.seller_name}
        </p>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} className="btn-ghost btn-sm mt-2 text-brand-400 md:hidden">
            <Pencil className="h-3.5 w-3.5" /> Editar ítems
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
        <div>
          <label htmlFor={`${prefix}-discount`} className="field-label">Descuento en $ <span className="font-normal">(opcional)</span></label>
          <input id={`${prefix}-discount`} type="number" inputMode="numeric" min="0" value={discountStr}
            onChange={e => setDiscountStr(e.target.value)}
            placeholder="0" className="input font-mono" />
          {invalidDiscount && <p className="mt-1 text-xs text-red-400">No puede superar {formatCOP(invoice.total)}</p>}
        </div>
        <div>
          <label htmlFor={`${prefix}-obs`} className="field-label">Observaciones <span className="font-normal">(opcional)</span></label>
          <textarea id={`${prefix}-obs`} value={observations} onChange={e => setObservations(e.target.value)}
            placeholder="Ej: Se obsequió producto x con autorización del jefe"
            rows={2} className="input resize-none" />
        </div>
      </div>

      <PaymentMethods total={totalToPay} selected={payMethod}
        onSelect={selectPayMethod} onConfirm={handlePay} loading={paying}
        cashReceived={cashReceived} onCashReceived={setCashReceived}
        transferProvider={transferProv} onTransferProvider={setTransferProv} />
    </div>
  )

  // ==========================================================
  // DESKTOP / TABLET (md+)
  //   md:  [pendientes | búsqueda + cobro apilados]
  //   lg+: [pendientes | búsqueda | cobro] — el contenedor del medio pasa a
  //        display: contents y sus dos hijos se vuelven columnas de la grilla.
  // ==========================================================
  const DesktopLayout = (
    <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_20rem] xl:grid-cols-[18rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
      {/* Pendientes */}
      <aside aria-label="Facturas pendientes" className="flex min-h-0 flex-col border-r border-white/5 bg-surface-500">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <h2 className="eyebrow">Pendientes</h2>
          {pendingBadge}
        </div>
        <PendingList invoices={pendingInvoices} selectedId={invoice?.id} onSelect={handleSelectPending} />
      </aside>

      <div className="min-h-0 overflow-y-auto lg:contents">
        {/* Central: buscar + detalle */}
        <section aria-label="Buscar factura" className="p-5 lg:min-h-0 lg:overflow-y-auto lg:p-6 xl:p-8">
          <div className="mx-auto max-w-2xl">
            {renderCenter('d')}
          </div>
        </section>

        {/* Cobro */}
        <aside
          aria-label="Cobro"
          className={`border-t border-white/5 bg-surface-500 p-5 lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0 xl:p-6 ${invoice ? '' : 'hidden lg:block'}`}
        >
          {invoice ? (
            <div className="mx-auto max-w-2xl lg:max-w-none">{renderPayForm('d')}</div>
          ) : (
            <EmptyState compact icon={CreditCard} title="Busca una factura para cobrar" className="mt-8" />
          )}
        </aside>
      </div>
    </div>
  )

  // ==========================================================
  // MOBILE LAYOUT (<md): tres pestañas con barra inferior fija
  // ==========================================================
  const MobileLayout = (
    <div className="flex min-h-0 flex-1 flex-col md:hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mobileTab === 'pendientes' && (
          <div className="flex min-h-full flex-col bg-surface-500">
            <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
              <h2 className="eyebrow">Pendientes</h2>
              {pendingBadge}
            </div>
            <PendingList invoices={pendingInvoices} selectedId={invoice?.id} onSelect={handleSelectPending} />
          </div>
        )}

        {mobileTab === 'cobrar' && (
          <div className="p-4">{renderCenter('m')}</div>
        )}

        {mobileTab === 'pagar' && (
          <div className="p-4">
            {invoice ? renderPayForm('m') : (
              <EmptyState icon={CreditCard} title="Busca una factura para cobrar" description="Ingresa el código en la pestaña Cobrar." />
            )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <nav aria-label="Secciones de caja" className="safe-area-pb flex shrink-0 border-t border-white/5 bg-surface-500">
        {CAJA_TABS.map(t => {
          const active = mobileTab === t.id
          return (
            <button key={t.id} type="button" onClick={() => setMobileTab(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors
                ${active ? 'text-brand-400' : 'text-gray-400 hover:text-gray-200'}`}>
              {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand-500" aria-hidden="true" />}
              <t.Icon className="h-5 w-5" />
              <span>{t.label}</span>
              {t.id === 'pendientes' && pendingInvoices.length > 0 && (
                <span className="absolute right-1/4 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-2xs font-bold text-surface-700">
                  {pendingInvoices.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )

  // ==========================================================
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <Topbar title="Caja" />
      {DesktopLayout}
      {MobileLayout}
      {editing && invoice && (
        <EditInvoiceModal invoice={invoice} productImages={productImages} onClose={() => setEditing(false)} onSaved={handleInvoiceSaved} />
      )}
      {paidInv && (
        <PaidOverlay
          invoice={paidInv}
          // Listo para la siguiente factura sin tocar el mouse
          onDone={() => { setPaidInv(null); requestAnimationFrame(focusCodeInput) }}
        />
      )}
      {closingReg && (
        <CloseRegisterModal register={register} location={location} onClose={() => setClosingReg(false)} />
      )}
      {refunding && (
        <RefundModal location={location} onClose={() => setRefunding(false)} />
      )}
    </div>
  )
}
