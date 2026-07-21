// =====================================================
// PyroVenta — Parser de la plantilla Excel de productos
// Columnas: Producto | Categoría | Descripción | Presentación | Precio | Imagen
// Un producto puede tener múltiples filas (una por presentación).
// "Imagen" (opcional) es el nombre del archivo de foto que acompaña al Excel.
// =====================================================

export const TEMPLATE_COLUMNS = ['Producto', 'Categoría', 'Descripción', 'Presentación', 'Precio', 'Imagen']

export const TEMPLATE_EXAMPLE = [
  ['Tiro al blanco',       'Infantiles',  '',                'Unidad',   2500,   'tiro_al_blanco.jpg'],
  ['Tiro al blanco',       'Infantiles',  '',                'Pack x12', 25000,  ''],
  ['Tiro al blanco',       'Infantiles',  '',                'Caja x48', 85000,  ''],
  ['Bengala colores',      'Infantiles',  '',                'Unidad',   1500,   'bengala_colores.png'],
  ['Bengala colores',      'Infantiles',  '',                'Pack x10', 12000,  ''],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños',  'Pequeño',  35000,  'castillo.jpg'],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños',  'Mediano',  65000,  ''],
  ['Castillo pirotécnico', 'Profesional', 'Varios tamaños',  'Grande',   120000, ''],
]

/**
 * Normaliza un texto para emparejar: minúsculas, sin tildes,
 * separadores (_ - .) como espacio, espacios colapsados.
 */
export function normalizeKey(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nombre de archivo sin extensión, normalizado. */
export function fileBaseKey(filename) {
  return normalizeKey(String(filename || '').replace(/\.[a-z0-9]+$/i, ''))
}

/**
 * Parsea las filas del Excel (array de arrays, primera fila = headers)
 * y agrupa por producto. Retorna [{ name, category?, description?, image?, presentations: [{label, price}] }]
 */
export function parseExcelRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return []

  const headers = rows[0].map(h => String(h || '').trim().toLowerCase())
  const colMap = {
    producto:     headers.findIndex(h => h.includes('producto') || h.includes('nombre')),
    categoria:    headers.findIndex(h => h.includes('categor')),
    descripcion:  headers.findIndex(h => h.includes('descrip')),
    presentacion: headers.findIndex(h => h.includes('presentac') || h.includes('label')),
    precio:       headers.findIndex(h => h.includes('precio') || h.includes('price') || h.includes('valor')),
    imagen:       headers.findIndex(h => h.includes('imagen') || h.includes('foto') || h.includes('image')),
  }

  if (colMap.producto === -1 || colMap.presentacion === -1 || colMap.precio === -1) {
    throw new Error('El archivo debe tener columnas: Producto, Presentación y Precio')
  }

  const productMap = {}

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const name = String(row[colMap.producto] || '').trim()
    if (!name) continue

    const category    = colMap.categoria >= 0 ? String(row[colMap.categoria] || '').trim() : ''
    const description = colMap.descripcion >= 0 ? String(row[colMap.descripcion] || '').trim() : ''
    const image       = colMap.imagen >= 0 ? String(row[colMap.imagen] || '').trim() : ''
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
        image:       image || undefined,
        presentations: [],
      }
    }
    // La columna Imagen puede venir solo en la primera fila del producto
    if (image && !productMap[key].image) productMap[key].image = image

    productMap[key].presentations.push({ label, price })
  }

  return Object.values(productMap)
}

/**
 * Empareja archivos de imagen con productos parseados.
 * Prioridad por producto:
 *   1. Nombre de archivo declarado en la columna Imagen (con o sin extensión)
 *   2. Nombre del producto ≈ nombre del archivo (normalizados)
 * Un mismo archivo puede asignarse a varios productos (foto compartida).
 *
 * @param {Array} products  salida de parseExcelRows
 * @param {Array} files     objetos con .name (File del browser o similar)
 * @returns {{ assignments: Map<producto, file>, unmatchedFiles: Array }}
 */
export function matchImagesToProducts(products, files) {
  // Índice de archivos: nombre exacto normalizado y nombre sin extensión
  const byKey = new Map()
  for (const file of files) {
    byKey.set(normalizeKey(file.name), file)
    if (!byKey.has(fileBaseKey(file.name))) byKey.set(fileBaseKey(file.name), file)
  }

  const assignments = new Map()
  const used = new Set()
  for (const product of products) {
    let file = null
    if (product.image) {
      file = byKey.get(normalizeKey(product.image)) || byKey.get(fileBaseKey(product.image))
    }
    if (!file) file = byKey.get(normalizeKey(product.name)) || null
    if (file) {
      assignments.set(product, file)
      used.add(file)
    }
  }

  return { assignments, unmatchedFiles: files.filter(f => !used.has(f)) }
}
