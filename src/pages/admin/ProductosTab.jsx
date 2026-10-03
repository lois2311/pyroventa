import { getStockStatus, STOCK_STATUS } from '../../lib/stockStatus.js'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Camera, Check, LayoutGrid, List, Loader2, Package, PartyPopper, Pencil, Plus, Power,
  Search, SearchX, Tag, Trash2, Upload, X,
} from 'lucide-react'
import { api, clearProductsCache } from '../../lib/api.js'
import { formatCOP } from '../../lib/format.js'
import { useApi } from '../../hooks/useApi.js'
import { useFieldErrors } from '../../hooks/useFieldErrors.js'
import { useSlashFocus } from '../../hooks/useSlashFocus.js'
import Modal from '../../components/Modal.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import FieldError from '../../components/FieldError.jsx'
import Kbd from '../../components/Kbd.jsx'
import Select from '../../components/Select.jsx'
import PhotoThumb from '../../components/ProductThumb.jsx'
import BulkUpload from '../../components/BulkUpload.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { useToast } from '../../components/Toast.jsx'
import { CARD_GRID, FormError, SkeletonGrid } from './shared.jsx'
import {
  DEFAULT_FILTERS, SORTS, filterProducts, hasActiveFilters, isIncomplete, productFacets,
} from './productFilters.js'

// Filtros en la URL (?q=&cat=&estado=&stock=&orden=): recargar o compartir el
// enlace conserva la búsqueda. Nombres en español, como el resto de la URL.
const URL_KEYS = { q: 'q', cat: 'cat', status: 'estado', stock: 'stock', sort: 'orden' }
const VIEW_KEY = 'pv_products_view'

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}


