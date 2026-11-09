// 色阶材质（池塘研究的配方，docs/lab/2026-11-07-3d-pixel/lessons.md）：
// 还是 MeshToonMaterial（贴图、顶点色、实例色、蒙皮、alphaMap、透明都照旧能用，部件的 onBeforeCompile 也照旧能接），
// 只是把最后的光照整段换掉：
// - 光照只算一个数 l = dot(N, 太阳) + 噪声 → 三档：亮 / 中 / 暗；投影（PCF 取阈值，阈值按竖向笔触抖）压到暗档，
//   云影（fx.ts 手摆的几团，硬边 + 一纹素棋盘抖动）把亮档压到中档；
// - 三档颜色：给了 ramp 就用手挑的三色；没给就从本色自动推：中、暗两档色相往靛蓝转（暖色经品红、绿色经青），变暗、略降饱和；
// - 不用环境光/半球光（它们把暗档拉灰）；颜色管理关掉，调色板原值输出；
// - 法线 pass 的孪生材质把描边强度（edge、convex）写进 alpha；
// - 风摆：顶点里按高度平方偏移，法线 pass 和投影深度材质同步摆。
// - 材质规范 v2（docs/lab/2026-11-07-3d-pixel/material-spec.md，用法见 ASSETS.md「材质规范 v2」）：
//   给了 elem 的材质，表面由"元素"组成（石块、岩层、板条、叶团、沙纹……），每个元素在本档的三色（本色 / 高一级 / 低一级）
//   里挑一个，外加缝色和亮边色（Tones）；进投影 = 整套换暗档那套，进云影 = 亮档整套换中档那套，纹理都还在。
//   元素坐标是屏幕纹素（跟世界锚定），噪声一律按纹素中心取。不给 elem 的材质和以前完全一样。
import * as THREE from 'three';
import type { SharedUniforms } from './world';

type Hex = THREE.ColorRepresentation;
type C3 = [Hex, Hex, Hex];

/**
 * 元素调色板（材质规范）：每档 [本色, 高一级, 低一级]，外加每档的缝色、亮边色。
 * 顺序跟 palette 一样是 **[亮, 中, 暗]**。暗档色相偏冷（往靛紫/青），不是亮档乘系数。不给就从 ramp 推（autoTones）。
 */
export interface Tones {
  bands: [C3, C3, C3];
  seam: C3;
  hi: C3;
}

/** 元素图案（各 kind 的参数含义见 ASSETS.md「材质规范 v2」的表） */
export type ElemKind =
  | 'none'
  | 'stones'
  | 'strata'
  | 'planks'
  | 'leaves'
  | 'blades'
  | 'ripples'
  | 'pebbles'
  | 'paint'
  | 'treads'
  | 'drift'
  | 'water'
  | 'dash';

export interface Elem {
  kind: ElemKind;
  /** 元素坐标：screen = 屏幕纹素（跟世界锚定，地面/静物默认）；wall = 墙的 uv（米：x 沿墙、y 离墙顶多深）；local = 跟着物件原点走（会动的东西） */
  space?: 'screen' | 'wall' | 'local';
  /** 元素尺寸（纹素，宽 × 高），各 kind 解释不同 */
  size?: [number, number];
  /** 缝宽（纹素）；0 = 没有缝 */
  seam?: number;
  /** 上沿亮边：有亮边的元素占多少（0..1）；墙是"缝下面那行"，灌木/叶团约 0.15，石板路 1 */
  hi?: number;
  /** "撒"的细节（沙纹、草叶、脚印、擦痕）的密度：斑块之间从 [0] 变到 [1]（规范第 10 条：≈ 0.01 → 0.25～0.3） */
  density?: [number, number];
  /** 斑块尺度（米），默认 3 */
  patch?: number;
  /** 低频深浅斑块的量 0..1（沙地的深沙斑、浅沙斑） */
  mottle?: number;
  /** 叠加的碎石（2 暗 + 1 亮的小石子）每 7×5 纹素格的概率 */
  pebbles?: number;
  /** 强调色 [亮, 中, 暗]：碎石、岩壁上淌下来的沙、泡沫间隙的水色…… */
  accent?: C3;
  /** 各 kind 自己的参数（见表） */
  p?: [number, number, number, number];
  q?: [number, number, number, number];
  /** 几何体带 aElem（vec4）顶点属性：墙 = [露出的高度（米）]，水 = [到北岸的距离, 到岸的距离]（米） */
  attr?: boolean;
  seed?: number;
}

export interface ToonOpts {
  /** 风摆幅度（米，风强 1、阵风 0.5 时顶端的偏移）；0 或不填就不摆 */
  sway?: number;
  /** 摆动的参考高度（本地坐标 y）：y = swayH 处达到 sway，往下按平方衰减 */
  swayH?: number;
  vertexColors?: boolean;
  map?: THREE.Texture;
  alphaMap?: THREE.Texture;
  alphaTest?: number;
  side?: THREE.Side;
  /** 自发光（灯泡、余烬）：直接加在结果上 */
  emissive?: THREE.ColorRepresentation;
  /**
   * 手挑的三档 [亮, 中, 暗]。给了它，color 参数被忽略（当白色）；贴图/顶点色/实例色仍然乘在上面（当作明暗/细节）。
   * 不给：从本色自动推中、暗两档（冷色相偏移）。
   */
  ramp?: [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation];
  /** 档位阈值 [暗|中, 中|亮]（l = dot(N, 光)），默认 [0.1, 0.5] */
  bands?: [number, number];
  /** 档位交界的噪声幅度（树冠 0.3～0.4 → 竖向"毛"；默认 0） */
  noise?: number;
  /** 描边强度 0..1（深度轮廓压暗；> 0.2 的物件上沿提亮）。默认 0.6；地面、沙地 0.05～0.1 */
  edge?: number;
  /** 法线凸边高光强度 0..1。默认 0.5；石头、木箱 0.8～1，地面 0～0.1 */
  convex?: number;
  /** 明暗用的光往正上方偏多少（0..1，树冠 0.4）；投影仍按真太阳 */
  lightUp?: number;
  /** 球面法线：法线 = normalize(本地位置 - 这个点)（树冠、灌木团、圆石头）。true = 本地原点 */
  sphereNormals?: boolean | [number, number, number];
  /** 不接收投影（很薄的东西、浮在空中的东西） */
  noShadowReceive?: boolean;
  /** 材质规范 v2：元素图案（不给 = 以前的三档平涂） */
  elem?: Elem;
  /** 元素调色板；不给就从 ramp 推（autoTones）。只在有 elem 时起作用 */
  tones?: Tones;
  /** 元素取 [高一级, 低一级] 的比例（其余本色），默认 [0.28, 0.24] */
  toneW?: [number, number];
}

