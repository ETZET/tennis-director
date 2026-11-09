// clay-court 的材质：借 toon 的 `clay` 元素材质（光照三档、投影、云影、描边、元素库的噪声工具都照旧），
// 只把"这一档用什么颜色"那一行换成 clayShade()：读状态网格 / 胶带线 / 记号三张小纹理，从六套调好色的三档里挑颜色。
// 六套颜色（clay、clayBrushed、clayDust、clayWet、tape、tapeDust）先过 ctx.mat → 配色方案的 grade（午后等），
// 再从材质的 uniform 里取出来，排成一张 15 × 6 的调色板纹理（行 = 材质，列 = 暗/中/亮 × 本色/高一级/低一级 + 三档缝 + 三档亮边）。
// 一片场 = 一个网格（2 个三角形）+ 一个材质；状态变了只重传小纹理（68 KB + 3 KB + 4 KB），不重建几何。
import * as THREE from 'three';
import type { AssetCtx } from '../../world';
import { MAX_MARKS, T_BRUSHED, T_DUSTY } from './state';

/** 调色板纹理的行（shader 里同一组数） */
export const PAL_KEYS = ['clay', 'clayBrushed', 'clayDust', 'clayWet', 'tape', 'tapeDust'] as const;

const f1 = (v: number) => v.toFixed(4);

