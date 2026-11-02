import type { XZ } from '@td/shared';
import { net, pen, surface, weed } from '../../props/court';
import { VoxelBatcher } from '../../voxel/batcher';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import type { CourtFrame } from '../../world/frame';
import {
  ARCH_X,
  CAMPUS,
  CLUBHOUSE,
  F_O1,
  F_O2,
  F_O3,
  F_P1,
  F_P2,
  F_S1,
  F_S2,
  F_S3,
  FOUNTAIN,
  FRAMES,
  LAWNS,
  LOT_WALL_X,
  PARKING,
  PLAZA,
  ROAD,
  routeLine,
  S1,
  S1_BOWL,
  S2,
  S2_STANDS,
  S3,
  SITE,
  STANDS,
} from './layout';
import { fbm, hash2, ridged } from './noise';

/**
 * Indian Wells 的静态场景（2026-11-01 美术补齐）：废弃了十年的园区。
 * 静态部分是"废弃但看得出原样"的底子：沙漠、群山、围墙、步道、看台、会所、广场、大门、停车场。
 * 各设施开局的破败（积沙、倒网、碎石、钉木板）和修好以后的样子（新场地、绿草、亮灯、喷泉有水）
 * 是 overlays.ts 里按状态显示的一层。
 */

export const PAL = {
  sand: ['#dcbb8a', '#d3b07e', '#e3c697'],
  sandD: '#c39a69',
  dirt: ['#cdb084', '#c3a57a', '#d4b98e'],
  deadGrass: ['#b5a66b', '#a99c5f', '#9d9358', '#bcae78'],
  liveGrass: ['#6f9445', '#7ba24f'],
  path: ['#bfbab0', '#b6b1a6'],
  pave: ['#cdc8bd', '#c2bdb1'],
  paveD: '#a59f93',
  asphalt: ['#4f4d50', '#59575a', '#545255'],
  stripe: '#cbc5b2',
  concrete: ['#b9b0a0', '#aea595', '#c2b9a8'],
  facade: '#d9c8a6',
  pier: '#c4b08b',
  /** 看台座位：下层蓝、上层紫（新的） */
  seatLo: ['#2e6aa6', '#3576b2'],
  seatHi: ['#5b4889', '#665395'],
  /** 晒褪色的座位 */
  seatLoFaded: ['#8fa2b2', '#9aabb8'],
  seatHiFaded: ['#a097aa', '#968da2'],
  bleached: '#cfc8ba',
  rust: ['#8a5a3a', '#7a4e34', '#93643f'],
  metal: '#a9adb0',
  /** 场地：Indian Wells 的蓝场地紫外圈；褪色版 */
  courtIn: '#3c6ca3',
  courtOut: '#5d4580',
  courtInWorn: '#8094a5',
  courtOutWorn: '#958b98',
  roof: '#9a8a74',
  wall: '#dccdb0',
  wallD: '#c8b796',
  glass: '#46565e',
  glassBroken: '#2b3034',
  board: '#a8875a',
  dead: ['#8a7a52', '#7d6e4a', '#9a8a5e'],
  palm: ['#5f8a3e', '#6b9444', '#56803a'],
  trunk: '#8a7458',
  shrub: ['#68713e', '#868849', '#7a7a44'],
  rock: ['#a58668', '#8c6852', '#b99376'],
  /** 群山的岩层：从下往上 */
  mountain: ['#c49a74', '#b07f68', '#9a6e72', '#b88d77', '#8a6878', '#a67f72'],
} as const;

export const pickc = (ctx: BuildContext, xs: readonly string[]) => xs[Math.floor(ctx.rand() * xs.length)] as string;

type Rect = { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
export const inRect = (r: Rect, x: number, z: number, m = 0) =>
  x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** 一块沙堆：几层越往上越小的扁盒 */
export function sandPile(ctx: BuildContext, x: number, y: number, z: number, r: number): void {
  for (let k = 0; k < 3; k++) {
    const s = r * (1 - k * 0.3);
    ctx.flat.box(
      x + sr(ctx, -0.3, 0.3),
      y + k * 0.14,
      z + sr(ctx, -0.3, 0.3),
      s * sr(ctx, 1.4, 2),
      0.16,
      s * sr(ctx, 0.8, 1.2),
      jit(ctx, pickc(ctx, PAL.sand), 0.03),
      sr(ctx, 0, 3.14),
    );
  }
}

/** 风滚草：一团乱枝 */
export function tumbleweed(ctx: BuildContext, x: number, y: number, z: number, s = 1): void {
  for (let k = 0; k < 7; k++)
    ctx.solid.box(
      x + sr(ctx, -0.35, 0.35) * s,
      y + sr(ctx, 0, 0.5) * s,
      z + sr(ctx, -0.35, 0.35) * s,
      0.5 * s,
      0.12 * s,
      0.12 * s,
      jit(ctx, pickc(ctx, PAL.dead), 0.06),
      sr(ctx, 0, 3.14),
      sr(ctx, 0, 3.14),
      sr(ctx, 0, 3.14),
    );
}

export type PalmKind = 'ok' | 'dead' | 'snap';

/** 棕榈树：ok 是活的；dead 是一圈垂下来的干叶裙；snap 是断了头，树冠躺在地上 */
export function palm(ctx: BuildContext, x: number, z: number, h: number, kind: PalmKind): void {
  const top = kind === 'snap' ? h * 0.45 : h;
  const lean = sr(ctx, -0.5, 0.5);
  const la = sr(ctx, 0, 6.28);
  const n = Math.ceil(top);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const w = 0.5 - u * 0.14;
    ctx.solid.box(
      x + Math.cos(la) * lean * u * u,
      i,
      z + Math.sin(la) * lean * u * u,
      w,
      1.02,
      w,
      jit(ctx, PAL.trunk, 0.06),
    );
  }
  const tx = x + Math.cos(la) * lean;
  const tz = z + Math.sin(la) * lean;
  if (kind === 'snap') {
    // 断口参差，树冠躺在地上
    ctx.solid.box(tx, top, tz, 0.3, 0.5, 0.2, jit(ctx, '#a08a68', 0.05), 0.4);
    const a = sr(ctx, 0, 6.28);
    ctx.solid.box(x + Math.cos(a) * 3, 0, z + Math.sin(a) * 3, 0.4, 0.4, h * 0.5, jit(ctx, PAL.trunk, 0.05), a);
    for (let k = 0; k < 4; k++)
      ctx.solid.box(
        x + Math.cos(a) * (3 + h * 0.25),
        0.1,
        z + Math.sin(a) * (3 + h * 0.25),
        0.3,
        0.1,
        2.2,
        jit(ctx, pickc(ctx, PAL.dead), 0.05),
        a + k * 0.8,
      );
    return;
  }
  const fronds = kind === 'dead' ? 9 : 8;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + sr(ctx, -0.2, 0.2);
    const col = jit(ctx, pickc(ctx, kind === 'dead' ? PAL.dead : PAL.palm), 0.05);
    if (kind === 'dead') {
      // 枯叶：往外伸一截就耷拉下来，挂成一圈干裙子
      const droop = sr(ctx, 0.5, 1.1);
      ctx.solid.box(tx + Math.sin(a) * 0.8, top - 0.1, tz + Math.cos(a) * 0.8, 0.34, 0.1, 1.8, col, a, droop);
      if (k % 3 === 0)
        ctx.solid.box(tx + Math.sin(a) * 0.5, top - 1.8, tz + Math.cos(a) * 0.5, 0.3, 1.6, 0.18, col, a, 0.15);
    } else {
      ctx.solid.box(tx + Math.sin(a) * 0.9, top + 0.1, tz + Math.cos(a) * 0.9, 0.42, 0.12, 2, col, a, -0.15);
      ctx.solid.box(tx + Math.sin(a) * 2.4, top - 0.35, tz + Math.cos(a) * 2.4, 0.36, 0.1, 1.6, col, a, 0.45);
    }
  }
  if (kind === 'dead') ctx.solid.box(tx, top - 1.6, tz, 1.2, 1.7, 1.2, jit(ctx, '#9a8558', 0.05));
  else ctx.solid.box(tx, top - 0.5, tz, 0.8, 0.7, 0.8, jit(ctx, '#6d5a3c', 0.05));
}

