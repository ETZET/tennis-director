// clay-court 的状态（纯数据，不碰 three）：一片红土场的"低分辨率状态网格" + 9 条胶带线的盖土程度 + 一小串记号（脚印、球印、滑步痕）。
// 坐标全是**本地米**：原点 = 场地中心，+x 朝东（场地长边，网在 x 0），+z 朝南（朝镜头）。世界坐标的换算在 clay-court.ts。
//
// 网格（每格 ≈ 0.18 米 = 2 设计纹素，33 × 16.6 米 → 184 × 93 格，RGBA8 ≈ 68 KB）：
//   R 湿（0 干 … 1 刚浇透）· G 土况（0 刚拖平 · 0.5 正常 · 0.9 起尘；拖垫两边翻起的一条土 = 1）· B 拖痕方向（0..π，横 = 0.5）· A 擦痕多少
// shader 用线性过滤取，再按阈值切（湿 0.5；土况 0.27 / 0.68）：低分辨率的场在屏幕上是光滑、硬边的形状，边按纹素取整。
// 胶带线：每条线一行，每 0.18 米一个数（0 干净 … 1 盖满土），线性过滤 → 一段一段的糊。
// 记号：最多 MAX_MARKS 个（环形，满了丢最老的），shader 逐个查（离得远的直接跳过）。拖垫拖过 = 抹掉。

/** 状态网格的格子（米）：2 设计纹素 */
export const CELL = 0.18;
/** 胶带线上采样的间距（米） */
export const TAPE_STEP = 0.18;
/** 记号上限（shader 循环上限同这个数） */
export const MAX_MARKS = 128;

/** 土况阈值（shader 同一组数）：< BRUSHED 刚拖平，< DUSTY 正常，≥ DUSTY 起尘 */
export const T_BRUSHED = 0.27;
export const T_DUSTY = 0.68;
/** 正常红土的土况 */
export const NORMAL = 0.48;

export type MarkType = 'foot' | 'ball' | 'slide';
export const MARK_CODE: Record<MarkType, number> = { foot: 1, ball: 2, slide: 3 };

export interface Mark {
  type: MarkType;
  x: number;
  z: number;
  /** 方向（单位向量）：脚尖朝向 / 球飞的方向 / 滑的方向 */
  dx: number;
  dz: number;
  /** 0..1：新的 1，淡了的 < 0.5（换成低一级的颜色） */
  strength: number;
  /** 长（米）：脚印半长、球印半长、滑步痕全长 */
  len: number;
  /** 宽（米）：脚印半宽、球印半宽、滑步痕全宽 */
  w: number;
}

/** 一条胶带线：c = 常数坐标（x 或 z），a0..a1 = 沿线的范围；kind 'x' = 竖的（x 常数，沿 z 走），'z' = 横的 */
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

/** 9 条线（不画底线中点的小标记）。id 给 sweepLine 用 */
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

export type V2 = [number, number];

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

/** 一片场的状态。所有操作只改数组、记"脏"，flush 由 clay-court.ts 每帧做一次（上传纹理） */
export class ClayState {
  readonly w: number;
  readonly d: number;
  readonly hw: number;
  readonly hd: number;
  readonly nx: number;
  readonly nz: number;
  readonly cx: number;
  readonly cz: number;
  readonly lines: LineDef[];
  /** 胶带线纹理宽（每条线最多几个采样） */
  readonly tapeW: number;
  wet: Float32Array;
  dust: Float32Array;
  /** 拖痕方向（弧度 0..π）；没拖过的格子 = 0（横） */
  axis: Float32Array;
  scuff: Float32Array;
  /** 每条线的盖土程度（0..1），长 tapeW */
  tape: Float32Array[];
  marks: Mark[] = [];
  /** 干得快慢（每格固定的 0.6..1.4：水洼干得慢） */
  private dryK: Float32Array;
  dirtyGrid = true;
  dirtyTape = true;
  dirtyMarks = true;

