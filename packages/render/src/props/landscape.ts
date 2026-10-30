import { pick } from '@td/shared';
import { type BuildContext, jit, sr } from '../world/build-context';

/**
 * 干砌石挡土墙，错缝砌筑，带苔藓。
 * axis='z' 表示墙沿 x 方向延伸、位于 z=k；collapse=[a,b] 是坍塌的一段。
 */
export function stoneWall(
  ctx: BuildContext,
  axis: 'x' | 'z',
  k: number,
  a: number,
  b: number,
  y0: number,
  y1: number,
  collapse?: readonly [number, number],
): void {
  const { solid } = ctx;
  for (let y = y0; y < y1 - 0.01; y += 0.4) {
    const off = Math.round((y - y0) / 0.4) % 2 ? 0.6 : 0;
    for (let t = a - off; t < b; t += 1.2) {
      const m = t + 0.6;
      if (collapse && m > collapse[0] && m < collapse[1] && y > y0 + ctx.rand() * 0.5) continue;
      const lo = Math.max(t, a);
      const hi = Math.min(t + 1.2, b);
      if (hi - lo < 0.2) continue;
      const col = ctx.rand() < 0.15 ? jit(ctx, '#5d6b3e', 0.04) : jit(ctx, '#8b867b', 0.07);
      if (axis === 'z') solid.box((lo + hi) / 2, y, k, hi - lo - 0.05, 0.38, 0.3, col);
      else solid.box(k, y, (lo + hi) / 2, 0.3, 0.38, hi - lo - 0.05, col);
    }
  }
}

export const LEAF_LITTER = ['#7b5a34', '#8a6a3a', '#6d5a2f'];
export const AUTUMN = ['#7b5a34', '#8a6a3a', '#6d5a2f', '#8c7a3e'];

/** 光秃秃的落叶树，脚下一圈落叶。 */
export function bareTree(ctx: BuildContext, x: number, y: number, z: number, s: number): void {
  const { solid, flat } = ctx;
  const th = sr(ctx, 3, 4.5) * s;
  solid.box(x, y, z, 0.5 * s, th, 0.5 * s, jit(ctx, '#4a3a2e', 0.04));
  for (let k = 0; k < 6; k++) {
    const yy = y + th * sr(ctx, 0.55, 0.95);
    const ry = sr(ctx, 0, 6.28);
    const tilt = sr(ctx, 0.55, 1.0);
    const len = sr(ctx, 1.3, 2.4) * s;
    solid.box(x, yy, z, 0.18 * s, len, 0.18 * s, jit(ctx, '#4f3f31', 0.04), ry, 0, tilt);
  }
  for (let n = 0; n < 12; n++) {
    const a = sr(ctx, 0, 6.28);
    const r = sr(ctx, 0.3, 3);
    flat.box(
      x + Math.cos(a) * r,
      y + 0.004,
      z + Math.sin(a) * r,
      0.22,
      0.02,
      0.22,
      pick(LEAF_LITTER, ctx.rand),
      sr(ctx, 0, 3),
    );
  }
}

/** 稀疏树冠的树：一个空心的体素球壳。 */
export function sparseTree(
  ctx: BuildContext,
  x: number,
  y: number,
  z: number,
  s: number,
  pal: readonly string[] = AUTUMN,
  dens = 0.38,
): void {
  const { solid } = ctx;
  const th = sr(ctx, 2.4, 3.2) * s;
  solid.box(x, y, z, 0.55 * s, th, 0.55 * s, jit(ctx, '#4a3a2e', 0.04));
  const R = sr(ctx, 1.9, 2.4) * s;
  const cy = y + th + R * 0.7;
  const vs = 0.85 * s;
  for (let i = -R; i <= R; i += vs)
    for (let j = -R; j <= R; j += vs)
      for (let k = -R; k <= R; k += vs) {
        const d = Math.hypot(i, j * 1.15, k);
        if (d < R - ctx.rand() * 0.7 && d > R - 2.1 && ctx.rand() < dens)
          solid.box(x + i, cy + j, z + k, vs, vs, vs, jit(ctx, pick(pal, ctx.rand), 0.05));
      }
}