/** 每个 kind 的默认参数 */
const ELEM_DEFAULTS: Record<ElemKind, Partial<Elem>> = {
  none: {},
  stones: { size: [9, 6], seam: 0.75, hi: 1 },
  strata: { space: 'wall', size: [11, 5], hi: 0.5, q: [9, 18, 0, 0] },
  planks: { space: 'local', seam: 1, hi: 1, p: [1, 0, 0, 0.25], q: [1, 0, 0, 0] },
  leaves: { size: [2.4, 2.4], hi: 0.15 },
  blades: { density: [0.01, 0.3] },
  ripples: { size: [11, 4], density: [0.02, 0.3], patch: 3.5, mottle: 0.5 },
  pebbles: { size: [10, 6], seam: 0.6, density: [0, 0.12], pebbles: 0.05 },
  paint: { size: [26, 16], density: [0, 0.04], patch: 4 },
  treads: { size: [6, 14] },
  drift: { size: [9, 3], density: [0, 0.3], p: [0.92, 0.4, 0, 0] },
  water: { attr: true },
  dash: { size: [5, 2] },
};

/**
 * 没给 tones 的材质从 [亮, 中, 暗] 推一套：高一级 = 往上一档挪 30%（亮档往白 12%），低一级 = 往下一档挪 30%
 * （暗档往"× (0.78, 0.8, 0.92)"的冷暗），缝 = 冷暗（亮档往本色回 30%），亮边 = 往上一档挪 55%（亮档往白 25%）。
 */
export function autoTones(ramp: [Hex, Hex, Hex]): Tones {
  const [L, M, D] = ramp.map((h) => new THREE.Color(h));
  const white = new THREE.Color(0xfff8ee);
  const cold = D.clone().multiply(new THREE.Color(0.78, 0.8, 0.92));
  const mix = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t).getHex();
  return {
    bands: [
      [L.getHex(), mix(L, white, 0.12), mix(L, M, 0.3)],
      [M.getHex(), mix(M, L, 0.3), mix(M, D, 0.3)],
      [D.getHex(), mix(D, M, 0.3), mix(D, cold, 0.3)],
    ],
    seam: [mix(cold, L, 0.3), mix(cold, M, 0.15), cold.getHex()],
    hi: [mix(L, white, 0.25), mix(M, L, 0.55), mix(D, M, 0.55)],
  };
}

export interface Mats {
  /** 色阶材质（同色同参数会复用同一个实例） */
  toon(color: THREE.ColorRepresentation, opts?: ToonOpts): THREE.MeshToonMaterial;
  /** 给一棵对象树收尾：投影/受影开关、风摆物体的深度材质。每个部件 build 完调用一次 */
  prepare(root: THREE.Object3D, opts?: { cast?: boolean; receive?: boolean }): void;
  /** 旧接口保留（三档渐变图）；新材质不用它 */
  gradient: THREE.Texture;
  /** 全局开关（A/B 用）：shadowHard 1 投影取阈值，fur 影子毛边幅度，noiseK 档位噪声倍数，lightModel 0 色阶 / 1 等比变暗 */
  globals: {
    uFur: { value: number };
    uShadowHard: { value: number };
    uNoiseK: { value: number };
    uLightModel: { value: number };
  };
}

/** 描边的法线 pass 用：取 mesh 对应的法线材质 */
export function normalMatOf(m: THREE.Material | undefined): THREE.Material | undefined {
  return m?.userData.normalMat as THREE.Material | undefined;
}

/** 几何体工具：把法线改成从 center（默认包围球心）指向顶点 —— 合并好的一团团树冠请对每一团单独调用，再合并 */
export function blobNormals(g: THREE.BufferGeometry, center?: THREE.Vector3): THREE.BufferGeometry {
  if (!center) {
    g.computeBoundingSphere();
    center = g.boundingSphere!.center;
  }
  const p = g.getAttribute('position');
  let n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) {
    n = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
    g.setAttribute('normal', n);
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
  return g;
}

/** 描边强度打包进法线 RT 的 alpha：高 4 位 edge，低 4 位 convex */
export function packEdge(edge: number, convex: number): number {
  const e = Math.round(THREE.MathUtils.clamp(edge, 0, 1) * 15);
  const c = Math.round(THREE.MathUtils.clamp(convex, 0, 1) * 15);
  return (e * 16 + c) / 255;
}

/** 云影最多几团椭圆（SharedUniforms.uClouds 的长度）；飘到 x ±CLOUD_W/2 绕回来（米） */
export const CLOUD_N = 8;
export const CLOUD_W = 96;

const SWAY_VERT_DECL = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform float uGust;
uniform float uSway;
uniform float uSwayH;
uniform vec3 uSphereC;
uniform float uSphere;
varying vec2 vCloudXZ;
varying vec3 vWorldP;
#ifdef ELEM
  varying vec3 vElemP;
  varying vec3 vElemL;
  varying vec2 vElemUv;
  #ifdef ELEM_ATTR
    attribute vec4 aElem;
    varying vec4 vElemA;
  #endif
#endif
`;

const SPHERE_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
if (uSphere > 0.5) objectNormal = normalize(position - uSphereC);
`;

const SWAY_VERT = /* glsl */ `
#include <begin_vertex>
{
  mat4 mI = modelMatrix;
  #ifdef USE_INSTANCING
    mI = modelMatrix * instanceMatrix;
  #endif
  #ifdef ELEM
    // 元素图案取风摆之前的位置：图案跟着几何体走，不在叶子上"游"
    vElemP = (mI * vec4(transformed, 1.0)).xyz;
    #ifdef ELEM_LOCAL
      vElemP -= (mI * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    #endif
    vElemL = position;
    vElemUv = uv;
    #ifdef ELEM_ATTR
      vElemA = aElem;
    #endif
  #endif
  if (uSway > 0.0) {
    vec3 base = (mI * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float h = max(transformed.y, 0.0) / uSwayH;
    float k = h * h * uSway * (0.6 + 0.8 * uGust);
    float ph = dot(base.xz, vec2(0.37, 0.23));
    float wv = 0.75 + 0.5 * sin(uTime * 2.3 + ph) + 0.25 * sin(uTime * 3.7 + ph * 1.7);
    vec3 off = vec3(uWind.x, 0.0, uWind.y) * k * wv;
    transformed += inverse(mat3(mI)) * off;
  }
  vWorldP = (mI * vec4(transformed, 1.0)).xyz;
  vCloudXZ = vWorldP.xz;
}
`;

