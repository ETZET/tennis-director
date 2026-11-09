// 色阶材质（自己写的 ShaderMaterial，不用 MeshToonMaterial）：
// - 光照只算一个数 l = dot(N, 太阳) + 噪声，按阈值分三档，三档颜色是**手挑的调色板**（暗档色相偏蓝绿/靛，不是亮档乘个系数）；
// - 投影来自 three 的阴影贴图（PCF 采样后再取阈值 → 影子边缘是圆滑的形状，不是阴影贴图的锯齿）；
// - kind 决定表面细节：ground（草地斑块、草叶短划、小花）、cliff（石块裂纹 + 顶上垂下来的草边）、path（石板路）、
//   foliage（树冠：亮暗交界处按纹素加竖向噪声 → "毛边"）、plain；
// - 冬天：法线朝上的面按噪声盖雪（换成雪的色阶）。
// - 材质规范（docs/lab/2026-11-07-3d-pixel/material-spec.md）：石块、木板、叶团、台阶石条都是"元素"，走同一套
//   Tones（3 档 × 3 色 + 缝 + 亮边）和 elemCol()；云影在细节之前换档，所以阴影里元素和缝都还在。
// 每个材质配一份"法线 pass"的孪生材质（同一份顶点代码），描边用。
import * as THREE from 'three';

export type Kind =
  | 'plain'
  | 'ground'
  | 'cliff'
  | 'path'
  | 'foliage'
  | 'wood'
  | 'stone'
  | 'rock'
  | 'deck'
  | 'stairs'
  | 'ridge'
  | 'lily'
  | 'crate';

type C3 = [number, number, number];
/**
 * 材质规范的调色板：3 档（暗、中、亮）× 3 色（本色、高一级、低一级）+ 每档的缝色和亮边色。
 * 元素（石块、板条、叶团）按 id 在本档三色里挑一个；元素上沿 1 纹素用亮边色；缝用缝色。
 * 进阴影 = 整套换成暗档那一套（元素、亮边、缝都还在）。不给就从 ramp 自动推（见 autoTones）。
 */
export interface Tones {
  /** 每档 [本色, 高一级, 低一级] */
  bands: [C3, C3, C3];
  /** 每档的缝色 */
  seam: C3;
  /** 每档的元素上沿亮边色 */
  hi: C3;
}

export interface RampOpts {
  /** 暗、中、亮三档（sRGB 十六进制） */
  ramp: [number, number, number];
  kind?: Kind;
  /** 次要色阶（ground：亮档的斑块变体/草叶色；cliff：顶上的草边；path：石缝） */
  alt?: [number, number, number];
  /** 档位阈值：l < t0 暗，< t1 中，否则亮 */
  bands?: [number, number];
  /** 档位交界的噪声幅度（foliage 默认 0.35） */
  noise?: number;
  /** 冬天是否盖雪（默认 true） */
  snow?: boolean;
  /** 描边：凸边高光强度倍数（法线 pass 的 alpha），默认 1；0 = 不参与描边 */
  edge?: number;
  /** 顶点风摆（aSway 属性 × 这个幅度，米） */
  sway?: number;
  side?: THREE.Side;
  /** 不受阴影（例如自己就是很薄的东西） */
  noShadow?: boolean;
  /** 明暗用的光往正上方偏多少（0..1，树冠用） */
  lightUp?: number;
  /** 盖雪的法线阈值（默认 0.55） */
  snowT?: number;
  /** 自发光（窗灯） */
  emissive?: boolean;
  /** wood：木板缝的方向（本地坐标轴）和间距（米） */
  plank?: [number, number, number, number];
  /** 不受云影 */
  noCloud?: boolean;
  /** 房顶东坡贴着屋脊的柔和影子（参数在 plank：[最宽, 渐变宽, 开始变宽的 z, 收回屋脊的 z]，房子本地米） */
  roofShade?: boolean;
  /** 叶子上撒零星的小白花（灌木） */
  specks?: boolean;
  /** 明暗用的光（只影响分档，不影响投影），例如房顶用东边的光让两坡一明一暗 */
  light?: [number, number, number];
  /** 元素调色板（材质规范）；不给就从 ramp/alt 推 */
  tones?: Tones;
  /** 元素取"高一级 / 低一级"的比例（其余是本色），默认 [0.28, 0.24] */
  toneW?: [number, number];
  /** 元素参数（按 kind 解释：元素尺寸等，见各 kind 的注释） */
  el?: [number, number, number, number];
  /**
   * foliage：灌木的画法（参考图逐行取色）—— 档位交界按 1×3 纹素的竖向"毛"抖动（顶上一圈短草须），
   * 最暗的底沿（l < 暗档阈值 − 0.45）换成 extra[0] 的暗边
   */
  bush?: boolean;
  /** 按 kind 解释的额外三色（cliff：[草沿亮边, 草沿下的深绿线, 短须]；foliage 灌木：[底沿暗边, -, -]；rock：[苔藓帽亮, 苔藓下沿/滴, 苔藓里的暗斑]） */
  extra?: [number, number, number];
}

export interface Shared {
  uTime: { value: number };
  uWind: { value: THREE.Vector2 };
  uSunDir: { value: THREE.Vector3 };
  /** 反射 pass：低于这个高度的片元丢掉 */
  uClipY: { value: number };
  /** 0 夏 1 秋 2 冬 3 春雨（材质里只用到"冬天盖雪"） */
  uSnow: { value: number };
  /** 投影是否取阈值（1 硬边、0 保留 PCF 的软边） */
  uShadowHard: { value: number };
  /** 档位交界噪声总开关（A/B 用） */
  uNoiseK: { value: number };
  /** 地面细节总开关（A/B 用） */
  uDetail: { value: number };
  /** 雪的色阶 */
  uSnowRamp: { value: THREE.Color[] };
  /** 光照模型：0 = 手挑三档；1 = 三档但暗档 = 亮档 × 0.55（不偏色）；2 = 连续 Lambert（不分档） */
  uLightModel: { value: number };
  /** 影子边缘抖动幅度（0 = 干净的边） */
  uFur: { value: number };
  /** 云影：几块手摆的椭圆（x, z, rx, rz，米），边缘是软的 */
  uClouds: { value: THREE.Vector4[] };
  /** 团影（栈桥上人、桶脚下）：x, z, rx, rz */
  uBlobs: { value: THREE.Vector4[] };
  uCloudK: { value: number };
  /** 亮档草叶短划的密度（秋天草长、密） */
  uGrassK: { value: number };
  /** 地上小花（秋冬没有）、落叶（秋天） */
  uFlowers: { value: number };
  uLeaves: { value: number };
}

