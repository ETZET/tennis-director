// 色阶材质（自己写的 ShaderMaterial，不用 MeshToonMaterial）：
// - 光照只算一个数 l = dot(N, 太阳) + 噪声，按阈值分三档，三档颜色是**手挑的调色板**（暗档色相偏蓝绿/靛，不是亮档乘个系数）；
// - 投影来自 three 的阴影贴图（PCF 采样后再取阈值 → 影子边缘是圆滑的形状，不是阴影贴图的锯齿）；
// - kind 决定表面细节：ground（草地斑块、草叶短划、小花）、cliff（石块裂纹 + 顶上垂下来的草边）、path（石板路）、
//   foliage（树冠：亮暗交界处按纹素加竖向噪声 → "毛边"）、plain；
// - 冬天：法线朝上的面按噪声盖雪（换成雪的色阶）。
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
  | 'ridge';

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
  /** 叶子上撒零星的小白花（灌木） */
  specks?: boolean;
  /** 明暗用的光（只影响分档，不影响投影），例如房顶用东边的光让两坡一明一暗 */
  light?: [number, number, number];
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
    uSunDir: { value: new THREE.Vector3(0.25, 1, -0.38).normalize() },
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
uniform float uTime;
uniform vec2 uWind;
uniform float uSwayAmp;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying vec3 vLocal;
void main() {
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

void main() {
  if (vWorld.y < uClipY) discard;
  vec3 N = normalize(vNormalW);
  #ifdef NORMAL_PASS
    gl_FragColor = vec4(N * 0.5 + 0.5, uEdge);
    return;
  #endif
  // 纹素网格上的世界坐标（地面细节按纹素取，才是"像素"）
  vec2 tc = floor(vWorld.xz / uTexel);
  // 树冠等可以用一个更朝上的"假光"算明暗（影子仍然按真太阳）
  vec3 Ld = normalize(mix(uLightDir.w > 0.5 ? uLightDir.xyz : uSunDir, vec3(0.0, 1.0, 0.35), uLightUp));
  float ndl = dot(N, Ld);
  // 影子边缘的"毛"：阈值按竖向笔触抖动（x 每纹素、y 每两纹素）
  float fur = hash12(vec2(floor(vWorld.x / uTexel), floor(vWorld.z / uTexel / 2.0)) + 5.0) - 0.5;
  float sh = sunShadow(fur);
  float l = ndl;
  float nz = 0.0;
  #ifdef KIND_FOLIAGE
    // 叶簇：按屏幕纹素坐标取 2.5 纹素大小的 Voronoi 格子（一小团一小团），再加一点逐纹素的碎点
    vec2 sp = floor(vec2(vWorld.x, (vWorld.y - vWorld.z) * 0.70711) / uTexel);
    vec3 vv = voro(sp / 2.6 + floor(vWorld.y * 0.5) * 3.7);
    nz = (vv.z - 0.5) * 0.85 + (hash12(sp + 0.5) - 0.5) * 0.3;
  #else
    nz = hash12(tc) - 0.5;
  #endif
  l += nz * uNoise * uNoiseK;
  float band = l < uBands.x ? 0.0 : (l < uBands.y ? 1.0 : 2.0);
  // 投影：压到暗档（形状噪声让影子边缘带一点颗粒）
  float lit = sh;
  if (lit < 0.5) band = 0.0;
  vec3 r0 = uRamp[0], r1 = uRamp[1], r2 = uRamp[2];
  vec3 col = pick(uRamp, band);
  float detail = uDetail;
  // 冬天盖了雪以后还要露出来的细节（栈桥的板缝）
  float keepLine = 0.0;

  // 屏幕对齐的纹素坐标（正交 45°：屏幕行 = (y - z)·cos45 / 纹素）——木板缝、楼梯缝按它取，线永远是整一纹素
  vec2 sc = floor(vec2(vWorld.x, (vWorld.y - vWorld.z) * 0.70711) / uTexel + 0.5);

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
      // 亮草地基本是纯色；阴影里有一片片竖着的亮草叶（x 每纹素、y 每两纹素，长 2 纹素）
      vec2 cell = vec2(tc.x, floor(tc.y / 2.0));
      float h = hash12(cell + 17.0);
      float pch = fbm(vWorld.xz * 0.5 + 3.0);
      if (band < 0.5) {
        float dens = mix(0.03, 0.16, smoothstep(0.35, 0.7, pch));
        if (h < dens) col = uAlt[0];
      } else if (band > 1.5) {
        if (h < uGrassK * (uGrassK > 0.1 ? 1.0 : smoothstep(0.55, 0.75, pch))) col = uAlt[1];
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
    // 墙面：uv.x = 沿墙长度（米），uv.y = 离墙顶多深（米）；石块是横着的长条（宽 6～14、高 3～5 纹素），缝 1 纹素
    if (detail > 0.5) {
      vec2 q = vec2(vUv.x, vUv.y) / uTexel;
      float row = floor(q.y / 4.0 + hash12(vec2(floor(q.x / 11.0), 1.0)) * 0.6);
      float rx = q.x + hash12(vec2(row, 4.0)) * 37.0;
      float bw = 7.0 + floor(hash12(vec2(row, 8.0)) * 6.0);
      float bx = floor(rx / bw);
      float gx = rx - bx * bw;
      float gy = q.y / 4.0 + hash12(vec2(floor(q.x / 11.0), 1.0)) * 0.6 - row;
      float sid = hash12(vec2(bx, row) + 13.0);
      if (gx < 1.0 || gy < 0.25) col = uAlt[0];
      else if (sid < 0.22) col = uRamp[1];
      else if (sid > 0.93) col = uRamp[2];
      // 墙中间一条长苔藓的横缝（池塘墙）
      float ledge = abs(vUv.y - 1.05 - 0.15 * sin(vUv.x * 0.7));
      if (ledge < uTexel * 0.6 && uSnow < 1.5) col = uAlt[1];
    }
    // 顶上垂下来的草边（锯齿：每纹素一个长度）
    float fr = 0.06 + 0.22 * hash12(vec2(floor(vUv.x / uTexel), 3.0)) * step(0.4, hash12(vec2(floor(vUv.x / uTexel / 3.0), 9.0)));
    if (vUv.y < fr) col = vUv.y < fr * 0.5 ? uAlt[2] : uAlt[1];
    if (uSnow > 1.5 && vUv.y < fr + 0.04) col = vUv.y < fr * 0.6 ? uSnowRamp[2] : vec3(0.55, 0.56, 0.68);
  #endif

  #ifdef KIND_PATH
    if (detail > 0.5) {
      // 石板：Voronoi 格子约 9 纹素；缝 1 纹素；每块石头靠上的一条边亮一档（屏幕上方那个纹素是缝 → 这个纹素提亮）
      vec2 pw = floor(vWorld.xz / uTexel) * uTexel * 1.75;
      vec3 v = voro(pw);
      vec3 vu = voro(pw - vec2(0.0, uTexel * 1.75 * 1.42));
      bool crack = v.y < 0.075;
      if (crack) col = uAlt[0 + int(band > 1.5)];
      else if (vu.y < 0.075 && band > 0.5) col = uAlt[2];
      else if (v.z < 0.3 && band > 1.5) col = mix(col, uAlt[2], 0.5);
    }
  #endif

  #ifdef KIND_STONE
    // 房子墙：一排排不规则的石块（高 4～6 纹素、宽 5～10 纹素），缝 1 纹素，少数石块亮一档
    if (detail > 0.5) {
      vec2 q = vUv / uTexel;
      float rh = 5.0;
      float row = floor(q.y / rh);
      float rx = q.x + hash12(vec2(row, 2.0)) * 23.0;
      float bw = 6.0 + floor(hash12(vec2(floor(rx / 9.0), row)) * 4.0);
      float bx = floor(rx / bw);
      float gx = rx - bx * bw;
      float gy = q.y - row * rh;
      float sid = hash12(vec2(bx, row) + 7.0);
      if (gx < 1.0 || gy < 1.0) col = mix(col, uAlt[0], 0.9);
      else if (sid < 0.3) col = mix(col, uAlt[2], 0.7);
      else if (sid > 0.85) col = mix(col, uAlt[1], 0.7);
    }
  #endif

  #ifdef KIND_ROCK
    // 顶上长苔藓（冬天被雪盖住）
    // 苔藓帽子：边缘按纹素列往下"滴"（每列一个随机长度）
    float drip = hash12(vec2(floor(vWorld.x / uTexel), 5.0)) * 0.15;
    float mz = N.y * 0.6 + (fbm(floor(vWorld.xz / uTexel) * uTexel * 1.4 + 2.0) - 0.5) * 1.6 + drip + vWorld.y * 0.25;
    if (mz > 0.3) col = pick(uAlt, band);
  #endif

  #ifdef KIND_WOOD
    // 木板：沿 uPlank.xyz（本地轴）每 uPlank.w 米一条缝，缝至少 1 纹素
    if (detail > 0.5) {
      float g = fract(dot(vLocal, uPlank.xyz) / uPlank.w);
      if (g < uTexel * 1.1 / uPlank.w) col = uAlt[0];
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
    // 台阶：踏面按块分（每 6～10 纹素一条竖缝，逐级错开），立面暗档
    if (detail > 0.5 && N.y > 0.5) {
      float sx = floor(vWorld.x / uTexel);
      float st = floor(vWorld.z / 0.2);
      float w = 4.0 + floor(hash12(vec2(st, 1.0)) * 4.0);
      if (mod(sx + st * 3.0, w) < 1.0) col = uAlt[0];
      else if (hash12(vec2(floor((sx + st * 3.0) / w), st)) < 0.3 && band > 0.5) col = uAlt[2];
    } else if (N.y <= 0.5 && N.z > 0.3) {
      // 立面：比踏面暗一档（在阴影里也分得开）
      col = uAlt[0];
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
  if (uSnow > 1.5 && uSnowOk > 0.5) {
    float up = N.y + (fbm(vWorld.xz * 1.3) - 0.5) * 0.5;
    if (up > uSnowT) col = keepLine > 0.5 ? vec3(0.27, 0.27, 0.4) : pick(uSnowRamp, band);
  }

  // 云影：几块软边的大椭圆，飘得很慢；暗到本材质的暗档（参考图房顶、楼梯左边那种柔和的影子）
  #ifndef NO_CLOUD
  if (uCloudK > 0.0) {
    float cs = 0.0;
    vec2 cw = vWorld.xz - vec2(uTime * 0.05, uTime * 0.02);
    for (int i = 0; i < 4; i++) {
      vec4 c = uClouds[i];
      if (c.z <= 0.0) continue;
      vec2 d = (cw - c.xy) / c.zw;
      float r = length(d) + (fbm(cw * 0.35 + float(i) * 7.0) - 0.5) * 0.5;
      cs = max(cs, 1.0 - smoothstep(0.72, 1.0, r));
    }
    cs = floor(cs * 5.0 + hash12(tc) * 0.9) / 5.0;
    vec3 dark = (uSnow > 1.5 && uSnowOk > 0.5) ? uSnowRamp[0] : uRamp[0];
    col = mix(col, dark, cs * uCloudK * (band > 0.5 ? 1.0 : 0.0));
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
    const uniforms = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
      uRamp: { value: col3(o.ramp) },
      uAlt: { value: col3(o.alt ?? o.ramp) },
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
