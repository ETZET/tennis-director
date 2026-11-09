// clubcourts 的共享契约：和 clubdesk / clubclay / desert3d-v2 的 world.ts 同形状（那边的资产可以直接拿这里的 ctx 建），
// 只是调色板是这个场景的超集（palette.ts）。单位米，y 朝上；世界坐标 = clubmap2/layout.ts 的（北 = −z，东 = +x）。
// 核心（pipeline / toon / noise / colors）不复制：只读 import clubfront 的那份（同 clubpark / clubclay）。
import type * as THREE from 'three';
import type { Mats } from '../clubfront/toon';
import type { SharedUniforms } from '../clubfront/world';
import type { Pal } from './palette';

export type { SharedUniforms };

/**
 * 资产模块拿到的上下文。新资产文件：src/clubcourts/assets/<id>.ts，
 *   export function build(ctx: AssetCtx): THREE.Object3D
 * 本地原点 = 落地点中心（y 0 = 地面），+z 朝镜头（南），+x 朝东，单位米。
 * 想动（风摆以外的动画）：返回对象的 userData.update = (dt, t) => {}。
 * 共用资产（伞、记分牌、球网、灯杆……）的实现在 src/clubsite/assets/<id>.ts，这里的 assets/<占位 id>.ts 只放一行 re-export。
 */
export interface AssetCtx {
  mats: Mats;
  /** 调色板：材质名 → 三档 + 描边参数；用 ctx.mat('court') 拿材质 */
  pal: Pal;
  /** 按调色板名字拿色阶材质（同参数复用）；extra 覆盖/追加 ToonOpts（sway、elem、lightUp…） */
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
