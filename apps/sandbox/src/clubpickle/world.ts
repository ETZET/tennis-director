// clubpickle 的共享契约：和 clubdesk/world.ts 同形状（只读 import 它的 SharedUniforms），Pal 换成这里的表（clubdesk + 匹克球新材质）。
// desert3d-v2 / clubdesk 的资产（人、长椅、捡球篮、水站、凉棚……）都能直接拿这里的 ctx 建。
import type * as THREE from 'three';
import type { Mats } from '../clubdesk/toon';
import type { SharedUniforms } from '../clubdesk/world';
import type { Pal } from './palette';

export type { SharedUniforms };

/**
 * 资产模块拿到的上下文。新资产文件：src/clubpickle/assets/<id>.ts，
 *   export function build(ctx: AssetCtx): THREE.Object3D
 * 本地原点 = 资产落地点的中心（y = 0 是地面），+z 朝镜头，+y 朝上，单位米。
 * 想动（风摆以外的动画）：在返回对象的 userData.update = (dt, t) => {} 里做。
 */
export interface AssetCtx {
  mats: Mats;
  pal: Pal;
  /** 按调色板名字拿色阶材质（同参数复用）；extra 覆盖/追加 ToonOpts */
  mat(key: keyof Pal, extra?: Parameters<Mats['toon']>[1]): THREE.MeshToonMaterial;
  /** 种子随机流（不要用 Math.random） */
  rng(stream: string): () => number;
  uniforms: SharedUniforms;
  layers: { FX: number };
  /** 设计纹素（米）：素材按 0.09 米/纹素建模，和当前像素级别无关 */
  texel: number;
  /** 变体编号（画廊里 ?v=） */
  variant: number;
  params: URLSearchParams;
}

export type AssetBuild = (ctx: AssetCtx) => THREE.Object3D;