const CLAY_DECL = /* glsl */ `
#define CLAY_MAXM ${MAX_MARKS}
uniform sampler2D uClayS;   // 状态网格（线性）：R 湿、G 土况、B 拖痕方向、A 擦痕
uniform sampler2D uClayT;   // 胶带线（每条一行，R = 盖土）
uniform sampler2D uClayM;   // 记号（float，两行）
uniform sampler2D uClayP;   // 调色板 15 × 6
uniform vec4 uClayDim;      // 半宽、半深、记号个数、胶带纹理宽
uniform vec4 uClayLines[9]; // (常数坐标, 起, 止, 0 = 竖线 x 常数 / 1 = 横线 z 常数)
uniform vec4 uClayK;        // 线宽（米）、胶带采样间距（米）
uniform vec4 uClayW2L;      // 世界 xz → 本地 xz 的旋转（两行）

vec3 cT(int p, int b, int k) { return texelFetch(uClayP, ivec2(b * 3 + k, p), 0).rgb; }
vec3 cSeam(int p, int b) { return texelFetch(uClayP, ivec2(9 + b, p), 0).rgb; }
vec3 cHi(int p, int b) { return texelFetch(uClayP, ivec2(12 + b, p), 0).rgb; }
vec2 cW2L(vec2 w) { return vec2(dot(uClayW2L.xy, w), dot(uClayW2L.zw, w)); }
vec2 cL2W(vec2 l) { return vec2(uClayW2L.x * l.x + uClayW2L.z * l.y, uClayW2L.y * l.x + uClayW2L.w * l.y); }
vec4 clayS(vec2 l) { return texture(uClayS, (l + uClayDim.xy) / (2.0 * uClayDim.xy)); }
// 地面上往屏幕右挪一个纹素对应的世界 xz（同 eDn 的写法）
vec2 clayRt() {
  mat3 V = mat3(viewMatrix);
  vec2 R = vec2(V[0][0], V[2][0]);
  return R / max(dot(R, R), 1e-3) * uTexel;
}
// 本地方向 → 屏幕方向（纹素单位，每米多少纹素）
vec2 clayScrDir(vec2 dl) {
  vec2 w = cL2W(dl);
  return (mat3(viewMatrix) * vec3(w.x, 0.0, w.y)).xy / uTexel;
}
// 椭圆（本地米）：中心 m，方向 (c, s)，半长 a、半宽 b
float clayEll(vec2 l, vec4 m0, float a, float b) {
  vec2 d = l - m0.xy;
  vec2 u = vec2(dot(d, m0.zw), dot(d, vec2(-m0.w, m0.z)));
  return (u.x * u.x) / (a * a) + (u.y * u.y) / (b * b);
}

vec3 clayShade(int b) {
  vec2 L = vElemL.xz;
  vec2 p = eScr(vElemP);
  vec2 wq = eTexW(vElemP.xz);
  vec2 dnL = cW2L(eDn());
  vec2 rtL = cW2L(clayRt());
  vec4 S = clayS(L);
  // 导数在分支前取：湿边最多 1 纹素的棋盘过渡；土况不抖（拖垫边那条翻起的土只有 2 行，抖了就成虚线）
  float ck = mod(p.x + p.y, 2.0) - 0.5;
  float dust = S.g;
  float wet = S.r + ck * fwidth(S.r) * 0.9;
  float scuff = S.a;
  float pd = smoothstep(0.42, 0.72, efbm(wq / 2.6 + 3.1));   // 2.6 米的疏密斑块
  vec3 c;
  int pal;

  if (wet > 0.5) {
    // ── 湿：大块深浅不匀（水渗得不匀）+ 很湿的地方几块小水洼（缝色，上沿一行湿面反光 = 亮边色）──
    pal = 3;
    float pt = efbm(wq / (vec2(18.0, 10.0) * uTexel) + 4.1);
    c = pt > 0.62 ? cT(3, b, 1) : (pt < 0.4 ? cT(3, b, 2) : cT(3, b, 0));
    float pq = efbm(wq * 1.1 + 17.0);
    if (S.r > 0.86 && pq > 0.73) {
      c = cSeam(3, b);
      float pu = efbm(eTexW(vElemP.xz - eDn()) * 1.1 + 17.0);
      if (pu <= 0.73 || clayS(L - dnL).r <= 0.86) c = cHi(3, b);
    }
  } else {
    if (dust < ${f1(T_BRUSHED)}) {
      // ── 刚拖平：很匀（三色只差 ±4）+ 扫痕：顺着拖的方向、1 纹素、只深 10 的线，行距不齐、一段一段 ──
      pal = 1;
      float pt = efbm(wq / (vec2(30.0, 16.0) * uTexel) + 6.3);
      c = pt > 0.66 ? cT(1, b, 1) : (pt < 0.34 ? cT(1, b, 2) : cT(1, b, 0));
      float th = S.b * 3.14159265 - 1.5707963;
      vec2 sd = normalize(clayScrDir(vec2(cos(th), sin(th))));
      vec2 sn = vec2(-sd.y, sd.x);
      float row = floor(dot(p, sn) + 0.5);
      float al = dot(p, sd);
      bool ln = eh(vec2(row, 3.0)) < 0.36 && eh(vec2(row - 1.0, 3.0)) >= 0.36;
      float seg = floor((al + eh(vec2(row, 5.0)) * 40.0) / 11.0);
      if (ln && eh(vec2(row, seg) + 7.0) > 0.22) c = cSeam(1, b);
    } else if (dust < ${f1(T_DUSTY)}) {
      // ── 正常：低频深浅块（漆面那种，22 × 13 纹素）+ 擦痕（每 3 行一行候选，2～5 纹素的缝色短划，多少跟着 A 通道和斑块）──
      pal = 0;
      float pt = efbm(wq / (vec2(22.0, 13.0) * uTexel) + 4.1);
      c = pt > 0.6 ? cT(0, b, 1) : (pt < 0.4 ? cT(0, b, 2) : cT(0, b, 0));
      float dens = 0.01 + 0.2 * scuff * (0.3 + 0.7 * pd);
      if (mod(p.y, 3.0) < 0.5) {
        float r = floor(p.y / 3.0);
        float sx = p.x + eh(vec2(r, 9.0)) * 40.0;
        float si = floor(sx / 14.0);
        float gx = sx - si * 14.0;
        if (eh(vec2(si, r) + 5.0) < dens && gx < 2.0 + floor(eh(vec2(si, r)) * 4.0)) c = cSeam(0, b);
      }
    } else {
      // ── 起尘：土团（7 × 4 纹素的有机块，三色）+ 更密的擦痕 + 零星的小土粒（2 纹素亮边色 + 下一行缝色）──
      pal = 2;
      float pt = efbm(wq / (vec2(7.0, 4.0) * uTexel) + 2.3);
      c = pt > 0.6 ? cT(2, b, 1) : (pt < 0.42 ? cT(2, b, 2) : cT(2, b, 0));
      float dens = 0.04 + 0.26 * scuff * (0.25 + 0.75 * pd);
      if (mod(p.y, 3.0) < 0.5) {
        float r = floor(p.y / 3.0);
        float sx = p.x + eh(vec2(r, 19.0)) * 40.0;
        float si = floor(sx / 12.0);
        float gx = sx - si * 12.0;
        if (eh(vec2(si, r) + 15.0) < dens && gx < 2.0 + floor(eh(vec2(si, r) + 1.0) * 4.0)) c = cSeam(2, b);
      }
      vec2 cs = vec2(9.0, 6.0);
      vec2 cell = floor(p / cs);
      if (eh(cell + 61.0) < 0.05 + 0.1 * pd) {
        vec2 o = floor(vec2(eh(cell + 62.0), eh(cell + 63.0)) * (cs - vec2(2.0, 2.0)));
        vec2 d = p - cell * cs - o;
        if (d.y == 1.0 && d.x >= 0.0 && d.x < 2.0) c = cHi(2, b);
        else if (d.y == 0.0 && d.x >= 0.0 && d.x < 2.0) c = cSeam(2, b);
      }
    }
    // ── 湿区外沿一圈"半干"：自己不湿、但 1～2 纹素内有湿的 → 正常红土的低一级（弯边，宽度按 5 × 3 纹素块抖）──
    if (S.r > 0.12) {
      float w = eh(floor(p / vec2(5.0, 3.0)) + 71.0) < 0.5 ? 1.0 : 2.0;
      bool rim = false;
      for (int k = 1; k <= 2; k++) {
        float fk = float(k);
        if (fk > w) break;
        if (clayS(L + rtL * fk).r > 0.5 || clayS(L - rtL * fk).r > 0.5 || clayS(L + dnL * fk).r > 0.5 ||
            clayS(L - dnL * fk).r > 0.5) rim = true;
      }
      if (rim) c = cT(0, b, 2);
    }
  }

  // ── 胶带线：宽按屏幕纹素取整（竖线 = 列、横线 = 行），交界一行齐；盖土按线上的采样一段一段糊 ──
  float kx = length(clayScrDir(vec2(1.0, 0.0)));
  float kz = length(clayScrDir(vec2(0.0, 1.0)));
  float lw = uClayK.x;
  for (int i = 0; i < 9; i++) {
    vec4 ln = uClayLines[i];
    bool vx = ln.w < 0.5;
    float off = vx ? L.x - ln.x : L.y - ln.x;
    float al = vx ? L.y : L.x;
    if (al < ln.y - lw * 0.5 || al > ln.z + lw * 0.5) continue;
    float rate = vx ? kx : kz;
    float npx = max(1.0, floor(lw * rate + 0.5));
    float q = floor(off * rate + npx * 0.5 + 0.001);
    if (q < 0.0 || q >= npx) continue;
    float td = texture(uClayT, vec2(((al - ln.y) / uClayK.y + 0.5) / uClayDim.w, (float(i) + 0.5) / 9.0)).r;
    // 盖土是一段一段的：拿线上的盖土和沿线 1.2 米尺度的噪声比（0.3 以下全白、0.62 以上全糊，中间 = 长短不一的几段）
    float am = vx ? L.y : L.x;
    float segN = evn(vec2(am / 1.2, float(i) * 7.0 + 31.0));
    int tp = td > 0.3 + 0.32 * segN ? 5 : 4;
    float h6 = eh(vec2(floor((vx ? p.y : p.x) / 6.0), float(i) + 41.0));
    c = h6 < 0.14 ? cT(tp, b, 2) : (h6 > 0.9 ? cT(tp, b, 1) : cT(tp, b, 0));
    // 胶带上零星的土渣（一纹素缝色，每 5 纹素一段 6% 的机会）
    if (eh(vec2(floor((vx ? p.y : p.x) / 5.0), float(i) + 51.0)) < 0.06 && q == floor(npx * 0.5)) c = cSeam(tp, b);
    pal = tp;
  }

  // ── 记号：脚印（压下去的缝色）、球印（湿红土色 + 前端一纹素蹭起来的亮土）、滑步痕（起尘色的长条 + 中间一道低一级 + 尽头一小堆亮土）──
  int n = int(uClayDim.z);
  float tm = uTexel * 1.25;
  for (int i = 0; i < CLAY_MAXM; i++) {
    if (i >= n) break;
    vec4 m0 = texelFetch(uClayM, ivec2(i, 0), 0);
    vec2 d = L - m0.xy;
    if (dot(d, d) > 2.6) continue;
    vec4 m1 = texelFetch(uClayM, ivec2(i, 1), 0);
    int ty = int(m1.x + 0.5);
    float st = m1.y;
    if (ty == 1) {
      // 脚印：踩下去的一块 —— 起尘上 = 露出下面压实的红土（clay 低一级，差 ≈ 40），别处 = 红土的缝色；
      // 下沿一行 = 坑里朝太阳的那面（亮边色）。淡了的（强度 ≤ 0.5）只剩低一级
      if (clayEll(L, m0, m1.z, m1.w) < 1.0) {
        bool onDust = pal == 2 || pal == 5;
        c = st > 0.5 ? (onDust ? cT(0, b, 2) : cSeam(0, b)) : cT(onDust ? 2 : 0, b, 2);
        if (st > 0.5 && clayEll(L + dnL, m0, m1.z, m1.w) >= 1.0) c = cHi(onDust ? 2 : 0, b);
      }
    } else if (ty == 2) {
      if (clayEll(L, m0, m1.z, m1.w) < 1.0) {
        c = st > 0.5 ? cT(3, b, 0) : cT(0, b, 2);
        vec4 mf = vec4(m0.xy - m0.zw * tm, m0.zw);
        if (st > 0.5 && clayEll(L, mf, m1.z, m1.w) >= 1.0 && dot(d, m0.zw) > 0.0) c = cHi(0, b);
      }
    } else if (ty == 3) {
      float ux = dot(d, m0.zw);
      float uy = dot(d, vec2(-m0.w, m0.z));
      float hwid = m1.w * 0.5 * (0.55 + 0.45 * clamp(ux / max(m1.z, 0.01), 0.0, 1.0));
      if (ux >= 0.0 && ux <= m1.z + 0.06 && abs(uy) <= hwid) {
        c = cT(2, b, 0);
        if (abs(uy) < tm * 0.5) c = cT(2, b, 2);
        if (ux > m1.z - 0.12) c = cHi(2, b);
        if (st <= 0.5) c = cT(0, b, 1);
      }
    }
  }
  return c;
}
`;

