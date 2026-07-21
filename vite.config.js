import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cachear todos los assets estáticos
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache de navegación (SPA)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Runtime caching para APIs
        runtimeCaching: [
          {
            // Google Fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
            urlPattern: /\/api\/products/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-products',
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
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
