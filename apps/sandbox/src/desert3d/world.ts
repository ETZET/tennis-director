// 3D 像素画实验（t3ssel8r 风格）的共享契约。各部件只通过这里互相说话。
// 单位是米。y 朝上。球场中心在原点，长轴沿 z（底线在 z = ±11.885）。
import type * as THREE from 'three';
import type { Mats } from './toon';

/** 所有材质共用的 uniform（风、云影、时间）。部件只读，fx 部件负责写风。 */
export interface SharedUniforms {
  uTime: { value: number };
  /** 风：方向 × 强度（xz 平面，单位约等于 m/s 的十分之一；0 无风，1 大风） */
  uWind: { value: THREE.Vector2 };
  /** 阵风 0..1，fx 每帧更新；植物摆幅 = 基础 × (0.6 + 0.8 × 阵风) */
  uGust: { value: number };
  uCloudTex: { value: THREE.Texture };
  /** 云影：每米多少个贴图周期、移动速度（米/秒，xz）、强度 0..1 */
  uCloudScale: { value: number };
  uCloudVel: { value: THREE.Vector2 };
  uCloudStrength: { value: number };
}

/** 球场上的沙土：court 部件实现，people 部件（总监扫地、球员踩）和 fx 部件（风吹来沙）调用。 */
export interface Dirt {
  /** (x, z) 处沙土厚度 0..1 */
  at(x: number, z: number): number;
  /** 以 (x, z) 为中心、半径 r 米扫掉 amount（0..1），返回实际扫掉多少 */
  sweep(x: number, z: number, r: number, amount: number): number;
  /** 风把沙吹上来 */
  deposit(x: number, z: number, r: number, amount: number): void;
  /** 当前最脏的地方（总监下一个要扫的点），场内没有脏处时 null */
  dirtiest(): { x: number; z: number; amount: number } | null;
}

/** 特效：fx 部件实现，其他部件调用。 */
export interface Fx {
  /** 一团尘土（扫地、球落地、急停） */
  puff(pos: THREE.Vector3, size?: number, count?: number): void;
}

/** 球场状态：people 部件写，其他部件可读（例如 fx 在发球间隙加大风）。 */
export interface Play {
  /** 'idle' 没人 | 'rally' 打球中 | 'break' 分与分之间（总监扫地的时间） */
  phase: 'idle' | 'rally' | 'break';
}

export interface World {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  uniforms: SharedUniforms;
  mats: Mats;
  /** 种子随机流：每个部件用自己的名字拿一条，互不影响 */
  rng(stream: string): () => number;
  /** 图层：OUTLINE 默认层会进法线/深度描边；FX 层（粒子、草片、半透明）不参与描边 */
  layers: { FX: number };
  /** 其他部件注册的服务（在所有 build 之后才齐全，update 里再用） */
  dirt?: Dirt;
  fx?: Fx;
  play: Play;
  /** 地面高度（米）：沙丘和起伏，球场铺面和步道上约为 0。纯函数，build 时就能用 */
  groundY(x: number, z: number): number;
  params: URLSearchParams;
}

export interface Part {
  update?(dt: number, t: number): void;
}

export type Build = (w: World) => Part;
