import { defineConfig, devices } from '@playwright/test'

// Pruebas E2E del frontend con la API simulada (e2e/fixtures.js): no hace
// falta backend ni Supabase. Corren contra el build de producción servido
// con `vite preview`, que es lo que se despliega (chunks diferidos incluidos).
const PORT = Number(process.env.E2E_PORT || 4173)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // El service worker de la PWA interceptaría /api antes que page.route
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
