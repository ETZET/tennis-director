import { contentHotReload } from '@td/content/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 改 packages/content/data 下的 YAML，游戏不刷新就换上新内容（编译错误弹错误层）
  plugins: [contentHotReload()],
  // @td/ui 的界面组件是 Preact TSX
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // 单页应用暂不拆包（画面换成 @td/iso 后已经没有 three）
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
