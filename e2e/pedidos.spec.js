import { test, expect, signIn, fail } from './fixtures.js'

// Vendra Pedidos (PR-04): bandeja, detalle con acciones y configuración, con la API simulada.
// SHOTS_DIR (opcional): guarda capturas para la revisión visual.
const SHOTS = process.env.SHOTS_DIR
if (process.env.E2E_W) test.use({ viewport: { width: Number(process.env.E2E_W), height: 800 } }) // revisión visual a otros anchos
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()

const ORDERS = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000001', location_id: 'l1', status: 'submitted', fulfillment: 'delivery', total: 25000, source: 'web', created_at: ago(4),
    customer: { name: 'Ana Pérez', phone: '+573001234567' }, payment: { method: 'cash_on_delivery', status: 'pending' } },
  { id: 'a1b2c3d4-0000-4000-8000-000000000002', location_id: 'l1', status: 'submitted', fulfillment: 'delivery', total: 118500, source: 'web', created_at: ago(35),
    customer: { name: 'Camilo Restrepo Ordóñez', phone: '+573109876543' }, payment: { method: 'transfer', status: 'pending' } },
  { id: 'a1b2c3d4-0000-4000-8000-000000000003', location_id: 'l1', status: 'rejected', fulfillment: 'pickup', total: 9000, source: 'web', created_at: ago(300),
    customer: { name: 'Luis Gómez', phone: '+573205550101' }, payment: { method: 'cash_on_delivery', status: 'pending' } },
]

const detail = (o, over = {}) => ({
  ...o, subtotal: o.total - 5000, delivery_fee: 5000, notes: 'Tocar el timbre dos veces', reject_reason: null,
  public_token: 'f'.repeat(60) + 'ab12', accept_policy: 'require_verified',
  items: [
    { id: 'it1', name: 'Volcán mágico', label: 'Unidad', unit_price: 3000, quantity: 3, subtotal: 9000 },
    { id: 'it2', name: 'Bengala dorada x10', label: 'Paquete x12', unit_price: 39000, quantity: 1, subtotal: o.total - 5000 - 9000 },
  ],
  address: o.fulfillment === 'delivery' ? { address: 'Calle 45 # 12-30', details: 'Apto 402', reference_notes: 'Frente al parque' } : null,
  payment: { id: 'pay1', ...o.payment, reference: null, proof_url: null },
  timeline: [{ at: o.created_at, action: 'created', actor: 'customer', to: 'submitted' }],
  ...over,
})

