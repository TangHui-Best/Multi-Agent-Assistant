import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.parseInt(process.env.WEB_PORT ?? '5173', 10),
    proxy: {
      '/api': 'http://127.0.0.1:4317',
      '/ws': {
        target: 'ws://127.0.0.1:4317',
        ws: true,
      },
    },
  },
});
