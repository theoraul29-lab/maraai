import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Standalone Vitest config (kept separate from vite.config.ts so tests don't
// pull in the PWA/service-worker plugin). happy-dom gives us a DOM for the few
// component-integration tests; pure-logic tests don't need it but it's cheap.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
