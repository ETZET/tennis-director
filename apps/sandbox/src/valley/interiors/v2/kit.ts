// 第二版店内的共用件（批 K2，归 kit 代理）：三家店都用的"看得懂、点得着"的小件。
// 接口（签名）由 lead 定、三家店代理照着调；kit 代理只改实现，不改签名（要加参数就加可选的）。
//
// 共同约定：本地原点、+z 朝镜头（朝南）、单位米。
// 店里镜头近：米/纹素 = 0.045 × zoom（v2 默认 0.45～0.5 → 一个渲染纹素 ≈ 0.0203～0.0225 米）。
// 字的一格 = CELL 米（默认 0.045 = 店里 2 个渲染纹素，笔画粗、手机上好认）；
//   竖直面上一行 = 一格 / cos45（俯 45° 下屏幕上是方的），地面上一行也是 一格 / cos45（地面 z 方向同样压 0.707）。
// 小件都不投影、不接收投影；字、币、点都是贴在牌面前 3～4 毫米的平片（深度差小于描边阈值，不会被描边吃掉）。
//
// 用法提示（给店内代理）：
// - priceTag：默认 2 位数 ≈ 0.71 × 0.42 米、3 位数 ≈ 0.89 × 0.42；挂在货架沿 / 东西正下方，牌底离地 0.35～1.0 米都清楚；
//   东西挤的地方用 { size: 'sm' }（1 纹素细字，3 位数 ≈ 0.6 × 0.3 米）。
// - talkBubble：原点 = 尖角，整块向镜头仰 45°（屏幕上不压扁）；站着的人放 y ≈ 2.05、坐着的 ≈ 1.6，x 和人对齐。
// - fascia：h 默认 0.5 → 自动挑最大的字（0.5 高放 3×5 粗字，≥ 0.7 高放 5×7 粗字）；也可以 { cell, font } 指定。
// - floorLabel：框线 0.135 米；字自动挑最大能放下的 5×7（字宽 ≤ 框宽 86%、字高 ≤ 框深 55%）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../../../clubsite/render/geo';
import type { ToonOpts } from '../../../clubsite/render/toon';
import type { AssetCtx, AssetFn } from '../../ctx';

/** 字的默认一格（米）：店里 2 个渲染纹素 */
export const CELL = 0.045;
const COS45 = Math.SQRT1_2;

// ── 像素字 ──────────────────────────────────────────────────────────────

/** 5 × 7 的大写像素字（# = 一格）。宽度按每行字符串的长度（'.'、'-'、'!' 这些窄） */
export const FONT_BIG: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '##', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.', '#', '#', '.', '#', '#', '.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
};

/** 3 × 5 的粗字（价签、窄招牌；一格 2 纹素时笔画 2 像素宽）。M、W 5 格宽，N 4 格 */
export const FONT_SMALL: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.##.', '#..#', '#..#', '#.#.', '.#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  $: ['.##', '##.', '.#.', '.##', '##.'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
  '-': ['...', '...', '###', '...', '...'],
  '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['.', '#', '.', '#', '.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  "'": ['#', '#', '.', '.', '.'],
};

export type FontId = 'big' | 'small';
const fontOf = (f: FontId | undefined) => (f === 'small' ? FONT_SMALL : FONT_BIG);
/** 字高（格数） */
export const fontRows = (f: FontId = 'big') => (f === 'small' ? 5 : 7);
/** 空格宽、字距（格数） */
const spaceCols = (f: FontId) => (f === 'small' ? 2 : 3);

export interface TextOpts {
  /** 一格多宽（米，横向）；竖直面 / 地面上一行 = cell / cos45。默认 CELL（0.045） */
  cell?: number;
  /** 'big' = 5 × 7（默认），'small' = 3 × 5 粗字 */
  font?: FontId;
  /** 对齐：x 是左边 / 中心 / 右边（默认中心） */
  align?: 'left' | 'center' | 'right';
}

