// =====================================================================
// Fixtures E2E: API simulada y sesiones de prueba.
//
//   test('...', async ({ page, api }) => {
//     api.on('POST', '/invoices', () => ({ id: 'i1', code: '4821', ... }))
//     await signIn(page, 'seller')
//     await page.goto('/vender')
//     expect(api.calls('POST', '/invoices')).toHaveLength(1)
//   })
//
// Cada GET sin handler propio responde con los datos de DATA (abajo); cada
// POST/PUT/DELETE sin handler responde {}.
// =====================================================================
import { test as base, expect } from '@playwright/test'

const iso = (d) => d.toISOString().slice(0, 10)
const today = new Date()
const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - 6 + i); return iso(d) })

export const LOCATIONS = [
  { id: 'l1', name: 'Local Principal', address: 'Cra 7 # 12-40', active: true, printer_config: { paper_width: '80mm', use_qz_tray: false } },
  { id: 'l2', name: 'Stand Norte', address: 'CC Unicentro local 12', active: true, printer_config: { paper_width: '58mm' } },
]
const CATEGORIES = [
  { id: 'c1', name: 'Volcanes', icon: '🌋', sort_order: 1 },
  { id: 'c2', name: 'Luces de bengala', icon: '✨', sort_order: 2 },
]
export const PRODUCTS = [
  { id: 'p1', name: 'Volcán mágico', active: true, category_id: 'c1', categories: CATEGORIES[0], stock_quantity: 30,
    presentations: [{ id: 'p1-u', label: 'Unidad', price: 3000 }] },
  { id: 'p2', name: 'Bengala dorada x10', active: true, category_id: 'c2', categories: CATEGORIES[1], stock_quantity: 2,
    presentations: [{ id: 'p2-u', label: 'Unidad', price: 4500 }, { id: 'p2-x12', label: 'Paquete x12', price: 39000 }] },
  { id: 'p3', name: 'Cohete silbador', active: true, category_id: 'c1', categories: CATEGORIES[0], stock_quantity: 0,
    presentations: [{ id: 'p3-u', label: 'Unidad', price: 6000 }] },
]
const REGISTERS = [{ id: 'r1', name: 'Caja 1', location_id: 'l1' }, { id: 'r2', name: 'Caja 2', location_id: 'l1' }]

const invoice = (code, i, status = 'pending') => ({
  id: `i${code}`, code, status, total: 45000 + i * 23000, location_id: 'l1', location_name: 'Local Principal',
  seller_name: ['Carlos Rodríguez', 'Sandra Gómez'][i % 2], created_at: new Date(Date.now() - (i + 1) * 5 * 60000).toISOString(),
  pay_method: status === 'paid' ? 'cash' : null, register_name: status === 'paid' ? 'Caja 1' : null,
  items: [
    { productId: 'p1', product_name: 'Volcán mágico', label: 'Unidad', price: 3000, qty: 3, subtotal: 9000 },
    { productId: 'p2', product_name: 'Bengala dorada x10', label: 'Paquete x12', price: 36000 + i * 23000, qty: 1, subtotal: 36000 + i * 23000 },
  ],
})
export const PENDING = ['4821', '4822'].map((c, i) => invoice(c, i))
const HISTORY = ['4801', '4802', '4803'].map((c, i) => invoice(c, i, ['paid', 'paid', 'cancelled'][i]))

const DAILY = {
  total_revenue: 2983999, invoice_count: 38, avg_ticket: 78526, pending_count: 0, cancelled_count: 2,
  by_pay_method: { cash: 1512999, transfer: 1471000, card: 0 },
  by_transfer_provider: { nequi: 1053000, daviplata: 358000, bancolombia: 60000, sin_detalle: 0 },
  previous: { total_revenue: 3560000, invoice_count: 46, avg_ticket: 77391 },
  by_day: days.slice(1).map((d, i) => ({
    day: d, invoice_count: [2, 4, 5, 12, 8, 7][i], total_revenue: [60000, 180000, 210000, 1150000, 640000, 744000][i],
    cash: [30000, 90000, 150000, 600000, 300000, 342999][i], transfer: [30000, 90000, 60000, 550000, 340000, 401000][i], card: 0,
  })),
}

