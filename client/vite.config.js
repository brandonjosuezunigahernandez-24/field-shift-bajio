import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs on its own process: cd server && npm run dev
    proxy: { '/api': 'http://localhost:3001' },
    // Live demo through a Cloudflare tunnel (docs/despliegue.md): Vite blocks unknown hosts otherwise.
    allowedHosts: ['.trycloudflare.com'],
  },
});
