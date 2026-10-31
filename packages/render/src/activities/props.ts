import { pick, type Rand, range } from '@td/shared';
import * as THREE from 'three';
import { part } from '../people/parts';
import { jitter, type VoxelBatcher } from '../voxel/batcher';

/**
 * 活动用的道具：拿在手里的小东西（水瓶、奖杯、铲子……）是独立的小组，
 * 摆在地上的（长凳、桌子、帐篷、树）进活动自己的体素批次。
 */

/* ---------------- 手里拿的 ---------------- */

export function mkBottle(col = '#3aa0d8'): THREE.Group {
  const b = new THREE.Group();
  part(b, 0.1, 0.24, 0.1, 0, -0.06, 0.05, col);
  part(b, 0.06, 0.05, 0.06, 0, 0.08, 0.05, '#f2efe6');
  return b;
}

export function mkTrophy(): THREE.Group {
  const t = new THREE.Group();
  part(t, 0.22, 0.08, 0.22, 0, -0.05, 0, '#6b4a2a');
  part(t, 0.08, 0.18, 0.08, 0, -0.18, 0, '#e6b83c');
  part(t, 0.32, 0.3, 0.32, 0, -0.42, 0, '#f2c84a');
  part(t, 0.08, 0.18, 0.06, 0.2, -0.42, 0, '#e6b83c');
  part(t, 0.08, 0.18, 0.06, -0.2, -0.42, 0, '#e6b83c');
  return t;
}

export function mkSpatula(): THREE.Group {
  const s = new THREE.Group();
  part(s, 0.05, 0.4, 0.05, 0, -0.15, 0, '#5a3b2a');
  part(s, 0.18, 0.03, 0.22, 0, -0.38, 0.08, '#c9cccd');
  return s;
}

export function mkMegaphone(): THREE.Group {
  const m = new THREE.Group();
  part(m, 0.12, 0.12, 0.2, 0, -0.05, 0.1, '#e8e2d0');
  part(m, 0.24, 0.24, 0.18, 0, -0.05, 0.27, '#e05a3a');
  return m;
}

export function mkCamera(): THREE.Group {
  const c = new THREE.Group();
  part(c, 0.26, 0.2, 0.18, 0, -0.06, 0.12, '#1d1d1f');
  part(c, 0.12, 0.12, 0.16, 0, -0.06, 0.28, '#3a3a3e');
  return c;
}

export function mkPlate(): THREE.Group {
  const p = new THREE.Group();
  part(p, 0.42, 0.04, 0.42, 0, 0.05, 0.35, '#f6f3ea');
  part(p, 0.22, 0.1, 0.22, 0, 0.12, 0.35, '#8a4f2a');
  part(p, 0.24, 0.04, 0.24, 0, 0.19, 0.35, '#e8b04a');
  return p;
}

export function mkFlag(col: string): THREE.Group {
  const f = new THREE.Group();
  part(f, 0.04, 0.7, 0.04, 0, -0.1, 0, '#e8e2d0');
  part(f, 0.04, 0.3, 0.42, 0, -0.38, 0.22, col);
  return f;
}

export function mkUmbrella(col: string): THREE.Group {
  const u = new THREE.Group();
  part(u, 0.04, 1.0, 0.04, 0, -0.45, 0, '#333');
  part(u, 1.3, 0.08, 1.3, 0, -0.98, 0, col);
  part(u, 0.85, 0.12, 0.85, 0, -1.06, 0, col);
  return u;
}

export function mkRake(): THREE.Group {
  const r = new THREE.Group();
  part(r, 0.05, 1.3, 0.05, 0, -0.35, 0.1, '#8a6a45');
  part(r, 0.5, 0.06, 0.08, 0, -1.0, 0.1, '#5a5f63');
  return r;
}

/** 抱在胸前的一捆树枝 / 一箱垃圾 */
export function mkBundle(col = '#5a4030'): THREE.Group {
  const b = new THREE.Group();
  part(b, 0.6, 0.18, 0.2, 0, -0.1, 0.32, col);
  part(b, 0.5, 0.14, 0.2, 0.05, 0.04, 0.32, '#6a4a32');
  return b;
}

export function mkCap(col: string): THREE.Group {
  const g = new THREE.Group();
  part(g, 0.4, 0.12, 0.38, 0, 0.06, 0, col);
  part(g, 0.36, 0.04, 0.2, 0, 0.01, 0.26, col);
  return g;
}

/* ---------------- 地上的（体素批次） ---------------- */

export const jit = (rand: Rand, hex: string, amt = 0.045): THREE.Color => jitter(hex, amt, rand);

export function bench(vb: VoxelBatcher, rand: Rand, x: number, z: number, len: number, ry = 0): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  for (const u of [-len / 2 + 0.15, len / 2 - 0.15]) vb.box(x + u * c, 0, z - u * s, 0.08, 0.42, 0.4, '#3a3a36', ry);
  vb.box(x, 0.42, z, len, 0.07, 0.42, jit(rand, '#9a6b42', 0.03), ry);
}

export function table(vb: VoxelBatcher, x: number, z: number, w: number, d: number, col = '#e9e4d6', h = 0.75): void {
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
  vb: VoxelBatcher,
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

/** 一棵圆冠树（体素球壳）。 */
export function tree(
  vb: VoxelBatcher,
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
export function bareTree(vb: VoxelBatcher, rand: Rand, x: number, z: number, s = 1): void {
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
export function basket(vb: VoxelBatcher, x: number, z: number): { x: number; y: number; z: number } {
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
  vb: VoxelBatcher,
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
  if (!gap) {
    vb.box((x0 + x1) / 2, yTop - 0.01, (z0 + z1) / 2, along ? len + w : w, 0.01, along ? w : len + w, col);
    return;
  }
  const n = Math.max(1, Math.round(len));
  for (let i = 0; i < n; i++) {
    if (rand() < gap) continue;
    const t = (i + 0.5) / n;
    const sl = len / n;
    vb.box(
      x0 + (x1 - x0) * t,
      yTop - 0.01,
      z0 + (z1 - z0) * t,
      along ? sl : w,
      0.01,
      along ? w : sl,
      jit(rand, col, 0.05),
    );
  }
}
