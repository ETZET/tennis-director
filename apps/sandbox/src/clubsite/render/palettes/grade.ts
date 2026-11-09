// 配色实验（palette-lab）：把调色板里的每个颜色按"档"（亮 / 中 / 暗）重新调色相、彩度，亮度按规范的 L 精确保持（或按给的系数变）。
// - 只换色相 / 彩度 / 冷暖，不动明暗结构：L = 0.2126R + 0.7152G + 0.0722B（规范量的那个数，sRGB 原值）解出来和原来一样
//   （或 L × lMul + lAdd），所以"亮档低一级 ≥ 170、暗档高一级 ≤ 120"、缝和亮边的差这些规则原样留着。
// - 色相、彩度在 OKLCH 里改（感知均匀：转色相不会忽亮忽暗、不会突然发灰）。
// - 暗档可以"跟着亮档走"（follow）：影子取这个材质亮档的色相再转一点 —— 沙的影子是褐、草的影子是深绿；
//   或者往一个固定色相拉（hue/hueK）—— 全场的影子是同一家（青、蓝紫、玫瑰褐……）。
// 这里不 import three（node 里也能直接跑：node --experimental-strip-types）。
import type { Tones, ToonOpts } from '../toon';

/** 一档的调法（不填 = 不变） */
export interface BandGrade {
  /** 跟着亮档本色的色相走多少 0..1（暗档：影子和亮面同一家）；shift = 在亮档色相上再转几度（OKLCH） */
  follow?: number;
  shift?: number;
  /** 往这个色相染（OKLCH 度：红 29、橙 55、黄 100、绿 140、青 195、蓝 260、紫 300、品红 330）；在 a/b 平面插值，见 tint() */
  hue?: number;
  /** 染多少 0..1（1 = 整个换成这个色相，彩度不变） */
  hueK?: number;
  /** 彩度（OKLCH C）：先乘 c，再夹在 [cMin, cMax] */
  c?: number;
  cMin?: number;
  cMax?: number;
  /** 亮度（规范的 L，0..255）：L' = L × lMul + lAdd */
  lMul?: number;
  lAdd?: number;
}

export interface Grade {
  lit: BandGrade;
  mid: BandGrade;
  dark: BandGrade;
}
export type PartialGrade = Partial<Grade>;

export const IDENTITY: Grade = { lit: {}, mid: {}, dark: {} };

/** 逐字段覆盖（组 / 单个材质的调法盖在全局上） */
export function mergeGrade(base: Grade, over?: PartialGrade): Grade {
  if (!over) return base;
  return {
    lit: { ...base.lit, ...over.lit },
    mid: { ...base.mid, ...over.mid },
    dark: { ...base.dark, ...over.dark },
  };
}

// ── 颜色换算 ──────────────────────────────────────────
type Lab = [number, number, number];

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(h: number): [number, number, number] {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}
export function rgbToHex(r: number, g: number, b: number): number {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}
/** 规范的亮度：sRGB 原值（0..255）直接加权 */
export function luma(h: number): number {
  const [r, g, b] = hexToRgb(h);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
/** OKLab → sRGB 原值（不夹，可能出界） */
function oklabToRgbRaw(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    toGam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
const inGamut = (c: [number, number, number]) => c.every((v) => v >= -0.0005 && v <= 1.0005 && !Number.isNaN(v));

/** OKLCH → sRGB：出界就降彩度（色相不变），不是逐通道夹 */
function lchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  let c = oklabToRgbRaw(L, C * Math.cos(h), C * Math.sin(h));
  if (inGamut(c)) return c;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const t = oklabToRgbRaw(L, mid * Math.cos(h), mid * Math.sin(h));
    if (inGamut(t)) lo = mid;
    else hi = mid;
  }
  c = oklabToRgbRaw(L, lo * Math.cos(h), lo * Math.sin(h));
  return c.map((v) => Math.max(0, Math.min(1, v))) as [number, number, number];
}

export function hexToLch(h: number): [number, number, number] {
  const [L, a, b] = rgbToOklab(...hexToRgb(h));
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), hue < 0 ? hue + 360 : hue];
}