/** 地面材质（toon 的 clay 元素材质 + clayShade）和要更新的 uniform */
export interface ClayMaterial {
  material: THREE.MeshToonMaterial;
  uniforms: {
    uClayS: { value: THREE.Texture };
    uClayT: { value: THREE.Texture };
    uClayM: { value: THREE.Texture };
    uClayP: { value: THREE.Texture };
    uClayDim: { value: THREE.Vector4 };
    uClayLines: { value: THREE.Vector4[] };
    uClayK: { value: THREE.Vector4 };
    uClayW2L: { value: THREE.Vector4 };
  };
}

type Shader = THREE.WebGLProgramParametersWithUniforms;

/**
 * 从 ctx.mat(key) 里取出调好色的三档颜色（uTone 9 个、uSeamC 3 个、uHiC 3 个，都是暗 → 亮）。
 * toon 的颜色只在 onBeforeCompile 里交给 shader：这里拿一个空 shader 跑一遍它，读 uniform。
 */
function gradedTones(ctx: AssetCtx, key: (typeof PAL_KEYS)[number]): THREE.Color[] {
  const m = ctx.mat(key, { elem: { kind: 'paint' } });
  const sh = { uniforms: {}, vertexShader: '', fragmentShader: '' } as unknown as Shader;
  m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  const u = sh.uniforms as Record<string, { value: THREE.Color[] }>;
  return [...u.uTone.value, ...u.uSeamC.value, ...u.uHiC.value];
}

