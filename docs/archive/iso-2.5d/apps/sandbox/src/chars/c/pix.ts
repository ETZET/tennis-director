import type { BakedArt } from '@td/iso';
import { pk } from '@td/iso';

/**
 * 方向 C 的像素底层：字符画网格、拼贴、自动描边、换色（每个槽位一条四档色阶）、烘焙成画布或 @td/iso 的 BakedArt。
 *
 * 场景小人和大肖像共用同一套字母和同一份「外观」（Look）：同一个人的肤色、发色、上衣、点缀色在两边是同一条色阶，
 * 所以肖像和小人一定对得上。字母表：
 *
 * | 槽位 | 高光 | 亮面 | 暗面 | 最暗 |
 * | --- | --- | --- | --- | --- |
 * | skin 皮肤 | `+` | `S` | `s` | `z` |
 * | hair 头发 | `^` | `H` | `h` | `x` |
 * | shirt 上衣 | `U` | `T` | `t` | `y` |
 * | trim 领口/滚边 | | `R` | `r` | |
 * | bottoms 下装 | | `B` | `b` | `v` |
 * | shoes 鞋 | | `F` | `f` | |
 * | hat 帽子 | `D` | `C` | `c` | `d` |
 * | accent 招牌色（头带、围巾、护膝、胶布） | `@` | `A` | `a` | |
 * | second 副色（围裙、包、相机） | | `N` | `n` | |
 * | beard 胡子 | | `K` | `k` | |
 * | iris 瞳色 | | `I` | `i` | |
 * | frame 眼镜框 | | `G` | | |
 * | lens 墨镜片 | `%` | `V` | | |
 *
 * 其余：`X` 手臂（长袖 = 上衣色，短袖 = 皮肤）、`J` 腿（长裤 = 下装色，短裤 = 皮肤）、`E` 眼珠黑、`W`/`w` 白（眼白、牙、纸）、
 * `M` 嘴唇、`m` 口腔、`L` 腮红、`Q` 球拍、`O` 描边；数字是固定色（手机、木头、纸、球、袜子、金属……）。
 * `.` 透明，`_` 擦掉（拼贴时把下面一层挖掉）。
 */

export interface Look {
  skin: string;
  hair: string;
  shirt: string;
  trim: string;
  bottoms: string;
  shoes: string;
  hat?: string;
  accent?: string;
  second?: string;
  beard?: string;
  iris?: string;
  frame?: string;
  lens?: string;
  racket?: string;
  longSleeve?: boolean;
  pants?: boolean;
}

export const OUTLINE = '#2a2238';

/** 固定色 */
export const FIXED: Readonly<Record<string, string>> = {
  '1': '#34364a', // 手机壳 / 相机
  '2': '#bff0ff', // 手机屏（夜里也亮）
  '3': '#8a6a45', // 木头（拐杖、刷子柄）
  '4': '#f6f3ea', // 纸（夹板）
  '5': '#dff04a', // 网球
  '6': '#f2efe6', // 袜子
  '7': '#a0a6ac', // 金属（钥匙、穿线钳）
  '8': '#8a5a3a', // 咖啡杯套
  '9': '#c9a25a', // 草帽编织暗纹
  '0': '#e8c050', // 金耳环
  '<': '#b83a4e', // 口红 / 红笔帽
  '>': '#8a6a9a', // 眼影
  '#': '#e83a2a', // 生气的青筋
  '(': '#8fd0f0', // 汗、泪
  E: '#1d1828',
  W: '#f8f4ea',
  w: '#d6cfc0',
  m: '#5a2230',
};

type Slot = keyof Look;
type Tone = 0 | 1 | 2 | 3;
const CH: Readonly<Record<string, readonly [Slot, Tone]>> = {
  '+': ['skin', 0],
  S: ['skin', 1],
  s: ['skin', 2],
  z: ['skin', 3],
  '^': ['hair', 0],
  H: ['hair', 1],
  h: ['hair', 2],
  x: ['hair', 3],
  U: ['shirt', 0],
  T: ['shirt', 1],
  t: ['shirt', 2],
  y: ['shirt', 3],
  R: ['trim', 1],
  r: ['trim', 2],
  B: ['bottoms', 1],
  b: ['bottoms', 2],
  v: ['bottoms', 3],
  F: ['shoes', 1],
  f: ['shoes', 2],
  D: ['hat', 0],
  C: ['hat', 1],
  c: ['hat', 2],
  d: ['hat', 3],
  '@': ['accent', 0],
  A: ['accent', 1],
  a: ['accent', 2],
  N: ['second', 1],
  n: ['second', 2],
  K: ['beard', 1],
  k: ['beard', 2],
  I: ['iris', 1],
  i: ['iris', 2],
  G: ['frame', 1],
  '%': ['lens', 0],
  V: ['lens', 1],
  Q: ['racket', 1],
};

/* ---------------- 颜色 ---------------- */

