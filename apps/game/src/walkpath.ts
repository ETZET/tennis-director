import { pointAlong, type Site } from '@td/iso';
import { clamp, type XZ } from '@td/shared';
import type { Walk, World } from '@td/sim';

/**
 * 走在路上的人此刻在画面上的哪儿、朝哪儿（只是画面：模拟只记从哪儿到哪儿、几点出发）。
 * 纯函数，node 里能测。
 */

/** 导航图上一段路要走几分钟 */
const edgeMinutes = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

/** 这一段路在画面上的折线 */
function segLine(site: Site, a: string, b: string): XZ[] {
  // 两个方向总用同一条折线（按名字排序取，再按需要倒过来）：最短路有并列时 routeLine(a,b) 和 routeLine(b,a)
  // 可能不是互为反向，半路掉头的人就会跳一下
  const flip = a > b;
  const [p, q] = flip ? [b, a] : [a, b];
  const line = site.routeLine(p, q) ?? [site.stands[p] ?? { x: 0, z: 0 }, site.stands[q] ?? { x: 0, z: 0 }];
  return flip ? [...line].reverse() : line;
}

/** 此刻在哪一段、走了这一段的几成 */
function locate(w: World, walk: Walk, time: number): { a: string; b: string; u: number } | null {
  let prev = walk.from;
  let t0 = walk.start;
  for (const n of walk.route) {
    const m = edgeMinutes(w, prev, n);
    if (time <= t0 + m || n === walk.route[walk.route.length - 1])
      return { a: prev, b: n, u: clamp((time - t0) / Math.max(1, m), 0, 1) };
    prev = n;
    t0 += m;
  }
  return null;
}

/** 走在路上的人此刻在画面上的哪儿：按导航图每段的分钟数，在画面路径上插值 */
export function walkPoint(site: Site, w: World, walk: Walk, time: number): XZ {
  const at = locate(w, walk, time);
  if (!at) return site.stands[walk.to] ?? { x: 0, z: 0 };
  return pointAlong(segLine(site, at.a, at.b), at.u);
}

/**
 * 走在路上的人此刻该面朝哪儿（yaw：面朝 (sin, cos)）：按画面折线上此处的走向，
 * 不按每帧追插值点剩下的零头（零头可能朝后，人会走着走着回头；QA P1-1）。走到头了返回 null。
 */
export function walkHeading(site: Site, w: World, walk: Walk, time: number): number | null {
  const at = locate(w, walk, time);
  if (!at) return null;
  const pts = segLine(site, at.a, at.b);
  // 折线上此处往前一小段（到头了就往回看一小段）
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot((pts[i] as XZ).x - (pts[i - 1] as XZ).x, (pts[i] as XZ).z - (pts[i - 1] as XZ).z);
  if (total < 1e-6) return null;
  const du = Math.min(0.5, 0.4 / total);
  const u0 = Math.min(at.u, 1 - du);
  const p = pointAlong(pts, u0);
  const q = pointAlong(pts, u0 + du);
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  return Math.hypot(dx, dz) < 1e-6 ? null : Math.atan2(dx, dz);
}
