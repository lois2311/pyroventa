// =====================================================
// PyroVenta — Fotos de productos (Supabase Storage)
// =====================================================

export const PRODUCT_IMAGES_BUCKET = 'product-images'
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2MB decodificados

const ALLOWED_MIMES = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png':  'png',
}

/**
 * Valida y decodifica un data URL de imagen (base64).
 * Retorna { mime, ext, buffer } o null si es inválido o excede maxBytes.
 */
export function parseImageDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES) {
  if (typeof dataUrl !== 'string') return null
  const m = dataUrl.match(/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return null
  const mime = m[1]
  const ext = ALLOWED_MIMES[mime]
  if (!ext) return null
  // Tamaño decodificado aproximado: base64 → bytes * 3/4 (evita decodificar payloads gigantes)
  const approxBytes = Math.floor(m[2].length * 3 / 4)
  if (approxBytes > maxBytes || approxBytes === 0) return null
  let buffer
  try { buffer = Buffer.from(m[2], 'base64') } catch { return null }
  if (buffer.length === 0 || buffer.length > maxBytes) return null
  return { mime, ext, buffer }
}

/**
 * Ruta dentro del bucket a partir de una URL pública propia
 * (ej: "tenant-id/uuid.webp"), o null si la URL no es del bucket.
 */
export function imagePathFromUrl(url, { supabaseUrl, bucket = PRODUCT_IMAGES_BUCKET }) {
  if (typeof url !== 'string' || url.length > 500 || !supabaseUrl) return null
  const prefix = `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/`
  return url.startsWith(prefix) ? url.slice(prefix.length) : null
}

/**
 * Solo se aceptan URLs del bucket público del propio proyecto y
 * dentro de la carpeta del tenant — evita referencias externas o cross-tenant.
 */
export function isAllowedImageUrl(url, { supabaseUrl, tenantId, bucket = PRODUCT_IMAGES_BUCKET }) {
  if (!tenantId) return false
  const path = imagePathFromUrl(url, { supabaseUrl, bucket })
  if (!path || !path.startsWith(`${tenantId}/`)) return false
  const file = path.slice(String(tenantId).length + 1)
  return /^[A-Za-z0-9._-]+$/.test(file)
}

// Bucket asegurado una sola vez por instancia de la función
let bucketReady = null

/**
 * Crea el bucket público si no existe (self-healing para entornos nuevos).
 */
export function ensureProductImagesBucket(supabaseAdmin) {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabaseAdmin.storage.getBucket(PRODUCT_IMAGES_BUCKET)
      if (data) return
      const { error } = await supabaseAdmin.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
        public: true,
        fileSizeLimit: '2MB',
        allowedMimeTypes: Object.keys(ALLOWED_MIMES),
      })
      // Carrera entre instancias: si otro lo creó primero, no es error
      if (error && !/already exists/i.test(error.message)) throw error
    })().catch(err => { bucketReady = null; throw err })
  }
  return bucketReady
}
