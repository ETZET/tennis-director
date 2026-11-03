/**
 * 打包颜色、调色板夜色、Bayer 抖动和值噪声（照搬样片）。不碰 DOM。
 *
 * 颜色打包成 Uint32（ABGR，小端，和 ImageData 一致）；0 = 透明。
 */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : Math.min(v, b));

/** 4×4 Bayer 阈值表（下标 (y & 3) << 2 | (x & 3)） */
export const BAY: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 4×4 Bayer 阈值 0..1 */
export const bay = (x: number, y: number): number => BAY[((y & 3) << 2) | (x & 3)] as number;

/** 打包 RGB（不透明） */
export const pk = (r: number, g: number, b: number): number =>
  ((255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0;

const HX = new Map<string, [number, number, number]>();
/** '#rrggbb' → [r, g, b] */
export function hx(h: string): [number, number, number] {
  let v = HX.get(h);
  if (!v) {
    v = [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16)];
    HX.set(h, v);
  }
  return v;
}

/** '#rrggbb' → 打包色 */
export const ph = (h: string): number => {
  const c = hx(h);
  return pk(c[0], c[1], c[2]);
};

export function mixP(a: number, b: number, t: number): number {
  const ar = a & 255;
  const ag = (a >>> 8) & 255;
  const ab = (a >>> 16) & 255;
  return pk(ar + ((b & 255) - ar) * t, ag + (((b >>> 8) & 255) - ag) * t, ab + (((b >>> 16) & 255) - ab) * t);
}

export function mulP(a: number, f: number, g = f, b = f): number {
  return pk((a & 255) * f, ((a >>> 8) & 255) * g, ((a >>> 16) & 255) * b);
}

/** 样片的夜色：L = 该处受灯光的程度 0..1 */
export function nightRGB(r: number, g: number, b: number, L: number): [number, number, number] {
  return [
    r * (0.22 + 0.78 * L) + 10 * (1 - L) + 14 * L,
    g * (0.27 + 0.66 * L) + 12 * (1 - L) + 6 * L,
    b * (0.48 + 0.44 * L) + 34 * (1 - L),
  ];
}

/**
 * 黄昏 / 清晨的暖色程度（夜色 n 的函数）：白天、深夜都是 0，n≈0.3（日落、日出）最暖。
 * 夜色一条轴同时管"金色时刻 → 日落 → 蓝调 → 夜"，早晚走同一条路，静态层按夜色档烘焙就够了。
 */
export const warmth = (n: number): number => (n <= 0 || n >= 0.62 ? 0 : Math.sin((Math.PI * n) / 0.62));

/**
 * 夜色换算的系数（每个通道 c' = c * m + a），按夜色 n、受光 lit、暖色系数 w（雨天 0）算。
 * 夜色换算对颜色是仿射的：先暖色调（乘），再往样片的 nightRGB 靠 n。
 */
function gradeK(n: number, lit: number, w: number, out: Float64Array): void {
  const h = warmth(n) * w;
  const wr = 1 + 0.08 * h;
  const wg = 1 - 0.02 * h;
  const wb = 1 - 0.15 * h;
  const L = lit;
  const nm = 1 - n;
  out[0] = wr * (nm + n * (0.22 + 0.78 * L));
  out[1] = n * (10 * (1 - L) + 14 * L);
  out[2] = wg * (nm + n * (0.27 + 0.66 * L));
  out[3] = n * (12 * (1 - L) + 6 * L);
  out[4] = wb * (nm + n * (0.48 + 0.44 * L));
  out[5] = n * 34 * (1 - L);
}

const GK = new Float64Array(6);
let gkN = -1;
let gkL = -1;
let gkW = -1;

/** 打包色按夜色 n（0..1）、受光 lit、暖色系数 warm（0..1，雨天压掉）换算 */
export function nightP(v: number, n: number, lit: number, warm = 1): number {
  if (n <= 0) return v;
  if (n !== gkN || lit !== gkL || warm !== gkW) {
    gradeK(n, lit, warm, GK);
    gkN = n;
    gkL = lit;
    gkW = warm;
  }
  return pk(
    (v & 255) * (GK[0] as number) + (GK[1] as number),
    ((v >>> 8) & 255) * (GK[2] as number) + (GK[3] as number),
    ((v >>> 16) & 255) * (GK[4] as number) + (GK[5] as number),
  );
}

/**
 * 调色板：当前夜色下 hex → 打包色的换算和缓存。夜色、暖色变了缓存清空。
 */
export class Palette {
  private n = 0;
  private w = 1;
  private cache = new Map<string, number>();
  private readonly k = new Float64Array(6);

  get night(): number {
    return this.n;
  }

  /** 暖色系数（1 晴天，雨天往 0 走） */
  get warm(): number {
    return this.w;
  }

  setNight(n: number, warm = this.w): void {
    if (n === this.n && warm === this.w) return;
    this.n = n;
    this.w = warm;
    this.cache.clear();
  }

  /** 夜色换算后的颜色（lit 0..1 = 该处受灯光的程度） */
  col(h: string, f = 1, lit = 0): number {
    const key = `${h}${f}|${lit}`;
    let v = this.cache.get(key);
    if (v !== undefined) return v;
    const c = hx(h);
    let r = c[0] * f;
    let g = c[1] * f;
    let b = c[2] * f;
    if (this.n > 0) {
      const k = this.k;
      gradeK(this.n, lit, this.w, k);
      r = r * (k[0] as number) + (k[1] as number);
      g = g * (k[2] as number) + (k[3] as number);
      b = b * (k[4] as number) + (k[5] as number);
    }
    v = pk(r, g, b);
    this.cache.set(key, v);
    return v;
  }

  /** 自发光颜色（夜里不压暗） */
  em(h: string, f = 1): number {
    const c = hx(h);
    return pk(c[0] * f, c[1] * f, c[2] * f);
  }
}

/* ---------- 值噪声（样片的 hash / vnoise / fbm） ---------- */

export function hash(i: number, j: number, s = 0): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x: number, z: number, s = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const a = hash(i, j, s);
  const b = hash(i + 1, j, s);
  const c = hash(i, j + 1, s);
  const d = hash(i + 1, j + 1, s);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x: number, z: number, s = 0): number {
  return vnoise(x, z, s) * 0.5 + vnoise(x * 2.13, z * 2.13, s + 7) * 0.3 + vnoise(x * 4.37, z * 4.37, s + 13) * 0.2;
}