/** 沙漠里的矮灌木（石炭酸灌木）或一块石头 */
function shrub(ctx: BuildContext, x: number, z: number): void {
  if (ctx.rand() < 0.3) {
    const s = sr(ctx, 0.6, 1.6);
    ctx.solid.box(x, -0.1, z, s, s * 0.6, s * 0.8, jit(ctx, pickc(ctx, PAL.rock), 0.05), sr(ctx, 0, 3));
    return;
  }
  const s = sr(ctx, 0.7, 1.4);
  ctx.solid.box(x, 0, z, 1.1 * s, 0.7 * s, 1 * s, jit(ctx, pickc(ctx, PAL.shrub), 0.07), sr(ctx, 0, 3));
  ctx.solid.box(x + 0.2, 0.4 * s, z - 0.1, 0.7 * s, 0.6 * s, 0.7 * s, jit(ctx, pickc(ctx, PAL.shrub), 0.07), 0.6);
}

/** 一辆车：车身、车顶、四个轮子。rusty 是锈了、轮胎瘪了的旧车 */
export function car(ctx: BuildContext, x: number, z: number, ry: number, body: string, rusty: boolean): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const y0 = rusty ? 0.15 : 0.35;
  ctx.solid.box(x, y0, z, 1.9, 0.75, 4.3, jit(ctx, body, 0.05), ry);
  ctx.solid.box(x, y0 + 0.75, z + 0, 1.7, 0.6, 2.3, rusty ? jit(ctx, '#5f5a52', 0.05) : '#3d4a55', ry);
  for (const [lx, lz] of [
    [-0.9, 1.4],
    [0.9, 1.4],
    [-0.9, -1.4],
    [0.9, -1.4],
  ] as const) {
    const p = at(lx, lz);
    ctx.solid.box(p.x, 0, p.z, 0.3, rusty ? 0.35 : 0.7, 0.7, '#26282a', ry);
  }
}

/** 灯杆：bent 是被风吹歪的 */
function lightPole(ctx: BuildContext, x: number, z: number, h: number, bent = false): void {
  const rz = bent ? 0.35 : 0;
  ctx.solid.box(x, 0, z, 0.25, h, 0.25, jit(ctx, '#7d8084', 0.04), 0, 0, rz);
  const tx = x - Math.sin(rz) * h;
  const ty = Math.cos(rz) * h;
  ctx.solid.box(tx, ty, z, 1.4, 0.3, 0.5, '#5d6064', 0, 0, rz);
}

/* ---------------- 看台 ---------------- */

/** 一段看台：中心点、走向角（盒子的长边方向）、长度、朝外的法线 */
export interface Seg {
  x: number;
  z: number;
  ry: number;
  len: number;
  nx: number;
  nz: number;
  /** 沿着一圈的序号（隔几段留一条过道） */
  i: number;
}

/** 圆角矩形一圈（离内沿 d 米）：直边按 step 切段，圆角按弧长切段。 */
export function ringSegs(cx: number, cz: number, ix: number, iz: number, rc: number, d: number, step = 3): Seg[] {
  const out: Seg[] = [];
  const r = rc + d;
  const ax = ix - rc;
  const az = iz - rc;
  const line = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      out.push({
        x: cx + x0 + (x1 - x0) * u,
        z: cz + z0 + (z1 - z0) * u,
        ry: Math.atan2(x1 - x0, z1 - z0),
        len: len / n + 0.06,
        nx,
        nz,
        i: out.length,
      });
    }
  };
  const arc = (ox: number, oz: number, a0: number) => {
    const n = Math.max(2, Math.round((r * Math.PI) / 2 / 2));
    for (let k = 0; k < n; k++) {
      const a = a0 + ((k + 0.5) / n) * (Math.PI / 2);
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      out.push({
        x: cx + ox + nx * r,
        z: cz + oz + nz * r,
        ry: Math.atan2(-nz, nx),
        len: ((r + 0.6) * Math.PI) / 2 / n + 0.12,
        nx,
        nz,
        i: out.length,
      });
    }
  };
  line(-ax, -az - r, ax, -az - r, 0, -1);
  arc(ax, -az, -Math.PI / 2);
  line(ax + r, -az, ax + r, az, 1, 0);
  arc(ax, az, 0);
  line(ax, az + r, -ax, az + r, 0, 1);
  arc(-ax, az, Math.PI / 2);
  line(-ax - r, az, -ax - r, -az, -1, 0);
  arc(-ax, -az, Math.PI);
  return out;
}

