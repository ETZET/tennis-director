// hard-court 的材质：借 toon 的 court 元素材质（光照三档、投影、云影、描边、元素库的噪声工具都照旧），
// 只把"这一档用什么颜色"那一行换成 hardShade()：读一张状态小纹理（R 积沙、G 水），从八套调好色的三档里挑颜色。
// 八套颜色（内场、外场、线、内场湿、外场湿、积沙、吹薄的沙、水面反光）先过 ctx.mat → 配色方案的 grade（午后等），
// 再从材质的 uniform 里取出来，排成一张 15 × 8 的调色板纹理（行 = 材质，列 = 暗/中/亮 × 本色/高一级/低一级 + 三档缝 + 三档亮边）。
// 一片场 = 一个网格（2 个三角形）+ 一个材质；状态变了只重传小纹理，不重建几何。
//
// 叠的顺序（下 → 上）：漆面（低频深浅块 + 很少的擦痕）→ 水（水洼 / 潮；线在水下面还看得见）→ 线 → 沙（盖在线上面）。
import * as THREE from 'three';
import type { Mats, ToonOpts } from '../../../clubsite/render/toon';
import { T_DAMP, T_SAND, T_THIN, T_WET } from './state';

/** 调色板纹理的行（shader 里同一组数） */
export const ROW = {
  court: 0,
  surround: 1,
  line: 2,
  courtWet: 3,
  surroundWet: 4,
  drift: 5,
  thin: 6,
  glint: 7,
} as const;
const ROWS = 8;

/** 调色板里一定有的名字（各球场场景的 Pal 都继承了 desert3d-v2 / clubfront 的表） */
export type HardKey = 'court' | 'surround' | 'line' | 'sandDrift' | 'sandHigh' | 'jug';

/** 各场景 AssetCtx 的公共部分（clubcourts、以后 clubstadium 的 ctx 都能直接传进来） */
export interface HardCtx {
  mats: Mats;
  pal: object;
  mat(key: HardKey, extra?: ToonOpts): THREE.MeshToonMaterial;
  rng(stream: string): () => number;
  variant: number;
  params?: URLSearchParams;
}

/** 八行各用哪个调色板名字；湿的两种不在表里（别的场景）→ 从干的那行推（暗 22%、偏蓝） */
export interface HardKeys {
  court: string;
  surround: string;
  courtWet?: string;
  surroundWet?: string;
}

const f2 = (v: number) => v.toFixed(2);

