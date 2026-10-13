import { test, expect, fail } from './fixtures.js'

// Vendra Pedidos: formulario público (/pedir/:slug) y estado del pedido por token. Sin sesión.
const SHOTS = process.env.SHOTS_DIR
test.use({ viewport: { width: Number(process.env.E2E_W || 390), height: 800 } })
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png`, fullPage: true })

const CATALOG = {
  business: { name: 'Pirotecnia La Chispa', currency: 'COP', payment_methods: ['cash_on_delivery', 'transfer'], transfer_instructions: 'Bancolombia ahorros 123-456\nEnvía el comprobante por WhatsApp' },
  delivery_zones: [{ id: 'z1', name: 'Centro', fee: 5000 }],
  products: [
    { id: 'pr1', name: 'Volcán mágico', description: 'Efecto de chispas doradas', image_url: null, category: { id: 'c1', name: 'Volcanes' }, presentations: [{ id: 'p1', label: 'Unidad', price: 10000 }] },
    { id: 'pr2', name: 'Bengala dorada x10', description: null, image_url: null, category: { id: 'c2', name: 'Luces de bengala' },
      presentations: [{ id: 'p2', label: 'Unidad', price: 4500 }, { id: 'p3', label: 'Paquete x12', price: 39000 }] },
  ],
}
const TOKEN = 'a'.repeat(64)
const quoteFor = (items) => {
  const price = { p1: 10000, p2: 4500, p3: 39000 }
  const names = { p1: ['Volcán mágico', 'Unidad'], p2: ['Bengala dorada x10', 'Unidad'], p3: ['Bengala dorada x10', 'Paquete x12'] }
  const rows = items.map(i => ({ presentation_id: i.presentation_id, product_name: names[i.presentation_id][0], label: names[i.presentation_id][1], quantity: i.quantity, unit_price: price[i.presentation_id], subtotal: price[i.presentation_id] * i.quantity }))
  const subtotal = rows.reduce((s, r) => s + r.subtotal, 0)
  return { currency: 'COP', items: rows, subtotal, delivery_fee: 5000, total: subtotal + 5000, quoted_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60000).toISOString() }
}

test.beforeEach(async ({ page, api }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-cleared')) { sessionStorage.clear(); sessionStorage.setItem('e2e-cleared', '1') } })
  api.on('GET', '/public/orders/piloto/catalog', () => CATALOG)
  api.on('POST', '/public/orders/piloto/quote', ({ body }) => quoteFor(body.items))
})

const addToCart = async (page) => {
  await page.getByRole('button', { name: 'Agregar uno de Volcán mágico Unidad' }).click({ clickCount: 2 })
  await page.getByRole('button', { name: 'Agregar uno de Bengala dorada x10 Paquete x12' }).click()
}

test('catálogo, carrito y barra de pedido con el subtotal estimado', async ({ page }) => {
  await page.goto('/pedir/piloto')
  await expect(page.getByRole('heading', { name: 'Pirotecnia La Chispa' })).toBeVisible()
  await expect(page.getByText('Efecto de chispas doradas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveCount(0)
  await addToCart(page)
  await expect(page.getByText('3', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
  await expect(page.getByText(/Subtotal\s*\$59\.000/)).toBeVisible()
  await shot(page, 'pedir-catalogo')
})

test('pedido completo: cotización del servidor, datos, envío con Idempotency-Key y confirmación', async ({ page, api }) => {
  api.on('POST', '/public/orders/piloto/requests', ({ body }) => ({
    public_token: TOKEN, status: 'submitted', total: body.expected_total, payment: { method: body.payment_method, status: 'pending' },
  }))
  await page.goto('/pedir/piloto')
  await addToCart(page)
  await page.getByRole('button', { name: 'Continuar' }).click()

  const resumen = page.getByRole('region', { name: 'Resumen del pedido' })
  await expect(resumen.getByText('$64.000')).toBeVisible() // 2×10.000 + 39.000 + 5.000 de domicilio
  const send = page.getByRole('button', { name: /Enviar pedido/ })
  await expect(send).toBeDisabled()

  await page.getByLabel('Dirección').fill('Calle 45 # 12-30')
  await page.getByLabel('Nombre').fill('Ana Pérez')
  await page.getByLabel('Celular').fill('300 123 4567')
  await page.getByLabel('Transferencia bancaria').check()
  await expect(page.getByText('Bancolombia ahorros 123-456')).toBeVisible()
  await expect(send).toBeDisabled() // falta el consentimiento
  await page.getByLabel(/Autorizo el tratamiento/).check()
  await expect(send).toBeEnabled()
  await shot(page, 'pedir-checkout')

  await send.click()
  await expect(page.getByRole('heading', { name: '¡Recibimos tu pedido!' })).toBeVisible()
  await expect(page.getByText('Falta tu transferencia')).toBeVisible()
  const [call] = api.calls('POST', '/public/orders/piloto/requests')
  expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(call.body).toMatchObject({
    expected_total: 64000, fulfillment: 'delivery', payment_method: 'transfer', consent: true,
    customer: { name: 'Ana Pérez', phone: '300 123 4567' }, address: { address: 'Calle 45 # 12-30' },
    items: [{ presentation_id: 'p1', quantity: 2 }, { presentation_id: 'p3', quantity: 1 }],
  })
  expect(JSON.stringify(call.body)).not.toMatch(/price|unit_price|subtotal/) // el cliente nunca envía precios
  await shot(page, 'pedir-confirmacion')
  await expect(page.getByRole('link', { name: 'Ver el estado de mi pedido' })).toHaveAttribute('href', `/pedir/piloto/pedido/${TOKEN}`)
})

test('si los precios cambiaron: aviso, cotización nueva y se vuelve a confirmar', async ({ page, api }) => {
  let calls = 0
  api.on('POST', '/public/orders/piloto/requests', () => { calls++; return fail(409, 'Los precios cambiaron. Revisa la nueva cotización') })
  await page.goto('/pedir/piloto')
  await page.getByRole('button', { name: 'Agregar uno de Volcán mágico Unidad' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Dirección').fill('Calle 45 # 12-30')
  await page.getByLabel('Nombre').fill('Ana Pérez')
  await page.getByLabel('Celular').fill('3001234567')
  await page.getByLabel('Contraentrega').check()
  await page.getByLabel(/Autorizo el tratamiento/).check()
  await page.getByRole('button', { name: /Enviar pedido/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Los precios cambiaron' })).toBeVisible()
  await expect(page.getByText('Revisa el total y vuelve a enviar')).toBeVisible()
  expect(calls).toBe(1)
})

test('recoger en tienda no pide dirección ni cobra domicilio', async ({ page, api }) => {
  api.on('POST', '/public/orders/piloto/quote', ({ body }) => ({ ...quoteFor(body.items), delivery_fee: body.fulfillment === 'pickup' ? 0 : 5000, total: 10000 + (body.fulfillment === 'pickup' ? 0 : 5000) }))
  await page.goto('/pedir/piloto')
  await page.getByRole('button', { name: 'Agregar uno de Volcán mágico Unidad' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Recoger en tienda' }).click()
  await expect(page.getByLabel('Dirección')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Resumen del pedido' }).getByText('Recoges en tienda')).toBeVisible()
})

test('el carrito sobrevive a una recarga; negocio sin pedidos en línea muestra su aviso', async ({ page, api }) => {
  await page.goto('/pedir/piloto')
  await page.getByRole('button', { name: 'Agregar uno de Volcán mágico Unidad' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()

  api.on('GET', '/public/orders/cerrado/catalog', () => fail(404, 'Pedidos no disponibles'))
  await page.goto('/pedir/cerrado')
  await expect(page.getByText('Este negocio no recibe pedidos en línea')).toBeVisible()
})

test('estado del pedido por token: aceptado, rechazado con motivo y token desconocido', async ({ page, api }) => {
  const base = { public_token: TOKEN, currency: 'COP', items: [{ product_name: 'Volcán mágico', label: 'Unidad', quantity: 2, unit_price: 10000, subtotal: 20000 }], subtotal: 20000, delivery_fee: 5000, total: 25000, payment: { method: 'cash_on_delivery', status: 'pending' } }
  api.on('GET', new RegExp('^/public/orders/requests/a{64}$'), () => ({ ...base, status: 'accepted' }))
  await page.goto(`/pedir/piloto/pedido/${TOKEN}`)
  await expect(page.getByRole('heading', { name: 'Tu pedido fue aceptado' })).toBeVisible()
  await expect(page.getByText('$25.000')).toBeVisible()
  await shot(page, 'pedir-estado')

  api.on('GET', new RegExp('^/public/orders/requests/b{64}$'), () => ({ ...base, status: 'rejected', reject_reason: 'Fuera de zona de cobertura' }))
  await page.goto(`/pedir/piloto/pedido/${'b'.repeat(64)}`)
  await expect(page.getByRole('heading', { name: 'No pudimos aceptar tu pedido' })).toBeVisible()
  await expect(page.getByText('Motivo: Fuera de zona de cobertura')).toBeVisible()

  api.on('GET', new RegExp('^/public/orders/requests/c{64}$'), () => fail(404, 'Pedidos no disponibles'))
  await page.goto(`/pedir/piloto/pedido/${'c'.repeat(64)}`)
  await expect(page.getByText('No encontramos este pedido')).toBeVisible()
})
