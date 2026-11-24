// 路上的人怎么走：
// - 路 = 世界导航（play.nav.findPath）规划的折线；去有门的地点先走到门（场地的门、会所的门），再从门走到站位（不穿围网、柜台）。
// - 引擎的 travel 给了 t0..t1：画面按"这一刻走到全程的几分之几"摆人，到的那一刻正好是 t1（引擎说几点到就几点到，动画不决定数）。
// - 到了以后站位和路的终点差一点（引擎到了才分站位）、排队往前挪：按真实时间走过去（settle），不瞬移。
// - 一伙人一起走：跟着同一条路，并排（左右各让 0.35 米）；旁边站不住就排成一列跟在后面。
// - 寻路有预算（每帧最多 PATH_BUDGET 次），同一段路缓存起来（地点之间来来回回都是那几段）；导航重建了（建了新区域）缓存作废。
import type { NavMap } from '../../clubsite/play';
import type { Place, PlaceId } from '../../clubsite/sim/types';
import type { PlaceSpots, Spot } from './types';

export type P2 = [number, number];

export interface Route {
  pts: P2[];
  /** 每个点从起点算的路程（米） */
  cum: number[];
  len: number;
}

export function makeRoute(pts: P2[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] ?? 0 };
}

/** 路上第 s 米在哪、朝哪（out.dx/dz 单位向量） */
export function along(r: Route, s: number, out: { x: number; z: number; dx: number; dz: number }) {
  const { pts, cum } = r;
  if (pts.length === 1 || s <= 0) {
    out.x = pts[0][0];
    out.z = pts[0][1];
    if (pts.length > 1) setDir(out, pts[0], pts[1]);
    return out;
  }
  if (s >= r.len) {
    const n = pts.length - 1;
    out.x = pts[n][0];
    out.z = pts[n][1];
    setDir(out, pts[n - 1], pts[n]);
    return out;
  }
  // 二分找段
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const k = (s - cum[lo]) / seg;
  out.x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * k;
  out.z = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * k;
  setDir(out, pts[lo], pts[hi]);
  return out;
}
function setDir(out: { dx: number; dz: number }, a: P2, b: P2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz);
  if (l > 1e-6) {
    out.dx = dx / l;
    out.dz = dz / l;
  }
}

/** 每帧最多规划几段路、最多花多少毫秒（一段长路 A* 要 1–3 毫秒；至少规划一段） */
export const PATH_BUDGET = 6;
export const PATH_MS = 1.6;
/** 缓存最多存几段 */
const CACHE_MAX = 4000;

const key = (ax: number, az: number, bx: number, bz: number) =>
  `${Math.round(ax * 4)},${Math.round(az * 4)}>${Math.round(bx * 4)},${Math.round(bz * 4)}`;

/** 规划路段：缓存 + 每帧预算。get 拿到 = 折线；undefined = 排上队了（下一帧再问）；直线走不了又规划失败 = 直接连线 */
export class Planner {
  private cache = new Map<string, P2[]>();
  private want = new Map<string, { ax: number; az: number; bx: number; bz: number; pri: number }>();
  /** 统计（调试、性能） */
  stats = { calls: 0, ms: 0, hits: 0, fails: 0 };

  constructor(private nav: () => NavMap) {}

  /** 导航重建了（建了新区域、会所换层）：缓存作废 */
  clear() {
    this.cache.clear();
  }

  get(ax: number, az: number, bx: number, bz: number, pri: number): P2[] | undefined {
    const k = key(ax, az, bx, bz);
    const c = this.cache.get(k);
    if (c) {
      this.stats.hits++;
      return c;
    }
    // 很近、直线通：不用规划
    if (Math.hypot(bx - ax, bz - az) < 0.05) return [[bx, bz]];
    const w = this.want.get(k);
    if (w) w.pri = Math.min(w.pri, pri);
    else this.want.set(k, { ax, az, bx, bz, pri });
    return undefined;
  }

