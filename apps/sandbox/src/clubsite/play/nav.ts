// 总监的导航：能走的地方（形状的并集）− 挡路的（静态形状 + 会动的圆）+ 高度（场景的 groundAt，坡道/台阶覆盖）。
// - 连续移动：每步先推出挡路的形状和圆，再查"脚下 + 身体四周"都能站、高差 ≤ stepUp（台阶、路缘能迈，崖壁/挡土墙不行）；
//   不行就只走 x 或只走 z 的分量（沿边滑）。
// - 点地面走：静态的网格（cell 米一格，建一次）上 A*（8 邻，斜走要两个直邻都通），再拉直（视线能通就跳过中间的点）。
//   会动的圆（人）在规划那一刻按当时的位置挡格子；走的时候被挡住 → control 重新规划一次。
// 只用 xz 平面（y 朝上）；坐标都是世界米。
export type V2 = readonly [number, number];
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface Circle {
  x: number;
  z: number;
  r: number;
}
export interface Poly {
  poly: readonly V2[];
}
/** 胶囊：线段 a–b 加半径 r（球网、围网、长椅的一条边） */
export interface Seg {
  a: V2;
  b: V2;
  r: number;
}
export type Shape = Rect | Circle | Poly | Seg;

/**
 * 坡道 / 台阶：矩形里高度按 axis 方向线性插值（from 在 z0 / x0 那头，to 在 z1 / x1 那头），覆盖 groundAt。
 * 台阶就当坡道走（人一级一级的起伏不做）。场景的 Stairs（x0, x1, z0, steps, run, from, to）用 rampFromStairs 换。
 */
export interface Ramp extends Rect {
  from: number;
  to: number;
  axis?: 'z' | 'x';
}
export function rampFromStairs(s: {
  x0: number;
  x1: number;
  z0: number;
  steps: number;
  run: number;
  from: number;
  to: number;
}): Ramp {
  return { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z0 + s.steps * s.run, from: s.from, to: s.to, axis: 'z' };
}

export interface NavSpec {
  /** 场景的地面高度（terrain.groundAt） */
  groundAt(x: number, z: number): number;
  /** 导航网格的范围（也是默认的能走范围） */
  bounds: Rect;
  /** 能走的地方（并集）；不给 = 整个 bounds */
  walkable?: Shape[];
  /** 静态挡路的（家具、树、柜台、围场…） */
  blocked?: Shape[];
  /** 坡道 / 台阶（高度覆盖 groundAt；坡道本身算能走） */
  ramps?: Ramp[];
  /** 能直接迈上去的高差（米，默认 0.3） */
  stepUp?: number;
  /** 身体半径（米，默认 0.28） */
  body?: number;
  /** 网格边长（米，默认 0.2） */
  cell?: number;
}

const isRect = (s: Shape): s is Rect => 'x0' in s;
const isCircle = (s: Shape): s is Circle => 'r' in s && 'x' in s;
const isPoly = (s: Shape): s is Poly => 'poly' in s;

export function inPoly(pts: readonly V2[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 点到线段最近点 */
function closestOnSeg(ax: number, az: number, bx: number, bz: number, x: number, z: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz;
  const t = L > 1e-9 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
  return [ax + dx * t, az + dz * t];
}

/**
 * 形状到点的"带符号距离"和推出方向：d < 0 = 在里面。返回 [d, nx, nz]（n = 从形状指向点的单位方向）。
 */
function sdf(s: Shape, x: number, z: number): [number, number, number] {
  if (isCircle(s)) {
    const dx = x - s.x;
    const dz = z - s.z;
    const d = Math.hypot(dx, dz);
    return d < 1e-6 ? [-s.r, 1, 0] : [d - s.r, dx / d, dz / d];
  }
  if (isRect(s)) {
    const cx = Math.min(Math.max(x, s.x0), s.x1);
    const cz = Math.min(Math.max(z, s.z0), s.z1);
    if (cx !== x || cz !== z) {
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.hypot(dx, dz);
      return [d, dx / d, dz / d];
    }
    // 里面：离哪条边近就往哪边推
    const l = x - s.x0;
    const r = s.x1 - x;
    const t = z - s.z0;
    const b = s.z1 - z;
    const m = Math.min(l, r, t, b);
    if (m === l) return [-l, -1, 0];
    if (m === r) return [-r, 1, 0];
    if (m === t) return [-t, 0, -1];
    return [-b, 0, 1];
  }
  if (isPoly(s)) {
    const p = s.poly;
    let best = Infinity;
    let bx = x;
    let bz = z;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [qx, qz] = closestOnSeg(p[j][0], p[j][1], p[i][0], p[i][1], x, z);
      const d = Math.hypot(x - qx, z - qz);
      if (d < best) {
        best = d;
        bx = qx;
        bz = qz;
      }
    }
    const inside = inPoly(p, x, z);
    const dx = x - bx;
    const dz = z - bz;
    const d = Math.max(best, 1e-6);
    return inside ? [-best, -dx / d, -dz / d] : [best, dx / d, dz / d];
  }
  const [qx, qz] = closestOnSeg(s.a[0], s.a[1], s.b[0], s.b[1], x, z);
  const dx = x - qx;
  const dz = z - qz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    // 正好压在线段上：沿线段的法线推
    const ex = s.b[0] - s.a[0];
    const ez = s.b[1] - s.a[1];
    const e = Math.hypot(ex, ez) || 1;
    return [-s.r, -ez / e, ex / e];
  }
  return [d - s.r, dx / d, dz / d];
}

