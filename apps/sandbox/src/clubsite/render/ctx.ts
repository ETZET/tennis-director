// 资产的共享契约（渲染核心 clubsite/render）：材质 uniform、资产上下文。所有 club* 场景和 desert3d-v2 都是这个形状，
// 只是调色板不同 —— 场景的 ctx.ts 写 `AssetCtx<本场景的 Pal>`。调色板是超集的场景可以直接拿自己的 ctx 建子集的资产
// （clubsite 的植物、人、长椅按底表 palette-base.ts 建，任何场景都能用）。
// 单位米，y 朝上，相机 yaw 0 时 +x 画面右、+z 朝镜头（画面下方）。
// （叫 ctx.ts 不叫 world.ts：clubsite/world.ts 是整座俱乐部的世界坐标。）
import type * as THREE from 'three';
import type { Pal as ClubPal } from './palette';
import type { Pal as BasePal } from './palette-base';
import type { Mats } from './toon';

/** 所有材质共用的 uniform（风、云影、时间） */
export interface SharedUniforms {
  uTime: { value: number };
  /** 风：方向 × 强度（xz，0 无风，1 大风） */
  uWind: { value: THREE.Vector2 };
  /** 阵风 0..1 */
  uGust: { value: number };
  /** 云影：每团 (x, z, rx, rz)（米，t = 0 时的位置；rx 0 = 空位），长度 toon.ts 的 CLOUD_N。手摆的在场景的 layout.ts CLOUDS */
  uClouds: { value: THREE.Vector4[] };
  /** 云飘的速度（米/秒；只用 x，云不离开自己那条带） */
  uCloudVel: { value: THREE.Vector2 };
  /** 0 = 关云影（画廊），> 0 = 开 */
  uCloudStrength: { value: number };
}

/**
 * 资产模块拿到的上下文。场景自己的资产：src/<场景>/assets/<id>.ts，共用的：src/clubsite/assets|nature|people/…，
 *   export function build(ctx: AssetCtx): THREE.Object3D
 * 本地原点 = 资产落地点的中心（y = 0 是地面），+z 朝镜头，+y 朝上，单位米。
 * 想动（风摆以外的动画，比如布、人）：在返回对象的 userData.update = (dt, t) => {} 里做。
 * P = 调色板（默认俱乐部的表 palette.ts）。
 */
export interface AssetCtx<P = ClubPal> {
  mats: Mats;
  /** 调色板：材质名 → 三档 + 描边参数；用 ctx.mat('tile') 拿材质 */
  pal: P;
  /** 按调色板名字拿色阶材质（同参数复用）；extra 覆盖/追加 ToonOpts（sway、sphereNormals、elem…） */
  mat(key: keyof P, extra?: Parameters<Mats['toon']>[1]): THREE.MeshToonMaterial;
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

export type AssetBuild<P = ClubPal> = (ctx: AssetCtx<P>) => THREE.Object3D;

/** 按底表（palette-base.ts）建的资产的上下文：clubsite 的植物、人、长椅、工具……（原 desert3d-v2 的 AssetCtx） */
export type BaseCtx = AssetCtx<BasePal>;
export type BaseBuild = AssetBuild<BasePal>;