const HARD_DECL = /* glsl */ `
uniform sampler2D uHardS;   // 状态网格（线性）：R 积沙、G 水
uniform sampler2D uHardP;   // 调色板 15 × 8
uniform vec4 uHardDim;      // 半宽、半深、-、-
uniform vec4 uHardLines[9]; // (常数坐标, 起, 止, 0 = 竖线 x 常数 / 1 = 横线 z 常数)
uniform vec4 uHardK;        // 线宽（米）、内场半长、内场半宽、-
uniform vec4 uHardW2L;      // 世界 xz → 本地 xz 的旋转（两行）

vec3 hT(int r, int b, int k) { return texelFetch(uHardP, ivec2(b * 3 + k, r), 0).rgb; }
vec3 hSeam(int r, int b) { return texelFetch(uHardP, ivec2(9 + b, r), 0).rgb; }
vec3 hHi(int r, int b) { return texelFetch(uHardP, ivec2(12 + b, r), 0).rgb; }
vec3 hPick(int r, int b, float t, float lo, float hi) { return t > hi ? hT(r, b, 1) : (t < lo ? hT(r, b, 2) : hT(r, b, 0)); }
vec2 hW2L(vec2 w) { return vec2(dot(uHardW2L.xy, w), dot(uHardW2L.zw, w)); }
vec2 hL2W(vec2 l) { return vec2(uHardW2L.x * l.x + uHardW2L.z * l.y, uHardW2L.y * l.x + uHardW2L.w * l.y); }
vec4 hS(vec2 l) { return texture(uHardS, (l + uHardDim.xy) / (2.0 * uHardDim.xy)); }
// 地面上往屏幕右挪一个纹素对应的世界 xz（同 eDn 的写法）
vec2 hRt() {
  mat3 V = mat3(viewMatrix);
  vec2 R = vec2(V[0][0], V[2][0]);
  return R / max(dot(R, R), 1e-3) * uTexel;
}
// 本地方向 → 屏幕方向（纹素单位，每米多少纹素）
vec2 hScrDir(vec2 dl) {
  vec2 w = hL2W(dl);
  return (mat3(viewMatrix) * vec3(w.x, 0.0, w.y)).xy / uTexel;
}

// 水洼上沿往下第 3 行（本行和上一行是水、再上一行不是）；loose = 上沿在第 2～4 行都算（左右邻居用：上沿差一行也连成一条）
bool hGlint(vec2 L, vec2 dnL, vec2 o, bool loose) {
  if (hS(L + o - 2.0 * dnL).g <= ${f2(T_WET)}) return false;
  if (hS(L + o - 3.0 * dnL).g <= ${f2(T_WET)}) return true;
  return loose && (hS(L + o - 1.0 * dnL).g <= ${f2(T_WET)} || hS(L + o - 4.0 * dnL).g <= ${f2(T_WET)});
}

vec3 hardShade(int b) {
  vec2 L = vElemL.xz;
  vec2 p = eScr(vElemP);
  vec2 wq = eTexW(vElemP.xz);
  vec2 dnL = hW2L(eDn());
  vec2 rtL = hW2L(hRt());
  vec4 S = hS(L);
  bool blue = abs(L.x) <= uHardK.y && abs(L.y) <= uHardK.z;
  int rb = blue ? 0 : 1;
  int rw = blue ? 3 : 4;
  // 5 米的疏密斑块（擦痕、风纹的密度跟着它变）
  float pd = smoothstep(0.42, 0.72, efbm(wq / 5.0 + 3.1));

  // ── 漆面：俱乐部的新漆场 —— 低频深浅块（26 × 14 纹素的有机形状，三色只差 ±6）+ 很少的擦痕（≤ 2%，2～4 纹素的缝色短划）──
  vec3 c = hPick(rb, b, efbm(wq / (vec2(26.0, 14.0) * uTexel) + 4.1), 0.4, 0.6);
  if (mod(p.y, 3.0) < 0.5) {
    float r = floor(p.y / 3.0);
    float sx = p.x + eh(vec2(r, 9.0)) * 40.0;
    float si = floor(sx / 14.0);
    float gx = sx - si * 14.0;
    if (eh(vec2(si, r) + 5.0) < 0.02 * pd && gx < 2.0 + floor(eh(vec2(si, r)) * 3.0)) c = hSeam(rb, b);
  }

  // ── 水：水洼 = 更深更艳的一块（12 × 7 纹素的深浅、最深处几块缝色）+ 上沿一纹素反光（亮边色）+ 北半边一道断续的天光（水面反光）；
  //    水洼外一圈潮（漆面和湿色各半）—— 刮过去留下的那层潮也是这个 ──
  float W = S.g;
  int wm = 0;
  vec3 wc = hPick(rw, b, efbm(wq / (vec2(12.0, 7.0) * uTexel) + 8.3), 0.38, 0.62);
  if (W > ${f2(T_WET)}) {
    wm = 2;
    c = wc;
    if (W > 0.93 && efbm(wq * 1.4 + 17.0) > 0.68) c = hSeam(rw, b);
    // 天光：上沿往下第 3 行、而且左右 3 纹素也是同一行（上沿平的那一段 = 水洼北边的正中）→ 一道直的亮条，不是顺着弯边的弧
    if (hS(L - dnL).g <= ${f2(T_WET)}) c = hHi(rw, b);
    else if (hGlint(L, dnL, vec2(0.0), false) && hGlint(L, dnL, 4.0 * rtL, true) && hGlint(L, dnL, -4.0 * rtL, true) &&
             hS(L + 2.0 * dnL).g > ${f2(T_WET)}) c = hT(7, b, 0);
  } else if (W > ${f2(T_DAMP)}) {
    wm = 1;
    c = mix(c, wc, 0.4);
  }

  // ── 线：宽按屏幕纹素取整（竖线 = 列、横线 = 行），交界一行齐；新漆，只有一成的 7 纹素段是低一级。水下面的线和水色各半 ──
  float kx = length(hScrDir(vec2(1.0, 0.0)));
  float kz = length(hScrDir(vec2(0.0, 1.0)));
  float lw = uHardK.x;
  for (int i = 0; i < 9; i++) {
    vec4 ln = uHardLines[i];
    bool vx = ln.w < 0.5;
    float off = vx ? L.x - ln.x : L.y - ln.x;
    float al = vx ? L.y : L.x;
    if (al < ln.y - lw * 0.5 || al > ln.z + lw * 0.5) continue;
    float rate = vx ? kx : kz;
    float npx = max(1.0, floor(lw * rate + 0.5));
    float q = floor(off * rate + npx * 0.5 + 0.001);
    if (q < 0.0 || q >= npx) continue;
    float h7 = eh(vec2(floor((vx ? p.y : p.x) / 7.0), float(i) + 41.0));
    vec3 lc = h7 < 0.1 ? hT(2, b, 2) : hT(2, b, 0);
    c = wm == 2 ? mix(lc, wc, 0.5) : (wm == 1 ? mix(lc, wc, 0.25) : lc);
  }

  // ── 沙（盖在线上面）──
  float Sd = S.r;
  if (Sd > ${f2(T_SAND)}) {
    // 积沙：10 × 5 纹素的深浅土团 + 风纹（每 4 行一行候选、13 纹素分段：一纹素的浅条，下面一行短一点的暗条；
    // 整片一起 ±1 行起伏，连起来是平行的弯线；密度按斑块 25% → 70%）
    c = hPick(5, b, efbm(wq / (vec2(10.0, 5.0) * uTexel) + 2.7), 0.38, 0.62);
    float wv = floor(1.2 * sin(p.x * 0.19) * sin(p.x * 0.051 + 1.3) + 0.5);
    float y = p.y - wv;
    float r = floor(y / 4.0);
    float gy = y - r * 4.0;
    float sx = p.x + eh(vec2(r, 19.0)) * 40.0;
    float si = floor(sx / 13.0);
    float gx = sx - si * 13.0;
    float h = eh(vec2(si, r) + 11.0);
    float len = 4.0 + floor(h * 8.0);
    if (eh(vec2(si, r) + 13.0) < mix(0.25, 0.7, pd)) {
      if (gy > 0.5 && gy < 1.5 && gx < len) c = hHi(5, b);
      else if (gy < 0.5 && gx >= 1.0 && gx < len - 1.0 - step(0.5, h)) c = hSeam(5, b);
    }
    // 积沙的边：上沿一纹素迎光的沙脊（亮边色），下沿一纹素朝镜头的背光坡（缝色）—— 读成有厚度的一层
    if (hS(L - dnL).r <= ${f2(T_SAND)}) c = hHi(5, b);
    else if (hS(L + dnL).r <= ${f2(T_SAND)}) c = hSeam(5, b);
  } else if (Sd > ${f2(T_THIN)}) {
    // 吹薄的一层：横向拉长的浅沙斑（9 × 3 纹素），盖住的比例跟着深度（≈ 5% → 70%），其余透出场地；斑里偏薄的一圈是低一级
    float f = (Sd - ${f2(T_THIN)}) / ${f2(T_SAND - T_THIN)};
    float ps = efbm(wq / (vec2(9.0, 3.0) * uTexel) + 6.1);
    float th = 0.33 + 0.27 * f;
    if (ps < th) c = ps > th - 0.035 ? hT(6, b, 2) : hT(6, b, 0);
  }
  return c;
}
`;

