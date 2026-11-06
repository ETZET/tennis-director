import { mulberry32 } from '@td/shared';
import { MESS_PROPS, type MessProp } from '../../art/props/mess';
import { bakeArt } from '../../core/art';
import { clamp, fbm, hash, mixP, mulP, nightP, ph, vnoise } from '../../core/color';
import { Custom, type DrawContext, Group } from '../../core/graph';
import type { Raster } from '../../core/raster';
import {
  MESS_DAY,
  type MessCellIn,
  type MessCourtSnapshot,
  type MessHexKey,
  type MessPiece,
  messCell,
  messCellIn,
} from '../mess-look';
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
 * 每一格怎么画在 ../mess-look.ts（亲手扫的小游戏用同一个函数）。小游戏开场照 snapshot 摆、收工用 rebase 把扫剩下的样子交回来：
 * 门槛按剩下的样子重排（扫掉的往后排、剩下的往前排），之后量再变也接着这个样子长、退。只画，不改数。
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
  /** 白线格从多少量起发灰（平常是 0；小游戏刚画过的线抬到画完时的量） */
  readonly lineG: Float32Array;
  /** 线褪掉以后露出来的场地色（打包色，白天） */
  readonly base: Uint32Array;
  /** 硬地裂缝：第几道（-1 不是）、在这道上的位置 0..1、是不是边上的崩口 */
  readonly crackK: Int16Array;
  readonly crackP: Float32Array;
  readonly crackChip: Uint8Array;
  /** 每道裂缝的门槛 */
  readonly crackThr: number[] = [];
  /** 每个裂缝格的门槛（= 这道裂缝的门槛 + 0.3 × 在这道上的位置：量过了它这一格才长出来；小游戏压平过的格子单独往后排） */
  readonly crackT: Float32Array;
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
    this.lineG = new Float32Array(N);
    this.crackT = new Float32Array(N).fill(2);
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
      for (let c = 0; c < N; c++) {
        const k = this.crackK[c] as number;
        if (k >= 0) this.crackT[c] = (this.crackThr[k] as number) + CRACK_GROW * (this.crackP[c] as number);
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

/** 几种量对应的样子（门槛 → 量） */
const SAND_K = 2.6;
const WATER_MAX = 0.78;
const DRY_K = 0.8;
const LINE_K = 1.1;
/** 硬地裂缝：一道裂缝过了门槛以后沿着长出来要多少量 */
const CRACK_GROW = 0.3;
/** 一格裂缝从淡到清楚要多少量（量连续变化时裂缝一格格淡入，不是一下子冒出来） */
const CRACK_SOFT = 0.04;
/** 门槛排到"刚好不画"时多让出来的一点 */
const EPS = 1e-4;

/** 一块场每一格画面上的量（门槛 + 量算出来的；小游戏的快照也是这几项） */
export interface MessFields {
  sand: Float32Array;
  wet: Float32Array;
  crack: Float32Array;
  dry: Float32Array;
  grey: Float32Array;
  fade: Float32Array;
}

export const messFieldsFor = (N: number): MessFields => ({
  sand: new Float32Array(N),
  wet: new Float32Array(N),
  crack: new Float32Array(N),
  dry: new Float32Array(N),
  grey: new Float32Array(N),
  fade: new Float32Array(N),
});

/** 门槛 + 量 → 每一格画面上的量（纯函数，写进 out） */
export function messFields(g: MessGrid, m: CourtMessLook, out: MessFields): void {
  const clay = g.s.clay;
  for (let c = 0; c < g.N; c++) {
    out.sand[c] = 0;
    out.wet[c] = 0;
    out.crack[c] = 0;
    out.dry[c] = 0;
    out.grey[c] = 0;
    out.fade[c] = 0;
    if (!g.inside[c]) continue;
    if (m.sand > 0) out.sand[c] = Math.max(0, (m.sand - (g.sandT[c] as number) * 0.92) * SAND_K);
    if (m.water > 0) out.wet[c] = Math.max(0, m.water * WATER_MAX - (g.wetT[c] as number));
    if (m.cracks > 0) {
      if (!clay) {
        if ((g.crackK[c] as number) >= 0) out.crack[c] = clamp((m.cracks - (g.crackT[c] as number)) / CRACK_SOFT, 0, 1);
      } else out.dry[c] = Math.max(0, m.cracks * DRY_K - (g.dryT[c] as number));
    }
    if (m.lines > 0 && g.line[c]) {
      const lg = g.lineG[c] as number;
      if (m.lines > lg) out.grey[c] = Math.min(0.55, 0.55 * (m.lines - lg) + 0.05);
      out.fade[c] = Math.max(0, m.lines - (g.lineT[c] as number) * LINE_K);
    }
  }
}

/** 这块场的裂缝格是哪种（0 不是、1 裂缝、2 崩口） */
const crackCellOf = (g: MessGrid): Uint8Array => {
  const out = new Uint8Array(g.N);
  if (!g.s.clay) for (let c = 0; c < g.N; c++) if ((g.crackK[c] as number) >= 0) out[c] = g.crackChip[c] ? 2 : 1;
  return out;
};

/**
 * 算出这块场每一格的颜色和不透明度（0 = 不画）。纯函数（只读格子、量和调色板），测试直接调。
 * 从下往上：裂缝 / 干裂 → 褪色的线 → 积水 → 沙（每格怎么画见 ../mess-look.ts 的 messCell）。
 */
export function messCells(
  g: MessGrid,
  m: CourtMessLook,
  P: Readonly<Record<MessHexKey, number>>,
  base: (c: number) => number,
  colA: Uint32Array,
  amtA: Float32Array,
  scratch: MessFields = messFieldsFor(g.N),
): number {
  const { nx, nz, inside } = g;
  messFields(g, m, scratch);
  const { sand } = scratch;
  const v: MessCellIn = messCellIn();
  const out = { col: 0, amt: 0 };
  v.clay = g.s.clay;
  let painted = 0;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      amtA[c] = 0;
      if (!inside[c]) continue;
      const sd = sand[c] as number;
      v.sand = sd;
      v.sandUp = j > 0 ? (sand[c - nx] as number) : sd;
      v.sandDn = j < nz - 1 ? (sand[c + nx] as number) : sd;
      v.sandLf = i > 0 ? (sand[c - 1] as number) : sd;
      v.wet = scratch.wet[c] as number;
      v.crack = (g.crackK[c] as number) >= 0 ? (g.crackChip[c] ? 2 : 1) : 0;
      v.crackA = scratch.crack[c] as number;
      v.dry = scratch.dry[c] as number;
      v.dryNet = !!g.dryNet[c];
      v.line = !!g.line[c];
      v.grey = scratch.grey[c] as number;
      v.fade = scratch.fade[c] as number;
      v.base = v.line && v.fade > 0 ? base(c) : 0;
      messCell(v, i, j, P, out);
      if (out.amt > 0) {
        colA[c] = out.col;
        amtA[c] = out.amt;
        painted++;
      }
    }
  return painted;
}

