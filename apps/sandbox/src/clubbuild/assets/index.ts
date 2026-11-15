// 设施模型表：assets/<设施 id>.ts 自动收进来（文件名 = catalog.ts 的 id）。没有模型的设施 main 用灰盒占位。
// 设施以外的小件（客人、飘字道具……）也可以放这里，文件名不和设施 id 撞就行。
import type { AssetBuild } from '../ctx';

const MODS = import.meta.glob<{ build: AssetBuild }>('./*.ts', { eager: true });
export const MODELS: Record<string, AssetBuild> = {};
for (const [path, mod] of Object.entries(MODS)) {
  const id = path.replace('./', '').replace(/\.ts$/, '');
  if (id !== 'index' && typeof mod.build === 'function') MODELS[id] = mod.build;
}