/** 材质要更新的 uniform */
export interface HardUniforms {
  uHardS: { value: THREE.Texture };
  uHardP: { value: THREE.Texture };
  uHardDim: { value: THREE.Vector4 };
  uHardLines: { value: THREE.Vector4[] };
  uHardK: { value: THREE.Vector4 };
  uHardW2L: { value: THREE.Vector4 };
}

type Shader = THREE.WebGLProgramParametersWithUniforms;
type LooseMat = (key: string, extra?: ToonOpts) => THREE.MeshToonMaterial;

/**
 * 从 ctx.mat(key) 里取出调好色的三档颜色（uTone 9 个、uSeamC 3 个、uHiC 3 个，都是暗档在前）。
 * toon 的颜色只在 onBeforeCompile 里交给 shader：拿一个空 shader 跑一遍它，读 uniform。
 */
function gradedTones(ctx: HardCtx, key: string): THREE.Color[] {
  const m = (ctx.mat as unknown as LooseMat)(key, { elem: { kind: 'paint' } });
  const sh = { uniforms: {}, vertexShader: '', fragmentShader: '' } as unknown as Shader;
  m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  const u = sh.uniforms as Record<string, { value: THREE.Color[] }>;
  return [...u.uTone.value, ...u.uSeamC.value, ...u.uHiC.value].map((c) => c.clone());
}

