import type { XZ } from '@td/shared';
import { net, pen, surface, weed } from '../../props/court';
import { sign } from '../../voxel/text';
import { type BuildContext, jit, sr } from '../../world/build-context';
import type { CourtFrame } from '../../world/frame';
import {
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
  GATE,
  PARKING,
  PLAZA,
  routeLine,
  S1,
  S2,
  S3,
  SITE,
  STANDS,
} from './layout';

/**
 * Indian Wells 的灰盒场景（P0）：平地、色块和现成的场地道具，先让玩法跑在对的布局上。
 * 静态部分是"废弃但看得出原样"的底子；各设施开局的破败（积沙、倒网）和修好以后的样子
 * 是 overlays.ts 里按状态显示的一层。精细的废弃场景（P3）以后替换这里。
 */

export const PAL = {
  sand: ['#d9bb8c', '#d4b383', '#dcc195', '#cfae7e'],
  path: '#c9bda4',
  asphalt: ['#6a645b', '#726b61', '#625c54'],
  concrete: ['#b9b0a0', '#aea595', '#c2b9a8'],
  seat: ['#6e8f8c', '#7b9894', '#65827f', '#8aa29c'],
  seatFaded: ['#9aa79f', '#a3aca2', '#8f9c95'],
  rust: ['#8a5a3a', '#7a4e34', '#93643f'],
  courtIn: '#6f8191',
  courtOut: '#8b9884',
  roof: '#8a7a68',
  wall: '#cdbfa6',
  board: '#a8875a',
  dead: ['#8a7a52', '#7d6e4a', '#9a8a5e'],
  palm: ['#5f7a3e', '#6b8444', '#56703a'],
  mountain: ['#c9a07a', '#b08068', '#9a6e72', '#b48a76', '#8a6878'],
} as const;

const pickc = (ctx: BuildContext, xs: readonly string[]) => xs[Math.floor(ctx.rand() * xs.length)] as string;

/** 一块沙堆：几层越往上越小的扁盒 */
export function sandPile(ctx: BuildContext, x: number, y: number, z: number, r: number): void {
  for (let k = 0; k < 3; k++) {
    const s = r * (1 - k * 0.3);
    ctx.flat.box(
      x + sr(ctx, -0.3, 0.3),
      y + k * 0.12,
      z + sr(ctx, -0.3, 0.3),
      s * sr(ctx, 1.4, 2),
      0.14,
      s * sr(ctx, 0.8, 1.2),
      jit(ctx, pickc(ctx, PAL.sand), 0.04),
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

/** 棕榈树：healthy / dead（一圈干叶裙）/ snapped（断头） */
export function palm(ctx: BuildContext, x: number, z: number, h: number, kind: 'ok' | 'dead' | 'snap'): void {
  const trunk = kind === 'snap' ? h * 0.45 : h;
  for (let y = 0; y < trunk; y += 0.6) ctx.solid.box(x, y, z, 0.42, 0.62, 0.42, jit(ctx, '#8a7458', 0.06));
  if (kind === 'snap') {
    // 断下来的树冠躺在地上
    ctx.solid.box(x + 1.2, 0, z + 0.6, 0.42, 0.42, h * 0.5, jit(ctx, '#8a7458', 0.05), 0.6, Math.PI / 2);
    return;
  }
  const leaf = kind === 'dead' ? PAL.dead : PAL.palm;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + sr(ctx, -0.2, 0.2);
    ctx.solid.box(x, trunk, z, 0.3, 0.12, 2.6, jit(ctx, pickc(ctx, leaf), 0.05), a, kind === 'dead' ? 0.9 : 0.35);
  }
  if (kind === 'dead')
    for (let y = trunk - 1.6; y < trunk; y += 0.4) ctx.solid.box(x, y, z, 0.9, 0.45, 0.9, jit(ctx, '#8f7c55', 0.05));
}

/** 一段看台：沿 (x0,z0)→(x1,z1) 的一排排台阶，朝向场内。skip 返回 true 的格子不放（塌了的地方） */
function standRows(
  ctx: BuildContext,
  a: XZ,
  b: XZ,
  inward: XZ,
  rows: number,
  rowD: number,
  rise: number,
  y0: number,
  colors: readonly string[],
  skip: (x: number, z: number, row: number) => boolean = () => false,
): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.round(len / 2));
  const ry = Math.atan2(b.x - a.x, b.z - a.z);
  for (let r = 0; r < rows; r++) {
    const off = (rows - r - 0.5) * rowD;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = a.x + (b.x - a.x) * u - inward.x * off;
      const z = a.z + (b.z - a.z) * u - inward.z * off;
      if (skip(x, z, r)) continue;
      const h = (rows - r) * rise;
      const missing = ctx.rand() < 0.12;
      ctx.solid.box(
        x,
        y0,
        z,
        rowD,
        h,
        len / n - 0.04,
        jit(ctx, missing ? pickc(ctx, PAL.concrete) : pickc(ctx, colors), 0.04),
        ry,
      );
    }
  }
}

