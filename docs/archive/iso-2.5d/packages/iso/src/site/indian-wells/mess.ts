import { mulberry32 } from '@td/shared';
import { MESS_PROPS, type MessProp } from '../../art/props/mess';
import { bakeArt } from '../../core/art';
import { clamp, fbm, hash, mixP, mulP, nightP, ph, vnoise } from '../../core/color';
import { Custom, type DrawContext, Group } from '../../core/graph';
import type { Raster } from '../../core/raster';
import type { CourtMessLook } from '../site';
import { C, type CourtKind, type CourtLook, CP, courtLook, PICK4, SLAB } from './ground';
import { F_O1, F_O2, F_O3, F_P1, F_P2, F_PB1, F_PB2, F_S1 } from './layout';
import type { Facilities, Facility } from './state';

/**
 * 场地可用度的画面（court-care-contract.md，ADR 0022）：开着的五处球场上的短期脏乱——
 * 积沙、积水（红土：深色湿泥和小水洼）、球和垃圾、褪色的线（红土：线带被红土盖住）、裂缝（红土：发白的干裂斑块）。
 *
 * 照 sandbox 场地养护 demo（apps/sandbox/src/demos/court/draw.ts）的画法：一块场一个贴地的 Custom 叠层，
 * 格子和地面贴图的纹素对齐（0.2 米，地台西北角起算），逐像素反投影到格子上混色，走深度缓冲（前面的围网、灯杆挡着的不画）。
 * 和长期磨损（wear.ts：杂草、旧面斑驳）分开画，两个信号不长成一个样子。
 *
 * 分布每块场固定（自己的种子随机流和值噪声，不碰 Math.random 和模拟）：每个格子、每件垃圾、每道裂缝都有自己的门槛，
 * 量越大铺得越开（和 wear.ts 一样），所以量连续变化时画面连续、不跳。量按 MESS_STEP 量化，没跨档不重烘静态层。
 * 只画，不改数。
 */

export const MESS_KEYS = ['sand', 'water', 'litter', 'lines', 'cracks'] as const;
/** 每项量化的步长：变化没跨档就不重画（游戏每帧都传 s.care[f].mess） */
export const MESS_STEP = 0.02;
const TS = 0.2;

/** 量化（截在 0..1，非有限数当 0）；全是 0 返回 null（不画） */
export function quantMess(m: CourtMessLook | null): CourtMessLook | null {
  if (!m) return null;
  const q = (v: number) => (Number.isFinite(v) ? Math.round(clamp(v, 0, 1) / MESS_STEP) * MESS_STEP : 0);
  const o = { sand: q(m.sand), water: q(m.water), litter: q(m.litter), lines: q(m.lines), cracks: q(m.cracks) };
  return o.sand || o.water || o.litter || o.lines || o.cracks ? o : null;
}

const sameMess = (a: CourtMessLook | null, b: CourtMessLook | null): boolean =>
  a === b || (!!a && !!b && MESS_KEYS.every((k) => a[k] === b[k]));

/* ---------------- 每处设施画出来的球场 ---------------- */

/** 一块要画脏乱的场地：世界范围（不转的矩形）、场线尺寸（照 ground.ts 的 paintCourt）、面 */
export interface MessCourtSpec {
  readonly key: string;
  readonly ox: number;
  readonly oz: number;
  /** 世界 x / z 方向的半宽 */
  readonly hx: number;
  readonly hz: number;
  /** 场地沿 z 放（局部 u、v 对调） */
  readonly rot: boolean;
  readonly kind: CourtKind;
  readonly look: CourtLook;
  readonly clay: boolean;
  readonly pick: boolean;
  readonly L: number;
  readonly Wd: number;
  readonly Ws: number;
  readonly sv: number;
  readonly kit: number;
}

type Dims = Pick<MessCourtSpec, 'L' | 'Wd' | 'Ws' | 'sv' | 'kit'>;
const TENNIS: Dims = { L: 11.885, Wd: 5.485, Ws: 4.115, sv: 6.4, kit: 2.13 };
const PICKLE_D: Dims = { L: 6.705, Wd: 3.05, Ws: 4.115, sv: 6.4, kit: 2.13 };
const TENNIS2: Dims = { L: 7.3, Wd: 3.35, Ws: 2.55, sv: 3.95, kit: 2.13 };
const PICK4_D: Dims = { L: 3.7, Wd: 1.75, Ws: 4.115, sv: 6.4, kit: 1.1 };

