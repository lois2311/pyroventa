import { test, expect, signIn } from './fixtures.js'

test.beforeEach(async ({ page }) => {
  await signIn(page, 'owner')
})

const names = (page) => page.locator('main li p.font-medium')

test('buscar sin tildes, filtrar por categoría y stock, y conservar filtros al recargar', async ({ page }) => {
  await page.goto('/admin?tab=productos')
  await expect(names(page)).toHaveCount(3)

  // "volcan" encuentra "Volcán mágico" (nombre) y "Cohete silbador" (categoría Volcanes)
  await page.getByRole('heading', { name: 'Productos' }).click() // foco fuera de campos
  await page.keyboard.press('/')
  await expect(page.getByLabel('Buscar', { exact: true })).toBeFocused()
  await page.keyboard.type('volcan')
  await expect(page.getByText('Mostrando 2 de 3 productos')).toBeVisible()
  await expect(names(page)).toHaveText(['Cohete silbador', 'Volcán mágico'])

  // + categoría sin coincidencias → estado vacío con salida
  await page.getByLabel('Categoría').selectOption({ label: '✨ Luces de bengala (1)' })
  await expect(page.getByText('Ningún producto coincide con "volcan"')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).first().click()
  await expect(names(page)).toHaveCount(3)
  await expect(page.getByLabel('Buscar', { exact: true })).toHaveValue('')

  // Agotados, y la URL lo recuerda
  await page.getByRole('button', { name: /^Agotados/ }).click()
  await expect(names(page)).toHaveText(['Cohete silbador'])
  await expect(page).toHaveURL(/stock=out/)
  await page.reload()
  await expect(names(page)).toHaveText(['Cohete silbador'])
  await expect(page.getByRole('button', { name: /^Agotados/ })).toHaveAttribute('aria-pressed', 'true')
})

test('orden por precio y vista de lista', async ({ page }) => {
  await page.goto('/admin?tab=productos')
  await page.getByLabel('Ordenar por').selectOption('price-desc')
  await expect(names(page)).toHaveText(['Bengala dorada x10', 'Cohete silbador', 'Volcán mágico'])

  await page.getByRole('button', { name: 'Vista en lista' }).click()
  await expect(page.getByRole('button', { name: 'Vista en lista' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Editar Volcán mágico' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Vista en lista' })).toHaveAttribute('aria-pressed', 'true')
})