/** 四面看台的碗：内沿是一个 hx×hz 的矩形 */
export function bowl(
  ctx: BuildContext,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  rows: number,
  colors: readonly string[],
  o: { y0?: number; sides?: string; skip?: (x: number, z: number, row: number) => boolean } = {},
): void {
  const y0 = o.y0 ?? 0;
  const sides = o.sides ?? 'NSEW';
  const rowD = 0.9;
  const rise = 0.45;
  const W = rows * rowD;
  if (sides.includes('N'))
    standRows(
      ctx,
      { x: cx - hx - W, z: cz - hz - W / 2 },
      { x: cx + hx + W, z: cz - hz - W / 2 },
      { x: 0, z: 1 },
      rows,
      rowD,
      rise,
      y0,
      colors,
      o.skip,
    );
  if (sides.includes('S'))
    standRows(
      ctx,
      { x: cx - hx - W, z: cz + hz + W / 2 },
      { x: cx + hx + W, z: cz + hz + W / 2 },
      { x: 0, z: -1 },
      rows,
      rowD,
      rise,
      y0,
      colors,
      o.skip,
    );
  if (sides.includes('E'))
    standRows(
      ctx,
      { x: cx + hx + W / 2, z: cz - hz },
      { x: cx + hx + W / 2, z: cz + hz },
      { x: -1, z: 0 },
      rows,
      rowD,
      rise,
      y0,
      colors,
      o.skip,
    );
  if (sides.includes('W'))
    standRows(
      ctx,
      { x: cx - hx - W / 2, z: cz - hz },
      { x: cx - hx - W / 2, z: cz + hz },
      { x: 1, z: 0 },
      rows,
      rowD,
      rise,
      y0,
      colors,
      o.skip,
    );
}

/** 生锈的旧车 */
function car(ctx: BuildContext, x: number, z: number, ry: number): void {
  const c = jit(ctx, pickc(ctx, PAL.rust), 0.06);
  ctx.solid.box(x, 0.3, z, 1.8, 0.7, 4.2, c, ry);
  ctx.solid.box(x, 1.0, z, 1.6, 0.55, 2.2, jit(ctx, '#5f5a52', 0.05), ry);
  sandPile(ctx, x + sr(ctx, -1, 1), 0, z + sr(ctx, -1, 1), 1.2);
}

/** 路：沿折线铺一条浅色步道 */
function pathStrip(ctx: BuildContext, pts: readonly XZ[], w: number): void {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as XZ;
    const b = pts[i] as XZ;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / 3));
    const ry = Math.atan2(b.x - a.x, b.z - a.z);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      ctx.flat.box(
        a.x + (b.x - a.x) * u,
        0.01,
        a.z + (b.z - a.z) * u,
        w,
        0.03,
        len / n + 0.3,
        jit(ctx, PAL.path, 0.04),
        ry,
      );
    }
  }
}

