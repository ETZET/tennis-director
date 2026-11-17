// valley 的资产上下文：AssetCtx<valley 的调色板>（clubmap2 的表 + 市中心的新材质，palette.ts）。
// 资产模块（src/valley/assets/*.ts）：ASSETS[id] = (ctx: AssetCtx) => THREE.Object3D；本地原点 = 落地点中心，y 0 = 地面，+z 朝镜头（朝南）。
import type * as THREE from 'three';
import type { AssetCtx as Ctx } from '../clubsite/render/ctx';
import type { Pal } from './palette';

export type AssetCtx = Ctx<Pal>;
export type AssetFn = (ctx: AssetCtx) => THREE.Object3D;
