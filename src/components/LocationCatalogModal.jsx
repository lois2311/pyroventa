import { useState, useEffect, useMemo } from 'react'
import { Search, RotateCcw, Sliders, DollarSign, Package, Boxes } from 'lucide-react'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'
import { useAuthStore } from '../store/authStore.js'
import Select from './Select.jsx'
import Modal from './Modal.jsx'
import ErrorNotice from './ErrorNotice.jsx'
import FormError from './FormError.jsx'

export default function LocationCatalogModal({ location, onClose, onSaved }) {
  const { success: toastSuccess } = useToast()
  const hasInventory = Boolean(useAuthStore(s => s.tenant?.has_inventory))

  const [activeSubTab, setActiveSubTab] = useState('precios') // 'precios' | 'productos'
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(null)
  const [reloadKey,    setReloadKey]    = useState(0)
  const [saving,       setSaving]       = useState(false)
  const [saveError,    setSaveError]    = useState('')
  const [products,     setProducts]     = useState([])
  const [query,        setQuery]        = useState('')

  // Overrides de precios: { [presentation_id]: string (número) }
  const [priceOverrides, setPriceOverrides] = useState({})
  // Deshabilitados en este punto: Set con product_ids
  const [disabledProds,  setDisabledProds]  = useState(new Set())
  // Inventario: el punto controla o no, y excepciones por producto { [product_id]: true | false }
  const [locTracks,  setLocTracks]  = useState(location?.tracks_inventory !== false)
  const [trackOverrides, setTrackOverrides] = useState({})

  useEffect(() => {
    if (!location?.id) return
    const controller = new AbortController()
    const { signal } = controller
    setLoading(true)
    setLoadError(null)

    Promise.all([
      api.get('/products?include_inactive=1', { signal }),
      api.get(`/locations/${location.id}/catalog-config`, { signal }),
    ])
      .then(([allProducts, config]) => {
        setProducts(allProducts || [])

        // Mapear precios guardados
        const po = {}
        ;(config?.prices || []).forEach(p => {
          if (p.presentation_id && p.price !== null && p.price !== undefined) {
            po[p.presentation_id] = String(p.price)
          }
        })
        setPriceOverrides(po)

        // Mapear productos deshabilitados
        const dp = new Set()
        ;(config?.products || []).forEach(p => {
          if (p.product_id && p.active === false) {
            dp.add(p.product_id)
          }
        })
        setDisabledProds(dp)

        const to = {}
        ;(config?.products || []).forEach(p => {
          if (p.product_id && typeof p.track_stock === 'boolean') to[p.product_id] = p.track_stock
        })
        setTrackOverrides(to)
      })
      .catch(err => { if (!err.canceled) setLoadError(err) })
      .finally(() => { if (!signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [location?.id, reloadKey])

  // Filtrar productos por búsqueda
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products
    const q = query.toLowerCase().trim()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.categories?.name && p.categories.name.toLowerCase().includes(q))
    )
  }, [products, query])

  // Contadores
  const differentialCount = Object.keys(priceOverrides).filter(id => {
    const val = priceOverrides[id]
    if (!val || isNaN(Number(val))) return false
    // Buscar la presentación para saber si difiere del precio base
    for (const p of products) {
      const pres = (p.presentations || []).find(pr => pr.id === id)
      if (pres) return Number(val) !== Number(pres.price)
    }
    return true
  }).length

  const disabledCount = disabledProds.size
  const exceptionCount = Object.keys(trackOverrides).length

  // Acciones de precio
  const setOverride = (presId, val) => {
    setPriceOverrides(prev => ({ ...prev, [presId]: val }))
  }

  const resetOverride = (presId) => {
    setPriceOverrides(prev => {
      const next = { ...prev }
      delete next[presId]
      return next
    })
  }

  // Acciones de disponibilidad
  const toggleProduct = (prodId) => {
    setDisabledProds(prev => {
      const next = new Set(prev)
      if (next.has(prodId)) next.delete(prodId)
      else next.add(prodId)
      return next
    })
  }

  const setTrackOverride = (prodId, value) => {
    setTrackOverrides(prev => {
      const next = { ...prev }
      if (value === 'default') delete next[prodId]
      else next[prodId] = value === 'track'
      return next
    })
  }

  const enableAll = () => setDisabledProds(new Set())
  const disableAll = () => setDisabledProds(new Set(products.map(p => p.id)))

  // Guardar
  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const pricesPayload = []
      for (const [presId, val] of Object.entries(priceOverrides)) {
        const num = Number(val)
        if (Number.isFinite(num) && num >= 0) {
          pricesPayload.push({ presentation_id: presId, price: num })
        }
      }

      const productsPayload = []
      // Solo registramos los deshabilitados y las excepciones de inventario para no inflar la tabla
      const ids = new Set([...disabledProds, ...Object.keys(trackOverrides)])
      for (const prodId of ids) {
        productsPayload.push({
          product_id: prodId,
          active: !disabledProds.has(prodId),
          ...(prodId in trackOverrides ? { track_stock: trackOverrides[prodId] } : {}),
        })
      }

      if (hasInventory && locTracks !== (location?.tracks_inventory !== false)) {
        await api.put(`/locations/${location.id}`, { tracks_inventory: locTracks })
      }

      await api.put(`/locations/${location.id}/catalog-config`, {
        prices: pricesPayload,
        products: productsPayload,
      })

      clearProductsCache(location.id)
      toastSuccess(`Catálogo de "${location.name}" actualizado`)
      if (onSaved) onSaved()
      onClose()
    } catch (err) {
      setSaveError(err.message || 'Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const subTabClass = (active) => `flex items-center gap-1.5 border-b-2 px-3 pb-2 text-xs font-semibold transition-colors ${
    active ? 'border-brand-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
  }`

  return (
    <Modal
      title={<>Precios y catálogo · <span className="text-brand-400">{location.name}</span></>}
      description="Personaliza precios o productos para este punto. Lo que no modifiques usa el valor general de la empresa."
      icon={Sliders}
      size="xl"
      onClose={onClose}
      onSubmit={handleSave}
      // Son muchos campos: un toque fuera no descarta lo editado
      closeOnBackdrop={false}
      footer={<>
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving || loading || Boolean(loadError)} className="btn btn-primary">
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </>}
    >
      {/* Selector de pestañas internas */}
      <div className="flex gap-2 border-b border-white/5" role="group" aria-label="Qué configurar">
        <button type="button" onClick={() => setActiveSubTab('precios')} aria-pressed={activeSubTab === 'precios'} className={subTabClass(activeSubTab === 'precios')}>
          <DollarSign className="h-3.5 w-3.5" />
          Precios diferenciales
          {differentialCount > 0 && (
            <span className="whitespace-nowrap rounded-full border border-brand-500/30 bg-brand-500/20 px-1.5 text-2xs text-brand-300">
              {differentialCount}
            </span>
          )}
        </button>

        <button type="button" onClick={() => setActiveSubTab('productos')} aria-pressed={activeSubTab === 'productos'} className={subTabClass(activeSubTab === 'productos')}>
          <Package className="h-3.5 w-3.5" />
          Disponibilidad
          {disabledCount > 0 && (
            <span className="whitespace-nowrap rounded-full border border-red-500/30 bg-red-500/20 px-1.5 text-2xs text-red-300">
              {disabledCount} oculto{disabledCount !== 1 ? 's' : ''}
            </span>
          )}
        </button>

        {hasInventory && (
          <button type="button" onClick={() => setActiveSubTab('inventario')} aria-pressed={activeSubTab === 'inventario'} className={subTabClass(activeSubTab === 'inventario')}>
            <Boxes className="h-3.5 w-3.5" />
            Inventario
            {exceptionCount > 0 && (
              <span className="whitespace-nowrap rounded-full border border-brand-500/30 bg-brand-500/20 px-1.5 text-2xs text-brand-300">
                {exceptionCount} excepci{exceptionCount !== 1 ? 'ones' : 'ón'}
              </span>
            )}
          </button>
        )}
      </div>

      {activeSubTab === 'inventario' && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-surface-400/50 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={locTracks} onChange={e => setLocTracks(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#B4E854]" />
            <span>
              <span className="block text-sm font-medium text-white">Controlar inventario en este punto</span>
              <span className="block text-xs text-gray-400">
                {locTracks
                  ? 'Los productos con control de inventario descuentan stock aquí. Puedes excluir productos concretos abajo.'
                  : 'Este punto vende sin descontar stock. Marca abajo los productos que sí quieres controlar aquí.'}
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Buscador y herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar producto o categoría..."
            aria-label="Buscar producto o categoría"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
            className="input w-full pl-8 text-xs"
          />
        </div>
        {activeSubTab === 'productos' && (
          <div className="flex gap-1">
            <button type="button" onClick={enableAll} className="btn btn-ghost btn-sm text-2xs text-gray-300">
              Habilitar todos
            </button>
            <button type="button" onClick={disableAll} className="btn btn-ghost btn-sm text-2xs text-gray-400 hover:text-red-300">
              Deshabilitar todos
            </button>
          </div>
        )}
      </div>

      {/* Lista con su propio scroll: pestañas y buscador quedan a la vista */}
      <div className="max-h-[55dvh] min-h-[300px] space-y-3 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 py-4" role="status" aria-label="Cargando catálogo">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : loadError ? (
          <ErrorNotice error={loadError} title="No se pudo cargar la configuración del punto" onRetry={() => setReloadKey(k => k + 1)} />
        ) : filteredProducts.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-400">No se encontraron productos</p>
        ) : (
          filteredProducts.map(prod => {
            const isDisabled = disabledProds.has(prod.id)

            if (activeSubTab === 'productos') {
              return (
                <label
                  key={prod.id}
                  className={`card flex cursor-pointer items-center justify-between gap-3 border p-3 transition-colors sm:p-3 ${
                    !isDisabled
                      ? 'border-white/5 bg-surface-300 hover:border-white/10'
                      : 'border-red-500/20 bg-surface-500/50 opacity-60 hover:opacity-80'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-white">{prod.name}</span>
                    <span className="block text-2xs text-gray-400">{prod.categories?.name || 'Sin categoría'}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
                      !isDisabled
                        ? 'border border-green-500/30 bg-green-500/15 text-green-400'
                        : 'border border-red-500/30 bg-red-500/15 text-red-400'
                    }`}>
                      {!isDisabled ? 'Habilitado en este punto' : 'Oculto en este punto'}
                    </span>
                    <input
                      type="checkbox"
                      checked={!isDisabled}
                      onChange={() => toggleProduct(prod.id)}
                      className="h-4 w-4 cursor-pointer accent-brand-500"
                    />
                  </span>
                </label>
              )
            }

            if (activeSubTab === 'inventario') {
              const general = prod.track_stock !== false
              const current = prod.id in trackOverrides ? (trackOverrides[prod.id] ? 'track' : 'skip') : 'default'
              return (
                <div key={prod.id} className="card flex flex-wrap items-center justify-between gap-3 border border-white/5 bg-surface-300 p-3 sm:p-3">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-white">{prod.name}</span>
                    <span className="block text-2xs text-gray-400">
                      {general
                        ? (locTracks ? 'Se controla en este punto' : 'No se controla en este punto')
                        : 'Sin control de inventario en toda la empresa'}
                    </span>
                  </span>
                  {general && (
                    <Select
                      value={current}
                      onChange={v => setTrackOverride(prod.id, v)}
                      aria-label={`Inventario de ${prod.name} en este punto`}
                      options={[
                        { value: 'default', label: locTracks ? 'Según el punto (controlar)' : 'Según el punto (no controlar)' },
                        { value: 'track',   label: 'Siempre controlar' },
                        { value: 'skip',    label: 'No controlar' },
                      ]}
                    />
                  )}
                </div>
              )
            }

            // Pestaña Precios
            return (
              <div key={prod.id} className="card space-y-2 border border-white/5 bg-surface-300 p-3 sm:p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">{prod.name}</p>
                    <p className="text-2xs text-gray-400">{prod.categories?.name || 'Sin categoría'}</p>
                  </div>
                  {isDisabled && (
                    <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 text-2xs text-red-400">
                      Oculto en este punto
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 border-t border-white/5 pt-1">
                  {(prod.presentations || []).filter(pr => pr.active !== false).map(pres => {
                    const overrideVal = priceOverrides[pres.id]
                    const hasOverride = overrideVal !== undefined && overrideVal !== '' && Number(overrideVal) !== Number(pres.price)

                    return (
                      <div key={pres.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-400/70 px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-gray-200">{pres.label}</span>
                          <span className="block text-2xs text-gray-400">
                            Base: {formatCOP(pres.price)}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400" aria-hidden="true">$</span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              aria-label={`Precio de ${prod.name}, ${pres.label} en este punto`}
                              placeholder={String(pres.price)}
                              value={overrideVal !== undefined ? overrideVal : ''}
                              onChange={e => setOverride(pres.id, e.target.value)}
                              className={`input w-28 pl-6 font-mono text-xs font-bold ${
                                hasOverride ? 'border-brand-500 bg-brand-500/10 text-brand-300' : ''
                              }`}
                            />
                          </div>

                          {hasOverride && (
                            <button
                              type="button"
                              onClick={() => resetOverride(pres.id)}
                              title="Restablecer a precio base"
                              aria-label={`Restablecer ${pres.label} a precio base`}
                              className="p-1 text-gray-400 hover:text-amber-400"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      <FormError message={saveError} />
    </Modal>
  )
}
