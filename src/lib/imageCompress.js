// =====================================================
// PyroVenta — Compresión de fotos de producto en el browser
// Redimensiona a máx 800px y convierte a WebP (fallback JPEG)
// antes de subirlas al API como data URL base64.
// =====================================================

const MAX_DIMENSION = 800
const QUALITY = 0.8
// El API acepta hasta 2MB decodificados; apuntamos muy por debajo
const TARGET_MAX_BYTES = 900 * 1024

const ACCEPTED_INPUT = /^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)/i

async function decodeToBitmap(file) {
  try {
    return await createImageBitmap(file)
  } catch {
    // Fallback (formatos que createImageBitmap no soporta en algunos browsers)
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
      img.src = url
    })
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo codificar la imagen'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Comprime un File de imagen y retorna un data URL (webp o jpeg) listo
 * para POST /products/upload-image.
 * @throws Error si el archivo no es una imagen soportada
 */
export async function compressImage(file) {
  if (!ACCEPTED_INPUT.test(file.type || '')) {
    throw new Error(`"${file.name}" no es una imagen soportada`)
  }

  const bitmap = await decodeToBitmap(file)
  const w = bitmap.width, h = bitmap.height
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))

  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  if (bitmap.close) bitmap.close()

  // WebP primero (preserva transparencia); si el browser no lo soporta,
  // toBlob entrega png → caer a JPEG con fondo blanco (JPEG no tiene alpha)
  let blob = await canvasToBlob(canvas, 'image/webp', QUALITY)
  if (!blob || blob.type !== 'image/webp') {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    blob = await canvasToBlob(canvas, 'image/jpeg', QUALITY)
  }
  if (!blob) throw new Error(`No se pudo comprimir "${file.name}"`)

  // Si aún queda grande, bajar calidad progresivamente
  let quality = QUALITY
  while (blob.size > TARGET_MAX_BYTES && quality > 0.4) {
    quality -= 0.15
    const retry = await canvasToBlob(canvas, blob.type, quality)
    if (!retry) break
    blob = retry
  }
  if (blob.size > TARGET_MAX_BYTES) {
    throw new Error(`"${file.name}" es demasiado grande incluso comprimida`)
  }

  return blobToDataUrl(blob)
}

/**
 * Comprime y sube una foto de producto. Retorna la URL pública en Storage.
 * Punto único para el endpoint/timeout — lo usan BulkUpload y el formulario de producto.
 */
export async function uploadProductImage(file) {
  const { api } = await import('./api.js')
  const dataUrl = await compressImage(file)
  const { url } = await api.post('/products/upload-image', { data: dataUrl }, { timeout: 60000, retries: 1 })
  return url
}
