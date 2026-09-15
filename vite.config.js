import { defineConfig } from 'vite';

const wsProxy = {
  '/ws': {
    target: 'ws://localhost:8787',
    ws: true,
  },
};

export default defineConfig({
  server: { host: true, proxy: wsProxy },
  preview: { host: true, allowedHosts: ['.trycloudflare.com'], proxy: wsProxy },
  base: process.env.BASE_PATH || '/',
});