const RAMP_FRAG_DECL = /* glsl */ `
uniform vec4 uClouds[CLOUD_N];
uniform vec2 uCloudVel;
uniform float uCloudStrength;
uniform float uTime;
uniform vec3 uRampLit;
uniform vec3 uRampMid;
uniform vec3 uRampDark;
uniform float uHasRamp;
uniform vec2 uBands;
uniform float uNoise;
uniform float uLightUp;
uniform float uTexel;
uniform float uFur;
uniform float uShadowHard;
uniform float uNoiseK;
uniform float uLightModel;
uniform float uNoRecv;
varying vec2 vCloudXZ;
varying vec3 vWorldP;
float rhash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cvn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rhash12(i), rhash12(i + vec2(1.0, 0.0)), f.x), mix(rhash12(i + vec2(0.0, 1.0)), rhash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
// 云影（手摆，见 fx.ts CLOUDS）：几团椭圆的并集，边用低频噪声扰成云的样子（噪声跟着云走，形状不变），整体沿 x 慢慢飘、
// 每 CLOUD_W 米绕回来（飘的方向只有 x：云只在北台和低地两条带里走，永远不上球场）。返回"归一化半径"，< 1 = 云影里。
float cloudR(vec2 xz) {
  vec2 q = xz - uCloudVel * uTime;
  q.x = mod(q.x + CLOUD_W * 0.5, CLOUD_W) - CLOUD_W * 0.5;
  float r = 9.0;
  for (int i = 0; i < CLOUD_N; i++) {
    vec4 c = uClouds[i];
    if (c.z <= 0.0) continue;
    r = min(r, length((q - c.xy) / c.zw));
  }
  return r + (cvn(q * 0.32 + 3.7) - 0.5) * 0.8 + (cvn(q * 0.85 + 11.1) - 0.5) * 0.25;
}
float rhash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
// 冷色相偏移：色相往靛蓝（0.65）转 k（暖色走品红那边、绿色走青那边，最多转 maxShift），明度 × v，饱和 × s；再往靛色混一点
vec3 coolShade(vec3 c, float k, float v, float s) {
  vec3 h = rgb2hsv(c);
  float d = 0.65 - h.x;
  d -= floor(d + 0.5);
  h.x = fract(h.x + clamp(d * k, -0.06, 0.15));
  h.y = clamp(h.y * s, 0.0, 1.0);
  h.z *= v;
  // 再往一个固定的暗靛紫混一点（暗档 ~25%、中档 ~8%）：沙子的影子成了偏紫的赭色，草成了青绿
  return mix(hsv2rgb(h), vec3(0.3, 0.28, 0.48), 0.55 * k);
}
`;

