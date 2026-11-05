/**
 * 方向 A 的像素格式：字符画 → 「材质 + 色阶」网格 → 烘焙成 @td/iso 的 BakedArt。
 *
 * 和 @td/iso 的 SLOT 一样按字母换色，但每个材质有四个色阶（受光、本色、背光、最暗），
 * 光从左上来：背光和最暗往冷色偏、受光往暖色偏，所以只要给一个本色就能推出整条色带。
 *
 * 字符约定（手画的头像、衣服花纹都用这套）：
 * - 大写字母 = 材质本色，小写 = 背光；`TONE_CHARS` 里的符号是受光 / 最暗（皮肤 `1` / `x`、头发 `i` / `v` ……）。
 * - 材质：S 皮肤、H 头发、K 胡子、E 瞳孔、W 白（眼白、袜子、毛巾）、T 上衣、U 上衣第二色（领子、背心、内衬）、
 *   B 下装、F 鞋、C 帽子、A 配饰、G 金属 / 灰（眼镜、工具、手机）、M 唇彩 / 腮红、Q 拍框、R 拍线、D 木头、
 *   P 纸（夹板、本子）、Y 发光（手机屏、闪光灯，夜里不压暗）、7 球（固定黄绿）。
 * - `O` 是手画的内描边（取周围材质的最暗色），外描边由 `outline()` 自动加（选择性描边：用相邻材质的深色，
 *   受光的左上边用背光色，不是纯黑）。
 */
import type { BakedArt } from '@td/iso';

/** 材质字母 */
export type Mat =
  | 'S'
  | 'H'
  | 'K'
  | 'E'
  | 'W'
  | 'T'
  | 'U'
  | 'B'
  | 'F'
  | 'C'
  | 'A'
  | 'G'
  | 'M'
  | 'Q'
  | 'R'
  | 'D'
  | 'P'
  | 'Y'
  | '7'
  | 'O';

export const MATS: readonly Mat[] = [
  'S',
  'H',
  'K',
  'E',
  'W',
  'T',
  'U',
  'B',
  'F',
  'C',
  'A',
  'G',
  'M',
  'Q',
  'R',
  'D',
  'P',
  'Y',
  '7',
  'O',
];

/** 色阶：0 受光、1 本色、2 背光、3 最暗 */
export type Tone = 0 | 1 | 2 | 3;

/** 受光 / 最暗的专用字符（大写 = 本色、小写 = 背光不用写在这里） */
export const TONE_CHARS: Readonly<Record<string, readonly [Mat, Tone]>> = {
  '1': ['S', 0],
  x: ['S', 3],
  i: ['H', 0],
  v: ['H', 3],
  '2': ['T', 0],
  '3': ['T', 3],
  '4': ['B', 0],
  '5': ['C', 0],
  '6': ['C', 3],
  '8': ['A', 3],
  '9': ['G', 3],
  '0': ['K', 3],
  '=': ['U', 3],
  '+': ['W', 0],
  '#': ['F', 3],
};

/** 一个字符 → 材质和色阶（'.' 和空格返回 null） */
export function parseCell(ch: string): readonly [Mat, Tone] | null {
  if (ch === '.' || ch === ' ') return null;
  const t = TONE_CHARS[ch];
  if (t) return t;
  if (ch === '7') return ['7', 1];
  const up = ch.toUpperCase() as Mat;
  if (!MATS.includes(up)) return null;
  return [up, ch === up ? 1 : 2];
}

/** 一个人的换色表：材质 → 本色。缺的用 DEFAULTS。 */
export type Palette = Partial<Record<Mat, string>>;

const DEFAULTS: Record<Mat, string> = {
  S: '#e0a982',
  H: '#4a3020',
  K: '#4a3020',
  E: '#2a1c1c',
  W: '#f2ede2',
  T: '#3f7fc0',
  U: '#f2ede2',
  B: '#3a4560',
  F: '#efeae0',
  C: '#efeae0',
  A: '#8a5a3a',
  G: '#5d636b',
  M: '#c85a5a',
  Q: '#30343c',
  R: '#d9d6c8',
  D: '#9a6b40',
  P: '#f4f0e4',
  Y: '#9fe6ff',
  '7': '#d8e84a',
  O: '#2a2230',
};

/* ---------- 颜色：HSL 色带 ---------- */

