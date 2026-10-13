import { supabaseAdmin } from '../supabaseAdmin.js'
import { getTenantStatus } from '../tenantStatus.js'

// =====================================================
// Vendra Pedidos — lectura pública del catálogo de la sede piloto.
// Toda consulta lleva tenant_id. Solo campos comerciales: nunca costos,
// stock, ni columnas administrativas. Sin JWT (la ruta es pública).
// =====================================================

const SLUG_RE = /^[a-z0-9-]{1,64}$/
const isMissingColumn = (e) => e?.code === '42703' || e?.code === 'PGRST204'

/**
 * slug público → { tenantId, locationId, settings, businessName } o null.
 * null para todo fallo (slug desconocido, canal apagado, licencia vencida):
 * la ruta responde 404 igual en todos los casos para no revelar qué empresas existen.
 */
export async function resolvePublicOrderContext(slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return null
  const { data: settings } = await supabaseAdmin.from('order_settings')
    .select('tenant_id, location_id, currency, quote_ttl_minutes')
    .eq('public_slug', slug).eq('enabled', true).maybeSingle()
  if (!settings) return null

  const [{ data: tenant }, { data: location }] = await Promise.all([
    supabaseAdmin.from('tenants').select('id, name, active, license_start, license_end').eq('id', settings.tenant_id).single(),
    supabaseAdmin.from('locations').select('id, name, active').eq('id', settings.location_id).eq('tenant_id', settings.tenant_id).single(),
  ])
  if (!location?.active || !getTenantStatus(tenant).ok) return null
  return { tenantId: settings.tenant_id, locationId: settings.location_id, settings, businessName: location.name || tenant.name }
}

/**
 * Catálogo vendible de la sede: producto activo, no deshabilitado en la sede,
 * presentación activa, con el precio efectivo (precio por sede si existe).
 */
export async function fetchLocationCatalog(tenantId, locationId) {
  const select = (withImage) => supabaseAdmin.from('products')
    .select(`id, name, description, ${withImage ? 'image_url, ' : ''}category_id, categories(id, name, icon, sort_order), presentations(id, label, price, active)`)
    .eq('tenant_id', tenantId).eq('active', true).order('name')
  let { data: products, error } = await select(true)
  if (error && isMissingColumn(error)) ({ data: products, error } = await select(false)) // BD sin migración de fotos
  if (error) throw error

  const [{ data: locProds }, { data: locPrices }] = await Promise.all([
    supabaseAdmin.from('location_products').select('product_id, active').eq('tenant_id', tenantId).eq('location_id', locationId),
    supabaseAdmin.from('location_prices').select('presentation_id, price').eq('tenant_id', tenantId).eq('location_id', locationId),
  ])
  const disabled = new Set((locProds || []).filter(lp => lp.active === false).map(lp => lp.product_id))
  const price = new Map((locPrices || []).filter(lp => lp.price != null).map(lp => [lp.presentation_id, Number(lp.price)]))

  const out = []
  for (const p of products || []) {
    if (disabled.has(p.id)) continue
    const presentations = (p.presentations || [])
      .filter(pr => pr.active)
      .map(pr => ({ id: pr.id, label: pr.label, price: price.has(pr.id) ? price.get(pr.id) : Number(pr.price) }))
    if (presentations.length) {
      out.push({ id: p.id, name: p.name, description: p.description ?? null, image_url: p.image_url ?? null, category: p.categories || null, presentations })
    }
  }
  return out
}

export async function fetchActiveZones(tenantId, locationId) {
  const { data, error } = await supabaseAdmin.from('delivery_zones')
    .select('id, name, fee').eq('tenant_id', tenantId).eq('location_id', locationId).eq('active', true).order('name')
  if (error) throw error
  return data || []
}

/** Map presentationId → fila de catálogo, en la forma que espera buildInvoiceItems. */
export function toPresentationMap(products) {
  const map = new Map()
  for (const p of products) {
    for (const pr of p.presentations) {
      map.set(pr.id, { label: pr.label, price: pr.price, product_id: p.id, product_name: p.name })
    }
  }
  return map
}