// ———— 材质规范 v2：元素库（只编进带 elem 的材质） ————
// 元素 = vec2(id 哈希 0..1, 是否是缝)。颜色：缝 → 本档缝色；上沿（屏幕上一个纹素是缝或别的元素）→ 本档亮边色；
// 否则按 id 在本档三色里挑。band 0 暗、1 中、2 亮；uTone[band*3 + k]，k 0 本色、1 高一级、2 低一级。
const ELEM_FRAG_DECL = /* glsl */ `
#ifdef ELEM
uniform vec3 uTone[9];
uniform vec3 uSeamC[3];
uniform vec3 uHiC[3];
uniform vec3 uElX[3];
uniform vec2 uToneW;
uniform vec4 uElA;   // size.x, size.y, seam, hi
uniform vec4 uElB;   // density lo, density hi, patch（米）, mottle
uniform vec4 uElP;
uniform vec4 uElQ;
uniform float uElPeb;
uniform float uElSeed;
varying vec3 vElemP;
varying vec3 vElemL;
varying vec2 vElemUv;
#ifdef ELEM_ATTR
  varying vec4 vElemA;
#endif
float eh(vec2 p) { return rhash12(p + vec2(uElSeed * 17.31, uElSeed * 5.17)); }
float evn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(eh(i), eh(i + vec2(1.0, 0.0)), f.x), mix(eh(i + vec2(0.0, 1.0)), eh(i + vec2(1.0, 1.0)), f.x), f.y);
}
float efbm(vec2 p) { return 0.5 * evn(p) + 0.3 * evn(p * 2.03 + 7.1) + 0.2 * evn(p * 4.1 + 3.3); }
// Voronoi：(到最近点距离, 到次近点距离 − 最近距离 ≈ 离缝多远, 元素 id 哈希)
vec3 evoro(vec2 p) {
  vec2 n = floor(p); vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(eh(n + g), eh(n + g + 19.19)) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2 - d1, eh(id + 3.7));
}
vec3 eTone(int b, int k) { return uTone[b * 3 + k]; }
vec3 eToneOf(int b, float h) {
  float t = fract(h * 13.37 + 0.21);
  return t < uToneW.x ? uTone[b * 3 + 1] : (t < uToneW.x + uToneW.y ? uTone[b * 3 + 2] : uTone[b * 3]);
}
vec2 eVoroEl(vec2 p, vec2 cell, float seam) {
  vec3 v = evoro(p / cell);
  return vec2(v.z, v.y * min(cell.x, cell.y) < seam ? 1.0 : 0.0);
}
vec3 eElemCol(vec2 cur, vec2 up, int b) {
  if (cur.y > 0.5) return uSeamC[b];
  if (up.y > 0.5 || abs(up.x - cur.x) > 1e-5) return uHiC[b];
  return eToneOf(b, cur.x);
}
// 屏幕纹素坐标（y 朝上，跟世界锚定）。相机按纹素对齐，片元中心落在整数或半整数上，+0.25 两种都取得稳
vec2 eScr(vec3 p) { return floor((mat3(viewMatrix) * p).xy / uTexel + 0.25); }
// 竖直 1 米在屏幕上是多少纹素行 / 纹素（俯角 45° 时 0.707）
float eRpm() { return (mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)).y; }
// 水平地面上往屏幕下挪一行对应的世界 xz（yaw 0、俯角 45° 时 = (0, 1.414 纹素)）
vec2 eDn() {
  mat3 V = mat3(viewMatrix);
  vec2 U = vec2(V[0][1], V[2][1]);
  return -U / max(dot(U, U), 1e-3) * uTexel;
}
vec2 eTexW(vec2 xz) { return (floor(xz / uTexel) + 0.5) * uTexel; }

// 沙纹：每 size.y 行一行候选，每行按 size.x 纹素分段，段里一条 3～(size.x−1) 纹素的暗划（缝色），上面一行短一点的亮划（亮边色）
vec3 eRipples(int b, vec2 p, float dens, vec3 c) {
  float R = uElA.y;
  // 沙纹一起缓缓起伏（−1..1 行）：一段段横划连起来是一条条平行的弯线，不是一格格的短横
  float wv = floor(1.4 * sin(p.x * 0.21) * sin(p.x * 0.047 + 1.3) + 0.5);
  float y = p.y - wv;
  float r = floor(y / R);
  float gy = y - r * R;
  float seg = uElA.x;
  float sx = p.x + eh(vec2(r, 9.0)) * 40.0;
  float si = floor(sx / seg);
  float gx = sx - si * seg;
  float h = eh(vec2(si, r) + 1.0);
  float len = 3.0 + floor(h * (seg - 4.0));
  float st = floor(eh(vec2(si, r) + 3.0) * (seg - len));
  if (eh(vec2(si, r) + 5.0) < dens) {
    if (gy < 0.5 && gx >= st && gx < st + len) c = uSeamC[b];
    else if (gy > 0.5 && gy < 1.5 && gx >= st + 1.0 && gx < st + len - 1.0 + step(0.5, h)) c = uHiC[b];
  }
  return c;
}
// 碎石：每 7×5 纹素一格，概率 k：两纹素强调色（石身）+ 上面一纹素亮边
vec3 ePebbles(int b, vec2 p, float k, vec3 c) {
  vec2 cs = vec2(7.0, 5.0);
  vec2 cell = floor(p / cs);
  if (eh(cell + 43.0) >= k) return c;
  vec2 o = floor(vec2(eh(cell + 41.0), eh(cell + 42.0)) * (cs - vec2(2.0, 1.0)));
  vec2 d = p - cell * cs - o;
  if (d.y == 0.0 && (d.x == 0.0 || d.x == 1.0)) c = uElX[b];
  else if (d.y == 1.0 && d.x == (eh(cell + 44.0) < 0.5 ? 0.0 : 1.0)) c = uHiC[b];
  return c;
}

vec3 elemShade(int b, vec3 Nw) {
  vec2 p = eScr(vElemP);
  vec2 pUp = p + vec2(0.0, 1.0);
  #ifdef ELEM_WALL
    // 墙：uv（米）→ 屏幕纹素（x 沿墙，y 朝上，0 = 墙顶）；上一个纹素用 dFdy（弯墙、斜墙都对）
    vec2 e = vec2(vElemUv.x, -vElemUv.y * eRpm()) / uTexel;
    vec2 eU = e + dFdy(e);
    p = floor(e);
    pUp = floor(eU);
  #endif
  // 纹素中心的世界 xz（斑块噪声用，保证一纹素一个颜色）
  vec2 wq = eTexW(vElemP.xz);
  float pd = smoothstep(0.42, 0.72, efbm(wq / max(uElB.z, 0.1) + 3.1));
  float dens = mix(uElB.x, uElB.y, pd);
  vec3 c = eTone(b, 0);

  #if defined(ELEM_STONES)
    // 石块（Voronoi，size 纹素），每块自己的深浅，缝 seam 纹素；hi = 有上沿亮边的石块比例
    vec2 cur = eVoroEl(p, uElA.xy, uElA.z);
    vec2 up = eVoroEl(pUp, uElA.xy, uElA.z);
    if (eh(vec2(cur.x * 91.0, 3.0)) >= uElA.w) up = vec2(cur.x, 0.0);
    c = eElemCol(cur, up, b);

  #elif defined(ELEM_STRATA)
    // 沉积岩层（墙）：一层 size.y ± 1 行，层与层之间一行缝（偶尔断），每层里是宽 size.x 左右的石块（竖缝八成有）。
    // 每块石头自己一个深浅：按"高一级 → 本色 → 低一级"轮着取（层只挪起点，三成的块跳一格），相邻两块几乎总是不一样
    // （第二轮审查：整层一个色 → 远看一条暗带，石块读不出来）；缝下面那行（hi 的比例）= 这块石头的"上一级"
    // （低 → 本、本 → 高、高 → 亮边色）：每块石头上沿一条斜光，不是全墙一样的亮线。
    // 墙顶第一行是唇下的暗线；成簇的列往下淌 1～3 行沙（强调色）。矮墙（露出 < q.x 行）= 实心一条 + 暗线 + 淌沙。
    float ex = p.x;
    float ry = -p.y - 1.0; // 离墙顶第几行（0 = 第一行）
    float expo = 1e4;
    #ifdef ELEM_ATTR
      expo = vElemA.x * eRpm() / uTexel;
    #endif
    if (expo < uElQ.x) {
      c = eTone(b, 0);
    } else {
      float wob = floor((evn(vec2(ex * 0.045, 1.3)) - 0.5) * 3.0 + 0.5);
      float y = ry + wob - 1.0;
      float cs = 0.0;
      float ch = uElA.y;
      float ci = 0.0;
      for (int k = 0; k < 24; k++) {
        ch = uElA.y + floor(eh(vec2(float(k), 5.0)) * 3.0) - 1.0;
        ci = float(k);
        if (y < cs + ch) break;
        cs += ch;
      }
      float gy = y - cs;
      float w = uElA.x * (0.75 + 0.6 * eh(vec2(ci, 7.0)));
      float sx = ex + eh(vec2(ci, 8.0)) * 37.0;
      float bi = floor(sx / w);
      float gx = sx - bi * w;
      float bid = eh(vec2(bi, ci) + 11.0);
      float kk = mod(bi + floor(eh(vec2(ci, 12.0)) * 3.0) + step(bid, 0.3), 3.0);
      int kb = kk < 0.5 ? 1 : (kk < 1.5 ? 0 : 2);
      c = eTone(b, kb);
      vec3 topC = kb == 2 ? eTone(b, 0) : (kb == 0 ? eTone(b, 1) : uHiC[b]);
      bool seamRow = gy >= ch - 1.0 && evn(vec2(ex * 0.16, ci * 3.1)) > 0.2;
      bool joint = gx < 1.0 && eh(vec2(bi, ci) + 13.0) < 0.8;
      bool prevSeam = ci > 0.5 && evn(vec2(ex * 0.16, (ci - 1.0) * 3.1)) > 0.2;
      if (seamRow || joint) c = uSeamC[b];
      else if (gy < 1.0 && gy >= 0.0 && prevSeam && eh(vec2(bi, ci) + 14.0) < uElA.w) c = topC;
    }
    if (ry < 1.0) c = uSeamC[b];
    // 淌下来的沙：只在高墙上（露出 ≥ q.y 行；矮墙上挂东西 = 一排梳齿），成簇的列，1～3 行
    if (expo >= uElQ.y && evn(vec2(ex * 0.22, 2.0)) > 0.62 && eh(vec2(ex, 3.0)) < 0.45 && ry < 1.0 + floor(eh(vec2(ex, 4.0)) * 3.0))
      c = uElX[b];

  #elif defined(ELEM_PLANKS)
    // 板条：沿本地轴 p.xyz 每 p.w 米一块板；缝 seam 纹素，缝后一纹素顺着板的亮条（每 5 纹素一段，22% 断开）；q.x = 物件缩放
    float sk = uElQ.x > 0.0 ? uElQ.x : 1.0;
    float a = dot(vElemL, uElP.xyz) / uElP.w;
    float id = floor(a);
    float f = fract(a) * uElP.w * sk / uTexel;
    float along = dot(vElemL, vec3(1.0) - abs(uElP.xyz)) * sk / uTexel;
    if (f < uElA.z) c = uSeamC[b];
    else if (f < uElA.z + 1.0 && uElA.w > 0.0 && eh(vec2(id, floor(along / 5.0))) > 0.22) c = uHiC[b];
    else c = eToneOf(b, eh(vec2(id, 11.0)));

  #elif defined(ELEM_LEAVES)
    // 叶团：屏幕上 size.x 纹素的 Voronoi 格，每团一个元素；hi 比例的团画上沿亮边（全画 = 一条条横线）
    vec2 lo = vec2(floor(vElemP.y * 0.5) * 3.7);
    vec3 lv = evoro(p / uElA.x + lo);
    vec3 lu = evoro(pUp / uElA.x + lo);
    c = eToneOf(b, lv.z);
    if (abs(lu.z - lv.z) > 1e-5 && eh(vec2(lv.z * 97.0, 2.0)) < uElA.w) c = uHiC[b];

  #elif defined(ELEM_BLADES)
    // 草叶：竖向 1 × 2～4 纹素的亮划，疏密按斑块
    float blen = 2.0 + step(0.6, eh(vec2(p.x, 3.0))) + step(0.85, eh(vec2(p.x, 4.0)));
    vec2 cell = vec2(p.x, floor((p.y + eh(vec2(p.x, 1.0)) * 3.0) / blen));
    if (eh(cell + 17.0) < dens) c = uHiC[b];

  #elif defined(ELEM_RIPPLES)
    // 沙地：大块安静的本色 + 低频深/浅沙斑（mottle）+ 按斑块疏密的沙纹 + 零星碎石。
    // 深沙斑 = 矮沙丘朝镜头的背风坡：上沿（屏幕上一行已经不在斑里）一纹素亮边 = 迎光的丘顶，断续（约七成）
    if (uElB.w > 0.0) {
      float th = 0.74 - 0.18 * uElB.w;
      float m = efbm(wq * 0.21 + 7.7);
      if (m > th) {
        c = eTone(b, 2);
        float mu = efbm(eTexW(vElemP.xz - eDn()) * 0.21 + 7.7);
        if (mu <= th && evn(vec2(p.x * 0.19, 5.0)) > 0.3) c = uHiC[b];
      } else if (efbm(wq * 0.17 + 21.3) > th + 0.03) c = eTone(b, 1);
    }
    // 投影里（暗档）沙纹段的密度 20% → 50%（亮档 1.5% → 42%）：大块紫影里没有丘顶亮边、深浅斑也弱，
    // 只靠沙纹撑纹理；斑块之间照样 2.5 倍疏密（第二轮审查：大片紫影是平的）
    c = eRipples(b, p, b == 0 ? mix(0.2, max(uElB.y + 0.08, 0.2), pd) : dens, c);

  #elif defined(ELEM_PEBBLES)
    // 踩实的土路：有机形状的深浅土团（fbm 两道阈值，块约 size 纹素）、只在少数地方有龟裂（Voronoi 缝，seam 纹素）、
    // 脚印（成对的 2×1 压痕）、嵌着的碎石（pebbles）
    float pt = efbm(wq / (uElA.xy * uTexel) + 2.3);
    c = pt > 0.6 ? eTone(b, 1) : (pt < 0.42 ? eTone(b, 2) : eTone(b, 0));
    vec2 cur = eVoroEl(p, uElA.xy * 0.8, uElA.z);
    if (cur.y > 0.5 && efbm(wq * 0.45 + 5.0) > 0.6) c = uSeamC[b];
    vec2 fs = vec2(11.0, 8.0);
    vec2 fc = floor(p / fs);
    if (eh(fc + 51.0) < dens) {
      vec2 o = floor(vec2(eh(fc + 52.0), eh(fc + 53.0)) * vec2(5.0, 4.0));
      vec2 d = p - fc * fs - o;
      if ((d.y == 0.0 && d.x >= 0.0 && d.x < 2.0) || (d.y == 2.0 && d.x >= 3.0 && d.x < 5.0)) c = eTone(b, 2) * 0.94;
    }

  #elif defined(ELEM_PAINT)
    // 硬地丙烯：一片片有机形状（fbm 按纹素中心取、两道阈值，块约 size 纹素）的轻微深浅 + 很少的擦痕（每 3 行一行候选，2～5 纹素，缝色）
    float pt = efbm(wq / (uElA.xy * uTexel) + 4.1);
    c = pt > 0.6 ? eTone(b, 1) : (pt < 0.4 ? eTone(b, 2) : eTone(b, 0));
    if (mod(p.y, 3.0) < 0.5) {
      float r = floor(p.y / 3.0);
      float sx = p.x + eh(vec2(r, 9.0)) * 40.0;
      float si = floor(sx / 14.0);
      float gx = sx - si * 14.0;
      if (eh(vec2(si, r) + 5.0) < dens && gx < 2.0 + floor(eh(vec2(si, r)) * 4.0)) c = uSeamC[b];
    }

  #elif defined(ELEM_TREADS)
    // 台阶（池塘 KIND_STAIRS）：p = (顶端 x, z, 朝下的方向 / 每级长)，q = (级数, 顶面高, 每级高, -)，size = 石条长 min/max（纹素）
    // 踏面：每级分几段石条，前沿一行长短不一的磨亮条（越往下越多），前后两行高一级；立面：最上面一行暗线 + 暗档石条
    float rpm = eRpm();
    bool tread = Nw.y > 0.5;
    float spos = dot(vElemP.xz - uElP.xy, uElP.zw) - (tread ? 0.0 : 0.02);
    float st = floor(spos);
    float k01 = clamp(st / max(uElQ.x - 1.0, 1.0), 0.0, 1.0);
    float w = uElA.x + floor(eh(vec2(st, 1.0)) * (uElA.y - uElA.x + 1.0));
    float sx = p.x + eh(vec2(st, 4.0)) * 31.0;
    float si = floor(sx / w);
    float gx = sx - si * w;
    float id = eh(vec2(si, st) + 8.0);
    if (tread) {
      vec2 dn = eDn(); // 地面上往屏幕下挪一行
      bool front = floor(dot(vElemP.xz + dn - uElP.xy, uElP.zw)) > st;
      bool back = floor(dot(vElemP.xz - dn - uElP.xy, uElP.zw)) < st;
      float a0 = floor(eh(vec2(si, st) + 2.0) * w * 0.5);
      float al = 3.0 + floor(eh(vec2(si, st) + 5.0) * max(w * 0.8 - 3.0, 0.0));
      bool streak = front && eh(vec2(si, st) + 6.0) < mix(0.25, 0.6, k01) && gx >= a0 && gx < a0 + al;
      if (gx < 1.0 && !streak && eh(vec2(si, st) + 7.0) < 0.55) c = uSeamC[b];
      else if (streak) {
        vec3 hi = mix(eTone(b, 1), uHiC[b], mix(0.55, 1.0, smoothstep(0.25, 0.6, k01)));
        c = (gx == a0 || gx == a0 + al - 1.0) ? mix(hi, eTone(b, 1), 0.45) : hi;
      } else if (front || back) c = eTone(b, 1);
      else {
        float t = fract(id * 13.37 + 0.21);
        c = t < mix(0.45, 0.2, k01) ? eTone(b, 2) : (t > mix(0.82, 0.62, k01) ? eTone(b, 1) : eTone(b, 0));
      }
    } else {
      float topY = uElQ.y - uElQ.z * (st + 1.0);
      float rr = floor((topY - vElemP.y) * rpm / uTexel);
      if (rr < 1.0 || (gx < 1.0 && eh(vec2(si, st) + 9.0) < 0.4)) c = uSeamC[b];
      else c = eh(vec2(si, st) + 31.0) < 0.7 ? eTone(b, 0) : eToneOf(b, eh(vec2(si, st) + 32.0));
    }

  #elif defined(ELEM_DRIFT)
    // 场上的积沙：迎风坡（法线朝 p.xy 的反方向）上有沙纹（密度 density[1]），背风脚下一圈暗边（alphaMap 的 b 通道）
    if (dot(Nw.xz, normalize(uElP.xy)) < -0.03) c = eRipples(b, p, uElB.y, c);
    #ifdef USE_ALPHAMAP
      if (texture2D(alphaMap, vAlphaMapUv).b > 0.5) c = uSeamC[b];
    #endif

  #elif defined(ELEM_WATER)
    // 水面（池塘 water.ts 的配方）：底色 + 横向拉长的斑块（高一级/低一级）+ 北岸脚下的天光亮带（亮边色）+ 中间深处（缝色）
    float nd = 9.0;
    float sd = 9.0;
    #ifdef ELEM_ATTR
      nd = vElemA.x;
      sd = vElemA.y;
    #endif
    float bl = efbm(vec2(wq.x * 0.8, wq.y * 1.5) + vec2(uTime * 0.03, uTime * 0.01)) + (eh(p) - 0.5) * 0.05;
    float bnd = smoothstep(2.0, 0.25, nd) * 0.75 + (bl - 0.5) * 0.9;
    if (bnd > 0.6) c = uHiC[b];
    else if (bnd > 0.4 || bl > 0.64) c = eTone(b, 1);
    else if (sd > 1.4 && bl < 0.36) c = uSeamC[b];
    else if (bl < 0.47) c = eTone(b, 2);

  #elif defined(ELEM_DASH)
    // 虚线（泡沫圈）：每行按 size.x 纹素分段，段头 1～size.y 纹素是空（强调色，比如水色）
    float sx = p.x + eh(vec2(p.y, 4.0)) * 30.0;
    float si = floor(sx / uElA.x);
    float gx = sx - si * uElA.x;
    if (gx < 1.0 + floor(eh(vec2(si, p.y)) * uElA.y)) c = uElX[b];
  #endif

  if (uElPeb > 0.0) c = ePebbles(b, p, uElPeb * (0.35 + 1.3 * pd), c);
  return c;
}
#endif
`;

