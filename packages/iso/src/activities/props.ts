import { clamp, pick, type Rand, range } from '@td/shared';
import type { SlotColors } from '../art/format';
import { HELD, HELD_SLOTS } from '../art/props/held';
import { bakeArt } from '../core/art';
import { Box, Group, type Node, Sprite } from '../core/graph';

/**
 * 活动用的道具：拿在手里的小东西（水瓶、奖杯、铲子……）是独立的小组，
 * 摆在地上的（长凳、桌子、帐篷、树）进活动自己的道具批次（PropBatch：一个装 Box 的组）。
 */

/* ---------------- 颜色 ---------------- */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = Number.parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hx2 = (v: number) =>
  Math.round(clamp(v, 0, 255))
    .toString(16)
    .padStart(2, '0');
function rgbToHex(r: number, g: number, b: number): string {
  return `#${hx2(r)}${hx2(g)}${hx2(b)}`;
}

/** 两个颜色插值（t=0 是 a） */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** 给颜色加一点亮度抖动（HSL 的 L），只消耗一个随机数（和旧版 jitter 一样）。 */
export function jitter(hex: string, amt: number, rand: Rand): string {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (mx + mn) / 2;
  const d = mx - mn;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  l = clamp(l + (rand() * 2 - 1) * amt, 0, 1);
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

export const jit = (rand: Rand, hex: string, amt = 0.045): string => jitter(hex, amt, rand);

/* ---------------- 道具批次 ---------------- */

/** YXZ 欧拉角（旧批处理器的旋转顺序）→ 场景图用的 XYZ 欧拉角，外加旋转矩阵（行主序 3×3）。 */
function yxzToXyz(ry: number, rx: number, rz: number): { m: number[]; x: number; y: number; z: number } {
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  // three 的 YXZ：R = Ry * Rx * Rz
  const ce = c * e;
  const cf = c * f;
  const de = d * e;
  const df = d * f;
  const m = [ce + df * b, de * b - cf, a * d, a * f, a * e, -b, cf * b - de, df + ce * b, a * c];
  const m13 = m[2] as number;
  const y = Math.asin(clamp(m13, -1, 1));
  let x: number;
  let z: number;
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-(m[5] as number), m[8] as number);
    z = Math.atan2(-(m[1] as number), m[0] as number);
  } else {
    x = Math.atan2(m[7] as number, m[4] as number);
    z = 0;
  }
  return { m, x, y, z };
}

/**
 * 道具批次：照旧版 VoxelBatcher 的 `box()` 写法加盒子，每个盒子是一个 Box 节点，放在 `group` 里。
 * 位置是盒子底面中心（Box 本身中心在原点，这里换算），旋转顺序 YXZ。
 */
export class PropBatch {
  readonly group = new Group();
  /**
   * 裁剪：返回 false 的位置（盒子底面中心）不放盒子。
   * 盒子的参数（包括随机颜色）在调用前已经算好，所以裁掉的盒子照样消耗了随机数。
   */
  clip: ((x: number, z: number) => boolean) | null = null;
  private n = 0;

  constructor() {
    this.group.name = 'props';
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, col: string, ry = 0, rx = 0, rz = 0): Box {
    const b = new Box(w, h, d, col);
    if (this.clip && !this.clip(x, z)) return b;
    if (rx || rz) {
      const r = yxzToXyz(ry, rx, rz);
      // 中心 = 底面中心 + R·(0, h/2, 0)
      b.position.set(
        x + (r.m[1] as number) * (h / 2),
        y + (r.m[4] as number) * (h / 2),
        z + (r.m[7] as number) * (h / 2),
      );
      b.rotation.set(r.x, r.y, r.z);
    } else {
      b.position.set(x, y + h / 2, z);
      b.rotation.y = ry;
    }
    this.group.add(b);
    this.n++;
    return b;
  }

  get boxCount(): number {
    return this.n;
  }

  /** 把批次挂到 parent 下（重复调用无害），返回批次的组。 */
  build(parent: Node): Group {
    if (this.group.parent !== parent) parent.add(this.group);
    return this.group;
  }
}

/* ---------------- 手里拿的 ---------------- */

/** 手持道具的方块（描深色外轮廓），(x,y,z) 是方块中心，和旧版 part() 一样。 */
function hp(g: Node, w: number, h: number, d: number, x: number, y: number, z: number, col: string): Box {
  const b = new Box(w, h, d, col, { outline: true });
  b.position.set(x, y, z);
  g.add(b);
  return b;
}

/**
 * 手持道具：有像素素材（art/props/held.ts 的 HELD[name]）就用一张精灵，锚点（握点）对准组的原点也就是手的挂点；
 * 没有就用方块拼（fallback）。slots 是换色（例如水瓶、旗子、伞的主色），盖在 HELD_SLOTS 的默认色上。
 */