/** 这块场按量 m 画出来的样子（交给小游戏） */
export function messSnapshot(g: MessGrid, m: CourtMessLook): MessCourtSnapshot {
  const f = messFieldsFor(g.N);
  messFields(g, m, f);
  const s = g.s;
  const pieces: MessPiece[] = [];
  if (m.litter > 0)
    g.pieces.forEach((p, id) => {
      if (p.thr < m.litter) pieces.push({ id, x: p.x, z: p.z, prop: p.prop });
    });
  return {
    key: s.key,
    ox: s.ox,
    oz: s.oz,
    hx: s.hx,
    hz: s.hz,
    clay: s.clay,
    amounts: { ...m },
    gx0: g.gx0,
    gz0: g.gz0,
    nx: g.nx,
    nz: g.nz,
    ts: TS,
    inside: g.inside,
    line: g.line,
    dryNet: g.dryNet,
    crackCell: crackCellOf(g),
    base: g.base,
    ...f,
    pieces,
  };
}

/**
 * 小游戏收工：把门槛重排成"按量 q 画出来正好是 res 的样子"（res 是扫剩下的快照，格子和这块场一样）。
 * 连续的几项（沙、水、红土干裂、线褪掉多少、线发灰多少）按剩下的量直接解出门槛；一格一格有没有的几项（硬地裂缝、垃圾）
 * 剩下的按原来的先后挤到 q 以下、扫掉的挤到 q 以上（以后量再涨，扫掉的地方先回来）。q 是 0 的项画不出来，不动。
 */
