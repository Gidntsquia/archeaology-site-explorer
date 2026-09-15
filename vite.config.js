import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: true },
  preview: { host: true, allowedHosts: ['.trycloudflare.com'] },
  base: process.env.BASE_PATH || '/',
});
