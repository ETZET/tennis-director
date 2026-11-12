// 大世界拼导航：挡路的形状按区域的范围留下或裁开。
// - 区域自己的形状：和区域范围（rects）有重叠就整个留（不按中心：一道跨到邻居那边的长墙，中心落在邻居那儿也要留）；
// - 底图的形状（围网、看台、东墙、南墙…）：建好的区域范围里那段裁掉（区域自己的导航管），范围外那段留着（底图照样画着）。
import type { Rect, Shape } from '../clubsite/play';

export function shapeBox(s: Shape): Rect {
  if ('x0' in s) return s;
  if ('poly' in s) {
    const xs = s.poly.map((p) => p[0]);
    const zs = s.poly.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }
  if ('a' in s)
    return {
      x0: Math.min(s.a[0], s.b[0]) - s.r,
      x1: Math.max(s.a[0], s.b[0]) + s.r,
      z0: Math.min(s.a[1], s.b[1]) - s.r,
      z1: Math.max(s.a[1], s.b[1]) + s.r,
    };
  return { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r };
}

/** 两个矩形重叠（两个方向都超过 eps 米；只贴着边不算） */
export const overlaps = (a: Rect, b: Rect, eps = 0.05) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > eps && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > eps;

const inside = (rects: readonly Rect[], x: number, z: number) =>
  rects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);

/** 区域自己的挡路形状留不留：中心在范围里，或者包围盒和范围重叠 */
export function keepOwn(s: Shape, rects: readonly Rect[]): boolean {
  const b = shapeBox(s);
  return inside(rects, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) || rects.some((r) => overlaps(b, r));
}

/** 线段 a–b 落在矩形里的那段（参数 t ∈ [0, 1]）；不相交 = null */
function segIn(ax: number, az: number, bx: number, bz: number, r: Rect): [number, number] | null {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, ax - r.x0],
    [dx, r.x1 - ax],
    [-dz, az - r.z0],
    [dz, r.z1 - az],
  ]) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 < t1 ? [t0, t1] : null;
}

/** 矩形 a 减去矩形 b（最多四块） */
function subRect(a: Rect, b: Rect): Rect[] {
  if (!overlaps(a, b, 0)) return [a];
  const out: Rect[] = [];
  if (b.x0 > a.x0) out.push({ x0: a.x0, x1: b.x0, z0: a.z0, z1: a.z1 });
  if (b.x1 < a.x1) out.push({ x0: b.x1, x1: a.x1, z0: a.z0, z1: a.z1 });
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  if (b.z0 > a.z0) out.push({ x0, x1, z0: a.z0, z1: b.z0 });
  if (b.z1 < a.z1) out.push({ x0, x1, z0: b.z1, z1: a.z1 });
  return out;
}

/**
 * 形状在这些矩形外面的部分。线段（胶囊）按线段裁（裁口的半圆头会伸进矩形 r 米）、矩形按矩形减；
 * 圆和多边形不裁：中心在矩形里就整个不要（同原来的做法）。
 */
export function outside(s: Shape, rects: readonly Rect[]): Shape[] {
  const MIN = 0.05;
  if ('a' in s) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const cut: [number, number][] = [];
    for (const r of rects) {
      const iv = segIn(s.a[0], s.a[1], s.b[0], s.b[1], r);
      if (iv) cut.push(iv);
    }
    if (!cut.length) return [s];
    cut.sort((p, q) => p[0] - q[0]);
    const out: Shape[] = [];
    let t = 0;
    const emit = (u: number, v: number) => {
      if ((v - u) * L < MIN) return;
      const at = (k: number): [number, number] => [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k];
      out.push({ a: at(u), b: at(v), r: s.r });
    };
    for (const [u, v] of cut) {
      if (u > t) emit(t, u);
      t = Math.max(t, v);
    }
    if (t < 1) emit(t, 1);
    return out;
  }
  if ('x0' in s) {
    let parts: Rect[] = [s];
    for (const r of rects) parts = parts.flatMap((p) => subRect(p, r));
    return parts.filter((p) => p.x1 - p.x0 > MIN && p.z1 - p.z0 > MIN);
  }
  const b = shapeBox(s);
  return inside(rects, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2) ? [] : [s];
}

/** 矩形的并集外扩 m 米（一组矩形各自外扩） */
export const grow = (rs: readonly Rect[], m: number): Rect[] =>
  rs.map((r) => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m }));
