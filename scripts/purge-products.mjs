// =====================================================
// PyroVenta — Purga de productos (TODOS los tenants)
//
// Borra productos de la plataforma completa. Es DESTRUCTIVO e IRREVERSIBLE
// en modo --hard. Úsalo solo para limpiar datos de prueba antes de operar.
//
// Uso:
//   node scripts/purge-products.mjs                    # dry-run: solo reporta
//   node scripts/purge-products.mjs --soft --yes       # desactiva (active=false)
//   node scripts/purge-products.mjs --hard --yes       # borra filas + fotos
//   node scripts/purge-products.mjs --hard --yes --tenant=slug-a --tenant=slug-b
//
// Sin --yes nunca escribe nada.
//
// Qué borra --hard:
//   products  → filas eliminadas
//   presentations, stock → caen por ON DELETE CASCADE
//   product-images → se borran los archivos de las fotos
// Qué NO toca:
//   invoices / invoice history → guarda los items en JSONB (nombre y precio
//   copiados al facturar), así que el histórico y los reportes siguen intactos.
//   categories → se conservan (vacías) para no romper la re-importación.
//
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

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const hard = has('--hard')
const soft = has('--soft')
const apply = has('--yes')
const onlySlugs = args.filter(a => a.startsWith('--tenant=')).map(a => a.slice('--tenant='.length).toLowerCase())

if (hard && soft) {
  console.error('❌ Elige --hard o --soft, no ambos')
  process.exit(1)
}
if (apply && !hard && !soft) {
  console.error('❌ --yes requiere indicar el modo: --soft o --hard')
  process.exit(1)
}

const { imagePathFromUrl, PRODUCT_IMAGES_BUCKET } = await import('../api/_lib/productImages.js')
const supabase = createClient(url, key)

// ---- 1. Tenants en alcance ----
const { data: tenants, error: te } = await supabase
  .from('tenants').select('id, name, slug').order('name')
if (te) { console.error(`❌ No se pudieron leer los tenants: ${te.message}`); process.exit(1) }

const scope = onlySlugs.length
  ? tenants.filter(t => onlySlugs.includes((t.slug || '').toLowerCase()))
  : tenants

if (onlySlugs.length) {
  const found = new Set(scope.map(t => (t.slug || '').toLowerCase()))
  const missing = onlySlugs.filter(s => !found.has(s))
  if (missing.length) { console.error(`❌ Slug(s) inexistente(s): ${missing.join(', ')}`); process.exit(1) }
}
if (!scope.length) { console.log('No hay tenants en alcance. Nada que hacer.'); process.exit(0) }

const mode = hard ? 'ELIMINAR DEFINITIVAMENTE' : soft ? 'desactivar' : 'DRY-RUN (sin cambios)'
console.log(`\nModo: ${mode}`)
console.log(`Tenants en alcance: ${scope.length}${onlySlugs.length ? '' : ' (TODOS)'}\n`)

// ---- 2. Inventario previo ----
let grandTotal = 0
const perTenant = []
for (const t of scope) {
  let { data: rows, error } = await supabase
    .from('products').select('id, image_url').eq('tenant_id', t.id)
  if (error && /image_url/.test(error.message || '')) {
    ;({ data: rows, error } = await supabase.from('products').select('id').eq('tenant_id', t.id))
  }
  if (error) { console.error(`❌ ${t.name}: ${error.message}`); process.exit(1) }
  const photos = (rows || []).filter(r => r.image_url).length
  perTenant.push({ tenant: t, rows: rows || [], photos })
  grandTotal += rows?.length || 0
  console.log(`  ${(t.slug || t.id).padEnd(24)} ${String(rows?.length || 0).padStart(5)} producto(s), ${photos} con foto`)
}
console.log(`\n  TOTAL: ${grandTotal} producto(s) en ${scope.length} tenant(s)\n`)

if (!apply) {
  console.log('Dry-run: no se modificó nada.')
  console.log('Para ejecutar de verdad, repite el comando añadiendo --soft --yes o --hard --yes.')
  process.exit(0)
}
if (!grandTotal) { console.log('No hay productos que borrar.'); process.exit(0) }

// ---- 3. Ejecutar ----
let deleted = 0, photosRemoved = 0
for (const { tenant: t, rows } of perTenant) {
  if (!rows.length) continue

  if (soft) {
    const { error } = await supabase.from('products').update({ active: false }).eq('tenant_id', t.id)
    if (error) { console.error(`❌ ${t.slug}: ${error.message}`); process.exit(1) }
    deleted += rows.length
    console.log(`  ✓ ${t.slug}: ${rows.length} desactivado(s)`)
    continue
  }

  const { error } = await supabase.from('products').delete().eq('tenant_id', t.id)
  if (error) { console.error(`❌ ${t.slug}: ${error.message}`); process.exit(1) }
  deleted += rows.length

  // Fotos: solo rutas dentro de la carpeta del propio tenant
  const paths = rows
    .map(r => r.image_url && imagePathFromUrl(r.image_url, { supabaseUrl: url }))
    .filter(p => p && p.startsWith(`${t.id}/`))
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error: re } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(batch)
    if (re) console.warn(`  ⚠ ${t.slug}: fotos no borradas (${re.message})`)
    else photosRemoved += batch.length
  }
  console.log(`  ✓ ${t.slug}: ${rows.length} eliminado(s), ${paths.length} foto(s)`)
}

console.log(`\n🎉 Listo: ${deleted} producto(s) ${soft ? 'desactivado(s)' : 'eliminado(s)'}` +
  (photosRemoved ? `, ${photosRemoved} foto(s) borrada(s)` : ''))
if (hard) console.log('   Las presentaciones y el stock cayeron por CASCADE. El histórico de facturas quedó intacto.')
console.log('   Los dispositivos con catálogo cacheado lo refrescan al recargar la app.')