// ===========================================================
// TAB: Productos
// ===========================================================
export default function ProductosTab({ hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()
  // include_inactive: sin esto, desactivar un producto lo hacía desaparecer de
  // esta lista y el botón "Activar" quedaba inalcanzable.
  const productsQ = useApi('/products?include_inactive=1', { initialData: [] })
  const products = useMemo(() => productsQ.data || [], [productsQ.data])
  const [showForm,  setShowForm]  = useState(false)
  const [editProd,  setEditProd]  = useState(null)
  const [showBulk,  setShowBulk]  = useState(false)
  const [view, setView] = useState(readView)

  // ---- Filtros ----------------------------------------------------------
  const [params, setParams] = useSearchParams()
  const filters = {
    ...DEFAULT_FILTERS,
    ...Object.fromEntries(Object.entries(URL_KEYS).map(([k, key]) => [k, params.get(key) ?? DEFAULT_FILTERS[k]])),
  }
  // El texto vive en estado local y pasa a la URL con una pausa: escribir no
  // depende de una navegación (que va en una transición y se atrasaría).
  const [query, setQuery] = useState(filters.q)
  const searchRef = useRef(null)
  useSlashFocus(searchRef)

  const setFilter = (key, value) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (!value || value === DEFAULT_FILTERS[key]) next.delete(URL_KEYS[key])
    else next.set(URL_KEYS[key], value)
    return next
  }, { replace: true })

  useEffect(() => {
    if (query === filters.q) return undefined
    const t = setTimeout(() => setFilter('q', query.trim()), 250)
    return () => clearTimeout(t)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambia el texto

  const clearFilters = () => {
    setQuery('')
    setParams(prev => {
      const next = new URLSearchParams(prev)
      ;['q', 'cat', 'status', 'stock'].forEach(k => next.delete(URL_KEYS[k]))
      return next
    }, { replace: true })
  }

  const changeView = (v) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* sin almacenamiento: solo esta sesión */ }
  }

  // La búsqueda filtra en vivo con el texto local (sin esperar la URL)
  const active = { ...filters, q: query }
  const { categories, counts } = useMemo(() => productFacets(products), [products])
  const visible = useMemo(
    () => filterProducts(products, active),
    [products, active.q, active.cat, active.status, active.stock, active.sort], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const filtering = hasActiveFilters(active)
  // Si la categoría de la URL ya no existe (se borró), no dejar la lista vacía sin explicación
  const catExists = !filters.cat || categories.some(c => c.id === filters.cat)

  // ---- Acciones -------------------------------------------------------
  const handleToggle = async (p) => {
    try {
      await api.put(`/products/${p.id}`, { active: !p.active })
      clearProductsCache() // que el POS deje de ofrecerlo sin esperar el TTL
      productsQ.refetch()
    } catch (err) { toastError(err.message) }
  }

  const handleDelete = async (p) => {
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      description: 'Se borran también sus presentaciones y su foto. No se puede deshacer. El histórico de facturas no se ve afectado.',
      confirmLabel: 'Eliminar definitivamente',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await api.post('/products/bulk-delete', { ids: [p.id], hard: true })
      clearProductsCache()
      toastSuccess(`"${p.name}" eliminado`)
      productsQ.refetch()
    } catch (err) { toastError(err.message) }
  }

  const openNew = () => { setEditProd(null); setShowForm(true) }
  const openEdit = (p) => { setEditProd(p); setShowForm(true) }
  const firstLoad = productsQ.loading && !products.length
  const itemProps = { hasInventory, onEdit: openEdit, onToggle: handleToggle, onDelete: handleDelete }

  if (showBulk) {
    return (
      <div className="max-w-3xl space-y-4">
        <BulkUpload onDone={() => { setShowBulk(false); productsQ.refetch() }} onProductsChanged={productsQ.refetch} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Productos"
        description={firstLoad ? 'Cargando…' : [
          `${counts.all} en el catálogo`,
          counts.inactive > 0 && `${counts.inactive} inactivo${counts.inactive !== 1 ? 's' : ''}`,
          hasInventory && counts.out > 0 && `${counts.out} agotado${counts.out !== 1 ? 's' : ''}`,
        ].filter(Boolean).join(' · ')}
        actions={<>
          <button type="button" onClick={() => setShowBulk(true)} className="btn-outline">
            <Upload className="h-4 w-4" /> Carga y borrado masivo
          </button>
          <button type="button" onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </>}
      />

      <ErrorNotice error={productsQ.error} title="No se pudo cargar el catálogo" onRetry={productsQ.refetch} />

      {/* ---- Filtros ---- */}
      {counts.all > 0 && (
        <div className="panel space-y-3 p-3 sm:p-4" role="search" aria-label="Buscar y filtrar productos">
          {/* Móvil: buscador arriba, categoría y orden lado a lado */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_14rem_12rem]">
            <div className="col-span-2 md:col-span-1">
              <label htmlFor="products-search" className="field-label">Buscar</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  id="products-search"
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } }}
                  placeholder="Nombre, categoría o presentación"
                  aria-keyshortcuts="/"
                  autoComplete="off"
                  className="input pl-9 pr-10"
                />
                {!query && <Kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">/</Kbd>}
              </div>
            </div>
            <div>
              <label htmlFor="products-category" className="field-label">Categoría</label>
              <Select id="products-category" value={filters.cat} onChange={v => setFilter('cat', v)}
                options={[
                  { value: '', label: `Todas (${counts.all})` },
                  ...categories.map(c => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ''}${c.name} (${c.count})` })),
                  ...(catExists ? [] : [{ value: filters.cat, label: 'Categoría eliminada' }]),
                ]} />
            </div>
            <div>
              <label htmlFor="products-sort" className="field-label">Ordenar por</label>
              <Select id="products-sort" value={filters.sort} onChange={v => setFilter('sort', v)}
                options={SORTS.filter(o => !o.inventoryOnly || hasInventory).map(o => ({ value: o.id, label: o.label }))} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented max-w-full overflow-x-auto scrollbar-hide" role="group" aria-label="Estado">
              <FilterButton pressed={filters.status === 'all'} onClick={() => setFilter('status', 'all')}>Todos</FilterButton>
              <FilterButton pressed={filters.status === 'active'} onClick={() => setFilter('status', 'active')} count={counts.active}>Activos</FilterButton>
              <FilterButton pressed={filters.status === 'inactive'} onClick={() => setFilter('status', 'inactive')} count={counts.inactive}>Inactivos</FilterButton>
              {(counts.incomplete > 0 || filters.status === 'incomplete') && (
                <FilterButton pressed={filters.status === 'incomplete'} onClick={() => setFilter('status', 'incomplete')} count={counts.incomplete}
                  title="Sin presentaciones con precio: no aparecen en el POS">
                  Sin precio
                </FilterButton>
              )}
            </div>
            {hasInventory && (
              <div className="segmented max-w-full overflow-x-auto scrollbar-hide" role="group" aria-label="Stock">
                <FilterButton pressed={filters.stock === 'all'} onClick={() => setFilter('stock', 'all')}>Todo el stock</FilterButton>
                <FilterButton pressed={filters.stock === 'low'} onClick={() => setFilter('stock', 'low')} count={counts.low}
                  title="Con existencias iguales o menores a su alerta de stock bajo">
                  Stock bajo
                </FilterButton>
                <FilterButton pressed={filters.stock === 'out'} onClick={() => setFilter('stock', 'out')} count={counts.out}>Agotados</FilterButton>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3 text-xs text-gray-400">
            <p aria-live="polite" className="mr-auto">
              {filtering
                ? <>Mostrando <strong className="text-white">{visible.length}</strong> de {counts.all} productos</>
                : <>{counts.all} productos</>}
            </p>
            {filtering && (
              <button type="button" onClick={clearFilters} className="btn-ghost btn-sm text-brand-400">
                <X className="h-3.5 w-3.5" /> Limpiar filtros
              </button>
            )}
            <div className="segmented" role="group" aria-label="Vista">
              <button type="button" onClick={() => changeView('grid')} aria-pressed={view === 'grid'} aria-label="Vista en tarjetas" title="Tarjetas">
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => changeView('list')} aria-pressed={view === 'list'} aria-label="Vista en lista" title="Lista compacta">
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {firstLoad ? (
        <SkeletonGrid count={6} height="h-36" />
      ) : products.length === 0 ? (
        !productsQ.error && (
          <EmptyState
            icon={PartyPopper}
            title="El catálogo está vacío"
            description="Crea un producto a mano o impórtalos todos desde un Excel."
            action={<>
              <button type="button" onClick={() => setShowBulk(true)} className="btn-outline">
                <Upload className="h-4 w-4" /> Importar desde Excel
              </button>
              <button type="button" onClick={openNew} className="btn-primary">
                <Plus className="h-4 w-4" /> Nuevo producto
              </button>
            </>}
          />
        )
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={query.trim() ? `Ningún producto coincide con "${query.trim()}"` : 'Ningún producto coincide con los filtros'}
          description="Prueba con otra palabra o quita algún filtro."
          action={<button type="button" onClick={clearFilters} className="btn-outline"><X className="h-4 w-4" /> Limpiar filtros</button>}
        />
      ) : view === 'list' ? (
        <ul className={`panel divide-y divide-white/5 overflow-hidden transition-opacity ${productsQ.loading ? 'opacity-60' : ''}`}>
          {visible.map(p => <ProductRow key={p.id} product={p} {...itemProps} />)}
        </ul>
      ) : (
        <ul className={`${CARD_GRID} transition-opacity ${productsQ.loading ? 'opacity-60' : ''}`}>
          {visible.map(p => <ProductCardItem key={p.id} product={p} {...itemProps} />)}
        </ul>
      )}

      {showForm && (
        <ProductForm
          product={editProd}
          hasInventory={hasInventory}
          onClose={() => setShowForm(false)}
          onSave={() => { productsQ.refetch(); setShowForm(false) }}
        />
      )}
    </div>
  )
}

function FilterButton({ pressed, onClick, count, title, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} title={title} className="inline-flex items-center gap-1.5">
      {children}
      {count !== undefined && <span className="font-mono tabular-nums opacity-70">{count}</span>}
    </button>
  )
}

function ProductThumb({ product, size = 'h-12 w-12 text-xl' }) {
  return (
    <PhotoThumb
      src={product.image_url}
      className={`${size} rounded-lg`}
      fallback={
        <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-lg bg-surface-50`}>
          {product.categories?.icon || '🎆'}
        </span>
      }
    />
  )
}

