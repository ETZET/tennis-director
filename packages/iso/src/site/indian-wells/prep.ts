import { CLUB_GOLD, CLUB_GREEN, TV_CAMERA } from '../../art/events';
import { bakeArt } from '../../core/art';
import type { DrawContext } from '../../core/graph';
import { dark } from './common';
import { bench, type ShowKit, sponsorBoard, stake } from './events';
import { box, cyl, fq, type Pt } from './kit';
import { F_S1 } from './layout';

/**
 * 表演赛的四期筹备（wave2-5-contract.md 的 `prep(phase, done)`；game-design.md「表演赛分四期筹备」）。
 * ★3 起中心球场挂出四期；每一期在中心球场上看得见：
 * - prep_stands 看台：东看台后面加建两级钢架看台（白钢、蓝座椅、背后一道斜撑和栏杆）。没做完：那块地上搭着脚手架。
 * - prep_lights 夜场灯：四个角四座高灯塔（桁架、八盏灯的灯头）；做完以后天黑就亮，灯光池铺满球场。
 * - prep_service 球童和服务：网边的高脚裁判椅、两头的毛巾和饮料台、南边两张球童长凳。
 * - prep_media 赞助或转播：西头两座、北看台背墙顶上一座转播机位，东北角一辆转播车（车顶卫星锅），
 *   南边场边一排赞助灯箱（夜里亮）。
 * 没做完（done = false）的那几期只在要建的地方钉几根带橙色测量带的木桩（看台是脚手架）；没挂出来的什么也不画。
 */

export const PREP_PHASES = ['prep_stands', 'prep_lights', 'prep_service', 'prep_media'] as const;
export type PrepPhase = (typeof PREP_PHASES)[number];
export const isPrepPhase = (p: string): p is PrepPhase => (PREP_PHASES as readonly string[]).includes(p);

/** 加建看台的两级（接在 build.ts 的东看台三级后面：x 18.5 起每级 2 米、每级高 1.2） */
export const EXT_TIERS = [
  { x0: 24.5, x1: 26.5, h: 4.8 },
  { x0: 26.5, x1: 28.5, h: 6.0 },
] as const;
const EXT_Z0 = -29.5;
const EXT_Z1 = -12.5;

/** 四座灯塔 */
const TOWERS: readonly (readonly [number, number])[] = [
  [-21.5, -41.2],
  [27.6, -41.2],
  [-22.6, -10.6],
  [27.6, -10.6],
];
const TOWER_H = 19;

/* ---------------- 看台 ---------------- */

function stands(K: ShowKit, done: boolean): void {
  if (!done) {
    scaffold(K);
    stake(K, EXT_TIERS[1].x1 + 0.6, EXT_Z0 - 0.4);
    stake(K, EXT_TIERS[1].x1 + 0.6, EXT_Z1 + 0.4);
    return;
  }
  for (const t of EXT_TIERS) {
    K.cast({ x0: t.x0, x1: t.x1, z0: EXT_Z0, z1: EXT_Z1, h: t.h });
    K.add({ x0: t.x0, x1: t.x1, z0: EXT_Z0, z1: EXT_Z1, y0: 0, y1: t.h + 1.2 }, (r) => {
      const lit = r.litAt((t.x0 + t.x1) / 2, (EXT_Z0 + EXT_Z1) / 2);
      const back = t.x1 === EXT_TIERS[1].x1;
      box(r, t.x0, t.x1, EXT_Z0, EXT_Z1, 0, t.h, '#c8d0d8', {
        lit,
        top: '#3d6fb6',
        topSh: (tc) => {
          const d = r.col('#3d6fb6', 0.78, lit);
          return (x) => (x & 1 ? tc : d);
        },
        // 侧面是钢架：浅灰底上一道道深色横梁，背面（最高那级的东面）加斜撑
        sideSh: (nx, _nz, _p, cc) => {
          const d = r.col('#8a929c', 1, lit);
          const per = Math.max(3, Math.round(r.k * 1.2));
          if (back && nx === 1) return (x, y) => ((x + y) % per === 0 || (x - y) % per === 0 || y % per === 0 ? d : cc);
          return (_x, y) => (y % per === 0 ? d : cc);
        },
        // 背面挂一条俱乐部绿的长横幅（金边），远看就知道是新加的一段
        face: (nx) => {
          if (!back || nx !== 1) return;
          const zc = (EXT_Z0 + EXT_Z1) / 2;
          fq(r, 'x', t.x1, 1, 0, EXT_Z0 + 1.5, EXT_Z1 - 1.5, 3.3, 4.9, r.col(CLUB_GOLD, 1, lit));
          fq(r, 'x', t.x1 + 0.01, 1, 0, EXT_Z0 + 1.65, EXT_Z1 - 1.65, 3.45, 4.75, r.col(CLUB_GREEN, 1, lit));
          for (const dz of [-4.5, 0, 4.5])
            fq(r, 'x', t.x1 + 0.02, 1, 0, zc + dz - 0.45, zc + dz + 0.45, 3.75, 4.45, r.col('#f6f3ea', 1, lit));
        },
      });
      if (!back) return;
      // 顶上的栏杆
      const rc = r.col('#e8ecf0', 1, lit);
      const y = t.h + 1.0;
      r.wline([t.x1 - 0.1, y, EXT_Z0], [t.x1 - 0.1, y, EXT_Z1], rc);
      for (let z = EXT_Z0; z <= EXT_Z1 + 0.01; z += 2.125) r.wline([t.x1 - 0.1, t.h, z], [t.x1 - 0.1, y, z], rc);
    });
  }
}