/** 一行字的宽（格数）：每个字自己的宽 + 1 格字距，空格 3 格（小字 2 格）；不认识的字当空格 */
export function textCols(text: string, font: FontId = 'big'): number {
  const F = fontOf(font);
  let n = 0;
  const chars = [...text.toUpperCase()];
  chars.forEach((ch, i) => {
    const g = F[ch];
    n += g ? g[0].length : spaceCols(font);
    if (i < chars.length - 1) n += 1;
  });
  return n;
}
/** 一行字的宽（米） */
export const textWidth = (text: string, o: TextOpts = {}) => textCols(text, o.font) * (o.cell ?? CELL);
/** 一行字的高（米，竖直面上 / 地面上的深） */
export const textHeight = (o: TextOpts = {}) => (fontRows(o.font) * (o.cell ?? CELL)) / COS45;

/** 每个字每一行的连续格 → 一个矩形 [左列, 右列, 行(0 = 最下)]，供竖直 / 地面两种摆法共用 */
function textRuns(text: string, font: FontId): { c0: number; c1: number; r: number }[] {
  const F = fontOf(font);
  const rows = fontRows(font);
  const out: { c0: number; c1: number; r: number }[] = [];
  let cx = 0;
  for (const ch of text.toUpperCase()) {
    const g = F[ch];
    if (!g) {
      cx += spaceCols(font) + 1;
      continue;
    }
    for (let r = 0; r < rows; r++) {
      const row = g[r];
      let c = 0;
      while (c < row.length) {
        if (row[c] !== '#') {
          c++;
          continue;
        }
        let e = c;
        while (e < row.length && row[e] === '#') e++;
        out.push({ c0: cx + c, c1: cx + e, r: rows - 1 - r });
        c = e;
      }
    }
    cx += g[0].length + 1;
  }
  return out;
}

const alignX = (x: number, w: number, a: TextOpts['align']) => (a === 'left' ? x : a === 'right' ? x - w : x - w / 2);

/**
 * 一行字 → 一个合并好的几何（竖直面，朝 +z）。x = 对齐点（默认中心），y = 字底，z = 字面离原点多远。
 * 店内代理自己写字（黑板、门牌、柜台上的小字）也用它：new THREE.Mesh(textGeo('OPEN', { x: 0, y: 1.2, z: 0.03 }), 墨的材质)。
 */
export function textGeo(text: string, o: TextOpts & { x?: number; y?: number; z?: number } = {}): THREE.BufferGeometry {
  const font = o.font ?? 'big';
  const cell = o.cell ?? CELL;
  const row = cell / COS45;
  const x0 = alignX(o.x ?? 0, textCols(text, font) * cell, o.align);
  const y0 = o.y ?? 0;
  const z = o.z ?? 0;
  const gs = textRuns(text, font).map(({ c0, c1, r }) =>
    new THREE.PlaneGeometry((c1 - c0) * cell, row).translate(x0 + ((c0 + c1) / 2) * cell, y0 + (r + 0.5) * row, z),
  );
  return mergeOrEmpty(gs);
}

/**
 * 一行字 → 平铺在地面的几何（朝上，字的"上"朝北 −z，镜头里是正的）。
 * x = 对齐点（默认中心），z = 字的南沿（字底），y = 离地（默认 0.012）。
 */
export function floorTextGeo(
  text: string,
  o: TextOpts & { x?: number; y?: number; z?: number } = {},
): THREE.BufferGeometry {
  const font = o.font ?? 'big';
  const cell = o.cell ?? CELL;
  const row = cell / COS45;
  const x0 = alignX(o.x ?? 0, textCols(text, font) * cell, o.align);
  const y = o.y ?? 0.012;
  const z0 = o.z ?? 0;
  const gs = textRuns(text, font).map(({ c0, c1, r }) =>
    new THREE.PlaneGeometry((c1 - c0) * cell, row)
      .rotateX(-Math.PI / 2)
      .translate(x0 + ((c0 + c1) / 2) * cell, y, z0 - (r + 0.5) * row),
  );
  return mergeOrEmpty(gs);
}

function mergeOrEmpty(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!gs.length) return new THREE.BufferGeometry();
  return mergeGeometries(gs) ?? new THREE.BufferGeometry();
}

