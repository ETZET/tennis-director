/**
 * 打包颜色、调色板夜色、Bayer 抖动和值噪声（照搬样片）。不碰 DOM。
 *
 * 颜色打包成 Uint32（ABGR，小端，和 ImageData 一致）；0 = 透明。
 */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : Math.min(v, b));

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
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

/** 打包色按夜色 n（0..1）和受光 lit 换算 */
export function nightP(v: number, n: number, lit: number): number {
  if (n <= 0) return v;
  const r = v & 255;
  const g = (v >>> 8) & 255;
  const b = (v >>> 16) & 255;
  const c = nightRGB(r, g, b, lit);
  return pk(r + (c[0] - r) * n, g + (c[1] - g) * n, b + (c[2] - b) * n);
}

/**
 * 调色板：当前夜色下 hex → 打包色的换算和缓存。夜色变了缓存清空。
 */
export class Palette {
  private n = 0;
  private cache = new Map<string, number>();

  get night(): number {
    return this.n;
  }

  setNight(n: number): void {
    if (n === this.n) return;
    this.n = n;
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
      const q = nightRGB(r, g, b, lit);
      r += (q[0] - r) * this.n;
      g += (q[1] - g) * this.n;
      b += (q[2] - b) * this.n;
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
