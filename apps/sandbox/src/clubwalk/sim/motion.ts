// 路上的人怎么走：
// - 路 = 世界导航（play.nav.findPath）规划的折线；去有门的地点先走到门（场地的门、会所的门），再从门走到站位（不穿围网、柜台）。
// - 引擎的 travel 给了 t0..t1：画面按"这一刻走到全程的几分之几"摆人，到的那一刻正好是 t1（引擎说几点到就几点到，动画不决定数）。
// - 到了以后站位和路的终点差一点（引擎到了才分站位）、排队往前挪：按真实时间走过去（settle），不瞬移。
// - 一伙人一起走：跟着同一条路，并排（左右各让 0.35 米）；旁边站不住就排成一列跟在后面。
// - 寻路有预算（每帧最多 PATH_BUDGET 次），同一段路缓存起来（地点之间来来回回都是那几段）；导航重建了（建了新区域）缓存作废。
// - 搜不到的路不直线走（穿墙）：两头挪到旁边能站的点再搜；还不行这段路不画（人藏起来，到了再出来），过几秒再试。
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
/** 起点 / 终点站不住又搜不到：在周围这么远以内找能站的点再搜一次（米） */
const SNAP_R = [1.2, 3] as const;
/** 第一次搜就花了这么久（毫秒）：多半是真走不到，不再挪两头重搜（一次 A* 搜不到能花 20 多毫秒） */
const SNAP_SKIP_MS = 3;
/** 这么短（米）的一段当场查直线通不通（很便宜），通就不排队 */
const SHORT = 8;
/** 搜不到的路过多久（真实秒）再试（导航可能刚好在建新区域；navChanged 也会清掉） */
const RETRY_S = 4;

/** 搜不到路：画面上这个人这段路不画（藏起来，到了再出来），不直线穿墙 */
export const NO_PATH = Object.freeze([]) as unknown as P2[];

/** 寻路只用到导航的这几样（测试里可以给假的） */
export interface PathNav {
  lineClear(ax: number, az: number, bx: number, bz: number): boolean;
  findPath(ax: number, az: number, bx: number, bz: number): [number, number][] | null;
  standAt(x: number, z: number): number | null;
}

const key = (ax: number, az: number, bx: number, bz: number) =>
  `${Math.round(ax * 4)},${Math.round(az * 4)}>${Math.round(bx * 4)},${Math.round(bz * 4)}`;

/** (x, z) 周围 r 米的一圈里最近的能站的点（按半径从小到大、每圈 12 个方向） */
function nearStand(nav: PathNav, x: number, z: number, rMax: number): P2 | null {
  for (let r = 0.4; r <= rMax + 1e-6; r += 0.4)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (nav.standAt(px, pz) !== null) return [px, pz];
    }
  return null;
}

/**
 * 规划路段：缓存 + 每帧预算。get 拿到 = 折线；undefined = 排上队了（下一帧再问）；NO_PATH = 搜不到（过一会儿再试）。
 * 搜不到时先把起点、终点挪到旁边能站的地方再搜（长椅、看台的座、柜台后面），还不行才算搜不到：画面不画这段路，绝不直线穿墙。
 */
export class Planner {
  private cache = new Map<string, P2[]>();
  /** 搜不到的：什么时候（真实秒）再试 */
  private failed = new Map<string, number>();
  /** 排着的：seen = 最后一次有人要它的时刻（真实秒）；没人再要（人已经到了、走出画面）就扔掉，不白规划 */
  private want = new Map<string, { ax: number; az: number; bx: number; bz: number; pri: number; seen: number }>();
  /** 真实时间（秒）：run 时传进来 */
  private now = 0;
  /** 统计（调试、性能）：calls 规划了几段、ms 花了多久、hits 缓存命中、snapped 挪了起点终点才搜到、fails 搜不到（不画） */
  stats = { calls: 0, ms: 0, hits: 0, fails: 0, snapped: 0 };
  /** 最近搜不到的几段（调试：起点 > 终点） */
  lastFails: string[] = [];

  constructor(private nav: () => PathNav) {}

  /** 导航重建了（建了新区域、会所换层）：缓存、搜不到的记录都作废 */
  clear() {
    this.cache.clear();
    this.failed.clear();
  }