const RAMP_OUT = /* glsl */ `
{
  // 光：取第一个平行光（太阳），视空间
  vec3 Ls = vec3(0.0, 1.0, 0.0);
  vec3 sunCol = vec3(1.0);
  #if NUM_DIR_LIGHTS > 0
    Ls = directionalLights[0].direction;
    sunCol = directionalLights[0].color;
  #endif
  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.35, 0.0)).xyz);
  vec3 Ld = normalize(mix(Ls, upV, uLightUp));
  vec3 Nn = normalize(normal);
  float l = dot(Nn, Ld);
  // 档位交界噪声：竖向笔触（x、z 每纹素，y 每三纹素）
  float nz = rhash13(floor(vWorldP * vec3(1.0, 0.34, 1.0) / uTexel)) - 0.5;
  #ifdef ELEM_LEAVES
    // 叶团：档位交界按叶团（屏幕 Voronoi 格）走，一小团一小团地切开亮/中/暗
    {
      vec2 lp = eScr(vElemP);
      vec3 lv = evoro(lp / uElA.x + vec2(floor(vElemP.y * 0.5) * 3.7));
      nz = (lv.z - 0.5) * 0.85 + (eh(lp + 0.5) - 0.5) * 0.3;
    }
  #endif
  l += nz * uNoise * uNoiseK;
  float band = l < uBands.x ? 0.0 : (l < uBands.y ? 1.0 : 2.0);
  // 投影：PCF 后取阈值，阈值按竖向笔触抖（影子边缘带"毛"）
  float sh = 1.0;
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    if (receiveShadow && uNoRecv < 0.5) {
      DirectionalLightShadow s0 = directionalLightShadows[0];
      float v = getShadow(directionalShadowMap[0], s0.shadowMapSize, 1.0, s0.shadowBias, s0.shadowRadius, vDirectionalShadowCoord[0]);
      float fur = rhash12(vec2(floor(vWorldP.x / uTexel), floor(vWorldP.z / uTexel / 2.0)) + 5.0) - 0.5;
      sh = uShadowHard > 0.5 ? step(0.5 + fur * uFur, v) : v;
    }
  #endif
  if (sh < 0.5) band = 0.0;
  // 云影（池塘的教训：手摆、硬边、纹理在里面接着走）：亮档整档换成中档那套颜色（元素、缝、亮边照画），
  // 边上最多一纹素的棋盘抖动；只压亮档（侧面、投影本来就不吃直射光）。亮 → 中只差 35～40 个亮度，不出强边缘。
  if (uCloudStrength > 0.0 && band > 1.5) {
    float cr = cloudR(vCloudXZ);
    if (cr < 1.0) band = 1.0;
    else if (cr - fwidth(cr) < 1.0) {
      vec2 ck = floor((mat3(viewMatrix) * vWorldP).xy / uTexel + 0.25);
      if (mod(ck.x + ck.y, 2.0) < 0.5) band = 1.0;
    }
  }

  vec3 base = diffuseColor.rgb;
  vec3 lit, mid, dark;
  if (uHasRamp > 0.5) {
    lit = uRampLit * base;
    mid = uRampMid * base;
    dark = uRampDark * base;
  } else {
    lit = base;
    mid = coolShade(base, 0.15, 0.84, 0.9);
    dark = coolShade(base, 0.45, 0.6, 0.85);
  }
  if (uLightModel > 0.5) {
    mid = base * 0.78;
    dark = base * 0.55;
  }
  vec3 col = band > 1.5 ? lit : (band > 0.5 ? mid : dark);
  #ifdef ELEM
    // 元素：本档三色 + 缝 + 亮边（投影已经把 band 压到 0、云影压到 1：整套换那一档的颜色，纹理照样在）
    col = elemShade(int(band + 0.5), inverseTransformDirection(Nn, viewMatrix)) * base;
  #endif
  // 太阳色（日出日落偏暖、夜里偏暗）：只影响亮档，按最大分量归一
  float sm = max(max(sunCol.r, sunCol.g), max(sunCol.b, 1e-3));
  if (band > 1.5) col *= mix(vec3(1.0), sunCol / sm, 0.35);
  col += totalEmissiveRadiance;
  gl_FragColor = vec4(col, diffuseColor.a);
}
`;

