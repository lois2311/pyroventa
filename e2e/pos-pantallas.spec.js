import { test, expect, signIn, PRODUCTS } from './fixtures.js'

// Equipos de caja (Digital POS): de 12,1" (1024×768, 4:3) a 18,5" (1366×768
// y 1280×1024). Ninguna vista desborda y el menú superior cabe completo,
// con "Salir" visible incluso para el superadministrador (nombre más largo).
const POS_SCREENS = [
  { name: '12,1" 1024×768', width: 1024, height: 768 },
  { name: '15" 1280×800', width: 1280, height: 800 },
  { name: '15,6"/18,5" 1366×768', width: 1366, height: 768 },
  { name: '17" 1280×1024', width: 1280, height: 1024 },
]
const VIEWS = [
  { name: 'vender', path: '/vender', role: 'seller' },
  { name: 'caja', path: '/caja', role: 'cashier' },
  { name: 'admin', path: '/admin', role: 'owner' },
  { name: 'productos', path: '/admin?tab=productos', role: 'owner' },
  { name: 'historial', path: '/admin?tab=historial', role: 'owner' },
]

for (const screen of POS_SCREENS) {
  for (const view of VIEWS) {
    test(`${view.name} cabe en ${screen.name}`, async ({ page }) => {
      await signIn(page, view.role)
      await page.setViewportSize({ width: screen.width, height: screen.height })
      await page.goto(view.path)
      await page.waitForLoadState('networkidle')

      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(scroll).toBeLessThanOrEqual(client)

      // Menú superior completo: "Cerrar sesión" dentro de la pantalla
      const salir = page.getByRole('button', { name: /Salir|Cerrar sesión/ }).first()
      const box = await salir.boundingBox()
      expect(box.x + box.width).toBeLessThanOrEqual(screen.width)
    })
  }
}

// ---- Fotos de productos ---------------------------------------------------
// PNG de 8×8 (válido); lo que sirve el bucket público de Supabase Storage.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGM4gQMwDC0JAJwulgGh6TLjAAAAAElFTkSuQmCC', 'base64')
const BASE = 'https://proyecto.supabase.co/storage/v1/object/public/product-images/t1'

const withPhotos = PRODUCTS.map(p => ({
  ...p,
  image_url: p.id === 'p1' ? `${BASE}/ok.png` : p.id === 'p2' ? `${BASE}/rota.png` : null,
}))

test.describe('fotos de productos', () => {
  test.beforeEach(async ({ page, api }) => {
    api.on('GET', '/products', () => withPhotos)
    await page.route(/product-images\/t1\/ok\.png/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
    await page.route(/product-images\/t1\/rota\.png/, r => r.fulfill({ status: 404, body: 'Not found' }))
  })

  const loaded = (locator) => locator.evaluate(img => img.complete && img.naturalWidth > 0)

  test('Vender: la foto carga y la rota cae al ícono, sin imagen rota', async ({ page }) => {
    await signIn(page, 'seller')
    await page.goto('/vender')

    const ok = page.locator('.card', { hasText: 'Volcán mágico' }).getByRole('img', { name: 'Volcán mágico' })
    await expect(ok).toBeVisible()
    await expect.poll(() => loaded(ok)).toBe(true)

    // 404: ProductImage vuelve al ícono (no queda <img> roto en la tarjeta)
    await expect(page.locator('.card', { hasText: 'Bengala dorada x10' }).locator('img')).toHaveCount(0)
  })

  test('Administración › Productos: miniatura y respaldo', async ({ page }) => {
    await signIn(page, 'owner')
    await page.goto('/admin?tab=productos')

    const row = (name) => page.locator('main li', { hasText: name }).first()
    const thumb = row('Volcán mágico').locator('img')
    await expect(thumb).toBeVisible()
    await expect.poll(() => loaded(thumb)).toBe(true)

    // La foto que no carga se reemplaza por el ícono de la categoría
    await expect(row('Bengala dorada x10').locator('img')).toHaveCount(0)
    await expect(row('Bengala dorada x10')).toContainText('✨')
  })

  test('Vender: tocar la foto la amplía y Escape la cierra', async ({ page }) => {
    await signIn(page, 'seller')
    await page.goto('/vender')
    await page.getByRole('button', { name: 'Ampliar foto de Volcán mágico' }).click()
    await expect(page.getByRole('dialog', { name: 'Foto de Volcán mágico' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Foto de Volcán mágico' })).toHaveCount(0)
  })
})
