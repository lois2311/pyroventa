import { test, expect, signIn, PENDING } from './fixtures.js'

test.beforeEach(async ({ page }) => {
  await signIn(page, 'cashier')
})

const payPanel = (page) => page.getByRole('complementary', { name: 'Cobro' })

test('cobro con teclado: 1 = efectivo, Enter cobra y el foco vuelve al código', async ({ page, api }) => {
  api.on('POST', '/invoices/4821/pay', ({ body }) => ({ ...PENDING[0], status: 'paid', pay_method: body.pay_method, register_name: 'Caja 1' }))
  await page.goto('/caja')
  await page.getByRole('button', { name: /4821/ }).first().click()

  await page.locator('body').click({ position: { x: 5, y: 700 } }) // foco fuera de campos
  await page.keyboard.press('1')
  await expect(payPanel(page).getByRole('button', { name: /Efectivo/ })).toHaveAttribute('aria-pressed', 'true')

  // Monto rápido y cambio a devolver
  await payPanel(page).getByRole('button', { name: '$50.000' }).click()
  await expect(payPanel(page).getByText('Cambio a devolver')).toBeVisible()
  await expect(payPanel(page).getByText('$5.000')).toBeVisible()

  // Enter desde el campo de efectivo cobra
  await payPanel(page).getByLabel('¿Con cuánto paga el cliente? (opcional)').press('Enter')
  await expect(page.getByRole('dialog', { name: '¡Cobrado!' })).toBeVisible()
  expect(api.calls('POST', '/invoices/4821/pay')).toHaveLength(1)
  expect(api.calls('POST', '/invoices/4821/pay')[0].body).toMatchObject({ pay_method: 'cash', location_id: 'l1', register_id: 'r1' })

  // Enter continúa (no reimprime) y el foco queda listo para la siguiente factura
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '¡Cobrado!' })).toBeHidden()
  await expect(page.locator('[data-code-input]:visible')).toBeFocused()
})

test('transferencia exige proveedor: 2 y luego N', async ({ page }) => {
  await page.goto('/caja')
  await page.getByRole('button', { name: /4821/ }).first().click()
  await page.locator('body').click({ position: { x: 5, y: 700 } })
  await page.keyboard.press('2')
  await expect(payPanel(page).getByRole('button', { name: 'Elige Nequi, Daviplata o Bancolombia' })).toBeDisabled()
  await page.keyboard.press('n')
  await expect(payPanel(page).getByRole('button', { name: /Nequi/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(payPanel(page).getByRole('button', { name: /Cobrar \$45\.000/ })).toBeEnabled()
})

test('cancelar una factura pide confirmación', async ({ page, api }) => {
  await page.goto('/caja')
  await page.getByRole('button', { name: /4821/ }).first().click()
  await page.getByRole('button', { name: 'Cancelar venta' }).click()

  const dialog = page.getByRole('dialog', { name: '¿Cancelar la venta #4821?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Volver' }).click()
  await expect(dialog).toBeHidden()
  expect(api.calls('POST', '/invoices/4821/cancel')).toHaveLength(0)

  await page.getByRole('button', { name: 'Cancelar venta' }).click()
  await dialog.getByRole('button', { name: 'Cancelar venta' }).click()
  await expect(page.getByText('Venta #4821 cancelada.')).toBeVisible()
  expect(api.calls('POST', '/invoices/4821/cancel')).toHaveLength(1)
})