function patchVertex(
  shader: THREE.WebGLProgramParametersWithUniforms,
  u: SharedUniforms,
  sway: number,
  swayH: number,
  sphere: [number, number, number] | null,
) {
  shader.uniforms.uTime = u.uTime;
  shader.uniforms.uWind = u.uWind;
  shader.uniforms.uGust = u.uGust;
  shader.uniforms.uSway = { value: sway };
  shader.uniforms.uSwayH = { value: swayH };
  shader.uniforms.uSphere = { value: sphere ? 1 : 0 };
  shader.uniforms.uSphereC = { value: new THREE.Vector3(...(sphere ?? [0, 0, 0])) };
  let vs = shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERT);
  if (vs.includes('#include <beginnormal_vertex>')) vs = vs.replace('#include <beginnormal_vertex>', SPHERE_NORMAL);
  shader.vertexShader = SWAY_VERT_DECL + vs;
}

/** 材质缓存键里 elem/tones 那一段 */
function elemKey(o: ToonOpts): string | null {
  if (!o.elem || o.elem.kind === 'none') return null;
  const hex = (c: Hex) => new THREE.Color(c).getHex();
  const t = o.tones;
  return JSON.stringify([
    o.elem,
    o.elem.accent?.map(hex),
    t ? [t.bands.map((b) => b.map(hex)), t.seam.map(hex), t.hi.map(hex)] : null,
    o.toneW,
  ]);
}