/** 一条直的看台（离内沿 d 米）：沿 x 从 x0 到 x1，内沿在 z = zEdge，往 dir（±1）方向升高 */
export function lineSegs(x0: number, x1: number, zEdge: number, dir: number, d: number, step = 3): Seg[] {
  const out: Seg[] = [];
  const n = Math.max(1, Math.round((x1 - x0) / step));
  for (let k = 0; k < n; k++)
    out.push({
      x: x0 + ((x1 - x0) * (k + 0.5)) / n,
      z: zEdge + dir * d,
      ry: Math.PI / 2,
      len: (x1 - x0) / n + 0.04,
      nx: 0,
      nz: dir,
      i: k,
    });
  return out;
}

export interface StandSpec {
  /** 第 row 排的中线那一圈 */
  segs(d: number): Seg[];
  rows: number;
  rowD: number;
  rise: number;
  y0: number;
}

export interface StandOptions {
  /** 画台阶（混凝土） */
  risers: boolean;
  /** 座位颜色（null 不画座位）；返回 null 表示这一格没有座位 */
  seat: ((row: number, s: Seg) => string | null) | null;
  /** 这一格整个不画（塌了、入场口） */
  skip?: (s: Seg, row: number) => boolean;
  /** 座位放大一点，盖住底下旧的 */
  grow?: number;
  riserCol?: readonly string[];
}

/** 一排排台阶和座位 */
export function stands(ctx: BuildContext, sp: StandSpec, o: StandOptions): void {
  const g = o.grow ?? 0;
  for (let r = 0; r < sp.rows; r++) {
    const d = (r + 0.5) * sp.rowD;
    for (const s of sp.segs(d)) {
      if (o.skip?.(s, r)) continue;
      const h = (r + 1) * sp.rise;
      if (o.risers)
        ctx.solid.box(s.x, sp.y0, s.z, sp.rowD, h, s.len, jit(ctx, pickc(ctx, o.riserCol ?? PAL.concrete), 0.03), s.ry);
      const c = o.seat?.(r, s);
      if (c)
        ctx.solid.box(
          s.x - s.nx * 0.12,
          sp.y0 + h - g * 0.5,
          s.z - s.nz * 0.12,
          0.62 + g,
          0.28 + g,
          s.len - 0.3 + g,
          jit(ctx, c, 0.04),
          s.ry,
        );
    }
  }
}

/** Stadium 1 碗的规格 */
export const S1_SPEC: StandSpec = {
  segs: (d) => ringSegs(S1.cx, S1.cz, S1_BOWL.ix, S1_BOWL.iz, S1_BOWL.corner, d),
  rows: S1_BOWL.rows,
  rowD: S1_BOWL.rowD,
  rise: S1_BOWL.rise,
  y0: 0,
};
/** 入场口：东边一个、南边一个（步道从这里穿进碗里） */
export const s1Gap = (s: Seg) =>
  (s.x > S1.cx + S1_BOWL.ix - 1 && s.z > S1.cz - 3 && s.z < S1.cz + 8.5) ||
  (s.z > S1.cz + S1_BOWL.iz - 1 && Math.abs(s.x - S1.cx) < 3.2);
/** 东南角塌了的地方（上半截） */
export const s1Collapsed = (s: Seg, row: number) => s.x > S1.cx + 11 && s.z > S1.cz + 7 && row >= 3;
/** 每隔几段一条过道 */
const aisle = (s: Seg) => s.i % 7 === 3;

export const s1Seat = (fresh: boolean) => (row: number, s: Seg) => {
  if (aisle(s)) return null;
  const lo = row < 5;
  if (fresh) return (lo ? PAL.seatLo : PAL.seatHi)[row % 2] as string;
  const h = hash2(s.i * 7 + row, row * 13 + 5);
  if (h < 0.16) return null;
  if (h < 0.28) return PAL.bleached;
  return (lo ? PAL.seatLoFaded : PAL.seatHiFaded)[row % 2] as string;
};

/** 碗外面的一圈外墙（立面），隔几段一根壁柱 */
export function facade(ctx: BuildContext, sp: StandSpec, h: number, skip: (s: Seg) => boolean, broken = false): void {
  const d = sp.rows * sp.rowD + 0.4;
  for (const s of sp.segs(d)) {
    if (skip(s)) continue;
    const hh = broken ? sr(ctx, 0.6, h * 0.5) : h;
    ctx.solid.box(s.x, sp.y0, s.z, 0.8, hh, s.len, jit(ctx, PAL.facade, 0.03), s.ry);
    if (s.i % 3 === 0 && !broken)
      ctx.solid.box(s.x + s.nx * 0.3, sp.y0, s.z + s.nz * 0.3, 0.6, h + 0.5, 0.9, jit(ctx, PAL.pier, 0.03), s.ry);
  }
}

export const S2_SPEC_N: StandSpec = {
  segs: (d) => lineSegs(S2_STANDS.x0, S2_STANDS.x1, S2.cz - S2_STANDS.iz, -1, d),
  rows: S2_STANDS.rows,
  rowD: 1,
  rise: 0.5,
  y0: 0,
};
export const S2_SPEC_S: StandSpec = {
  ...S2_SPEC_N,
  segs: (d) => lineSegs(S2_STANDS.x0, S2_STANDS.x1, S2.cz + S2_STANDS.iz, 1, d),
};

export const s2Seat = (fresh: boolean) => (row: number, s: Seg) => {
  if (s.i % 5 === 2) return null;
  if (fresh) return PAL.seatLo[row % 2] as string;
  const h = hash2(s.i * 5 + row, row * 11 + 3);
  if (h < 0.18) return null;
  return h < 0.3 ? PAL.bleached : (PAL.seatLoFaded[row % 2] as string);
};

/** Stadium 3 的铝看台：坑里三排（从坑底到地面），北边地面上再三排 */
export const S3_PIT = { hx: S3.hx - 2, hz: S3.hz - 2 } as const;
export const S3_SPECS: StandSpec[] = [
  { segs: (d) => lineSegs(S3.cx - 14, S3.cx + 14, S3.cz - 10, -1, d), rows: 3, rowD: 1, rise: 0.8, y0: -S3.depth },
  { segs: (d) => lineSegs(S3.cx - 14, S3.cx + 14, S3.cz + 10, 1, d), rows: 3, rowD: 1, rise: 0.8, y0: -S3.depth },
  { segs: (d) => lineSegs(S3.cx - 14, S3.cx + 14, S3.cz - S3_PIT.hz - 2, -1, d), rows: 3, rowD: 1, rise: 0.5, y0: 0 },
];