/** 没做完的看台：加建那块地上搭着脚手架，地上一捆钢管 */
function scaffold(K: ShowKit): void {
  const x0 = EXT_TIERS[0].x0;
  const x1 = EXT_TIERS[1].x1;
  K.add({ x0, x1, z0: EXT_Z0, z1: EXT_Z1, y0: 0, y1: 6.4 }, (r) => {
    const lit = r.litAt((x0 + x1) / 2, (EXT_Z0 + EXT_Z1) / 2);
    const pc = r.col('#a8b0ba', 1, lit);
    for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) {
      const h = x < x0 + 1 ? 4.8 : 6.2;
      for (let z = EXT_Z0 + 0.3; z <= EXT_Z1; z += 2.1) r.wline([x, 0, z], [x, h, z], pc);
      for (const y of [1.6, 3.2, h]) r.wline([x, y, EXT_Z0 + 0.3], [x, y, EXT_Z1 - 0.2], pc);
      for (let z = EXT_Z0 + 0.3; z + 2.1 <= EXT_Z1; z += 4.2) r.wline([x, 0, z], [x, 3.2, z + 2.1], pc);
    }
    // 两层木跳板
    for (const [y, xa, xb] of [
      [3.2, x0 + 0.2, (x0 + x1) / 2],
      [4.8, (x0 + x1) / 2, x1 - 0.2],
    ] as const)
      box(r, xa, xb, EXT_Z0 + 2.4, EXT_Z1 - 4.2, y - 0.12, y, '#c99a58', { lit, edge: false });
  });
  // 一捆钢管
  const bx = x1 + 1.6;
  const bz = -20;
  K.add({ x0: bx - 0.5, x1: bx + 0.5, z0: bz - 2, z1: bz + 2, y0: 0, y1: 0.5 }, (r) => {
    const lit = r.litAt(bx, bz);
    for (let i = 0; i < 4; i++)
      r.wline(
        [bx - 0.3 + (i % 2) * 0.25, 0.1 + (i >> 1) * 0.15, bz - 1.8],
        [bx - 0.3 + (i % 2) * 0.25, 0.1 + (i >> 1) * 0.15, bz + 1.8],
        r.col('#c0c8d0', 1, lit),
        Math.max(1, Math.round(r.k * 0.12)),
      );
  });
}

/* ---------------- 灯塔 ---------------- */

function towers(K: ShowKit, done: boolean): void {
  if (!done) {
    for (const [x, z] of TOWERS) stake(K, x, z);
    return;
  }
  const cx = F_S1.ox;
  const cz = F_S1.oz;
  for (const [x, z] of TOWERS) {
    // 灯光池打在场地上（往球场中心偏 45%）
    K.lampAt({ x: x + (cx - x) * 0.45, z: z + (cz - z) * 0.45, r: 17, i: 0.95 });
    K.cast({ x, z, h: TOWER_H, r: 0.9, tw: 0.3 });
    K.add({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, y0: 0, y1: TOWER_H + 1.5 }, (r) => tower(r, x, z));
  }
}

