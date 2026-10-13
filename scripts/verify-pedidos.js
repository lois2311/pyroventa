// Verifica los invariantes de Vendra Pedidos. Uso: node scripts/verify-pedidos.js
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const errors = []
const fail = (m) => errors.push(m)
const features = JSON.parse(readFileSync('harness/features.json', 'utf8'))
if (!features.master_plan || !existsSync(features.master_plan)) fail('Falta el plan maestro (features.master_plan)')



// 1. Código POS protegido: sin diferencias contra la línea base
const PROTECTED = [
  'api/_lib/routes/invoiceRoutes.js',
  'api/_lib/routes/closureRoutes.js',
  'api/_lib/invoiceItems.js',
  'api/_lib/services/stockService.js',
]
const changed = execSync(`git diff --name-only ${features.baseline_commit} -- ${PROTECTED.join(' ')}`, { encoding: 'utf8' }).trim()
if (changed) fail(`Archivos protegidos modificados:\n  ${changed.split('\n').join('\n  ')}`)

// 2. Migraciones de pedidos: aditivas, idempotentes, con tenant_id/RLS, y solo las tablas de PRs activos
// (completed | in_progress); las de PRs futuros no pueden adelantarse (plan maestro §4 Fase 1, §12).
const allowed = new Set(features.features.filter(x => ['completed', 'in_progress'].includes(x.status)).flatMap(x => x.tables || []))
const created = new Set()
const dir = 'supabase/migrations'
for (const f of readdirSync(dir).filter(f => f.includes('vendra_pedidos'))) {
  const sql = readFileSync(`${dir}/${f}`, 'utf8').replace(/--.*$/gm, '')
  if (/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|DROP\s+COLUMN)\b/i.test(sql)) fail(`${f}: contiene sentencia destructiva`)
  for (const m of sql.matchAll(/CREATE TABLE\s+(?!IF NOT EXISTS)(\w+)/gi)) fail(`${f}: CREATE TABLE sin IF NOT EXISTS (${m[1]})`)
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    created.add(m[1])
    if (!allowed.has(m[1])) fail(`${f}: tabla ${m[1]} adelantada (no pertenece a un PR activo)`)
    if (!/\btenant_id\b/.test(m[2])) fail(`${f}: tabla ${m[1]} sin tenant_id`)
    if (!new RegExp(`ALTER TABLE ${m[1]}[ \t]+ENABLE ROW LEVEL SECURITY`, 'i').test(sql)) fail(`${f}: tabla ${m[1]} sin RLS`)
  }
}
for (const t of allowed) if (!created.has(t)) fail(`Falta la tabla ${t} (PR activo) en las migraciones`)


// 3. El código de pedidos no importa facturación, caja ni inventario
const PEDIDOS_FILES = [
  'ordersRoutes.js', 'orderRequestRoutes.js', 'orderSettingsRoutes.js', 'whatsappRoutes.js', 'deliveryRoutes.js', 'workerRoutes.js', 'conversationRoutes.js', 'opsRoutes.js',
].map(f => `api/_lib/routes/${f}`).concat(
  ['quoteService.js', 'publicCatalogService.js'].map(f => `api/_lib/services/${f}`).concat(['api/_lib/orderRules.js', 'api/_lib/deliveryRules.js', 'api/_lib/opsMetrics.js', 'api/_lib/services/deliveryService.js', 'api/_lib/services/outboxService.js', 'api/_lib/events/backoff.js', 'api/_lib/events/inbox.js', 'api/_lib/events/orderEvents.js', 'api/_lib/events/handlers.js', 'api/_lib/events/whatsappHandlers.js', 'api/_lib/events/retention.js', 'api/_lib/services/conversationService.js', 'api/_lib/adapters/whatsappAdapter.js', 'api/integrations/whatsapp/[provider]/webhook.js']),
).filter(existsSync)
for (const f of PEDIDOS_FILES) {
  const src = readFileSync(f, 'utf8')
  if (/from ['"][^'"]*(invoiceRoutes|closureRoutes|stockService)/.test(src)) fail(`${f}: importa facturación/caja/inventario`)
}

if (errors.length) { console.error('✗ verify-pedidos\n' + errors.map(e => ' - ' + e).join('\n')); process.exit(1) }
console.log(`✓ verify-pedidos: invariantes ok (${PEDIDOS_FILES.length} archivos de pedidos revisados)`)
