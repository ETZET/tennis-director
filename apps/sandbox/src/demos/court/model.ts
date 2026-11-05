import type { CourtFrame } from '@td/iso';
import { hash } from '@td/iso';
import type { Rand } from '@td/shared';

/**
 * 场地养护 demo 的数值：一块球场上的沙、坑洼裂缝、湿度、白线、杂草、球网。
 * 网格和地面贴图的纹素对齐（0.2 米、Palm Oasis 的地台西北角 (-80, -56)），画出来和真地面一个像素格。
 * 只管数，不碰画面；演出（扫把、粒子）读它的返回值。场地的局部坐标 u 沿长边、v 沿球网（场地都是不转的）。
 */

export const TS = 0.2;
const SLAB_X0 = -80;
const SLAB_Z0 = -56;

/** 网球场的线（米） */
export const LINE = { L: 11.885, Wd: 5.485, Ws: 4.115, sv: 6.4, lw: 0.16 } as const;

export type Kind = 'member' | 'clay' | 'practice';

export interface CourtCfg {
  facility: string;
  frame: CourtFrame;
  kind: Kind;
  name: string;
  label: string;
  /** 客人几秒后到 */
  T: number;
  /** 最多等几秒 */
  pat: number;
  guests: number;
  /** 订金倍数 */
  fee: number;
  cracks: number;
  bumps: number;
  patches: number;
  weeds: number;
  sand: number;
  gusts: number;
  story: string;
  tools: readonly Tool[];
  ruinState: string;
  freshState: string;
  /** 门口（世界坐标）：门外等人的地方、门里一步 */
  gateOut: { x: number; z: number };
  gateIn: { x: number; z: number };
  /** 客人从哪儿走来（世界坐标，画面外） */
  from: { x: number; z: number };
  /** 一天中的分钟（光线） */
  minute: number;
}

export type Tool = 'broom' | 'roller' | 'paint' | 'net' | 'water';

/** 一条白线：axis 'u' 沿长边（v = c 不变），'v' 沿球网方向（u = c 不变） */
export interface Seg {
  axis: 'u' | 'v';
  c: number;
  a: number;
  b: number;
  n: number;
  /** 0 没画、1 画好、2 有点抖、3 画在沙上（脏） */
  cov: Uint8Array;
  /** 旧线残影 */
  ghost: Uint8Array;
}

export interface Weed {
  u: number;
  v: number;
  hp: number;
  shake: number;
}

export interface Measure {
  F: number;
  L: number;
  C: number;
  N: number;
  Q: number;
  weeds: number;
  stray: number;
  /** 沙子剩多少（0..1，不算杂草） */
  sandLeft: number;
  roughLeft: number;
}

export const TIERS = [
  { min: 90, g: 'S', p: 60 },
  { min: 75, g: 'A', p: 45 },
  { min: 55, g: 'B', p: 32 },
  { min: 35, g: 'C', p: 20 },
  { min: -1, g: 'D', p: 10 },
] as const;
export type Tier = (typeof TIERS)[number];
export const tierOf = (q: number): Tier => TIERS.find((t) => q >= t.min) ?? TIERS[4];

const clamp = (v: number, a = 0, b = 100) => (v < a ? a : Math.min(v, b));

export class CourtModel {
  readonly F: CourtFrame;
  readonly clay: boolean;
  readonly nx: number;
  readonly nz: number;
  /** 第 0 格西北角的世界坐标 */
  readonly gx0: number;
  readonly gz0: number;
  readonly N: number;
  readonly inside: Uint8Array;
  readonly sand: Float32Array;
  readonly rough: Float32Array;
  readonly crack: Uint8Array;
  readonly moist: Float32Array;
  /** 画歪的线：1 白、2 脏 */
  readonly stray: Uint8Array;
  /** 格子落在哪条线上（-1 不在）、线上第几格 */
  readonly segOf: Int8Array;
  readonly segP: Int16Array;
  /** 线旁边一圈（引导线画宽一点，手机上看得清）：线号，-1 不在 */
  readonly segNear: Int8Array;
  readonly segs: Seg[] = [];
  readonly weeds: Weed[] = [];
  readonly net = { hung: false, t: 0, score: 0 };
  sandInit = 1;
  roughInit = 1;
  lineTotal = 1;

