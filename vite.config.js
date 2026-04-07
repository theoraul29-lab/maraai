import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function forceRootIndexPlugin() {
  return {
    name: 'force-root-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
          req.url = '/index.html';
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), forceRootIndexPlugin()],
  resolve: {
    alias: {
        '@': path.resolve(import.meta.dirname, 'frontend', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
    },
  },
    root: path.resolve(import.meta.dirname, 'frontend'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
    port: 5173,
    fs: {
      strict: true,
      deny: ['**/.*'],
    },
    hmr: {
      overlay: false,
    },
  },
});