  /** 每帧调：按优先级（离镜头近的先）规划 budget 段 */
  run(budget = PATH_BUDGET, ms = PATH_MS) {
    if (!this.want.size) return;
    const list = [...this.want.entries()].sort((a, b) => a[1].pri - b[1].pri).slice(0, budget);
    const nav = this.nav();
    const start = performance.now();
    for (const [k, w] of list) {
      if (performance.now() - start > ms) break;
      this.want.delete(k);
      const t0 = performance.now();
      let p: P2[] | null = null;
      if (nav.lineClear(w.ax, w.az, w.bx, w.bz)) p = [[w.bx, w.bz]];
      else p = nav.findPath(w.ax, w.az, w.bx, w.bz);
      this.stats.ms += performance.now() - t0;
      this.stats.calls++;
      if (!p?.length) {
        this.stats.fails++;
        p = [[w.bx, w.bz]];
      }
      // 终点站不住（长椅、看台的座在挡路的形状里）：寻路停在最近能站的点，最后一小段直接走过去（坐下）
      const e = p[p.length - 1];
      if (Math.hypot(e[0] - w.bx, e[1] - w.bz) > 0.05) p = [...p, [w.bx, w.bz]];
      if (this.cache.size > CACHE_MAX) this.cache.clear();
      this.cache.set(k, p);
    }
  }

  pending() {
    return this.want.size;
  }
  /** 不要了（跳时刻、关观察）：排着的都扔掉 */
  drop() {
    this.want.clear();
  }
}

// ── 站位 ──────────────────────────────────────────────────────────────────────────

export interface Anchor {
  x: number;
  z: number;
  y?: number;
  yaw: number;
  pose?: string;
}

/** 地点的第 i 个站位（站位表里没有 → 地点的估算坐标，记一笔缺口） */
export function spotOf(place: Place | undefined, ps: PlaceSpots | undefined, i: number): Anchor {
  const s = ps?.spots[((i % (ps.spots.length || 1)) + (ps.spots.length || 1)) % (ps.spots.length || 1)];
  if (s) return s;
  return { x: place?.x ?? 0, z: place?.z ?? 0, yaw: 0 };
}

/** 排队的第 k 个：queue[k]，超出的沿最后两点的方向往外延（间距 1.1 米）；没给队列 = 站位 0 身后一串 */
export function queueOf(place: Place | undefined, ps: PlaceSpots | undefined, k: number): Anchor {
  const q = ps?.queue;
  if (q?.length) {
    if (k < q.length) return withFace(q, k, ps);
    const a = q[q.length - 1];
    const b = q.length > 1 ? q[q.length - 2] : null;
    let dx = 0;
    let dz = 1;
    if (b) {
      const l = Math.hypot(a.x - b.x, a.z - b.z) || 1;
      dx = (a.x - b.x) / l;
      dz = (a.z - b.z) / l;
    } else {
      dx = -Math.sin(a.yaw);
      dz = -Math.cos(a.yaw);
    }
    const n = k - (q.length - 1);
    return { x: a.x + dx * 1.1 * n, z: a.z + dz * 1.1 * n, y: a.y, yaw: Math.atan2(-dx, -dz) };
  }
  const s0 = spotOf(place, ps, 0);
  const bx = -Math.sin(s0.yaw);
  const bz = -Math.cos(s0.yaw);
  return { x: s0.x + bx * 1.1 * (k + 1), z: s0.z + bz * 1.1 * (k + 1), y: s0.y, yaw: s0.yaw };
}
/** 队里的人朝队头（前一个点）；队头朝站位 */
function withFace(q: readonly Spot[], k: number, ps: PlaceSpots | undefined): Anchor {
  const a = q[k];
  const prev = k > 0 ? q[k - 1] : ps?.spots[0];
  if (!prev) return a;
  const dx = prev.x - a.x;
  const dz = prev.z - a.z;
  if (Math.hypot(dx, dz) < 0.05) return a;
  return { ...a, yaw: Math.atan2(dx, dz) };
}

/** 进出这个地点走哪儿（门；没有门 = 站位本身） */
export function doorOf(ps: PlaceSpots | undefined): { x: number; z: number } | null {
  return ps?.door ?? null;
}

export type SpotLookup = (id: PlaceId) => PlaceSpots | undefined;