  constructor(
    readonly cfg: CourtCfg,
    rnd: Rand,
  ) {
    const F = cfg.frame;
    this.F = F;
    this.clay = cfg.kind === 'clay';
    this.gx0 = SLAB_X0 + Math.floor((F.ox - F.hx - SLAB_X0) / TS) * TS;
    this.gz0 = SLAB_Z0 + Math.floor((F.oz - F.hz - SLAB_Z0) / TS) * TS;
    this.nx = Math.ceil((F.ox + F.hx - this.gx0) / TS);
    this.nz = Math.ceil((F.oz + F.hz - this.gz0) / TS);
    const N = this.nx * this.nz;
    this.N = N;
    this.inside = new Uint8Array(N);
    this.sand = new Float32Array(N);
    this.rough = new Float32Array(N);
    this.crack = new Uint8Array(N);
    this.moist = new Float32Array(N);
    this.stray = new Uint8Array(N);
    this.segOf = new Int8Array(N).fill(-1);
    this.segP = new Int16Array(N);
    this.segNear = new Int8Array(N).fill(-1);
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const u = this.cu(i);
        const v = this.cv(j);
        if (Math.abs(u) <= F.hx - 0.1 && Math.abs(v) <= F.hz - 0.1) this.inside[j * this.nx + i] = 1;
      }
    this.buildLines(rnd);
    this.generate(rnd);
  }

  /** 格子中心的局部坐标 */
  cu(i: number): number {
    return this.gx0 + (i + 0.5) * TS - this.F.ox;
  }
  cv(j: number): number {
    return this.gz0 + (j + 0.5) * TS - this.F.oz;
  }
  /** 局部坐标 → 格子（出界 -1） */
  cell(u: number, v: number): number {
    const i = Math.floor((u + this.F.ox - this.gx0) / TS);
    const j = Math.floor((v + this.F.oz - this.gz0) / TS);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  inCourt(u: number, v: number, m = 0): boolean {
    return Math.abs(u) <= this.F.hx - m && Math.abs(v) <= this.F.hz - m;
  }

  private buildLines(rnd: Rand): void {
    const { L, Wd, Ws, sv } = LINE;
    const defs: [Seg['axis'], number, number, number][] = [
      ['v', -L, -Wd, Wd],
      ['v', L, -Wd, Wd],
      ['u', -Wd, -L, L],
      ['u', Wd, -L, L],
      ['u', -Ws, -L, L],
      ['u', Ws, -L, L],
      ['v', -sv, -Ws, Ws],
      ['v', sv, -Ws, Ws],
      ['u', 0, -sv, sv],
      ['u', 0, -L, -L + 0.45],
      ['u', 0, L - 0.45, L],
    ];
    for (const [axis, c, a, b] of defs) {
      const n = Math.round((b - a) / TS) + 1;
      const ghost = new Uint8Array(n);
      let on = true;
      let run = 3 + Math.floor(rnd() * 12);
      for (let k = 0; k < n; k++) {
        if (on && rnd() < 0.85) ghost[k] = 1;
        if (--run <= 0) {
          on = !on;
          run = on ? 4 + Math.floor(rnd() * 12) : 2 + Math.floor(rnd() * 6);
        }
      }
      this.segs.push({ axis, c, a, b, n, cov: new Uint8Array(n), ghost });
    }
    this.lineTotal = this.segs.reduce((s, g) => s + g.n, 0);
    // 每个格子属于哪条线（照 paintCourt 的判定：半宽 lw）
    const lw = LINE.lw;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const u = this.cu(i);
        const v = this.cv(j);
        for (let s = 0; s < this.segs.length; s++) {
          const g = this.segs[s];
          const perp = g.axis === 'u' ? v : u;
          const par = g.axis === 'u' ? u : v;
          const c = j * this.nx + i;
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
  }

  private generate(rnd: Rand): void {
    const R = (a: number, b: number) => a + rnd() * (b - a);
    const F = this.F;
    const cfg = this.cfg;
    const nx = this.nx;
    const hx = F.hx - 0.4;
    const hz = F.hz - 0.4;
    const disc = (cu: number, cv: number, r: number, fn: (c: number, d: number) => void) => {
      for (let v = cv - r; v <= cv + r; v += TS)
        for (let u = cu - r; u <= cu + r; u += TS) {
          const d = Math.hypot(u - cu, v - cv) / r;
          if (d > 1 || !this.inCourt(u, v)) continue;
          const c = this.cell(u, v);
          if (c >= 0) fn(c, d);
        }
    };
    // 裂缝：随机游走，偶尔分叉
    const crackCells: number[] = [];
    const stack: [number, number, number, number][] = [];
    for (let k = 0; k < cfg.cracks; k++) stack.push([R(-hx, hx), R(-hz, hz), R(0, 6.28), Math.floor(R(16, 44))]);
    while (stack.length) {
      let [u, v, a, n] = stack.pop() as [number, number, number, number];
      for (let st = 0; st < n; st++) {
        u += Math.cos(a) * TS;
        v += Math.sin(a) * TS;
        a += R(-0.4, 0.4);
        if (!this.inCourt(u, v, 0.3)) break;
        const c = this.cell(u, v);
        if (c < 0) break;
        this.rough[c] = 1;
        this.crack[c] = 1;
        crackCells.push(c);
        if (rnd() < 0.3 && c + 1 < this.N) {
          this.rough[c + 1] = Math.max(this.rough[c + 1], 0.6);
          this.crack[c + 1] = 1;
        }
        if (rnd() < 0.04 && stack.length < 40) stack.push([u, v, a + R(-1.2, 1.2), Math.floor(R(5, 14))]);
      }
    }
    // 鼓包、大片的老化
    for (let k = 0; k < cfg.bumps; k++) {
      const r = this.clay ? R(0.9, 1.6) : R(0.6, 1.2);
      disc(R(-hx, hx), R(-hz, hz), r, (c, d) => {
        this.rough[c] = Math.max(this.rough[c], 0.85 * (1 - d * d));
      });
    }
    for (let k = 0; k < cfg.patches; k++) {
      disc(R(-hx, hx), R(-hz, hz), R(1.6, 3), (c, d) => {
        if (hash(c, 7, 31) < 0.75) this.rough[c] = Math.max(this.rough[c], 0.32 * (1 - d * 0.7));
      });
    }
    // 沙：一个角吹进来一大片，再加几个沙堆
    const cu = rnd() < 0.5 ? -F.hx : F.hx;
    const cv0 = -F.hz;
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        if (!this.inside[c]) continue;
        const u = this.cu(i);
        const v = this.cv(j);
        const drift = Math.exp(-(Math.abs(u - cu) + Math.abs(v - cv0)) / 6.5);
        this.sand[c] = (0.14 + hash(i, j, 3) * 0.12 + 1.4 * drift) * cfg.sand;
      }
    const blobs = 6 + Math.floor(rnd() * 4);
    for (let k = 0; k < blobs; k++) {
      const bu = R(-hx, hx);
      const bv = R(-hz, hz);
      const r = R(2, 4.2);
      const h = R(0.6, 1.4) * cfg.sand;
      for (let v = bv - r; v <= bv + r; v += TS)
        for (let u = bu - r; u <= bu + r; u += TS) {
          const d = Math.hypot(u - bu, (v - bv) * 1.3) / r;
          if (d > 1) continue;
          const c = this.cell(u, v);
          if (c >= 0 && this.inside[c]) this.sand[c] = Math.min(2.6, this.sand[c] + h * (1 - d * d) ** 1.5);
        }
    }
    // 杂草：大多长在裂缝里
    for (let k = 0; k < cfg.weeds; k++) {
      let u: number;
      let v: number;
      if (crackCells.length && rnd() < 0.8) {
        const c = crackCells[Math.floor(rnd() * crackCells.length)];
        u = this.cu(c % nx);
        v = this.cv(Math.floor(c / nx));
      } else {
        u = R(-hx, hx);
        v = R(-hz, hz);
      }
      this.weeds.push({ u, v, hp: 1, shake: 0 });
    }
    let sd = 0;
    let rf = 0;
    for (let c = 0; c < this.N; c++) {
      if (!this.inside[c]) {
        this.sand[c] = 0;
        this.rough[c] = 0;
        this.crack[c] = 0;
        continue;
      }
      sd += Math.max(0, this.sand[c] - 0.03);
      rf += this.rough[c];
    }
    this.sandInit = Math.max(1, sd);
    this.roughInit = Math.max(1, rf);
  }

  measure(): Measure {
    let sd = 0;
    let rf = 0;
    let stray = 0;
    for (let c = 0; c < this.N; c++) {
      if (!this.inside[c]) continue;
      sd += Math.max(0, this.sand[c] - 0.03);
      rf += this.rough[c];
      if (this.stray[c] === 1) stray++;
    }
    let cov = 0;
    for (const g of this.segs) for (let k = 0; k < g.n; k++) cov += g.cov[k] === 1 ? 1 : g.cov[k] === 2 ? 0.6 : 0;
    const weeds = this.weeds.filter((w) => w.hp > 0).length;
    const sandLeft = sd / this.sandInit;
    const roughLeft = rf / this.roughInit;
    const C = clamp(100 * (1 - sandLeft) * 1.03 - weeds * 3);
    const Fv = clamp(100 * (1 - roughLeft) * 1.03);
    const L = clamp(((100 * cov) / this.lineTotal) * 1.02 - stray * 0.5);
    const N = this.net.hung ? this.net.score : 0;
    const Q = Math.round(0.3 * Fv + 0.3 * L + 0.25 * C + 0.15 * N);
    return {
      F: Math.round(Fv),
      L: Math.round(L),
      C: Math.round(C),
      N: Math.round(N),
      Q,
      weeds,
      stray,
      sandLeft,
      roughLeft,
    };
  }

  /* ---------------- 工具 ---------------- */

  /** 扫把在 (u, v) 往 (du, dv) 推：沙子堆到前面，推出围栏就没了 */
  sweep(
    u: number,
    v: number,
    du: number,
    dv: number,
    R = 1.6,
  ): { moved: number; out: number; hit: Weed[]; pulled: Weed[] } {
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
        // 厚沙堆推不动那么多（推着一大堆走会从两边漏）
        const s0 = this.sand[c];
        const t = s0 * (s0 > 1.6 ? 0.32 : 0.6) * (1 - (d / R) * 0.25);
        if (t > 0.002) {
          this.sand[c] -= t;
          takes.push(x, y, t);
          moved += t;
        }
        if (this.sand[c] < 0.05) this.sand[c] = 0;
        if (this.stray[c] === 2) this.stray[c] = 0;
        const s = this.segOf[c];
        if (s >= 0) {
          const g = this.segs[s];
          if (g.cov[this.segP[c]] === 3) g.cov[this.segP[c]] = 0;
        }
      }
    // 大部分推到前面，一成多从扫把两头漏到边上（扫过的带子两边留一道沙梗，要搭着扫）
    const px = -dv;
    const pz = du;
    for (let k = 0; k < takes.length; k += 3) {
      const x = takes[k];
      const y = takes[k + 1];
      const t = takes[k + 2];
      const side = (x - u) * px + (y - v) * pz;
      const spill = Math.abs(side) > R * 0.55 ? 0.35 : 0.08;
      const c = this.cell(x + du * off, y + dv * off);
      if (c >= 0 && this.inside[c]) this.sand[c] = Math.min(4, this.sand[c] + t * (1 - spill));
      else out += t * (1 - spill);
      const sgn = side >= 0 ? 1 : -1;
      const c2 = this.cell(x + du * off * 0.5 + px * sgn * R * 0.5, y + dv * off * 0.5 + pz * sgn * R * 0.5);
      if (c2 >= 0 && this.inside[c2]) this.sand[c2] = Math.min(4, this.sand[c2] + t * spill);
      else out += t * spill;
    }
    const hit: Weed[] = [];
    const pulled: Weed[] = [];
    for (const w of this.weeds) {
      if (w.hp <= 0 || Math.hypot(w.u - u, w.v - v) > R) continue;
      w.hp -= 0.05;
      w.shake = 0.2;
      if (w.hp <= 0) pulled.push(w);
      else hit.push(w);
    }
    return { moved, out, hit, pulled };
  }

  /** 压路机：压平坑洼和裂缝。沙上压不实；红土太干压不动、太湿压出泥坑 */
  roll(u: number, v: number, R = 1.2): { crack: boolean; sandy: boolean; dry: boolean; mud: boolean; done: number } {
    let crack = false;
    let sandy = false;
    let dry = false;
    let mud = false;
    let done = 0;
    for (let y = v - R; y <= v + R; y += TS)
      for (let x = u - R; x <= u + R; x += TS) {
        const d = Math.hypot(x - u, y - v);
        if (d > R) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c]) continue;
        let eff = 1;
        if (this.sand[c] > 0.4) {
          eff = 0.25;
          sandy = true;
        }
        if (this.clay) {
          const m = this.moist[c];
          if (m < 0.25) {
            eff *= 0.12;
            dry = true;
          } else if (m > 1.3) {
            this.rough[c] = Math.min(0.9, this.rough[c] + 0.035);
            mud = true;
            continue;
          }
        }
        const b = this.rough[c];
        if (b <= 0) continue;
        if (this.crack[c] && b > 0.5) crack = true;
        this.rough[c] = Math.max(0, b - 0.032 * eff * (1 - (d / R) * 0.5));
        if (this.rough[c] < 0.05) {
          this.rough[c] = 0;
          done++;
        }
      }
    return { crack, sandy, dry, mud, done };
  }

  /** 洒水（红土） */
  water(u: number, v: number, R = 1.5): boolean {
    let pud = false;
    for (let y = v - R; y <= v + R; y += TS)
      for (let x = u - R; x <= u + R; x += TS) {
        const d = Math.hypot(x - u, y - v);
        if (d > R) continue;
        const c = this.cell(x, y);
        if (c < 0 || !this.inside[c]) continue;
        this.moist[c] = Math.min(2, this.moist[c] + 0.09 * (1 - d / R));
        if (this.moist[c] > 1.4) pud = true;
      }
    return pud;
  }

  /** 沙漠里水干得快 */
  dry(dt: number): void {
    if (!this.clay) return;
    const m = this.moist;
    for (let c = 0; c < this.N; c++) if (m[c] > 0) m[c] = Math.max(0, m[c] - dt * 0.05);
  }

  /** 离 (u, v) 最近的线：垂直距离 d（超出线段两头的部分也算进去）、线上的位置 p */
  nearest(u: number, v: number, only = -1): { s: number; d: number; p: number } {
    let best = { s: -1, d: Number.POSITIVE_INFINITY, p: 0 };
    this.segs.forEach((g, s) => {
      if (only >= 0 && s !== only) return;
      // 发球中线的两小截（中点标记）太短，描底线时别吸上去
      const perp = g.axis === 'u' ? v : u;
      const par = g.axis === 'u' ? u : v;
      const over = Math.max(0, g.a - par, par - g.b);
      const d = Math.hypot(perp - g.c, over);
      if (d < best.d) best = { s, d, p: Math.max(g.a, Math.min(g.b, par)) };
    });
    return best;
  }

  /** 沿线 s 从 p0 画到 p1；q 1 好、2 抖。返回新画了几格、几格脏了 */
  paintSeg(s: number, p0: number, p1: number, q: 1 | 2): { fresh: number; dirty: number } {
    const g = this.segs[s];
    const k0 = Math.max(0, Math.min(g.n - 1, Math.round((Math.min(p0, p1) - g.a) / TS)));
    const k1 = Math.max(0, Math.min(g.n - 1, Math.round((Math.max(p0, p1) - g.a) / TS)));
    let fresh = 0;
    let dirty = 0;
    for (let k = k0; k <= k1; k++) {
      const par = g.a + k * TS;
      const c = g.axis === 'u' ? this.cell(par, g.c) : this.cell(g.c, par);
      const sandy = c >= 0 && this.sand[c] > 0.3;
      const cur = g.cov[k];
      if (sandy) {
        if (cur !== 1) {
          g.cov[k] = 3;
          dirty++;
        }
        continue;
      }
      if (cur === 1 || (cur === 2 && q === 2)) continue;
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
        if (c < 0 || !this.inside[c] || this.segOf[c] >= 0) continue;
        this.stray[c] = this.sand[c] > 0.3 ? 2 : 1;
      }
  }

  /** 阵风：从上风那边吹进一层沙 */
  gust(side: 1 | -1, rnd: Rand, k = 1): void {
    const F = this.F;
    for (let n = 0; n < 220 * k; n++) {
      const t = rnd() ** 2;
      const u = side > 0 ? -F.hx + t * F.hx * 1.3 : F.hx - t * F.hx * 1.3;
      const v = -F.hz + rnd() * F.hz * 2;
      const c = this.cell(u, v);
      // 上风那边的围网脚下积得最厚
      if (c >= 0 && this.inside[c]) this.sand[c] = Math.min(2.5, this.sand[c] + (0.05 + 0.1 * (1 - t)) * this.cfg.sand);
    }
  }

  /** 收尾：剩下的薄沙一口气清掉。返回清掉的格子（画粒子用） */
  finishSand(): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.N; c++)
      if (this.inside[c] && this.sand[c] > 0) {
        if (this.sand[c] > 0.2 && out.length < 400) out.push(c);
        this.sand[c] = 0;
      }
    for (const g of this.segs) for (let k = 0; k < g.n; k++) if (g.cov[k] === 3) g.cov[k] = 0;
    for (let c = 0; c < this.N; c++) if (this.stray[c] === 2) this.stray[c] = 0;
    return out;
  }

  /** 收尾：剩下的小坑一口气压平 */
  finishRough(): number[] {
    const out: number[] = [];
    for (let c = 0; c < this.N; c++)
      if (this.rough[c] > 0) {
        if (this.rough[c] > 0.15 && out.length < 200) out.push(c);
        this.rough[c] = 0;
      }
    return out;
  }

  /** 测试钩子：一口气修到 q */
  cheat(q: number, rnd: Rand): void {
    for (let c = 0; c < this.N; c++)
      if (rnd() < q) {
        this.sand[c] = 0;
        this.rough[c] = 0;
      }
    for (const g of this.segs) for (let k = 0; k < g.n; k++) if (rnd() < q) g.cov[k] = 1;
    for (const w of this.weeds) if (rnd() < q) w.hp = 0;
    if (q > 0.5) {
      this.net.hung = true;
      this.net.t = 0.72;
      this.net.score = Math.round(60 + 40 * q);
    }
  }
}
