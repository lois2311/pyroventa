import { test, expect, fail, LOCATIONS, TENANT } from './fixtures.js'

test.beforeEach(async ({ page, api }) => {
  api.on('GET', /^\/public\/tenant\//, () => ({ tenant: TENANT, locations: LOCATIONS }))
  await page.addInitScript(() => localStorage.setItem('pv_tenant_slug', 'la-chispa'))
})

const enterPin = async (page, pin) => {
  for (const d of pin) await page.getByRole('button', { name: d, exact: true }).click()
}

test('vendedor: punto de venta → PIN → Vender', async ({ page, api }) => {
  api.on('POST', '/auth/login', ({ body }) => (body.pin === '1234'
    ? { seller: { id: 's1', name: 'Carlos Rodríguez', role: 'seller' }, location: LOCATIONS[0], tenant: TENANT, token: 'tok' }
    : fail(401, 'PIN incorrecto')))

  await page.goto('/login')
  await page.getByRole('button', { name: /Local Principal/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await enterPin(page, '1234')

  await expect(page).toHaveURL(/\/vender$/)
  await expect(page.getByRole('searchbox', { name: 'Buscar producto' })).toBeVisible()
  expect(api.calls('POST', '/auth/login')[0].body).toMatchObject({ pin: '1234', location_id: 'l1', tenant_slug: 'la-chispa' })
})

test('PIN incorrecto: un solo intento contra el servidor y aviso visible', async ({ page, api }) => {
  // Antes los 4xx se reintentaban 3 veces: un PIN mal escrito gastaba 3 de
  // los 5 intentos del bloqueo por IP.
  api.on('POST', '/auth/login', () => fail(401, 'PIN incorrecto'))

  await page.goto('/login')
  await page.getByRole('button', { name: /Local Principal/ }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await enterPin(page, '9999')

  await expect(page.getByText('PIN incorrecto')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  expect(api.calls('POST', '/auth/login')).toHaveLength(1)
})