/** 有可用度的五处球场（court-care-contract.md「球场」） */
export const MESS_FACILITIES = ['outer_1', 'outer_23', 'practice', 'stadium_1', 'stadium_3'] as const;

const spec = (
  F: { ox: number; oz: number; hx: number; hz: number },
  kind: CourtKind,
  look: CourtLook,
  d: Dims,
  rot = false,
): MessCourtSpec => {
  const pick = kind === 'pickle' || kind === 'pickleB';
  return {
    key: `${F.ox},${F.oz},${F.hx},${F.hz},${rot ? 1 : 0},${kind},${look}`,
    ox: F.ox,
    oz: F.oz,
    hx: F.hx,
    hz: F.hz,
    rot,
    kind,
    look,
    clay: kind === 'clay',
    pick,
    ...d,
  };
};

/**
 * 这处设施现在画出来的球场（设施修好、开着的那一档才有；面和场线按变体）。不是球场的设施、没修好的返回空表。
 * 和 ground.ts 画场地用同一套判定，所以褪色的线正好压在贴图的白线上。
 */
export function messCourts(fac: Facilities, f: string): MessCourtSpec[] {
  if (!(MESS_FACILITIES as readonly string[]).includes(f)) return [];
  const fa = f as Facility;
  if (!fac.fresh(fa)) return [];
  const look = courtLook(fac, fa);
  switch (fa) {
    case 'outer_1':
      return [spec(F_O1, 'member', look, TENNIS)];
    case 'outer_23': {
      const hard = fac.variant('outer_23') === 'hard';
      const kind: CourtKind = hard ? (fac.up('outer_23', 'pro_hard') ? 'hardPro' : 'hard') : 'clay';
      return [spec(F_O2, kind, look, TENNIS), spec(F_O3, kind, look, TENNIS)];
    }
    case 'practice':
      return [spec(F_P1, 'practice', look, TENNIS), spec(F_P2, 'practice', look, TENNIS)];
    case 'stadium_1':
      return [spec(F_S1, 'center', look, TENNIS)];
    case 'stadium_3': {
      const v = fac.variant('stadium_3');
      if (v === 'tennis2') return [F_PB1, F_PB2].map((F) => spec(F, 'tennis2', look, TENNIS2));
      if (v === 'pickle4')
        return PICK4.map(([x, z], i) =>
          spec({ ox: x, oz: z, hx: 4, hz: 4.4 }, i === 0 || i === 3 ? 'pickle' : 'pickleB', look, PICK4_D, true),
        );
      return [F_PB1, F_PB2].map((F) => spec(F, 'pickle', look, PICKLE_D));
    }
    default:
      return [];
  }
}

/** 场线判定（照 ground.ts 的 paintCourt：半宽 0.16 米） */
function onLine(s: MessCourtSpec, x: number, z: number): boolean {
  const u = s.rot ? z - s.oz : x - s.ox;
  const v = s.rot ? x - s.ox : z - s.oz;
  const au = Math.abs(u);
  const av = Math.abs(v);
  const lw = 0.16;
  const { L, Wd, Ws, sv, kit } = s;
  let ln = (Math.abs(au - L) < lw && av <= Wd + lw) || (Math.abs(av - Wd) < lw && au <= L + lw);
  if (!s.pick)
    ln =
      ln ||
      (Math.abs(av - Ws) < lw && au <= L) ||
      (Math.abs(au - sv) < lw && av <= Ws) ||
      (av < lw && au <= sv) ||
      (av < lw && au > L - 0.45 && au <= L);
  else ln = ln || (Math.abs(au - kit) < lw && av <= Wd) || (av < lw && au >= kit && au <= L);
  return ln;
}

