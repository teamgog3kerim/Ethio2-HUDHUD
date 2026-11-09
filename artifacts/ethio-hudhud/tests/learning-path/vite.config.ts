import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Test-only entry: real pages, routing, providers, CSS and API hooks. No auth
// bypass or test endpoint is ever mounted in the normal application.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '../../src'),
      '@/lib/auth': path.resolve(import.meta.dirname, 'auth.ts'),
    },
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
  },
  server: { host: '127.0.0.1', port: 4179, strictPort: true },
});
