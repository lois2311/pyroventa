import { useState, useEffect, useMemo, useRef } from 'react'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'

// Debe coincidir con MAX_BULK_DELETE del backend
const MAX_PER_REQUEST = 500
const CONFIRM_WORD = 'ELIMINAR'

/**
 * Borrado masivo de productos, dentro de la ruta de carga masiva.
 *
 * Dos modos:
 *  - Desactivar (reversible): active = false. El producto desaparece del POS
 *    pero sigue existiendo, así que la carga masiva lo seguirá tomando como
 *    duplicado y NO lo volverá a crear.
 *  - Eliminar definitivamente: borra las filas y las fotos. Es lo que hace
 *    falta para vaciar el catálogo y volver a importarlo desde el Excel.
 *    El histórico de facturas no se toca (guarda los items en JSONB).
 */
export default function BulkDelete({ onChanged }) {
  const { error: toastError, success: toastSuccess } = useToast()

  const [open,     setOpen]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [products, setProducts] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [query,    setQuery]    = useState('')
  const [mode,     setMode]     = useState('hard')   // 'soft' | 'hard'
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [progress, setProgress] = useState(null)     // { done, total } de lotes

  const confirmInputRef = useRef(null)

  const load = () => {
    setLoading(true)
    // include_inactive: sin esto los ya desactivados quedarían invisibles pero
    // seguirían bloqueando la re-importación por nombre duplicado.
    api.get('/products?include_inactive=1')
      .then(d => {
        setProducts(d || [])
        setSelected(new Set())
      })
      .catch(err => toastError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (open) load() }, [open])
  useEffect(() => { if (confirming) confirmInputRef.current?.focus() }, [confirming])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.categories?.name || '').toLowerCase().includes(q)
    )
  }, [products, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  const isWholeCatalog = products.length > 0 && selected.size === products.length

  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const toggleFiltered = () => setSelected(prev => {
    const next = new Set(prev)
    if (allFilteredSelected) filtered.forEach(p => next.delete(p.id))
    else filtered.forEach(p => next.add(p.id))
    return next
  })

  const cancelConfirm = () => { setConfirming(false); setConfirmText('') }

  const handleDelete = async () => {
    const hard = mode === 'hard'
    const ids = [...selected]
    // Contadores fuera del try: si un lote intermedio falla, lo ya borrado
    // sigue borrado y la UI tiene que reflejarlo igual.
    let deleted = 0
    let photos = 0
    setBusy(true)

    try {
      if (isWholeCatalog) {
        // Vaciar todo el catálogo del tenant en una sola llamada
        const r = await api.post('/products/bulk-delete', { all: true, hard }, { retries: 0, timeout: 60000 })
        deleted += r.deleted || 0
        photos  += r.photos_removed || 0
      } else {
        const batches = []
        for (let i = 0; i < ids.length; i += MAX_PER_REQUEST) batches.push(ids.slice(i, i + MAX_PER_REQUEST))
        setProgress({ done: 0, total: batches.length })
        for (let i = 0; i < batches.length; i++) {
          // Sin retry: un reintento tras un timeout podría borrar dos veces
          // (inocuo para el resultado, pero infla el conteo que se le muestra)
          const r = await api.post('/products/bulk-delete', { ids: batches[i], hard }, { retries: 0, timeout: 60000 })
          deleted += r.deleted || 0
          photos  += r.photos_removed || 0
          setProgress({ done: i + 1, total: batches.length })
        }
      }

      toastSuccess(
        hard
          ? `${deleted} producto(s) eliminado(s)${photos ? ` y ${photos} foto(s) borrada(s)` : ''}`
          : `${deleted} producto(s) desactivado(s)`
      )
      cancelConfirm()
    } catch (err) {
      toastError(
        deleted
          ? `Se borraron ${deleted} y falló el resto: ${err.message}`
          : (err.message || 'Error al eliminar productos')
      )
    } finally {
      setBusy(false)
      setProgress(null)
      // Refrescar siempre: tras un fallo parcial la lista quedaría desfasada
      if (deleted) {
        clearProductsCache() // que el POS deje de mostrar lo borrado
        onChanged?.()
      }
      load()
    }
  }

  // ---- Colapsado ----
  if (!open) {
    return (
      <div className="card bg-surface-400 border-dashed border-red-500/20 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <div>
            <h3 className="font-syne font-semibold text-white text-sm">Eliminar productos</h3>
            <p className="text-[11px] text-gray-500">
              Borra productos en bloque o vacía el catálogo antes de volver a importarlo.
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn btn-ghost border border-white/10 text-sm shrink-0">
            🗑 Borrado masivo
          </button>
        </div>
      </div>
    )
  }

  const canConfirm = mode === 'soft' || confirmText.trim().toUpperCase() === CONFIRM_WORD

  // ---- Expandido ----
  return (
    <div className="card bg-surface-400 border-red-500/20 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-syne font-semibold text-white text-sm">Eliminar productos</h3>
        <button onClick={() => { setOpen(false); cancelConfirm() }} disabled={busy} className="btn btn-ghost btn-sm text-xs">
          Cerrar
        </button>
      </div>

      {/* Modo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[
          { id: 'soft', title: 'Desactivar', hint: 'Reversible. Se oculta del POS, pero la carga masiva lo seguirá viendo como duplicado.' },
          { id: 'hard', title: 'Eliminar definitivamente', hint: 'Borra el producto y su foto. Permite volver a importarlo desde el Excel. No afecta el histórico de facturas.' },
        ].map(opt => (
          <label
            key={opt.id}
            className={`rounded-lg p-2.5 cursor-pointer border text-left transition-colors
              ${mode === opt.id ? 'border-red-500/40 bg-surface-300' : 'border-white/10 bg-surface-300/40 hover:border-white/20'}`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="bulk-delete-mode"
                checked={mode === opt.id}
                onChange={() => { setMode(opt.id); cancelConfirm() }}
                disabled={busy}
                className="accent-red-500"
              />
              <span className="text-sm text-white">{opt.title}</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1 ml-6">{opt.hint}</p>
          </label>
        ))}
      </div>

      {/* Buscador + selección */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o categoría..."
          className="input flex-1"
          disabled={busy}
        />
        <button
          onClick={toggleFiltered}
          disabled={busy || loading || filtered.length === 0}
          className="btn btn-ghost border border-white/10 text-xs shrink-0"
        >
          {allFilteredSelected ? 'Quitar selección' : `Seleccionar ${query.trim() ? `${filtered.length} filtrado(s)` : 'todos'}`}
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
      ) : products.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center">No hay productos en el catálogo.</p>
      ) : (
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {filtered.map(p => (
            <label
              key={p.id}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors
                ${selected.has(p.id) ? 'bg-red-500/10' : 'bg-surface-300 hover:bg-surface-300/70'}`}
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleOne(p.id)}
                disabled={busy}
                className="accent-red-500 shrink-0"
              />
              {p.image_url ? (
                <img src={p.image_url} alt="" loading="lazy" crossOrigin="anonymous"
                     className="w-8 h-8 rounded object-cover border border-white/10 shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded bg-surface-50 flex items-center justify-center text-xs shrink-0">
                  {p.categories?.icon || '🎆'}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {p.name}
                  {!p.active && <span className="ml-2 text-[10px] text-yellow-500">inactivo</span>}
                </p>
                <p className="text-[10px] text-gray-500 truncate">
                  {p.categories?.name || 'Sin categoría'}
                  {p.presentations?.length ? ` · ${p.presentations.length} presentación(es) desde ${formatCOP(Math.min(...p.presentations.map(pr => pr.price)))}` : ''}
                </p>
              </div>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-gray-500 py-4 text-center">Ningún producto coincide con «{query}».</p>
          )}
        </div>
      )}

      {/* Acción */}
      {!confirming && products.length > 0 && (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy || selected.size === 0}
          className="btn btn-danger btn-lg w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {selected.size === 0
            ? 'Selecciona los productos a eliminar'
            : <>
                {mode === 'hard' ? '🗑 Eliminar' : 'Desactivar'} {selected.size} producto(s)
                {isWholeCatalog ? ' — todo el catálogo' : ''}
              </>}
        </button>
      )}

      {confirming && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
          <p className="text-sm text-red-300">
            {mode === 'hard'
              ? <>Vas a eliminar <strong>{selected.size} producto(s)</strong> del catálogo de tu empresa, junto con sus presentaciones y fotos. Esta acción no se puede deshacer.</>
              : <>Vas a desactivar <strong>{selected.size} producto(s)</strong>. Podrás reactivarlos después desde la lista de productos.</>}
          </p>
          {isWholeCatalog && (
            <p className="text-[11px] text-red-400">Es el catálogo completo ({products.length} productos).</p>
          )}
          {mode === 'hard' && (
            <input
              ref={confirmInputRef}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={`Escribe ${CONFIRM_WORD} para confirmar`}
              className="input"
              disabled={busy}
            />
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={cancelConfirm} disabled={busy} className="btn btn-ghost btn-sm">Cancelar</button>
            <button
              onClick={handleDelete}
              disabled={busy || !canConfirm}
              className="btn btn-danger btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy
                ? (progress ? `Eliminando (${progress.done}/${progress.total})...` : 'Eliminando...')
                : 'Sí, continuar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