export function makeShared(): Shared {
  return {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.6, 0.2) },
    // 太阳：照参考图树影实测（树冠中心 → 影子中心：往下 31 像素/米树高、几乎不往左偏）→ 正北偏上、仰角约 71°
    uSunDir: { value: new THREE.Vector3(0.04, 1, -0.34).normalize() },
    uClipY: { value: -1e9 },
    uSnow: { value: 0 },
    uShadowHard: { value: 1 },
    uNoiseK: { value: 1 },
    uDetail: { value: 1 },
    uSnowRamp: { value: [new THREE.Color(0xb0bdf1), new THREE.Color(0xc9d2f2), new THREE.Color(0xe4e9f3)] },
    uLightModel: { value: 0 },
    uFur: { value: 0.8 },
    uClouds: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uBlobs: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uCloudK: { value: 1 },
    uGrassK: { value: 0.012 },
    uFlowers: { value: 1 },
    uLeaves: { value: 0 },
  };
}

const VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
attribute float aSway;
attribute vec4 aPad;
uniform float uTime;
uniform vec2 uWind;
uniform float uSwayAmp;
varying vec4 vPad;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying vec3 vLocal;
varying float vAux;
#if defined(KIND_CLIFF) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  // 墙顶草沿要跟着它上面那块地面亮/暗：取墙顶往台面里退 0.1 米那一点的阴影坐标
  varying vec4 vTopShadow;
