// valley 只读引用别处的东西（不改它们）：clubmap2 的调色板和底图 ctx 的类型、clubwalk 的大世界。
import type { buildMap } from '../clubmap2/build';
import { EL as MAP_EL, PAL as MAP_PAL } from '../clubmap2/palette';

export { mountWalk, type WalkApi, type WalkHooks } from '../clubwalk/walk';
export const PAL = MAP_PAL;
export const EL = MAP_EL;
export type PalKey = keyof typeof MAP_PAL;
export type MapCtx = Parameters<typeof buildMap>[0];
