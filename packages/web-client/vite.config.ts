import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  plugins: [solid(), viteSingleFile()],
  resolve: {
    alias: {
      '@pkey/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/pkey/ws': {
        target: 'ws://localhost:7392',
        ws: true,
      },
    },
  },
});
