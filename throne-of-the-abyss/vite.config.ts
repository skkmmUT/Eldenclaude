import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