/* ---------------- 地面 ---------------- */

export const inPit = (x: number, z: number) =>
  Math.abs(x - S3.cx) < S3_PIT.hx + 2 && Math.abs(z - S3.cz) < S3_PIT.hz + 2;
const ROAD_R = { ...ROAD, z0: -1e4, z1: 1e4 };
const inCampus = (x: number, z: number) => inRect(CAMPUS, x, z) || inRect(PARKING, x, z, 1);

/** 地面：园区里是夯土和枯草，墙外是沙漠；颜色按噪声连成片 */
function ground(ctx: BuildContext): void {
  const cell = (cx: number, cz: number, C: number) => {
    const n = fbm(cx * 0.045, cz * 0.045);
    const camp = inCampus(cx, cz);
    const pal = camp ? PAL.dirt : PAL.sand;
    const col = pal[n < 0.4 ? 1 : n > 0.62 ? 2 : 0] as string;
    ctx.flat.box(cx, -0.2, cz, C, 0.2, C, jit(ctx, col, 0.01));
    // 墙外的沙丘：低低的几层
    if (!camp && !inRect(ROAD_R, cx, cz, 3) && !inRect(PARKING, cx, cz, 4)) {
      const dn = fbm(cx * 0.03 + 5, cz * 0.03);
      if (dn > 0.55) ctx.flat.box(cx, 0, cz, C, (dn - 0.55) * 6, C, jit(ctx, pickc(ctx, PAL.sand), 0.015));
    }
  };
  // 8 米一格；挨着下沉的 Stadium 3 的格子拆成 4 米，坑里不铺（坑口的一圈由坑沿盖住）
  for (let x = SITE.x0 - 8; x < SITE.x1 + 8; x += 8)
    for (let z = SITE.z0 - 8; z < SITE.z1 + 8; z += 8) {
      if (!(Math.abs(x + 4 - S3.cx) < S3_PIT.hx + 6 && Math.abs(z + 4 - S3.cz) < S3_PIT.hz + 7)) {
        cell(x + 4, z + 4, 8);
        continue;
      }
      for (const [dx, dz] of [
        [2, 2],
        [6, 2],
        [2, 6],
        [6, 6],
      ] as const) {
        const cx = x + dx;
        const cz = z + dz;
        if (Math.abs(cx - S3.cx) < S3_PIT.hx && Math.abs(cz - S3.cz) < S3_PIT.hz + 1) continue;
        cell(cx, cz, 4);
      }
    }
  // 远处一圈更粗的沙漠，补满镜头
  const F = 14;
  for (let x = -196; x < 196; x += F)
    for (let z = -168; z < 168; z += F) {
      if (x >= SITE.x0 - 8 - F && x < SITE.x1 + 8 && z >= SITE.z0 - 8 - F && z < SITE.z1 + 8) continue;
      const n = fbm(x * 0.03, z * 0.03);
      ctx.flat.box(x + F / 2, -0.3, z + F / 2, F, 0.3, F, n < 0.45 ? PAL.sand[0] : '#d8b886');
    }
}

/** 枯草坪（修好以后 overlays 在上面铺绿草） */
function deadLawns(ctx: BuildContext): void {
  for (const rects of Object.values(LAWNS))
    for (const r of rects)
      for (let x = r.x0; x < r.x1; x += 4)
        for (let z = r.z0; z < r.z1; z += 4) {
          if (inPit(x + 2, z + 2)) continue;
          const w = Math.min(4, r.x1 - x);
          const d = Math.min(4, r.z1 - z);
          const n = fbm(x * 0.09 + 2, z * 0.09);
          // 一块块秃了的地方露出土
          const col = n < 0.36 ? (PAL.dirt[0] as string) : (PAL.deadGrass[Math.floor(n * 7) % 4] as string);
          ctx.flat.box(x + w / 2, -0.02, z + d / 2, w, 0.03, d, jit(ctx, col, 0.02));
        }
}

/** 路：沿折线铺一条混凝土步道，边上一道深色路缘 */
function pathStrip(ctx: BuildContext, pts: readonly XZ[], w: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as XZ;
    const b = pts[i] as XZ;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / 4));
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      ctx.flat.box(x, 0.005, z, w + 0.5, 0.03, len / n + 0.5, jit(ctx, PAL.paveD, 0.02), ry);
      ctx.flat.box(x, 0.01, z, w, 0.04, len / n + 0.5, jit(ctx, PAL.path[k % 2] as string, 0.015), ry);
    }
  }
}

/** 废弃的硬地场：褪色、开裂、长草，网塌着（在覆盖层里画：修好以后整块换掉，裂缝里的草不会留下来） */
export function wornCourt(ctx: BuildContext, fr: CourtFrame, withNet = true): void {
  surface(ctx, fr, PAL.courtInWorn, PAL.courtOutWorn, {
    worn: 0.12,
    cracks: 10,
    weeds: 0.45,
    puddles: 0,
    missing: 0.45,
    lineCol: '#d8d2c2',
  });
  if (withNet) net(ctx, fr, 'sag');
}

/** 远处的沙漠群山：粉紫褐色的体素山脊，岩层一条条的。不投影（省一遍阴影） */
function mountains(scene: BuildContext['scene']): void {
  const far = new VoxelBatcher();
  const C = 8;
  const height = (x: number, z: number) => {
    // 北边的山从 z=-86 往北升高，西边的从 x=-114 往西升高
    const tn = Math.min(1, Math.max(0, (-86 - z) / 70));
    const tw = Math.min(1, Math.max(0, (-114 - x) / 60));
    const t = Math.max(tn, tw);
    if (t <= 0) return 0;
    const r = ridged(x * 0.008, z * 0.014);
    let h = t ** 1.3 * 70 * (0.3 + 0.9 * r) + fbm(x * 0.03, z * 0.03) * 3 * t;
    h *= 0.7 + 0.45 * fbm(x * 0.006 + 3, 1.7, 2);
    return Math.max(0, Math.floor(h / 2.5) * 2.5 - 1);
  };
  for (let x = -216; x < 208; x += C)
    for (let z = -184; z < 152; z += C) {
      const cx = x + C / 2;
      const cz = z + C / 2;
      const h = height(cx, cz);
      if (h <= 0) continue;
      // 四周最矮的邻居以下看不见，用一个盒子填上；往上一层层岩层，每 5 米换一种颜色，层的高低随噪声起伏
      const m = Math.min(height(cx - C, cz), height(cx + C, cz), height(cx, cz - C), height(cx, cz + C));
      const off = fbm(cx * 0.05, cz * 0.05) * 6;
      let y = -0.3;
      if (m > 1) {
        far.box(cx, y, cz, C, m - 0.3 - 0.01, C, PAL.mountain[0]);
        y = m - 0.3;
      }
      while (y < h) {
        const band = Math.floor((y + off) / 5);
        const top = Math.min(h, (band + 1) * 5 - off);
        const c = PAL.mountain[((band % PAL.mountain.length) + PAL.mountain.length) % PAL.mountain.length] as string;
        const shade = hash2(cx, cz + band) * 0.03 - 0.015;
        far.box(cx, y, cz, C + 0.02, Math.max(0.5, top - y), C + 0.02, shadeHex(c, shade));
        y = Math.max(top, y + 0.5);
      }
      // 山顶零星的灌木
      if (h > 6 && hash2(cx * 3, cz * 7) < 0.04) far.box(cx, h, cz, 2.4, 0.8, 2.4, '#6f6a44');
    }
  far.build(scene, false, false);
}