function tower(r: DrawContext, x: number, z: number): void {
  const lit = r.litAt(x, z);
  const H = TOWER_H;
  const mc = r.col('#7a828c', 1, lit);
  const md = r.col('#5a6069', 1, lit);
  // 桁架：两根往上收的主杆 + 之字形横撑（在屏幕上画，转到哪个角度都是一座塔）
  const b = r.P(x, 0, z);
  const t = r.P(x, H, z);
  const wb = Math.max(2, r.k * 0.55);
  const wt = Math.max(1, r.k * 0.22);
  const L = (u: number, side: number) => [
    b[0] + (t[0] - b[0]) * u + side * (wb + (wt - wb) * u),
    b[1] + (t[1] - b[1]) * u,
  ];
  const l0 = L(0, -1);
  const l1 = L(1, -1);
  const r0 = L(0, 1);
  const r1 = L(1, 1);
  r.line(l0[0] as number, l0[1] as number, l1[0] as number, l1[1] as number, mc);
  r.line(r0[0] as number, r0[1] as number, r1[0] as number, r1[1] as number, md);
  const n = Math.max(4, Math.round((H * r.k) / 6));
  for (let i = 0; i < n; i++) {
    const a = L(i / n, i & 1 ? 1 : -1);
    const c = L((i + 1) / n, i & 1 ? -1 : 1);
    r.line(a[0] as number, a[1] as number, c[0] as number, c[1] as number, md);
  }
  // 灯头：4×2 盏灯的灯箱
  const night = dark(r);
  const cw = Math.max(2, Math.round(r.k * 0.55));
  const gap = 1;
  const W = 4 * cw + 5 * gap;
  const Hh = 2 * cw + 3 * gap;
  const hx = Math.round(t[0] - W / 2);
  const hy = Math.round(t[1] - Hh);
  r.rect(hx, hy, W, Hh, r.col('#3a3f47', 1, lit));
  r.rect(hx, hy - 1, W, 1, r.col('#596069', 1, lit));
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++)
      r.rect(
        hx + gap + i * (cw + gap),
        hy + gap + j * (cw + gap),
        cw,
        cw,
        night ? r.em('#fffbe6') : r.col('#d8dde2', 1, lit),
      );
  if (night) {
    r.glow(t[0], hy + Hh / 2, W * 1.4 + 4, [255, 250, 225], 1.15);
    r.rect(Math.round(t[0]) - 1, hy + Math.round(Hh / 2) - 1, 3, 2, r.em('#ffffff'));
  }
}

/* ---------------- 球童和服务 ---------------- */

/** 高脚裁判椅（网边北侧，同 match 演出的裁判位） */
function umpireChair(K: ShowKit, x: number, z: number): void {
  K.add({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, y0: 0, y1: 2.9 }, (r) => {
    const lit = r.litAt(x, z);
    const lc = r.col(CLUB_GREEN, 0.8, lit);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      r.wline([x + dx * 0.4, 0, z + dz * 0.4], [x + dx * 0.32, 1.8, z + dz * 0.32], lc);
    // 梯子（朝南）
    for (const y of [0.45, 0.9, 1.35]) r.wline([x - 0.35, y, z + 0.38], [x + 0.35, y, z + 0.38], lc);
    box(r, x - 0.45, x + 0.45, z - 0.45, z + 0.45, 1.75, 1.9, CLUB_GREEN, { lit, edge: false });
    box(r, x - 0.45, x + 0.45, z - 0.45, z - 0.3, 1.9, 2.8, CLUB_GREEN, { lit, edge: false });
    box(r, x - 0.45, x + 0.45, z - 0.45, z - 0.3, 2.65, 2.8, CLUB_GOLD, { lit, edge: false });
  });
}

