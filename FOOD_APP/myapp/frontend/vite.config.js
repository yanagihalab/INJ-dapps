// frontend/vite.config.js
import { defineConfig } from 'vite';

const target = process.env.VITE_BACKEND_ORIGIN || 'http://localhost:8787';
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target, changeOrigin: true },
    },
  },
});