/** 这一格没画线时的场地色（照 paintCourt 的 fresh / faded，含同样的纹素抖动）：线褪掉、被盖住以后露出来的颜色 */
function courtBase(s: MessCourtSpec, x: number, z: number): number {
  const pal = CP[s.kind];
  const u = s.rot ? z - s.oz : x - s.ox;
  const v = s.rot ? x - s.ox : z - s.oz;
  const au = Math.abs(u);
  const av = Math.abs(v);
  const inside = au <= s.L && av <= s.Wd;
  let c = ph(inside ? pal.i : pal.o);
  if (s.pick && inside && au < s.kit) c = mulP(c, 0.88);
  const n = hash(Math.floor(x * 5), Math.floor(z * 5), (s.ox * 7 + s.oz * 13) | 0);
  if (s.look === 'fresh') return s.clay ? mulP(c, 0.95 + n * 0.1) : mulP(c, 0.97 + n * 0.05);
  const base = mixP(c, C.faded, s.look === 'faded' ? 0.22 : s.clay ? 0.32 : 0.4);
  return mulP(base, 0.94 + n * 0.08);
}

/* ---------------- 一块场的格子和固定分布 ---------------- */

interface Piece {
  x: number;
  z: number;
  prop: MessProp;
  thr: number;
}

/**
 * 一块场的格子（和地面纹素对齐）和每格的门槛。门槛 0..1 是这一格在全场里排第几（百分位），
 * 所以"量 a 时铺开多大一片"只看 a，跟噪声的分布无关。
 */
export class MessGrid {
  readonly nx: number;
  readonly nz: number;
  /** 第 0 格西北角的世界坐标 */
  readonly gx0: number;
  readonly gz0: number;
  readonly N: number;
  readonly inside: Uint8Array;
  /** 沙从哪儿先积起来（西边围网根、底线、几堆沙丘） */
  readonly sandT: Float32Array;
  /** 积水先积在哪儿（低洼） */
  readonly wetT: Float32Array;
  /** 红土：先晒干开裂的斑块 */
  readonly dryT: Float32Array;
  /** 红土干裂斑块里的龟裂纹 */
  readonly dryNet: Uint8Array;
  /** 白线格（1）和它先褪的门槛 */
  readonly line: Uint8Array;
  readonly lineT: Float32Array;
  /** 线褪掉以后露出来的场地色（打包色，白天） */
  readonly base: Uint32Array;
  /** 硬地裂缝：第几道（-1 不是）、在这道上的位置 0..1、是不是边上的崩口 */
  readonly crackK: Int16Array;
  readonly crackP: Float32Array;
  readonly crackChip: Uint8Array;
  /** 每道裂缝的门槛 */
  readonly crackThr: number[] = [];
  readonly pieces: Piece[] = [];

  constructor(readonly s: MessCourtSpec) {
    const i0 = Math.floor((s.ox - s.hx - SLAB.x0) / TS + 1e-6);
    const i1 = Math.ceil((s.ox + s.hx - SLAB.x0) / TS - 1e-6);
    const j0 = Math.floor((s.oz - s.hz - SLAB.z0) / TS + 1e-6);
    const j1 = Math.ceil((s.oz + s.hz - SLAB.z0) / TS - 1e-6);
    this.nx = i1 - i0;
    this.nz = j1 - j0;
    this.gx0 = SLAB.x0 + i0 * TS;
    this.gz0 = SLAB.z0 + j0 * TS;
    const N = this.nx * this.nz;
    this.N = N;
    this.inside = new Uint8Array(N);
    this.sandT = new Float32Array(N);
    this.wetT = new Float32Array(N);
    this.dryT = new Float32Array(N);
    this.dryNet = new Uint8Array(N);
    this.line = new Uint8Array(N);
    this.lineT = new Float32Array(N);
    this.base = new Uint32Array(N);
    this.crackK = new Int16Array(N).fill(-1);
    this.crackP = new Float32Array(N);
    this.crackChip = new Uint8Array(N);
    this.generate();
  }