function hexRgb(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1, 7), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** 往某个色相转 amt 度（取近的方向） */
function towards(h: number, target: number, amt: number): number {
  let d = target - h;
  d = ((d + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}

/** 本色 → 四阶色带 [受光, 本色, 背光, 最暗] + 描边色（RGB） */
export function ramp(hex: string): [number, number, number][] {
  const [r, g, b] = hexRgb(hex);
  const [h, s, l] = rgbHsl(r, g, b);
  // 沙漠午后：受光偏暖黄，背光偏冷紫
  const hi = hslRgb(towards(h, 50, 8), s * 0.95, l + (1 - l) * 0.28);
  // 暖色（皮肤、沙色）背光往紫红偏会显得脏，饱和度往下压
  const warm = h < 60 || h > 320;
  const sh = hslRgb(towards(h, 255, warm ? 6 : 12), Math.min(1, s * (warm ? 0.78 : 1.0) + 0.02), l * 0.76);
  const dp = hslRgb(towards(h, 260, warm ? 12 : 22), Math.min(1, s * (warm ? 0.6 : 0.9) + 0.04), l * 0.52);
  const ol = hslRgb(towards(h, 265, 30), Math.min(0.6, s * 0.7 + 0.12), Math.max(0.08, l * 0.3));
  return [hi, [r, g, b], sh, dp, ol];
}

/* ---------- 网格 ---------- */

/** 合成用的网格：每格一个材质和色阶（-1 = 空） */
export class Grid {
  readonly m: Int8Array;
  readonly t: Int8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.m = new Int8Array(w * h).fill(-1);
    this.t = new Int8Array(w * h);
  }
  in(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): Mat | null {
    if (!this.in(x, y)) return null;
    const v = this.m[y * this.w + x] as number;
    return v < 0 ? null : (MATS[v] as Mat);
  }
  tone(x: number, y: number): Tone {
    return (this.in(x, y) ? this.t[y * this.w + x] : 1) as Tone;
  }
  set(x: number, y: number, m: Mat, t: Tone = 1): void {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.in(x, y)) return;
    this.m[y * this.w + x] = MATS.indexOf(m);
    this.t[y * this.w + x] = t;
  }
  setTone(x: number, y: number, t: Tone): void {
    if (this.get(x, y)) this.t[y * this.w + x] = t;
  }
  clear(x: number, y: number): void {
    if (this.in(x, y)) this.m[y * this.w + x] = -1;
  }
  /** 把字符画贴上来：(x, y) 是字符画左上角 */
  stamp(rows: readonly string[], x: number, y: number, opt: { flip?: boolean; only?: (m: Mat) => boolean } = {}): void {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j] as string;
      for (let i = 0; i < row.length; i++) {
        const c = parseCell(row[opt.flip ? row.length - 1 - i : i] as string);
        if (!c) continue;
        if (opt.only && !opt.only(c[0])) continue;
        this.set(x + i, y + j, c[0], c[1]);
      }
    }
  }
}

/**
 * 选择性描边：空格挨着人的地方加一圈描边。描边色取相邻材质的「描边色」，
 * 左边、上边（受光的一侧）挨着的用背光色，脚底一行一律最深。描边单独存在 `ol` 里，烘焙时画。
 */
export function outline(g: Grid): { ol: Int16Array } {
  // ol 编码：-1 无；否则 matIndex * 4 + kind（0 = 受光边用背光色，1 = 普通描边色）
  const ol = new Int16Array(g.w * g.h).fill(-1);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.get(x, y)) continue;
      // 右、下边有人 = 这格在人的左上方（受光边）；左、上边有人 = 背光边
      const r = g.get(x + 1, y);
      const d = g.get(x, y + 1);
      const l = g.get(x - 1, y);
      const u = g.get(x, y - 1);
      const dark = l ?? u;
      const lit = r ?? d;
      const m = dark ?? lit;
      if (!m) continue;
      ol[y * g.w + x] = MATS.indexOf(m === 'O' ? 'G' : m) * 4 + (dark ? 1 : 0);
    }
  return { ol };
}

/** 烘焙：网格 + 换色表 → BakedArt（裁到包围盒，锚点跟着挪） */
export function bakeGrid(
  g: Grid,
  pal: Palette,
  ax: number,
  ay: number,
  pts?: Record<string, readonly [number, number]>,
): BakedArt {
  const { ol } = outline(g);
  let x0 = g.w;
  let y0 = g.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.get(x, y) || (ol[y * g.w + x] as number) >= 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { w: 1, h: 1, ox: 0, oy: 0, px: new Uint32Array(1) };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = new Uint32Array(w * h);
  let em: Uint8Array | undefined;
  const ramps = new Map<Mat, [number, number, number][]>();
  const rampOf = (m: Mat) => {
    let r = ramps.get(m);
    if (!r) {
      r = ramp(pal[m] ?? DEFAULTS[m]);
      ramps.set(m, r);
    }
    return r;
  };
  const pack = (c: readonly [number, number, number]) =>
    ((255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255)) >>> 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y - y0) * w + (x - x0);
      const m = g.get(x, y);
      if (m) {
        if (m === 'O') {
          // 内描边：取左边或上边邻居的描边色
          const n = g.get(x - 1, y) ?? g.get(x, y - 1) ?? 'G';
          px[i] = pack(rampOf(n === 'O' ? 'G' : n)[4] as [number, number, number]);
          continue;
        }
        if (pal[m] === 'none') continue;
        const t = g.tone(x, y);
        px[i] = pack(rampOf(m)[m === '7' || m === 'Y' ? Math.min(t, 1) : t] as [number, number, number]);
        if (m === 'Y') {
          em ??= new Uint8Array(w * h);
          em[i] = 1;
        }
        continue;
      }
      const o = ol[y * g.w + x] as number;
      if (o < 0) continue;
      const om = MATS[o >> 2] as Mat;
      const r = rampOf(om);
      px[i] = pack((o & 3) === 0 ? (r[3] as [number, number, number]) : (r[4] as [number, number, number]));
    }
  const out: { -readonly [K in keyof BakedArt]: BakedArt[K] } = { w, h, ox: ax - x0, oy: ay - y0, px };
  if (em) out.emissive = em;
  if (pts) {
    const p: Record<string, readonly [number, number]> = {};
    for (const [k, v] of Object.entries(pts)) p[k] = [v[0] - x0, v[1] - y0];
    out.pts = p;
  }
  return out;
}