/** 毛巾和饮料台：一只蓝色冷饮箱、一个挂着两条白毛巾的架子 */
function towelStation(K: ShowKit, x: number, z: number): void {
  K.add({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 1.3 }, (r) => {
    const lit = r.litAt(x, z);
    box(r, x - 0.65, x - 0.05, z - 0.3, z + 0.3, 0, 0.55, '#3a7ad6', { lit, top: '#f6f3ea', edge: false });
    const fc = r.col('#596069', 1, lit);
    r.wline([x + 0.15, 0, z], [x + 0.15, 1.2, z], fc);
    r.wline([x + 0.65, 0, z], [x + 0.65, 1.2, z], fc);
    r.wline([x + 0.15, 1.2, z], [x + 0.65, 1.2, z], fc);
    for (const [a, b] of [
      [0.2, 0.38],
      [0.43, 0.6],
    ] as const)
      r.wpoly(
        [
          [x + a, 0.55, z],
          [x + b, 0.55, z],
          [x + b, 1.18, z],
          [x + a, 1.18, z],
        ] as Pt[],
        r.col('#f6f3ea', 1, lit),
      );
    // 冷饮箱上两瓶水
    for (const dx of [-0.48, -0.25]) cyl(r, x + dx, z, 0.06, 0.55, 0.85, '#9fd8ee', { lit, top: '#3a7ad6' });
  });
}

function service(K: ShowKit, done: boolean): void {
  const cz = F_S1.oz;
  if (!done) {
    stake(K, 3.2, cz + 8.6);
    return;
  }
  umpireChair(K, 0, cz - 7.7);
  towelStation(K, -4.8, cz - 8.0);
  towelStation(K, 4.8, cz - 8.0);
  // 球童长凳在赞助灯箱前面（场地这一侧）
  for (const x of [-9, 9]) bench(K, x, cz + 7.8, 0.9, 'x', 0.4, '#6a3fa0');
}

/* ---------------- 赞助和转播 ---------------- */

/** 转播机位：脚手架腿、木台面、栏杆，台上一架摄像机 */
function cameraDeck(K: ShowKit, x: number, z: number, y0: number, h: number): void {
  const cam = bakeArt(TV_CAMERA);
  const e = 0.7;
  K.cast({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, h: y0 + h });
  K.add({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, y0, y1: y0 + h + 1.8 }, (r) => {
    const lit = r.litAt(x, z);
    const pc = r.col('#a8b0ba', 1, lit);
    if (h > 0.5)
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        r.wline([x + dx * (e - 0.1), y0, z + dz * (e - 0.1)], [x + dx * (e - 0.1), y0 + h, z + dz * (e - 0.1)], pc);
    if (h > 0.5) r.wline([x - e + 0.1, y0, z + e - 0.1], [x + e - 0.1, y0 + h, z + e - 0.1], pc);
    box(r, x - e, x + e, z - e, z + e, y0 + h - 0.15, y0 + h, '#c99a58', { lit, edge: false });
    const rc = r.col('#e8ecf0', 1, lit);
    const yr = y0 + h + 0.8;
    const c: Pt[] = [
      [x - e, yr, z - e],
      [x + e, yr, z - e],
      [x + e, yr, z + e],
      [x - e, yr, z + e],
    ];
    for (let i = 0; i < 4; i++) {
      const a = c[i] as Pt;
      r.wline(a, c[(i + 1) % 4] as Pt, rc);
      r.wline(a, [a[0], y0 + h, a[2]], rc);
    }
    r.art(cam, x + 0.25, y0 + h, z + 0.25, { lit });
  });
}