  cx(i: number): number {
    return this.gx0 + (i + 0.5) * TS;
  }
  cz(j: number): number {
    return this.gz0 + (j + 0.5) * TS;
  }
  /** 世界坐标 → 格子（出界 -1） */
  cell(x: number, z: number): number {
    const i = Math.floor((x - this.gx0) / TS);
    const j = Math.floor((z - this.gz0) / TS);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  private generate(): void {
    const s = this.s;
    const { nx, nz, N } = this;
    // 每块场自己的种子随机流（位置定了就定了；同一块场换面也是同一套分布）
    const seed = (Math.round(s.ox * 10) * 73856093) ^ (Math.round(s.oz * 10) * 19349663) ^ 0x6d355;
    const rand = mulberry32(seed >>> 0);
    const R = (a: number, b: number) => a + rand() * (b - a);
    const ns = seed & 0xffff;
    const x0 = s.ox - s.hx;
    const z0 = s.oz - s.hz;
    const z1 = s.oz + s.hz;
    // 几堆沙丘（风从西边来，偏西）
    const dunes: [number, number, number][] = [];
    const nd = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < nd; k++)
      dunes.push([R(x0 + 0.5, s.ox + s.hx * 0.4), R(z0 + 0.6, z1 - 0.6), R(1.6, 3.6) * Math.min(1, s.hz / 6)]);
    const sandRaw = new Float32Array(N);
    const wetRaw = new Float32Array(N);
    const dryRaw = new Float32Array(N);
    const lineRaw = new Float32Array(N);
    const mask: number[] = [];
    const lineMask: number[] = [];
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        const x = this.cx(i);
        const z = this.cz(j);
        if (Math.abs(x - s.ox) > s.hx - 0.1 || Math.abs(z - s.oz) > s.hz - 0.1) continue;
        this.inside[c] = 1;
        mask.push(c);
        // 沙：西边围网根最先，南北两边的围网根其次，再加沙丘和起伏
        const west = Math.exp(-(x - x0) / 4.5);
        const edge = Math.exp(-Math.min(z - z0, z1 - z) / 1.6) * 0.45;
        let dune = 0;
        for (const [dx, dz, r] of dunes) {
          const d = Math.hypot((x - dx) / 1.4, z - dz) / r;
          if (d < 1) dune = Math.max(dune, (1 - d * d) * 0.8);
        }
        sandRaw[c] =
          west * (0.8 + 0.4 * fbm(x * 0.3, z * 0.3, ns)) +
          edge +
          dune +
          0.55 * fbm(x * 0.13, z * 0.13, ns + 1) +
          0.06 * hash(i, j, ns + 2);
        // 水：低洼（两层噪声叠出水洼的形状）
        wetRaw[c] = 0.8 * fbm(x * 0.26, z * 0.26, ns + 11) + 0.2 * fbm(x * 0.6, z * 0.6, ns + 12);
        // 红土干裂：大块斑
        dryRaw[c] = fbm(x * 0.2, z * 0.2, ns + 21) + 0.15 * hash(i, j, ns + 22);
        if (s.clay) {
          const a = Math.abs(vnoise(x * 1.5, z * 1.5, ns + 23) - 0.5);
          const b = Math.abs(vnoise(x * 1.1 + 7, z * 1.1, ns + 24) - 0.5);
          if (a < 0.045 || b < 0.035) this.dryNet[c] = 1;
        }
        this.base[c] = courtBase(s, x, z);
        if (onLine(s, x, z)) {
          this.line[c] = 1;
          lineMask.push(c);
          // 线：一段段地褪（沿线的噪声），底线中间站人的地方先褪
          const u = Math.abs(s.rot ? z - s.oz : x - s.ox);
          const v = Math.abs(s.rot ? x - s.ox : z - s.oz);
          const baseWear = u > s.L - 0.5 && v < 2.2 ? 0.35 : 0;
          lineRaw[c] = vnoise(x * 0.9, z * 0.9, ns + 31) * 0.75 + hash(i, j, ns + 32) * 0.25 + baseWear;
        }
      }
    rankInto(this.sandT, sandRaw, mask, true);
    rankInto(this.wetT, wetRaw, mask, true);
    rankInto(this.dryT, dryRaw, mask, true);
    rankInto(this.lineT, lineRaw, lineMask, true);
    // 硬地裂缝：随机游走，偶尔分叉；每道一个门槛，过了门槛从起点慢慢长出来
    if (!s.clay) {
      const area = (s.hx * s.hz) / (16.5 * 8.3);
      const n = Math.max(3, Math.round(8 * area));
      const hx = s.hx - 0.6;
      const hz = s.hz - 0.6;
      const order = shuffled(n, rand);
      for (let k = 0; k < n; k++) {
        this.crackThr.push((((order[k] as number) + 0.5) / n) * 0.85);
        let x = s.ox + R(-hx, hx);
        let z = s.oz + R(-hz, hz);
        let a = R(0, Math.PI * 2);
        const len = Math.floor(R(18, 50) * Math.sqrt(Math.min(1, area * 1.5)));
        for (let st = 0; st < len; st++) {
          x += Math.cos(a) * TS;
          z += Math.sin(a) * TS;
          a += R(-0.45, 0.45);
          if (Math.abs(x - s.ox) > s.hx - 0.3 || Math.abs(z - s.oz) > s.hz - 0.3) break;
          const c = this.cell(x, z);
          if (c < 0) break;
          if (this.crackK[c] < 0) {
            this.crackK[c] = k;
            this.crackP[c] = st / len;
          }
          // 裂缝旁边崩掉的一小块（让裂缝在手机上粗一点）
          if (rand() < 0.45 && c + 1 < N && this.crackK[c + 1] < 0) {
            this.crackK[c + 1] = k;
            this.crackP[c + 1] = st / len;
            this.crackChip[c + 1] = 1;
          }
        }
      }
    }
    // 球和垃圾：多数在围网根和底线后面（风吹过去、球滚过去），一些在网前，其余散着
    const area = (s.hx * s.hz) / (16.5 * 8.3);
    const n = Math.max(8, Math.round(36 * area));
    const order = shuffled(n, rand);
    for (let k = 0; k < n; k++) {
      const where = rand();
      let x: number;
      let z: number;
      if (where < 0.45) {
        // 围网根：四条边随机一条，离边 0.3..1.4 米
        const side = Math.floor(rand() * 4);
        const t = R(-1, 1);
        const off = R(0.3, 1.4);
        if (side === 0) [x, z] = [s.ox - s.hx + off, s.oz + t * (s.hz - 0.4)];
        else if (side === 1) [x, z] = [s.ox + s.hx - off, s.oz + t * (s.hz - 0.4)];
        else if (side === 2) [x, z] = [s.ox + t * (s.hx - 0.4), s.oz - s.hz + off];
        else [x, z] = [s.ox + t * (s.hx - 0.4), s.oz + s.hz - off];
      } else if (where < 0.65) {
        // 网前（网沿 z；转过的场地网沿 x）
        const t = R(-1, 1);
        const off = (rand() < 0.5 ? -1 : 1) * R(0.4, 1.6);
        if (s.rot) [x, z] = [s.ox + t * (s.hx - 0.5), s.oz + off];
        else [x, z] = [s.ox + off, s.oz + t * (s.hz - 0.5)];
      } else [x, z] = [s.ox + R(-s.hx + 0.5, s.hx - 0.5), s.oz + R(-s.hz + 0.5, s.hz - 0.5)];
      const r = rand();
      const prop: MessProp = r < 0.55 ? 'ball' : r < 0.7 ? 'bottle' : r < 0.8 ? 'can' : r < 0.92 ? 'leaf' : 'wrap';
      this.pieces.push({ x, z, prop, thr: ((order[k] as number) + 0.15 + rand() * 0.7) / n });
    }
  }
}

