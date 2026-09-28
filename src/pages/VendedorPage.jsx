import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, ShoppingCart, Sparkles } from 'lucide-react'
import { useAuthStore }     from '../store/authStore.js'
import { useCartStore }     from '../store/cartStore.js'
import { useInvoiceStore }  from '../store/invoiceStore.js'
import { api, getProductsCache, setProductsCache } from '../lib/api.js'
import { enqueue, generateOfflineCode, saveOfflineInvoice, newOpId } from '../lib/offlineQueue.js'
import { formatCOP }   from '../lib/format.js'
import { matchesQuery } from '../lib/search.js'
import Topbar          from '../components/Topbar.jsx'
import ProductCard     from '../components/ProductCard.jsx'
import CartPanel       from '../components/CartPanel.jsx'
import CodeDisplay     from '../components/CodeDisplay.jsx'
import SuccessAnimation from '../components/SuccessAnimation.jsx'
import { useToast }    from '../components/Toast.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { useSlashFocus } from '../hooks/useSlashFocus.js'
import EmptyState      from '../components/EmptyState.jsx'
import ErrorNotice     from '../components/ErrorNotice.jsx'
import Kbd             from '../components/Kbd.jsx'

// Grilla fluida: tantas columnas de ≥16rem como quepan junto al carrito
// (1 en teléfono, 2 en tablet, 3 en laptop, 4–5 en monitores anchos).
// min(100%, …) evita desbordar en pantallas más angostas que 16rem.
const PRODUCT_GRID = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))]'