#endif
void main() {
  vAux = aSway;
  vPad = aPad;
  vec3 transformed = position;
  vec3 objectNormal = normal;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  vec4 worldPosition = M * vec4(transformed, 1.0);
  #ifdef USE_SWAY
    float ph = dot(worldPosition.xz, vec2(0.37, 0.23));
    float wv = 0.6 + 0.4 * sin(uTime * 2.1 + ph) + 0.2 * sin(uTime * 3.3 + ph * 1.7);
    worldPosition.xz += uWind * aSway * uSwayAmp * wv;
  #endif
  vWorld = worldPosition.xyz;
  vLocal = position;
  vNormalW = normalize(mat3(M) * objectNormal);
  vUv = uv;
  vec3 transformedNormal = normalMatrix * objectNormal;
  #ifdef USE_INSTANCING
    transformedNormal = normalMatrix * mat3(instanceMatrix) * objectNormal;
  #endif
  #include <shadowmap_vertex>
  #if defined(KIND_CLIFF) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    vTopShadow = directionalShadowMatrix[0] * vec4(worldPosition.xyz + vec3(0.0, uv.y, 0.0) - vNormalW * 0.1, 1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 3.3); }
// Voronoi：返回 (到最近点距离, 到次近边界的距离近似)
vec3 voro(vec2 p) {
  vec2 n = floor(p); vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2 - d1, hash12(id));
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
uniform vec3 uRamp[3];
uniform vec3 uAlt[3];
uniform vec3 uTone[9];
uniform vec3 uSeam[3];
uniform vec3 uHi[3];
uniform vec3 uExtra[3];
uniform vec2 uToneW;
uniform vec4 uEl;
uniform vec2 uBands;
uniform float uNoise;
uniform vec3 uSunDir;
uniform float uClipY;
uniform float uSnow;
uniform float uShadowHard;
uniform float uNoiseK;
uniform float uDetail;
uniform vec3 uSnowRamp[3];
uniform float uEdge;
uniform float uSnowOk;
uniform float uLightModel;
uniform float uTexel;
uniform float uFur;
uniform float uLightUp;
uniform float uSnowT;
uniform vec4 uPlank;
uniform vec4 uLightDir;
uniform vec4 uClouds[4];
uniform vec4 uBlobs[4];
uniform float uCloudK;
uniform float uGrassK;
uniform float uFlowers;
uniform float uLeaves;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying vec3 vLocal;
varying float vAux;
varying vec4 vPad;
#if defined(KIND_CLIFF) && defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
  varying vec4 vTopShadow;
#endif
${NOISE}

float sunShadow(float fur) {
  #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0 && !defined(NO_SHADOW)
    DirectionalLightShadow s = directionalLightShadows[0];
    float v = getShadow(directionalShadowMap[0], s.shadowMapSize, 1.0, s.shadowBias, s.shadowRadius, vDirectionalShadowCoord[0]);
    return uShadowHard > 0.5 ? step(0.5 + fur * uFur, v) : v;
  #else
    return 1.0;
  #endif
}

vec3 pick(vec3 r[3], float b) { return b < 0.5 ? r[0] : (b < 1.5 ? r[1] : r[2]); }

// ———— 材质规范的共用机制（每个材质的元素都走这几个函数） ————
// 元素 = vec2(id 哈希 0..1, 是否是缝)。元素的颜色：缝 → 本档缝色；上沿（屏幕上一个纹素是缝或别的元素）→ 本档亮边色；
// 否则按 id 在本档三色（本色 / 高一级 / 低一级）里挑。band 换成暗档 = 整套颜色换成暗档那套，纹理照样在。
vec3 toneOf(float band, float h) {
  int b = int(band) * 3;
  float t = fract(h * 13.37 + 0.21);
  return t < uToneW.x ? uTone[b + 1] : (t < uToneW.x + uToneW.y ? uTone[b + 2] : uTone[b]);
}
vec3 toneK(float band, int k) { return uTone[int(band) * 3 + k]; }
vec3 elemCol(vec2 cur, vec2 up, float band) {
  int b = int(band);
  if (cur.y > 0.5) return uSeam[b];
  if (up.y > 0.5 || abs(up.x - cur.x) > 1e-5) return uHi[b];
  return toneOf(band, cur.x);
}
// Voronoi 元素：p 是纹素坐标（屏幕纹素，y 朝上），cell = 元素大小（纹素，x/y 可不同），seam = 缝宽（纹素）
vec2 voroEl(vec2 p, vec2 cell, float seam, float seed) {
  vec3 v = voro(p / cell + seed);
  return vec2(v.z, v.y * min(cell.x, cell.y) < seam ? 1.0 : 0.0);
}

void main() {
  if (vWorld.y < uClipY) discard;
  vec3 N = normalize(vNormalW);
  #ifdef KIND_LILY
    // 睡莲缺口：几何体是整圆，缺口（θ ∈ (0, 0.2)）在这里挖掉；只挖外圈（uv 半径 > 0.3，缺口在那儿至少 1 纹素宽），
    // 尖是平的 —— 原来一直挖到叶心，尖上不到 1 纹素宽，留下零星透水的点和暗点（法线 pass 也要挖，描边才跟着缺口走）
    {
      vec2 cn = vUv - 0.5;
      float an = N.y > 0.5 ? atan(cn.y, cn.x) : vUv.x * 6.28318;
      if (vPad.w > 0.5 && an > -0.02 && an < 0.2 && (N.y <= 0.5 || length(cn) > 0.3)) discard;
      // 葫芦形两片叶子叠着的地方：上面那片的侧面在下面那片里面露出不到 1 纹素，成了一个暗点 + 一圈描边 → 侧面不画
      if (N.y <= 0.5 && vPad.z > 0.0 && length(0.5 * vec2(cos(an), sin(an)) - vPad.xy) < vPad.z) discard;
    }
  #endif
  #ifdef NORMAL_PASS
    gl_FragColor = vec4(N * 0.5 + 0.5, uEdge);
    return;
  #endif
  // 纹素网格上的世界坐标（地面细节按纹素取，才是"像素"）
  vec2 tc = floor(vWorld.xz / uTexel);
  // 屏幕对齐的纹素坐标（正交 45°：屏幕行 = (y - z)·cos45 / 纹素，y 朝上）——跟世界锚定，元素、缝、线都按它取，永远是整一纹素
  vec2 sc = floor(vec2(vWorld.x, (vWorld.y - vWorld.z) * 0.70711) / uTexel + 0.5);
  // 树冠等可以用一个更朝上的"假光"算明暗（影子仍然按真太阳）
  vec3 Ld = normalize(mix(uLightDir.w > 0.5 ? uLightDir.xyz : uSunDir, vec3(0.0, 1.0, 0.35), uLightUp));
  float ndl = dot(N, Ld);
  // 影子边缘的"毛"：阈值按竖向笔触抖动（x 每纹素、y 每两纹素）
  float fur = hash12(vec2(floor(vWorld.x / uTexel), floor(vWorld.z / uTexel / 2.0)) + 5.0) - 0.5;
  float sh = sunShadow(fur);
  float l = ndl;
  float nz = 0.0;
  vec3 vv = vec3(0.0);
  vec2 sp = vec2(0.0);
  #ifdef KIND_FOLIAGE
    sp = floor(vec2(vWorld.x, (vWorld.y - vWorld.z) * 0.70711) / uTexel);
    #ifdef BUSH
      // 灌木：竖向的"毛"（每列一个随机起点，1 纹素宽 × 3 行），亮/中、中/暗交界是一条条往下挂的短草须
      nz = hash12(vec2(sp.x, floor((sp.y + hash12(vec2(sp.x, 7.0)) * 3.0) / 3.0)) + 13.0) - 0.5;
      // 冬天盖了雪：雪堆是光滑的，毛只留一点
      if (uSnow > 1.5) nz *= 0.3;
    #else
      // 叶簇：按屏幕纹素坐标取 uEl.x（默认 2.6）纹素大小的 Voronoi 格子（一小团一小团），再加一点逐纹素的碎点
      vv = voro(sp / uEl.x + floor(vWorld.y * 0.5) * 3.7);
      nz = (vv.z - 0.5) * 0.85 + (hash12(sp + 0.5) - 0.5) * 0.3;
    #endif
  #else
    nz = hash12(tc) - 0.5;
  #endif
  l += nz * uNoise * uNoiseK;
  float band = l < uBands.x ? 0.0 : (l < uBands.y ? 1.0 : 2.0);
  // 投影：压到暗档
  float lit = sh;
  if (lit < 0.5) band = 0.0;

  // 云影：几块软边的大椭圆，飘得很慢。规范第 4 条：进云影 = 换成暗档那套颜色（细节照画），
  // 只有边上一圈（按纹素抖动）用"本色 → 暗档"的比例压暗，保留纹理。
  float cloudFringe = 0.0;
  float cloudCore = 0.0;
  float cs = 0.0;
  #ifndef NO_CLOUD
  if (uCloudK > 0.0) {
    vec2 cw = vWorld.xz - vec2(uTime * 0.05, uTime * 0.02);
    for (int i = 0; i < 4; i++) {
      vec4 c = uClouds[i];
      if (c.z <= 0.0) continue;
      vec2 d = (cw - c.xy) / c.zw;
      float r = length(d) + (fbm(cw * 0.35 + float(i) * 7.0) - 0.5) * 0.5;
      cs = max(cs, 1.0 - smoothstep(0.72, 1.0, r));
    }
    cs *= uCloudK;
    float dj = (hash12(sc + 23.0) - 0.5) * 0.3;
    cloudCore = cs + dj > 0.6 ? 1.0 : 0.0;
    if (band > 0.5) {
      if (cs + dj > 0.6) band = 0.0;
      else cloudFringe = floor(clamp((cs - 0.12) / 0.5, 0.0, 1.0) * 3.0 + hash12(sc + 7.0) * 0.9) / 3.0;
    }
  }
  #endif

  vec3 col = pick(uRamp, band);
  float detail = uDetail;
  // 冬天盖了雪以后还要露出来的细节（栈桥的板缝）
  float keepLine = 0.0;

  #ifdef BUSH
    // 灌木的底沿：朝下最暗的那一圈换成暗边色（参考图灌木下三分之一是暗档，最下面 1～2 纹素更暗）
    if (l < uBands.x - 0.45 && uSnow < 1.5) col = uExtra[0];
  #endif

  #ifdef SPECKS
    // 灌木上零星的小白花/粉花（1 纹素，只在亮档和中档）
    {
      vec2 sp2 = floor(vec2(vWorld.x, (vWorld.y - vWorld.z) * 0.70711) / uTexel);
      float hs = hash12(sp2 + 71.0);
      if (band > 0.5 && hs < 0.012 && uSnow < 1.5) col = hash12(sp2 + 3.0) < 0.6 ? vec3(0.97, 0.95, 0.97) : vec3(0.95, 0.62, 0.72);
    }
  #endif

  #ifdef KIND_GROUND
    if (detail > 0.5) {
      // 亮草地基本是纯色；阴影里一片片竖着的亮草叶（按屏幕纹素：宽 1、长 2～3）。
      // 疏密按斑块变（参考图：阴影里约一半的地方几乎没有草叶（≈1%），密的斑块 20～30%）—— 处处一样密 = 一片噪点
      float blen = 2.0 + step(0.6, hash12(vec2(sc.x, 3.0)));
      vec2 cell = vec2(sc.x, floor((sc.y + hash12(vec2(sc.x, 1.0)) * 3.0) / blen));
      float h = hash12(cell + 17.0);
      float pch = fbm(vWorld.xz * 0.5 + 3.0);
      float pd = smoothstep(0.44, 0.7, fbm(vWorld.xz * 0.3 + 11.0));
      if (band < 0.5) {
        if (h < mix(0.01, 0.3, pd)) col = uAlt[0];
      } else if (band > 1.5) {
        // 秋天亮档的橄榄短划也按斑块变（密的地方 uGrassK，疏的地方 0.4 倍）
        if (h < (uGrassK > 0.1 ? uGrassK * mix(0.4, 1.0, pd) : uGrassK * smoothstep(0.55, 0.75, pch))) col = uAlt[1];
      }
      // 落叶（秋天）：零星的 1 纹素红/橙点
      if (uLeaves > 0.5 && hash12(tc + 41.0) < 0.012) col = hash12(tc + 9.0) < 0.5 ? vec3(0.78, 0.3, 0.16) : vec3(0.9, 0.55, 0.2);
      // 小花：一簇簇（3×3 纹素一格，只在少数斑块里），花头 1～2 纹素 + 下面 1 纹素深色茎
      vec2 fc = floor(tc / 3.0);
      vec2 fo = tc - fc * 3.0;
      float f = hash12(fc + 91.0);
      float fl = smoothstep(0.64, 0.8, fbm(vWorld.xz * 0.16 + 40.0));
      vec2 fp = floor(vec2(hash12(fc + 5.0), hash12(fc + 6.0)) * vec2(2.0, 1.0));
      if (f < 0.2 * fl && band > 0.5 && uSnow < 1.5 && uFlowers > 0.5) {
        float kind = hash12(fc + 3.0);
        vec3 head = kind < 0.6 ? vec3(0.91, 0.42, 0.36) : (kind < 0.85 ? vec3(0.98, 0.95, 0.9) : vec3(0.98, 0.82, 0.38));
        vec2 d = fo - fp;
        if (d.y == 0.0 && (d.x == 0.0 || (kind < 0.3 && d.x == 1.0))) col = head;
        else if (d.y == 1.0 && d.x == 0.0) col = band > 1.5 ? uAlt[1] : uAlt[0];
      }
    }
  #endif

  #ifdef KIND_CLIFF
    // 墙面：uv.x = 沿墙长度（米），uv.y = 离墙顶多深（米）。换成屏幕纹素（竖直 1 米 = 0.707/纹素 行）
    vec2 e = vec2(vUv.x, -vUv.y * 0.70711) / uTexel;
    float ey = vUv.y * 0.70711 / uTexel; // 离墙顶多少屏幕行
    // 这段墙在画面上露出几行（terrain.ts 写进 aPad.x 的米数）。规范：矮墙（< uEl.z 行）= 实心靛色石墙 + 草沿；
    // 只有高墙（池塘那圈）才挂长苔藓缕和中间的苔藓带 —— 矮墙上挂缕，45° 下就是一排梳齿/虚线
    bool tall = vPad.x * 0.70711 / uTexel > uEl.z;
    if (detail > 0.5) {
      // 不规则石块（uEl.xy 纹素，横长），每块自己的深浅，上沿亮边，缝 1 纹素
      vec2 cur = voroEl(e, uEl.xy, 1.0, 0.0);
      vec2 up = voroEl(e + vec2(0.0, 1.0), uEl.xy, 1.0, 0.0);
      col = elemCol(cur, up, band);
      // 墙中间一条长苔藓的带：沿墙起伏，粗 1～2 行，偶尔往下滴 1～3 行（只有高墙）
      if (uSnow < 1.5 && tall) {
        float lx = floor(e.x);
        float ld = (1.05 + 0.15 * sin(vUv.x * 0.7)) * 0.70711 / uTexel;
        float th = 1.0 + step(0.5, vnoise(vec2(lx * 0.18, 4.0)));
        float drip = step(0.82, hash12(vec2(lx, 21.0))) * (1.0 + floor(hash12(vec2(lx, 22.0)) * 3.0));
        float row = floor(ey - ld + 0.5);
        if (row >= 0.0 && row < th) col = uAlt[0];
        else if (row >= th && row < th + drip) col = uAlt[1];
      }
    }
    // 墙顶（参考图逐行取色）：1 行草沿亮边（比亮草还亮）→ 1 行深绿线 → 1～2 行青色短须（每列长短不一）→ 石墙；
    // 高墙再在短须下面挂成簇的长缕（0～7 行）
    {
      float lx = floor(e.x);
      float fr = 1.0 + floor(hash12(vec2(lx, 3.0)) * 1.8 * step(0.25, vnoise(vec2(lx * 0.4, 2.0))));
      float clump = tall ? step(0.35, vnoise(vec2(lx * 0.3, 9.0))) : 0.0;
      float h = hash12(vec2(lx, 5.0));
      float len = max(fr, clump * floor(h * h * 8.0));
      // 草沿跟着上面的台面：台面在树影/云影里时，亮边换成阴影里的草沿色（uAlt[2]）
      float lipLit = cs > 0.6 ? 0.0 : 1.0;
      #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow ls = directionalLightShadows[0];
        float tv = getShadow(directionalShadowMap[0], ls.shadowMapSize, 1.0, ls.shadowBias, ls.shadowRadius, vTopShadow);
        if (uShadowHard > 0.5 ? tv < 0.5 + fur * uFur : tv < 0.5) lipLit = 0.0;
      #endif
      if (ey < 1.0) col = lipLit > 0.5 ? uExtra[0] : uAlt[2];
      else if (ey < 2.0) col = uExtra[1];
      else if (ey < 2.0 + fr) col = uExtra[2];
      else if (ey < 2.0 + len) col = uAlt[1];
      // 冬天：1 行亮雪沿 + 1～2 行灰褐（雪下露出来的枯草），高墙的长缕上半截灰、下半截是冰溜（uAlt[1]）
      if (uSnow > 1.5 && ey < 2.0 + (tall ? len * 0.5 : fr)) col = ey < 1.0 ? uExtra[0] : (ey < 2.0 ? uExtra[1] : uExtra[2]);
    }
  #endif

  #ifdef KIND_PATH
    if (detail > 0.5) {
      if (N.y > 0.5) {
        // 石板（规范：Voronoi 石块 uEl.xy 纹素），每块自己的深浅、上沿亮边、缝 1 纹素；阴影里换暗档那套
        float sw = uEl.w > 0.0 ? uEl.w : 0.75;
        vec2 cur = voroEl(sc, uEl.xy, sw, 0.0);
        vec2 up = voroEl(sc + vec2(0.0, 1.0), uEl.xy, sw, 0.0);
        col = elemCol(cur, up, band);
      } else {
        // 石板的侧面（门前台阶）：暗档本色，每块一条竖缝
        col = mod(sc.x + floor(hash12(vec2(floor(sc.x / 9.0), 2.0)) * 9.0), 9.0) < 1.0 ? uSeam[0] : toneK(0.0, 2);
      }
    }
  #endif

  #ifdef KIND_STONE
    // 房子墙（规范：不规则石块，横长 uEl.xy 纹素），uv 按米 → 屏幕纹素；每块深浅不同，缝不规则（断续），上沿亮边
    if (detail > 0.5) {
      vec2 e = vec2(vUv.x, vUv.y * 0.70711) / uTexel * uEl.z;
      vec2 eu = e + dFdy(e);
      vec2 cur = voroEl(e, uEl.xy, 1.0, 0.0);
      vec2 up = voroEl(eu, uEl.xy, 1.0, 0.0);
      // 缝断续：低频噪声低的地方不画缝（两块石头直接挨着）
      cur.y *= step(0.16, vnoise(e * 0.22 + 3.0));
      up.y *= step(0.16, vnoise(eu * 0.22 + 3.0));
      // 亮边只在缝下面（两块石头直接挨着的地方不提亮），否则石墙满是横线
      col = elemCol(cur, vec2(cur.x, up.y), band);
    }
  #endif

  #ifdef KIND_ROCK
    // 苔藓帽（参考图：一整块有形状的苔藓搭在石头上半截，下沿 1 纹素深绿、几列往下滴 1～4 行，帽里零星几块暗斑；
    // 最顶上朝天的那面还是灰石头）。uPlank = (石头中心 x, 石顶 y, 中心 z, 半径)。不再是逐纹素 fbm 的碎点
    {
      float cx = floor(vWorld.x / uTexel);
      // 帽子偏向石头前面（朝镜头）：后半截顶上露灰石头
      float rr = length((vWorld.xz - uPlank.xz - vec2(0.0, 0.45)) / vec2(1.0, 0.8)) / uPlank.w;
      float edgeY = uPlank.y - (0.22 + 0.22 * vnoise(vec2(cx * 0.16, 3.0)));
      float drip = step(0.66, hash12(vec2(cx, 5.0))) * (1.0 + floor(hash12(vec2(cx, 6.0)) * 3.0)) * uTexel * 1.414;
      float wide = 0.62 + 0.1 * vnoise(vec2(cx * 0.2, 8.0));
      bool cap = vWorld.y > edgeY && rr < wide;
      bool dr = !cap && vWorld.y > edgeY - drip && rr < wide - 0.05 && N.z > 0.1;
      if (uSnow > 1.5) { if (cap) col = pick(uAlt, band); }
      else if (cap) {
        // 苔藓自己只分亮/中两档（背光的面也是中档绿，不是一块深色）
        col = vWorld.y < edgeY + uTexel * 1.414 ? uExtra[1] : (band > 0.5 ? uAlt[2] : uAlt[1]);
        if (hash12(sc + 61.0) < 0.06) col = uExtra[2];
      } else if (dr) col = uExtra[1];
    }
  #endif

  #ifdef KIND_WOOD
    // 木板（规范：板条宽 3～4 纹素）：沿 uPlank.xyz（本地轴）每 uPlank.w 米一块板；每块板自己的深浅，
    // 缝 1 纹素，缝后面 1 纹素是顺着板的亮条（偶尔断开）
    if (detail > 0.5) {
      float a = dot(vLocal, uPlank.xyz) / uPlank.w;
      float id = floor(a);
      float f = fract(a) * uPlank.w / (uTexel * uEl.z);
      float along = dot(vLocal, vec3(1.0) - abs(uPlank.xyz)) / (uTexel * uEl.z);
      float h = hash12(vec2(id, 11.0));
      if (f < 1.0) col = uSeam[int(band)];
      else if (f < 2.0 && hash12(vec2(id, floor(along / 5.0))) > 0.22) col = uHi[int(band)];
      else col = toneOf(band, h);
    }
  #endif

  #ifdef KIND_CRATE
    // 木箱（参考图是条板箱）：侧面横条板 + 条板之间的暗缝透出箱里的暗色，四角立柱；顶面 1～2 纹素箱沿 + 暗的箱里
    {
      vec3 hb = uPlank.xyz * 0.5;
      float ins = uTexel * 1.6;
      if (N.y > 0.5) {
        bool inner = abs(vLocal.x) < hb.x - ins && abs(vLocal.z) < hb.z - ins;
        col = inner ? (hash12(sc + 2.0) < 0.2 ? uAlt[1] : uAlt[0]) : uHi[int(band)];
      } else {
        float r = floor((vLocal.y + hb.y) * 0.70711 / uTexel);
        float side = abs(N.x) > abs(N.z) ? vLocal.z : vLocal.x;
        float hw = abs(N.x) > abs(N.z) ? hb.z : hb.x;
        bool post = abs(side) > hw - uTexel * 1.1;
        // 4 行一组：2 行板（上面那行是亮边）+ 2 行缝（透出箱里的暗色）
        float slat = mod(r, 4.0);
        if (post) col = toneK(band, 0);
        else if (slat > 1.5) col = slat > 2.5 ? uAlt[2] : uAlt[0];
        else col = slat > 0.5 ? uHi[int(band)] : toneOf(band, hash12(vec2(floor(r / 4.0), side > 0.0 ? 1.0 : 2.0)));
      }
    }
  #endif

  #ifdef KIND_LILY
    // 睡莲叶（规范：叶面 2～3 块深浅 + 上沿亮边 + 下沿暗边 + 缺口）。顶盖 uv 是 (cosθ, sinθ)·0.5 + 0.5，
    // 用屏幕上一格/下一格的 uv（dFdy）判断是不是叶子边；vPad.w = 1 的叶子有缺口（θ ∈ (0, 0.2)），
    // vPad.xyz = 叠着的另一片叶子（圆心、半径，uv 单位），在它里面不算出界（葫芦形中间没有边）
    if (N.y > 0.5) {
      vec2 du = dFdy(vUv);
      vec2 c0 = vUv - 0.5;
      #define LILY_RIM(c) (length(c) > 0.49 && !(vPad.z > 0.0 && length((c) - vPad.xy) < vPad.z - 0.01))
      #define LILY_OUT(c) (LILY_RIM(c) || (vPad.w > 0.5 && length(c) > 0.3 && atan((c).y, (c).x) > -0.02 && atan((c).y, (c).x) < 0.2))
      bool outUp = LILY_OUT(c0 + du);
      bool outDn = LILY_OUT(c0 - du);
      // 厚度那一行暗色只沿外圈（缺口两条边只有亮边，不然两条暗沿在尖上相交成一个暗点）
      bool outDn2 = LILY_RIM(c0 - 2.0 * du);
      float pn = vnoise(sc * 0.2 + 1.7);
      // 参考图：叶子一圈 1 纹素亮边（下沿也是），亮边下面那一行暗色是叶子的厚度（侧面）
      if (outUp || outDn) col = uHi[int(band)];
      else if (outDn2 || pn < 0.32) col = toneK(band, 2);
      else if (pn > 0.78) col = toneK(band, 1);
      else col = toneK(band, 0);
    } else {
      col = uSeam[int(band)];
    }
  #endif

  #ifdef KIND_DECK
    // 栈桥：朝上的面按屏幕行排（每 4 纹素一行），每行是一段段 1 纹素高、4～6 纹素长的深色短划，间隔 3～9 纹素
    if (detail > 0.5 && N.y > 0.5) {
      float prow = floor(sc.y / 4.0);
      float gy = sc.y - prow * 4.0;
      float seg = 11.0;
      float sx = sc.x + hash12(vec2(prow, 9.0)) * 40.0;
      float si = floor(sx / seg);
      float gx = sx - si * seg;
      float dl = 4.0 + floor(hash12(vec2(si, prow)) * 3.0);
      float st = floor(hash12(vec2(si, prow) + 3.0) * (seg - dl));
      if (gy < 0.5 && gx >= st && gx < st + dl) {
        col = uAlt[0];
        keepLine = 1.0;
        // 岸上那一段：缝里透出下面的草（短划后半截是绿的）
        if (vWorld.z > uPlank.x && gx >= st + dl - 2.0) col = vec3(0.47, 0.75, 0.36);
      }
    } else if (N.y <= 0.5) {
      col = band > 1.5 ? uAlt[1] : uAlt[2];
    }
    // 人、桶脚下的团影（硬边椭圆，压到暗档）
    for (int i = 0; i < 4; i++) {
      vec4 bl = uBlobs[i];
      if (bl.z <= 0.0) continue;
      vec2 d = (vWorld.xz - bl.xy) / bl.zw;
      if (dot(d, d) < 1.0 && N.y > 0.5) col = (col == uAlt[0] ? uAlt[0] * 0.92 : uRamp[0]);
    }
  #endif

  #ifdef KIND_STAIRS
    // 台阶（规范：每级踏面分成几段石条，长 uEl.y～uEl.z 纹素；踏面前沿一行有长短不一的磨亮条；往上逐级变暗）
    // uPlank = (顶端 x, z, 朝下的方向 / 每级长度)；uEl.x = 级数，uEl.w = 总高
    // 45° 俯视下踏面只露 1～2 行、立面露 2～3 行，所以立面也按石条分段、取暗档三色，最下一行是缝
    if (detail > 0.5) {
      float spos = dot(vWorld.xz - uPlank.xy, uPlank.zw) - (N.y > 0.5 ? 0.0 : 0.02);
      float st = floor(spos);
      float k = clamp(st / max(uEl.x - 1.0, 1.0), 0.0, 1.0); // 0 顶 1 底
      float w = uEl.y + floor(hash12(vec2(st, 1.0)) * (uEl.z - uEl.y + 1.0));
      float sx = sc.x + hash12(vec2(st, 4.0)) * 31.0;
      float si = floor(sx / w);
      float gx = sx - si * w;
      float id = hash12(vec2(si, st) + 8.0);
      if (N.y > 0.5) {
        // 屏幕下一行（世界 z + 1.414 纹素）是不是已经是下一级 → 本行是前沿
        float spB = dot(vWorld.xz + vec2(0.0, 1.42 * uTexel) - uPlank.xy, uPlank.zw);
        float spU = dot(vWorld.xz - vec2(0.0, 1.42 * uTexel) - uPlank.xy, uPlank.zw);
        bool front = floor(spB) > st;
        bool back = floor(spU) < st;
        float a0 = floor(hash12(vec2(si, st) + 2.0) * w * 0.5);
        float al = 3.0 + floor(hash12(vec2(si, st) + 5.0) * (w * 0.8 - 3.0));
        // 磨亮条（参考图：下面几级是很亮的 #b1b6e0，两头 1 纹素稍暗；上面几级暗一些、少一些）
        bool streak = front && hash12(vec2(si, st) + 6.0) < mix(0.2, 0.55, k) && gx >= a0 && gx < a0 + al;
        if (gx < 1.0 && !streak) col = uSeam[int(band)];
        else if (streak) {
          vec3 hi = mix(toneK(band, 1), uHi[int(band)], mix(0.55, 1.0, smoothstep(0.25, 0.6, k)));
          col = (gx == a0 || gx == a0 + al - 1.0) ? mix(hi, toneK(band, 1), 0.45) : hi;
        }
        else if (front || back) col = toneK(band, 1);
        else {
          // 逐级：上面几级偏"低一级"，下面几级偏"高一级"
          float t = fract(id * 13.37 + 0.21);
          col = t < mix(0.45, 0.2, k) ? toneK(band, 2) : (t > mix(0.82, 0.62, k) ? toneK(band, 1) : toneK(band, 0));
        }
      } else {
        // 立面：最上面一行（紧挨着上一级踏面的前沿）是一条清楚的暗线（参考图 #424675），下面是暗档本色为主的石条
        float hTop = uEl.w * (1.0 - st / uEl.x);
        float rr = floor((hTop - vWorld.y) * 0.70711 / uTexel);
        if (rr < 1.0 || (gx < 1.0 && hash12(vec2(si, st) + 9.0) < 0.4)) col = uSeam[0];
        else col = hash12(vec2(si, st) + 31.0) < 0.7 ? toneK(0.0, 0) : toneOf(0.0, hash12(vec2(si, st) + 32.0));
      }
    }
  #endif

  #ifdef KIND_RIDGE
    // 屋脊圆木：每 0.75 米一道深色箍
    if (fract(dot(vLocal, uPlank.xyz) / uPlank.w) < uTexel * 1.3 / uPlank.w) col = uAlt[0];
  #endif

  if (uLightModel > 0.5) {
    float t = clamp(l, 0.0, 1.0) * lit;
    vec3 baseCol = uRamp[2];
    if (uLightModel < 1.5) col = band < 0.5 ? baseCol * 0.55 : (band < 1.5 ? baseCol * 0.78 : baseCol);
    else col = baseCol * (0.45 + 0.55 * t);
  }

  // 冬天：法线朝上的面盖雪
  bool snowed = false;
  if (uSnow > 1.5 && uSnowOk > 0.5) {
    float up = N.y + (fbm(vWorld.xz * 1.3) - 0.5) * 0.5;
    if (up > uSnowT) { col = keepLine > 0.5 ? vec3(0.27, 0.27, 0.4) : pick(uSnowRamp, band); snowed = true; }
  }

  // 云影的边：按"本档本色 → 暗档本色"的比例压暗（纹理跟着压，不变成一片渐变）
  if (cloudFringe > 0.0) {
    vec3 from = snowed ? pick(uSnowRamp, band) : pick(uRamp, band);
    vec3 to = snowed ? uSnowRamp[0] : uRamp[0];
    col = mix(col, col * to / max(from, vec3(0.02)), cloudFringe * 0.85);
  }

  // 参考图：云影比树影暗一丝（阴影草地 #3d8778 vs #3e8a76）
  if (cloudCore > 0.5) col *= 0.975;

  #ifdef ROOF_SHADE
    // 房顶东坡上那块柔和的影子（参考图逐行取色：核心 = 房顶暗档 #aa7853，贴着屋脊；往外 0.45 米渐变到亮档，
    // 5 级 + 2×2 有序抖动，不是硬边椭圆）。vLocal 是房子本地坐标：x 横过两坡（0 = 屋脊，+x = 东坡），z 顺着屋脊（+z = 前）。
    // 宽度沿屋脊变：后头窄，中段最宽 uPlank.x 米，到前面 uPlank.w 收回屋脊
    if (vLocal.x > 0.0 && N.y > 0.3 && uSnow < 1.5) {
      float w = 0.12 + uPlank.x * smoothstep(uPlank.z, uPlank.z + 3.0, vLocal.z) * (1.0 - smoothstep(uPlank.w - 1.0, uPlank.w, vLocal.z));
      float k = clamp((vLocal.x - w) / uPlank.y, 0.0, 1.0);
      vec2 bq = mod(sc, 2.0);
      float bayer = (bq.x * 2.0 + abs(bq.y - bq.x) * 1.0 + 0.5) / 4.0;
      float q = min(1.0, floor(k * 5.0 + bayer) / 5.0);
      col = mix(uRamp[0], col, q);
    }
  #endif

  #ifdef EMISSIVE
    col = uRamp[2];
  #endif
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Mats {
  get(key: string, o: RampOpts): THREE.ShaderMaterial;
  /** 收尾：投影/受影开关、风摆物体的深度材质 */
  prepare(root: THREE.Object3D, opts?: { cast?: boolean; receive?: boolean }): void;
  all: THREE.ShaderMaterial[];
  shared: Shared;
}

export function normalMatOf(m: THREE.Material | undefined): THREE.Material | undefined {
  return m?.userData.normalMat as THREE.Material | undefined;
}

const col3 = (r: [number, number, number]) => r.map((h) => new THREE.Color(h));

/**
 * 没给 tones 的材质从三档 ramp 推一套：高一级 = 往上一档（亮档往白）挪 30%，低一级 = 往下一档（暗档往冷暗）挪 30%，
 * 缝 = alt[0]（没有 alt 就是暗档再压暗偏蓝），亮边 = 往上一档挪 55%。
 */
export function autoTones(ramp: C3, alt?: C3): Tones {
  const c = ramp.map((h) => new THREE.Color(h));
  const white = new THREE.Color(0xf4f6ff);
  const cold = c[0].clone().multiply(new THREE.Color(0.78, 0.8, 0.92));
  const hex = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, t).getHex();
  const upOf = (b: number) => (b < 2 ? c[b + 1] : white);
  const dnOf = (b: number) => (b > 0 ? c[b - 1] : cold);
  const bands = [0, 1, 2].map((b) => [
    c[b].getHex(),
    hex(c[b], upOf(b), b < 2 ? 0.3 : 0.12),
    hex(c[b], dnOf(b), 0.3),
  ]) as [C3, C3, C3];
  const seamBase = alt ? new THREE.Color(alt[0]) : cold;
  const seam = [0, 1, 2].map((b) => hex(seamBase, c[b], b === 0 ? 0 : 0.15 * b)) as C3;
  const hi = [0, 1, 2].map((b) => hex(c[b], upOf(b), b < 2 ? 0.55 : 0.25)) as C3;
  return { bands, seam, hi };
}

export function createMats(shared: Shared, texel: number): Mats {
  const cache = new Map<string, THREE.ShaderMaterial>();
  const all: THREE.ShaderMaterial[] = [];
  const depthSway = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const swayAmp = { value: 0.12 };
  depthSway.onBeforeCompile = (s) => {
    s.uniforms.uTime = shared.uTime;
    s.uniforms.uWind = shared.uWind;
    s.uniforms.uSwayAmp = swayAmp;
    s.vertexShader = `attribute float aSway;\nuniform float uTime;\nuniform vec2 uWind;\nuniform float uSwayAmp;\n${s.vertexShader.replace(
      '#include <project_vertex>',
      `{ vec4 wp = modelMatrix * vec4(transformed, 1.0); float ph = dot(wp.xz, vec2(0.37, 0.23));
         float wv = 0.6 + 0.4 * sin(uTime * 2.1 + ph) + 0.2 * sin(uTime * 3.3 + ph * 1.7);
         vec3 off = vec3(uWind.x, 0.0, uWind.y) * aSway * uSwayAmp * wv; transformed += inverse(mat3(modelMatrix)) * off; }
       #include <project_vertex>`,
    )}`;
  };

  const get: Mats['get'] = (key, o) => {
    const hit = cache.get(key);
    if (hit) return hit;
    const kind = o.kind ?? 'plain';
    const defines: Record<string, string> = { [`KIND_${kind.toUpperCase()}`]: '' };
    if (o.sway) defines.USE_SWAY = '';
    if (o.noShadow) defines.NO_SHADOW = '';
    if (o.emissive) defines.EMISSIVE = '';
    if (o.noCloud) defines.NO_CLOUD = '';
    if (o.specks) defines.SPECKS = '';
    if (o.bush) defines.BUSH = '';
    if (o.roofShade) defines.ROOF_SHADE = '';
    const tones = o.tones ?? autoTones(o.ramp, o.alt);
    const uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      uRamp: { value: col3(o.ramp) },
      uAlt: { value: col3(o.alt ?? o.ramp) },
      uTone: { value: tones.bands.flatMap((b) => col3(b)) },
      uSeam: { value: col3(tones.seam) },
      uHi: { value: col3(tones.hi) },
      uExtra: { value: col3(o.extra ?? o.alt ?? o.ramp) },
      uToneW: { value: new THREE.Vector2(...(o.toneW ?? [0.28, 0.24])) },
      uEl: { value: new THREE.Vector4(...(o.el ?? [kind === 'foliage' ? 2.6 : 9, 6, 1, 0])) },
      uBands: { value: new THREE.Vector2(...(o.bands ?? [0.1, 0.5])) },
      uNoise: { value: o.noise ?? (kind === 'foliage' ? 0.35 : 0.0) },
      uEdge: { value: o.edge ?? 1 },
      uSnowOk: { value: o.snow === false ? 0 : 1 },
      uSwayAmp: { value: o.sway ?? 0 },
      uTexel: { value: texel },
      uFur: shared.uFur,
      uLightUp: { value: o.lightUp ?? 0 },
      uSnowT: { value: o.snowT ?? 0.55 },
      uPlank: { value: new THREE.Vector4(...(o.plank ?? [0, 0, 1, 0.32])) },
      uClouds: shared.uClouds,
      uBlobs: shared.uBlobs,
      uCloudK: shared.uCloudK,
      uGrassK: shared.uGrassK,
      uFlowers: shared.uFlowers,
      uLeaves: shared.uLeaves,
      uLightDir: {
        value: o.light
          ? new THREE.Vector4(...new THREE.Vector3(...o.light).normalize().toArray(), 1)
          : new THREE.Vector4(0, 1, 0, 0),
      },
      uTime: shared.uTime,
      uWind: shared.uWind,
      uSunDir: shared.uSunDir,
      uClipY: shared.uClipY,
      uSnow: shared.uSnow,
      uShadowHard: shared.uShadowHard,
      uNoiseK: shared.uNoiseK,
      uDetail: shared.uDetail,
      uSnowRamp: shared.uSnowRamp,
      uLightModel: shared.uLightModel,
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      defines,
      lights: true,
      side: o.side ?? THREE.FrontSide,
    });
    const nm = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      defines: { ...defines, NORMAL_PASS: '' },
      lights: true,
      side: o.side ?? THREE.FrontSide,
    });
    m.userData.normalMat = nm;
    m.userData.sway = !!o.sway;
    cache.set(key, m);
    all.push(m);
    return m;
  };

  const prepare: Mats['prepare'] = (root, opts = {}) => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = opts.cast ?? true;
      mesh.receiveShadow = opts.receive ?? true;
      const mat = mesh.material as THREE.Material;
      if (mat?.userData.sway) mesh.customDepthMaterial = depthSway;
    });
  };

  return { get, prepare, all, shared };
}