/** 0..n-1 打乱（种子随机流） */
function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j] as number, a[i] as number];
  }
  return a;
}

/**
 * 百分位门槛：mask 里的格子按 raw 排序，hiFirst = raw 越大越先（门槛越小）。门槛 0..1；mask 外的是 2（永远不出现）。
 */
function rankInto(out: Float32Array, raw: Float32Array, mask: readonly number[], hiFirst: boolean): void {
  out.fill(2);
  const idx = [...mask].sort((a, b) => (hiFirst ? (raw[b] as number) - (raw[a] as number) : raw[a] - raw[b]));
  const n = Math.max(1, idx.length - 1);
  idx.forEach((c, r) => {
    out[c] = r / n;
  });
}

/* ---------------- 画 ---------------- */

const HEX = {
  sand: '#e9c999',
  sand2: '#dfba86',
  sand3: '#f4dcb2',
  sandD: '#d6ae78',
  peb: '#c9a676',
  wet: '#1d2c40',
  puddle: '#86b6d2',
  puddle2: '#a6cfe4',
  rim: '#3e6584',
  glint: '#f2fbff',
  mud: '#6a2a18',
  mudPool: '#6e4a3e',
  mudRim: '#9a7a6c',
  mudGlint: '#b9dcea',
  crack: '#262c38',
  chip: '#59606c',
  dry: '#efc9a2',
  dryCrack: '#8a3c22',
  grey: '#a9a497',
  clayLine: '#d98a62',
} as const;
type HexKey = keyof typeof HEX;
/** 白天的打包色（夜里按格换算） */
const DAY = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, ph(v)])) as Record<HexKey, number>;