const shadeHex = (hex: string, d: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + d))));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
};

/** 园区围墙：低矮的灰泥墙，一段段剥落、倒塌，墙根积沙 */
function perimeter(ctx: BuildContext): void {
  const C = CAMPUS;
  const runs: [number, number, number, number][] = [
    [C.x0, C.z1, C.x0, C.z0],
    [C.x0, C.z0, LOT_WALL_X, C.z0],
    [LOT_WALL_X, C.z0, LOT_WALL_X, -56],
    [LOT_WALL_X, -46, LOT_WALL_X, -30],
    [LOT_WALL_X, -30, ARCH_X, -30],
    [ARCH_X, -30, ARCH_X, -9],
    [ARCH_X, 9, ARCH_X, C.z1],
    [ARCH_X, C.z1, C.x0, C.z1],
  ];
  for (const [x0, z0, x1, z1] of runs) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 4));
    const ry = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const x = x0 + (x1 - x0) * u;
      const z = z0 + (z1 - z0) * u;
      const r = ctx.rand();
      if (r < 0.08) continue;
      const h = r < 0.25 ? sr(ctx, 0.3, 0.9) : 1.5;
      ctx.solid.box(x, 0, z, 0.5, h, len / n + 0.02, jit(ctx, PAL.wallD, 0.04), ry);
      if (k % 4 === 0 && h > 1) ctx.solid.box(x, 0, z, 0.8, 1.8, 0.8, jit(ctx, PAL.pier, 0.03), ry);
      if (ctx.rand() < 0.3) sandPile(ctx, x + sr(ctx, -1, 1), 0, z + sr(ctx, -1, 1), sr(ctx, 1, 2));
    }
  }
}

/* ---------------- 各处 ---------------- */

function parking(ctx: BuildContext): void {
  const P = PARKING;
  for (let x = P.x0; x < LOT_WALL_X - 1; x += 4)
    for (let z = P.z0; z < P.z1; z += 4)
      ctx.flat.box(
        x + 2,
        -0.03,
        z + 2,
        4,
        0.06,
        4,
        jit(ctx, PAL.asphalt[Math.floor(fbm(x * 0.1, z * 0.1) * 5) % 3] as string, 0.02),
      );
  // 四排车位线，中间两条车道
  for (const zr of [P.z0 + 4, P.z0 + 14, P.z0 + 20, P.z0 + 30])
    for (let x = P.x0 + 2; x < LOT_WALL_X - 2; x += 3)
      if (ctx.rand() > 0.15) ctx.flat.box(x, 0.03, zr, 0.15, 0.02, 5, jit(ctx, PAL.stripe, 0.04));
  // 车道上的箭头位置画一道黄线（褪色）
  for (let x = P.x0 + 4; x < LOT_WALL_X - 4; x += 4)
    if (ctx.rand() > 0.3) ctx.flat.box(x, 0.03, P.z0 + 25, 2, 0.02, 0.18, '#bfa04a');
  // 沙子从东北角漫进来，盖住大半个停车场
  for (let x = P.x0; x < LOT_WALL_X; x += 3)
    for (let z = P.z0; z < P.z1; z += 3) {
      const k = (x - P.x0) / (LOT_WALL_X - P.x0) + ((P.z1 - z) / (P.z1 - P.z0)) * 0.7 + fbm(x * 0.12, z * 0.12) * 0.6;
      if (k > 1.15) {
        const h = Math.min(0.9, (k - 1.15) * 1.4) + 0.06;
        ctx.flat.box(x + 1.5, 0, z + 1.5, 3.2, h, 3.2, jit(ctx, h > 0.5 ? PAL.sand[0] : PAL.sand[1], 0.015));
      }
    }
  // 锈车，几辆半埋在沙里
  const cars: [number, number, number][] = [
    [56, -66, 0.05],
    [65, -66, -0.1],
    [80, -66, 0.15],
    [59, -50, 0.1],
    [71, -50, -0.05],
    [90, -46, 1.3],
    [62, -40, 3.1],
  ];
  for (const [x, z, ry] of cars) car(ctx, x, z, ry, pickc(ctx, PAL.rust), true);
  // 接驳巴士：窗户碎了
  ctx.solid.box(84, 0.3, -58, 3, 2.8, 11, jit(ctx, '#c8c0ae', 0.04), Math.PI / 2 + 0.08);
  for (let k = 0; k < 4; k++) ctx.solid.box(80 + k * 2.6, 1.7, -56.4, 1.8, 0.9, 0.1, k % 2 ? '#2b3034' : '#56636a');
  lightPole(ctx, P.x0 + 6, P.z0 + 25, 8);
  lightPole(ctx, P.x0 + 26, P.z0 + 25, 8, true);
  lightPole(ctx, P.x0 + 44, P.z0 + 25, 8);
}