/** 在给定的框里挑最大的字：先 5×7、再 3×5 粗字；一格取 cellStep 的整数倍（默认 0.0225 = 店里 1 个渲染纹素） */
export function fitText(
  text: string,
  maxW: number,
  maxH: number,
  o: { fonts?: FontId[]; maxCell?: number; minBoldCell?: number } = {},
): { font: FontId; cell: number } {
  const step = 0.0225;
  const fonts = o.fonts ?? ['big', 'small'];
  const maxCell = o.maxCell ?? 0.18;
  const minBold = o.minBoldCell ?? 0.045;
  const best = (font: FontId) => {
    const cols = Math.max(1, textCols(text, font));
    const byW = maxW / cols;
    const byH = (maxH * COS45) / fontRows(font);
    const c = Math.floor(Math.min(byW, byH, maxCell) / step + 1e-6) * step;
    return c;
  };
  // 粗字（一格 ≥ 2 纹素）优先；都只能 1 纹素时用 5×7
  for (const f of fonts) {
    const c = best(f);
    if (c >= minBold - 1e-6) return { font: f, cell: c };
  }
  return { font: fonts[0], cell: Math.max(step, best(fonts[0])) };
}

/**
 * 小件一律锁在亮档（bands 压到 −2：不管朝哪、店里光从哪来都是同一个颜色）、不描边、不受投影。
 * 归 club 组（signBoard / signPaint 名下）：午后方案亮档只往金色染 8%、+9 亮度，原值基本就是成品色。
 * 不锁的话朝南的牌面落暗档，accent 组暗档被拉成玫瑰褐（金字成了桃色）。
 */
const FLAT: ToonOpts = { bands: [-2, -1.9], edge: 0, convex: 0, noShadowReceive: true };

// ── 材质（3 档 × 3 色手挑；没有元素图案的平涂小件，三档颜色挨着，哪一档落下来都对） ──

/** 价签牌、气泡描边、点：深炭蓝（L 亮 58 / 中 46 / 暗 36），借 signBoard（club 组：暗档留青蓝，不被染褐） */
const INK_DARK: ToonOpts = {
  ramp: [0x3a3c4e, 0x2e3040, 0x242634],
  ...FLAT,
};
/** 金：价钱数字、金币面（L 亮 205 / 中 190 / 暗 170），借 signPaint（club 组，亮档） */
const GOLD: ToonOpts = {
  ramp: [0xffd75a, 0xf6c444, 0xe4ab36],
  ...FLAT,
};
/** 金币外圈（暗金，L 亮 150 / 中 136 / 暗 120） */
const GOLD_RIM: ToonOpts = {
  ramp: [0xc98f2c, 0xb87e26, 0xa06a24],
  ...FLAT,
};
/** 金币高光（L ≈ 240） */
const GOLD_HI: ToonOpts = {
  ramp: [0xfff4c0, 0xffeeb0, 0xfbe4a0],
  ...FLAT,
};
/** 气泡底：暖白（L 亮 249 / 中 244 / 暗 234），借 signPaint */
const BUBBLE: ToonOpts = {
  ramp: [0xfffcf4, 0xfbf6ec, 0xf0eadf],
  ...FLAT,
};

const dark = (ctx: AssetCtx) => ctx.mat('signBoard', INK_DARK);
const gold = (ctx: AssetCtx) => ctx.mat('signPaint', GOLD);
const goldRim = (ctx: AssetCtx) => ctx.mat('signPaint', GOLD_RIM);
const goldHi = (ctx: AssetCtx) => ctx.mat('signPaint', GOLD_HI);
const white = (ctx: AssetCtx) => ctx.mat('signPaint', BUBBLE);