/** 几种量对应的样子（门槛 → 量） */
const SAND_K = 2.6;
const SAND_THICK = 0.55;
const WATER_MAX = 0.78;
const PUDDLE = 0.12;

/**
 * 算出这块场每一格的颜色和不透明度（0 = 不画）。纯函数（只读格子、量和调色板），测试直接调。
 * 从下往上：裂缝 / 干裂 → 褪色的线 → 积水 → 沙。
 */
export function messCells(
  g: MessGrid,
  m: CourtMessLook,
  P: Readonly<Record<HexKey, number>>,
  base: (c: number) => number,
  colA: Uint32Array,
  amtA: Float32Array,
): number {
  const { nx, nz, N, inside } = g;
  const clay = g.s.clay;
  const sandD = new Float32Array(N);
  if (m.sand > 0)
    for (let c = 0; c < N; c++)
      if (inside[c]) sandD[c] = Math.max(0, (m.sand - (g.sandT[c] as number) * 0.92) * SAND_K);
  let painted = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      amtA[c] = 0;
      if (!inside[c]) continue;
      let col = 0;
      let amt = 0;
      const over = (k: number, a: number) => {
        if (a <= 0) return;
        if (a >= 1 || amt <= 0) {
          col = amt <= 0 || a >= 1 ? k : mixP(col, k, a);
          amt = a >= 1 ? 1 : Math.max(amt, a);
          return;
        }
        const na = a + amt * (1 - a);
        col = mixP(col, k, a / na);
        amt = na;
      };
      // 裂缝 / 干裂
      if (m.cracks > 0) {
        if (!clay) {
          const k = g.crackK[c] as number;
          if (k >= 0) {
            const grow = clamp((m.cracks - (g.crackThr[k] as number)) / 0.3, 0, 1);
            if ((g.crackP[c] as number) < grow) over(g.crackChip[c] ? P.chip : P.crack, g.crackChip[c] ? 0.7 : 0.92);
          }
        } else {
          const d = m.cracks * 0.8 - (g.dryT[c] as number);
          if (d > 0) {
            over(P.dry, Math.min(0.62, 0.28 + d * 3));
            if (d > 0.05 && g.dryNet[c]) over(P.dryCrack, Math.min(0.9, 0.4 + d * 4));
          }
        }
      }
      // 线：先整体发灰，过了门槛一段段地褪掉（红土：被红土盖住）
      if (m.lines > 0 && g.line[c]) {
        over(clay ? P.clayLine : P.grey, Math.min(0.55, 0.55 * m.lines + 0.05));
        const d = m.lines - (g.lineT[c] as number) * 1.1;
        if (d > 0) over(base(c), Math.min(0.94, 0.35 + d * 4));
      }
      // 水：硬地是浅色反光的水洼、外圈一道深色湿印；红土是深色湿泥、深的地方积成小水洼
      if (m.water > 0) {
        const w = m.water * WATER_MAX - (g.wetT[c] as number);
        if (w > 0) {
          if (clay) {
            over(P.mud, Math.min(0.62, 0.3 + w * 2.2));
            // 小水洼：一圈亮边（映着天），里面一汪浑水，偶尔一点反光
            if (w > PUDDLE + 0.03) over(hash(i, j, 79) < 0.012 ? P.mudGlint : P.mudPool, 0.94);
            else if (w > PUDDLE) over(P.mudRim, 0.85);
          } else if (w > PUDDLE + 0.035) {
            // 水洼：映着天的一汪浅蓝，靠里一点更亮，偶尔一点反光
            const h = hash(i, j, 81);
            over(h < 0.012 ? P.glint : w > PUDDLE + 0.09 ? P.puddle2 : P.puddle, 1);
          } else if (w > PUDDLE) over(P.rim, 0.85);
          else over(P.wet, 0.32);
        }
      }
      // 沙：厚的整格盖住（朝上风的坡亮、背风的暗，偶尔一颗石子），薄的按厚度分四档透出下面
      const sd = sandD[c] as number;
      if (sd > 0.05) {
        if (sd >= SAND_THICK) {
          const up = j > 0 ? (sandD[c - nx] as number) : sd;
          const dn = j < nz - 1 ? (sandD[c + nx] as number) : sd;
          const lf = i > 0 ? (sandD[c - 1] as number) : sd;
          let k = P.sand;
          if (sd - up > 0.22 || sd - lf > 0.3) k = P.sand3;
          else if (sd - dn > 0.22) k = P.sand2;
          else if (sd > 1.6) k = P.sandD;
          if (hash(i, j, 78) > 0.985) k = P.peb;
          over(k, 1);
        } else {
          const a = Math.min(0.92, Math.round(((sd - 0.05) / 0.5) * 4 + hash(i, j, 77) * 0.9 - 0.45) / 4 + 0.18);
          over(P.sand, a);
        }
      }
      if (amt > 0) {
        colA[c] = col;
        amtA[c] = amt;
        painted++;
      }
    }
  return painted;
}

