import { defineConfig } from 'vite';

export default defineConfig({
  base: '/capicatcher/',
  build: {
    target: 'es2015',
    minify: 'esbuild',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 3000,
  },
  esbuild: {
    sourcemap: true,
  },
});