function contains(s: Shape, x: number, z: number): boolean {
  if (isRect(s)) return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  if (isPoly(s)) return inPoly(s.poly, x, z);
  return sdf(s, x, z)[0] <= 0;
}

/** 形状的包围盒（粗筛） */
function bbox(s: Shape): Rect {
  if (isRect(s)) return s;
  if (isCircle(s)) return { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r };
  if (isPoly(s)) {
    const xs = s.poly.map((p) => p[0]);
    const zs = s.poly.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  }
  return {
    x0: Math.min(s.a[0], s.b[0]) - s.r,
    x1: Math.max(s.a[0], s.b[0]) + s.r,
    z0: Math.min(s.a[1], s.b[1]) - s.r,
    z1: Math.max(s.a[1], s.b[1]) + s.r,
  };
}

/** 二叉堆（A* 的开放表） */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop() as number;
    const lv = v.pop() as number;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavMap {
  readonly spec: NavSpec;
  readonly stepUp: number;
  readonly body: number;
  readonly cell: number;
  readonly bounds: Rect;
  private walk: Shape[] | null;
  private blocked: { s: Shape; b: Rect }[];
  private ramps: Ramp[];
  private nx: number;
  private nz: number;
  /** 每格的地面高度；NaN = 不能站（含身体半径的余量） */
  private grid: Float32Array;

  constructor(spec: NavSpec) {
    this.spec = spec;
    this.stepUp = spec.stepUp ?? 0.3;
    this.body = spec.body ?? 0.28;
    this.cell = spec.cell ?? 0.2;
    this.bounds = spec.bounds;
    this.walk = spec.walkable?.length ? spec.walkable : null;
    this.blocked = (spec.blocked ?? []).map((s) => ({ s, b: bbox(s) }));
    this.ramps = spec.ramps ?? [];
    this.nx = Math.max(1, Math.ceil((this.bounds.x1 - this.bounds.x0) / this.cell));
    this.nz = Math.max(1, Math.ceil((this.bounds.z1 - this.bounds.z0) / this.cell));
    this.grid = new Float32Array(this.nx * this.nz);
    this.rebuild();
  }

  /** 静态挡路的变了（门开了、车停进来了）：加/换形状后重建网格 */
  setBlocked(shapes: Shape[]) {
    this.blocked = shapes.map((s) => ({ s, b: bbox(s) }));
    this.rebuild();
  }

  /** 地面高度（不能站 = null）：坡道 → 能走的并集里的 groundAt。不管挡路的东西 */
  height(x: number, z: number): number | null {
    const B = this.bounds;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
    for (const r of this.ramps) {
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
        const k = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
        return r.from + (r.to - r.from) * Math.min(1, Math.max(0, k));
      }
    }
    if (this.walk && !this.walk.some((s) => contains(s, x, z))) return null;
    return this.spec.groundAt(x, z);
  }

  /** 静态挡路的里离点最近的距离（< r 就算压上了） */
  hitsBlocked(x: number, z: number, r: number): boolean {
    for (const { s, b } of this.blocked) {
      if (x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
      if (sdf(s, x, z)[0] < r) return true;
    }
    return false;
  }

  /** 站在 (x, z) 时，身体四周（body·0.9 的四个点）是不是都能站、和脚下高差 ≤ stepUp；返回脚下高度或 null */
  clearAt(x: number, z: number): number | null {
    const h = this.height(x, z);
    if (h === null) return null;
    const o = this.body * 0.9;
    for (const [dx, dz] of [
      [o, 0],
      [-o, 0],
      [0, o],
      [0, -o],
    ]) {
      const g = this.height(x + dx, z + dz);
      if (g === null || Math.abs(g - h) > this.stepUp) return null;
    }
    return h;
  }

  /** 能站（含挡路的）：返回高度或 null */
  standAt(x: number, z: number): number | null {
    const h = this.clearAt(x, z);
    if (h === null || this.hitsBlocked(x, z, this.body)) return null;
    return h;
  }

  /** 把点推出静态挡路的形状和给的圆（就地改 p），迭代两遍 */
  pushOut(p: { x: number; z: number }, circles: readonly Circle[] = []) {
    const r = this.body;
    for (let it = 0; it < 2; it++) {
      for (const { s, b } of this.blocked) {
        if (p.x < b.x0 - r || p.x > b.x1 + r || p.z < b.z0 - r || p.z > b.z1 + r) continue;
        const [d, nx, nz] = sdf(s, p.x, p.z);
        if (d < r) {
          p.x += nx * (r - d + 1e-4);
          p.z += nz * (r - d + 1e-4);
        }
      }
      for (const c of circles) {
        const [d, nx, nz] = sdf(c, p.x, p.z);
        if (d < r) {
          p.x += nx * (r - d + 1e-4);
          p.z += nz * (r - d + 1e-4);
        }
      }
    }
  }

  // ── 网格 ──
  private rebuild() {
    const { nx, nz, cell, bounds: B } = this;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = B.x0 + (i + 0.5) * cell;
        const z = B.z0 + (j + 0.5) * cell;
        const h = this.standAt(x, z);
        this.grid[j * nx + i] = h === null ? Number.NaN : h;
      }
  }
  private ci(x: number) {
    return Math.floor((x - this.bounds.x0) / this.cell);
  }
  private cj(z: number) {
    return Math.floor((z - this.bounds.z0) / this.cell);
  }
  private cx(i: number) {
    return this.bounds.x0 + (i + 0.5) * this.cell;
  }
  private cz(j: number) {
    return this.bounds.z0 + (j + 0.5) * this.cell;
  }
  private gh(i: number, j: number, dyn: Set<number> | null): number {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return Number.NaN;
    const k = j * this.nx + i;
    if (dyn?.has(k)) return Number.NaN;
    return this.grid[k];
  }

  /** 网格上离 (x, z) 最近的能站的格子中心（maxR 米以内；没有 = null） */
  nearestFree(x: number, z: number, maxR = 3, dyn: Set<number> | null = null): [number, number] | null {
    const i0 = this.ci(x);
    const j0 = this.cj(z);
    const R = Math.ceil(maxR / this.cell);
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let r = 0; r <= R; r++) {
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (Number.isNaN(this.gh(i0 + di, j0 + dj, dyn))) continue;
          const px = this.cx(i0 + di);
          const pz = this.cz(j0 + dj);
          const d = Math.hypot(px - x, pz - z);
          if (d < bd) {
            bd = d;
            best = [px, pz];
          }
        }
      // 这一圈找到了就够了（再外一圈不会更近多少）
      if (best && r * this.cell > bd) break;
    }
    return best;
  }

  /** 会动的圆按身体半径挡掉的格子 */
  private dynCells(circles: readonly Circle[], skip: (c: Circle) => boolean): Set<number> {
    const s = new Set<number>();
    for (const c of circles) {
      if (skip(c)) continue;
      const R = c.r + this.body;
      for (let j = this.cj(c.z - R); j <= this.cj(c.z + R); j++)
        for (let i = this.ci(c.x - R); i <= this.ci(c.x + R); i++) {
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          if (Math.hypot(this.cx(i) - c.x, this.cz(j) - c.z) < R) s.add(j * this.nx + i);
        }
    }
    return s;
  }

  /** 两点之间直着走得通（网格上每半格采一次样：能站、相邻采样高差 ≤ stepUp） */
  lineClear(ax: number, az: number, bx: number, bz: number, dyn: Set<number> | null = null): boolean {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / (this.cell * 0.5)));
    let prev = Number.NaN;
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n;
      const z = az + ((bz - az) * s) / n;
      const h = this.gh(this.ci(x), this.cj(z), dyn);
      if (Number.isNaN(h)) return false;
      if (!Number.isNaN(prev) && Math.abs(h - prev) > this.stepUp) return false;
      prev = h;
    }
    return true;
  }

  /**
   * 从 a 走到 b 的路（拉直后的拐点，不含起点，末点 = b 或 b 附近最近的能站点）；走不到 = null。
   * circles：会动的圆（规划这一刻的位置）；离起点 0.5 米、离终点 0.2 米以内的圆不算（自己脚下的、要走过去找的那个人）。
   */
  findPath(ax: number, az: number, bx: number, bz: number, circles: readonly Circle[] = []): [number, number][] | null {
    const dyn = this.dynCells(
      circles,
      (c) => Math.hypot(c.x - ax, c.z - az) < c.r + this.body + 0.2 || Math.hypot(c.x - bx, c.z - bz) < c.r + 0.2,
    );
    const goal = Number.isNaN(this.gh(this.ci(bx), this.cj(bz), dyn)) ? this.nearestFree(bx, bz, 3, dyn) : [bx, bz];
    if (!goal) return null;
    const start = Number.isNaN(this.gh(this.ci(ax), this.cj(az), dyn)) ? this.nearestFree(ax, az, 1.5, dyn) : [ax, az];
    if (!start) return null;
    if (this.lineClear(ax, az, goal[0], goal[1], dyn)) return [[goal[0], goal[1]]];
    const { nx } = this;
    const si = this.ci(start[0]);
    const sj = this.cj(start[1]);
    const gi = this.ci(goal[0]);
    const gj = this.cj(goal[1]);
    const sk = sj * nx + si;
    const gk = gj * nx + gi;
    const g = new Map<number, number>();
    const from = new Map<number, number>();
    const open = new Heap();
    g.set(sk, 0);
    open.push(0, sk);
    const H = (i: number, j: number) => {
      const dx = Math.abs(i - gi);
      const dz = Math.abs(j - gj);
      return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * this.cell;
    };
    const N8: [number, number, number][] = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, Math.SQRT2],
      [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2],
      [-1, -1, Math.SQRT2],
    ];
    let found = false;
    let it = 0;
    while (open.size && it++ < 60000) {
      const k = open.pop();
      if (k === gk) {
        found = true;
        break;
      }
      const i = k % nx;
      const j = (k - i) / nx;
      const h0 = this.gh(i, j, dyn);
      const g0 = g.get(k) as number;
      for (const [di, dj, w] of N8) {
        const ii = i + di;
        const jj = j + dj;
        const h1 = this.gh(ii, jj, dyn);
        if (Number.isNaN(h1) || Math.abs(h1 - h0) > this.stepUp * 0.5) continue;
        if (di && dj && (Number.isNaN(this.gh(i + di, j, dyn)) || Number.isNaN(this.gh(i, j + dj, dyn)))) continue;
        const kk = jj * nx + ii;
        const ng = g0 + w * this.cell;
        if (ng < (g.get(kk) ?? Infinity)) {
          g.set(kk, ng);
          from.set(kk, k);
          open.push(ng + H(ii, jj), kk);
        }
      }
    }
    if (!found) return null;
    const cells: [number, number][] = [];
    for (let k: number | undefined = gk; k !== undefined && k !== sk; k = from.get(k)) {
      const i = k % nx;
      cells.push([this.cx(i), this.cz((k - i) / nx)]);
    }
    cells.reverse();
    cells[cells.length - 1] = [goal[0], goal[1]];
    // 拉直：从当前点出发，跳到最远的、直线走得通的点
    const out: [number, number][] = [];
    let cur: [number, number] = [ax, az];
    let idx = 0;
    while (idx < cells.length) {
      let far = idx;
      for (let m = cells.length - 1; m > idx; m--) {
        if (this.lineClear(cur[0], cur[1], cells[m][0], cells[m][1], dyn)) {
          far = m;
          break;
        }
      }
      cur = cells[far];
      out.push(cur);
      idx = far + 1;
    }
    return out;
  }

  /** 调试：网格大小、能站的格子数 */
  stats() {
    let free = 0;
    for (const h of this.grid) if (!Number.isNaN(h)) free++;
    return { nx: this.nx, nz: this.nz, free };
  }
}
