// hard-court 的状态（纯数据，不碰 three）：一片硬地场的"低分辨率状态网格"—— 积沙深度 + 水。
// 坐标全是**本地米**：原点 = 场地中心，+x 朝东（长边，网在 x 0），+z 朝南（朝镜头）。世界坐标的换算在 hard-court.ts。
//
// 网格（每格 0.09 米 = 1 设计纹素；33 × 16.6 米 → 367 × 185 格，RGBA8 ≈ 270 KB）。格子再粗（0.18）的话
// 0.4 米宽的扁水洼只有 4～5 格高，双线性插值切出来的边是一圈 4 纹素的台阶（八角形），读成马赛克：
//   R 积沙（0 干净 · > 0.12 吹薄的一层 · > 0.5 积沙）· G 水（0 干 · > 0.16 潮 · > 0.5 水洼）· B、A 留着（0）
// shader 线性过滤取，再按阈值切：低分辨率的状态在屏幕上是光滑、硬边的形状，边按纹素取整（同 clay-court）。
// 积沙内部可以 > 1（吹叶机往前推会堆起来），打包时截到 1。
//
// 风积：只在"敞开"的边（会员场南边，没有围网）补沙。每格有一个"自然积沙"的深度 eq（舌头形：沿边每 1～4 米一条，
// 长 0.4～2.8 米），drift() 让沙按距离边的远近慢慢长回 eq（靠边的先长），永远不比 eq 多 —— 吹干净的地方过一阵又积回来，
// 但速度远小于吹的速度（lessons「组装经验」8）。

/** 状态网格的格子（米）：1 设计纹素 */
export const CELL = 0.09;

/** 阈值（shader 同一组数） */
export const T_SAND = 0.5;
export const T_THIN = 0.12;
export const T_WET = 0.5;
export const T_DAMP = 0.16;

export type V2 = [number, number];
/** 边：北 n（−z）、南 s（+z）、西 w（−x）、东 e（+x） */
export type Edge = 'n' | 's' | 'w' | 'e';

/** 一条线：c = 常数坐标（x 或 z），a0..a1 = 沿线的范围；kind 'x' = 竖的（x 常数，沿 z 走），'z' = 横的 */
export interface LineDef {
  id: string;
  kind: 'x' | 'z';
  c: number;
  a0: number;
  a1: number;
}

/** 标准场地尺寸（米）：底线到底线、双打宽、单打宽、发球线离网 */
export interface CourtDims {
  L: number;
  DW: number;
  SW: number;
  SVC: number;
}

