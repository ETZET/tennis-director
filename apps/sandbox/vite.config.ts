import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便部署到任意静态托管的子目录
  base: './',
  build: {
    target: 'es2022',
    // three.js 本身约 550 KB（压缩前），单页应用暂不拆包
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        'hollow-creek': resolve(import.meta.dirname, 'hollow-creek.html'),
      },
    },
  },
});
