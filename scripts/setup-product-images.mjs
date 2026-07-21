// =====================================================
// PyroVenta — Setup de fotos de productos
// Crea el bucket público `product-images` en Supabase Storage
// y verifica que exista la columna products.image_url.
//
// Uso: node scripts/setup-product-images.mjs
// Requiere SUPABASE_URL y SUPABASE_SERVICE_KEY en .env
// =====================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Cargar .env manualmente (sin dependencia dotenv)
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch { /* .env opcional si las vars ya están en el entorno */ }

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('❌ Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en .env')
  process.exit(1)
}

const { ensureProductImagesBucket, PRODUCT_IMAGES_BUCKET } = await import('../api/_lib/productImages.js')

const supabase = createClient(url, key)

// 1. Bucket (misma lógica/config que usa la API en runtime)
try {
  await ensureProductImagesBucket(supabase)
  console.log(`✅ Bucket "${PRODUCT_IMAGES_BUCKET}" listo (público)`)
} catch (error) {
  console.error(`❌ No se pudo crear el bucket: ${error.message}`)
  process.exit(1)
}

// 2. Columna image_url
const { error: colErr } = await supabase.from('products').select('image_url').limit(1)
if (colErr) {
  console.error('❌ La columna products.image_url NO existe todavía.')
  console.error('   Ejecuta en el SQL Editor de Supabase:')
  console.error('   ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;')
  console.error('   (archivo: supabase/migrations/2026-07-20_product_images.sql)')
  process.exit(2)
}
console.log('✅ Columna products.image_url existe')
console.log('🎉 Setup de fotos de productos completo')
