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
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
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
  },
});
