import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(import.meta.dirname, '..', 'dist', 'public'),
    emptyOutDir: true,
  },
});