/** 圆角矩形（xy 平面，左下角 (x, y)） */
function roundRect(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ── 价签 ───────────────────────────────────────────────────────────────

/**
 * 价签：一块深色小牌，左边一枚金币、右边金色价钱数字（Sneaky Sasquatch 的"东西下面挂价签、走过去点就买"）。
 * 原点 = 牌子底边正中，牌面朝 +z（竖着挂在货架沿、球拍下面），牌厚 0.03（中心在 z 0）。
 * 默认（md）：3×5 粗字、一格 0.045 → 牌高 0.42 米，宽 = 0.38 + 0.18 × 位数 − 0.045（2 位 ≈ 0.71、3 位 ≈ 0.89）。
 * size 'sm'：5×7 细字、一格 0.0225 → 牌高 0.31 米，3 位 ≈ 0.62 米。
 * userData.tag = { price, w, h }（以后接点按用）。
 */
export function priceTag(ctx: AssetCtx, price: number, o: { size?: 'md' | 'sm' } = {}): THREE.Object3D {
  const sm = o.size === 'sm';
  const font: FontId = sm ? 'big' : 'small';
  const cell = sm ? 0.0225 : CELL;
  const label = String(Math.max(0, Math.round(price)));
  const textW = textCols(label, font) * cell;
  const textH = textHeight({ font, cell });
  const pad = sm ? 0.05 : 0.06;
  const coinR = Math.round((textH * COS45 * 0.62) / 0.0225) * 0.0225; // 币直径 ≈ 字高（屏幕上），按纹素取整
  const gap = sm ? 0.04 : 0.05;
  const w = pad + coinR * 2 + gap + textW + pad;
  const h = textH + pad * 2 * (sm ? 1 : 0.85);
  const zf = 0.015; // 牌面
  const g = new THREE.Group();
  g.name = `in2-kit-tag:${price}`;

  g.add(new THREE.Mesh(box(w, h, 0.03, 0, 0, 0), dark(ctx)));
  // 金币：暗金外圈 + 金面 + 左上一点高光（竖直面上圆按 cos45 拉高，屏幕上是圆的）
  const cx = -w / 2 + pad + coinR;
  const cy = h / 2;
  const coin = (r: number) => new THREE.CircleGeometry(r, 16).scale(1, 1 / COS45, 1).translate(cx, cy, 0);
  g.add(new THREE.Mesh(coin(coinR).translate(0, 0, zf + 0.002), goldRim(ctx)));
  g.add(new THREE.Mesh(coin(coinR - 0.0225).translate(0, 0, zf + 0.003), gold(ctx)));
  // 币面上一道竖纹（像币上的刻印）+ 左上高光
  g.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.0225, (coinR * 0.9) / COS45).translate(cx + 0.0225 * 0.5, cy, zf + 0.004),
      goldRim(ctx),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(0.0225, 0.0225 / COS45).translate(
        cx - coinR * 0.45,
        cy + (coinR * 0.45) / COS45,
        zf + 0.004,
      ),
      goldHi(ctx),
    ),
  );
  // 数字
  const tx = -w / 2 + pad + coinR * 2 + gap;
  g.add(
    new THREE.Mesh(textGeo(label, { font, cell, x: tx, y: (h - textH) / 2, z: zf + 0.003, align: 'left' }), gold(ctx)),
  );

  g.userData.tag = { price, w, h };
  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}

// ── 对话气泡 ───────────────────────────────────────────────────────────

/**
 * "能说话"的气泡：暖白圆角对话框 + 一圈 1 纹素深边，里面三个点"…"，下面一个小尖角朝下。
 * 原点 = 尖角的尖（摆在人头顶上方 ≈ 0.25 米：站着的人 y ≈ 2.05，坐着的 ≈ 1.6）；框 0.72 × 0.44 米、尖角 0.14 米。
 * 整块绕尖角往镜头仰 45°（正对镜头，屏幕上不压扁）。描边 pass 关掉（edge 0）—— 深边是自己画的，"…"不会被吃掉。
 * userData.bob = true：以后 main 让它上下轻轻浮（现在不动）。
 */
export function talkBubble(ctx: AssetCtx): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'in2-kit-bubble';
  const W = 0.72;
  const H = 0.44;
  const tail = 0.14;
  const R = 0.13;
  const b = 0.0225; // 深边宽（店里 1 纹素）
  const shape = (grow: number) => {
    const s = roundRect(-W / 2 - grow, tail - grow, W + grow * 2, H + grow * 2, R + grow);
    return s;
  };
  // 尖角：从框底偏左一点往下收到原点（尖）
  const tailShape = (grow: number) => {
    const s = new THREE.Shape();
    s.moveTo(-0.08 - grow, tail + 0.03);
    s.lineTo(0.1 + grow, tail + 0.03);
    s.lineTo(0, -grow * 1.4);
    s.lineTo(-0.08 - grow, tail + 0.03);
    return s;
  };
  const tilt = new THREE.Group();
  tilt.rotation.x = -Math.PI / 4;
  g.add(tilt);
  const rimG = mergeOrEmpty([new THREE.ShapeGeometry(shape(b), 6), new THREE.ShapeGeometry(tailShape(b), 1)]);
  const faceG = mergeOrEmpty([
    new THREE.ShapeGeometry(shape(0), 6).translate(0, 0, 0.004),
    new THREE.ShapeGeometry(tailShape(0), 1).translate(0, 0, 0.004),
  ]);
  tilt.add(new THREE.Mesh(rimG, dark(ctx)));
  tilt.add(new THREE.Mesh(faceG, white(ctx)));
  // "…"：三个 4 × 4 纹素的方点，间距 8 纹素
  const d = 0.09;
  const dots: THREE.BufferGeometry[] = [];
  for (const k of [-1, 0, 1]) dots.push(new THREE.PlaneGeometry(d, d).translate(k * 0.18, tail + H / 2, 0.008));
  tilt.add(new THREE.Mesh(mergeOrEmpty(dots), dark(ctx)));
  g.userData.bob = true;
  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}

