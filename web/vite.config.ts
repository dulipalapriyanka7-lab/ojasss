import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': '/src' } },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'firebase-messaging-sw': fileURLToPath(new URL('./src/firebase-messaging-sw.js', import.meta.url)),
      },
      external: ['/api/firebase-worker-config'],
      output: {
        entryFileNames: (chunk) => chunk.name === 'firebase-messaging-sw' ? 'firebase-messaging-sw.js' : 'assets/[name]-[hash].js',
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('motion')) return 'motion';
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    // Local dev only: config.js points the client at same-origin `/api` (matching the
    // production reverse-proxy). Forward that to tools/local-api (the local QA backend),
    // stripping the `/api` prefix the server does not expect. Override the target with
    // LOCAL_API_URL if the local API runs on a different port.
    proxy: {
      '/api': {
        target: process.env.LOCAL_API_URL ?? 'http://localhost:54321',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Monster Fight game files (production: hostinger/api/monster-asset.php).
      '/play-game': {
        target: process.env.LOCAL_API_URL ?? 'http://localhost:54321',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
