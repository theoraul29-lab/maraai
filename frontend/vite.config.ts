import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output to dist/public at the project root so the Express server
    // can find the static files at the expected path (dist/public).
    outDir: '../dist/public',
    emptyOutDir: true,
  },
});