/** elem → defines + uniforms（tones 从 [亮, 中, 暗] 翻成 shader 里的 band 0 暗 … 2 亮） */
function elemSetup(
  o: ToonOpts,
  ramp: [THREE.Color, THREE.Color, THREE.Color] | undefined,
  color: THREE.ColorRepresentation,
): { defines: Record<string, string>; uniforms: Record<string, { value: unknown }> } | null {
  if (!o.elem || o.elem.kind === 'none') return null;
  const e: Elem = { ...ELEM_DEFAULTS[o.elem.kind], ...o.elem };
  const r: [Hex, Hex, Hex] = ramp
    ? [ramp[0], ramp[1], ramp[2]]
    : (() => {
        const c = new THREE.Color(color);
        return [c, c.clone().multiplyScalar(0.8), c.clone().multiplyScalar(0.6)];
      })();
  const t = o.tones ?? autoTones(r);
  const col = (h: Hex) => new THREE.Color(h);
  const byBand = <T>(a: [T, T, T]) => [a[2], a[1], a[0]];
  const defines: Record<string, string> = { ELEM: '', [`ELEM_${e.kind.toUpperCase()}`]: '' };
  const space = e.space ?? 'screen';
  if (space === 'wall') defines.ELEM_WALL = '';
  if (space === 'local') defines.ELEM_LOCAL = '';
  if (e.attr) defines.ELEM_ATTR = '';
  const size = e.size ?? [8, 6];
  return {
    defines,
    uniforms: {
      uTone: { value: byBand(t.bands).flatMap((b) => b.map(col)) },
      uSeamC: { value: byBand(t.seam).map(col) },
      uHiC: { value: byBand(t.hi).map(col) },
      uElX: { value: byBand(e.accent ?? t.seam).map(col) },
      uToneW: { value: new THREE.Vector2(...(o.toneW ?? [0.28, 0.24])) },
      uElA: { value: new THREE.Vector4(size[0], size[1], e.seam ?? 0, e.hi ?? 0) },
      uElB: {
        value: new THREE.Vector4(e.density?.[0] ?? 0, e.density?.[1] ?? 0, e.patch ?? 3, e.mottle ?? 0),
      },
      uElP: { value: new THREE.Vector4(...(e.p ?? [0, 0, 0, 0])) },
      uElQ: { value: new THREE.Vector4(...(e.q ?? [0, 0, 0, 0])) },
      uElPeb: { value: e.pebbles ?? 0 },
      uElSeed: { value: e.seed ?? 0 },
    },
  };
}