export default function VendedorPage() {
  const { seller, location, tenant } = useAuthStore()
  const hasInventory = Boolean(tenant?.has_inventory)
  const { items, clear, total, count, syncStock } = useCartStore()
  const { setLastCreated, lastCreated, clearLastCreated } = useInvoiceStore()
  const { error: toastError } = useToast()

  const [products,    setProducts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(null)
  const [reloadKey,   setReloadKey]   = useState(0)
  const searchRef = useRef(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [query,       setQuery]       = useState('')
  const [catFilter,   setCatFilter]   = useState('all')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCode,    setShowCode]    = useState(false)
  const [cartOpen,    setCartOpen]    = useState(false) // mobile cart sheet

  const codePanelRef = useModalA11y(() => handleNewSale())
  const cartPanelRef = useModalA11y(() => setCartOpen(false))

  // ---- Cargar catálogo (stale-while-revalidate) ----------
  useEffect(() => {
    if (!location?.id) return

    // Mostrar el cache de inmediato (aunque sea stale)…
    const cached = getProductsCache(location.id)
    if (cached) {
      setProducts(cached)
      setLoading(false)
    }

    // …y revalidar SIEMPRE en background: los cambios de catálogo (fotos,
    // precios, productos nuevos) llegan al vendedor sin esperar el TTL
    if (!cached || navigator.onLine) {
      const controller = new AbortController()
      if (!cached) setLoading(true)
      setLoadError(null)
      api.get(`/products?location_id=${location.id}`, { signal: controller.signal })
        .then(data => {
          if (data?.length) {
            setProducts(data)
            setProductsCache(location.id, data)
          }
        })
        .catch(err => {
          if (err.canceled) return
          // Con cache en pantalla el fallo de red no interrumpe la venta; sin
          // cache, el vendedor necesita saberlo y poder reintentar (antes veía
          // "No hay productos" como si el catálogo estuviera vacío).
          if (!cached) setLoadError(err)
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
      return () => controller.abort()
    }
  }, [location?.id, reloadKey])

  // El stock del carrito se refresca con cada catálogo nuevo
  useEffect(() => {
    if (!hasInventory || !products.length) return
    syncStock(new Map(products.map(p => [p.id, Number(p.stock_quantity ?? 0)])))
  }, [products, hasInventory, syncStock])

  // "/" enfoca el buscador (como en la mayoría de apps con teclado)
  useSlashFocus(searchRef)

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
    // Sin tildes ni mayúsculas y por palabras: "volcan mag" encuentra "Volcán mágico"
    if (query.trim()) list = list.filter(p => matchesQuery([p.name], query))
    // Con inventario, los agotados van al final (orden estable para el resto)
    if (hasInventory) {
      list = [...list].sort((a, b) =>
        (Number(a.stock_quantity ?? 0) <= 0) - (Number(b.stock_quantity ?? 0) <= 0))
    }
    return list
  }, [products, catFilter, query, hasInventory])

  // ---- Generar factura (con fallback offline) ------------
  const handleCheckout = async () => {
    if (!items.length) return
    setSubmitting(true)

    const invoicePayload = {
      location_id:   location.id,
      location_name: location.name,
      seller_id:     seller.id,
      seller_name:   seller.name,
      // Identifica esta venta a lo largo de todos los reintentos (los de
      // api.js y los de la cola offline). El servidor la usa para no crear
      // una segunda factura si la respuesta se pierde por red.
      client_op_id:  newOpId(),
      // Solo qué y cuánto: precio, nombre y etiqueta los pone el servidor.
      // Se siguen mandando los demás campos para que el POS funcione contra
      // una API anterior durante el despliegue.
      items:         items.map(i => ({
        presentationId:    i.presentationId,
        productId:         i.productId,
        product_name:      i.productName,
        label:             i.label,
        price:             i.price,
        original_price:    i.original_price ?? i.base_price ?? i.price,
        is_price_edited:   !!i.is_price_edited,
        price_edit_reason: i.price_edit_reason || undefined,
        qty:               i.qty,
        subtotal:          i.subtotal,
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
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      <Topbar title="Vender" />

      {/* ---- DESKTOP: 2 columnas ---- */}
      <div className="flex-1 flex min-h-0">

        {/* ---- Panel izquierdo: catálogo ---- */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 md:border-r md:border-white/5">

          {/* Buscador + filtros */}
          <div className="space-y-3 border-b border-white/5 px-3 py-3 sm:px-4 lg:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                placeholder="Buscar producto..."
                aria-label="Buscar producto"
                aria-keyshortcuts="/"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="input pl-9 pr-10"
              />
              {!query && (
                <Kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</Kbd>
              )}
            </div>
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide sm:-mx-4 sm:px-4 lg:-mx-5 lg:px-5">
              <CatChip
                active={catFilter === 'all'}
                onClick={() => setCatFilter('all')}
                label="Todos"
                icon={<Sparkles className="w-3.5 h-3.5" />}
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
          <div className="flex-1 overflow-y-auto p-3 pb-28 sm:p-4 sm:pb-28 md:pb-4 lg:p-5">
            {loadError ? (
              <ErrorNotice
                error={loadError}
                title="No se pudo cargar el catálogo"
                onRetry={() => setReloadKey(k => k + 1)}
                className="mx-auto max-w-xl"
              />
            ) : loading ? (
              <div className={PRODUCT_GRID}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton h-40 rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title={query.trim() ? `Sin resultados para "${query.trim()}"` : 'No hay productos en esta categoría'}
                description={query.trim() ? 'Revisa la ortografía o busca por otra palabra.' : undefined}
                className="mx-auto mt-6 max-w-md"
              />
            ) : (
              <div className={PRODUCT_GRID}>
                {filtered.map(product => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ---- Panel derecho: carrito (DESKTOP) ---- */}
        <aside aria-label="Carrito" className="hidden min-h-0 w-64 shrink-0 flex-col bg-surface-500 md:flex lg:w-80 2xl:w-96">
          {showCode && lastCreated ? (
            <CodeDisplay invoice={lastCreated} onNewSale={handleNewSale} />
          ) : (
            <CartPanel onCheckout={handleCheckout} loading={submitting} />
          )}
        </aside>

      </div>

      {/* ---- MOBILE: Botón flotante del carrito ---- */}
      {!showCode && (
        <button
          onClick={() => setCartOpen(true)}
          aria-label={cartCount > 0 ? `Ver carrito: ${cartCount} productos, ${formatCOP(total())}` : 'Ver carrito'}
          className="fixed right-4 z-40 flex min-h-[3.25rem] items-center gap-2 rounded-full bg-brand-500 px-5 text-surface-700 shadow-lg shadow-black/40 transition-transform active:scale-95 md:hidden"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <ShoppingCart className="w-5 h-5" />
          {cartCount > 0 && (
            <span data-theme="dark" className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-700 px-1.5 text-xs font-bold text-brand-300">
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
        <div className="fixed inset-0 z-50 bg-surface-500/95 backdrop-blur-sm md:hidden flex items-center justify-center p-4">
          <div ref={codePanelRef} role="dialog" aria-modal="true" aria-label="Código de factura generado" tabIndex={-1}
            className="w-full max-w-sm">
            <CodeDisplay invoice={lastCreated} onNewSale={handleNewSale} />
          </div>
        </div>
      )}

      {/* ---- MOBILE: Bottom sheet del carrito ---- */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop: tocar fuera cierra. Fuera del orden de tabulación: con
              teclado se cierra con Escape (useModalA11y). */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar carrito"
            onClick={() => setCartOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />

          {/* Sheet */}
          <div
            ref={cartPanelRef} role="dialog" aria-modal="true" aria-label="Carrito de compra" tabIndex={-1}
            className="safe-area-pb absolute bottom-0 left-0 right-0 bg-surface-500 border-t border-white/10 rounded-t-2xl max-h-[85dvh] flex flex-col animate-slide-up"
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
    <button type="button" onClick={onClick} aria-pressed={active} className="chip">
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  )
}
