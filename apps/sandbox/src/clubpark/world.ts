// clubpark 的共享契约：和 clubfront/world.ts、desert3d-v2/world.ts 同形状（那边的资产可以直接拿这里的 ctx 建），
// 只是调色板是停车场的超集（palette.ts）。单位米，y 朝上；世界坐标 = clubmap2/layout.ts 的（北 = −z，东 = +x）。
import type * as THREE from 'three';
import type { Mats } from '../clubfront/toon';
import type { SharedUniforms } from '../clubfront/world';
import type { Pal } from './palette';

export type { SharedUniforms };

/**
 * 资产模块拿到的上下文。新资产文件：src/clubpark/assets/<id>.ts，
 *   export function build(ctx: AssetCtx): THREE.Object3D
 * 本地原点 = 落地点中心（y 0 = 地面），+z 朝镜头，单位米。车：车头朝本地 −z（rotY 0 = 车头朝北）。
 * 想动：返回对象的 userData.update = (dt, t) => {}。
 */
export interface AssetCtx {
  mats: Mats;
  pal: Pal;
  mat(key: keyof Pal, extra?: Parameters<Mats['toon']>[1]): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
  uniforms: SharedUniforms;
  layers: { FX: number };
  /** 设计纹素（米）：素材按 0.09 米/纹素建模，和当前像素级别无关 */
  texel: number;
  variant: number;
  params: URLSearchParams;
}

export type AssetBuild = (ctx: AssetCtx) => THREE.Object3D;