function road(ctx: BuildContext): void {
  for (let z = SITE.z0 - 8; z < SITE.z1 + 8; z += 4) {
    ctx.flat.box(
      (ROAD.x0 + ROAD.x1) / 2,
      -0.02,
      z + 2,
      ROAD.x1 - ROAD.x0,
      0.05,
      4,
      jit(ctx, pickc(ctx, PAL.asphalt), 0.02),
    );
    if ((z / 4) % 2 === 0) ctx.flat.box((ROAD.x0 + ROAD.x1) / 2, 0.03, z + 2, 0.2, 0.02, 2, '#c9a54a');
    if (fbm(z * 0.05, 3) > 0.55) sandPile(ctx, ROAD.x0 + sr(ctx, 0, 7), 0, z + 2, sr(ctx, 1.2, 2.4));
  }
  // 停车场出口
  for (let x = LOT_WALL_X - 1; x < ROAD.x0; x += 2)
    ctx.flat.box(x + 1, -0.02, -51, 2, 0.05, 9, jit(ctx, PAL.asphalt[0], 0.02));
}

function gate(ctx: BuildContext): void {
  // 门前广场
  for (let x = 80; x < ROAD.x0; x += 4)
    for (let z = -14; z < 14; z += 4)
      ctx.flat.box(x + 2, 0, z + 2, 4, 0.05, 4, jit(ctx, PAL.pave[((x + z) / 4) & 1] as string, 0.02));
  // 门楼：两座方塔、上面一道横梁和招牌
  for (const z of [-8, 8]) {
    ctx.solid.box(ARCH_X, 0, z, 2.2, 7.5, 2.2, jit(ctx, PAL.facade, 0.03));
    ctx.solid.box(ARCH_X, 7.5, z, 2.6, 0.5, 2.6, jit(ctx, PAL.pier, 0.03));
    ctx.solid.box(ARCH_X, 0, z, 2.5, 0.6, 2.5, jit(ctx, PAL.concrete[1], 0.03));
  }
  ctx.solid.box(ARCH_X, 5.8, 0, 1.4, 1.5, 15, jit(ctx, '#7a6a58', 0.03));
  sign(ctx.scene, 'INDIAN WELLS TENNIS GARDEN', 13, 1.1, ARCH_X + 0.72, 6.55, 0, Math.PI / 2, '#5d5446', '#d8cdb4', 24);
  // 闸机
  for (let z = -6; z <= 6; z += 3)
    if (Math.abs(z) > 1) ctx.solid.box(ARCH_X + 2, 0, z, 1.6, 1, 0.4, jit(ctx, '#7d8084', 0.04));
  // 售票亭：钉了木板
  for (const z of [-12, 12]) {
    ctx.solid.box(ARCH_X + 5, 0, z, 3.2, 2.8, 3.2, jit(ctx, PAL.wall, 0.03));
    ctx.solid.box(ARCH_X + 5, 2.8, z, 3.8, 0.3, 3.8, jit(ctx, '#7a6a58', 0.03));
    ctx.solid.box(ARCH_X + 6.65, 1, z, 0.08, 1.2, 2, PAL.glassBroken);
    ctx.solid.box(ARCH_X + 6.72, 1.6, z, 0.08, 0.25, 2.2, PAL.board, 0, 0.5);
    ctx.solid.box(ARCH_X + 6.74, 1.6, z, 0.08, 0.25, 2.2, PAL.board, 0, -0.5);
  }
  // 三根旗杆（没有旗；会所开张后挂上）
  for (const z of [-4, 0, 4]) ctx.solid.box(ARCH_X + 9, 0, z, 0.15, 9, 0.15, '#9a9ea2');
}

function clubhouse(ctx: BuildContext): void {
  const C = CLUBHOUSE;
  const cx = (C.x0 + C.x1) / 2;
  const w = C.x1 - C.x0;
  const d = C.z1 - C.z0;
  // 台基、一楼、二楼（往后退出一条露台）
  ctx.solid.box(cx, 0, (C.z0 + C.z1) / 2, w + 1.2, 0.35, d + 1.2, jit(ctx, PAL.concrete[1], 0.02));
  ctx.solid.box(cx, 0.35, (C.z0 + C.z1) / 2, w, 3.9, d, jit(ctx, PAL.wall, 0.02));
  ctx.solid.box(cx - 3, 4.25, C.z0 + (d - 4) / 2, w - 8, 3.4, d - 4, jit(ctx, PAL.wall, 0.02));
  // 一楼屋顶（露台）的女儿墙
  ctx.solid.box(cx, 4.25, C.z1 - 0.2, w, 0.7, 0.4, jit(ctx, PAL.wallD, 0.02));
  // 二楼屋顶：一格格板子，开局有洞（overlays 修好时补上）
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 5; j++) {
      const x = C.x0 + 1 + (i + 0.5) * ((w - 8) / 9);
      const z = C.z0 + (j + 0.5) * ((d - 4) / 5);
      const hole = hash2(i * 7 + 3, j * 5 + 1) < 0.2;
      ctx.solid.box(
        x,
        7.65,
        z,
        (w - 8) / 9 + 0.02,
        0.3,
        (d - 4) / 5 + 0.02,
        hole ? '#3b3530' : jit(ctx, PAL.roof, 0.04),
      );
    }
  ctx.solid.box(cx - 3, 7.95, C.z0 + 0.1, w - 8, 0.5, 0.3, jit(ctx, PAL.wallD, 0.02));
  // 一楼南面的大玻璃、二楼的窗；一半碎了
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 3.2) {
    const broken = hash2(x * 3, 1) < 0.5;
    ctx.solid.box(x, 0.9, C.z1 + 0.02, 2.6, 2.5, 0.08, broken ? PAL.glassBroken : PAL.glass);
  }
  for (let x = C.x0 + 2.5; x < C.x1 - 10; x += 3.2) {
    const broken = hash2(x * 5, 2) < 0.5;
    ctx.solid.box(x, 5.1, C.z1 - 4 + 0.02, 2, 1.6, 0.08, broken ? PAL.glassBroken : PAL.glass);
  }
  // 东墙的窗（手机竖屏从东边看过来）
  for (let z = C.z0 + 2; z < C.z1 - 1; z += 3.2)
    ctx.solid.box(C.x1 + 0.02, 1.2, z, 0.08, 2, 2, hash2(z, 9) < 0.5 ? PAL.glassBroken : PAL.glass);
  // 门廊：四根柱子顶一块雨棚
  for (const x of [-12, -4])
    for (const z of [C.z1 + 3.4]) ctx.solid.box(x, 0, z, 0.5, 3.6, 0.5, jit(ctx, PAL.pier, 0.03));
  ctx.solid.box(-8, 3.6, C.z1 + 1.7, 10, 0.35, 4, jit(ctx, '#8a7a68', 0.03));
  // 褪色的招牌
  sign(ctx.scene, 'CLUBHOUSE', 7, 0.9, cx, 4.6, C.z1 + 0.05, 0, '#8a8072', '#d7cdb8', 24);
}

