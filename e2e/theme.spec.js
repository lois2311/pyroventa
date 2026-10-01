import { test, expect, signIn } from './fixtures.js'

test('el tema claro se activa, se nota y se recuerda al recargar', async ({ page }) => {
  await signIn(page, 'seller')
  await page.goto('/vender')
  const html = page.locator('html')
  await expect(html).not.toHaveAttribute('data-theme', 'light')
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  const toggle = page.getByRole('button', { name: 'Tema claro de alto contraste' })
  await toggle.click()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(lightBg).not.toBe(darkBg)

  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#F6F8FB')
})