const DATA = {
  '/locations': LOCATIONS,
  '/registers': REGISTERS,
  '/products': PRODUCTS,
  '/categories': CATEGORIES,
  '/sellers': [
    { id: 'o1', name: 'Laura Perez', role: 'owner', username: 'laura', active: true, seller_locations: [] },
    { id: 's1', name: 'Carlos Rodríguez', role: 'seller', active: true, has_pin: true, seller_locations: [{ location_id: 'l1' }] },
  ],
  '/invoices/pending': PENDING,
  '/invoices/history': { invoices: HISTORY, total: HISTORY.length },
  '/closures': [],
  '/reports/daily': DAILY,
  '/reports/sellers': [
    { seller_id: 's1', seller_name: 'Carlos Rodríguez', count: 16, avg_ticket: 81000, total: 1296000, by_method: { cash: 700000, transfer: 596000, card: 0 } },
  ],
  '/reports/locations': [],
  '/reports/top-products': [],
  '/reports/registers': [],
  '/reports/by-category': [
    { category_id: 'c1', category_name: 'Volcanes', total_revenue: 1200000, total_qty: 60 },
    { category_id: 'c2', category_name: 'Luces de bengala', total_revenue: 800000, total_qty: 45 },
  ],
  '/audit/price-changes': { logs: [], total: 0 },
}

export const TENANT = { id: 't1', name: 'Pirotecnia La Chispa', slug: 'la-chispa', has_inventory: true }
const USERS = {
  owner:   { id: 'o1', name: 'Laura Perez', role: 'owner' },
  seller:  { id: 's1', name: 'Carlos Rodríguez', role: 'seller' },
  cashier: { id: 'c1', name: 'María López', role: 'cashier' },
}

/**
 * Sesión guardada antes de cargar la app (como si ya hubiera iniciado
 * sesión en este equipo). owner → Administración con "Todos los puntos".
 */
export async function signIn(page, role, { theme } = {}) {
  const seller = USERS[role]
  const location = role === 'owner' ? null : LOCATIONS[0]
  const register = role === 'cashier' ? REGISTERS[0] : null
  const auth = { state: { seller, location, tenant: TENANT, locations: LOCATIONS, register, token: 'e2e' }, version: 0 }
  await page.addInitScript(([a, t]) => {
    // Solo la primera carga: una recarga dentro de la prueba conserva lo que la app guardó
    if (sessionStorage.getItem('e2e-init')) return
    sessionStorage.setItem('e2e-init', '1')
    localStorage.setItem('pv_auth', JSON.stringify(a))
    localStorage.setItem('pv_token', 'e2e')
    if (t) localStorage.setItem('pv_theme', t)
  }, [auth, theme])
}

export const test = base.extend({
  // auto: toda prueba corre con la API simulada, la pida o no; sin esto las
  // peticiones de una prueba que no usa `api` llegaban al servidor real.
  api: [async ({ page }, use) => {
    const handlers = []
    const log = []
    await page.route('**/api/**', async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      // En dev el frontend importa api/_lib/roles.js como módulo: no es la API
      if (url.pathname.startsWith('/api/_lib/')) return route.continue()
      const path = url.pathname.replace(/^\/api/, '')
      const method = req.method()
      let body
      try { body = req.postDataJSON() } catch { body = undefined }
      log.push({ method, path, query: Object.fromEntries(url.searchParams), body })

      const handler = handlers.find(h => h.method === method && (h.path instanceof RegExp ? h.path.test(path) : h.path === path))
      let status = 200
      let json
      if (handler) {
        const out = await handler.fn({ path, body, query: Object.fromEntries(url.searchParams) })
        if (out && out.__status) { status = out.__status; json = out.body } else json = out
      } else if (method === 'GET') {
        json = DATA[path] ?? (/^\/invoices\/\d{4}$/.test(path) ? PENDING.find(i => path.endsWith(i.code)) ?? { __notFound: true } : [])
        if (json?.__notFound) { status = 404; json = { error: 'Factura no encontrada' } }
      } else {
        json = {}
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json ?? null) })
    })
    // Supabase Realtime (Caja): sin servidor en las pruebas
    await page.route(/supabase\.co/, r => r.abort())

    await use({
      on(method, path, fn) { handlers.unshift({ method, path, fn }) },
      calls(method, path) {
        return log.filter(c => c.method === method && (path instanceof RegExp ? path.test(c.path) : c.path === path))
      },
    })
  }, { auto: true }],
})

/** Respuesta de error para un handler: api.on('POST', '/x', () => fail(409, 'msg')) */
export const fail = (status, message) => ({ __status: status, body: { error: message } })

export { expect }
