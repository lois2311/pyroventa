import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore }    from '../store/authStore.js'
import { useInvoiceStore } from '../store/invoiceStore.js'
import { supabase }        from '../lib/supabase.js'
import { api, getProductsCache, setProductsCache } from '../lib/api.js'
import Topbar          from '../components/Topbar.jsx'
import PendingList     from '../components/PendingList.jsx'
import InvoiceDetail   from '../components/InvoiceDetail.jsx'
import PaymentMethods  from '../components/PaymentMethods.jsx'
import PrintButton     from '../components/PrintButton.jsx'
import EditInvoiceModal from '../components/EditInvoiceModal.jsx'
import CloseRegisterModal from '../components/CloseRegisterModal.jsx'
import RefundModal     from '../components/RefundModal.jsx'
import { useToast }    from '../components/Toast.jsx'
import { formatCOP }   from '../lib/format.js'

// ---- Teclado de código ----------------------------------
function CodeInput({ value, onChange, onSearch, loading }) {
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const handleKey = (e) => {
    if (e.key === 'Enter' && value.length === 4) onSearch()
  }
  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        onKeyDown={handleKey}
        placeholder="_ _ _ _"
        className="input text-center font-mono text-xl sm:text-2xl tracking-[0.4em] sm:tracking-[0.5em] placeholder-gray-700 flex-1"
        style={{ letterSpacing: '0.4em' }}
      />
      <button
        onClick={onSearch}
        disabled={value.length !== 4 || loading}
        className="btn btn-primary shrink-0"
      >
        Buscar
      </button>
    </div>
  )
}

// ---- Overlay de cobro exitoso ---------------------------
function PaidOverlay({ invoice, onDone }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-300 border border-green-500/30 rounded-2xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl animate-scale-in">
        <div className="text-5xl sm:text-6xl mb-4">✅</div>
        <h2 className="font-syne font-bold text-xl sm:text-2xl text-green-400 mb-2">¡Cobrado!</h2>
        <div className="font-mono font-bold text-brand-400 text-3xl sm:text-5xl tracking-[0.2em] mb-2">
          {invoice?.code}
        </div>
        <p className="font-syne font-bold text-xl sm:text-3xl text-white mb-2">{formatCOP(invoice?.total)}</p>

        {Number(invoice?.discount) > 0 && (
          <p className="text-xs text-amber-400 mb-2">🏷 Descuento aplicado: −{formatCOP(invoice.discount)}</p>
        )}

        {invoice?.register_name && (
          <p className="text-xs text-gray-500 mb-2">🖥 {invoice.register_name}</p>
        )}

        {invoice?.observations && (
          <p className="text-xs text-gray-400 italic mb-3 bg-surface-400 rounded-lg px-3 py-2">
            📝 {invoice.observations}
          </p>
        )}

        <div className="mb-5 flex justify-center">
          <PrintButton invoice={invoice} />
        </div>

        <button onClick={onDone} className="btn btn-ghost border border-white/10 w-full">
          Continuar →
        </button>
      </div>
    </div>
  )
}