function held(name: string, slots: SlotColors, fallback: (g: Group) => void): Group {
  const g = new Group();
  g.name = name;
  const art = HELD[name];
  if (art) {
    const s = new Sprite(bakeArt(art, { ...HELD_SLOTS[name], ...slots }));
    s.renderOrder = 0.2;
    g.add(s);
  } else fallback(g);
  return g;
}

export function mkBottle(col = '#3aa0d8'): Group {
  return held('bottle', { main: col }, (b) => {
    hp(b, 0.1, 0.24, 0.1, 0, -0.06, 0.05, col);
    hp(b, 0.06, 0.05, 0.06, 0, 0.08, 0.05, '#f2efe6');
  });
}

export function mkTrophy(): Group {
  return held('trophy', {}, (t) => {
    hp(t, 0.22, 0.08, 0.22, 0, -0.05, 0, '#6b4a2a');
    hp(t, 0.08, 0.18, 0.08, 0, -0.18, 0, '#e6b83c');
    hp(t, 0.32, 0.3, 0.32, 0, -0.42, 0, '#f2c84a');
    hp(t, 0.08, 0.18, 0.06, 0.2, -0.42, 0, '#e6b83c');
    hp(t, 0.08, 0.18, 0.06, -0.2, -0.42, 0, '#e6b83c');
  });
}

export function mkSpatula(): Group {
  return held('spatula', {}, (s) => {
    hp(s, 0.05, 0.4, 0.05, 0, -0.15, 0, '#5a3b2a');
    hp(s, 0.18, 0.03, 0.22, 0, -0.38, 0.08, '#c9cccd');
  });
}

export function mkMegaphone(): Group {
  return held('megaphone', {}, (m) => {
    hp(m, 0.12, 0.12, 0.2, 0, -0.05, 0.1, '#e8e2d0');
    hp(m, 0.24, 0.24, 0.18, 0, -0.05, 0.27, '#e05a3a');
  });
}

export function mkCamera(): Group {
  return held('camera', {}, (c) => {
    hp(c, 0.26, 0.2, 0.18, 0, -0.06, 0.12, '#1d1d1f');
    hp(c, 0.12, 0.12, 0.16, 0, -0.06, 0.28, '#3a3a3e');
  });
}

export function mkPlate(): Group {
  return held('plate', {}, (p) => {
    hp(p, 0.42, 0.04, 0.42, 0, 0.05, 0.35, '#f6f3ea');
    hp(p, 0.22, 0.1, 0.22, 0, 0.12, 0.35, '#8a4f2a');
    hp(p, 0.24, 0.04, 0.24, 0, 0.19, 0.35, '#e8b04a');
  });
}

export function mkFlag(col: string): Group {
  return held('flag', { main: col }, (f) => {
    hp(f, 0.04, 0.7, 0.04, 0, -0.1, 0, '#e8e2d0');
    hp(f, 0.04, 0.3, 0.42, 0, -0.38, 0.22, col);
  });
}

export function mkUmbrella(col: string): Group {
  return held('umbrella', { main: col }, (u) => {
    hp(u, 0.04, 1.0, 0.04, 0, -0.45, 0, '#333333');
    hp(u, 1.3, 0.08, 1.3, 0, -0.98, 0, col);
    hp(u, 0.85, 0.12, 0.85, 0, -1.06, 0, col);
  });
}

export function mkRake(): Group {
  return held('rake', {}, (r) => {
    hp(r, 0.05, 1.3, 0.05, 0, -0.35, 0.1, '#8a6a45');
    hp(r, 0.5, 0.06, 0.08, 0, -1.0, 0.1, '#5a5f63');
  });
}

/** 抱在胸前的一捆树枝 / 一箱垃圾 */
export function mkBundle(col = '#5a4030'): Group {
  return held('bundle', { main: col }, (b) => {
    hp(b, 0.6, 0.18, 0.2, 0, -0.1, 0.32, col);
    hp(b, 0.5, 0.14, 0.2, 0.05, 0.04, 0.32, '#6a4a32');
  });
}

export function mkCap(col: string): Group {
  return held('cap', { cap: col, main: col }, (g) => {
    hp(g, 0.4, 0.12, 0.38, 0, 0.06, 0, col);
    hp(g, 0.36, 0.04, 0.2, 0, 0.01, 0.26, col);
  });
}

/* ---------------- 地上的（道具批次） ---------------- */

export function bench(vb: PropBatch, rand: Rand, x: number, z: number, len: number, ry = 0): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-len / 2 + 0.15, len / 2 - 0.15]) vb.box(x + u * c, 0, z - u * s, 0.08, 0.42, 0.4, '#3a3a36', ry);
  vb.box(x, 0.42, z, len, 0.07, 0.42, jit(rand, '#9a6b42', 0.03), ry);
}

export function table(vb: PropBatch, x: number, z: number, w: number, d: number, col = '#e9e4d6', h = 0.75): void {
  for (const [u, v] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const)
    vb.box(x + u * (w / 2 - 0.1), 0, z + v * (d / 2 - 0.1), 0.07, h, 0.07, '#5a5550');
  vb.box(x, h, z, w, 0.06, d, col);
}