/** 湿的颜色（这个场景的表里没有 courtWet / surroundWet 时）：干的那套暗 22%、往蓝偏 */
const wetFrom = (cs: THREE.Color[]) => cs.map((c) => new THREE.Color(c.r * 0.66, c.g * 0.76, c.b * 0.92));

/** 15 × 8 的调色板纹理（行 = ROW） */
export function paletteTexture(ctx: HardCtx, keys: HardKeys): THREE.DataTexture {
  const has = (k?: string): k is string => !!k && k in ctx.pal;
  const court = gradedTones(ctx, keys.court);
  const surround = gradedTones(ctx, keys.surround);
  const rows: THREE.Color[][] = [
    court,
    surround,
    gradedTones(ctx, 'line'),
    has(keys.courtWet) ? gradedTones(ctx, keys.courtWet) : wetFrom(court),
    has(keys.surroundWet) ? gradedTones(ctx, keys.surroundWet) : wetFrom(surround),
    gradedTones(ctx, 'sandDrift'),
    gradedTones(ctx, 'sandHigh'),
    gradedTones(ctx, 'jug'),
  ];
  const data = new Uint8Array(15 * ROWS * 4);
  rows.forEach((cs, row) => {
    cs.forEach((c, i) => {
      data.set(
        [
          Math.round(Math.min(1, c.r) * 255),
          Math.round(Math.min(1, c.g) * 255),
          Math.round(Math.min(1, c.b) * 255),
          255,
        ],
        (row * 15 + i) * 4,
      );
    });
  });
  return dataTex(data, 15, ROWS, false);
}

export function dataTex(data: Uint8Array, w: number, h: number, linear: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * 硬地场面的材质：底子是 ctx.mat(court, { elem: paint })（不改那个共享实例：新建一个 MeshToonMaterial，
 * onBeforeCompile 先跑 toon 的，再把 elemShade 那一行换成 hardShade）。描边用 court 的法线材质（edge 0.05、convex 0）。
 */
export function hardMaterial(ctx: HardCtx, courtKey: string, u: HardUniforms): THREE.MeshToonMaterial {
  const base = (ctx.mat as unknown as LooseMat)(courtKey, {
    elem: { kind: 'paint', size: [26, 14], density: [0, 0.02], patch: 5 },
  });
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: base.gradientMap });
  const md = m as THREE.MeshToonMaterial & { defines?: Record<string, string> };
  md.defines = { ...(base as typeof md).defines };
  m.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    Object.assign(sh.uniforms, u);
    const call = /col = elemShade\([^;]*\) \* base;/;
    if (!call.test(sh.fragmentShader) || !sh.fragmentShader.includes('void main() {')) {
      console.warn('hard-court：toon 的 shader 变了，找不到 elemShade 那一行（场面退回普通 court 材质）');
      return;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `${HARD_DECL}\nvoid main() {`)
      .replace(call, 'col = hardShade(int(band + 0.5)) * base;');
  };
  m.customProgramCacheKey = () => 'hard-court-v1';
  m.userData.normalMat = base.userData.normalMat;
  return m;
}
