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

/**
 * 台阶两侧的挡路条（PLAZA-7，clubplaza / clubdesk / clubpickle 共用）：台阶旁边是平地，台阶面比它高出 stepUp 以上的那一段侧面只靠高差挡（没有扶手）。
 * 沿路走的时候离拐点 0.3 米就转向下一个点，贴着台阶边规划的路（从台阶旁边斜着上下）会让身体一侧踩出台阶 → 高差不让走、
 * 又不像挡路的形状那样把人推开沿边滑 → 卡在台阶下半段。那一段两侧外面各放一条 0.3 米宽的挡路条，把人推回台阶上。
 * ground = 台阶两侧地面的高度。
 */
export function stairCheeks(r: Ramp, ground: number, stepUp = 0.3, w = 0.3): Rect[] {
  const alongX = r.axis === 'x';
  const [a0, a1] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
  // 台阶面高出旁边地面 > stepUp 的那一段（沿台阶方向的 [lo, hi]）
  const t = (ground + stepUp - r.from) / (r.to - r.from);
  if (!(t > 0 && t < 1)) return [];
  const cut = a0 + (a1 - a0) * t;
  const [lo, hi] = r.from > r.to ? [a0, cut] : [cut, a1];
  return alongX
    ? [
        { x0: lo, x1: hi, z0: r.z0 - w, z1: r.z0 },
        { x0: lo, x1: hi, z0: r.z1, z1: r.z1 + w },
      ]
    : [
        { x0: r.x0 - w, x1: r.x0, z0: lo, z1: hi },
        { x0: r.x1, x1: r.x1 + w, z0: lo, z1: hi },
      ];
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
  /**
   * 能站的地面高度（null = 不能走）。给了就代替 walkable + groundAt（坡道照旧优先）：
   * 大世界（clubwalk）按区域拼导航用。不给 = 原来的行为。
   */
  surface?(x: number, z: number): number | null;
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

interface Blocker {
  s: Shape;
  b: Rect;
}
const NONE: Blocker[] = [];
/** 挡路形状分桶：桶边长（米）；包围盒外扩 TILE_PAD 再分，查询半径 ≤ TILE_PAD 的只看点所在那一桶 */
const TILE = 4;
const TILE_PAD = 0.6;
const tileKey = (x: number, z: number) => (Math.floor(x / TILE) + 4096) * 8192 + (Math.floor(z / TILE) + 4096);
function tileIndex(list: readonly Blocker[]): Map<number, Blocker[]> {
  const m = new Map<number, Blocker[]>();
  for (const it of list) {
    const { b } = it;
    for (let i = Math.floor((b.x0 - TILE_PAD) / TILE); i <= Math.floor((b.x1 + TILE_PAD) / TILE); i++)
      for (let j = Math.floor((b.z0 - TILE_PAD) / TILE); j <= Math.floor((b.z1 + TILE_PAD) / TILE); j++) {
        const k = (i + 4096) * 8192 + (j + 4096);
        const a = m.get(k);
        if (a) a.push(it);
        else m.set(k, [it]);
      }
  }
  return m;
}

/** 8 邻（先四个直邻，再四个斜邻）：di, dj, 步长（格） */
const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
const DW = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
/** 格子数超过这个（只有 clubwalk 的整个世界，各场景页面都在 10 万格以下）才先在粗网格上规划 */
const HIER_CELLS = 150_000;
/** 粗网格一块几格（5 格 = 1 米） */
const BLOCK = 5;
/** 细网格搜的走廊：粗路两边各几块 */
const CORRIDOR = 2;
/** 大网格上走廊里找不到（被人堵住）以后全图搜的步数上限 */
const FALLBACK_CAP = 60_000;

/** A* 的工作区（细网格每格一份，粗网格每块一份） */
interface Work {
  g: Float64Array;
  from: Int32Array;
  seen: Uint32Array;
  /** 这次查询被人挡掉的格子（= query） */
  dyn: Uint32Array;
  query: number;
  /** 粗网格的 A*（每个块内连通片一份） */
  bg: Float64Array;
  bfrom: Int32Array;
  bseen: Uint32Array;
  bshut: Uint32Array;
  /** 细网格搜的走廊，每块一份（= query） */
  lane: Uint32Array;
}

/**
 * 粗网格（BLOCK×BLOCK 格一块）：每块里按迈步规则再分连通片（"片"），片和片之间有能直接迈的一对细格子就相连。
 * 片内一定走得通、相连的片之间一定迈得过去，所以粗网格上找到的片的序列一定能在细网格上走出来（不算会动的人）。
 */
interface Hier {
  /** 粗网格一行几块、几行 */
  bx: number;
  bz: number;
  /** 每格属于哪一片（-1 = 不能站） */
  rid: Int32Array;
  /** 每片在哪一块 */
  rblock: Int32Array;
  /** 片的邻接（CSR：片 r 的邻居 = adj[off[r] .. off[r+1]）） */
  off: Int32Array;
  adj: Int32Array;
}

/** 二叉堆（A* 的开放表）：键、值放在定长数组里，满了翻倍 */
class Heap {
  private k = new Float64Array(1024);
  private v = new Int32Array(1024);
  size = 0;
  /** 上一次 pop 出来的键 */
  key = 0;
  push(key: number, val: number) {
    if (this.size === this.k.length) {
      const k2 = new Float64Array(this.size * 2);
      const v2 = new Int32Array(this.size * 2);
      k2.set(this.k);
      v2.set(this.v);
      this.k = k2;
      this.v = v2;
    }
    const k = this.k;
    const v = this.v;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    this.key = k[0];
    const n = --this.size;
    if (n > 0) {
      const lk = k[n];
      const lv = v[n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mk = lk;
        if (l < n && k[l] < mk) {
          m = l;
          mk = k[l];
        }
        if (r < n && k[r] < mk) m = r;
        if (m === i) break;
        k[i] = k[m];
        v[i] = v[m];
        i = m;
      }
      k[i] = lk;
      v[i] = lv;
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
  /** 静态挡路 = base（setBlocked 整张换的）+ 各层（setLayer 按 key 加 / 减的） */
  private blocked: Blocker[];
  private base: Blocker[];
  private layers = new Map<string, Blocker[]>();
  /** 挡路形状按 TILE 米的格子分桶（hitsBlocked 只看点所在那一桶） */
  private tiles: Map<number, Blocker[]>;
  private ramps: Ramp[];
  private nx: number;
  private nz: number;
  /** 每格的地面高度；NaN = 不能站（含身体半径的余量） */
  private grid: Float32Array;
  /** A* 的工作区（第一次 findPath 才分配，按格子数）：stamp 标记这一次搜索碰过的格子，不用每次清零 */
  private work: Work | null = null;
  private stamp = 0;
  /** 静态网格的连通分量（0 = 不能站）：起点、终点不在一块 → 不用搜。rebuild 后作废，下次 findPath 再算 */
  private comp: Int32Array | null = null;
  /** 粗网格（只给大网格用；rebuild 后作废） */
  private hier: Hier | null = null;

  constructor(spec: NavSpec) {
    this.spec = spec;
    this.stepUp = spec.stepUp ?? 0.3;
    this.body = spec.body ?? 0.28;
    this.cell = spec.cell ?? 0.2;
    this.bounds = spec.bounds;
    this.walk = spec.walkable?.length ? spec.walkable : null;
    this.base = (spec.blocked ?? []).map((s) => ({ s, b: bbox(s) }));
    this.blocked = this.base;
    this.tiles = tileIndex(this.blocked);
    this.ramps = spec.ramps ?? [];
    this.nx = Math.max(1, Math.ceil((this.bounds.x1 - this.bounds.x0) / this.cell));
    this.nz = Math.max(1, Math.ceil((this.bounds.z1 - this.bounds.z0) / this.cell));
    this.grid = new Float32Array(this.nx * this.nz);
    this.rebuild();
  }

  /** 静态挡路的变了（门开了、车停进来了）：整张换掉 base（setLayer 加的层不动）后重建网格；不给 rect = 整张重建 */
  setBlocked(shapes: Shape[], rect?: Rect | readonly Rect[]) {
    this.base = shapes.map((s) => ({ s, b: bbox(s) }));
    this.merge();
    if (rect && 'x0' in rect) this.rebuild(rect);
    else if (rect) this.rebuildMany(rect);
    else this.rebuild();
  }

  /**
   * 一层额外的挡路形状（按 key；空表 = 去掉这一层）：场景运行中自己开关的东西（关上的场地、临时拦起来的地方），
   * 不会被 setBlocked 换表冲掉（大世界里 setBlocked 是 clubwalk 拼的整个世界的表）。
   * 不给 rect = 只重建这一层旧的和新的形状附近（外扩 1 米）。
   */
  setLayer(key: string, shapes: readonly Shape[], rect?: Rect | readonly Rect[]) {
    const old = this.layers.get(key) ?? NONE;
    const now = shapes.map((s) => ({ s, b: bbox(s) }));
    if (now.length) this.layers.set(key, now);
    else this.layers.delete(key);
    this.merge();
    const around =
      rect ?? [...old, ...now].map(({ b }) => ({ x0: b.x0 - 1, x1: b.x1 + 1, z0: b.z0 - 1, z1: b.z1 + 1 }));
    if ('x0' in around) this.rebuild(around);
    else if (around.length) this.rebuildMany(around);
  }

  /** 现在的静态挡路形状（base + 各层，只读） */
  blockedShapes(): readonly Shape[] {
    return this.blocked.map((b) => b.s);
  }

  private merge() {
    this.blocked = this.layers.size ? [...this.base, ...[...this.layers.values()].flat()] : this.base;
    this.tiles = tileIndex(this.blocked);
  }

  /**
   * 先把规划要用的连通分量（大网格连粗网格）算好。网格重建以后第一次 findPath 才算（大世界整张图 ~0.1 秒），
   * 想挪到别的时候（比如大世界建区域的那一帧）就先调这个。
   */
  prepare() {
    this.components();
    if (this.nx * this.nz > HIER_CELLS) this.hierarchy();
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
    if (this.spec.surface) return this.spec.surface(x, z);
    if (this.walk && !this.walk.some((s) => contains(s, x, z))) return null;
    return this.spec.groundAt(x, z);
  }

  /** 静态挡路的里离点最近的距离（< r 就算压上了） */
  hitsBlocked(x: number, z: number, r: number): boolean {
    const list = r <= TILE_PAD ? (this.tiles.get(tileKey(x, z)) ?? NONE) : this.blocked;
    for (const { s, b } of list) {
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
  /** 重建网格；给 rect = 只重建这个范围（世界米）里的格子（别处的能走/挡路没变时用） */
  private rebuild(rect?: Rect) {
    const { nx, nz, cell, bounds: B } = this;
    const i0 = rect ? Math.max(0, Math.floor((rect.x0 - B.x0) / cell)) : 0;
    const i1 = rect ? Math.min(nx, Math.ceil((rect.x1 - B.x0) / cell)) : nx;
    const j0 = rect ? Math.max(0, Math.floor((rect.z0 - B.z0) / cell)) : 0;
    const j1 = rect ? Math.min(nz, Math.ceil((rect.z1 - B.z0) / cell)) : nz;
    for (let j = j0; j < j1; j++)
      for (let i = i0; i < i1; i++) {
        const x = B.x0 + (i + 0.5) * cell;
        const z = B.z0 + (j + 0.5) * cell;
        const h = this.standAt(x, z);
        this.grid[j * nx + i] = h === null ? Number.NaN : h;
      }
    this.comp = null;
    this.hier = null;
  }
  /**
   * 静态网格的连通分量（0 = 不能站），按 A* 同样的迈步规则（高差 ≤ stepUp/2，斜走要两个直邻都能站）flood fill。
   * 起点、终点不在一块 → findPath 不用搜。
   */
  private components(): Int32Array {
    if (this.comp) return this.comp;
    const { nx, nz, grid } = this;
    const lim = this.stepUp * 0.5;
    const comp = new Int32Array(nx * nz);
    const q = new Int32Array(nx * nz);
    let id = 0;
    for (let k0 = 0; k0 < nx * nz; k0++) {
      if (comp[k0] || Number.isNaN(grid[k0])) continue;
      comp[k0] = ++id;
      let head = 0;
      let tail = 0;
      q[tail++] = k0;
      while (head < tail) {
        const k = q[head++];
        const i = k % nx;
        const j = (k - i) / nx;
        const h0 = grid[k];
        for (let d = 0; d < 8; d++) {
          const ii = i + DI[d];
          const jj = j + DJ[d];
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const kk = jj * nx + ii;
          const h1 = grid[kk];
          if (comp[kk] || !(Math.abs(h1 - h0) <= lim)) continue;
          if (d >= 4 && (Number.isNaN(grid[j * nx + ii]) || Number.isNaN(grid[jj * nx + i]))) continue;
          comp[kk] = id;
          q[tail++] = kk;
        }
      }
    }
    this.comp = comp;
    return comp;
  }
  /** 重建几个范围（可以重叠）里的格子，每格只算一次 */
  private rebuildMany(rects: readonly Rect[]) {
    const { nx, nz, cell, bounds: B } = this;
    const mark = new Uint8Array(nx * nz);
    let j0 = nz;
    let j1 = 0;
    for (const r of rects) {
      const a = Math.max(0, Math.floor((r.x0 - B.x0) / cell));
      const b = Math.min(nx, Math.ceil((r.x1 - B.x0) / cell));
      const c = Math.max(0, Math.floor((r.z0 - B.z0) / cell));
      const d = Math.min(nz, Math.ceil((r.z1 - B.z0) / cell));
      for (let j = c; j < d; j++) mark.fill(1, j * nx + a, j * nx + Math.max(a, b));
      j0 = Math.min(j0, c);
      j1 = Math.max(j1, d);
    }
    for (let j = j0; j < j1; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!mark[k]) continue;
        const h = this.standAt(B.x0 + (i + 0.5) * cell, B.z0 + (j + 0.5) * cell);
        this.grid[k] = h === null ? Number.NaN : h;
      }
    this.comp = null;
    this.hier = null;
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
  nearestFree(
    x: number,
    z: number,
    maxR = 3,
    dyn: Set<number> | null = null,
    ok?: (k: number) => boolean,
  ): [number, number] | null {
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
          if (ok && !ok((j0 + dj) * this.nx + i0 + di)) continue;
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

  private workspace(): Work {
    const n = this.nx * this.nz;
    if (!this.work) {
      this.work = {
        g: new Float64Array(n),
        from: new Int32Array(n),
        seen: new Uint32Array(n),
        dyn: new Uint32Array(n),
        query: 0,
        bg: new Float64Array(0),
        bfrom: new Int32Array(0),
        bseen: new Uint32Array(0),
        bshut: new Uint32Array(0),
        lane: new Uint32Array(Math.ceil(this.nx / BLOCK) * Math.ceil(this.nz / BLOCK)),
      };
    }
    return this.work;
  }

  /** 粗网格的片和邻接（rebuild 后作废，大网格第一次 findPath 再算） */
  private hierarchy(): Hier {
    if (this.hier) return this.hier;
    const { nx, nz, grid } = this;
    const lim = this.stepUp * 0.5;
    const bx = Math.ceil(nx / BLOCK);
    const bz = Math.ceil(nz / BLOCK);
    const rid = new Int32Array(nx * nz).fill(-1);
    const rblock: number[] = [];
    const q = new Int32Array(BLOCK * BLOCK);
    const step = (i: number, j: number, d: number): number => {
      const ii = i + DI[d];
      const jj = j + DJ[d];
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) return -1;
      const kk = jj * nx + ii;
      if (!(Math.abs(grid[kk] - grid[j * nx + i]) <= lim)) return -1;
      if (d >= 4 && (Number.isNaN(grid[j * nx + ii]) || Number.isNaN(grid[jj * nx + i]))) return -1;
      return kk;
    };
    // 每块里 flood fill 出片
    for (let bj = 0; bj < bz; bj++)
      for (let bi = 0; bi < bx; bi++) {
        const i0 = bi * BLOCK;
        const j0 = bj * BLOCK;
        const i1 = Math.min(nx, i0 + BLOCK);
        const j1 = Math.min(nz, j0 + BLOCK);
        for (let j = j0; j < j1; j++)
          for (let i = i0; i < i1; i++) {
            const k0 = j * nx + i;
            if (rid[k0] >= 0 || Number.isNaN(grid[k0])) continue;
            const r = rblock.length;
            rblock.push(bj * bx + bi);
            rid[k0] = r;
            let head = 0;
            let tail = 0;
            q[tail++] = k0;
            while (head < tail) {
              const k = q[head++];
              const ci = k % nx;
              const cj = (k - ci) / nx;
              for (let d = 0; d < 8; d++) {
                const kk = step(ci, cj, d);
                if (kk < 0 || rid[kk] >= 0) continue;
                const ii = kk % nx;
                const jj = (kk - ii) / nx;
                if (ii < i0 || ii >= i1 || jj < j0 || jj >= j1) continue;
                rid[kk] = r;
                q[tail++] = kk;
              }
            }
          }
      }
    // 片的邻接：块边上的细格子往块外迈
    const nb: number[][] = rblock.map(() => []);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const r = rid[j * nx + i];
        if (r < 0) continue;
        const edgeI = i % BLOCK === 0 || i % BLOCK === BLOCK - 1;
        const edgeJ = j % BLOCK === 0 || j % BLOCK === BLOCK - 1;
        if (!edgeI && !edgeJ) continue;
        for (let d = 0; d < 8; d++) {
          const kk = step(i, j, d);
          if (kk < 0) continue;
          const r2 = rid[kk];
          if (r2 < 0 || r2 === r || nb[r].includes(r2)) continue;
          nb[r].push(r2);
        }
      }
    const off = new Int32Array(rblock.length + 1);
    for (let r = 0; r < rblock.length; r++) off[r + 1] = off[r] + nb[r].length;
    const adj = new Int32Array(off[rblock.length]);
    for (let r = 0; r < rblock.length; r++) adj.set(nb[r], off[r]);
    this.hier = { bx, bz, rid, rblock: Int32Array.from(rblock), off, adj };
    return this.hier;
  }

  /**
   * 细网格 A*（从 sk 到 gk，结果在 work.from 里）：不设步数上限（连通性 findPath 查过了，搜下去一定有结果）。
   * 迈步规则同 components；dm 里这次被人挡掉的格子当不能站；lane = 只在 corridor 标出来的块里搜。
   */
  private search(sk: number, gk: number, dm: Uint32Array | null, lane: boolean, cap = Infinity): boolean {
    const W = this.work as Work;
    let n = 0;
    const { nx, nz, grid, cell } = this;
    const st = ++this.stamp;
    const q = W.query;
    const lim = this.stepUp * 0.5;
    const gi = gk % nx;
    const gj = (gk - gi) / nx;
    const free = (k: number) => !Number.isNaN(grid[k]) && (dm === null || dm[k] !== q);
    const bx = Math.ceil(nx / BLOCK);
    W.g[sk] = 0;
    W.seen[sk] = st;
    W.from[sk] = -1;
    const open = new Heap();
    open.push(0, sk);
    while (open.size) {
      const k = open.pop();
      if (k === gk) return true;
      const i = k % nx;
      const j = (k - i) / nx;
      const h0 = grid[k];
      const g0 = W.g[k];
      // 过期的项（这格后来找到了更短的、已经按更短的展开过）：跳过。这样跳过的展开本来也不会改任何格子，路和不跳一样
      const hx = Math.abs(i - gi);
      const hz = Math.abs(j - gj);
      if (open.key > g0 + (Math.max(hx, hz) + 0.4142 * Math.min(hx, hz)) * cell) continue;
      if (++n > cap) return false;
      for (let d = 0; d < 8; d++) {
        const ii = i + DI[d];
        const jj = j + DJ[d];
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        if (lane && W.lane[((jj / BLOCK) | 0) * bx + ((ii / BLOCK) | 0)] !== q) continue;
        const kk = jj * nx + ii;
        if (!free(kk) || !(Math.abs(grid[kk] - h0) <= lim)) continue;
        if (d >= 4 && (!free(j * nx + ii) || !free(jj * nx + i))) continue;
        const ng = g0 + DW[d] * cell;
        if (W.seen[kk] !== st || ng < W.g[kk]) {
          W.seen[kk] = st;
          W.g[kk] = ng;
          W.from[kk] = k;
          const dx = Math.abs(ii - gi);
          const dz = Math.abs(jj - gj);
          open.push(ng + (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * cell, kk);
        }
      }
    }
    return false;
  }

  /**
   * 粗网格上的路（片和片之间 A*，代价和启发按块中心的距离）：找到了就把路上的块和两边 CORRIDOR 块标进 work.lane（= work.query）。
   * 片的序列一定能在细网格上走出来，所以走廊里的细网格搜索（不算人）一定找得到。
   */
  private corridor(sk: number, gk: number): boolean {
    const H = this.hierarchy();
    const W = this.work as Work;
    const { bx, bz, rid, rblock, off, adj } = H;
    const nr = rblock.length;
    if (W.bg.length !== nr) {
      W.bg = new Float64Array(nr);
      W.bfrom = new Int32Array(nr);
      W.bseen = new Uint32Array(nr);
      W.bshut = new Uint32Array(nr);
    }
    const q = W.query;
    const st = ++this.stamp;
    const s = rid[sk];
    const g = rid[gk];
    const gb = rblock[g];
    const gbi = gb % bx;
    const gbj = (gb - gbi) / bx;
    W.bg[s] = 0;
    W.bseen[s] = st;
    W.bfrom[s] = -1;
    const open = new Heap();
    open.push(0, s);
    let found = false;
    while (open.size) {
      const r = open.pop();
      if (r === g) {
        found = true;
        break;
      }
      if (W.bshut[r] === st) continue;
      W.bshut[r] = st;
      const b = rblock[r];
      const bi = b % bx;
      const bj = (b - bi) / bx;
      for (let e = off[r]; e < off[r + 1]; e++) {
        const r2 = adj[e];
        const b2 = rblock[r2];
        const ni = b2 % bx;
        const nj = (b2 - ni) / bx;
        const ng = W.bg[r] + (ni !== bi && nj !== bj ? Math.SQRT2 : ni !== bi || nj !== bj ? 1 : 0.5);
        if (W.bseen[r2] !== st || ng < W.bg[r2]) {
          W.bseen[r2] = st;
          W.bg[r2] = ng;
          W.bfrom[r2] = r;
          const dx = Math.abs(ni - gbi);
          const dz = Math.abs(nj - gbj);
          // 启发略放大一点：同样长的粗路里先走离终点近的（粗路只用来圈走廊，不求最短）
          open.push(ng + (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * 1.001, r2);
        }
      }
    }
    if (!found) return false;
    const R = CORRIDOR;
    for (let r = g; r >= 0; r = W.bfrom[r]) {
      const b = rblock[r];
      const bi = b % bx;
      const bj = (b - bi) / bx;
      for (let j = Math.max(0, bj - R); j <= Math.min(bz - 1, bj + R); j++)
        for (let i = Math.max(0, bi - R); i <= Math.min(bx - 1, bi + R); i++) W.lane[j * bx + i] = q;
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
    let goal = Number.isNaN(this.gh(this.ci(bx), this.cj(bz), dyn)) ? this.nearestFree(bx, bz, 3, dyn) : [bx, bz];
    if (!goal) return null;
    const start = Number.isNaN(this.gh(this.ci(ax), this.cj(az), dyn)) ? this.nearestFree(ax, az, 1.5, dyn) : [ax, az];
    if (!start) return null;
    if (this.lineClear(ax, az, goal[0], goal[1], dyn)) return [[goal[0], goal[1]]];
    const { nx, nz } = this;
    const sk = this.cj(start[1]) * nx + this.ci(start[0]);
    let gk = this.cj(goal[1]) * nx + this.ci(goal[0]);
    // 连通分量（静态网格；会动的圆只会让路更少）：终点那格和起点不在一块 → 换成终点附近（3 米内）和起点连着的格子，没有就走不到
    const comp = this.components();
    const C = comp[sk];
    if (!C) return null;
    if (comp[gk] !== C) {
      goal = this.nearestFree(bx, bz, 3, dyn, (k) => comp[k] === C);
      if (!goal) return null;
      gk = this.cj(goal[1]) * nx + this.ci(goal[0]);
      if (this.lineClear(ax, az, goal[0], goal[1], dyn)) return [[goal[0], goal[1]]];
    }
    const W = this.workspace();
    W.query++;
    for (const k of dyn) W.dyn[k] = W.query;
    const dm = dyn.size ? W.dyn : null;
    // 大网格（clubwalk 的整个世界）：先在粗网格（BLOCK 格一块）上规划，细网格只在粗路两边 CORRIDOR 块的走廊里搜；
    // 走廊里找不到（只会是被人堵住：不算人的话走廊里一定有路）再全图搜，最多 FALLBACK_CAP 步（人把唯一的门堵死时不用搜遍
    // 整个世界，~0.1 秒 → ~0.04 秒，和原来的 6 万步上限一样；搜不到就当走不到，同原来）。小网格（各场景页面）一直全图搜、不设上限，路和原来一样
    let found = false;
    const big = nx * nz > HIER_CELLS;
    if (big && this.corridor(sk, gk)) found = this.search(sk, gk, dm, true);
    if (!found) found = this.search(sk, gk, dm, false, big ? FALLBACK_CAP : Infinity);
    if (!found) return null;
    const cells: [number, number][] = [];
    for (let k = gk; k >= 0 && k !== sk; k = W.from[k]) {
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
