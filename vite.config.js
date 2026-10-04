import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate': el service worker nuevo se activa apenas se instala
      // (también en los equipos que tienen la versión anterior). Cuándo
      // recarga cada pantalla lo decide src/lib/appUpdate.js, que además
      // busca versiones nuevas cada minuto y registra el SW con
      // workbox-window (por eso no se inyecta el script del plugin).
      registerType: 'autoUpdate',
      injectRegister: false,
      workbox: {
        // Activación inmediata en todos los equipos (ver src/lib/appUpdate.js)
        skipWaiting: true,
        clientsClaim: true,
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
            // API de productos — red primero, cache sin conexión. Antes era
            // stale-while-revalidate: cada consulta devolvía la respuesta
            // anterior y el catálogo en vivo (useCatalogRefresh) llegaba una
            // vuelta tarde. La primera pintura sigue siendo instantánea por el
            // cache de localStorage de la pantalla de Vender.
            urlPattern: /\/api\/products/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-products-v3',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }, // 24 h sin conexión
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
      // Manifest único de la PWA (public/manifest.json se eliminó: apuntaba a
      // PNG inexistentes). Íconos SVG de vendra-brand-kit, sin radio: el
      // sistema aplica la máscara.
      manifest: {
        name: 'VENDRA POS',
        short_name: 'VENDRA',
        description: 'Punto de venta para cualquier negocio. By flightdev.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0A1428', // Noche
        theme_color: '#0A1428',
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
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
