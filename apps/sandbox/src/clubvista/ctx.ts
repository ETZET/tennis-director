// clubvista 的资产上下文：渲染核心的 AssetCtx（clubsite/render/ctx.ts），调色板换成这个场景的表（palette.ts）。
// 新资产文件：src/clubvista/assets/<id>.ts，export function build(ctx: AssetCtx): THREE.Object3D。
import type { AssetBuild as Build, AssetCtx as Ctx } from '../clubsite/render/ctx';
import type { Pal } from './palette';

export type { SharedUniforms } from '../clubsite/render/ctx';
export type AssetCtx = Ctx<Pal>;
export type AssetBuild = Build<Pal>;