  constructor(w: number, d: number, dims: CourtDims) {
    this.w = w;
    this.d = d;
    this.hw = w / 2;
    this.hd = d / 2;
    this.nx = Math.ceil(w / CELL);
    this.nz = Math.ceil(d / CELL);
    this.cx = w / this.nx;
    this.cz = d / this.nz;
    const n = this.nx * this.nz;
    this.wet = new Float32Array(n);
    this.dust = new Float32Array(n).fill(NORMAL);
    this.axis = new Float32Array(n);
    this.scuff = new Float32Array(n);
    this.dryK = new Float32Array(n);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        this.dryK[j * this.nx + i] = 0.6 + 0.8 * vnoise(x * 0.9 + 3.1, z * 0.9 + 7.7, 5);
      }
    this.lines = courtLines(dims);
    this.tapeW = Math.ceil(Math.max(...this.lines.map((l) => l.a1 - l.a0)) / TAPE_STEP) + 2;
    this.tape = this.lines.map(() => new Float32Array(this.tapeW));
  }

  /** 格子中心（本地米） */
  center(i: number, j: number): V2 {
    return [-this.hw + (i + 0.5) * this.cx, -this.hd + (j + 0.5) * this.cz];
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

  /** 遍历胶带线上落在 [x0,x1]×[z0,z1] 里的采样：fn(线号, 采样号, 本地 x, z) */
  forTape(x0: number, z0: number, x1: number, z1: number, fn: (li: number, k: number, x: number, z: number) => void) {
    this.lines.forEach((l, li) => {
      const n = Math.ceil((l.a1 - l.a0) / TAPE_STEP) + 1;
      for (let k = 0; k < n; k++) {
        const a = Math.min(l.a1, l.a0 + k * TAPE_STEP);
        const x = l.kind === 'x' ? l.c : a;
        const z = l.kind === 'x' ? a : l.c;
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) fn(li, k, x, z);
      }
    });
  }

  // ── 查询 ─────────────────────────────────────────
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

  /** 某点的状态：wet / dust 原值 + 读出来的状态名（和 shader 的阈值一致） */
  at(x: number, z: number): { wet: number; dust: number; state: 'wet' | 'brushed' | 'normal' | 'dusty' } {
    const wet = this.sample(this.wet, x, z);
    const dust = this.sample(this.dust, x, z);
    const state = wet > 0.5 ? 'wet' : dust < T_BRUSHED ? 'brushed' : dust < T_DUSTY ? 'normal' : 'dusty';
    return { wet, dust, state };
  }

  /** 最脏的一块（1.2 米见方的块，只看场内 + 底线后 2 米；湿的不算）：本地坐标 + 平均土况 */
  dirtiest(dims: CourtDims): { x: number; z: number; dust: number } {
    const B = 1.2;
    let best = { x: 0, z: 0, dust: -1 };
    for (let z = -dims.DW / 2; z < dims.DW / 2; z += B)
      for (let x = -dims.L / 2 - 2; x < dims.L / 2 + 2; x += B) {
        let s = 0;
        let n = 0;
        this.forCells(x, z, x + B, z + B, (k) => {
          s += this.wet[k] > 0.5 ? 0 : this.dust[k];
          n++;
        });
        if (n && s / n > best.dust) best = { x: x + B / 2, z: z + B / 2, dust: s / n };
      }
    return best;
  }

  /** 各状态的面积占比（整片场）+ 每条线的平均盖土 */
  stats(): { wet: number; brushed: number; normal: number; dusty: number; tape: Record<string, number> } {
    const n = this.nx * this.nz;
    let wet = 0;
    let brushed = 0;
    let dusty = 0;
    for (let k = 0; k < n; k++) {
      if (this.wet[k] > 0.5) wet++;
      else if (this.dust[k] < T_BRUSHED) brushed++;
      else if (this.dust[k] >= T_DUSTY) dusty++;
    }
    const tape: Record<string, number> = {};
    this.lines.forEach((l, li) => {
      const m = Math.ceil((l.a1 - l.a0) / TAPE_STEP) + 1;
      let s = 0;
      for (let k = 0; k < m; k++) s += this.tape[li][k];
      tape[l.id] = s / m;
    });
    return { wet: wet / n, brushed: brushed / n, normal: (n - wet - brushed - dusty) / n, dusty: dusty / n, tape };
  }

  // ── 操作（本地米）─────────────────────────────────────
  /**
   * 拖垫压过一下：中心 (x, z)，朝 (dx, dz) 走，宽 width（横着，默认 2.4）、长 len（顺着，默认 1.2）。
   * 垫子下面：土况 → 0（刚拖平）、记下拖痕方向、擦痕清零、胶带线盖上土、记号抹掉；
   * 垫子两边各一格：翻起一条土（土况 1）—— 相邻两道之间留下的那条浅土。
   */
  drag(x: number, z: number, dx: number, dz: number, width = 2.4, len = 1.2) {
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    const hw = width / 2;
    const r = Math.hypot(hw + CELL, len / 2) + CELL;
    let ang = Math.atan2(uz, ux);
    if (ang < 0) ang += Math.PI;
    if (ang >= Math.PI) ang -= Math.PI;
    const inner = hw - CELL * 0.6;
    const outer = hw + CELL * 0.5;
    this.forCells(x - r, z - r, x + r, z + r, (k, cx, cz) => {
      const ax = (cx - x) * ux + (cz - z) * uz;
      if (Math.abs(ax) > len / 2) return;
      const lat = Math.abs(-(cx - x) * uz + (cz - z) * ux);
      if (lat <= inner) {
        this.dust[k] = 0;
        this.axis[k] = ang;
        this.scuff[k] = 0;
      } else if (lat <= outer) this.dust[k] = Math.max(this.dust[k], 1);
    });
    this.forTape(x - r, z - r, x + r, z + r, (li, k, cx, cz) => {
      const ax = (cx - x) * ux + (cz - z) * uz;
      const lat = Math.abs(-(cx - x) * uz + (cz - z) * ux);
      if (Math.abs(ax) <= len / 2 && lat <= hw) this.tape[li][k] = 1;
    });
    const before = this.marks.length;
    this.marks = this.marks.filter((m) => {
      const ax = (m.x - x) * ux + (m.z - z) * uz;
      const lat = Math.abs(-(m.x - x) * uz + (m.z - z) * ux);
      return !(Math.abs(ax) <= len / 2 + 0.05 && lat <= hw);
    });
    if (this.marks.length !== before) this.dirtyMarks = true;
    this.dirtyGrid = this.dirtyTape = true;
  }

  /** 沿一条折线拖（每 0.1 米压一下，方向 = 切线）。拐弯处的拖痕跟着方向转 */
  dragPath(pts: V2[], width = 2.4) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const segL = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(segL / 0.1));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        this.drag(ax + (bx - ax) * t, az + (bz - az) * t, bx - ax, bz - az, width, 0.24);
      }
    }
  }

  /** 扫线：把第 id 条线（或 'all'）沿线 [from, to]（本地米，沿线坐标；不给 = 整条）的土扫掉 */
  sweepLine(id: string, from = Number.NEGATIVE_INFINITY, to = Number.POSITIVE_INFINITY) {
    this.lines.forEach((l, li) => {
      if (id !== 'all' && l.id !== id) return;
      const m = Math.ceil((l.a1 - l.a0) / TAPE_STEP) + 1;
      for (let k = 0; k < m; k++) {
        const a = l.a0 + k * TAPE_STEP;
        if (a >= from - 0.01 && a <= to + 0.01) this.tape[li][k] = 0;
      }
    });
    this.dirtyTape = true;
  }

  /** 扫线刷在 (x, z) 附近 r 米内扫过（跟着刷子走） */
  sweepAt(x: number, z: number, r = 0.35) {
    this.forTape(x - r, z - r, x + r, z + r, (li, k, cx, cz) => {
      if (Math.hypot(cx - x, cz - z) <= r) this.tape[li][k] = 0;
    });
    this.dirtyTape = true;
  }

  /** 浇水：圆心 (x, z)、半径 r，amount 0..1。边是弯的（按位置的噪声抖半径）；浇透的地方起尘的土压回正常 */
  water(x: number, z: number, r: number, amount = 1) {
    const R = r * 1.2;
    this.forCells(x - R, z - R, x + R, z + R, (k, cx, cz) => {
      const re = r * (0.82 + 0.36 * vnoise(cx * 0.7, cz * 0.7, 11));
      const f = sstep(re, re - Math.max(0.25, r * 0.35), Math.hypot(cx - x, cz - z));
      this.soak(k, amount * f);
    });
    this.dirtyGrid = true;
  }

  /** 浇一块多边形（预设用：手摆的湿区）；edge = 边上渐变的宽度（米），边按噪声抖 */
  waterPoly(poly: V2[], amount = 1, edge = 0.6) {
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
      const j = (vnoise(cx * 0.8, cz * 0.8, 13) - 0.5) * 0.9;
      this.soak(k, amount * sstep(-edge * 0.3, edge, d + j));
    });
    this.dirtyGrid = true;
  }

  private soak(k: number, v: number) {
    if (v <= 0) return;
    this.wet[k] = Math.max(this.wet[k], clamp01(v));
    if (v > 0.5 && this.dust[k] > NORMAL) this.dust[k] = NORMAL;
  }

  /**
   * 晾干：dt 秒，secondsToDry = 从浇透到干的时间（默认 900 秒 = 15 分钟游戏时间）。
   * 每格干得快慢不一样（水洼干得慢）；干了的格子土况不变（浇水时已经把起尘压回正常）。
   */
  dryStep(dt: number, secondsToDry = 900) {
    const k0 = dt / secondsToDry;
    let any = false;
    for (let k = 0; k < this.wet.length; k++) {
      if (this.wet[k] <= 0) continue;
      this.wet[k] = Math.max(0, this.wet[k] - k0 * this.dryK[k]);
      any = true;
    }
    if (any) this.dirtyGrid = true;
  }

  /** 踩 / 打：(x, z) 半径 r 米内土况往起尘走 amount（0..1），擦痕变多。比赛里每个人每秒在脚下调一次 */
  wear(x: number, z: number, r: number, amount: number) {
    this.forCells(x - r, z - r, x + r, z + r, (k, cx, cz) => {
      const f = sstep(r, r * 0.4, Math.hypot(cx - x, cz - z));
      if (f <= 0 || this.wet[k] > 0.5) return;
      this.dust[k] = clamp01(this.dust[k] + amount * f);
      this.scuff[k] = clamp01(this.scuff[k] + amount * f * 1.5);
    });
    this.dirtyGrid = true;
  }

  /** 填一块多边形的土况（预设用），边上 edge 米渐变、按噪声抖 */
  wearPoly(poly: V2[], dust: number, edge = 0.5, scuff = 0.7) {
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
      const j = (vnoise(cx * 0.9, cz * 0.9, 17) - 0.5) * 0.8;
      const f = sstep(-edge * 0.3, edge, d + j);
      this.dust[k] = Math.max(this.dust[k], this.dust[k] + (dust - this.dust[k]) * f);
      this.scuff[k] = Math.max(this.scuff[k], scuff * f);
    });
    this.dirtyGrid = true;
  }

  /** 加一个记号（环形：满了丢最老的） */
  addMark(m: Mark) {
    this.marks.push(m);
    if (this.marks.length > MAX_MARKS) this.marks.splice(0, this.marks.length - MAX_MARKS);
    this.dirtyMarks = true;
  }

  /** 一个脚印：脚在 (x, z)，脚尖朝 (dx, dz)；side ±1 = 左右脚（往两边各偏 0.09 米） */
  step(x: number, z: number, dx: number, dz: number, side = 1, strength = 1) {
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    this.addMark({
      type: 'foot',
      x: x - uz * 0.09 * side,
      z: z + ux * 0.09 * side,
      dx: ux,
      dz: uz,
      strength,
      len: 0.15,
      w: 0.075,
    });
  }

  /** 一串脚印：沿折线每 stride 米一步，左右交替 */
  trail(pts: V2[], stride = 0.72, strength = 1) {
    let side = 1;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      let s = carry;
      while (s < L) {
        const t = s / L;
        this.step(ax + (bx - ax) * t, az + (bz - az) * t, bx - ax, bz - az, side, strength);
        side = -side;
        s += stride;
      }
      carry = s - L;
    }
  }

  /** 球印：球落在 (x, z)，往 (dx, dz) 飞（默认朝东） */
  ballMark(x: number, z: number, dx = 1, dz = 0, strength = 1) {
    const l = Math.hypot(dx, dz) || 1;
    this.addMark({ type: 'ball', x, z, dx: dx / l, dz: dz / l, strength, len: 0.17, w: 0.085 });
  }

  /** 滑步痕：从 (x, z) 往 (dx, dz) 滑 len 米（0.26 米宽，尽头一小堆推起来的土） */
  slide(x: number, z: number, dx: number, dz: number, len = 1.3, strength = 1) {
    const l = Math.hypot(dx, dz) || 1;
    this.addMark({ type: 'slide', x, z, dx: dx / l, dz: dz / l, strength, len, w: 0.26 });
    this.wear(x + (dx / l) * len * 0.5, z + (dz / l) * len * 0.5, len * 0.6, 0.12);
  }

  /** 整片换成一种状态 */
  fill(dust: number, opts: { wet?: number; scuff?: number; tape?: number; axis?: number; jitter?: number } = {}) {
    const j = opts.jitter ?? 0;
    for (let jz = 0; jz < this.nz; jz++)
      for (let i = 0; i < this.nx; i++) {
        const k = jz * this.nx + i;
        const [x, z] = this.center(i, jz);
        this.dust[k] = clamp01(dust + (vnoise(x * 0.35, z * 0.35, 23) - 0.5) * 2 * j);
        this.wet[k] = opts.wet ?? 0;
        this.scuff[k] = opts.scuff ?? 0;
        this.axis[k] = opts.axis ?? 0;
      }
    for (const t of this.tape) t.fill(opts.tape ?? 0);
    this.marks = [];
    this.dirtyGrid = this.dirtyTape = this.dirtyMarks = true;
  }

  // ── 打包成纹理数据 ─────────────────────────────────────
  /** 网格 → RGBA8（R 湿、G 土况、B 拖痕方向（横 = 0.5）、A 擦痕）；行 = z 从北往南 */
  packGrid(out: Uint8Array) {
    const n = this.nx * this.nz;
    for (let k = 0; k < n; k++) {
      let a = this.axis[k] + Math.PI / 2;
      if (a >= Math.PI) a -= Math.PI;
      out[k * 4] = Math.round(clamp01(this.wet[k]) * 255);
      out[k * 4 + 1] = Math.round(clamp01(this.dust[k]) * 255);
      out[k * 4 + 2] = Math.round((a / Math.PI) * 255);
      out[k * 4 + 3] = Math.round(clamp01(this.scuff[k]) * 255);
    }
  }

  /** 胶带线 → RGBA8（每条线一行，R = 盖土） */
  packTape(out: Uint8Array) {
    this.tape.forEach((t, li) => {
      for (let k = 0; k < this.tapeW; k++) out[(li * this.tapeW + k) * 4] = Math.round(clamp01(t[k]) * 255);
    });
  }

  /** 记号 → float RGBA，两行：[x, z, dx, dz]、[类型, 强度, 长, 宽] */
  packMarks(out: Float32Array) {
    out.fill(0);
    this.marks.forEach((m, i) => {
      out.set([m.x, m.z, m.dx, m.dz], i * 4);
      out.set([MARK_CODE[m.type], m.strength, m.len, m.w], (MAX_MARKS + i) * 4);
    });
  }
}
