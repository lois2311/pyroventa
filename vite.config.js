import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cachear todos los assets estáticos…
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // …menos las librerías pesadas de funciones de administración que no
        // hacen falta para vender ni cobrar: xlsx (exportar/importar Excel) y
        // las dependencias opcionales de jsPDF (html2canvas, canvg, DOMPurify).
        // Eran ~0,8 MB de los 2,3 MB que cada equipo descargaba al instalar.
        // Se cachean al primer uso (regla LAZY_CHUNKS abajo).
        globIgnores: ['**/assets/{xlsx,html2canvas,purify,index.es}*.js'],
        // Cache de navegación (SPA)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime caching para APIs
        runtimeCaching: [
          {
            // LAZY_CHUNKS: los chunks excluidos del precache. Nombre con hash
            // de contenido → inmutables, CacheFirst es seguro. (La función se
            // copia al service worker, donde `self` es el propio worker.)
            // eslint-disable-next-line no-undef
            urlPattern: ({ url }) => url.origin === self.location.origin
              && /^\/assets\/(xlsx|html2canvas|purify|index\.es)[^/]*\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-chunks',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            // Fotos de productos (Supabase Storage) — inmutables (nombre UUID)
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/product-images\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'product-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 días
              // status 0 = respuesta opaca (img sin CORS) — sin esto no se cachearía nada
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // API de productos — stale-while-revalidate
            // (subir la versión fuerza un refetch en todos los equipos tras el
            //  deploy; v3 = tras la purga de productos y sus fotos)
            urlPattern: /\/api\/products/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-products-v3',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 4 }, // 4 horas
            },
          },
          {
            // API de locations y registers — stale-while-revalidate
            urlPattern: /\/api\/(locations|registers)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-config',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 4 },
            },
          },
          {
            // Demás APIs — network first, fallback cache
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-dynamic',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }, // 5 min
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      manifest: {
        name: 'PyroVenta',
        short_name: 'PyroVenta',
        description: 'Sistema de control de ventas pirotécnico',
        start_url: '/login',
        display: 'standalone',
        orientation: 'any',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    // e2e/ es de Playwright (npm run test:e2e), no de Vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      // App.jsx importa api/_lib/roles.js directo (mismo código en front y
      // serverless functions); esa URL colisiona con este proxy y rompe el
      // arranque en dev puro (sin `vercel dev`) — se excluye para que Vite
      // lo sirva como el módulo local que es.
      '^/api/(?!_lib/)': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
