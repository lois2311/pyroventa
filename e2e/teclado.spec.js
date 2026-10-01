import { test, expect, signIn } from './fixtures.js'

// Flujos completos sin mouse: escáner y ticket en Vender, código → cobro en Caja.

test.describe('Vender con teclado', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'seller')
    await page.goto('/vender')
  })

  const cart = (page) => page.getByRole('complementary', { name: 'Carrito' })
  const scanner = (page) => page.getByRole('searchbox', { name: 'Buscar producto' })

  test('Enter agrega la única coincidencia; + − Supr controlan la línea activa', async ({ page }) => {
    await scanner(page).fill('volc')
    await expect(page.getByText('agrega Volcán mágico')).toBeVisible()
    await scanner(page).press('Enter')
    await expect(scanner(page)).toHaveValue('')
    await expect(scanner(page)).toBeFocused()
    await expect(cart(page).getByText('Volcán mágico')).toBeVisible()
    await expect(cart(page).locator('[aria-current="true"]')).toContainText('$3.000')

    await page.keyboard.press('+')
    await expect(cart(page).locator('[aria-current="true"]')).toContainText('$6.000')
    await page.keyboard.press('-')
    await expect(cart(page).locator('[aria-current="true"]')).toContainText('$3.000')
    await page.keyboard.press('Delete')
    await expect(cart(page).getByText('Listo para vender.')).toBeVisible()
  })

  test('F8 pausa la venta y la retoma con sus productos', async ({ page }) => {
    await scanner(page).fill('volcán mágico')
    await scanner(page).press('Enter')
    await page.keyboard.press('+')
    await expect(cart(page).locator('[aria-current="true"]')).toContainText('$6.000')

    await page.keyboard.press('F8')
    await expect(cart(page).getByText('Listo para vender.')).toBeVisible()
    const parked = page.getByRole('group', { name: 'Ventas en pausa' })
    await expect(parked.getByRole('button', { name: /\$6\.000/ })).toBeVisible()

    await page.keyboard.press('F8')
    await expect(cart(page).locator('[aria-current="true"]')).toContainText('$6.000')
    await expect(parked).toBeHidden()
  })

  test('"?" abre la hoja de atajos', async ({ page }) => {
    await page.locator('body').click({ position: { x: 5, y: 400 } })
    await page.keyboard.press('?')
    const help = page.getByRole('dialog', { name: 'Atajos de teclado' })
    await expect(help).toBeVisible()
    await expect(help.getByText('Pausar la venta / retomar la última')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(help).toBeHidden()
  })
})

test.describe('Caja con teclado', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'cashier')
    await page.goto('/caja')
    await expect(page.locator('[data-code-input]:visible')).toBeFocused()
  })

  const payPanel = (page) => page.getByRole('complementary', { name: 'Cobro' })

  test('código → 1 → monto → Enter, sin tocar el mouse', async ({ page, api }) => {
    api.on('POST', '/invoices/4821/pay', ({ body }) => ({ id: 'i4821', code: '4821', status: 'paid', total: 45000, pay_method: body.pay_method }))
    const code = page.locator('[data-code-input]:visible')
    await page.keyboard.type('4821') // busca solo al 4.º dígito

    await expect(payPanel(page).getByText('Total a cobrar')).toBeVisible()
    await page.keyboard.press('1') // el foco ya salió del código
    await expect(payPanel(page).getByRole('button', { name: /Efectivo/ })).toHaveAttribute('aria-pressed', 'true')
    const cash = payPanel(page).getByLabel('¿Con cuánto paga el cliente? (opcional)')
    await expect(cash).toBeFocused()
    await page.keyboard.type('50000')
    await expect(payPanel(page).getByText('Cambio a devolver')).toBeVisible()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('dialog', { name: '¡Cobrado!' })).toBeVisible()
    expect(api.calls('POST', '/invoices/4821/pay')[0].body).toMatchObject({ pay_method: 'cash' })
    await page.keyboard.press('Enter')
    await expect(code).toBeFocused()
  })

  test('código inexistente: aviso junto al campo, sin toast repetido', async ({ page }) => {
    await page.keyboard.type('9999')
    await expect(page.getByRole('alert').filter({ hasText: 'Sin factura pendiente con el código' }).first()).toBeVisible()
    await expect(page.getByText('Factura no encontrada')).toHaveCount(0)
  })

  test('F7 enfoca cliente/observaciones; Esc sale del campo y otro Esc pide cancelar', async ({ page }) => {
    await page.keyboard.type('4821')
    await expect(payPanel(page).getByText('Total a cobrar')).toBeVisible()
    await page.keyboard.press('F7')
    await expect(payPanel(page).getByLabel(/Cliente u observaciones/)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(payPanel(page).getByLabel(/Cliente u observaciones/)).not.toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '¿Cancelar la venta #4821?' })).toBeVisible()
  })
})
