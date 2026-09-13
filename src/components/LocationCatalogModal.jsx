import { useState, useEffect, useMemo, useId } from 'react'
import { X, Search, RotateCcw, Check, CheckCircle2, Sliders, DollarSign, Package } from 'lucide-react'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'

export default function LocationCatalogModal({ location, onClose, onSaved }) {
  const titleId = useId()
  const panelRef = useModalA11y(onClose)
  const { error: toastError, success: toastSuccess } = useToast()

  const [activeSubTab, setActiveSubTab] = useState('precios') // 'precios' | 'productos'
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [products,     setProducts]     = useState([])
  const [query,        setQuery]        = useState('')

  // Overrides de precios: { [presentation_id]: string (número) }
  const [priceOverrides, setPriceOverrides] = useState({})
  // Deshabilitados en este punto: Set con product_ids
  const [disabledProds,  setDisabledProds]  = useState(new Set())

  useEffect(() => {
    if (!location?.id) return
    setLoading(true)

    Promise.all([
      api.get('/products?include_inactive=1'),
      api.get(`/locations/${location.id}/catalog-config`),
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
      })
      .catch(err => toastError(err.message || 'Error cargando configuración del punto'))
      .finally(() => setLoading(false))
  }, [location?.id])

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

  const enableAll = () => setDisabledProds(new Set())
  const disableAll = () => setDisabledProds(new Set(products.map(p => p.id)))

  // Guardar
  const handleSave = async () => {
    setSaving(true)
    try {
      const pricesPayload = []
      for (const [presId, val] of Object.entries(priceOverrides)) {
        const num = Number(val)
        if (Number.isFinite(num) && num >= 0) {
          pricesPayload.push({ presentation_id: presId, price: num })
        }
      }

      const productsPayload = []
      // Solo registramos los explícitamente deshabilitados para no inflar la tabla
      for (const prodId of disabledProds) {
        productsPayload.push({ product_id: prodId, active: false })
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
      toastError(err.message || 'Error al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="card bg-surface-200 border border-white/10 w-full max-w-2xl my-4 space-y-4 shadow-2xl animate-scale-in flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-3 shrink-0">
          <div>
            <h2 id={titleId} className="font-syne font-bold text-lg text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-brand-400" />
              Precios y Catálogo · <span className="text-brand-400">{location.name}</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Personaliza precios o productos específicos para este punto. Los que no modifiques usarán el valor general de la empresa.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de pestañas internas */}
        <div className="flex border-b border-white/5 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('precios')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeSubTab === 'precios'
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Precios Diferenciales
            {differentialCount > 0 && (
              <span className="bg-brand-500/20 text-brand-300 px-1.5 py-0.2 rounded-full text-[10px] border border-brand-500/30">
                {differentialCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('productos')}
            className={`pb-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeSubTab === 'productos'
                ? 'border-brand-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Disponibilidad de Productos
            {disabledCount > 0 && (
              <span className="bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded-full text-[10px] border border-red-500/30">
                {disabledCount} deshabilitado(s)
              </span>
            )}
          </button>
        </div>

        {/* Buscador y herramientas */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar producto o categoría..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="input pl-8 text-xs w-full py-1.5"
            />
          </div>
          {activeSubTab === 'productos' && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={enableAll}
                className="btn btn-ghost btn-sm text-[11px] py-1 text-gray-300"
              >
                Habilitar todos
              </button>
              <button
                type="button"
                onClick={disableAll}
                className="btn btn-ghost btn-sm text-[11px] py-1 text-gray-400 hover:text-red-300"
              >
                Deshabilitar todos
              </button>
            </div>
          )}
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
          {loading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="text-gray-400 text-xs text-center py-10">No se encontraron productos</p>
          ) : (
            filteredProducts.map(prod => {
              const isDisabled = disabledProds.has(prod.id)

              if (activeSubTab === 'productos') {
                return (
                  <div
                    key={prod.id}
                    onClick={() => toggleProduct(prod.id)}
                    className={`card p-3 flex items-center justify-between cursor-pointer transition-colors border ${
                      !isDisabled
                        ? 'bg-surface-300 border-white/5 hover:border-white/10'
                        : 'bg-surface-500/50 border-red-500/20 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-white">{prod.name}</p>
                      <p className="text-[10px] text-gray-400">{prod.categories?.name || 'Sin categoría'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        !isDisabled
                          ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                          : 'bg-red-500/15 text-red-400 border border-red-500/30'
                      }`}>
                        {!isDisabled ? 'Habilitado en este punto' : 'Oculto en este punto'}
                      </span>
                      <input
                        type="checkbox"
                        checked={!isDisabled}
                        onChange={() => {}} // controlado por onClick del contenedor
                        className="accent-brand-500 w-4 h-4 cursor-pointer"
                      />
                    </div>
                  </div>
                )
              }

              // Pestaña Precios
              return (
                <div key={prod.id} className="card bg-surface-300 border border-white/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">{prod.name}</p>
                      <p className="text-[10px] text-gray-400">{prod.categories?.name || 'Sin categoría'}</p>
                    </div>
                    {isDisabled && (
                      <span className="text-[9px] bg-red-500/15 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded">
                        Oculto en este punto
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1 border-t border-white/5">
                    {(prod.presentations || []).filter(pr => pr.active !== false).map(pres => {
                      const overrideVal = priceOverrides[pres.id]
                      const hasOverride = overrideVal !== undefined && overrideVal !== '' && Number(overrideVal) !== Number(pres.price)

                      return (
                        <div key={pres.id} className="flex items-center justify-between gap-3 bg-surface-400/70 rounded-lg px-2.5 py-1.5">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-200 font-medium">{pres.label}</span>
                            <span className="text-[10px] text-gray-400 block">
                              Base: {formatCOP(pres.price)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="100"
                                placeholder={String(pres.price)}
                                value={overrideVal !== undefined ? overrideVal : ''}
                                onChange={e => setOverride(pres.id, e.target.value)}
                                className={`input text-xs font-mono font-bold w-28 pl-6 py-1 ${
                                  hasOverride ? 'border-brand-500 text-brand-300 bg-brand-500/10' : ''
                                }`}
                              />
                            </div>

                            {hasOverride && (
                              <button
                                type="button"
                                onClick={() => resetOverride(pres.id)}
                                title="Restablecer a precio base"
                                aria-label={`Restablecer ${pres.label} a precio base`}
                                className="text-gray-400 hover:text-amber-400 p-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 pt-3 shrink-0">
          <div className="text-xs text-gray-400">
            {differentialCount > 0 && <span className="text-brand-300 font-medium mr-2">{differentialCount} precios diferenciales</span>}
            {disabledCount > 0 && <span className="text-red-300 font-medium">{disabledCount} productos ocultos</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost text-xs">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary text-xs"
            >
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
