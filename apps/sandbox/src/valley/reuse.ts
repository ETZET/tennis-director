// valley 只读引用别处的东西（不改它们）：clubmap2 的底图 ctx 的类型、clubwalk 的大世界。
// 调色板：palette.ts（clubmap2 的表 + 市中心的新材质）；这里转出去，老代码照旧 import { PAL, PalKey } from './reuse'。
import type { buildMap } from '../clubmap2/build';

export { mountWalk, type WalkApi, type WalkHooks } from '../clubwalk/walk';
export { EL, PAL, type PalKey } from './palette';
export type MapCtx = Parameters<typeof buildMap>[0];