// ── 分区大字条 ─────────────────────────────────────────────────────────

/**
 * 大字分区招牌（货架正面、墙上的一条）：底色一条 + 大写像素字居中（A–Z、0–9、空格、& - $ . 这些）。
 * 原点 = 招牌底边正中，牌面朝 +z（板厚 0.05，中心在 z 0）；w 米宽、h 米高（默认 0.5）；bg / ink 由店自己给材质。
 * 字自动挑最大能放下的（宽 ≤ 88% w、高 ≤ 66% h；粗字优先）；cell / font 可以指定。上下各一行 ink 细边（edgeLines，默认开）。
 */
export function fascia(
  ctx: AssetCtx,
  text: string,
  o: {
    w: number;
    h?: number;
    bg: THREE.Material;
    ink: THREE.Material;
    cell?: number;
    font?: FontId;
    edgeLines?: boolean;
  },
): THREE.Object3D {
  const h = o.h ?? 0.5;
  const g = new THREE.Group();
  g.name = `in2-kit-fascia:${text}`;
  g.add(new THREE.Mesh(box(o.w, h, 0.05, 0, 0, 0), o.bg));
  const fit = o.cell
    ? { font: o.font ?? 'big', cell: o.cell }
    : fitText(text, o.w * 0.88, h * 0.66, o.font ? { fonts: [o.font] } : {});
  const th = textHeight(fit);
  const z = 0.025 + 0.003;
  const parts: THREE.BufferGeometry[] = [textGeo(text, { ...fit, x: 0, y: (h - th) / 2, z })];
  if (o.edgeLines !== false && h >= 0.35) {
    // 上下各一行细线（离边 1 行），像印出来的招牌边
    const row = 0.0225 / COS45;
    parts.push(new THREE.PlaneGeometry(o.w - 0.09, row).translate(0, row * 1.5, z));
    parts.push(new THREE.PlaneGeometry(o.w - 0.09, row).translate(0, h - row * 1.5, z));
  }
  g.add(new THREE.Mesh(mergeOrEmpty(parts), o.ink));
  ctx.mats.prepare(g, { cast: false, receive: false });
  return g;
}

// ── 地上的大字框 ───────────────────────────────────────────────────────

/**
 * 地上漆的大字框（LOADING ZONE、FORKLIFT、PAY HERE…）：一圈漆线框 + 框里的大字，平铺在地面（y 0.01），
 * 字的"上"朝北（−z），从镜头看是正的。原点 = 框的中心；w × d 米；ink 由店给（安全黄、白……）。
 * frame false = 只有字。字自动挑最大能放下的 5×7（cell / font 可以指定）；字太长放不下一行时按空格拆两行。
 */