/** 9 条线（不画底线中点的小标记：0.1 米，1× 下不到 1 纹素宽的一截）。id 同 clay-court */
export function courtLines(d: CourtDims): LineDef[] {
  const { L, DW, SW, SVC } = d;
  return [
    { id: 'baseW', kind: 'x', c: -L / 2, a0: -DW / 2, a1: DW / 2 },
    { id: 'baseE', kind: 'x', c: L / 2, a0: -DW / 2, a1: DW / 2 },
    { id: 'svcW', kind: 'x', c: -SVC, a0: -SW / 2, a1: SW / 2 },
    { id: 'svcE', kind: 'x', c: SVC, a0: -SW / 2, a1: SW / 2 },
    { id: 'sideN', kind: 'z', c: -DW / 2, a0: -L / 2, a1: L / 2 },
    { id: 'sideS', kind: 'z', c: DW / 2, a0: -L / 2, a1: L / 2 },
    { id: 'singleN', kind: 'z', c: -SW / 2, a0: -L / 2, a1: L / 2 },
    { id: 'singleS', kind: 'z', c: SW / 2, a0: -L / 2, a1: L / 2 },
    { id: 'center', kind: 'z', c: 0, a0: -SVC, a1: SVC },
  ];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** 确定性的格子噪声（不用 Math.random）：整数格哈希 + 平滑插值 */
function hash2(i: number, j: number, s: number): number {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number, s = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, s);
  const b = hash2(i + 1, j, s);
  const c = hash2(i, j + 1, s);
  const d = hash2(i + 1, j + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function insidePoly(x: number, z: number, poly: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(x: number, z: number, poly: V2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = clamp01(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1));
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

/** 一片场的状态。所有操作只改数组、记"脏"，上传纹理由 hard-court.ts 每帧最多做一次 */
export class HardState {
  readonly w: number;
  readonly d: number;
  readonly hw: number;
  readonly hd: number;
  readonly nx: number;
  readonly nz: number;
  readonly cx: number;
  readonly cz: number;
  readonly lines: LineDef[];
  /** 内场（青蓝）的半长、半宽：外面是外场绿（水洼在那边换 surroundWet，刮过去的水变小） */
  readonly blue: { hx: number; hz: number };
  /** 敞开的边（风从这些边补沙） */
  readonly open: Edge[];
  sand: Float32Array;
  water: Float32Array;
  /** 自然积沙（风积的上限，舌头形）；只在敞开的边附近 > 0 */
  eq: Float32Array;
  /** eq > 0 的格子和它们离边的远近系数（drift 只扫这些） */
  private eqIdx: Int32Array = new Int32Array(0);
  private eqK: Float32Array = new Float32Array(0);
  private eqEdge: Uint8Array = new Uint8Array(0);
  /** 干得快慢（每格固定的 0.6..1.4） */
  private dryK: Float32Array;
  /** blow / squeegee 的增量缓冲 */
  private tmp: Float32Array;
  private touched: number[] = [];
  dirty = true;

  constructor(w: number, d: number, dims: CourtDims, blue: { hx: number; hz: number }, open: Edge[] = []) {
    this.w = w;
    this.d = d;
    this.hw = w / 2;
    this.hd = d / 2;
    this.nx = Math.ceil(w / CELL);
    this.nz = Math.ceil(d / CELL);
    this.cx = w / this.nx;
    this.cz = d / this.nz;
    this.blue = blue;
    this.open = open;
    const n = this.nx * this.nz;
    this.sand = new Float32Array(n);
    this.water = new Float32Array(n);
    this.eq = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.dryK = new Float32Array(n);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        this.dryK[j * this.nx + i] = 0.6 + 0.8 * vnoise(x * 0.9 + 3.1, z * 0.9 + 7.7, 5);
      }
    this.lines = courtLines(dims);
    this.naturalDrift();
  }

  /** 格子中心（本地米） */
  center(i: number, j: number): V2 {
    return [-this.hw + (i + 0.5) * this.cx, -this.hd + (j + 0.5) * this.cz];
  }

  /** (x, z) 落在哪一格（出界 → −1） */
  cellAt(x: number, z: number): number {
    const i = Math.floor((x + this.hw) / this.cx);
    const j = Math.floor((z + this.hd) / this.cz);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** 在内场（青蓝）里吗 */
  inBlue(x: number, z: number): boolean {
    return Math.abs(x) <= this.blue.hx && Math.abs(z) <= this.blue.hz;
  }

  /** 遍历 [x0,x1]×[z0,z1]（本地米）里的格子：fn(下标, 格心 x, 格心 z) */
  forCells(x0: number, z0: number, x1: number, z1: number, fn: (k: number, x: number, z: number) => void) {
    const i0 = Math.max(0, Math.floor((x0 + this.hw) / this.cx));
    const i1 = Math.min(this.nx - 1, Math.floor((x1 + this.hw) / this.cx));
    const j0 = Math.max(0, Math.floor((z0 + this.hd) / this.cz));
    const j1 = Math.min(this.nz - 1, Math.floor((z1 + this.hd) / this.cz));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        fn(j * this.nx + i, -this.hw + (i + 0.5) * this.cx, -this.hd + (j + 0.5) * this.cz);
  }

  /** 双线性取一个通道（本地米） */
  sample(arr: Float32Array, x: number, z: number): number {
    const fx = Math.min(this.nx - 1.001, Math.max(0, (x + this.hw) / this.cx - 0.5));
    const fz = Math.min(this.nz - 1.001, Math.max(0, (z + this.hd) / this.cz - 0.5));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const k = j * this.nx + i;
    return (
      arr[k] * (1 - u) * (1 - v) +
      arr[k + 1] * u * (1 - v) +
      arr[k + this.nx] * (1 - u) * v +
      arr[k + this.nx + 1] * u * v
    );
  }

  /** 离某条敞开的边多远（米；不是敞开的边 → ∞） */
  private edgeDist(e: Edge, x: number, z: number): number {
    if (e === 's') return this.hd - z;
    if (e === 'n') return z + this.hd;
    if (e === 'e') return this.hw - x;
    return x + this.hw;
  }

  /** 自然积沙：每条敞开的边上一排舌头（沿边的低频噪声定长短，0.4～2.8 米；有的地方没有） */
  private naturalDrift() {
    this.eq.fill(0);
    const idx: number[] = [];
    const ks: number[] = [];
    const es: number[] = [];
    this.open.forEach((e, ei) => {
      const along = (x: number, z: number) => (e === 's' || e === 'n' ? x : z);
      this.forCells(-this.hw, -this.hd, this.hw, this.hd, (k, x, z) => {
        const d = this.edgeDist(e, x, z);
        if (d > 3.2) return;
        const a = along(x, z);
        const n = 0.6 * vnoise(a * 0.33 + ei * 9.1, 0.5, 41) + 0.4 * vnoise(a * 0.9 + 3.3, 1.5, 43);
        const len = 2.8 * sstep(0.3, 0.72, n);
        if (len < 0.35) return;
        // 舌头：靠边最厚，往里到 len 收成弯的尖（边按噪声抖 ±0.25 米）
        const dj = d + (vnoise(a * 1.3, d * 1.1, 47) - 0.5) * 0.5;
        const depth = sstep(len, len - 0.7, dj) * (0.7 + 0.3 * sstep(len, 0, dj));
        if (depth <= 0.01) return;
        if (depth > this.eq[k]) {
          if (this.eq[k] === 0) {
            idx.push(k);
            ks.push(Math.exp(-d / 1.1));
            es.push(ei);
          }
          this.eq[k] = depth;
        }
      });
    });
    this.eqIdx = Int32Array.from(idx);
    this.eqK = Float32Array.from(ks);
    this.eqEdge = Uint8Array.from(es);
  }

  /** 把一块多边形算进自然积沙（预设用：手摆的舌头也是"风会补回来"的形状） */
  eqPoly(poly: V2[], depth = 0.9, edge = 0.5) {
    this.polyFill(this.eq, poly, depth, edge, false);
    // 重建 drift 的格子表（加进来的格子按最近的敞开边算远近）
    const idx: number[] = [];
    const ks: number[] = [];
    const es: number[] = [];
    for (let k = 0; k < this.eq.length; k++) {
      if (this.eq[k] <= 0.01) continue;
      const i = k % this.nx;
      const j = Math.floor(k / this.nx);
      const [x, z] = this.center(i, j);
      let best = Number.POSITIVE_INFINITY;
      let be = 0;
      this.open.forEach((e, ei) => {
        const d = this.edgeDist(e, x, z);
        if (d < best) {
          best = d;
          be = ei;
        }
      });
      idx.push(k);
      ks.push(Math.exp(-best / 1.1));
      es.push(be);
    }
    this.eqIdx = Int32Array.from(idx);
    this.eqK = Float32Array.from(ks);
    this.eqEdge = Uint8Array.from(es);
  }

  // ── 查询 ─────────────────────────────────────────
  sandAt(x: number, z: number): { depth: number; state: 'clean' | 'thin' | 'drift' } {
    const depth = this.sample(this.sand, x, z);
    return { depth, state: depth > T_SAND ? 'drift' : depth > T_THIN ? 'thin' : 'clean' };
  }

  waterAt(x: number, z: number): { wet: number; state: 'dry' | 'damp' | 'puddle' } {
    const wet = this.sample(this.water, x, z);
    return { wet, state: wet > T_WET ? 'puddle' : wet > T_DAMP ? 'damp' : 'dry' };
  }

  /** 按 B 米的块找"某种东西最多"的一块（块心本地坐标 + 块里超过阈值的平均量）；一块都没有 → null */
  private most(arr: Float32Array, th: number, B: number): { x: number; z: number; v: number } | null {
    let best: { x: number; z: number; v: number } | null = null;
    let bestS = 0;
    for (let z = -this.hd; z < this.hd; z += B)
      for (let x = -this.hw; x < this.hw; x += B) {
        let s = 0;
        let n = 0;
        this.forCells(x, z, x + B, z + B, (k) => {
          if (arr[k] > th) s += arr[k];
          n++;
        });
        if (s > bestS) {
          bestS = s;
          best = { x: x + B / 2, z: z + B / 2, v: n ? s / n : 0 };
        }
      }
    return best;
  }

  /** 最大的一团水洼（0.9 米块） */
  wettest() {
    return this.most(this.water, T_WET, 0.9);
  }

  /** 积沙最厚的一块（1.2 米块，含吹薄的） */
  sandiest() {
    return this.most(this.sand, T_THIN, 1.2);
  }

  /** 面积占比：积沙 / 吹薄 / 水洼 / 潮；沙的总量（深度 × 面积，米²·深度） */
  stats() {
    const n = this.nx * this.nz;
    let drift = 0;
    let thin = 0;
    let puddle = 0;
    let damp = 0;
    let vol = 0;
    for (let k = 0; k < n; k++) {
      const s = this.sand[k];
      vol += s;
      if (s > T_SAND) drift++;
      else if (s > T_THIN) thin++;
      const w = this.water[k];
      if (w > T_WET) puddle++;
      else if (w > T_DAMP) damp++;
    }
    return {
      drift: drift / n,
      thin: thin / n,
      puddle: puddle / n,
      damp: damp / n,
      sandVolume: vol * this.cx * this.cz,
    };
  }

  // ── 沙 ─────────────────────────────────────────
  /**
   * 吹叶机：喷口在 (x, z)，朝 (dx, dz)，够得着 r 米，锥的半角 30°。锥里每格的沙按 amount（0..1，离喷口近、在正中线上的满额）
   * 往前推 0.3～0.8 米（近的推得远）；推出网格就没了。返回这一下推出场外的沙（格深度之和 × 格面积，米²·深度）。
   * 每帧调一次的话 amount ≈ dt × 3。
   */
  blow(x: number, z: number, dx: number, dz: number, r = 1.8, amount = 0.05): number {
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const cos0 = Math.cos((30 * Math.PI) / 180);
    let out = 0;
    this.forCells(x - r, z - r, x + r, z + r, (k, cx, cz) => {
      const s = this.sand[k];
      if (s <= 0.002) return;
      const ex = cx - x;
      const ez = cz - z;
      const d = Math.hypot(ex, ez);
      if (d > r || d < 0.02) return;
      const ca = (ex * ux + ez * uz) / d;
      if (ca < cos0) return;
      // 锥的尽头也还有三成劲（不然沙全堆在够得着的那一圈，堆成一道梁、永远吹不出去）
      const f = Math.min(1, amount * (1 - 0.7 * (d / r)) * sstep(cos0, 0.985, ca) * 1.6);
      const mv = s * f;
      if (mv < 1e-5) return;
      const push = 0.3 + 0.5 * (1 - d / r);
      const t = this.cellAt(cx + ux * push, cz + uz * push);
      this.add(k, -mv);
      if (t < 0) out += mv;
      else this.add(t, mv);
    });
    this.apply(this.sand, 3);
    return out * this.cx * this.cz;
  }

  /**
   * 风积：dt 秒、风 (wx, wz)（本地方向，长度 = 风力，1 = 平常的风）。只有风从敞开的边往里吹的时候补沙：
   * 每格往自然积沙 eq 长，靠边的快（离边 1.1 米慢一半多），rate = 每秒补上差额的比例（默认 1/300：靠边五分钟补回六成）。
   */
  drift(dt: number, wx = 0, wz = -1, rate = 1 / 300) {
    const inward: Record<Edge, V2> = { s: [0, -1], n: [0, 1], e: [-1, 0], w: [1, 0] };
    const pow = this.open.map((e) => Math.max(0, wx * inward[e][0] + wz * inward[e][1]));
    if (!pow.some((p) => p > 0)) return;
    let changed = false;
    for (let m = 0; m < this.eqIdx.length; m++) {
      const k = this.eqIdx[m];
      const gap = this.eq[k] - this.sand[k];
      if (gap <= 0) continue;
      const g = gap * Math.min(1, rate * dt * pow[this.eqEdge[m]] * this.eqK[m] * 2.2);
      if (g <= 0) continue;
      const o = this.sand[k];
      this.sand[k] = o + g;
      if (!changed && Math.round(Math.min(1, o + g) * 255) !== Math.round(Math.min(1, o) * 255)) changed = true;
    }
    if (changed) this.dirty = true;
  }

  /** 一块多边形里填沙（预设用）：depth 深度，边上 edge 米渐变、按噪声抖；max = 只往上加 */
  sandPoly(poly: V2[], depth: number, edge = 0.4) {
    this.polyFill(this.sand, poly, depth, edge, true);
  }

  private polyFill(arr: Float32Array, poly: V2[], depth: number, edge: number, mark: boolean) {
    let x0 = Number.POSITIVE_INFINITY;
    let z0 = x0;
    let x1 = Number.NEGATIVE_INFINITY;
    let z1 = x1;
    for (const [x, z] of poly) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
    this.forCells(x0 - 1, z0 - 1, x1 + 1, z1 + 1, (k, cx, cz) => {
      const d = distToPoly(cx, cz, poly) * (insidePoly(cx, cz, poly) ? 1 : -1);
      // 边按低频噪声抖（±0.2 米）：弯的硬边，不是圆规画的；高频的抖会在边上撒出一圈 1～2 纹素的碎沙（噪点）
      const j = (vnoise(cx * 0.8, cz * 0.8, 13) - 0.5) * 0.4;
      const f = sstep(-edge * 0.2, edge, d + j);
      // 离多边形边越远越厚一点（舌头中间鼓）
      const v = depth * f * (0.8 + 0.2 * sstep(0, 1.2, d));
      if (v > arr[k]) arr[k] = v;
    });
    if (mark) this.dirty = true;
  }

  // ── 水 ─────────────────────────────────────────
  /**
   * 加水：中心 (x, z)，x 向半径 r、z 向半径 r × aspect（扁的一团），amount 0..1。边是弯的（按位置的噪声抖半径）。
   * amount 1 = 一下子一整团水洼（≈ 0.86 r 内是水、外面窄窄一圈潮）；喷雾每秒加一点（0.02～0.05），水洼从中间长出来。
   */
  wet(x: number, z: number, r: number, amount = 1, aspect = 0.5) {
    const rz = r * aspect;
    const R = Math.max(r, rz) * 1.4;
    this.forCells(x - R, z - R, x + R, z + R, (k, cx, cz) => {
      const e = Math.hypot((cx - x) / r, (cz - z) / rz) * (0.86 + 0.28 * vnoise(cx * 1.4, cz * 1.4, 31));
      // 水洼 ≈ e < 0.86（f > 0.5）；外面一圈潮只有 ≈ 0.14 r（f 0.16..0.5）
      const f = sstep(1.12, 0.6, e);
      if (f <= 0) return;
      this.water[k] = Math.min(1, this.water[k] + amount * f);
    });
    this.dirty = true;
  }

  /**
   * 刮水板：板心在 (x, z)，往 (dx, dz) 推，板宽 width。板下面（沿推的方向 −0.14…+0.1 米）的水留一层潮（≤ 0.3），
   * 其余往前挪 0.24 米：挪到外场绿上少两成（渗开了），挪出网格就没了（围网脚下的排水缝）。返回这一下挪动的水量。
   * 每帧调一次（人推着走），水在板前面越堆越多、到场边绿上越来越小。
   */
  squeegee(x: number, z: number, dx: number, dz: number, width = 0.9): number {
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const hw = width / 2;
    const r = hw + 0.3;
    let moved = 0;
    this.forCells(x - r, z - r, x + r, z + r, (k, cx, cz) => {
      const ex = cx - x;
      const ez = cz - z;
      const ax = ex * ux + ez * uz;
      const lat = Math.abs(-ex * uz + ez * ux);
      if (ax < -0.14 || ax > 0.1 || lat > hw) return;
      const w = this.water[k];
      const keep = Math.min(w, 0.3);
      const mv = w - keep;
      if (mv <= 1e-4) return;
      moved += mv;
      this.add(k, -mv);
      const tx = cx + ux * 0.24;
      const tz = cz + uz * 0.24;
      const t = this.cellAt(tx, tz);
      if (t >= 0) this.add(t, this.inBlue(tx, tz) ? mv : mv * 0.8);
    });
    this.apply(this.water, 1);
    return moved;
  }

  /**
   * 晾干 dt 秒：secondsToDry = 一整团水洼（1.0）干透要多久（默认 1800 秒 ≈ 一盘干一半）；
   * 潮的（< 0.5）干得快三倍（刮过的那层潮几分钟就没了）。每格快慢不同。
   */
  dryStep(dt: number, secondsToDry = 1800) {
    const k0 = dt / secondsToDry;
    let any = false;
    for (let k = 0; k < this.water.length; k++) {
      const w = this.water[k];
      if (w <= 0) continue;
      const nw = Math.max(0, w - k0 * this.dryK[k] * (w < T_WET ? 3 : 1));
      this.water[k] = nw;
      // 纹素里存的是 8 位：变到下一档才重传（慢慢干的时候不必每帧传 270 KB）
      if (!any && Math.round(Math.min(1, nw) * 255) !== Math.round(Math.min(1, w) * 255)) any = true;
    }
    if (any) this.dirty = true;
  }

  /** 整片清空（不动 eq） */
  clear(what: 'sand' | 'water' | 'all' = 'all') {
    if (what !== 'water') this.sand.fill(0);
    if (what !== 'sand') this.water.fill(0);
    this.dirty = true;
  }

  /** 沙长满自然积沙（风吹了很久） */
  fillDrift() {
    for (let k = 0; k < this.eq.length; k++) this.sand[k] = Math.max(this.sand[k], this.eq[k]);
    this.dirty = true;
  }

  // ── 增量缓冲 ─────────────────────────────────────
  private add(k: number, v: number) {
    if (this.tmp[k] === 0) this.touched.push(k);
    this.tmp[k] += v;
  }

  private apply(arr: Float32Array, cap: number) {
    for (const k of this.touched) {
      arr[k] = Math.max(0, Math.min(cap, arr[k] + this.tmp[k]));
      this.tmp[k] = 0;
    }
    if (this.touched.length) this.dirty = true;
    this.touched.length = 0;
  }

  // ── 打包成纹理数据 ─────────────────────────────────────
  /** 网格 → RGBA8（R 积沙、G 水）；行 = z 从北往南 */
  pack(out: Uint8Array) {
    const n = this.nx * this.nz;
    for (let k = 0; k < n; k++) {
      out[k * 4] = Math.round(clamp01(this.sand[k]) * 255);
      out[k * 4 + 1] = Math.round(clamp01(this.water[k]) * 255);
      out[k * 4 + 2] = 0;
      out[k * 4 + 3] = 255;
    }
  }
}