/** 给定彩度、色相，解出 OKLab L 让规范亮度 = target（二分；出界降彩度） */
export function lchAtLuma(target: number, C: number, hDeg: number): number {
  let lo = 0;
  let hi = 1;
  let best = 0;
  for (let i = 0; i < 26; i++) {
    const L = (lo + hi) / 2;
    const c = lchToRgb(L, C, hDeg);
    const y = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * 255;
    best = rgbToHex(...c);
    if (y < target) lo = L;
    else hi = L;
  }
  return best;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const mixHue = (a: number, b: number, t: number) => (a + wrap(b - a) * t + 360) % 360;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * 往一个色相"染"：在 OKLab 的 a/b 平面里往（同彩度的）目标色插值，不是转色相。
 * 差得近（< 60°）和转色相几乎一样；差得远（对面的颜色）会先经过灰 —— 暖光照在蓝东西上是发灰，不是变青；
 * 橙色的面往青影拉也不会半路变成绿色。
 */
function tint(C: number, h: number, target: number, k: number): [number, number] {
  const r = Math.PI / 180;
  const a = C * ((1 - k) * Math.cos(h * r) + k * Math.cos(target * r));
  const b = C * ((1 - k) * Math.sin(h * r) + k * Math.sin(target * r));
  const hh = Math.atan2(b, a) / r;
  return [Math.hypot(a, b), hh < 0 ? hh + 360 : hh];
}

/** 亮档参照：这个材质亮档本色调完以后的色相 / 彩度（暗档 follow 用） */
export interface Ref {
  h: number;
  c: number;
}

/** 调一个颜色。band：0 亮、1 中、2 暗（和 palette 的 [亮, 中, 暗] 一个顺序） */
export function gradeHex(hex: number, band: 0 | 1 | 2, g: Grade, ref?: Ref): number {
  const bg = band === 0 ? g.lit : band === 1 ? g.mid : g.dark;
  if (!Object.keys(bg).length) return hex;
  let [, C, h] = hexToLch(hex);
  if (bg.follow && ref) {
    // 亮档本色几乎是灰（白布、白线）就没有"它的色相"可跟
    const w = bg.follow * smooth(0.012, 0.04, ref.c);
    h = mixHue(h, (ref.h + (bg.shift ?? 0) + 360) % 360, w);
  }
  if (bg.hue !== undefined && bg.hueK) [C, h] = tint(C, h, bg.hue, bg.hueK);
  C = C * (bg.c ?? 1);
  if (bg.cMin !== undefined) C = Math.max(C, bg.cMin);
  if (bg.cMax !== undefined) C = Math.min(C, bg.cMax);
  const y = Math.max(6, Math.min(250, luma(hex) * (bg.lMul ?? 1) + (bg.lAdd ?? 0)));
  return lchAtLuma(y, C, h);
}

export function refOf(litHex: number, g: Grade): Ref {
  const [, c, h] = hexToLch(gradeHex(litHex, 0, g));
  return { h, c };
}

// ── 材质参数整套换 ────────────────────────────────────
type Col = number | string | { getHex(): number };
const hexOf = (c: Col): number =>
  typeof c === 'number' ? c : typeof c === 'string' ? Number.parseInt(c.replace('#', ''), 16) : c.getHex();

/**
 * 没给 ramp 的材质（shader 里从本色推中、暗两档：toon.ts 的 coolShade）：在这里照同样的公式先推出来，
 * 好让它也跟着配色走（只对纯色材质；有贴图/顶点色的 base 是逐像素的，推不出来，就不动）。
 */
function coolShadeJS(hex: number, k: number, v: number, s: number): number {
  const [r, g, b] = hexToRgb(hex);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let hh = 0;
  if (d > 1e-6) {
    if (mx === r) hh = ((g - b) / d + 6) % 6;
    else if (mx === g) hh = (b - r) / d + 2;
    else hh = (r - g) / d + 4;
    hh /= 6;
  }
  let sat = mx > 0 ? d / mx : 0;
  let val = mx;
  let dd = 0.65 - hh;
  dd -= Math.floor(dd + 0.5);
  hh = (((hh + Math.max(-0.06, Math.min(0.15, dd * k))) % 1) + 1) % 1;
  sat = Math.max(0, Math.min(1, sat * s));
  val *= v;
  const f = (n: number) => {
    const kk = (n + hh * 6) % 6;
    return val - val * sat * Math.max(0, Math.min(kk, 4 - kk, 1));
  };
  const rgb = [f(5), f(3), f(1)];
  const tgt = [0.3, 0.28, 0.48];
  const t = 0.55 * k;
  return rgbToHex(...(rgb.map((c, i) => c + (tgt[i] - c) * t) as [number, number, number]));
}

/** 整套材质参数（ramp、tones、elem.accent）按 grade 换色。color = mats.toon 的第一个参数 */
export function gradeOpts(o: ToonOpts, g: Grade, color?: Col): ToonOpts {
  let ramp = o.ramp?.map(hexOf) as [number, number, number] | undefined;
  if (!ramp && !o.tones && !o.map && !o.vertexColors && color !== undefined) {
    const c = hexOf(color);
    ramp = [c, coolShadeJS(c, 0.15, 0.84, 0.9), coolShadeJS(c, 0.45, 0.6, 0.85)];
  }
  const t = o.tones;
  const lit = ramp?.[0] ?? (t ? hexOf(t.bands[0][0]) : color !== undefined ? hexOf(color) : 0xffffff);
  const ref = refOf(lit, g);
  const f = (c: Col, band: number) => gradeHex(hexOf(c), band as 0 | 1 | 2, g, ref);
  const tri = (a: readonly Col[]) => [f(a[0], 0), f(a[1], 1), f(a[2], 2)] as [number, number, number];
  const out: ToonOpts = { ...o };
  if (ramp) out.ramp = tri(ramp);
  if (t) {
    const tones: Tones = {
      bands: [
        t.bands[0].map((c) => f(c, 0)),
        t.bands[1].map((c) => f(c, 1)),
        t.bands[2].map((c) => f(c, 2)),
      ] as Tones['bands'],
      seam: tri(t.seam),
      hi: tri(t.hi),
    };
    out.tones = tones;
  }
  if (o.elem?.accent) out.elem = { ...o.elem, accent: tri(o.elem.accent as Col[]) };
  return out;
}