/** 废弃的硬地场：褪色、开裂、长草，网塌着 */
export function wornCourt(ctx: BuildContext, fr: CourtFrame, withNet = true): void {
  surface(ctx, fr, PAL.courtIn, PAL.courtOut, {
    worn: 0.35,
    cracks: 10,
    weeds: 0.45,
    puddles: 0,
    missing: 0.45,
    lineCol: '#cfc8b4',
  });
  if (withNet) net(ctx, fr, 'sag');
}

/** 远处的沙漠群山：一层层粉紫褐色的体素山脊 */
function mountains(ctx: BuildContext): void {
  const ridge = (x0: number, x1: number, z0: number, z1: number, axis: 'x' | 'z', seed: number) => {
    for (let u = axis === 'x' ? x0 : z0; u < (axis === 'x' ? x1 : z1); u += 4) {
      const n =
        Math.sin(u * 0.05 + seed) * 0.5 + Math.sin(u * 0.13 + seed * 2) * 0.3 + Math.sin(u * 0.021 + seed * 3) * 0.4;
      for (let v = axis === 'x' ? z0 : x0; v < (axis === 'x' ? z1 : x1); v += 4) {
        const depth = axis === 'x' ? (z1 - v) / (z1 - z0) : (x1 - v) / (x1 - x0);
        const h = Math.max(1, (8 + n * 8) * depth + depth * 10);
        const band = PAL.mountain[Math.min(PAL.mountain.length - 1, Math.floor(h / 6))] as string;
        const x = axis === 'x' ? u : v;
        const z = axis === 'x' ? v : u;
        ctx.solid.box(x + 2, -0.2, z + 2, 4.02, h, 4.02, jit(ctx, band, 0.03));
      }
    }
  };
  ridge(SITE.x0 - 40, SITE.x1 + 20, SITE.z0 - 44, SITE.z0 - 8, 'x', 1.3);
  ridge(SITE.x0 - 44, SITE.x0 - 8, SITE.z0 - 8, SITE.z1 + 20, 'z', 2.7);
}

export interface IndianWellsStatic {
  /** 相机朝向那一侧的围网可以藏起来：main.ts 按 userData.fenceNormal 找 */
  readonly courts: readonly CourtFrame[];
}