const orderFor = (path) => ORDERS.find(o => path.endsWith(o.id))
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` })

const OPS = {
  since: ago(7 * 24 * 60),
  metrics: {
    orders: { created: 12, accepted: 8, rejected: 2, to_review: 2, awaiting_payment_check: 1, avg_minutes_to_decision: 6.5 },
    deliveries: { assigned: 8, delivered: 6, failed: 1, in_progress: 1, avg_minutes_assign_to_delivered: 41 },
    conversations: { open: 3 },
  },
  health: { outbox: { pending: 1, processing: 0, failed: 1, oldest_pending_minutes: 22 }, integration_events_failed: 0, messages_failed: 1 },
  failed: [{ id: 'ob1', event_type: 'order.accepted', aggregate_type: 'order_request', attempts: 5, max_attempts: 5, error_details: 'WhatsApp 500: error', updated_at: ago(10) }],
}

test.beforeEach(async ({ page, api }) => {
  await signIn(page, 'owner')
  api.on('GET', '/orders/ops', () => OPS)
  api.on('GET', '/orders/requests', () => ORDERS)
  api.on('GET', /^\/orders\/requests\/[^/]+$/, ({ path }) => detail(orderFor(path)))
})

test('bandeja: contadores de cola, filtros y estado vacío', async ({ page }) => {
  await page.goto('/admin?tab=pedidos')
  await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Por revisar/ })).toContainText('2')
  await expect(page.getByRole('button', { name: /Transferencias por verificar/ })).toContainText('1')
  await expect(page.getByRole('list', { name: 'Lista de pedidos' }).getByRole('listitem')).toHaveCount(3)
  await shot(page, 'lista')

  await page.getByRole('button', { name: /Transferencias por verificar/ }).click()
  await expect(page.getByRole('list', { name: 'Lista de pedidos' }).getByRole('listitem')).toHaveCount(1)
  await expect(page.getByText('Camilo Restrepo Ordóñez')).toBeVisible()

  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await page.locator('#ped-status').click()
  await page.getByRole('option', { name: 'Aceptados' }).click()
  await expect(page.getByText('Ningún pedido coincide con los filtros')).toBeVisible()
})

test('detalle: aceptar contraentrega envía Idempotency-Key y refleja el estado', async ({ page, api }) => {
  api.on('POST', /\/accept$/, () => detail(ORDERS[0], {
    status: 'accepted',
    timeline: [
      { at: ORDERS[0].created_at, action: 'created', actor: 'customer' },
      { at: new Date().toISOString(), action: 'accept', actor: { id: 'o1', name: 'Laura Perez', role: 'owner' }, from: 'submitted', to: 'accepted' },
    ],
  }))
  await page.goto('/admin?tab=pedidos')
  await page.getByRole('button', { name: /Ana Pérez/ }).click()
  const dialog = page.getByRole('dialog', { name: /Pedido #A1B2C3D4/ })
  await expect(dialog.getByText('Volcán mágico')).toBeVisible()
  await expect(dialog.getByText('Calle 45 # 12-30')).toBeVisible()
  await shot(page, 'detalle')

  await dialog.getByRole('button', { name: 'Aceptar pedido' }).click()
  await expect(dialog.getByText('Pedido aceptado').first()).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Aceptar pedido' })).toHaveCount(0)
  await expect(dialog.getByText('Laura Perez (Superadministrador)')).toBeVisible()
  const [call] = api.calls('POST', /\/accept$/)
  expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
})

test('detalle: transferencia sin verificar bloquea aceptar hasta verificarla', async ({ page, api }) => {
  const verifiedPayment = { ...ORDERS[1].payment, id: 'pay1', status: 'manually_verified', reference: 'NEQ-77', proof_url: null }
  let verified = false
  api.on('GET', /^\/orders\/requests\/[^/]+$/, ({ path }) => detail(orderFor(path), verified ? { payment: verifiedPayment } : {}))
  api.on('POST', /payment-verifications$/, () => { verified = true; return detail(ORDERS[1], { payment: verifiedPayment }) })
  await page.goto('/admin?tab=pedidos')
  await page.getByRole('button', { name: /Camilo/ }).click()
  const dialog = page.getByRole('dialog', { name: /Pedido #A1B2C3D4/ })
  await expect(dialog.getByRole('status')).toContainText('Verifica la transferencia')
  await expect(dialog.getByRole('button', { name: 'Aceptar pedido' })).toBeDisabled()
  await shot(page, 'transferencia')

  await dialog.getByRole('button', { name: 'Verificar transferencia' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Verificar esta transferencia?' })
  await confirm.getByLabel(/Referencia/).fill('NEQ-77')
  await confirm.getByRole('button', { name: 'Verificar transferencia' }).click()
  await expect(dialog.getByRole('button', { name: 'Aceptar pedido' })).toBeEnabled()
  expect(api.calls('POST', /payment-verifications$/)[0].body).toEqual({ action: 'verify', reference: 'NEQ-77' })
})

test('detalle: rechazar exige motivo; un 409 muestra el aviso del servidor', async ({ page, api }) => {
  api.on('POST', /\/reject$/, () => fail(409, 'No se puede pasar de accepted a rejected'))
  await page.goto('/admin?tab=pedidos')
  await page.getByRole('button', { name: /Ana Pérez/ }).click()
  const dialog = page.getByRole('dialog', { name: /Pedido #A1B2C3D4/ })
  await dialog.getByRole('button', { name: 'Rechazar pedido' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Rechazar este pedido?' })
  await confirm.getByRole('button', { name: 'Rechazar pedido' }).click()
  await expect(confirm.getByText('Escribe el motivo del rechazo')).toBeVisible()
  expect(api.calls('POST', /\/reject$/)).toHaveLength(0)
  await confirm.getByLabel('Motivo del rechazo').fill('Fuera de zona')
  await confirm.getByRole('button', { name: 'Rechazar pedido' }).click()
  await expect(dialog.getByRole('alert').first()).toContainText('No se puede pasar de accepted a rejected')
  expect(api.calls('POST', /\/reject$/)[0].body).toEqual({ reason: 'Fuera de zona' })
})

test('configuración: edita y guarda por sede', async ({ page, api }) => {
  let settings = {
    location_id: 'l1', location_name: 'Local Principal', configured: true, enabled: false, public_slug: null, currency: 'COP',
    quote_ttl_minutes: 15, payment_methods: ['cash_on_delivery'], accept_policy: 'require_verified', business_hours: {}, transfer_details: {},
    zones_count: 1, delivery_fee: 5000,
  }
  api.on('GET', '/orders/settings', () => settings)
  api.on('PUT', '/orders/settings', ({ body }) => { settings = { ...settings, ...body }; return settings })
  await page.goto('/admin?tab=pedidos-config')
  await expect(page.getByRole('heading', { name: 'Configuración de pedidos' })).toBeVisible()
  const save = page.getByRole('button', { name: 'Guardar cambios' })
  await expect(save).toBeDisabled()
  await shot(page, 'config')

  await page.getByLabel('Recibir pedidos en línea').check()
  await page.getByLabel('Identificador del enlace público').fill('Mi-Negocio')
  await page.getByLabel('Transferencia bancaria').check()
  await page.getByLabel('Instrucciones para transferir').fill('Bancolombia ahorros 123')
  await page.getByLabel('Aceptar pedidos con transferencia pendiente').check()
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('Configuración guardada')).toBeVisible()
  const [put] = api.calls('PUT', '/orders/settings')
  expect(put.query.location_id).toBeTruthy()
  expect(put.body).toMatchObject({
    enabled: true, public_slug: 'mi-negocio', payment_methods: ['cash_on_delivery', 'transfer'],
    accept_policy: 'allow_pending_transfer', delivery_fee: 5000,
  })
  await expect(save).toBeDisabled()
})

test('las pestañas de pedidos aparecen en la navegación del owner', async ({ page }) => {
  await page.goto('/admin?tab=resumen')
  await expect(page.getByRole('button', { name: 'Pedidos', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Config. pedidos' })).toBeVisible()
})

test('operación: métricas del piloto, salud del outbox y reintento de una notificación fallida', async ({ page, api }) => {
  api.on('POST', new RegExp('/orders/ops/outbox/[^/]+/retry$'), () => ({ id: 'ob1', status: 'pending' }))
  api.on('GET', '/orders/settings', () => ({ location_id: 'l1', location_name: 'Local Principal', configured: true, enabled: true, public_slug: 'x-negocio', currency: 'COP',
    quote_ttl_minutes: 15, payment_methods: ['cash_on_delivery'], accept_policy: 'require_verified', business_hours: {}, transfer_details: {}, zones_count: 1, delivery_fee: 5000 }))
  await page.goto('/admin?tab=pedidos-config')
  const ops = page.getByRole('region', { name: /Operación y soporte/ })
  await expect(ops.getByText('Pedidos recibidos')).toBeVisible()
  await expect(ops.locator('dd', { hasText: '8 / 2' })).toBeVisible()
  await expect(ops.getByText('Hay notificaciones esperando hace más de 15 minutos')).toBeVisible()
  await expect(ops.getByText('Aviso: pedido aceptado')).toBeVisible()
  await expect(ops.getByText('WhatsApp 500: error')).toBeVisible()
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/operacion-${page.viewportSize().width}.png`, fullPage: true })
  await ops.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByText('Se reintentará en el próximo ciclo del worker')).toBeVisible()
  expect(api.calls('POST', /retry$/)).toHaveLength(1)
})
