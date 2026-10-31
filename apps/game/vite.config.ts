import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // @td/ui 的界面组件是 Preact TSX
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // three.js 本身约 550 KB（压缩前），单页应用暂不拆包
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