function StockBadge({ product }) {
  const status = getStockStatus(product)
  const qty = Number(product.stock_quantity ?? 0)
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-xs font-medium ${STOCK_STATUS[status].badge}`}>
      <Package className="h-3 w-3" aria-hidden="true" />
      {status === 'untracked' || status === 'out_of_stock' ? STOCK_STATUS[status].label : `Stock: ${qty}`}
    </span>
  )
}

/**
 * Sin presentaciones con precio el POS no muestra el producto: se avisa.
 * `short` (lista compacta): "Sin precio" visible y el resto en el tooltip y
 * para lectores de pantalla.
 */
function IncompleteBadge({ short = false }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300"
      title="No aparece en el POS: agrega al menos una presentación con precio para venderlo">
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      {short
        ? <>Sin precio<span className="sr-only">: no aparece en el POS</span></>
        : 'Sin precio: no aparece en el POS'}
    </span>
  )
}

function Presentations({ product }) {
  return (product.presentations || []).map((pr, i) => (
    <span key={pr.id || i} className="whitespace-nowrap rounded-full bg-surface-50 px-2 py-0.5 text-xs text-gray-300">
      {pr.label} · <span className="font-mono">{formatCOP(pr.price)}</span>
    </span>
  ))
}

function ProductCardItem({ product: p, hasInventory, onEdit, onToggle, onDelete }) {
  return (
    <li className={`card flex flex-col gap-3 bg-surface-300 ${!p.active ? 'border-dashed' : ''}`}>
      <div className={`flex items-start gap-3 ${!p.active ? 'opacity-60' : ''}`}>
        <ProductThumb product={p} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug text-white">{p.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            <Tag className="h-3 w-3 shrink-0 text-gray-500" />
            <span className="truncate">{p.categories?.name || 'Sin categoría'}</span>
          </p>
        </div>
        {!p.active && <span className="badge-pending shrink-0">Inactivo</span>}
      </div>

      <div className={`flex flex-wrap gap-1 ${!p.active ? 'opacity-60' : ''}`}>
        {hasInventory && p.stock_quantity !== undefined && <StockBadge product={p} />}
        {isIncomplete(p) ? <IncompleteBadge /> : <Presentations product={p} />}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
        <button type="button" onClick={() => onEdit(p)} className="btn-ghost btn-sm btn-touch-safe" aria-label={`Editar ${p.name}`}>
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        <button
          type="button"
          onClick={() => onToggle(p)}
          className="btn-ghost btn-sm btn-touch-safe text-yellow-400"
          title={p.active ? 'Se oculta del POS, se puede reactivar' : 'Vuelve a estar disponible en el POS'}
          aria-label={`${p.active ? 'Desactivar' : 'Activar'} ${p.name}`}
        >
          {p.active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          type="button"
          onClick={() => onDelete(p)}
          className="btn-ghost btn-sm btn-touch-safe ml-auto text-gray-400 hover:text-red-400"
          title="Eliminar definitivamente"
          aria-label={`Eliminar ${p.name} definitivamente`}
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </div>
    </li>
  )
}

/**
 * Fila de la vista compacta: ~3 veces más productos por pantalla que las
 * tarjetas. Móvil: nombre + acciones arriba, presentaciones y stock abajo.
 * md+: una sola línea [nombre | presentaciones … stock | acciones].
 */
function ProductRow({ product: p, hasInventory, onEdit, onToggle, onDelete }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 md:flex-nowrap ${!p.active ? 'bg-surface-400/60' : ''}`}>
      <div className={`flex min-w-0 flex-1 items-center gap-3 md:flex-none md:basis-72 lg:basis-80 ${!p.active ? 'opacity-60' : ''}`}>
        <ProductThumb product={p} size="h-9 w-9 text-base" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{p.name}</p>
          <p className="truncate text-xs text-gray-400">
            {p.categories?.name || 'Sin categoría'}
            {!p.active && <> · <span className="text-yellow-400">Inactivo</span></>}
          </p>
        </div>
      </div>

      <div className={`order-3 flex min-w-0 basis-full flex-wrap items-center gap-x-3 gap-y-1 md:order-none md:basis-auto md:flex-1 md:flex-nowrap ${!p.active ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-wrap gap-1 md:flex-1">
          {isIncomplete(p) ? <IncompleteBadge short /> : <Presentations product={p} />}
        </div>
        {/* Columna fija en md+: los stocks quedan alineados entre filas */}
        {hasInventory && p.stock_quantity !== undefined && (
          <div className="shrink-0 md:w-28 md:text-right"><StockBadge product={p} /></div>
        )}
      </div>

      <div className="-mr-2 flex shrink-0 items-center">
        <button type="button" onClick={() => onEdit(p)} className="btn btn-ghost btn-icon text-gray-400 hover:text-white"
          aria-label={`Editar ${p.name}`} title="Editar">
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onToggle(p)} className={`btn btn-ghost btn-icon ${p.active ? 'text-gray-400 hover:text-yellow-400' : 'text-yellow-400'}`}
          aria-label={`${p.active ? 'Desactivar' : 'Activar'} ${p.name}`}
          title={p.active ? 'Desactivar: se oculta del POS' : 'Activar: vuelve al POS'}>
          <Power className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onDelete(p)} className="btn btn-ghost btn-icon text-gray-400 hover:text-red-400"
          aria-label={`Eliminar ${p.name} definitivamente`} title="Eliminar definitivamente">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

function ProductForm({ product, onClose, onSave, hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)
  const [name,          setName]          = useState(product?.name || '')
  const [catId,         setCatId]         = useState(product?.category_id || product?.categories?.id || '')
  const [desc,          setDesc]          = useState(product?.description || '')
  const [stock,         setStock]         = useState(product?.stock_quantity !== undefined ? String(product.stock_quantity) : '')
  const [trackStock,    setTrackStock]    = useState(product?.track_stock !== false)
  const [minStock,      setMinStock]      = useState(product?.min_stock != null ? String(product.min_stock) : '')
  const [presentations, setPresentations] = useState(
    (product?.presentations || []).map(p => ({ label: p.label, price: String(p.price) }))
  )
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // Foto: url existente, File nuevo pendiente de subir, o null explícito (quitar)
  const [imageUrl,  setImageUrl]  = useState(product?.image_url || null)
  const [imageFile, setImageFile] = useState(null)
  const photoRef = useRef(null)

  // Categorías
  const [categories,  setCategories]  = useState([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [showNewCat,  setShowNewCat]  = useState(false)
  const [newCatName,  setNewCatName]  = useState('')
  const [savingCat,   setSavingCat]   = useState(false)

  useEffect(() => {
    let mounted = true
    api.get('/categories')
      .then(d => {
        if (mounted && Array.isArray(d)) setCategories(d)
      })
      .catch(() => {
        // Sin la lista, al menos la categoría actual queda seleccionable
        if (mounted && product?.categories) {
          setCategories([product.categories])
        }
      })
      .finally(() => {
        if (mounted) setLoadingCats(false)
      })
    return () => { mounted = false }
  }, [product])

  const handleCreateCategory = async (e) => {
    e?.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setSavingCat(true)
    try {
      const created = await api.post('/categories', { name: trimmed })
      if (created?.id) {
        setCategories(prev => {
          if (prev.some(c => c.id === created.id)) return prev
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
        })
        setCatId(created.id)
        setNewCatName('')
        setShowNewCat(false)
        toastSuccess?.(`Categoría "${created.name}" creada`)
      }
    } catch (err) {
      toastError(err.message || 'Error al crear la categoría')
    } finally {
      setSavingCat(false)
    }
  }

  const filePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : null, [imageFile])
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview) }, [filePreview])
  const photoPreview = filePreview || imageUrl

  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (file) setImageFile(file)
    if (photoRef.current) photoRef.current.value = ''
  }

  const removePhoto = () => { setImageFile(null); setImageUrl(null) }

  const addPres = () => { clear('presentations'); setPresentations(p => [...p, { label: '', price: '' }]) }
  const updatePres = (i, field, val) => {
    clear('presentations')
    setPresentations(p => p.map((pr, idx) => idx === i ? { ...pr, [field]: val } : pr))
  }
  const removePres = (i) => setPresentations(p => p.filter((_, idx) => idx !== i))

  const presInvalid = (pr) => !pr.label.trim() || pr.price === '' || !(Number(pr.price) >= 0)

  const handleSave = async () => {
    setFormError('')
    const ok = validate({
      name: !name.trim() && 'El nombre es requerido',
      presentations: presentations.some(presInvalid) && 'Completa el nombre y un precio válido en cada presentación',
    })
    if (!ok) return
    setSaving(true)
    const presToSave = presentations.map(p => ({ label: p.label.trim(), price: Number(p.price) }))
    try {
      let finalImageUrl = imageUrl
      if (imageFile) {
        const { uploadProductImage } = await import('../../lib/imageCompress.js')
        finalImageUrl = await uploadProductImage(imageFile)
      }
      const body = {
        name: name.trim(),
        category_id: catId || null,
        description: desc.trim() || null,
        presentations: presToSave,
        ...(hasInventory ? { track_stock: trackStock, min_stock: trackStock && minStock !== '' ? Math.max(0, parseInt(minStock, 10)) : null } : {}),
        ...(hasInventory && trackStock && stock !== '' && !isNaN(Number(stock)) ? { stock: Math.max(0, parseInt(stock, 10)) } : {}),
      }
      // Solo enviar image_url si cambió (evita tocar la columna en BDs sin la migración)
      if (finalImageUrl !== (product?.image_url ?? null)) body.image_url = finalImageUrl
      if (product?.id) {
        await api.put(`/products/${product.id}`, body)
      } else {
        await api.post('/products', body)
      }
      clearProductsCache() // que el POS vea el cambio sin esperar el TTL
      onSave()
    } catch (err) { setFormError(err.message) }
    finally { setSaving(false) }
  }

  const showPresErrors = Boolean(errors.presentations)
  // validate() enfoca el id `${fid}-presentations`: va en el primer campo
  // inválido, no siempre en la primera fila.
  const firstBad = presentations.findIndex(presInvalid)
  const focusPres = (i, field) => {
    if (i !== firstBad) return undefined
    const labelBad = !presentations[i].label.trim()
    return (field === 'label') === labelBad ? `${fid}-presentations` : undefined
  }

  return (
    <Modal
      title={product ? 'Editar producto' : 'Nuevo producto'}
      icon={product ? Pencil : PartyPopper}
      size="lg"
      onClose={onClose}
      onSubmit={handleSave}
      footer={<>
        <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </>}
    >
      {/* Foto + nombre: lo primero que identifica al producto */}
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {photoPreview ? (
            <img src={photoPreview} alt={`Foto de ${name || 'producto'}`} className="h-20 w-20 rounded-xl border border-white/10 object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-white/15 bg-surface-400 text-2xl">🎆</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <label htmlFor={`${fid}-name`} className="field-label">Nombre</label>
            <input id={`${fid}-name`} placeholder="Nombre del producto" value={name} {...describe('name')}
              onChange={e => { setName(e.target.value); clear('name') }} className="input" />
            <FieldError id={`${fid}-name-error`}>{errors.name}</FieldError>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="btn-outline btn-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand-500">
              <Camera className="h-3.5 w-3.5" /> {photoPreview ? 'Cambiar foto' : 'Agregar foto'}
              <input ref={photoRef} type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
            </label>
            {photoPreview && (
              <button type="button" onClick={removePhoto} className="btn-ghost btn-sm text-gray-400 hover:text-red-400">
                Quitar foto
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Categoría, con opción de crear una nueva sin salir del formulario */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={showNewCat ? `${fid}-newcat` : `${fid}-cat`} className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
            <Tag className="h-3.5 w-3.5 text-brand-400" />
            {showNewCat ? 'Nueva categoría' : 'Categoría'}
          </label>
          {!showNewCat && (
            <button
              type="button"
              onClick={() => setShowNewCat(true)}
              className="flex items-center gap-1 text-xs text-brand-400 transition-colors hover:text-brand-300"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva categoría
            </button>
          )}
        </div>

        {showNewCat ? (
          <div className="flex items-center gap-2">
            <input
              id={`${fid}-newcat`}
              type="text"
              placeholder="Nombre de la nueva categoría..."
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }}
              className="input flex-1"
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={savingCat || !newCatName.trim()}
              className="btn-primary"
              title="Crear categoría"
            >
              {savingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>Crear</span>
            </button>
            <button
              type="button"
              onClick={() => { setShowNewCat(false); setNewCatName('') }}
              disabled={savingCat}
              className="btn-ghost btn-icon text-gray-400 hover:text-white"
              aria-label="Cancelar nueva categoría"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Select
            id={`${fid}-cat`}
            value={catId}
            onChange={setCatId}
            disabled={loadingCats}
            options={[
              { value: '', label: '(Sin categoría)' },
              ...categories.map(c => ({ value: c.id, label: `${c.icon ? `${c.icon} ` : ''}${c.name}` })),
            ]}
          />
        )}
      </div>

      <div>
        <label htmlFor={`${fid}-desc`} className="field-label">Descripción <span className="font-normal">(opcional)</span></label>
        <input id={`${fid}-desc`} placeholder="Detalle corto para el vendedor" value={desc} onChange={e => setDesc(e.target.value)} className="input" />
      </div>

      {hasInventory && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-surface-400/50 p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={trackStock}
              onChange={e => setTrackStock(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#B4E854]"
            />
            <span>
              <span className="block text-sm font-medium text-white">Controlar inventario de este producto</span>
              <span className="block text-xs text-gray-400">
                Apágalo para servicios o productos sin límite: se venden siempre y no descuentan stock.
              </span>
            </span>
          </label>
          {trackStock && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${fid}-stock`} className="field-label" title={product ? 'Actualizar existencias' : 'Inventario inicial'}>
                  {product ? 'Stock disponible' : 'Stock inicial'}
                </label>
                <input
                  id={`${fid}-stock`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="Ej: 50"
                  value={stock}
                  onChange={e => setStock(e.target.value)}
                  className="input font-mono"
                />
              </div>
              <div>
                <label htmlFor={`${fid}-min`} className="field-label">Alerta de stock bajo <span className="font-normal">(opcional)</span></label>
                <input
                  id={`${fid}-min`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  placeholder="Usa la del negocio"
                  value={minStock}
                  onChange={e => setMinStock(e.target.value)}
                  className="input font-mono"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <fieldset aria-describedby={errors.presentations ? `${fid}-presentations-error` : undefined}>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-xs font-medium text-gray-400">Presentaciones y precios</legend>
          <button type="button" onClick={addPres} className="btn-ghost btn-sm text-brand-400">
            <Plus className="h-3.5 w-3.5" />
            <span>Agregar</span>
          </button>
        </div>
        {presentations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-gray-400">
            Sin presentaciones. Agrega al menos una (Unidad, Pack x12…) con su precio.
          </p>
        ) : (
          <div className="space-y-2">
            {presentations.map((pr, i) => {
              const labelBad = showPresErrors && !pr.label.trim()
              const priceBad = showPresErrors && (pr.price === '' || !(Number(pr.price) >= 0))
              return (
                <div key={i} className="flex gap-2">
                  <input
                    id={focusPres(i, 'label')}
                    placeholder="Ej: Unidad, Pack x12"
                    aria-label={`Presentación ${i + 1}`}
                    aria-invalid={labelBad || undefined}
                    value={pr.label}
                    onChange={e => updatePres(i, 'label', e.target.value)}
                    className="input flex-1"
                  />
                  <input
                    id={focusPres(i, 'price')}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="Precio"
                    aria-label={`Precio de la presentación ${i + 1}`}
                    aria-invalid={priceBad || undefined}
                    value={pr.price}
                    onChange={e => updatePres(i, 'price', e.target.value)}
                    className="input w-28 font-mono sm:w-32"
                  />
                  <button type="button" onClick={() => removePres(i)} className="btn-ghost btn-icon text-gray-400 hover:text-red-400" aria-label={`Eliminar presentación ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <FieldError id={`${fid}-presentations-error`}>{errors.presentations}</FieldError>
      </fieldset>

      <FormError message={formError} />
    </Modal>
  )
}
