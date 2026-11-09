// clubdesk 的共享契约：从 clubfront/world.ts 复制，Pal 换成这个场景的表（clubmap2 的整张表 + 前台新材质）。
// 和 desert3d-v2/world.ts 同形状：那边的资产（植物、人、工具架）可以直接拿这里的 ctx 建。
import type * as THREE from 'three';
import type { Pal } from './palette';
import type { Mats } from './toon';

/** 所有材质共用的 uniform（风、云影、时间） */
export interface SharedUniforms {
  uTime: { value: number };
  /** 风：方向 × 强度（xz，0 无风，1 大风） */
  uWind: { value: THREE.Vector2 };
  /** 阵风 0..1 */
  uGust: { value: number };
  /** 云影：每团 (x, z, rx, rz)（米，t = 0 时的位置；rx 0 = 空位），长度 toon.ts 的 CLOUD_N。手摆的在 layout.ts CLOUDS */
  uClouds: { value: THREE.Vector4[] };
  /** 云飘的速度（米/秒；只用 x，云不离开自己那条带） */
  uCloudVel: { value: THREE.Vector2 };
  /** 0 = 关云影（画廊），> 0 = 开 */
  uCloudStrength: { value: number };
}

/**
 * 资产模块拿到的上下文。新资产文件：src/clubdesk/assets/<id>.ts，
 *   export function build(ctx: AssetCtx): THREE.Object3D
 * 本地原点 = 资产落地点的中心（y = 0 是地面），+z 朝镜头，+y 朝上，单位米。
 * 想动（风摆以外的动画）：在返回对象的 userData.update = (dt, t) => {} 里做。
 */
export interface AssetCtx {
  mats: Mats;
  /** 调色板：材质名 → 三档 + 描边参数；用 ctx.mat('tile') 拿材质 */
  pal: Pal;
  /** 按调色板名字拿色阶材质（同参数复用）；extra 覆盖/追加 ToonOpts（sway、sphereNormals、elem…） */
  mat(key: keyof Pal, extra?: Parameters<Mats['toon']>[1]): THREE.MeshToonMaterial;
  /** 种子随机流（不要用 Math.random） */
  rng(stream: string): () => number;
  uniforms: SharedUniforms;
  layers: { FX: number };
  /** 设计纹素（米）：素材按 0.09 米/纹素建模（线宽、板缝、最小厚度 3 纹素），和当前像素级别无关 */
  texel: number;
  /** 变体编号（同一资产放好几处时不一样；画廊里 ?v=） */
  variant: number;
  params: URLSearchParams;
}

export type AssetBuild = (ctx: AssetCtx) => THREE.Object3D;