/** 逐像素：反投影到地面 → 格子 → 混色；被前面的东西挡住的像素不画（深度缓冲） */
function blit(R: Raster, g: MessGrid, colA: Uint32Array, amtA: Float32Array): void {
  const pr = R.proj;
  const buf = R.buf;
  const dep = R.depth;
  const W = R.W;
  const H = R.H;
  const s = g.s;
  let sx0 = Number.POSITIVE_INFINITY;
  let sx1 = Number.NEGATIVE_INFINITY;
  let sy0 = Number.POSITIVE_INFINITY;
  let sy1 = Number.NEGATIVE_INFINITY;
  for (const [x, z] of [
    [s.ox - s.hx, s.oz - s.hz],
    [s.ox + s.hx, s.oz - s.hz],
    [s.ox - s.hx, s.oz + s.hz],
    [s.ox + s.hx, s.oz + s.hz],
  ] as const) {
    const [a, b] = pr.P(x, 0, z);
    sx0 = Math.min(sx0, a);
    sx1 = Math.max(sx1, a);
    sy0 = Math.min(sy0, b);
    sy1 = Math.max(sy1, b);
  }
  const X0 = Math.max(0, Math.floor(sx0));
  const X1 = Math.min(W - 1, Math.ceil(sx1));
  const Y0 = Math.max(0, Math.floor(sy0));
  const Y1 = Math.min(H - 1, Math.ceil(sy1));
  if (X0 > X1 || Y0 > Y1) return;
  // 反投影是仿射的：x = bx + ax·sx + ay·sy
  const o0 = pr.unP(0.5, 0.5, 0);
  const o1 = pr.unP(1.5, 0.5, 0);
  const o2 = pr.unP(0.5, 1.5, 0);
  const axx = o1[0] - o0[0];
  const axz = o1[1] - o0[1];
  const ayx = o2[0] - o0[0];
  const ayz = o2[1] - o0[1];
  const d0 = pr.depth(o0[0], o0[1]);
  const dX = pr.depth(o1[0], o1[1]) - d0;
  const dY = pr.depth(o2[0], o2[1]) - d0;
  const inv = 1 / TS;
  const { nx, nz, gx0, gz0 } = g;
  for (let sy = Y0; sy <= Y1; sy++) {
    let wx = o0[0] + axx * X0 + ayx * sy;
    let wz = o0[1] + axz * X0 + ayz * sy;
    let d = d0 + dX * X0 + dY * sy;
    let o = sy * W + X0;
    for (let sx = X0; sx <= X1; sx++, o++, wx += axx, wz += axz, d += dX) {
      const i = Math.floor((wx - gx0) * inv);
      const j = Math.floor((wz - gz0) * inv);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const c = j * nx + i;
      const a = amtA[c] as number;
      if (a <= 0) continue;
      if (dep && (dep[o] as number) > d + 0.3) continue;
      buf[o] = a >= 1 ? (colA[c] as number) : mixP(buf[o] as number, colA[c] as number, a);
    }
  }
}

