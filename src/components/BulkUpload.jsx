import { useState, useRef, useEffect } from 'react'
import { api, clearProductsCache } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'
import { TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE, parseExcelRows, matchImagesToProducts } from '../lib/bulkParse.js'
import { uploadProductImage } from '../lib/imageCompress.js'

// xlsx se importa dinámicamente solo cuando se necesita (490KB gzipped)
const loadXLSX = () => import('xlsx')

/**
 * Formato del Excel (plantilla_productos_pyroventa.xlsx):
 *
 * | Producto        | Categoría   | Descripción | Presentación | Precio | Imagen              |
 * |-----------------|-------------|-------------|--------------|--------|---------------------|
 * | Tiro al blanco  | Infantiles  |             | Unidad       | 2500   | tiro_al_blanco.jpg  |
 * | Tiro al blanco  | Infantiles  |             | Pack x12     | 25000  |                     |
 * | Bengala colores | Infantiles  |             | Unidad       | 1500   | bengala_colores.png |
 *
 * Un producto puede tener múltiples filas (una por presentación).
 * "Imagen" es opcional: el nombre del archivo de foto que se adjunta
 * en el paso de vista previa. También se emparejan fotos cuyo nombre
 * de archivo coincida con el nombre del producto.
 */

async function downloadTemplate() {
  const { utils, writeFile } = await loadXLSX()
  const ws = utils.aoa_to_sheet([TEMPLATE_COLUMNS, ...TEMPLATE_EXAMPLE])

  ws['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
  ]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Productos')
  writeFile(wb, 'plantilla_productos_pyroventa.xlsx')
}

const keyOf = (product) => product.name.toLowerCase()

