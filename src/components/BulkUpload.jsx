import { useState, useRef } from 'react'
import { api } from '../lib/api.js'
import { formatCOP } from '../lib/format.js'
import { useToast } from './Toast.jsx'

// xlsx se importa dinámicamente solo cuando se necesita (490KB gzipped)
const loadXLSX = () => import('xlsx')

/**
 * Formato del Excel:
 *
 * | Producto        | Categoría   | Descripción | Presentación | Precio |
 * |-----------------|-------------|-------------|--------------|--------|
 * | Tiro al blanco  | Infantiles  |             | Unidad       | 2500   |
 * | Tiro al blanco  | Infantiles  |             | Pack x12     | 25000  |
 * | Bengala colores | Infantiles  |             | Unidad       | 1500   |
 * | Bengala colores | Infantiles  |             | Pack x10     | 12000  |
 *
 * Un producto puede tener múltiples filas (una por presentación).
 * Se agrupan por nombre de producto.
 */

const TEMPLATE_COLUMNS = ['Producto', 'Categoría', 'Descripción', 'Presentación', 'Precio']

const TEMPLATE_EXAMPLE = [
  ['Tiro al blanco',  'Infantiles',   '', 'Unidad',    2500],
  ['Tiro al blanco',  'Infantiles',   '', 'Pack x12',  25000],
  ['Tiro al blanco',  'Infantiles',   '', 'Caja x48',  85000],
  ['Bengala colores', 'Infantiles',   '', 'Unidad',    1500],
  ['Bengala colores', 'Infantiles',   '', 'Pack x10',  12000],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños', 'Pequeño', 35000],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños', 'Mediano', 65000],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños', 'Grande',  120000],
]

async function downloadTemplate() {
  const { utils, writeFile } = await loadXLSX()
  const ws = utils.aoa_to_sheet([TEMPLATE_COLUMNS, ...TEMPLATE_EXAMPLE])

  ws['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
  ]

  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Productos')
  writeFile(wb, 'plantilla_productos_pyroventa.xlsx')
}

function parseExcelRows(rows) {
  // rows = array de arrays, primera fila = headers
  if (rows.length < 2) return []

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase())
  const colMap = {
    producto:     headers.findIndex(h => h.includes('producto') || h.includes('nombre')),
    categoria:    headers.findIndex(h => h.includes('categor')),
    descripcion:  headers.findIndex(h => h.includes('descrip')),
    presentacion: headers.findIndex(h => h.includes('presentac') || h.includes('label')),
    precio:       headers.findIndex(h => h.includes('precio') || h.includes('price') || h.includes('valor')),
  }

  if (colMap.producto === -1 || colMap.presentacion === -1 || colMap.precio === -1) {
    throw new Error('El archivo debe tener columnas: Producto, Presentación y Precio')
  }

  // Agrupar por producto
  const productMap = {}

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const name = String(row[colMap.producto] || '').trim()
    if (!name) continue

    const category    = colMap.categoria >= 0 ? String(row[colMap.categoria] || '').trim() : ''
    const description = colMap.descripcion >= 0 ? String(row[colMap.descripcion] || '').trim() : ''
    const label       = String(row[colMap.presentacion] || '').trim()
    const rawPrice    = row[colMap.precio]

    // Parsear precio: acepta 2500, 2.500, $2.500, "2500"
    const price = Number(String(rawPrice || '0').replace(/[$.\s]/g, '').replace(',', '.'))

    if (!label || !price || isNaN(price)) continue

    const key = name.toLowerCase()
    if (!productMap[key]) {
      productMap[key] = {
        name,
        category:    category || undefined,
        description: description || undefined,
        presentations: [],
      }
    }

    productMap[key].presentations.push({ label, price })
  }

  return Object.values(productMap)
}

export default function BulkUpload({ onDone }) {
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast()
  const fileRef = useRef(null)

  const [step,     setStep]     = useState('start')  // 'start' | 'preview' | 'uploading' | 'done'
  const [parsed,   setParsed]   = useState([])
  const [result,   setResult]   = useState(null)
  const [fileName, setFileName] = useState('')

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

  const handleUpload = async () => {
    setStep('uploading')
    try {
      const data = await api.post('/products/bulk', { products: parsed })
      setResult(data)
      setStep('done')
      toastSuccess(data.message)
    } catch (err) {
      toastError(err.message || 'Error al importar productos')
      setStep('preview')
    }
  }

  const handleReset = () => {
    setParsed([])
    setResult(null)
    setStep('start')
    setFileName('')
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
                  <tr><td colSpan={5} className="py-1 text-gray-600">...</td></tr>
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
            <p className="text-[10px] text-gray-600">Notas:</p>
            <ul className="text-[10px] text-gray-600 list-disc list-inside space-y-0.5">
              <li>Productos con nombre duplicado se omiten (no se sobreescriben)</li>
              <li>Categorías nuevas se crean automáticamente</li>
              <li>El precio debe ser numérico (ej: 2500, no $2.500)</li>
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
        <div className="grid grid-cols-3 gap-3">
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
        </div>

        {/* Lista de productos */}
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
          {parsed.map((product, i) => (
            <div key={i} className="card bg-surface-300 py-2.5">
              <div className="flex items-start gap-2 mb-1.5">
                <span className="text-sm">🎆</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{product.name}</p>
                  <div className="flex gap-2 text-[10px] text-gray-600">
                    {product.category && <span className="bg-surface-50 px-1.5 py-0.5 rounded">{product.category}</span>}
                    {product.description && <span className="italic">{product.description}</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 ml-6">
                {product.presentations.map((pres, j) => (
                  <span key={j} className="text-[10px] bg-surface-50 text-gray-400 px-2 py-0.5 rounded-full font-mono">
                    {pres.label} · {formatCOP(pres.price)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

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
              Importando {parsed.length} producto(s)...
            </span>
          ) : (
            <>✅ Confirmar e importar {parsed.length} producto(s)</>
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