function plaza(ctx: BuildContext): void {
  const P = PLAZA;
  // 铺地：两种灰色的大方砖
  for (let x = P.x0 - 2; x < P.x1 + 2; x += 4)
    for (let z = P.z0; z < P.z1; z += 4)
      ctx.flat.box(x + 2, 0, z + 2, 4, 0.06, 4, jit(ctx, PAL.pave[((x + z) / 4) & 1] as string, 0.02));
  // 喷泉：一圈池沿、池底和中间的雕塑
  for (let a = 0; a < Math.PI * 2; a += 0.3)
    ctx.solid.box(
      FOUNTAIN.x + Math.cos(a) * FOUNTAIN.r,
      0,
      FOUNTAIN.z + Math.sin(a) * FOUNTAIN.r,
      0.7,
      0.75,
      1.7,
      jit(ctx, PAL.concrete[2], 0.03),
      -a,
    );
  ctx.flat.box(FOUNTAIN.x, 0.06, FOUNTAIN.z, FOUNTAIN.r * 1.75, 0.04, FOUNTAIN.r * 1.75, '#9a907e');
  ctx.solid.box(FOUNTAIN.x, 0, FOUNTAIN.z, 1.6, 1.2, 1.6, jit(ctx, PAL.concrete[1], 0.03));
  ctx.solid.box(FOUNTAIN.x, 1.2, FOUNTAIN.z, 0.8, 1.6, 0.8, jit(ctx, PAL.concrete[2], 0.03));
  ctx.solid.box(FOUNTAIN.x, 2.8, FOUNTAIN.z, 1.6, 0.3, 1.6, jit(ctx, PAL.concrete[0], 0.03));
  // 长水池（东边，南北向）：池沿和干了的池底
  ctx.solid.box(70, 0, -4, 3.6, 0.5, 18, jit(ctx, PAL.concrete[2], 0.03));
  ctx.flat.box(70, 0.5, -4, 2.6, 0.02, 17, '#958b79');
  // 餐饮棚的柱子（棚顶在 overlays 里：塌的、修好的）
  for (const x of [P.x0 + 2, P.x0 + 10, P.x1 - 10, P.x1 - 2])
    ctx.solid.box(x, 0, P.z1 - 1, 0.35, 3.4, 0.35, jit(ctx, '#7a6a58', 0.05));
  for (const x of [P.x0 + 2, P.x0 + 10, P.x1 - 1])
    ctx.solid.box(x, 0, P.z1 - 5, 0.35, 3.4, 0.35, jit(ctx, '#7a6a58', 0.05));
  // 两个售卖亭（关着）
  for (const x of [P.x0 + 6, P.x1 - 4]) {
    ctx.solid.box(x, 0, P.z1 - 1.8, 4, 2.6, 2.4, jit(ctx, PAL.wall, 0.03));
    ctx.solid.box(x, 0.9, P.z1 - 3.02, 3.2, 1.3, 0.06, '#8a7f6e');
  }
}

/** Stadium 1：大碗，东南角上半截塌了（碎石在 overlays 里，重建后补上） */
function stadium1(ctx: BuildContext): void {
  // 场地四周的场边地面
  ctx.flat.box(S1.cx, -0.01, S1.cz, S1_BOWL.ix * 2 + 1, 0.05, S1_BOWL.iz * 2 + 1, jit(ctx, '#8a8190', 0.02));
  stands(ctx, S1_SPEC, {
    risers: true,
    seat: s1Seat(false),
    skip: (s, r) => s1Gap(s) || s1Collapsed(s, r),
  });
  const top = S1_BOWL.rows * S1_BOWL.rise;
  facade(ctx, S1_SPEC, top + 1.4, (s) => s1Gap(s) || s1Collapsed(s, 9));
  // 塌了的那段外墙只剩半截
  facade(ctx, S1_SPEC, top + 1.4, (s) => s1Gap(s) || !s1Collapsed(s, 9), true);
  // 入场口两边的门柱和横梁
  const e = S1.cx + S1_BOWL.ix + S1_BOWL.rows + 0.4;
  for (const z of [S1.cz - 3.2, S1.cz + 8.7]) ctx.solid.box(e, 0, z, 1.2, top + 1.6, 1.2, jit(ctx, PAL.pier, 0.03));
  ctx.solid.box(e, top - 0.4, S1.cz + 2.75, 1.2, 2, 11.9, jit(ctx, PAL.facade, 0.03));
  const s = S1.cz + S1_BOWL.iz + S1_BOWL.rows + 0.4;
  for (const x of [S1.cx - 3.4, S1.cx + 3.4]) ctx.solid.box(x, 0, s, 1.2, top + 1.6, 1.2, jit(ctx, PAL.pier, 0.03));
  ctx.solid.box(S1.cx, top - 0.4, s, 7.9, 2, 1.2, jit(ctx, PAL.facade, 0.03));
  // 四角的灯塔（东南那根倒了，只剩桩）
  for (const [x, z, ok] of [
    [-30, -24, true],
    [30, -24, true],
    [-30, 24, true],
    [30, 24, false],
  ] as const) {
    if (!ok) {
      ctx.solid.box(x, 0, z, 0.6, 2.2, 0.6, '#6e7175');
      continue;
    }
    ctx.solid.box(x, 0, z, 0.6, 13, 0.6, jit(ctx, '#7d8084', 0.03));
    ctx.solid.box(x, 13, z, 2.8, 1.6, 0.6, '#5d6064', Math.atan2(-x, -z));
  }
}

function stadium2(ctx: BuildContext): void {
  ctx.flat.box(S2.cx, -0.01, S2.cz, 42, 0.05, 2 * S2_STANDS.iz, jit(ctx, '#8a8190', 0.02));
  for (const sp of [S2_SPEC_N, S2_SPEC_S]) {
    stands(ctx, sp, { risers: true, seat: s2Seat(false) });
    facade(ctx, sp, sp.rows * sp.rise + 1, () => false);
  }
  // 西头一块记分牌（坏的）
  ctx.solid.box(S2_STANDS.x0 - 3, 0, S2.cz, 0.5, 6, 0.5, '#6e7175');
  ctx.solid.box(S2_STANDS.x0 - 3, 4, S2.cz, 0.6, 3, 8, '#3a3d40');
}