// ---- Selector de caja (pantalla completa) ---------------
function RegisterGate({ locationId, onSelect }) {
  const [registers, setRegisters] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    if (!locationId) return
    api.get(`/registers?location_id=${locationId}`)
      .then(d => setRegisters(d || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [locationId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-64">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (registers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <span className="text-5xl block mb-4">🖥</span>
          <h2 className="font-syne font-bold text-xl text-white mb-2">No hay cajas registradas</h2>
          <p className="text-gray-500 text-sm mb-4">
            Un administrador debe crear cajas para este punto de venta desde el panel de Administración → Cajas.
          </p>
          <button
            onClick={() => onSelect(null)}
            className="btn btn-ghost border border-white/10"
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
        <span className="text-5xl block mb-3">🖥</span>
        <h2 className="font-syne font-bold text-xl text-white mb-1">Selecciona tu caja</h2>
        <p className="text-gray-500 text-sm mb-6">¿En cuál caja vas a cobrar hoy?</p>

        <div className="grid grid-cols-2 gap-3">
          {registers.map(reg => (
            <button
              key={reg.id}
              onClick={() => onSelect(reg)}
              className="card-hover bg-surface-300 flex flex-col items-center gap-2 py-5 transition-all hover:scale-[1.02]"
            >
              <span className="text-3xl">🖥</span>
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
  { id: 'pendientes', label: 'Pendientes', icon: '⏳' },
  { id: 'cobrar',     label: 'Cobrar',     icon: '🔢' },
  { id: 'pagar',      label: 'Pagar',      icon: '💳' },
]

// ---- CajaPage -------------------------------------------
export default function CajaPage() {
  const { location, seller, register, setRegister } = useAuthStore()
  const { pendingInvoices, setPending, addPending, removePending, updatePending } = useInvoiceStore()
  const { error: toastError, success: toastSuccess } = useToast()

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

  const canEdit = seller?.role === 'cashier' || seller?.role === 'admin'
  const needsRegister = !register && !changingReg

  const pollRef = useRef(null)

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
  const fetchPending = useCallback(async () => {
    if (!location?.id) return
    try {
      const data = await api.get(`/invoices/pending?location_id=${location.id}`)
      setPending(data || [])
    } catch { /* silencioso */ }
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
              setInvoice(null); setCode(''); setPayMethod(null); setObservations('')
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
    setSearching(true); setNotFound(false); setInvoice(null); setPayMethod(null); setObservations('')
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
    setCode(inv.code); setInvoice(inv); setPayMethod(null)
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

  // ---- Cobrar --------------------------------------------
  const handlePay = async () => {
    if (!invoice || !payMethod) return
    if (invalidDiscount) return toastError('El descuento no puede superar el total')
    setPaying(true)
    try {
      const paid = await api.post(`/invoices/${invoice.code}/pay`, {
        location_id:   location.id,
        pay_method:    payMethod,
        observations:  observations.trim() || undefined,
        register_id:   register?.id || undefined,
        register_name: register?.name || undefined,
        ...(discountNum > 0 ? { discount: discountNum } : {}),
      })
      removePending(paid.id)
      setPaidInv(paid)
      setInvoice(null); setCode(''); setPayMethod(null); setObservations(''); setMobileTab('cobrar')
      setDiscountStr(''); setCashReceived('')
      toastSuccess(`Factura #${paid.code} cobrada · ${register?.name || 'Sin caja'}`)
    } catch (err) {
      toastError(err.message || 'Error al cobrar la factura')
    } finally { setPaying(false) }
  }

  // ---- Cancelar ------------------------------------------
  const handleCancel = async () => {
    if (!invoice) return
    if (!window.confirm(`¿Cancelar la factura #${invoice.code}?`)) return
    try {
      await api.post(`/invoices/${invoice.code}/cancel`, { location_id: location.id })
      removePending(invoice.id)
      setInvoice(null); setCode(''); setPayMethod(null); setObservations(''); setMobileTab('cobrar')
      toastSuccess('Factura cancelada')
    } catch (err) { toastError(err.message || 'Error al cancelar') }
  }

  // ==========================================================
  // RENDER — si no hay caja seleccionada, mostrar selector
  // ==========================================================
  if (needsRegister || changingReg) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-[#111]">
        <Topbar title="Caja" />
        <RegisterGate
          locationId={location?.id}
          onSelect={handleRegisterSelect}
        />
      </div>
    )
  }

  // ==========================================================
  // DESKTOP LAYOUT (md+)
  // ==========================================================
  const DesktopLayout = (
    <div className="hidden md:flex flex-1 min-h-0">
      {/* Pendientes */}
      <div className="w-[220px] lg:w-[260px] shrink-0 flex flex-col border-r border-white/5 bg-surface-500">
        <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pendientes</span>
          {pendingInvoices.length > 0 && (
            <span className="bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {pendingInvoices.length}
            </span>
          )}
        </div>
        <PendingList invoices={pendingInvoices} selectedId={invoice?.id} onSelect={handleSelectPending} />
      </div>

      {/* Central: buscar + detalle */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto p-5 lg:p-6">
        {/* Badge de caja activa */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs bg-surface-300 border border-white/5 rounded-lg px-2.5 py-1.5 text-gray-400 flex items-center gap-1.5">
            🖥 <span className="text-white font-medium">{register?.name || 'Sin caja'}</span>
          </span>
          <button
            onClick={() => setChangingReg(true)}
            className="text-[10px] text-gray-400 hover:text-brand-400 transition-colors"
          >
            Cambiar caja
          </button>
          <div className="flex-1" />
          {canEdit && (
            <button onClick={() => setRefunding(true)} className="btn btn-ghost btn-sm text-xs border border-white/10">
              ↩ Devolución
            </button>
          )}
          {canEdit && (
            <button onClick={() => setClosingReg(true)} className="btn btn-ghost btn-sm text-xs border border-white/10">
              🧾 Cerrar caja
            </button>
          )}
        </div>

        <div className="mb-6 max-w-md">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
            Código de factura
          </label>
          <CodeInput value={code} onChange={setCode} onSearch={handleSearch} loading={searching} />
          {notFound && !invoice && (
            <p className="text-red-400 text-sm mt-2">
              No hay factura pendiente con el código <strong>{code}</strong>
            </p>
          )}
        </div>

        {searching ? (
          <div className="space-y-3 max-w-lg">
            <div className="skeleton h-8 w-40 rounded-lg" />
            <div className="skeleton h-32 rounded-xl" />
          </div>
        ) : invoice ? (
          <div className="max-w-lg space-y-4">
            <InvoiceDetail invoice={invoice} productImages={productImages} />
            {invoice.edited_at && (
              <p className="text-[10px] text-yellow-500/70">✏️ Editada el {new Date(invoice.edited_at).toLocaleString('es-CO')}</p>
            )}
            {invoice.observations && (
              <div className="bg-surface-400 border border-white/5 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Observaciones</p>
                <p className="text-xs text-gray-300 italic">{invoice.observations}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              {canEdit && (
                <button onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">✏️ Editar factura</button>
              )}
              {canEdit && (
                <button onClick={handleCancel} className="text-xs text-gray-400 hover:text-red-400 transition-colors">✕ Cancelar factura</button>
              )}
            </div>
          </div>
        ) : !notFound ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <span className="text-4xl mb-2">🔢</span>
            <p className="text-sm">Ingresa un código de 4 dígitos</p>
          </div>
        ) : null}
      </div>

      {/* Panel derecho: cobrar */}
      <div className="w-[250px] lg:w-[280px] shrink-0 flex flex-col border-l border-white/5 bg-surface-500 p-4">
        {invoice ? (
          <div className="flex-1 flex flex-col gap-4">
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Descuento en $ (opcional)</label>
              <input type="number" inputMode="numeric" min="0" value={discountStr}
                onChange={e => setDiscountStr(e.target.value)}
                placeholder="0" className="input text-sm font-mono" />
              {invalidDiscount && <p className="text-xs text-red-400 mt-1">No puede superar {formatCOP(invoice.total)}</p>}
              {!invalidDiscount && discountNum > 0 && (
                <p className="text-xs text-green-400 mt-1">Nuevo total: {formatCOP(totalToPay)}</p>
              )}
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Observaciones (opcional)</label>
              <textarea value={observations} onChange={e => setObservations(e.target.value)}
                placeholder="Ej: Se obsequió producto x con autorización del jefe"
                rows={2} className="input text-xs resize-none" />
            </div>
            <div className="flex-1" />
            <PaymentMethods total={totalToPay} selected={payMethod}
              onSelect={setPayMethod} onConfirm={handlePay} loading={paying}
              cashReceived={cashReceived} onCashReceived={setCashReceived} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-center">
            <span className="text-4xl mb-2">💳</span>
            <p className="text-sm">Busca una factura para cobrar</p>
          </div>
        )}
      </div>
    </div>
  )

  // ==========================================================
  // MOBILE LAYOUT (<md)
  // ==========================================================
  const MobileLayout = (
    <div className="flex flex-col flex-1 min-h-0 md:hidden">
      <div className="flex-1 overflow-y-auto">
        {mobileTab === 'pendientes' && (
          <div className="h-full bg-surface-500 flex flex-col">
            <div className="px-3 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pendientes</span>
              {pendingInvoices.length > 0 && (
                <span className="bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingInvoices.length}
                </span>
              )}
            </div>
            <PendingList invoices={pendingInvoices} selectedId={invoice?.id} onSelect={handleSelectPending} />
          </div>
        )}

        {mobileTab === 'cobrar' && (
          <div className="p-4 space-y-4">
            {/* Badge de caja activa */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs bg-surface-300 border border-white/5 rounded-lg px-2.5 py-1.5 text-gray-400 flex items-center gap-1.5">
                🖥 <span className="text-white font-medium">{register?.name || 'Sin caja'}</span>
              </span>
              <button onClick={() => setChangingReg(true)}
                className="text-[10px] text-gray-400 hover:text-brand-400 transition-colors">
                Cambiar
              </button>
              <div className="flex-1" />
              {canEdit && (
                <button onClick={() => setRefunding(true)} className="btn btn-ghost btn-sm text-xs border border-white/10">↩</button>
              )}
              {canEdit && (
                <button onClick={() => setClosingReg(true)} className="btn btn-ghost btn-sm text-xs border border-white/10">🧾 Cierre</button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Código de factura</label>
              <CodeInput value={code} onChange={setCode} onSearch={handleSearch} loading={searching} />
              {notFound && !invoice && (
                <p className="text-red-400 text-sm mt-2">No hay factura pendiente con el código <strong>{code}</strong></p>
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
                  <p className="text-[10px] text-yellow-500/70">✏️ Editada el {new Date(invoice.edited_at).toLocaleString('es-CO')}</p>
                )}
                {invoice.observations && (
                  <div className="bg-surface-400 border border-white/5 rounded-lg px-3 py-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Observaciones</p>
                    <p className="text-xs text-gray-300 italic">{invoice.observations}</p>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {canEdit && <button onClick={() => setEditing(true)} className="text-xs text-brand-400">✏️ Editar</button>}
                  {canEdit && <button onClick={handleCancel} className="text-xs text-gray-400 hover:text-red-400">✕ Cancelar</button>}
                </div>
              </div>
            ) : !notFound ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                <span className="text-4xl mb-2">🔢</span>
                <p className="text-sm">Ingresa un código de 4 dígitos</p>
              </div>
            ) : null}
          </div>
        )}

        {mobileTab === 'pagar' && (
          <div className="p-4">
            {invoice ? (
              <div className="space-y-4">
                <div className="card bg-surface-400 text-center">
                  <p className="font-mono font-bold text-brand-400 text-2xl tracking-[0.2em] mb-1">#{invoice.code}</p>
                  <p className="font-syne font-bold text-lg text-white">
                    {formatCOP(totalToPay)}
                    {discountNum > 0 && !invalidDiscount && (
                      <span className="text-xs text-gray-500 line-through ml-2">{formatCOP(invoice.total)}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{invoice.seller_name}</p>
                  {canEdit && <button onClick={() => setEditing(true)} className="text-[10px] text-brand-400 mt-2">✏️ Editar items</button>}
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Descuento en $ (opcional)</label>
                  <input type="number" inputMode="numeric" min="0" value={discountStr}
                    onChange={e => setDiscountStr(e.target.value)}
                    placeholder="0" className="input text-sm font-mono" />
                  {invalidDiscount && <p className="text-xs text-red-400 mt-1">No puede superar {formatCOP(invoice.total)}</p>}
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wider mb-1">Observaciones (opcional)</label>
                  <textarea value={observations} onChange={e => setObservations(e.target.value)}
                    placeholder="Ej: Se obsequió producto x con autorización del jefe"
                    rows={2} className="input text-xs resize-none" />
                </div>
                <PaymentMethods total={totalToPay} selected={payMethod}
                  onSelect={setPayMethod} onConfirm={handlePay} loading={paying}
                  cashReceived={cashReceived} onCashReceived={setCashReceived} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-center">
                <span className="text-4xl mb-2">💳</span>
                <p className="text-sm">Busca una factura para cobrar</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="border-t border-white/5 bg-surface-500 flex shrink-0 safe-area-pb">
        {CAJA_TABS.map(t => (
          <button key={t.id} onClick={() => setMobileTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors relative
              ${mobileTab === t.id ? 'text-brand-400' : 'text-gray-400'}`}>
            <span className="text-lg">{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'pendientes' && pendingInvoices.length > 0 && (
              <span className="absolute top-1 right-1/4 bg-brand-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {pendingInvoices.length}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )

  // ==========================================================
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#111]">
      <Topbar title="Caja" />
      {DesktopLayout}
      {MobileLayout}
      {editing && invoice && (
        <EditInvoiceModal invoice={invoice} productImages={productImages} onClose={() => setEditing(false)} onSaved={handleInvoiceSaved} />
      )}
      {paidInv && <PaidOverlay invoice={paidInv} onDone={() => setPaidInv(null)} />}
      {closingReg && (
        <CloseRegisterModal register={register} location={location} onClose={() => setClosingReg(false)} />
      )}
      {refunding && (
        <RefundModal location={location} onClose={() => setRefunding(false)} />
      )}
    </div>
  )
}