export function floorLabel(
  ctx: AssetCtx,
  text: string,
  o: { w: number; d: number; ink: THREE.Material; frame?: boolean; cell?: number; font?: FontId },
): THREE.Object3D {
  const g = new THREE.Group();
  g.name = `in2-kit-floor:${text}`;
  const t = 0.135;
  const y = 0.008;
  const parts: THREE.BufferGeometry[] = [];
  const flat = (w: number, d: number, x: number, z: number) =>
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z);
  if (o.frame !== false) {
    parts.push(flat(o.w, t, 0, -o.d / 2 + t / 2));
    parts.push(flat(o.w, t, 0, o.d / 2 - t / 2));
    parts.push(flat(t, o.d - 2 * t, -o.w / 2 + t / 2, 0));
    parts.push(flat(t, o.d - 2 * t, o.w / 2 - t / 2, 0));
  }
  const innerW = (o.w - (o.frame !== false ? 2 * t : 0)) * 0.86;
  const innerD = (o.d - (o.frame !== false ? 2 * t : 0)) * 0.7;
  const fonts: FontId[] = o.font ? [o.font] : ['big'];
  let lines = [text];
  let fit = o.cell
    ? { font: fonts[0], cell: o.cell }
    : fitText(text, innerW, innerD * 0.8, { fonts, minBoldCell: 0.0225 });
  // 有空格就试试拆成两行，字能更大就拆
  if (!o.cell && text.includes(' ')) {
    const words = text.split(' ');
    const mid = Math.ceil(words.length / 2);
    const two = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    const longer = two[0].length >= two[1].length ? two[0] : two[1];
    const f2 = fitText(longer, innerW, innerD / 2.35, { fonts, minBoldCell: 0.0225 });
    if (f2.cell > fit.cell) {
      lines = two;
      fit = f2;
    }
  }
  const lh = textHeight(fit);
  const gapL = lh * 0.35;
  const total = lines.length * lh + (lines.length - 1) * gapL;
  lines.forEach((ln, i) => {
    // 第 i 行的南沿 z（第一行在北）
    const zSouth = -total / 2 + lh + i * (lh + gapL);
    parts.push(floorTextGeo(ln, { ...fit, x: 0, y: y + 0.001, z: zSouth }));
  });
  g.add(new THREE.Mesh(mergeOrEmpty(parts), o.ink));
  ctx.mats.prepare(g, { cast: false, receive: true });
  return g;
}

/** 画廊用（valleyassets.html?asset=in2-kit-…）：样品 */
export const ASSETS: Record<string, AssetFn> = {
  'in2-kit-tag': (ctx) => {
    const g = new THREE.Group();
    const a = priceTag(ctx, 129);
    a.position.set(-0.6, 0.9, 0);
    const b = priceTag(ctx, 45);
    b.position.set(0.55, 0.9, 0);
    const c = priceTag(ctx, 1250, { size: 'sm' });
    c.position.set(0, 0.3, 0);
    g.add(a, b, c);
    return g;
  },
  'in2-kit-bubble': (ctx) => {
    const g = talkBubble(ctx);
    g.position.y = 1.2;
    const w = new THREE.Group();
    w.add(g);
    return w;
  },
  'in2-kit-fascia': (ctx) => {
    const g = new THREE.Group();
    const bg = ctx.mat('signBoard', { ramp: [0x2f6cc0, 0x2a5ea8, 0x22488a], noShadowReceive: true, edge: 0.4 });
    const ink = ctx.mat('signPaint', {
      ramp: [0xfff4d6, 0xfbeccc, 0xf0dfbe],
      edge: 0,
      convex: 0,
      noShadowReceive: true,
    });
    const a = fascia(ctx, 'RACQUETS', { w: 3, bg, ink });
    a.position.y = 1.4;
    const b = fascia(ctx, 'IRRIGATION & PAINT', { w: 3.6, h: 0.75, bg, ink });
    b.position.y = 0.4;
    g.add(a, b);
    return g;
  },
  'in2-kit-floor': (ctx) =>
    floorLabel(ctx, 'LOADING ZONE', {
      w: 4,
      d: 3,
      ink: ctx.mat('flowerYellow', { ramp: [0xf2c23a, 0xe0ac30, 0xc08a2c], edge: 0, convex: 0 }),
    }),
  'in2-kit-font': (ctx) => {
    const g = new THREE.Group();
    const ink = ctx.mat('signBoard', { ...INK_DARK });
    const lines = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', '0123456789 $&-.'];
    lines.forEach((ln, i) => {
      g.add(new THREE.Mesh(textGeo(ln, { x: 0, y: 2.4 - i * 0.55, z: 0 }), ink));
      g.add(new THREE.Mesh(textGeo(ln, { font: 'small', x: 0, y: 0.9 - i * 0.4, z: 0 }), ink));
    });
    ctx.mats.prepare(g, { cast: false, receive: false });
    return g;
  },
};
