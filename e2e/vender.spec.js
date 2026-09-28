import { test, expect, signIn } from './fixtures.js'

test.beforeEach(async ({ page }) => {
  await signIn(page, 'seller')
})

const card = (page, name) => page.locator('.card', { hasText: name })

test('agotados bloqueados, tope de stock y factura generada', async ({ page, api }) => {
  api.on('POST', '/invoices', ({ body }) => ({
    id: 'i9', code: '4830', status: 'pending', total: body.total, items: body.items, created_at: new Date().toISOString(),
  }))
  await page.goto('/vender')

  // Stock 0: no se puede agregar
  await expect(card(page, 'Cohete silbador').getByRole('button', { name: /Unidad/ })).toBeDisabled()

  // Stock 2: la tercera unidad no entra (el tope suma todas las presentaciones)
  const bengala = card(page, 'Bengala dorada x10')
  await bengala.getByRole('button', { name: /Unidad/ }).click()
  await bengala.getByRole('button', { name: /Paquete x12/ }).click()
  await bengala.getByRole('button', { name: /Unidad/ }).click({ force: true }) // aria-disabled: avisa por qué
  await expect(page.getByText('Solo hay 2 de Bengala dorada x10 y ya están en el carrito')).toBeVisible()

  await card(page, 'Volcán mágico').getByRole('button', { name: /Unidad/ }).click()

  const cart = page.getByRole('complementary', { name: 'Carrito' })
  await cart.getByRole('button', { name: /Generar Factura/ }).click()

  await expect(page.getByText('¡Factura creada!')).toBeVisible()
  const [sent] = api.calls('POST', '/invoices')
  expect(sent.body.items.map(i => [i.presentationId, i.qty])).toEqual([['p2-u', 1], ['p2-x12', 1], ['p1-u', 1]])
  expect(sent.body.total).toBe(4500 + 39000 + 3000)
  expect(sent.body.client_op_id).toBeTruthy()
})

test('"/" enfoca el buscador y filtra', async ({ page }) => {
  await page.goto('/vender')
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox', { name: 'Buscar producto' })).toBeFocused()
  await page.keyboard.type('volc')
  await expect(page.locator('.card h3')).toHaveText(['Volcán mágico'])
})

test('si el catálogo no carga (sin caché) se ve el error con reintento', async ({ page, api }) => {
  let fails = true
  api.on('GET', '/products', () => (fails ? { __status: 500, body: { error: 'Error interno' } } : undefined))
  await page.goto('/vender')
  await expect(page.getByText('No se pudo cargar el catálogo')).toBeVisible({ timeout: 15_000 })
  fails = false
  api.on('GET', '/products', () => [{ id: 'p1', name: 'Volcán mágico', stock_quantity: 5, presentations: [{ id: 'p1-u', label: 'Unidad', price: 3000 }] }])
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(card(page, 'Volcán mágico')).toBeVisible()
})
