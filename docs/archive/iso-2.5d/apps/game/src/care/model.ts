import type { CourtMessLook } from '@td/iso';
import type { Rand } from '@td/shared';
import type { MessKind, Surface } from '@td/sim';

/**
 * 亲手扫小游戏的数值（court-care-contract.md「小游戏」，从 sandbox demo 06 第二轮搬过来）：一块球场上的
 * 沙、积水 / 湿泥、球和垃圾、褪色的线、裂缝 / 干裂，按模拟的 CourtMessLook 和面生成。
 * 只管数，不碰画面和 DOM；演出（扫把、粒子）读它的返回值。网格是场地局部坐标 u（沿长边）、v（沿球网）的 0.2 米格子，
 * 不转的场地和地面贴图的纹素对齐。这里的随机只决定画面上脏乱怎么分布；交给模拟的只有 cleared（每项清掉了几成）。
 */

export const TS = 0.2;
/** 低于这个量的脏乱不算（不配工具、不写进结果）；和 canCare 的 clean 门槛同一个数 */
export const MESS_MIN = 0.03;
/** 收尾：剩下不到这么多时一口气清光（demo 第二轮） */
export const FINISH_AT = 0.08;
const KINDS: readonly MessKind[] = ['sand', 'water', 'litter', 'lines', 'cracks'];

export type Tool = 'broom' | 'squeegee' | 'roller' | 'paint' | 'water' | 'pick' | 'net';

/** 场地的几何（CourtFrame 的子集） */
export interface CourtGeom {
  readonly ox: number;
  readonly oz: number;
  readonly hx: number;
  readonly hz: number;
  /** 绕 y 的转角（cos、sin） */
  readonly c: number;
  readonly s: number;
}

/** 场上的线（米）：L 半长、Wd 双打半宽、Ws 单打半宽（0 = 没有）、sv 发球线（0 = 没有）、kit 匹克球"厨房"线（0 = 没有） */
export interface LineDims {
  L: number;
  Wd: number;
  Ws: number;
  sv: number;
  kit: number;
}

/** 这块场画的是哪种线（和 site/indian-wells/ground.ts 的 paintCourt 一致） */
export function lineDims(surface: Surface, g: Pick<CourtGeom, 'hx'>): LineDims {
  if (surface === 'pickleball')
    // 四片小场（pickle4）/ 标准匹克球场（13.41 × 6.10 米）
    return g.hx <= 4.5 ? { L: 3.7, Wd: 1.75, Ws: 0, sv: 0, kit: 1.1 } : { L: 6.705, Wd: 3.05, Ws: 0, sv: 0, kit: 2.13 };
  // 匹克球场改的两片缩小网球场（tennis2）
  if (g.hx < 10) return { L: 7.3, Wd: 3.35, Ws: 2.55, sv: 3.95, kit: 0 };
  return { L: 11.885, Wd: 5.485, Ws: 4.115, sv: 6.4, kit: 0 };
}

/** 一条线：axis 'u' 沿长边（v = c 不变），'v' 沿球网方向（u = c 不变） */
export interface Seg {
  axis: 'u' | 'v';
  c: number;
  a: number;
  b: number;
  n: number;
  /** 0 原本就好、1 褪了（要画）、2 画好、3 有点抖、4 画在沙上（脏，算没画） */
  cov: Uint8Array;
}

export interface LitterItem {
  u: number;
  v: number;
  /** 0 网球、1 瓶子、2 落叶 */
  kind: 0 | 1 | 2;
  taken: boolean;
}

/** 场上有的脏乱配哪些工具（契约「五种脏乱」的工具列；net 是线那一项的一部分：打得多了网也松） */
export function toolsFor(surface: Surface, mess: CourtMessLook): Tool[] {
  const clay = surface === 'clay';
  const on = (k: MessKind) => mess[k] >= MESS_MIN;
  const out: Tool[] = [];
  const add = (t: Tool) => {
    if (!out.includes(t)) out.push(t);
  };
  if (on('sand')) add('broom');
  if (on('water')) add(clay ? 'roller' : 'squeegee');
  if (on('cracks')) add(clay ? 'water' : 'roller');
  if (on('litter')) add('pick');
  if (on('lines')) {
    add('paint');
    add('net');
  }
  return out;
}