export default function BulkUpload({ onDone }) {
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast()
  const fileRef = useRef(null)
  const photosRef = useRef(null)
  const singlePhotoRef = useRef(null)
  const singleTargetRef = useRef(null) // clave del producto al que se asigna foto individual

  const [step,     setStep]     = useState('start')  // 'start' | 'preview' | 'uploading' | 'done'
  const [parsed,   setParsed]   = useState([])
  const [result,   setResult]   = useState(null)
  const [fileName, setFileName] = useState('')
  const [images,   setImages]   = useState({})       // { [keyOf(p)]: { file, previewUrl } }
  const [unmatched, setUnmatched] = useState([])     // nombres de archivos sin producto
  const [photoErrors, setPhotoErrors] = useState([]) // fotos que fallaron al subir
  const [progress, setProgress] = useState(null)     // { done, total } de la subida de fotos
  const uploadedUrlsRef = useRef({})                 // fotos ya subidas: evita re-subirlas al reintentar

  // Liberar object URLs al desmontar (ref para no capturar un estado obsoleto)
  const imagesRef = useRef(images)
  imagesRef.current = images
  useEffect(() => () => {
    Object.values(imagesRef.current).forEach(img => URL.revokeObjectURL(img.previewUrl))
  }, [])

  const setProductImage = (product, file) => {
    delete uploadedUrlsRef.current[keyOf(product)] // la foto cambió: invalidar subida previa
    setUnmatched(prev => prev.filter(n => n !== file.name)) // ya quedó asignada
    setImages(prev => {
      const key = keyOf(product)
      if (prev[key]) URL.revokeObjectURL(prev[key].previewUrl)
      return { ...prev, [key]: { file, previewUrl: URL.createObjectURL(file) } }
    })
  }

  const removeProductImage = (product) => {
    delete uploadedUrlsRef.current[keyOf(product)]
    setImages(prev => {
      const key = keyOf(product)
      if (!prev[key]) return prev
      URL.revokeObjectURL(prev[key].previewUrl)
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)

    try {
      const { read, utils } = await loadXLSX()
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json(ws, { header: 1 })

      const products = parseExcelRows(rows)

      if (products.length === 0) {
        toastError('No se encontraron productos válidos en el archivo')
        return
      }

      setParsed(products)
      setStep('preview')
      toastInfo(`${products.length} producto(s) encontrado(s) con ${products.reduce((s, p) => s + p.presentations.length, 0)} presentaciones`)
    } catch (err) {
      toastError(err.message || 'Error al leer el archivo Excel')
    }

    // Reset file input
    if (fileRef.current) fileRef.current.value = ''
  }

  // Selección múltiple de fotos: se emparejan por columna Imagen o nombre de producto
  const handlePhotos = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const { assignments, unmatchedFiles } = matchImagesToProducts(parsed, files)
    assignments.forEach((file, product) => setProductImage(product, file))
    // Acumular no-emparejados entre lotes, quitando los que este lote sí asignó
    const assignedNames = new Set([...assignments.values()].map(f => f.name))
    setUnmatched(prev => [...new Set([
      ...prev.filter(n => !assignedNames.has(n)),
      ...unmatchedFiles.map(f => f.name),
    ])])

    if (assignments.size > 0) {
      toastSuccess(`${assignments.size} foto(s) asignada(s)`)
    }
    if (unmatchedFiles.length > 0) {
      toastInfo(`${unmatchedFiles.length} foto(s) sin coincidencia — asígnalas con el botón 📷 de cada producto`)
    }

    if (photosRef.current) photosRef.current.value = ''
  }

  // Foto individual para un producto específico
  const handleSinglePhoto = (e) => {
    const file = e.target.files?.[0]
    const key = singleTargetRef.current
    singleTargetRef.current = null
    if (file && key) {
      const product = parsed.find(p => keyOf(p) === key)
      if (product) setProductImage(product, file)
    }
    if (singlePhotoRef.current) singlePhotoRef.current.value = ''
  }

  const pickSinglePhoto = (product) => {
    singleTargetRef.current = keyOf(product)
    singlePhotoRef.current?.click()
  }

  const handleUpload = async () => {
    setStep('uploading')
    setPhotoErrors([])
    const withPhoto = parsed.filter(p => images[keyOf(p)])
    const failed = []

    // 1. Subir fotos comprimidas (3 en paralelo) con progreso.
    //    Las que ya subieron en un intento anterior se reutilizan.
    let done = 0
    if (withPhoto.length) setProgress({ done: 0, total: withPhoto.length })
    const queue = [...withPhoto]
    const worker = async () => {
      for (let product = queue.shift(); product; product = queue.shift()) {
        const key = keyOf(product)
        try {
          if (!uploadedUrlsRef.current[key]) {
            uploadedUrlsRef.current[key] = await uploadProductImage(images[key].file)
          }
        } catch (err) {
          failed.push(`Foto de "${product.name}": ${err.message}`)
        }
        done++
        setProgress({ done, total: withPhoto.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, withPhoto.length) }, worker))

    // 2. Si alguna foto falló, NO importar: al reintentar, las ya subidas se
    //    reutilizan. Importar sin foto dejaría el producto irrecuperable por
    //    esta vía (el bulk omite nombres duplicados).
    if (failed.length > 0) {
      setPhotoErrors(failed)
      setProgress(null)
      setStep('preview')
      toastError(`${failed.length} foto(s) fallaron — reintenta, o quítalas para importar sin foto`)
      return
    }

    // 3. Importar productos con sus URLs de foto
    try {
      const payload = parsed.map(p => ({
        name:          p.name,
        category:      p.category,
        description:   p.description,
        presentations: p.presentations,
        ...(uploadedUrlsRef.current[keyOf(p)] ? { image_url: uploadedUrlsRef.current[keyOf(p)] } : {}),
      }))
      const data = await api.post('/products/bulk', { products: payload })
      setResult(data)
      setStep('done')
      clearProductsCache() // que el POS vea los productos nuevos sin esperar el TTL
      toastSuccess(data.message)
    } catch (err) {
      toastError(err.message || 'Error al importar productos')
      setStep('preview')
    } finally {
      setProgress(null)
    }
  }

  const handleReset = () => {
    Object.values(images).forEach(img => URL.revokeObjectURL(img.previewUrl))
    uploadedUrlsRef.current = {}
    setParsed([])
    setResult(null)
    setStep('start')
    setFileName('')
    setImages({})
    setUnmatched([])
    setPhotoErrors([])
    setProgress(null)
  }

  // ---- Paso 1: Inicio ----
  if (step === 'start') {
    return (
      <div className="space-y-4">
        <div className="card bg-surface-400 border-dashed border-brand-500/30">
          <h3 className="font-syne font-semibold text-white mb-2">Carga masiva de productos</h3>
          <p className="text-xs text-gray-500 mb-4">
            Sube un archivo Excel (.xlsx) con tus productos. Cada fila es una presentación.
            Un producto puede tener múltiples filas (una por cada presentación/precio).
            En el siguiente paso podrás adjuntar las fotos de los productos.
          </p>

          <div className="bg-surface-300 rounded-lg p-3 mb-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Formato requerido</p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-gray-500 border-b border-white/5">
                    {TEMPLATE_COLUMNS.map(c => (
                      <th key={c} className="text-left pb-1.5 pr-4 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {TEMPLATE_EXAMPLE.slice(0, 4).map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {row.map((cell, j) => (
                        <td key={j} className="py-1 pr-4 font-mono">
                          {j === 4 ? formatCOP(cell) : cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr><td colSpan={TEMPLATE_COLUMNS.length} className="py-1 text-gray-400">...</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={downloadTemplate} className="btn btn-ghost border border-white/10 text-sm">
              📥 Descargar plantilla Excel
            </button>

            <label className="btn btn-primary text-sm cursor-pointer">
              📤 Subir archivo Excel
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
              />
            </label>
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-[10px] text-gray-400">Notas:</p>
            <ul className="text-[10px] text-gray-400 list-disc list-inside space-y-0.5">
              <li>Productos con nombre duplicado se omiten (no se sobreescriben), pero si adjuntas foto y el existente no tiene, la foto sí se le agrega</li>
              <li>Categorías nuevas se crean automáticamente</li>
              <li>El precio debe ser numérico (ej: 2500, no $2.500)</li>
              <li>La columna Imagen es opcional: escribe el nombre del archivo de la foto (ej: volcan.jpg)</li>
              <li>Las fotos se adjuntan en el paso de vista previa y se comprimen automáticamente</li>
              <li>Soporta .xlsx, .xls y .csv</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // ---- Paso 2: Preview ----
  if (step === 'preview' || step === 'uploading') {
    const totalPres = parsed.reduce((s, p) => s + p.presentations.length, 0)
    const categories = [...new Set(parsed.map(p => p.category).filter(Boolean))]
    const photoCount = parsed.filter(p => images[keyOf(p)]).length
    const missingDeclared = parsed.filter(p => p.image && !images[keyOf(p)])

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-syne font-semibold text-white">Vista previa de importación</h3>
            <p className="text-xs text-gray-500">{fileName}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} className="btn btn-ghost btn-sm" disabled={step === 'uploading'}>
              ← Atrás
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-4 gap-3">
          <div className="card bg-surface-400 text-center">
            <p className="font-syne font-bold text-xl text-brand-400">{parsed.length}</p>
            <p className="text-[10px] text-gray-500">Productos</p>
          </div>
          <div className="card bg-surface-400 text-center">
            <p className="font-syne font-bold text-xl text-white">{totalPres}</p>
            <p className="text-[10px] text-gray-500">Presentaciones</p>
          </div>
          <div className="card bg-surface-400 text-center">
            <p className="font-syne font-bold text-xl text-white">{categories.length}</p>
            <p className="text-[10px] text-gray-500">Categorías</p>
          </div>
          <div className="card bg-surface-400 text-center">
            <p className="font-syne font-bold text-xl text-white">{photoCount}</p>
            <p className="text-[10px] text-gray-500">Fotos</p>
          </div>
        </div>

        {/* Fotos */}
        <div className="card bg-surface-400 border-dashed border-white/10 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
            <p className="text-xs text-gray-400">
              Adjunta las fotos de los productos: se emparejan por la columna Imagen o por el nombre del producto.
            </p>
            <label className="btn btn-ghost border border-white/10 text-sm cursor-pointer shrink-0">
              📷 Agregar fotos
              <input
                ref={photosRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotos}
                className="hidden"
                disabled={step === 'uploading'}
              />
            </label>
          </div>
          {unmatched.length > 0 && (
            <p className="text-[10px] text-yellow-400 mt-2">
              Sin coincidencia: {unmatched.join(', ')} — usa el botón 📷 de cada producto para asignarlas.
            </p>
          )}
          {missingDeclared.length > 0 && (
            <p className="text-[10px] text-yellow-400 mt-2">
              El Excel declara fotos que aún no adjuntas: {missingDeclared.map(p => p.image).join(', ')}
            </p>
          )}
        </div>

        {/* Input oculto para asignar foto a un producto puntual */}
        <input
          ref={singlePhotoRef}
          type="file"
          accept="image/*"
          onChange={handleSinglePhoto}
          className="hidden"
        />

        {/* Lista de productos */}
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {parsed.map((product, i) => {
            const img = images[keyOf(product)]
            return (
              <div key={i} className="card bg-surface-300 py-2.5">
                <div className="flex items-start gap-2.5 mb-1.5">
                  {img ? (
                    <img
                      src={img.previewUrl}
                      alt={`Foto de ${product.name}`}
                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/10"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-surface-50 flex items-center justify-center text-sm shrink-0">🎆</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{product.name}</p>
                    <div className="flex gap-2 text-[10px] text-gray-400 flex-wrap">
                      {product.category && <span className="bg-surface-50 px-1.5 py-0.5 rounded">{product.category}</span>}
                      {product.description && <span className="italic">{product.description}</span>}
                      {product.image && !img && <span className="text-yellow-400">Falta foto: {product.image}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => pickSinglePhoto(product)}
                      disabled={step === 'uploading'}
                      className="btn btn-ghost btn-sm text-xs"
                      aria-label={`${img ? 'Cambiar' : 'Agregar'} foto de ${product.name}`}
                    >
                      📷
                    </button>
                    {img && (
                      <button
                        onClick={() => removeProductImage(product)}
                        disabled={step === 'uploading'}
                        className="btn btn-ghost btn-sm text-xs text-gray-400 hover:text-red-400"
                        aria-label={`Quitar foto de ${product.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 ml-[50px]">
                  {product.presentations.map((pres, j) => (
                    <span key={j} className="text-[10px] bg-surface-50 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                      {pres.label} · {formatCOP(pres.price)}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {photoErrors.length > 0 && (
          <div className="bg-surface-300 rounded-lg p-3">
            <p className="text-[10px] text-yellow-400 uppercase tracking-wider mb-1">Fotos que fallaron al subir (reintenta, o quítalas para importar sin foto):</p>
            {photoErrors.map((err, i) => (
              <p key={i} className="text-xs text-yellow-300">{err}</p>
            ))}
          </div>
        )}

        {/* Botón importar */}
        <button
          onClick={handleUpload}
          disabled={step === 'uploading'}
          className="btn btn-primary btn-lg w-full"
        >
          {step === 'uploading' ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              {progress
                ? `Subiendo fotos (${Math.min(progress.done + 1, progress.total)}/${progress.total})...`
                : `Importando ${parsed.length} producto(s)...`}
            </span>
          ) : (
            <>✅ Confirmar e importar {parsed.length} producto(s){photoCount > 0 ? ` con ${photoCount} foto(s)` : ''}</>
          )}
        </button>
      </div>
    )
  }

  // ---- Paso 3: Resultado ----
  if (step === 'done') {
    return (
      <div className="space-y-4">
        <div className="card bg-surface-400 border-green-500/20 text-center py-6">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-syne font-bold text-xl text-green-400 mb-2">Importación completada</h3>
          <p className="text-sm text-gray-300">{result?.message}</p>

          <div className="grid grid-cols-3 gap-3 mt-4 max-w-sm mx-auto">
            <div>
              <p className="font-syne font-bold text-xl text-green-400">{result?.created || 0}</p>
              <p className="text-[10px] text-gray-500">Creados</p>
            </div>
            <div>
              <p className="font-syne font-bold text-xl text-yellow-400">{result?.skipped || 0}</p>
              <p className="text-[10px] text-gray-500">Omitidos</p>
            </div>
            <div>
              <p className="font-syne font-bold text-xl text-red-400">{result?.errors?.length || 0}</p>
              <p className="text-[10px] text-gray-500">Errores</p>
            </div>
          </div>

          {result?.errors?.length > 0 && (
            <div className="mt-3 text-left bg-surface-300 rounded-lg p-3 max-w-sm mx-auto">
              <p className="text-[10px] text-red-400 uppercase tracking-wider mb-1">Errores:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-300">{err}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={handleReset} className="btn btn-ghost border border-white/10">
            Importar más
          </button>
          <button onClick={onDone} className="btn btn-primary">
            Listo
          </button>
        </div>
      </div>
    )
  }

  return null
}