export function messRebase(g: MessGrid, res: MessCourtSnapshot, q: CourtMessLook): void {
  if (res.nx !== g.nx || res.nz !== g.nz || res.key !== g.s.key) return;
  const old = res.amounts;
  const clay = g.s.clay;
  for (let c = 0; c < g.N; c++) {
    if (!g.inside[c]) continue;
    if (q.sand > 0) {
      const r = res.sand[c] as number;
      g.sandT[c] = r > 0.05 ? (q.sand - r / SAND_K) / 0.92 : Math.max(g.sandT[c] as number, q.sand / 0.92 + EPS);
    }
    if (q.water > 0) {
      const r = res.wet[c] as number;
      g.wetT[c] = r > 0 ? q.water * WATER_MAX - r : Math.max(g.wetT[c] as number, q.water * WATER_MAX + EPS);
    }
    if (q.cracks > 0) {
      if (clay) {
        const r = res.dry[c] as number;
        g.dryT[c] = r > 0 ? q.cracks * DRY_K - r : Math.max(g.dryT[c] as number, q.cracks * DRY_K + EPS);
      } else if ((g.crackK[c] as number) >= 0) {
        const t = g.crackT[c] as number;
        const was = old.cracks > t;
        const a = res.crack[c] as number;
        if (a > 0) {
          // 剩下的：按原来的先后挤到 q 以下，清楚程度照剩下的
          const lo = q.cracks - CRACK_SOFT * Math.min(1, a);
          g.crackT[c] = was ? Math.min((t * q.cracks) / old.cracks, lo) : lo;
        } else if (was) g.crackT[c] = q.cracks + (Math.max(0, old.cracks - q.cracks) * t) / old.cracks + EPS;
      }
    }
    if (q.lines > 0 && g.line[c]) {
      const r = res.fade[c] as number;
      g.lineT[c] = r > 0 ? (q.lines - r) / LINE_K : Math.max(g.lineT[c] as number, q.lines / LINE_K + EPS);
      const gr = res.grey[c] as number;
      g.lineG[c] = gr > 0 ? q.lines - (Math.min(0.55, gr) >= 0.55 ? 1 : (gr - 0.05) / 0.55) : q.lines;
    }
  }
  if (q.litter > 0 && old.litter > 0) {
    const kept = new Set(res.pieces.map((p) => p.id));
    g.pieces.forEach((p, id) => {
      if (p.thr >= old.litter) return;
      p.thr = kept.has(id)
        ? (p.thr * q.litter) / old.litter
        : q.litter + (Math.max(0, old.litter - q.litter) * p.thr) / old.litter + EPS;
    });
  }
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
  const scratch = messFieldsFor(g.N);
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
      const n = messCells(g, m, MESS_DAY, (c) => g.base[c] as number, colA, amtA, scratch);
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
  /**
   * 这处设施现在画着的每块场（小游戏开场照着摆）。画着的量没有时按 fallback（量化后）算。没修好、不认识的设施是空表。
   */
  snapshot(facility: string, fallback: CourtMessLook | null): MessCourtSnapshot[];
  /**
   * 小游戏收工：每块场照 courts 里同一块场（按 key 认）扫剩下的样子重排门槛，并且按 amounts（模拟清完以后的量）画。
   * 返回 true = 画面变了。
   */
  rebase(facility: string, courts: readonly MessCourtSnapshot[], amounts: CourtMessLook | null): boolean;
  /** 小游戏接管这处设施的一块场（key）：只藏这一块，别的照画；null 还原 */
  focus(facility: string, key: string | null): boolean;
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
  /** 设施 → 现在画的每块场的 key（和 nodes 同序） */
  const keys = new Map<string, string[]>();
  /** 设施 → 小游戏接管着、不画的那块场 */
  const focused = new Map<string, string>();
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
    const ks = keys.get(f) ?? [];
    const hide = focused.get(f);
    (nodes.get(f) ?? []).forEach((n, i) => {
      n.visible = on && ks[i] !== hide;
    });
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
        keys.set(
          f,
          specs.map((s) => s.key),
        );
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
    snapshot(facility, fallback) {
      const m = amounts.get(facility) ?? quantMess(fallback);
      const ks = keys.get(facility) ?? [];
      if (!m) return [];
      return ks.map((k) => messSnapshot(grids.get(k) as MessGrid, m));
    },
    rebase(facility, list, target) {
      if (!(MESS_FACILITIES as readonly string[]).includes(facility)) return false;
      const q = quantMess(target);
      if (q)
        for (const res of list) {
          const g = grids.get(res.key);
          if (g && (keys.get(facility) ?? []).includes(res.key)) messRebase(g, res, q);
        }
      amounts.set(facility, q);
      refreshVisible(facility);
      return true;
    },
    focus(facility, key) {
      if ((focused.get(facility) ?? null) === key) return false;
      if (key) focused.set(facility, key);
      else focused.delete(facility);
      refreshVisible(facility);
      return shown(facility);
    },
  };
}
