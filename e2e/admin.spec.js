import { test, expect, signIn } from './fixtures.js'

test.beforeEach(async ({ page }) => {
  await signIn(page, 'owner')
})

test('la pestaña vive en la URL y el gráfico cambia de vista', async ({ page }) => {
  await page.goto('/admin?tab=historial')
  await expect(page.getByRole('heading', { name: 'Historial de facturas' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Historial' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Resumen' }).first().click()
  await expect(page).toHaveURL(/tab=resumen/)
  await page.getByRole('button', { name: '7 días', exact: true }).first().click()
  const porMetodo = page.getByRole('button', { name: 'Por método', exact: true })
  await porMetodo.click()
  await expect(porMetodo).toHaveAttribute('aria-pressed', 'true')
})

test('devolución: el motivo es obligatorio y se envía al servidor', async ({ page, api }) => {
  api.on('POST', /^\/invoices\/[^/]+\/refund$/, () => ({ ok: true }))
  await page.goto('/admin?tab=historial')
  await page.getByRole('button', { name: /#4801/ }).click()
  await page.getByRole('button', { name: 'Registrar devolución' }).click()

  const dialog = page.getByRole('dialog', { name: 'Devolución de la factura #4801' })
  await dialog.getByRole('button', { name: 'Registrar devolución' }).click()
  await expect(dialog.getByText('Escribe el motivo: queda en el historial de la factura')).toBeVisible()
  expect(api.calls('POST', /refund$/)).toHaveLength(0)

  await dialog.getByLabel('Motivo de la devolución').fill('Producto defectuoso')
  await dialog.getByRole('button', { name: 'Registrar devolución' }).click()
  await expect(dialog).toBeHidden()
  expect(api.calls('POST', /refund$/)[0].body).toEqual({ reason: 'Producto defectuoso' })
})

test('formulario de producto: validación junto al campo y foco en el primer error', async ({ page }) => {
  await page.goto('/admin?tab=productos')
  await page.getByRole('button', { name: 'Nuevo producto' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' })
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog.getByText('El nombre es requerido')).toBeVisible()
  await expect(dialog.getByLabel('Nombre')).toBeFocused()
  await expect(dialog.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true')
})
