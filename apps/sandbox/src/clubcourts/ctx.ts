// clubcourts 的资产上下文：渲染核心的 AssetCtx（clubsite/render/ctx.ts），调色板换成这个场景的表（palette.ts：硬地场的超集）。
// 新资产文件：src/clubcourts/assets/<id>.ts，export function build(ctx: AssetCtx): THREE.Object3D。
// clubsite 的共用资产（植物、人、长椅、工具……）按子集的调色板建，能直接拿这里的 ctx 建。
// 共用资产（伞、记分牌、球网、灯杆……）的实现在 src/clubsite/assets/<id>.ts，这里的 assets/<占位 id>.ts 只放一行 re-export。
import type { AssetBuild as Build, AssetCtx as Ctx } from '../clubsite/render/ctx';
import type { Pal } from './palette';

export type { SharedUniforms } from '../clubsite/render/ctx';
export type AssetCtx = Ctx<Pal>;
export type AssetBuild = Build<Pal>;