/** 构建静态场景。调用顺序就是画面（同一条随机流）。 */
export function buildIndianWells(ctx: BuildContext): IndianWellsStatic {
  const { flat, solid } = ctx;

  /* 地面：一大片沙地 */
  for (let x = SITE.x0 - 8; x < SITE.x1 + 8; x += 8)
    for (let z = SITE.z0 - 8; z < SITE.z1 + 8; z += 8)
      flat.box(x + 4, -0.2, z + 4, 8, 0.2, 8, jit(ctx, pickc(ctx, PAL.sand), 0.03));
  mountains(ctx);

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
        pathStrip(ctx, [l[i - 1] as XZ, l[i] as XZ], 3);
      }
    }

  /* 停车场：褪色的沥青，大半被沙盖住，几辆锈车 */
  for (let x = PARKING.x0; x < PARKING.x1; x += 4)
    for (let z = PARKING.z0; z < PARKING.z1; z += 4)
      flat.box(
        x + 2,
        -0.05,
        z + 2,
        4,
        0.08,
        4,
        jit(ctx, ctx.rand() < 0.45 ? pickc(ctx, PAL.sand) : pickc(ctx, PAL.asphalt), 0.03),
      );
  for (let k = 0; k < 14; k++)
    sandPile(ctx, sr(ctx, PARKING.x0, PARKING.x1), 0, sr(ctx, PARKING.z0, PARKING.z1), sr(ctx, 1.5, 3.5));
  car(ctx, 62, -60, 0.1);
  car(ctx, 74, -52, -0.2);
  car(ctx, 90, -44, 1.5);
  // 接驳巴士，窗户碎了
  solid.box(80, 0.3, -64, 3, 2.6, 11, jit(ctx, '#c8c0ae', 0.04), Math.PI / 2);
  for (let k = 0; k < 4; k++) solid.box(76 + k * 2.6, 1.6, -62.45, 1.6, 0.8, 0.1, k % 2 ? '#3b3f44' : '#5f6a70');

  /* 入口：两根门柱，横梁断了一头；售票亭钉了木板 */
  for (const z of [GATE.z0, GATE.z1]) solid.box(GATE.x, 0, z, 1.2, 6, 1.2, jit(ctx, PAL.concrete[0], 0.04));
  solid.box(GATE.x, 6, (GATE.z0 + GATE.z1) / 2 - 2, 0.8, 0.9, 13, jit(ctx, '#6a5f52', 0.04), 0, -0.35);
  solid.box(GATE.x + 4, 0, GATE.z1 + 5, 3, 3, 3, jit(ctx, PAL.wall, 0.04));
  solid.box(GATE.x + 2.45, 1, GATE.z1 + 5, 0.1, 1.2, 2, PAL.board);
  sign(
    ctx.scene,
    'INDIAN WELLS TENNIS GARDEN',
    9,
    0.9,
    GATE.x - 0.7,
    6.4,
    0,
    -Math.PI / 2,
    '#5d5446',
    '#d8cdb4',
    22,
  );

  /* 会所：两层的盒子，屋顶有洞 */
  const C = CLUBHOUSE;
  for (let x = C.x0; x < C.x1; x += 2)
    for (let z = C.z0; z < C.z1; z += 2) solid.box(x + 1, 0, z + 1, 2, 6, 2, jit(ctx, PAL.wall, 0.03));
  for (let x = C.x0; x < C.x1; x += 2)
    for (let z = C.z0; z < C.z1; z += 2)
      if (ctx.rand() > 0.12) solid.box(x + 1, 6, z + 1, 2.02, 0.3, 2.02, jit(ctx, PAL.roof, 0.05));
  // 南面的窗：一半碎了
  for (let x = C.x0 + 2; x < C.x1 - 1; x += 3)
    for (const y of [1.2, 3.8]) solid.box(x, y, C.z1 + 0.02, 1.6, 1.3, 0.06, ctx.rand() < 0.5 ? '#3b3f44' : '#6d7a80');

  /* 广场：干涸的喷泉和长水池、餐饮棚的柱子 */
  for (let x = PLAZA.x0; x < PLAZA.x1; x += 4)
    for (let z = PLAZA.z0; z < PLAZA.z1; z += 4)
      flat.box(x + 2, 0, z + 2, 4, 0.04, 4, jit(ctx, pickc(ctx, PAL.concrete), 0.03));
  for (let a = 0; a < Math.PI * 2; a += 0.35)
    solid.box(
      FOUNTAIN.x + Math.cos(a) * FOUNTAIN.r,
      0,
      FOUNTAIN.z + Math.sin(a) * FOUNTAIN.r,
      1.9,
      0.7,
      0.5,
      jit(ctx, PAL.concrete[2], 0.04),
      -a,
    );
  flat.box(FOUNTAIN.x, 0.04, FOUNTAIN.z, FOUNTAIN.r * 1.6, 0.04, FOUNTAIN.r * 1.6, '#a69a86');
  solid.box(FOUNTAIN.x, 0, FOUNTAIN.z, 1.2, 1.6, 1.2, jit(ctx, PAL.concrete[1], 0.04));
  flat.box(FOUNTAIN.x, 0.04, 9, 22, 0.05, 3, '#a39783');
  for (const x of [PLAZA.x0 + 3, PLAZA.x0 + 11, PLAZA.x1 - 9, PLAZA.x1 - 3])
    solid.box(x, 0, PLAZA.z1 - 3, 0.3, 3.4, 0.3, jit(ctx, '#7a6a58', 0.05));

  /* 棕榈：活的、死的、断头的 */
  const PALMS: [number, number, 'ok' | 'dead' | 'snap'][] = [
    [44, -20, 'dead'],
    [52, -20, 'ok'],
    [60, -20, 'snap'],
    [68, -20, 'dead'],
    [76, -10, 'ok'],
    [76, 10, 'dead'],
    [44, 20, 'snap'],
    [60, 20, 'dead'],
    [-30, -46, 'dead'],
    [14, -46, 'ok'],
    [-44, 30, 'dead'],
    [-6, 40, 'snap'],
    [36, 40, 'dead'],
  ];
  for (const [x, z, k] of PALMS) palm(ctx, x, z, sr(ctx, 6, 9), k);

  /* Stadium 1：大碗。东南角上层塌了（静态的，修好以后 overlay 补上） */
  const collapsed = (x: number, z: number, r: number) => x > S1.cx + 14 && z > S1.cz + 10 && r < 7;
  bowl(ctx, S1.cx, S1.cz, S1.hx - 10, S1.hz - 12, 12, PAL.seatFaded, { skip: collapsed });
  wornCourt(ctx, F_S1);

  /* Stadium 2：两侧看台 */
  bowl(ctx, S2.cx, S2.cz, S2.hx - 4, S2.hz - 7, 7, PAL.seatFaded, { sides: 'NS' });
  wornCourt(ctx, F_S2);

  /* Stadium 3：下沉场地，铝看台生锈 */
  for (let x = S3.cx - S3.hx + 2; x < S3.cx + S3.hx - 2; x += 4)
    for (let z = S3.cz - S3.hz + 2; z < S3.cz + S3.hz - 2; z += 4)
      flat.box(x + 2, -S3.depth - 0.1, z + 2, 4, 0.1, 4, jit(ctx, '#a99a80', 0.03));
  wornCourt(ctx, F_S3, false);
  bowl(ctx, S3.cx, S3.cz, S3.hx - 2, S3.hz - 2, 4, PAL.rust, { sides: 'NS', y0: -S3.depth });

  /* 练习场和外场：底子是褪色开裂的场地；网和沙由 overlay 按状态画 */
  for (const fr of [F_P1, F_P2]) {
    wornCourt(ctx, fr, false);
    pen(ctx, fr, { gate: 'E', holes: [2, 5, 9, 14, 17], lean: 0.5, peel: 7 });
  }
  wornCourt(ctx, F_O1, false);
  pen(ctx, F_O1, { gate: 'N', holes: [3, 11], lean: 0.35, peel: 9 });
  for (const fr of [F_O2, F_O3]) {
    wornCourt(ctx, fr, false);
    pen(ctx, fr, { gate: 'N', holes: [1, 2, 6, 10, 13, 16], lean: 0.6 });
  }

  /* 到处都是的小东西：杂草、风滚草、沙堆 */
  for (let k = 0; k < 60; k++) weed(ctx, sr(ctx, SITE.x0, SITE.x1), 0, sr(ctx, SITE.z0, SITE.z1), 4);
  for (let k = 0; k < 18; k++)
    tumbleweed(ctx, sr(ctx, SITE.x0, SITE.x1), 0, sr(ctx, SITE.z0, SITE.z1), sr(ctx, 0.8, 1.4));
  for (let k = 0; k < 20; k++) sandPile(ctx, sr(ctx, SITE.x0, SITE.x1), 0, sr(ctx, SITE.z0, SITE.z1), sr(ctx, 1, 3));

  flat.build(ctx.scene, false, true);
  solid.build(ctx.scene, true, true);
  return { courts: [F_S1, F_S2, F_S3, F_P1, F_P2, F_O1, F_O2, F_O3] };
}
