import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径，方便部署到任意静态托管的子目录
  base: './',
  // @td/ui 的界面组件是 Preact TSX
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: {
    target: 'es2022',
    // 单页应用暂不拆包
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        activities: resolve(import.meta.dirname, 'activities.html'),
        // 玩法 demo 第二轮（docs/lab/2026-11-04-playability）
        demos: resolve(import.meta.dirname, 'demos.html'),
        'demo-shop': resolve(import.meta.dirname, 'demo-shop.html'),
        'demo-court': resolve(import.meta.dirname, 'demo-court.html'),
        'demo-staff': resolve(import.meta.dirname, 'demo-staff.html'),
        'demo-social': resolve(import.meta.dirname, 'demo-social.html'),
      },
    },
  },
});