function makeGradient(): THREE.DataTexture {
  const levels = [70, 70, 150, 150, 255, 255];
  const data = new Uint8Array(levels.length * 4);
  for (let i = 0; i < levels.length; i++) data.set([levels[i], levels[i], levels[i], 255], i * 4);
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function createMats(u: SharedUniforms, texelMeters: () => number): Mats {
  const gradient = makeGradient();
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const globals: Mats['globals'] = {
    uFur: { value: 0.8 },
    uShadowHard: { value: 1 },
    uNoiseK: { value: 1 },
    uLightModel: { value: 0 },
  };
  const uTexel = { value: texelMeters() };
  // 缩放会变纹素大小：每帧开头由 main 调 texelMeters 刷新
  Object.defineProperty(uTexel, 'value', { get: texelMeters });

  const toon: Mats['toon'] = (color, opts = {}) => {
    const sway = opts.sway ?? 0;
    const swayH = opts.swayH ?? 1;
    const sphere: [number, number, number] | null =
      opts.sphereNormals === true ? [0, 0, 0] : Array.isArray(opts.sphereNormals) ? opts.sphereNormals : null;
    const ramp = opts.ramp?.map((c) => new THREE.Color(c)) as [THREE.Color, THREE.Color, THREE.Color] | undefined;
    const edge = opts.edge ?? 0.6;
    const convex = opts.convex ?? 0.5;
    const key =
      opts.map || opts.alphaMap
        ? null
        : JSON.stringify([
            new THREE.Color(color).getHex(),
            sway,
            swayH,
            !!opts.vertexColors,
            opts.alphaTest,
            opts.side,
            opts.emissive,
            ramp?.map((c) => c.getHex()),
            opts.bands,
            opts.noise,
            edge,
            convex,
            opts.lightUp,
            sphere,
            opts.noShadowReceive,
            elemKey(opts),
          ]);
    if (key && cache.has(key)) return cache.get(key)!;

    // 颜色管理关了：sRGB 贴图不让 GPU 再解码，原值就是调色板
    for (const t of [opts.map, opts.alphaMap]) {
      if (t && t.colorSpace === THREE.SRGBColorSpace) {
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
      }
    }

    const m = new THREE.MeshToonMaterial({
      color: ramp ? 0xffffff : color,
      gradientMap: gradient,
      vertexColors: !!opts.vertexColors,
      map: opts.map ?? null,
      alphaMap: opts.alphaMap ?? null,
      alphaTest: opts.alphaTest ?? 0,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000,
    });
    m.onBeforeCompile = (shader) => {
      patchVertex(shader, u, sway, swayH, sphere);
      Object.assign(shader.uniforms, {
        uClouds: u.uClouds,
        uCloudVel: u.uCloudVel,
        uCloudStrength: u.uCloudStrength,
        uRampLit: { value: ramp?.[0] ?? new THREE.Color(1, 1, 1) },
        uRampMid: { value: ramp?.[1] ?? new THREE.Color(1, 1, 1) },
        uRampDark: { value: ramp?.[2] ?? new THREE.Color(1, 1, 1) },
        uHasRamp: { value: ramp ? 1 : 0 },
        uBands: { value: new THREE.Vector2(...(opts.bands ?? [0.1, 0.5])) },
        uNoise: { value: opts.noise ?? 0 },
        uLightUp: { value: opts.lightUp ?? 0 },
        uTexel,
        uNoRecv: { value: opts.noShadowReceive ? 1 : 0 },
        ...globals,
      });
      if (el) Object.assign(shader.uniforms, el.uniforms);
      shader.fragmentShader =
        `#define CLOUD_N ${CLOUD_N}\n#define CLOUD_W ${CLOUD_W.toFixed(1)}\n` +
        RAMP_FRAG_DECL +
        shader.fragmentShader
          .replace('void main() {', `${ELEM_FRAG_DECL}\nvoid main() {`)
          .replace('#include <opaque_fragment>', RAMP_OUT);
    };
    const el = elemSetup(opts, ramp, color);
    // MeshToonMaterial 运行时有 defines（{ TOON: '' }），类型里没写
    const md = m as THREE.MeshToonMaterial & { defines?: Record<string, string> };
    if (el) md.defines = { ...md.defines, ...el.defines };
    m.customProgramCacheKey = () => `ramp-v2${el ? `:${Object.keys(el.defines).join(',')}` : ''}`;

    // 法线 pass：同样的形变；alpha = 描边强度（法线材质不支持 alphaMap：镂空卡片请放 FX 图层）
    const nm = new THREE.MeshNormalMaterial({ side: opts.side ?? THREE.FrontSide });
    nm.opacity = packEdge(edge, convex);
    // 不透明的 NormalBlending 材质会被 three 编译成 OPAQUE（alpha 强制为 1），描边强度就丢了；NoBlending 才能把 alpha 写进法线 RT
    nm.blending = THREE.NoBlending;
    nm.onBeforeCompile = (shader) => patchVertex(shader, u, sway, swayH, sphere);
    nm.customProgramCacheKey = () => 'normal-ramp';
    m.userData.normalMat = nm;

    if (sway > 0 || opts.alphaMap) {
      const dm = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        alphaMap: opts.alphaMap ?? null,
        alphaTest: opts.alphaTest ?? 0,
        side: opts.side ?? THREE.FrontSide,
      });
      dm.onBeforeCompile = (shader) => patchVertex(shader, u, sway, swayH, null);
      dm.customProgramCacheKey = () => 'depth-sway';
      m.userData.depthMat = dm;
    }
    if (key) cache.set(key, m);
    return m;
  };

  const prepare: Mats['prepare'] = (root, opts = {}) => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const dm = mat?.userData.depthMat as THREE.Material | undefined;
      if (dm) mesh.customDepthMaterial = dm;
    });
  };

  return { toon, prepare, gradient, globals };
}