/** 15 × 6 的调色板纹理（行 = PAL_KEYS 的顺序） */
export function paletteTexture(ctx: AssetCtx): THREE.DataTexture {
  const data = new Uint8Array(15 * PAL_KEYS.length * 4);
  PAL_KEYS.forEach((k, row) => {
    gradedTones(ctx, k).forEach((c, i) => {
      data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], (row * 15 + i) * 4);
    });
  });
  return dataTex(data, 15, PAL_KEYS.length, false);
}

export function dataTex(
  data: Uint8Array | Float32Array,
  w: number,
  h: number,
  linear: boolean,
  type: THREE.TextureDataType = THREE.UnsignedByteType,
): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, type);
  t.magFilter = t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * 红土场面的材质：底子是 ctx.mat('clay', { elem: paint })（不改那个共享实例：新建一个 MeshToonMaterial，
 * onBeforeCompile 先跑 toon 的，再把 elemShade 那一行换成 clayShade）。描边用 clay 的法线材质（edge 0.05、convex 0）。
 */
export function clayMaterial(ctx: AssetCtx, u: ClayMaterial['uniforms']): THREE.MeshToonMaterial {
  const base = ctx.mat('clay', { elem: { kind: 'paint', size: [22, 13], density: [0, 0.04], patch: 4 } });
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: base.gradientMap });
  const md = m as THREE.MeshToonMaterial & { defines?: Record<string, string> };
  md.defines = { ...(base as typeof md).defines };
  m.onBeforeCompile = (sh, r) => {
    base.onBeforeCompile(sh, r);
    Object.assign(sh.uniforms, u);
    const call = /col = elemShade\([^;]*\) \* base;/;
    if (!call.test(sh.fragmentShader) || !sh.fragmentShader.includes('void main() {')) {
      console.warn('clay-court：toon 的 shader 变了，找不到 elemShade 那一行（场面退回普通 clay 材质）');
      return;
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `${CLAY_DECL}\nvoid main() {`)
      .replace(call, 'col = clayShade(int(band + 0.5)) * base;');
  };
  m.customProgramCacheKey = () => 'clay-court-v1';
  m.userData.normalMat = base.userData.normalMat;
  return m;
}
