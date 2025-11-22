// frontend/vite.config.js
import { defineConfig } from 'vite';

const target = process.env.VITE_BACKEND_ORIGIN || 'http://backend:8787';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
});