/** 一块场的叠层节点：读 get() 拿当前的量（null 不画） */
function courtNode(g: MessGrid, get: () => CourtMessLook | null): Custom {
  const s = g.s;
  const colA = new Uint32Array(g.N);
  const amtA = new Float32Array(g.N);
  const baked = Object.fromEntries(Object.entries(MESS_PROPS).map(([k, a]) => [k, bakeArt(a)])) as unknown as Record<
    MessProp,
    ReturnType<typeof bakeArt>
  >;
  const node = new Custom(
    (r: DrawContext) => {
      const m = get();
      if (!m) return;
      const R = r as unknown as Raster;
      const night = R.pal?.night ?? 0;
      const warm = R.pal?.warm ?? 1;
      // 先按白天的颜色算格子，夜里再逐格按那儿受灯光的程度换算（灯光池里亮、池外暗，和地面贴图对得上）
      const n = messCells(g, m, DAY, (c) => g.base[c] as number, colA, amtA);
      if (n > 0 && R.buf) {
        if (night > 0)
          for (let j = 0; j < g.nz; j++)
            for (let i = 0; i < g.nx; i++) {
              const c = j * g.nx + i;
              if ((amtA[c] as number) > 0) colA[c] = nightP(colA[c] as number, night, r.litAt(g.cx(i), g.cz(j)), warm);
            }
        blit(R, g, colA, amtA);
      }
      // 球和垃圾（压在沙和水上面）
      if (m.litter > 0)
        for (const p of g.pieces)
          if (p.thr < m.litter) r.art(baked[p.prop], p.x, 0.02, p.z, { lit: r.litAt(p.x, p.z) });
    },
    { x0: s.ox - s.hx, x1: s.ox + s.hx, y0: 0, y1: 0.02, z0: s.oz - s.hz, z1: s.oz + s.hz },
  );
  node.name = `mess:${s.key}`;
  // 贴地：排在同一块地上的磨损（-60）、网、围网、人之前
  node.renderOrder = -1000;
  return node;
}

/* ---------------- 运行时 ---------------- */

export interface MessLayer {
  /** 挂在 statics 下的根节点 */
  readonly root: Group;
  /** 设施状态 / 变体重建以后调：按现在的样子换场地；返回 true = 画面变了 */
  sync(fac: Facilities): boolean;
  /** 返回 true = 画面变了（要重烘静态层）；不认识的设施、没跨量化档的变化返回 false */
  set(facility: string, mess: CourtMessLook | null): boolean;
  /** 这处设施现在画着的（量化后的）量；测试、调试用 */
  get(facility: string): CourtMessLook | null;
}

export function createMess(): MessLayer {
  const root = new Group();
  root.name = 'mess';
  /** 格子按场地缓存（换面、换变体回来不用重算） */
  const grids = new Map<string, MessGrid>();
  const amounts = new Map<string, CourtMessLook | null>();
  /** 设施 → 现在画的场地（没修好 = 空） */
  const courts = new Map<string, string>();
  const nodes = new Map<string, Custom[]>();
  const shown = (f: string) => !!amounts.get(f) && (nodes.get(f)?.length ?? 0) > 0;
  const gridOf = (s: MessCourtSpec) => {
    let g = grids.get(s.key);
    if (!g) {
      g = new MessGrid(s);
      grids.set(s.key, g);
    }
    return g;
  };
  const refreshVisible = (f: string) => {
    const on = !!amounts.get(f);
    for (const n of nodes.get(f) ?? []) n.visible = on;
  };
  return {
    root,
    sync(fac) {
      let changed = false;
      for (const f of MESS_FACILITIES) {
        const specs = messCourts(fac, f);
        const key = specs.map((s) => s.key).join('|');
        if (courts.get(f) === key) continue;
        const was = shown(f);
        courts.set(f, key);
        for (const n of nodes.get(f) ?? []) root.remove(n);
        const list = specs.map((s) => courtNode(gridOf(s), () => amounts.get(f) ?? null));
        nodes.set(f, list);
        if (list.length) root.add(...list);
        refreshVisible(f);
        if (was || shown(f)) changed = true;
      }
      return changed;
    },
    set(facility, mess) {
      if (!(MESS_FACILITIES as readonly string[]).includes(facility)) return false;
      const q = quantMess(mess);
      if (sameMess(amounts.get(facility) ?? null, q)) return false;
      const was = shown(facility);
      amounts.set(facility, q);
      refreshVisible(facility);
      return was || shown(facility);
    },
    get: (f) => amounts.get(f) ?? null,
  };
}
