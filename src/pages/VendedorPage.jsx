import { useState, useEffect, useMemo } from 'react'
import { useAuthStore }     from '../store/authStore.js'
import { useCartStore }     from '../store/cartStore.js'
import { useInvoiceStore }  from '../store/invoiceStore.js'
import { api, getProductsCache, setProductsCache } from '../lib/api.js'
import { enqueue, generateOfflineCode, saveOfflineInvoice } from '../lib/offlineQueue.js'
import { formatCOP }   from '../lib/format.js'
import Topbar          from '../components/Topbar.jsx'
import ProductCard     from '../components/ProductCard.jsx'
import CartPanel       from '../components/CartPanel.jsx'
import CodeDisplay     from '../components/CodeDisplay.jsx'
import SuccessAnimation from '../components/SuccessAnimation.jsx'
import { useToast }    from '../components/Toast.jsx'

export default function VendedorPage() {
  const { seller, location } = useAuthStore()
  const { items, clear, total, count } = useCartStore()
  const { setLastCreated, lastCreated, clearLastCreated } = useInvoiceStore()
  const { error: toastError } = useToast()

  const [products,    setProducts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [query,       setQuery]       = useState('')
  const [catFilter,   setCatFilter]   = useState('all')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCode,    setShowCode]    = useState(false)
  const [cartOpen,    setCartOpen]    = useState(false) // mobile cart sheet

  // ---- Cargar catálogo (stale-while-revalidate) ----------
  useEffect(() => {
    if (!location?.id) return

    const cached = getProductsCache(location.id)
    if (cached) {
      // Usar cache inmediatamente (aunque sea stale)
      const isStale = Array.isArray(cached) ? false : cached._stale
      setProducts(Array.isArray(cached) ? cached : cached)
      setLoading(false)

      // Si es stale, refrescar en background
      if (isStale && navigator.onLine) {
        api.get(`/products?location_id=${location.id}`)
          .then(data => {
            if (data?.length) {
              setProducts(data)
              setProductsCache(location.id, data)
            }
          })
          .catch(() => {}) // silencioso, ya tenemos stale data
      }
      return
    }

    // Sin cache: cargar del servidor
    api.get(`/products?location_id=${location.id}`)
      .then(data => {
        setProducts(data || [])
        setProductsCache(location.id, data || [])
      })
      .catch(err => toastError(`Error cargando catálogo: ${err.message}`))
      .finally(() => setLoading(false))
  }, [location?.id])

  // ---- Categorías únicas ---------------------------------
  const categories = useMemo(() => {
    const map = {}
    products.forEach(p => {
      if (p.categories) map[p.categories.id] = p.categories
    })
    return Object.values(map).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }, [products])

  // ---- Filtrado ------------------------------------------
  const filtered = useMemo(() => {
    let list = products
    if (catFilter !== 'all') list = list.filter(p => p.categories?.id === catFilter)
    if (query.trim()) {
      const q = query.toLowerCase().trim()
      list = list.filter(p => p.name.toLowerCase().includes(q))
    }
    return list
  }, [products, catFilter, query])

  // ---- Generar factura (con fallback offline) ------------
  const handleCheckout = async () => {
    if (!items.length) return
    setSubmitting(true)

    const invoicePayload = {
      location_id:   location.id,
      location_name: location.name,
      seller_id:     seller.id,
      seller_name:   seller.name,
      items:         items.map(i => ({
        presentationId: i.presentationId,
        productId:      i.productId,
        product_name:   i.productName,
        label:          i.label,
        price:          i.price,
        qty:            i.qty,
        subtotal:       i.subtotal,
      })),
      total: total(),
    }

    try {
      const invoice = await api.post('/invoices', invoicePayload)
      setLastCreated(invoice)
      setShowSuccess(true)
      setCartOpen(false)
      clear()
    } catch (err) {
      // Si es error de red, encolar para sincronización posterior
      if (err.offline || !navigator.onLine) {
        const offlineCode = generateOfflineCode()
        const offlineInvoice = {
          ...invoicePayload,
          code: offlineCode,
          status: 'offline_pending',
          created_at: new Date().toISOString(),
          _offline: true,
          _offline_id: offlineCode,
        }

        // Encolar para sincronización automática
        enqueue({ type: 'create_invoice', payload: invoicePayload })

        // Guardar localmente para que la cajera pueda verla
        saveOfflineInvoice(offlineInvoice)

        setLastCreated(offlineInvoice)
        setShowSuccess(true)
        setCartOpen(false)
        clear()

        toastError(`Sin conexión — Factura ${offlineCode} guardada localmente. Se sincronizará al reconectar.`)
      } else {
        toastError(err.message || 'Error al crear la factura')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewSale = () => {
    clearLastCreated()
    setShowCode(false)
  }

  const handleSuccessDone = () => {
    setShowSuccess(false)
    setShowCode(true)
  }

  const cartCount = count()

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#111]">
      <Topbar title="Vender" />

      {/* ---- DESKTOP: 2 columnas ---- */}
      <div className="flex-1 flex min-h-0">

        {/* ---- Panel izquierdo: catálogo ---- */}
        <div className="flex-1 flex flex-col min-w-0 md:border-r md:border-white/5">

          {/* Buscador + filtros */}
          <div className="px-3 sm:px-4 py-3 border-b border-white/5 space-y-3">
            <input
              type="search"
              placeholder="Buscar producto..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input"
            />
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <CatChip
                active={catFilter === 'all'}
                onClick={() => setCatFilter('all')}
                label="Todos"
                icon="🎆"
              />
              {categories.map(cat => (
                <CatChip
                  key={cat.id}
                  active={catFilter === cat.id}
                  onClick={() => setCatFilter(cat.id)}
                  label={cat.name}
                  icon={cat.icon}
                />
              ))}
            </div>
          </div>

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-24 md:pb-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-32 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-600">
                <span className="text-3xl mb-2">🔍</span>
                <p className="text-sm">Sin resultados para "{query}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---- Panel derecho: carrito (DESKTOP) ---- */}
        <div className="hidden md:flex w-72 xl:w-80 flex-col bg-surface-500">
          {showCode && lastCreated ? (
            <CodeDisplay invoice={lastCreated} onNewSale={handleNewSale} />
          ) : (
            <CartPanel onCheckout={handleCheckout} loading={submitting} />
          )}
        </div>

      </div>

      {/* ---- MOBILE: Botón flotante del carrito ---- */}
      {!showCode && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 right-4 z-40 md:hidden bg-brand-500 text-white rounded-full shadow-lg shadow-brand-500/30 active:scale-95 transition-transform flex items-center gap-2 px-5 py-3.5"
        >
          <span className="text-lg">🛒</span>
          {cartCount > 0 && (
            <span className="bg-white text-brand-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
          {cartCount > 0 && (
            <span className="font-semibold text-sm">{formatCOP(total())}</span>
          )}
          {!cartCount && <span className="text-sm font-medium">Carrito</span>}
        </button>
      )}

      {/* ---- MOBILE: Código flotante post-venta ---- */}
      {showCode && lastCreated && (
        <div className="fixed inset-0 z-50 bg-black/90 md:hidden flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <CodeDisplay invoice={lastCreated} onNewSale={handleNewSale} />
          </div>
        </div>
      )}

      {/* ---- MOBILE: Bottom sheet del carrito ---- */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setCartOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />

          {/* Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-surface-500 border-t border-white/10 rounded-t-2xl max-h-[85dvh] flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-700 rounded-full" />
            </div>

            <div className="flex-1 overflow-y-auto">
              <CartPanel onCheckout={handleCheckout} loading={submitting} />
            </div>
          </div>
        </div>
      )}

      {/* Overlay animación de éxito */}
      {showSuccess && lastCreated && (
        <SuccessAnimation invoice={lastCreated} onDone={handleSuccessDone} />
      )}
    </div>
  )
}

function CatChip({ active, onClick, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
        border transition-all duration-100 shrink-0
        ${active
          ? 'bg-brand-500/20 border-brand-500/60 text-brand-300'
          : 'bg-surface-300 border-white/5 text-gray-400 hover:border-white/15 hover:text-white'
        }
      `}
    >
      <span>{icon}</span> {label}
    </button>
  )
}