/** 东北角的转播车：白车身一道藏青，车顶一口卫星锅，夜里车顶红灯一闪一闪 */
function van(K: ShowKit): void {
  const x0 = 19.6;
  const x1 = 26.4;
  const z0 = -36.4;
  const z1 = -34;
  K.cast({ x0, x1, z0, z1, h: 3 });
  K.add({ x0, x1, z0, z1, y0: 0, y1: 4.6 }, (r) => {
    const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
    const night = dark(r);
    box(r, x0, x1, z0, z1, 0.35, 2.9, '#f3f1ea', {
      lit,
      face: (nx, nz) => {
        if (nz !== 0) {
          const c = nz > 0 ? z1 : z0;
          fq(r, 'z', c, 0, nz, x0 + 0.1, x1 - 0.1, 0.9, 1.25, r.col('#2c3f7a', 1, lit));
          fq(r, 'z', c, 0, nz, x0 + 0.1, x1 - 0.1, 1.25, 1.35, r.col('#d65a5a', 1, lit));
          fq(r, 'z', c, 0, nz, x0 + 0.2, x0 + 1.6, 1.5, 2.3, night ? r.em('#ffe2a0', 0.7) : r.col('#3b5874', 1, lit));
          for (const wxp of [x0 + 1.2, x1 - 1.4, x1 - 2.4])
            fq(r, 'z', c, 0, nz, wxp - 0.42, wxp + 0.42, 0.02, 0.6, r.col('#22252c', 1, lit));
        }
        if (nx === -1) fq(r, 'x', x0, -1, 0, z0 + 0.2, z1 - 0.2, 1.5, 2.3, r.col('#3b5874', 1, lit));
      },
    });
    // 卫星锅：一根短杆，一个斜着的白椭圆
    const dx = x1 - 1.8;
    const dz = (z0 + z1) / 2;
    r.wline([dx, 2.9, dz], [dx, 3.5, dz], r.col('#8c9298', 1, lit));
    const p = r.P(dx, 3.9, dz);
    const rad = Math.max(3, r.k * 0.9);
    r.ell(p[0], p[1], rad + 1, rad * 0.75 + 1, r.col('#2a2238', 1, lit));
    r.ell(p[0], p[1], rad, rad * 0.75, r.col('#e8ecf0', 1, lit));
    r.ell(p[0] - rad * 0.2, p[1] + rad * 0.15, rad * 0.55, rad * 0.4, r.col('#c8d0d8', 1, lit));
    r.pix(Math.round(p[0] + rad * 0.3), Math.round(p[1] - rad * 0.2), r.col('#5a6069', 1, lit));
    // 桅杆和红灯
    const m0 = r.P(x0 + 0.8, 2.9, dz);
    const m1 = r.P(x0 + 0.8, 4.4, dz);
    r.line(m0[0], m0[1], m1[0], m1[1], r.col('#8c9298', 1, lit));
    if (night && Math.sin(r.t * 3) > 0) r.rect(Math.round(m1[0]) - 1, Math.round(m1[1]) - 1, 2, 2, r.em('#ff4a3a'));
    else r.pix(m1[0], m1[1], r.col('#d6362f', 1, lit));
  });
  // 一道线缆从车尾拖到看台角
  K.add({ x0: 18.6, x1: x0, z0: -34, z1: -30.2, y0: 0, y1: 0.05 }, (r) => {
    const c = r.col('#2a2d33', 1, r.litAt(19, -32));
    r.wline([x0, 0.03, -34.2], [19.4, 0.03, -32.6], c);
    r.wline([19.4, 0.03, -32.6], [18.8, 0.03, -30.2], c);
  });
}

function media(K: ShowKit, done: boolean): void {
  if (!done) {
    stake(K, 20, -35.2);
    stake(K, 26, -35.2);
    return;
  }
  van(K);
  cameraDeck(K, -20.6, -27.2, 0, 2.3);
  cameraDeck(K, -20.6, -14.0, 0, 2.3);
  // 北看台背墙后面一座高机位（立在墙外，和背墙的包围盒分开）
  cameraDeck(K, 0, -40.5, 0, 7.4);
  // 南边场边的赞助灯箱（中间留出球员通道），西头底线后面三块
  const zs = F_S1.oz + 8.4;
  let n = 0;
  for (const x of [-13.8, -9.6, -5.4, 5.4, 9.6, 13.8])
    sponsorBoard(K, 'z', zs, x - 1.9, x + 1.9, 0.12, 0.95, n++, { led: true, legs: true });
  for (const z of [-26, -21, -16]) sponsorBoard(K, 'x', -17.85, z - 2.1, z + 2.1, 0.12, 0.95, n++, { led: true });
}

/** 按筹备状态建（四期固定顺序；没挂出来的跳过） */
export function buildPrep(K: ShowKit, prep: ReadonlyMap<string, boolean>): void {
  for (const p of PREP_PHASES) {
    const done = prep.get(p);
    if (done === undefined) continue;
    if (p === 'prep_stands') stands(K, done);
    else if (p === 'prep_lights') towers(K, done);
    else if (p === 'prep_service') service(K, done);
    else media(K, done);
  }
}
