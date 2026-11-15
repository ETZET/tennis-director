// clubbuild 的资产上下文：渲染核心的 AssetCtx，调色板换成这个场景的表（palette.ts）。
// 新资产：src/clubbuild/assets/<设施 id>.ts，export function build(ctx: AssetCtx): THREE.Object3D（约定见 catalog.ts 文件头）。
import type { AssetBuild as Build, AssetCtx as Ctx } from '../clubsite/render/ctx';
import type { Pal } from './palette';

export type { SharedUniforms } from '../clubsite/render/ctx';
export type AssetCtx = Ctx<Pal>;
export type AssetBuild = Build<Pal>;
