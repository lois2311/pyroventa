import { test, expect, signIn, fail, LOCATIONS, TENANT } from './fixtures.js'

// Vendra Pedidos (PR-07): vista móvil del domiciliario y asignación desde el pedido.
const SHOTS = process.env.SHOTS_DIR
// Esta pantalla es móvil primero: por defecto se revisa a 390 px
test.use({ viewport: { width: Number(process.env.E2E_W || 390), height: 800 } })
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png`, fullPage: true })
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()

const delivery = (over = {}) => ({
  id: 'dv1', order_request_id: 'a1b2c3d4-0000-4000-8000-000000000001', order_code: 'A1B2C3D4', status: 'assigned',
  recipient_name: 'Ana Pérez', recipient_phone: '+573001234567', delivery_address: 'Calle 45 # 12-30 · Apto 402 · Ref.: Frente al parque',
  instructions: 'Llamar al llegar', collect_amount: 25000, failure_reason: null, driver: { id: 'd1', name: 'Luis Domi' },
  assigned_at: ago(20), picked_up_at: null, delivered_at: null, created_at: ago(20), updated_at: ago(20), ...over,
})
const ACTIVE = [delivery(), delivery({ id: 'dv2', order_code: 'B2C3D4E5', status: 'picked_up', recipient_name: 'Camilo Restrepo', collect_amount: 0, instructions: null })]
const TODAY = [
  delivery({ id: 'dv3', order_code: 'C3D4E5F6', status: 'delivered', collect_amount: 118500, delivered_at: ago(40), updated_at: ago(40) }),
  delivery({ id: 'dv4', order_code: 'D4E5F6A7', status: 'delivery_failed', failure_reason: 'Nadie abrió la puerta', collect_amount: 0, updated_at: ago(90) }),
]

test.describe('domiciliario', () => {
test.beforeEach(async ({ page, api }) => {
  await signIn(page, 'driver')
  api.on('GET', '/orders/deliveries', ({ query }) => (query.view === 'today' ? TODAY : ACTIVE))
})

test('el domiciliario ve sus entregas con mapa, llamada, WhatsApp y el efectivo a cobrar', async ({ page, api }) => {
  await page.goto('/domicilios')
  const card = page.getByRole('article', { name: 'Pedido A1B2C3D4' })
  await expect(card.getByText('Ana Pérez')).toBeVisible()
  await expect(card.getByText('$25.000')).toBeVisible()
  await expect(card.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=Calle%2045/)
  await expect(card.getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:+573001234567')
  await expect(card.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/573001234567')
  // Pagado: no hay efectivo que cobrar
  await expect(page.getByRole('article', { name: 'Pedido B2C3D4E5' }).getByText('Cobrar en efectivo')).toHaveCount(0)
  await shot(page, 'domicilios')
  expect(api.calls('GET', '/orders/deliveries')[0].query.view).toBe('active')
})

test('los botones de acción cumplen 48 px de alto', async ({ page }) => {
  await page.goto('/domicilios')
  const buttons = page.getByRole('article', { name: 'Pedido A1B2C3D4' }).getByRole('button')
  for (const b of await buttons.all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(47.5)
  for (const l of await page.getByRole('article', { name: 'Pedido A1B2C3D4' }).getByRole('link').all()) expect((await l.boundingBox()).height).toBeGreaterThanOrEqual(47.5)
})

test('marcar recogido y marcar entregado (con aviso del efectivo)', async ({ page, api }) => {
  api.on('POST', /\/status$/, ({ body }) => delivery({ status: body.status }))
  await page.goto('/domicilios')
  await page.getByRole('article', { name: 'Pedido A1B2C3D4' }).getByRole('button', { name: 'Marcar recogido' }).click()
  await expect(page.getByText('Marcado como recogido')).toBeVisible()
  expect(api.calls('POST', '/orders/deliveries/dv1/status')[0].body).toEqual({ status: 'picked_up' })

  await page.getByRole('article', { name: 'Pedido B2C3D4E5' }).getByRole('button', { name: 'Marcar entregado' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Entregaste el pedido #B2C3D4E5?' })
  await expect(confirm.getByText('El pedido ya está pagado.')).toBeVisible()
  await confirm.getByRole('button', { name: 'Sí, entregado' }).click()
  await expect(page.getByText('Entrega confirmada')).toBeVisible()
  expect(api.calls('POST', '/orders/deliveries/dv2/status')[0].body).toEqual({ status: 'delivered' })
})

test('entregar un pedido en efectivo recuerda cuánto cobrar', async ({ page, api }) => {
  api.on('GET', '/orders/deliveries', () => [delivery({ status: 'picked_up' })])
  await page.goto('/domicilios')
  await page.getByRole('button', { name: 'Marcar entregado' }).click()
  await expect(page.getByRole('dialog').getByText('Recuerda cobrar $25.000 en efectivo.')).toBeVisible()
  await shot(page, 'domicilios-confirmar')
})

test('reportar novedad exige el motivo; un 409 muestra el aviso y recarga', async ({ page, api }) => {
  api.on('POST', /\/status$/, () => fail(409, 'No se puede pasar de delivered a delivery_failed'))
  await page.goto('/domicilios')
  await page.getByRole('article', { name: 'Pedido A1B2C3D4' }).getByRole('button', { name: 'Reportar novedad' }).click()
  const dialog = page.getByRole('dialog', { name: 'Reportar novedad' })
  await dialog.getByRole('button', { name: 'Reportar' }).click()
  await expect(dialog.getByText('Cuenta qué pasó')).toBeVisible()
  expect(api.calls('POST', /\/status$/)).toHaveLength(0)
  await dialog.getByLabel('¿Qué pasó?').fill('Nadie abrió la puerta')
  await dialog.getByRole('button', { name: 'Reportar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'No se puede pasar de delivered' })).toBeVisible()
  expect(api.calls('POST', /\/status$/)[0].body).toEqual({ status: 'delivery_failed', reason: 'Nadie abrió la puerta' })
  expect(api.calls('GET', '/orders/deliveries').length).toBeGreaterThan(1) // recargó el estado real
})

test('historial de hoy y estado vacío', async ({ page, api }) => {
  await page.goto('/domicilios')
  await page.getByRole('button', { name: /Historial de hoy/ }).click()
  const list = page.getByRole('list', { name: 'Entregas de hoy' })
  await expect(list.getByText('Entregado', { exact: true })).toBeVisible()
  await expect(list.getByText('Nadie abrió la puerta')).toBeVisible()
  expect(api.calls('GET', '/orders/deliveries').at(-1).query.view).toBe('today')
  await shot(page, 'domicilios-historial')

  api.on('GET', '/orders/deliveries', () => [])
  await page.getByRole('button', { name: /Mis entregas/ }).click()
  await expect(page.getByText('No tienes entregas pendientes')).toBeVisible()
})

test('el vendedor no entra a /domicilios; el PIN del domiciliario lo lleva ahí', async ({ page, api, context }) => {
  await context.clearCookies()
  await page.addInitScript(() => { sessionStorage.setItem('e2e-init', '1'); localStorage.removeItem('pv_auth'); localStorage.removeItem('pv_token'); localStorage.setItem('pv_tenant_slug', 'la-chispa') })
  api.on('GET', /^\/public\/tenant\//, () => ({ tenant: TENANT, locations: LOCATIONS }))
  api.on('POST', '/auth/login', () => ({ seller: { id: 'd1', name: 'Luis Domi', role: 'driver' }, location: LOCATIONS[0], tenant: TENANT, token: 'tok' }))
  await page.goto('/login')
  await page.getByRole('button', { name: /Local Principal/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  for (const d of '4321') await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page).toHaveURL(/\/domicilios$/)
  await expect(page.getByRole('heading', { name: 'Domicilios', exact: true })).toBeVisible()
})

test('un vendedor es redirigido al login', async ({ page, context }) => {
  await context.clearCookies()
  await page.addInitScript(() => {
    sessionStorage.setItem('e2e-init', '1')
    localStorage.setItem('pv_auth', JSON.stringify({ state: { seller: { id: 's1', name: 'Carlos', role: 'seller' }, location: { id: 'l1', name: 'Local' }, tenant: { id: 't1', slug: 'la-chispa' }, locations: [], token: 'e2e' }, version: 0 }))
    localStorage.setItem('pv_token', 'e2e')
  })
  await page.goto('/domicilios')
  await expect(page).toHaveURL(/\/login/)
})

})

test('asignar domicilio desde el pedido aceptado (operador)', async ({ page, api }) => {
  await signIn(page, 'owner')
  const order = {
    id: 'a1b2c3d4-0000-4000-8000-000000000001', location_id: 'l1', status: 'accepted', fulfillment: 'delivery', total: 25000, created_at: ago(30),
    customer: { name: 'Ana Pérez', phone: '+573001234567' }, payment: { method: 'cash_on_delivery', status: 'pending' },
  }
  let deliveries = []
  api.on('GET', '/orders/requests', () => [order])
  api.on('GET', /^\/orders\/requests\/[^/]+$/, () => ({
    ...order, subtotal: 20000, delivery_fee: 5000, notes: null, reject_reason: null, public_token: 'f'.repeat(64), accept_policy: 'require_verified',
    items: [{ id: 'it1', name: 'Volcán mágico', label: 'Unidad', unit_price: 10000, quantity: 2, subtotal: 20000 }],
    address: { address: 'Calle 45 # 12-30' }, payment: { id: 'p1', ...order.payment, reference: null, proof_url: null },
    timeline: [{ at: order.created_at, action: 'created', actor: 'customer' }], deliveries,
  }))
  api.on('GET', '/orders/drivers', () => [{ id: 'd1', name: 'Luis Domi' }, { id: 'd2', name: 'Marta Ríos' }])
  api.on('POST', /\/deliveries$/, ({ body }) => { deliveries = [delivery({ driver: { id: body.driver_id, name: 'Marta Ríos' } })]; return deliveries[0] })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/admin?tab=pedidos')
  await page.getByRole('button', { name: /Ana Pérez/ }).click()
  const detail = page.getByRole('dialog', { name: /Pedido #A1B2C3D4/ })
  await expect(detail.getByText('Aceptar el pedido no autoriza el despacho')).toBeVisible()
  await detail.getByRole('button', { name: 'Asignar domiciliario' }).click()

  const modal = page.getByRole('dialog', { name: 'Asignar domiciliario' })
  await modal.getByRole('button', { name: 'Asignar', exact: true }).click()
  await expect(modal.getByText('Elige un domiciliario')).toBeVisible()
  await page.locator('[id$="-driver"]').click()
  await page.getByRole('option', { name: 'Marta Ríos' }).click()
  await modal.getByLabel(/Indicaciones/).fill('Llamar al llegar')
  await modal.getByRole('button', { name: 'Asignar', exact: true }).click()

  await expect(detail.getByText('Marta Ríos')).toBeVisible()
  await expect(detail.getByText('Por recoger')).toBeVisible()
  await expect(detail.getByRole('button', { name: /Asignar domiciliario|Reasignar/ })).toHaveCount(0) // ya hay una entrega activa
  const [call] = api.calls('POST', /\/deliveries$/)
  expect(call.body).toEqual({ driver_id: 'd2', instructions: 'Llamar al llegar' })
  expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
})