export function canopy(
  vb: PropBatch,
  x: number,
  z: number,
  w: number,
  d: number,
  c1: string,
  c2: string,
  h = 2.3,
): void {
  for (const [u, v] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const)
    vb.box(x + (u * w) / 2, 0, z + (v * d) / 2, 0.08, h, 0.08, '#d8d4cc');
  const n = Math.round(w / 0.5);
  for (let i = 0; i < n; i++) vb.box(x - w / 2 + (w / n) * (i + 0.5), h, z, w / n, 0.12, d + 0.3, i % 2 ? c1 : c2);
  for (let i = 0; i < n; i++)
    vb.box(x - w / 2 + (w / n) * (i + 0.5), h - 0.22, z + d / 2 + 0.14, w / n, 0.24, 0.04, i % 2 ? c1 : c2);
}

const LEAVES = ['#5d8f3a', '#6a9a42', '#4f8032', '#78a64a'];
const LEAVES_HOT = ['#8a9a3a', '#9aa648', '#7a8a34'];
export const AUTUMN = ['#d8832e', '#e09a3a', '#c4462b', '#e5b33b'];

/** 一棵圆冠树（方块球壳）。 */
export function tree(
  vb: PropBatch,
  rand: Rand,
  x: number,
  z: number,
  s = 1,
  pal: readonly string[] = LEAVES,
  hot = false,
): void {
  const leaves = hot && pal === LEAVES ? LEAVES_HOT : pal;
  const th = 2.6 * s;
  vb.box(x, 0, z, 0.5 * s, th, 0.5 * s, jit(rand, '#5a3e2b', 0.04));
  const R = 2.0 * s;
  const cy = th + R * 0.7;
  const vs = 0.8 * s;
  for (let i = -R; i <= R; i += vs)
    for (let j = -R; j <= R; j += vs)
      for (let k = -R; k <= R; k += vs) {
        const d = Math.hypot(i, j * 1.15, k);
        if (d < R - rand() * 0.6 && d > R - 1.9)
          vb.box(x + i, cy + j, z + k, vs, vs, vs, jit(rand, pick(leaves, rand), 0.05));
      }
}

/** 光秃秃的枯树（Hollow Creek）。 */
export function bareTree(vb: PropBatch, rand: Rand, x: number, z: number, s = 1): void {
  const th = 3.4 * s;
  vb.box(x, 0, z, 0.45 * s, th, 0.45 * s, jit(rand, '#4a3a2e', 0.04));
  for (let k = 0; k < 6; k++) {
    const y = th * range(rand, 0.55, 0.95);
    const ry = range(rand, 0, 6.28);
    const tilt = range(rand, 0.55, 1.0);
    const len = range(rand, 1.2, 2.2) * s;
    vb.box(x, y, z, 0.16 * s, len, 0.16 * s, jit(rand, '#4f3f31', 0.04), ry, 0, tilt);
  }
}

/** 装满球的球筐，返回筐口的位置。 */
export function basket(vb: PropBatch, x: number, z: number): { x: number; y: number; z: number } {
  for (const [u, v] of [
    [-0.2, -0.2],
    [0.2, -0.2],
    [-0.2, 0.2],
    [0.2, 0.2],
  ] as const)
    vb.box(x + u, 0, z + v, 0.04, 0.55, 0.04, '#2c2c2c');
  vb.box(x, 0.55, z, 0.5, 0.04, 0.5, '#2c2c2c');
  vb.box(x, 0.95, z, 0.5, 0.04, 0.5, '#2c2c2c');
  vb.box(x, 0.6, z, 0.44, 0.36, 0.44, '#d7e64a');
  return { x, y: 1.0, z };
}

/** 一条地面上的线（Hollow Creek 的线断断续续）。 */
export function line(
  vb: PropBatch,
  rand: Rand,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  col: string,
  gap = 0,
  yTop = 0.026,
  w = 0.08,
): void {
  const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const len = Math.hypot(x1 - x0, z1 - z0);
  // 地上画的线是平的：侧面和顶面同色、不画顶边高光，否则 1 像素的深色侧面像一根浮在草上的白条
  const flat = (b: Box, c: string) => {
    b.style = { side: c, edge: false };
  };
  if (!gap) {
    flat(vb.box((x0 + x1) / 2, yTop - 0.01, (z0 + z1) / 2, along ? len + w : w, 0.01, along ? w : len + w, col), col);
    return;
  }
  const n = Math.max(1, Math.round(len));
  for (let i = 0; i < n; i++) {
    if (rand() < gap) continue;
    const t = (i + 0.5) / n;
    const sl = len / n;
    const c = jit(rand, col, 0.05);
    flat(vb.box(x0 + (x1 - x0) * t, yTop - 0.01, z0 + (z1 - z0) * t, along ? sl : w, 0.01, along ? w : sl, c), c);
  }
}