/** 这一项算不算在小游戏里（开始时 ≥ MESS_MIN） */
export const workable = (mess: CourtMessLook): MessKind[] => KINDS.filter((k) => mess[k] >= MESS_MIN);

/** 可捡的东西有几个：round(litter × 24)，有就至少 1 个 */
export const litterCount = (litter: number): number => (litter >= MESS_MIN ? Math.max(1, Math.round(litter * 24)) : 0);

/**
 * 收工时交给模拟的结果（契约 careFinish 的 CareResult.cleared）：cleared[k] = 1 − 剩下的 / 开始的，截在 0..1，
 * 保留三位小数；开始时不够 MESS_MIN 的项（场上没有、没配工具）不写。left 是每项剩下的比例（1 = 一点没动）。
 */
export function clearedFrom(
  start: CourtMessLook,
  left: Partial<Record<MessKind, number>>,
): Partial<Record<MessKind, number>> {
  const out: Partial<Record<MessKind, number>> = {};
  for (const k of workable(start)) {
    const l = left[k];
    const v = 1 - (typeof l === 'number' && Number.isFinite(l) ? l : 1);
    out[k] = Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
  }
  return out;
}

/**
 * 底部卡片上"清掉了 p%"：按可用度的扣分权重（rules.care.weights[面]，没给就每项 1）加权，取整。
 * 场上什么都没有时是 100。
 */
export function clearedPercent(
  start: CourtMessLook,
  cleared: Partial<Record<MessKind, number>>,
  weights: Partial<Record<MessKind, number>> = {},
): number {
  let tot = 0;
  let got = 0;
  for (const k of workable(start)) {
    const w = (weights[k] ?? 1) * start[k];
    tot += w;
    got += w * Math.max(0, Math.min(1, cleared[k] ?? 0));
  }
  return tot > 0 ? Math.round((100 * got) / tot) : 100;
}

/** 张力 t（0..1.05）离目标多远 → 球网的分（15..100；demo 第二轮的手感） */
export const netScore = (t: number, target = 0.72): number =>
  Math.round(Math.max(15, Math.min(100, 100 - Math.abs(t - target) * 280)));

/** 线那一项里画线占八成、球网占两成 */
const NET_SHARE = 0.2;