function stadium3(ctx: BuildContext): void {
  const { hx, hz } = S3_PIT;
  // 坑底、坑壁和坑沿
  ctx.flat.box(S3.cx, -S3.depth - 0.1, S3.cz, 2 * hx + 1, 0.1, 2 * hz + 1, jit(ctx, '#a99a80', 0.02));
  for (const [x, z, w, d] of [
    [S3.cx, S3.cz - hz - 1, 2 * hx + 4, 2],
    [S3.cx, S3.cz + hz + 1, 2 * hx + 4, 2],
    [S3.cx - hx - 1, S3.cz, 2, 2 * hz],
    [S3.cx + hx + 1, S3.cz, 2, 2 * hz],
  ] as const) {
    ctx.solid.box(x, -S3.depth, z, w, S3.depth + 0.12, d, jit(ctx, PAL.concrete[0], 0.02));
  }
  for (const sp of S3_SPECS) stands(ctx, sp, { risers: true, riserCol: PAL.rust, seat: null });
}

/** 练习场和外场的破围网（场地面、网和沙由 overlay 按状态画） */
function smallCourts(ctx: BuildContext): void {
  for (const fr of [F_P1, F_P2]) {
    pen(ctx, fr, { gate: 'E', holes: [2, 5, 9, 14, 17], lean: 0.5, peel: 7 });
  }
  pen(ctx, F_O1, { gate: 'N', holes: [3, 11], lean: 0.35, peel: 9 });
  for (const fr of [F_O2, F_O3]) {
    pen(ctx, fr, { gate: 'N', holes: [1, 2, 6, 10, 13, 16], lean: 0.6 });
  }
  // 练习场旁边的小棚子（顶塌了一半）
  ctx.solid.box(-46, 0, 8, 0.25, 2.6, 0.25, '#6e6a62');
  ctx.solid.box(-46, 0, 12, 0.25, 2.6, 0.25, '#6e6a62');
  ctx.solid.box(-47, 1.8, 10, 2.6, 0.15, 5, jit(ctx, '#8a7a68', 0.04), 0, 0, 0.5);
}

/** 不归哪个设施的棕榈：环路四角、大门、路边 */
const PALMS: [number, number, PalmKind][] = [
  [-40, -34, 'dead'],
  [40, -34, 'ok'],
  [-40, 34, 'snap'],
  [40, 34, 'dead'],
  [78, -22, 'dead'],
  [78, 22, 'ok'],
  [84, -14, 'snap'],
  [84, 14, 'dead'],
  [114, -40, 'dead'],
  [114, -10, 'ok'],
  [114, 20, 'dead'],
  [114, 50, 'snap'],
  [-34, 40, 'dead'],
  [32, 36, 'ok'],
  [-44, -14, 'dead'],
  [-44, 24, 'snap'],
];

export interface IndianWellsStatic {
  readonly courts: readonly CourtFrame[];
}

/** 构建静态场景。调用顺序就是画面（同一条随机流）。 */
export function buildIndianWells(ctx: BuildContext): IndianWellsStatic {
  ground(ctx);
  mountains(ctx.scene);
  deadLawns(ctx);
  perimeter(ctx);

  /* 步道：各地点到环路 */
  const anchors = Object.keys(STANDS);
  const drawn = new Set<string>();
  for (const a of anchors)
    for (const b of anchors) {
      if (a >= b) continue;
      const l = routeLine(a, b);
      if (!l) continue;
      for (let i = 1; i < l.length; i++) {
        const key = [l[i - 1], l[i]]
          .map((p) => `${p?.x},${p?.z}`)
          .sort()
          .join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);
        pathStrip(ctx, [l[i - 1] as XZ, l[i] as XZ], 3.4);
      }
    }

  parking(ctx);
  road(ctx);
  gate(ctx);
  clubhouse(ctx);
  plaza(ctx);
  stadium1(ctx);
  stadium2(ctx);
  stadium3(ctx);
  smallCourts(ctx);
  for (const [x, z, k] of PALMS) palm(ctx, x, z, sr(ctx, 7, 10), k);

  /* 墙外的沙漠：灌木和石头 */
  for (let k = 0; k < 170; k++) {
    const x = sr(ctx, SITE.x0 - 6, SITE.x1 + 6);
    const z = sr(ctx, SITE.z0 - 6, SITE.z1 + 6);
    if (inCampus(x, z) || inRect(ROAD_R, x, z, 1.5) || inRect({ x0: 80, x1: ROAD.x0, z0: -14, z1: 14 }, x, z)) continue;
    shrub(ctx, x, z);
  }
  /* 园区里到处都是的小东西：杂草、风滚草、沙堆（不落在场地、看台、草坪和广场上：修好以后那里是干净的） */
  const clutterOk = (x: number, z: number) =>
    !inPit(x, z) &&
    !FRAMES.some((f) => f.inside(x, z, 2)) &&
    !inRect({ x0: S1.cx - S1.hx, x1: S1.cx + S1.hx, z0: S1.cz - S1.hz, z1: S1.cz + S1.hz }, x, z) &&
    !inRect(PLAZA, x, z, 3) &&
    !Object.values(LAWNS).some((rs) => rs.some((r) => inRect(r, x, z)));
  for (let k = 0; k < 70; k++) {
    const x = sr(ctx, CAMPUS.x0, CAMPUS.x1);
    const z = sr(ctx, CAMPUS.z0, CAMPUS.z1);
    if (clutterOk(x, z)) weed(ctx, x, 0, z, 4);
  }
  for (let k = 0; k < 14; k++) {
    const x = sr(ctx, SITE.x0, SITE.x1);
    const z = sr(ctx, SITE.z0, SITE.z1);
    const s = sr(ctx, 0.8, 1.4);
    if (clutterOk(x, z)) tumbleweed(ctx, x, 0, z, s);
  }
  for (let k = 0; k < 40; k++) {
    const x = sr(ctx, SITE.x0, SITE.x1);
    const z = sr(ctx, SITE.z0, SITE.z1);
    const r = sr(ctx, 1, 3);
    if (clutterOk(x, z)) sandPile(ctx, x, 0, z, r);
  }

  ctx.flat.build(ctx.scene, false, true);
  ctx.solid.build(ctx.scene, true, true);
  return { courts: [F_S1, F_S2, F_S3, F_P1, F_P2, F_O1, F_O2, F_O3] };
}
