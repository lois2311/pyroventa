import { test, expect, signIn, LOCATIONS, TENANT } from './fixtures.js'

// Ninguna vista desborda en horizontal, del teléfono al monitor ancho y en
// los dos temas (el tema claro no debe mover el layout).
const WIDTHS = [390, 820, 1280, 2000]
const VIEWS = [
  { name: 'login', path: '/login', role: null },
  { name: 'vender', path: '/vender', role: 'seller' },
  { name: 'caja', path: '/caja', role: 'cashier' },
  { name: 'admin', path: '/admin', role: 'owner' },
  { name: 'historial', path: '/admin?tab=historial', role: 'owner' },
]

for (const theme of ['dark', 'light']) {
  for (const view of VIEWS) {
    test(`${view.name} sin desborde horizontal (${theme})`, async ({ page, api }) => {
      api.on('GET', /^\/public\/tenant\//, () => ({ tenant: TENANT, locations: LOCATIONS }))
      if (view.role) await signIn(page, view.role, { theme })
      else await page.addInitScript((t) => { localStorage.setItem('pv_tenant_slug', 'la-chispa'); localStorage.setItem('pv_theme', t) }, theme)

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(view.path)
        await page.waitForLoadState('networkidle')
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }))
        expect(scroll, `${view.name} a ${width}px`).toBeLessThanOrEqual(client)
      }
    })
  }
}
