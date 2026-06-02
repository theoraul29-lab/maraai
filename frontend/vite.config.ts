import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // we register manually so we can surface the update prompt in the UI
      includeAssets: [
        'favicon.ico',
        'offline.html',
        'push-sw.js',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-192-maskable.png',
        'icons/icon-512-maskable.png',
      ],
      manifestFilename: 'manifest.webmanifest',
      // The static manifest in public/manifest.webmanifest is the source of
      // truth; passing `manifest: false` tells vite-plugin-pwa not to
      // generate its own (would overwrite ours).
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
        // `/push-sw.js` ships a Web Push + `notificationclick` handler that
        // Workbox's generateSW strategy does not produce on its own. Pulling
        // it in via importScripts keeps us on generateSW (so we don't have
        // to hand-own the whole service worker) while still owning the
        // push-specific event wiring.
        importScripts: ['/push-sw.js'],
        navigateFallback: '/index.html',
        // Deny-list routes that must be handled by the Express server, not the
        // SW cache. Without this, the SW intercepts GET / on mobile and returns
        // the cached SPA index.html instead of letting the server serve
        // landing.html (pre-launch) or the real SPA (post-launch).
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/$/, /^\/preview/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Static assets shipped by the SPA — serve from cache, revalidate in background.
            urlPattern: ({ request }) =>
              ['style', 'script', 'worker', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'mara-static-v1' },
          },
          {
            // Images — same strategy, but in their own cache bucket with a ceiling.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mara-images-v1',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // API reads: try network, fall back to last-known response when offline.
            // GET only — mutations are NOT cached (Workbox ignores non-GET by default).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mara-api-v1',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // don't inject a SW during `vite dev` — SWs + HMR fight each other
      },
    }),
  ],
  build: {
    outDir: path.resolve(import.meta.dirname, '..', 'dist', 'public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split node_modules out of the main app chunk. The previous single
        // ~630 kB `index` chunk bundled all vendor code with app code, so any
        // app change busted the whole download. Isolating the rarely-changing
        // framework/i18n libs into their own long-lived cache buckets cuts the
        // initial app chunk and improves repeat-visit caching.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Only hoist the framework/i18n libs that the eager app shell always
          // needs into shared, long-lived cache buckets. Everything else is
          // left to Rollup's default splitting so heavy route-only deps stay in
          // their own lazy route chunks instead of being forced eager.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (/[\\/]node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/.test(id)) {
            return 'i18n-vendor';
          }
          return undefined;
        },
      },
    },
  },
  // `virtual:pwa-register` is a plugin-provided virtual module — the Vite dev
  // dep-scanner can't resolve it from disk and logs an error that, in our CI
  // smoke setup, blocks the server from answering /api/health in time.
  // Telling optimizeDeps to exclude the id skips the scan for this import.
  optimizeDeps: {
    exclude: ['virtual:pwa-register'],
  },
});