const clamp = (v: number, a: number, b: number) => (v < a ? a : Math.min(v, b));
/** 格子的小哈希（0..1，只决定画面） */
export function cellHash(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface CareModelOptions {
  geom: CourtGeom;
  surface: Surface;
  mess: CourtMessLook;
  rnd: Rand;
  /** 地面贴图纹素的原点（世界坐标；地台西北角）：不转的场地的格子和地面一个像素格 */
  texel?: { x0: number; z0: number };
}

export class CareModel {
  readonly G: CourtGeom;
  readonly surface: Surface;
  readonly clay: boolean;
  readonly start: CourtMessLook;
  readonly tools: Tool[];
  readonly dims: LineDims;
  readonly nx: number;
  readonly nz: number;
  /** 第 0 格西北角的局部坐标 */
  readonly u0: number;
  readonly v0: number;
  readonly N: number;
  readonly inside: Uint8Array;
  readonly sand: Float32Array;
  /** 硬地：积水；红土：湿泥 */
  readonly wet: Float32Array;
  /** 硬地：裂缝和坑洼；红土：干裂 */
  readonly rough: Float32Array;
  readonly crack: Uint8Array;
  /** 画歪的线：1 白、2 脏 */
  readonly stray: Uint8Array;
  readonly segOf: Int8Array;
  readonly segP: Int16Array;
  readonly segNear: Int8Array;
  readonly segs: Seg[] = [];
  readonly litter: LitterItem[] = [];
  readonly net: { t: number; score: number; score0: number };
  sandInit = 1;
  wetInit = 1;
  roughInit = 1;
  fadedInit = 0;
  litterInit = 0;

  constructor(o: CareModelOptions) {
    const G = o.geom;
    this.G = G;
    this.surface = o.surface;
    this.clay = o.surface === 'clay';
    this.start = { ...o.mess };
    this.tools = toolsFor(o.surface, o.mess);
    this.dims = lineDims(o.surface, G);
    // 不转的场地：格子和地面贴图对齐；转了的就从场地西北角起
    const aligned = o.texel && Math.abs(G.s) < 1e-6 && G.c > 0;
    this.u0 = aligned && o.texel ? o.texel.x0 + Math.floor((G.ox - G.hx - o.texel.x0) / TS) * TS - G.ox : -G.hx;
    this.v0 = aligned && o.texel ? o.texel.z0 + Math.floor((G.oz - G.hz - o.texel.z0) / TS) * TS - G.oz : -G.hz;
    this.nx = Math.ceil((G.hx - this.u0) / TS);
    this.nz = Math.ceil((G.hz - this.v0) / TS);
    const N = this.nx * this.nz;
    this.N = N;
    this.inside = new Uint8Array(N);
    this.sand = new Float32Array(N);
    this.wet = new Float32Array(N);
    this.rough = new Float32Array(N);
    this.crack = new Uint8Array(N);
    this.stray = new Uint8Array(N);
    this.segOf = new Int8Array(N).fill(-1);
    this.segP = new Int16Array(N);
    this.segNear = new Int8Array(N).fill(-1);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++)
        if (Math.abs(this.cu(i)) <= G.hx - 0.1 && Math.abs(this.cv(j)) <= G.hz - 0.1) this.inside[j * this.nx + i] = 1;
    const m = o.mess;
    const t0 = clamp(0.72 - 0.5 * m.lines, 0, 1);
    this.net = { t: t0, score: netScore(t0), score0: netScore(t0) };
    this.buildLines(o.rnd, m.lines >= MESS_MIN ? m.lines : 0);
    this.generate(o.rnd);
  }

  /* ---------------- 坐标 ---------------- */

  cu(i: number): number {
    return this.u0 + (i + 0.5) * TS;
  }
  cv(j: number): number {
    return this.v0 + (j + 0.5) * TS;
  }
  cell(u: number, v: number): number {
    const i = Math.floor((u - this.u0) / TS);
    const j = Math.floor((v - this.v0) / TS);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  inCourt(u: number, v: number, m = 0): boolean {
    return Math.abs(u) <= this.G.hx - m && Math.abs(v) <= this.G.hz - m;
  }
  /** 局部 → 世界 */
  world(u: number, v: number): { x: number; z: number } {
    const G = this.G;
    return { x: G.ox + u * G.c + v * G.s, z: G.oz - u * G.s + v * G.c };
  }
  /** 世界 → 局部 */
  local(x: number, z: number): { u: number; v: number } {
    const G = this.G;
    const dx = x - G.ox;
    const dz = z - G.oz;
    return { u: dx * G.c - dz * G.s, v: dx * G.s + dz * G.c };
  }
  /** 局部方向 → 世界方向 */
  dirWorld(du: number, dv: number): { x: number; z: number } {
    const G = this.G;
    return { x: du * G.c + dv * G.s, z: -du * G.s + dv * G.c };
  }

  /* ---------------- 生成 ---------------- */

  private buildLines(rnd: Rand, fade: number): void {
    const { L, Wd, Ws, sv, kit } = this.dims;
    const defs: [Seg['axis'], number, number, number][] = [
      ['v', -L, -Wd, Wd],
      ['v', L, -Wd, Wd],
      ['u', -Wd, -L, L],
      ['u', Wd, -L, L],
    ];
    if (Ws > 0) defs.push(['u', -Ws, -L, L], ['u', Ws, -L, L]);
    if (sv > 0)
      defs.push(
        ['v', -sv, -Ws, Ws],
        ['v', sv, -Ws, Ws],
        ['u', 0, -sv, sv],
        ['u', 0, -L, -L + 0.45],
        ['u', 0, L - 0.45, L],
      );
    if (kit > 0) defs.push(['v', -kit, -Wd, Wd], ['v', kit, -Wd, Wd], ['u', 0, -L, -kit], ['u', 0, kit, L]);
    for (const [axis, c, a, b] of defs) {
      const n = Math.round((b - a) / TS) + 1;
      const cov = new Uint8Array(n);
      // 一段段地褪：每段一个门槛，量越大褪得越多（量变时画面连续）
      let k = 0;
      while (k < n) {
        const run = 3 + Math.floor(rnd() * 12);
        const gate = rnd();
        for (let q = 0; q < run && k < n; q++, k++) if (gate < fade * 1.05) cov[k] = 1;
      }
      this.segs.push({ axis, c, a, b, n, cov });
    }
    const lw = 0.16;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const u = this.cu(i);
        const v = this.cv(j);
        const c = j * this.nx + i;
        for (let s = 0; s < this.segs.length; s++) {
          const g = this.segs[s] as Seg;
          const perp = g.axis === 'u' ? v : u;
          const par = g.axis === 'u' ? u : v;
          const pk = Math.max(0, Math.min(g.n - 1, Math.round((par - g.a) / TS)));
          if (Math.abs(perp - g.c) < lw && par >= g.a - lw && par <= g.b + lw) {
            this.segOf[c] = s;
            this.segP[c] = pk;
            break;
          }
          if (this.segNear[c] < 0 && Math.abs(perp - g.c) < 0.42 && par >= g.a - 0.3 && par <= g.b + 0.3) {
            this.segNear[c] = s;
            this.segP[c] = pk;
          }
        }
      }
    this.fadedInit = this.segs.reduce((t, g) => t + g.cov.reduce((x, v) => x + (v === 1 ? 1 : 0), 0), 0);
  }

  private disc(cu: number, cv: number, r: number, fn: (c: number, d: number) => void, sy = 1): void {
    for (let v = cv - r; v <= cv + r; v += TS)
      for (let u = cu - r; u <= cu + r; u += TS) {
        const d = Math.hypot(u - cu, (v - cv) * sy) / r;
        if (d > 1 || !this.inCourt(u, v)) continue;
        const c = this.cell(u, v);
        if (c >= 0 && this.inside[c]) fn(c, d);
      }
  }

  private generate(rnd: Rand): void {
    const R = (a: number, b: number) => a + rnd() * (b - a);
    const G = this.G;
    const m = this.start;
    const hx = G.hx - 0.4;
    const hz = G.hz - 0.4;
    const big = G.hx > 10 ? 1 : 0.45;
    // 裂缝（硬地）/ 干裂（红土）
    if (m.cracks >= MESS_MIN) {
      if (!this.clay) {
        const stack: [number, number, number, number][] = [];
        const n = Math.round((2 + m.cracks * 9) * big);
        for (let k = 0; k < n; k++)
          stack.push([R(-hx, hx), R(-hz, hz), R(0, 6.28), Math.floor(R(14, 40) * (0.6 + m.cracks * 0.5))]);
        while (stack.length) {
          let [u, v, a, len] = stack.pop() as [number, number, number, number];
          for (let st = 0; st < len; st++) {
            u += Math.cos(a) * TS;
            v += Math.sin(a) * TS;
            a += R(-0.4, 0.4);
            if (!this.inCourt(u, v, 0.3)) break;
            const c = this.cell(u, v);
            if (c < 0) break;
            this.rough[c] = 1;
            this.crack[c] = 1;
            if (rnd() < 0.3 && c + 1 < this.N) {
              this.rough[c + 1] = Math.max(this.rough[c + 1] as number, 0.6);
              this.crack[c + 1] = 1;
            }
            if (rnd() < 0.04 && stack.length < 30) stack.push([u, v, a + R(-1.2, 1.2), Math.floor(R(5, 14))]);
          }
        }
        const bumps = Math.round(m.cracks * 6 * big);
        for (let k = 0; k < bumps; k++)
          this.disc(R(-hx, hx), R(-hz, hz), R(0.6, 1.2), (c, d) => {
            this.rough[c] = Math.max(this.rough[c] as number, 0.85 * (1 - d * d));
          });
      } else {
        // 红土：发白的干裂斑块，斑块里一道道细裂纹
        const n = Math.round((2 + m.cracks * 8) * big);
        for (let k = 0; k < n; k++) {
          const cu = R(-hx, hx);
          const cv = R(-hz, hz);
          const r = R(1.4, 2.8) * (0.7 + m.cracks * 0.5);
          this.disc(cu, cv, r, (c, d) => {
            const i = c % this.nx;
            const j = Math.floor(c / this.nx);
            const edge = cellHash(i, j, 41) * 0.35;
            if (d > 1 - edge) return;
            this.rough[c] = Math.max(this.rough[c] as number, 0.55 + 0.45 * (1 - d));
            // 龟裂纹：两组斜线的格子
            if ((i + j * 2) % 7 === 0 || (i * 2 - j) % 9 === 0) this.crack[c] = 1;
          });
        }
      }
    }
    // 积水（硬地水洼）/ 湿泥（红土）
    if (m.water >= MESS_MIN) {
      const n = Math.round((1 + m.water * 6) * big) || 1;
      for (let k = 0; k < n; k++) {
        const r = R(1.2, 3) * (0.6 + m.water * 0.7) * (big < 1 ? 0.7 : 1);
        const h = R(0.7, 1.3) * (0.5 + m.water * 0.7);
        this.disc(
          R(-hx, hx),
          R(-hz, hz),
          r,
          (c, d) => {
            this.wet[c] = Math.min(1.6, (this.wet[c] as number) + h * (1 - d * d) ** 0.8);
          },
          R(0.8, 1.5),
        );
      }
      if (this.clay)
        // 红土：整块场都潮，深一块浅一块
        for (let c = 0; c < this.N; c++)
          if (this.inside[c])
            this.wet[c] = Math.min(1.6, (this.wet[c] as number) + m.water * 0.5 * (0.6 + cellHash(c, 3, 9) * 0.4));
    }
    // 沙：上风一个角吹进来一大片，再加几个沙堆（量越大铺得越开）
    if (m.sand >= MESS_MIN) {
      const k = 0.35 + 0.75 * m.sand;
      const cu = rnd() < 0.5 ? -G.hx : G.hx;
      const cv0 = -G.hz;
      for (let j = 0; j < this.nz; j++)
        for (let i = 0; i < this.nx; i++) {
          const c = j * this.nx + i;
          if (!this.inside[c]) continue;
          const drift = Math.exp(-(Math.abs(this.cu(i) - cu) + Math.abs(this.cv(j) - cv0)) / (3 + 5 * m.sand));
          this.sand[c] = (0.1 + cellHash(i, j, 3) * 0.12) * m.sand + 1.4 * drift * k;
        }
      const blobs = Math.round((2 + 7 * m.sand) * big);
      for (let q = 0; q < blobs; q++) {
        const r = R(2, 4.2) * (big < 1 ? 0.6 : 1);
        const h = R(0.6, 1.4) * k;
        this.disc(
          R(-hx, hx),
          R(-hz, hz),
          r,
          (c, d) => {
            this.sand[c] = Math.min(2.6, (this.sand[c] as number) + h * (1 - d * d) ** 1.5);
          },
          1.3,
        );
      }
    }
    // 球、瓶子、落叶
    const nl = litterCount(m.litter);
    for (let q = 0; q < nl; q++) {
      const r = rnd();
      this.litter.push({ u: R(-hx, hx), v: R(-hz, hz), kind: r < 0.55 ? 0 : r < 0.8 ? 1 : 2, taken: false });
    }
    this.litterInit = nl;
    let sd = 0;
    let wt = 0;
    let rf = 0;
    for (let c = 0; c < this.N; c++) {
      if (!this.inside[c]) {
        this.sand[c] = 0;
        this.wet[c] = 0;
        this.rough[c] = 0;
        this.crack[c] = 0;
        continue;
      }
      sd += Math.max(0, (this.sand[c] as number) - 0.03);
      wt += this.wet[c] as number;
      rf += this.rough[c] as number;
    }
    this.sandInit = Math.max(1e-6, sd);
    this.wetInit = Math.max(1e-6, wt);
    this.roughInit = Math.max(1e-6, rf);
  }

  /* ---------------- 读数 ---------------- */

  /** 线还剩多少没画（0..1，不算球网）：抖的格子算四成没画，画歪的白点擦不掉、每格扣 0.5% */
  paintLeft(): number {
    let stray = 0;
    for (let c = 0; c < this.N; c++) if (this.inside[c] && this.stray[c] === 1) stray++;
    let faded = 0;
    for (const g of this.segs)
      for (let k = 0; k < g.n; k++) {
        const v = g.cov[k];
        faded += v === 1 || v === 4 ? 1 : v === 3 ? 0.4 : 0;
      }
    return clamp((this.fadedInit ? faded / this.fadedInit : 0) + stray * 0.005, 0, 1);
  }

  /** 每项剩下的比例（0..1；1 = 一点没动）。只给开始时有的项 */
  left(): Partial<Record<MessKind, number>> {
    let sd = 0;
    let wt = 0;
    let rf = 0;
    for (let c = 0; c < this.N; c++) {
      if (!this.inside[c]) continue;
      sd += Math.max(0, (this.sand[c] as number) - 0.03);
      wt += this.wet[c] as number;
      rf += this.rough[c] as number;
    }
    const out: Partial<Record<MessKind, number>> = {};
    const s = this.start;
    if (s.sand >= MESS_MIN) out.sand = clamp(sd / this.sandInit, 0, 1);
    if (s.water >= MESS_MIN) out.water = clamp(wt / this.wetInit, 0, 1);
    if (s.cracks >= MESS_MIN) out.cracks = clamp(rf / this.roughInit, 0, 1);
    if (s.litter >= MESS_MIN)
      out.litter = this.litterInit ? this.litter.filter((l) => !l.taken).length / this.litterInit : 0;
    if (s.lines >= MESS_MIN) {
      const paint = this.paintLeft();
      const n = this.net;
      out.lines =
        n.score0 >= 100 ? paint : (1 - NET_SHARE) * paint + NET_SHARE * clamp((100 - n.score) / (100 - n.score0), 0, 1);
    }
    return out;
  }

  /** 收工时的结果（交给 session.careFinish） */
  cleared(): Partial<Record<MessKind, number>> {
    return clearedFrom(this.start, this.left());
  }

  /* ---------------- 工具 ---------------- */

  /** 扫把（沙）/ 推水（硬地积水）：往 (du, dv) 推，堆到前面，推出场外就没了 */
  push(field: 'sand' | 'wet', u: number, v: number, du: number, dv: number, R = 1.6): { moved: number; out: number } {
    const A = field === 'sand' ? this.sand : this.wet;
    const sand = field === 'sand';
    const off = R * 1.2;
    const takes: number[] = [];
    let moved = 0;
    let out = 0;
    for (let y = v - R; y <= v + R; y += TS)
      for (let x = u - R; x <= u + R; x += TS) {
        const d = Math.hypot(x - u, y - v);
        if (d > R) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c]) continue;
        const s0 = A[c] as number;
        // 厚沙堆推不动那么多（推着一大堆走会从两边漏）；水一推就走
        const t = s0 * (sand ? (s0 > 1.6 ? 0.32 : 0.6) : 0.7) * (1 - (d / R) * 0.25);
        if (t > 0.002) {
          A[c] = s0 - t;
          takes.push(x, y, t);
          moved += t;
        }
        if ((A[c] as number) < 0.05) A[c] = 0;
        if (sand) {
          if (this.stray[c] === 2) this.stray[c] = 0;
          const s = this.segOf[c] as number;
          if (s >= 0) {
            const g = this.segs[s] as Seg;
            if (g.cov[this.segP[c] as number] === 4) g.cov[this.segP[c] as number] = 1;
          }
        }
      }
    const px = -dv;
    const pz = du;
    const spillEdge = sand ? 0.35 : 0.18;
    for (let k = 0; k < takes.length; k += 3) {
      const x = takes[k] as number;
      const y = takes[k + 1] as number;
      const t = takes[k + 2] as number;
      const side = (x - u) * px + (y - v) * pz;
      const spill = Math.abs(side) > R * 0.55 ? spillEdge : 0.06;
      const c = this.cell(x + du * off, y + dv * off);
      if (c >= 0 && this.inside[c]) A[c] = Math.min(4, (A[c] as number) + t * (1 - spill));
      else out += t * (1 - spill);
      const sg = side >= 0 ? 1 : -1;
      const c2 = this.cell(x + du * off * 0.5 + px * sg * R * 0.5, y + dv * off * 0.5 + pz * sg * R * 0.5);
      if (c2 >= 0 && this.inside[c2]) A[c2] = Math.min(4, (A[c2] as number) + t * spill);
      else out += t * spill;
    }
    return { moved, out };
  }

  /**
   * 压路滚：硬地压平裂缝和坑洼（沙上压不实）；红土压实湿泥（一道压掉三成），干裂的红土压不动（要先洒水）。
   */
  roll(u: number, v: number, R = 1.2): { crack: boolean; sandy: boolean; dry: boolean; done: number; work: number } {
    let crack = false;
    let sandy = false;
    let dry = false;
    let done = 0;
    let work = 0;
    for (let y = v - R; y <= v + R; y += TS)
      for (let x = u - R; x <= u + R; x += TS) {
        const d = Math.hypot(x - u, y - v);
        if (d > R) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c]) continue;
        let eff = 1;
        if ((this.sand[c] as number) > 0.4) {
          eff = 0.25;
          sandy = true;
        }
        const fall = 0.032 * eff * (1 - (d / R) * 0.5);
        if (this.clay) {
          if ((this.rough[c] as number) > 0.3 && (this.wet[c] as number) < 0.05) dry = true;
          const w = this.wet[c] as number;
          if (w <= 0) continue;
          this.wet[c] = Math.max(0, w - fall);
          work += w - (this.wet[c] as number);
          if ((this.wet[c] as number) < 0.04) {
            this.wet[c] = 0;
            done++;
          }
          continue;
        }
        const b = this.rough[c] as number;
        if (b <= 0) continue;
        if (this.crack[c] && b > 0.5) crack = true;
        this.rough[c] = Math.max(0, b - fall);
        work += b - (this.rough[c] as number);
        if ((this.rough[c] as number) < 0.05) {
          this.rough[c] = 0;
          done++;
        }
      }
    return { crack, sandy, dry, done, work };
  }

  /** 洒水（红土的干裂）：干的地方喝水；本来不干的地方洒多了积成泥水（红土那一项又脏了） */
  sprinkle(u: number, v: number, R = 1.5): { fixed: number; puddle: boolean } {
    let fixed = 0;
    let puddle = false;
    for (let y = v - R; y <= v + R; y += TS)
      for (let x = u - R; x <= u + R; x += TS) {
        const d = Math.hypot(x - u, y - v);
        if (d > R) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c]) continue;
        const f = 1 - d / R;
        const r = this.rough[c] as number;
        if (r > 0) {
          this.rough[c] = Math.max(0, r - 0.06 * f);
          if ((this.rough[c] as number) < 0.05) this.rough[c] = 0;
          fixed += r - (this.rough[c] as number);
        } else {
          this.wet[c] = Math.min(1.6, (this.wet[c] as number) + 0.03 * f);
          if ((this.wet[c] as number) > 1.0) puddle = true;
        }
      }
    return { fixed, puddle };
  }

  /** 捡：离 (u, v) r 米以内还没捡的东西都捡起来，返回捡到的 */
  pick(u: number, v: number, r: number): LitterItem[] {
    const got: LitterItem[] = [];
    for (const it of this.litter) {
      if (it.taken || Math.hypot(it.u - u, it.v - v) > r) continue;
      it.taken = true;
      got.push(it);
    }
    return got;
  }

  /** 离 (u, v) 最近的线（还有褪了的格子的线优先不管：吸住哪条都能画） */
  nearest(u: number, v: number, only = -1): { s: number; d: number; p: number } {
    let best = { s: -1, d: Number.POSITIVE_INFINITY, p: 0 };
    this.segs.forEach((g, s) => {
      if (only >= 0 && s !== only) return;
      const perp = g.axis === 'u' ? v : u;
      const par = g.axis === 'u' ? u : v;
      const over = Math.max(0, g.a - par, par - g.b);
      const d = Math.hypot(perp - g.c, over);
      if (d < best.d) best = { s, d, p: Math.max(g.a, Math.min(g.b, par)) };
    });
    return best;
  }

  /** 沿线 s 从 p0 画到 p1；q 2 好、3 抖。原本就好的格子不动。返回新画了几格、几格脏了 */
  paintSeg(s: number, p0: number, p1: number, q: 2 | 3): { fresh: number; dirty: number } {
    const g = this.segs[s] as Seg;
    const k0 = Math.max(0, Math.min(g.n - 1, Math.round((Math.min(p0, p1) - g.a) / TS)));
    const k1 = Math.max(0, Math.min(g.n - 1, Math.round((Math.max(p0, p1) - g.a) / TS)));
    let fresh = 0;
    let dirty = 0;
    for (let k = k0; k <= k1; k++) {
      const cur = g.cov[k] as number;
      if (cur === 0 || cur === 2 || (cur === 3 && q === 3)) continue;
      const par = g.a + k * TS;
      const c = g.axis === 'u' ? this.cell(par, g.c) : this.cell(g.c, par);
      if (c >= 0 && (this.sand[c] as number) > 0.3) {
        if (cur !== 4) dirty++;
        g.cov[k] = 4;
        continue;
      }
      g.cov[k] = q;
      fresh++;
    }
    return { fresh, dirty };
  }

  /** 画歪了：在 (u, v) 点一块擦不掉的白（沙上是脏的） */
  strayAt(u: number, v: number): void {
    for (let y = v - 0.3; y <= v + 0.3; y += TS)
      for (let x = u - 0.3; x <= u + 0.3; x += TS) {
        if (Math.hypot(x - u, y - v) > 0.3) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c] || (this.segOf[c] as number) >= 0) continue;
        this.stray[c] = (this.sand[c] as number) > 0.3 ? 2 : 1;
      }
  }

  /** 这块场的网没法由小游戏接管（画不了能拉的网）：网不算进线那一项，也不给挂网的工具 */
  dropNet(): void {
    this.net.score0 = 100;
    this.net.score = 100;
    const i = this.tools.indexOf('net');
    if (i >= 0) this.tools.splice(i, 1);
  }

  /** 挂网：松手时的张力 */
  setNet(t: number, target = 0.72): number {
    this.net.t = t;
    this.net.score = netScore(t, target);
    return this.net.score;
  }

  /** 阵风：从上风那边吹进一层沙（side +1 从 -u 那头吹来） */
  gust(side: 1 | -1, rnd: Rand, k = 1): void {
    const G = this.G;
    const amt = 0.3 + this.start.sand;
    for (let n = 0; n < 200 * k; n++) {
      const t = rnd() ** 2;
      const u = side > 0 ? -G.hx + t * G.hx * 1.3 : G.hx - t * G.hx * 1.3;
      const v = -G.hz + rnd() * G.hz * 2;
      const c = this.cell(u, v);
      if (c >= 0 && this.inside[c])
        this.sand[c] = Math.min(2.5, (this.sand[c] as number) + (0.04 + 0.08 * (1 - t)) * amt);
    }
  }

  /** 收尾：剩下的一口气清掉，返回清掉的格子（画粒子用，最多 cap 个） */
  finish(field: 'sand' | 'wet' | 'rough', cap = 400): number[] {
    const A = field === 'sand' ? this.sand : field === 'wet' ? this.wet : this.rough;
    const out: number[] = [];
    for (let c = 0; c < this.N; c++)
      if (this.inside[c] && (A[c] as number) > 0) {
        if ((A[c] as number) > 0.15 && out.length < cap) out.push(c);
        A[c] = 0;
      }
    if (field === 'sand') {
      for (const g of this.segs) for (let k = 0; k < g.n; k++) if (g.cov[k] === 4) g.cov[k] = 1;
      for (let c = 0; c < this.N; c++) if (this.stray[c] === 2) this.stray[c] = 0;
    }
    return out;
  }

  /** 测试、截图钩子：按比例 q 一口气清掉（只是画面上的捷径，结果照样按剩下的算） */
  cheat(q: number, rnd: Rand): void {
    for (let c = 0; c < this.N; c++)
      if (rnd() < q) {
        this.sand[c] = 0;
        this.wet[c] = 0;
        this.rough[c] = 0;
      }
    for (const g of this.segs) for (let k = 0; k < g.n; k++) if (g.cov[k] === 1 && rnd() < q) g.cov[k] = 2;
    for (const it of this.litter) if (rnd() < q) it.taken = true;
    if (q > 0.5) this.setNet(0.72);
  }
}
