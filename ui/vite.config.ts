import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: path.resolve(root, '../public'),
    emptyOutDir: true,
  },
  server: {
    port: 5190,
    proxy: {
      '/api': 'http://127.0.0.1:20190',
      '/health': 'http://127.0.0.1:20190',
    },
  },
});
