import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5186),
    strictPort: true,
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
      '/health': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
    },
  },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: false },
});