  get(ax: number, az: number, bx: number, bz: number, pri: number): P2[] | undefined {
    const k = key(ax, az, bx, bz);
    const c = this.cache.get(k);
    if (c) {
      this.stats.hits++;
      return c;
    }
    // 很近：不用规划
    const d = Math.hypot(bx - ax, bz - az);
    if (d < 0.05) return [[bx, bz]];
    const w = this.want.get(k);
    if (w) {
      w.pri = w.seen < this.now ? pri : Math.min(w.pri, pri);
      w.seen = this.now;
      return undefined;
    }
    const f = this.failed.get(k);
    if (f !== undefined) {
      if (this.now < f) return NO_PATH;
      this.failed.delete(k);
    }
    // 短的一段直线通：当场给（站位到门、门到站位、地点里挪一挪），不占每帧的预算
    if (d < SHORT && this.nav().lineClear(ax, az, bx, bz)) {
      const p: P2[] = [[bx, bz]];
      this.put(k, p);
      return p;
    }
    this.want.set(k, { ax, az, bx, bz, pri, seen: this.now });
    return undefined;
  }

  private put(k: string, p: P2[]) {
    if (this.cache.size > CACHE_MAX) this.cache.clear();
    this.cache.set(k, p);
  }

  /** 一段路：直线通就直线，不通就 A*；还不行把两头挪到旁边能站的地方再搜 */
  private solve(nav: PathNav, w: { ax: number; az: number; bx: number; bz: number }): P2[] | null {
    if (nav.lineClear(w.ax, w.az, w.bx, w.bz)) return [[w.bx, w.bz]];
    const t0 = performance.now();
    const p = nav.findPath(w.ax, w.az, w.bx, w.bz);
    if (p?.length) return p;
    if (performance.now() - t0 > SNAP_SKIP_MS) return null;
    for (const r of SNAP_R) {
      const a = nav.standAt(w.ax, w.az) !== null ? ([w.ax, w.az] as P2) : nearStand(nav, w.ax, w.az, r);
      const b = nav.standAt(w.bx, w.bz) !== null ? ([w.bx, w.bz] as P2) : nearStand(nav, w.bx, w.bz, r);
      if (!a || !b) continue;
      // 挪过的那一小段（≤ r 米）只在两头：从座位起身、走到座位边坐下
      if (!nav.lineClear(w.ax, w.az, a[0], a[1]) && Math.hypot(a[0] - w.ax, a[1] - w.az) > 1.2) continue;
      const q = nav.lineClear(a[0], a[1], b[0], b[1]) ? [b] : nav.findPath(a[0], a[1], b[0], b[1]);
      if (!q?.length) continue;
      this.stats.snapped++;
      return [a, ...q];
    }
    return null;
  }

  /** 每帧调：按优先级（离镜头近的先）规划 budget 段；now = 真实时间（秒） */
  run(now: number, budget = PATH_BUDGET, ms = PATH_MS) {
    // 上一帧（含）以来没人要的扔掉
    for (const [k, w] of this.want) if (w.seen < this.now - 1e-6) this.want.delete(k);
    this.now = now;
    if (!this.want.size) return;
    const list = [...this.want.entries()].sort((a, b) => a[1].pri - b[1].pri).slice(0, budget);
    const nav = this.nav();
    const start = performance.now();
    for (const [k, w] of list) {
      if (performance.now() - start > ms) break;
      this.want.delete(k);
      const t0 = performance.now();
      let p = this.solve(nav, w);
      this.stats.ms += performance.now() - t0;
      this.stats.calls++;
      if (!p) {
        this.stats.fails++;
        this.lastFails.push(`${w.ax.toFixed(1)},${w.az.toFixed(1)} > ${w.bx.toFixed(1)},${w.bz.toFixed(1)}`);
        if (this.lastFails.length > 12) this.lastFails.shift();
        this.failed.set(k, now + RETRY_S);
        continue;
      }
      // 终点站不住（长椅、看台的座在挡路的形状里）：寻路停在最近能站的点，最后一小段直接走过去（坐下）
      const e = p[p.length - 1];
      if (Math.hypot(e[0] - w.bx, e[1] - w.bz) > 0.05) p = [...p, [w.bx, w.bz]];
      this.put(k, p);
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

/** 地点的第 i 个站位（i ≥ 站位个数 = 窗口边等取餐的第 i − cap 个；站位表里没有 → 地点的估算坐标，记一笔缺口） */
export function spotOf(place: Place | undefined, ps: PlaceSpots | undefined, i: number): Anchor {
  const n = ps?.spots.length ?? 0;
  if (ps?.pickup?.length && i >= n) return ps.pickup[(i - n) % ps.pickup.length];
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