export type RGB = [number, number, number];
export function rgb(h: string): RGB {
  return [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16)];
}
export function hex(c: RGB): string {
  return `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const mul = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
const WARM_HI = rgb('#fff1cf');
const COOL_SH = rgb('#5a3a6e');
const DEEP_SH = rgb('#33203f');

/**
 * 一条四档色阶：高光往暖黄偏，暗面往紫偏（像素画常用的色相偏移；场景里沙漠的影子也是偏紫的）。
 * 光从画面左边来（和 @td/iso 的 LX/LZ 一致：朝画面左的面亮），所以暗面画在右边。
 */
export function ramp(h: string): readonly [RGB, RGB, RGB, RGB] {
  const c = rgb(h);
  return [mix(c, WARM_HI, 0.3), c, mix(mul(c, 0.8), COOL_SH, 0.14), mix(mul(c, 0.6), DEEP_SH, 0.24)];
}

const rampCache = new Map<string, readonly [RGB, RGB, RGB, RGB]>();
function rampOf(h: string) {
  let r = rampCache.get(h);
  if (!r) {
    r = ramp(h);
    rampCache.set(h, r);
  }
  return r;
}

/** 字母 → 颜色（null = 透明）。outline 是描边色（肖像用"选择描边"，在 paint 里另算）。 */
export function colorOf(ch: string, look: Look): RGB | null {
  if (ch === '.' || ch === ' ' || ch === '_') return null;
  if (ch === 'O') return rgb(OUTLINE);
  if (ch === 'X') return rampOf(look.longSleeve ? look.shirt : look.skin)[1];
  if (ch === 'J') return rampOf(look.pants ? look.bottoms : look.skin)[look.pants ? 1 : 2];
  if (ch === 'M') return mix(rampOf(look.skin)[2], rgb('#b8404a'), 0.45);
  if (ch === 'L') return mix(rampOf(look.skin)[1], rgb('#ff7a7a'), 0.3);
  const f = FIXED[ch];
  if (f) return rgb(f);
  const s = CH[ch];
  if (!s) return null;
  const base = (look[s[0]] as string | undefined) ?? DEFAULTS[s[0]];
  if (!base || base === 'none') return null;
  return rampOf(base)[s[1]];
}

const DEFAULTS: Partial<Record<Slot, string>> = {
  hat: '#ffffff',
  accent: '#e8582c',
  second: '#4a5a6a',
  beard: '#5a3a22',
  iris: '#4a3020',
  frame: '#2a2238',
  lens: '#22283a',
  racket: '#3a3340',
};

/* ---------------- 网格 ---------------- */

export class Grid {
  readonly d: string[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.d = new Array<string>(w * h).fill('.');
  }
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.d[y * this.w + x] as string;
  }
  set(x: number, y: number, c: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  /** 盖一层字符画：'.' 跳过，'_' 擦掉 */
  stamp(rows: readonly string[], x: number, y: number, flip = false): this {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j] as string;
      for (let i = 0; i < r.length; i++) {
        const c = r[flip ? r.length - 1 - i : i] as string;
        if (c === '.' || c === ' ') continue;
        this.set(x + i, y + j, c === '_' ? '.' : c);
      }
    }
    return this;
  }
  /** 只盖在已有像素上（花纹、皱纹） */
  stampOn(rows: readonly string[], x: number, y: number): this {
    for (let j = 0; j < rows.length; j++) {
      const r = rows[j] as string;
      for (let i = 0; i < r.length; i++) {
        const c = r[i] as string;
        if (c === '.' || c === ' ') continue;
        if (this.get(x + i, y + j) !== '.') this.set(x + i, y + j, c);
      }
    }
    return this;
  }
  /** 把某些字母换成另一个（只在 rect 内） */
  replace(from: string, to: string, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h): this {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (from.includes(this.get(x, y))) this.set(x, y, to);
    return this;
  }
  /** 自动描边：透明且四邻有像素的格子变成 'O' */
  outline(skip = ''): this {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== '.') continue;
        const n = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)];
        if (n.some((c) => c !== '.' && c !== 'O' && !skip.includes(c))) add.push(y * this.w + x);
      }
    for (const i of add) this.d[i] = 'O';
    return this;
  }
  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) out.push(this.d.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }
}

/* ---------------- 烘焙 ---------------- */

/**
 * 选择描边（肖像用）：描边像素取旁边那块颜色的最暗档再往描边色压一半，
 * 头发边是深棕、皮肤边是深红棕、白衣服边是灰紫，比一圈纯黑精致。
 */
function selOut(g: Grid, x: number, y: number, look: Look): RGB {
  const o = rgb(OUTLINE);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const c = g.get(x + dx, y + dy);
    if (c === '.' || c === 'O') continue;
    const col = colorOf(c, look);
    if (col) return mix(mul(col, 0.42), o, 0.55);
  }
  return o;
}

export function toPixels(g: Grid, look: Look, sel = false): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(g.w * g.h * 4);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const ch = g.get(x, y);
      const c = ch === 'O' && sel ? selOut(g, x, y, look) : colorOf(ch, look);
      if (!c) continue;
      const i = (y * g.w + x) * 4;
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  return out;
}

/** 画到一张低分辨率画布上（CSS 整数倍放大，image-rendering: pixelated） */
export function toCanvas(g: Grid, look: Look, scale: number, sel = false, cv = document.createElement('canvas')) {
  cv.width = g.w;
  cv.height = g.h;
  cv.style.width = `${g.w * scale}px`;
  cv.style.height = `${g.h * scale}px`;
  cv.style.imageRendering = 'pixelated';
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(toPixels(g, look, sel), g.w, g.h), 0, 0);
  return cv;
}

/** 给 @td/iso 的 Sprite 用（锚点 ox, oy） */
export function toBaked(g: Grid, look: Look, ox: number, oy: number): BakedArt {
  const p = toPixels(g, look);
  const px = new Uint32Array(g.w * g.h);
  let emissive: Uint8Array | undefined;
  for (let i = 0; i < px.length; i++) {
    if (!p[i * 4 + 3]) continue;
    px[i] = pk(p[i * 4] as number, p[i * 4 + 1] as number, p[i * 4 + 2] as number);
    if (g.d[i] === '2') {
      emissive ??= new Uint8Array(px.length);
      emissive[i] = 1;
    }
  }
  return emissive ? { w: g.w, h: g.h, ox, oy, px, emissive } : { w: g.w, h: g.h, ox, oy, px };
}
