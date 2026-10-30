import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // three.js 本身约 550 KB（压缩前），单页应用暂不拆包
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
