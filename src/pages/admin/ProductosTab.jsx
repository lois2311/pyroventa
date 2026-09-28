import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Camera, Check, Loader2, Package, PartyPopper, Pencil, Plus, Tag, Trash2, Upload, X } from 'lucide-react'
import { api, clearProductsCache } from '../../lib/api.js'
import { formatCOP } from '../../lib/format.js'
import { useApi } from '../../hooks/useApi.js'
import { useFieldErrors } from '../../hooks/useFieldErrors.js'
import Modal from '../../components/Modal.jsx'
import PageHeader from '../../components/PageHeader.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorNotice from '../../components/ErrorNotice.jsx'
import FieldError from '../../components/FieldError.jsx'
import BulkUpload from '../../components/BulkUpload.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import { useToast } from '../../components/Toast.jsx'
import { CARD_GRID, FormError, SkeletonGrid } from './shared.jsx'

// ===========================================================
// TAB: Productos
// ===========================================================
export default function ProductosTab({ hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const confirm = useConfirm()
  // include_inactive: sin esto, desactivar un producto lo hacía desaparecer de
  // esta lista y el botón "Activar" quedaba inalcanzable.
  const productsQ = useApi('/products?include_inactive=1', { initialData: [] })
  const products = productsQ.data || []
  const [showForm,  setShowForm]  = useState(false)
  const [editProd,  setEditProd]  = useState(null)
  const [showBulk,  setShowBulk]  = useState(false)

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

  const inactiveCount = products.filter(p => !p.active).length
  const openNew = () => { setEditProd(null); setShowForm(true) }
  const firstLoad = productsQ.loading && !products.length

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
        description={firstLoad ? 'Cargando…' : `${products.length} en el catálogo${inactiveCount > 0 ? ` · ${inactiveCount} inactivo${inactiveCount !== 1 ? 's' : ''}` : ''}`}
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
      ) : (
        <ul className={`${CARD_GRID} transition-opacity ${productsQ.loading ? 'opacity-60' : ''}`}>
          {products.map(p => (
            <li key={p.id} className={`card flex flex-col gap-3 bg-surface-300 ${!p.active ? 'border-dashed' : ''}`}>
              <div className={`flex items-start gap-3 ${!p.active ? 'opacity-60' : ''}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-white/10 object-cover" />
                ) : (
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-50 text-xl">
                    {p.categories?.icon || '🎆'}
                  </span>
                )}
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
                {hasInventory && p.stock_quantity !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium ${p.stock_quantity <= 0 ? 'bg-red-500/15 text-red-400' : p.stock_quantity <= 5 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    <Package className="h-3 w-3" /> Stock: {p.stock_quantity}
                  </span>
                )}
                {(p.presentations || []).map(pr => (
                  <span key={pr.id} className="rounded-full bg-surface-50 px-2 py-0.5 text-xs text-gray-300">
                    {pr.label} · <span className="font-mono">{formatCOP(pr.price)}</span>
                  </span>
                ))}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-white/5 pt-3">
                <button type="button" onClick={() => { setEditProd(p); setShowForm(true) }} className="btn-ghost btn-sm btn-touch-safe">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(p)}
                  className="btn-ghost btn-sm btn-touch-safe text-yellow-400"
                  title={p.active ? 'Se oculta del POS, se puede reactivar' : 'Vuelve a estar disponible en el POS'}
                >
                  {p.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  className="btn-ghost btn-sm btn-touch-safe ml-auto text-gray-400 hover:text-red-400"
                  title="Eliminar definitivamente"
                  aria-label={`Eliminar ${p.name} definitivamente`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            </li>
          ))}
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

function ProductForm({ product, onClose, onSave, hasInventory = false }) {
  const { error: toastError, success: toastSuccess } = useToast()
  const fid = useId()
  const { errors, validate, clear, describe } = useFieldErrors(fid)
  const [name,          setName]          = useState(product?.name || '')
  const [catId,         setCatId]         = useState(product?.category_id || product?.categories?.id || '')
  const [desc,          setDesc]          = useState(product?.description || '')
  const [stock,         setStock]         = useState(product?.stock_quantity !== undefined ? String(product.stock_quantity) : '')
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
        ...(hasInventory && stock !== '' && !isNaN(Number(stock)) ? { stock: Math.max(0, parseInt(stock, 10)) } : {}),
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
          <select
            id={`${fid}-cat`}
            value={catId}
            onChange={e => setCatId(e.target.value)}
            className="input cursor-pointer"
            disabled={loadingCats}
          >
            <option value="">(Sin categoría)</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={hasInventory ? 'grid gap-4 sm:grid-cols-[1fr_9rem]' : ''}>
        <div>
          <label htmlFor={`${fid}-desc`} className="field-label">Descripción <span className="font-normal">(opcional)</span></label>
          <input id={`${fid}-desc`} placeholder="Detalle corto para el vendedor" value={desc} onChange={e => setDesc(e.target.value)} className="input" />
        </div>

        {hasInventory && (
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
        )}
      </div>

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
