import type { PixelArt, SlotColors } from '../../art/format';
import { GROUND_PROPS, GROUND_SLOTS } from '../../art/props/ground';
import {
  CUP_SIGN,
  DONUT,
  FLAMINGO,
  NEON_GLASS,
  PACE_CLOCK,
  PHYSIO_SIGN,
  RACKET_SIGN,
  STUDENT_BOARD,
} from '../../art/site/variants';
import { bakeArt } from '../../core/art';
import { bay, hash, hx } from '../../core/color';
import type { DrawContext } from '../../core/graph';
import { type Bounds, dark, type Kit } from './build';
import { PICK4 } from './ground';
import { box, cyl, ellSh, fq, hipRoof, type Pt, unprojector } from './kit';
import { F_O2, F_O3, F_P1, F_P2, F_PB1, F_PB2, FOUNTAIN, PICKLE } from './layout';
import type { Facilities } from './state';

/**
 * 修复变体和升级的画面（wave1-contract.md）。build.ts 在每处设施修好（fresh / worn）以后按变体调这里，
 * 没设变体时一个也不调（原来的样子一个像素不差）。worn 档沿用同一个变体，颜色褪一层、少几样东西、灯不亮。
 *
 * 位置都是写死的世界坐标（米），挨着 layout.ts 里的设施范围；不消耗任何共用的种子随机流（只用按坐标的 hash）。
 */

type CourtLike = { ox: number; oz: number; hx: number; hz: number };

const FADE = '#b3aa9a';

/** 两个颜色按 t 混合（#rrggbb） */
function mixHex(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  const c = (i: number) =>
    Math.round((A[i] as number) + ((B[i] as number) - (A[i] as number)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}
/** 掉档时褪一层色 */
const fd = (hex: string, worn: boolean): string => (worn ? mixHex(hex, FADE, 0.4) : hex);

/** 立着朝镜头的小招牌 / 小道具（精灵，按 spriteScale 放大） */
function sprite(K: Kit, art: PixelArt, x: number, y: number, z: number, slots?: SlotColors, e = 0.4): void {
  const baked = bakeArt(art, slots);
  K.add({ x0: x - e, x1: x + e, z0: z - e, z1: z + e, y0: y, y1: y + 2 }, (r) =>
    r.art(baked, x, y, z, { lit: r.litAt(x, z) }),
  );
}

/** 一根杆子（世界线） */
const pole = (r: DrawContext, x: number, z: number, h: number, c: number, y0 = 0) =>
  r.wline([x, y0, z], [x, h, z], c, Math.max(1, Math.round(r.k * 0.2)));

/** 一张网：ax 'z' 沿 z 拉在 x = cx 上（和 build.ts 的 net 一样），'x' 沿 x 拉在 z = cz 上 */
function netLine(K: Kit, ax: 'x' | 'z', cx: number, cz: number, half: number, h: number, sag = false): void {
  const a: Pt = ax === 'z' ? [cx, 0, cz - half] : [cx - half, 0, cz];
  const b: Pt = ax === 'z' ? [cx, 0, cz + half] : [cx + half, 0, cz];
  const b0: Bounds = {
    x0: Math.min(a[0], b[0]) - 0.05,
    x1: Math.max(a[0], b[0]) + 0.05,
    z0: Math.min(a[2], b[2]) - 0.05,
    z1: Math.max(a[2], b[2]) + 0.05,
    y0: 0,
    y1: h + 0.1,
  };
  K.add(b0, (r) => {
    const lit = r.litAt(cx, cz);
    const pc = r.col('#2a2d33', 1, lit);
    const pw = Math.max(1, Math.round(r.k * 0.25));
    r.wline(a, [a[0], h, a[2]], pc, pw);
    r.wline(b, [b[0], h, b[2]], pc, pw);
    const s = sag ? 0.4 : 0.08;
    const N = 6;
    const top: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const y = h - s * Math.sin(u * Math.PI);
      top.push([a[0] + (b[0] - a[0]) * u, y, a[2] + (b[2] - a[2]) * u]);
    }
    const nc = r.col('#1d2026', 1, lit);
    r.wpoly([[a[0], 0.05, a[2]], [b[0], 0.05, b[2]], ...top.slice().reverse()], 0, (px, py) =>
      (px + py) & 1 ? nc : 0,
    );
    const tc = r.col('#f6f3ea', 1, lit);
    for (let i = 0; i < N; i++) r.wline(top[i] as Pt, top[i + 1] as Pt, tc);
  });
}

/** 一条三角旗串（升级的联赛彩旗） */
function bunting(K: Kit, pts: readonly (readonly [number, number])[], y: number, worn: boolean): void {
  let x0 = 1e9;
  let x1 = -1e9;
  let z0 = 1e9;
  let z1 = -1e9;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]);
    z1 = Math.max(z1, p[1]);
  }
  const pal = ['#e2463c', '#f0c53c', '#2f7fd8', '#3fb37f', '#ffffff'].map((c) => fd(c, worn));
  K.add({ x0: x0 - 0.05, x1: x1 + 0.05, z0: z0 - 0.05, z1: z1 + 0.05, y0: y - 0.8, y1: y + 0.1 }, (r) => {
    const wc = r.col('#5a4a40', 1, 0);
    let n = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i] as readonly [number, number];
      const b = pts[i + 1] as readonly [number, number];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const N = Math.max(3, Math.round(len * r.k * 0.4));
      let prev: [number, number] | null = null;
      for (let s = 0; s <= N; s++) {
        const u = s / N;
        const p = r.P(a[0] + (b[0] - a[0]) * u, y - Math.sin(u * Math.PI) * 0.35, a[1] + (b[1] - a[1]) * u);
        if (prev) r.line(prev[0], prev[1], p[0], p[1], wc);
        prev = p;
        if (s % 2 === 1) {
          const c = r.col(pal[n++ % pal.length] as string, 1, r.litAt(a[0], a[1]));
          const fw = Math.max(1, Math.round(r.k * 0.25));
          const fh = Math.max(2, Math.round(r.k * 0.45));
          for (let q = 0; q < fh; q++) {
            const w = Math.max(0, Math.round(fw * (1 - q / fh)));
            r.rect(p[0] - w, p[1] + 1 + q, w * 2 + 1, 1, c);
          }
        }
      }
    }
  });
}

/** 遮阳帆：三根杆子撑着一块三角布 */
function sail(K: Kit, pts: readonly (readonly [number, number, number])[], c: string, worn: boolean): void {
  let x0 = 1e9;
  let x1 = -1e9;
  let z0 = 1e9;
  let z1 = -1e9;
  let y1 = 0;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[2]);
    z1 = Math.max(z1, p[2]);
    y1 = Math.max(y1, p[1]);
  }
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  K.cast({ x0: x0 + 0.6, x1: x1 - 0.6, z0: z0 + 0.6, z1: z1 - 0.6, h: 0.2 });
  // 杆子和帆面放在同一个节点里（分开的话，别的帆的杆子穿过帆面底下，深度排序会成环）；
  // 排序时压在同一块地上的东西（草坡、长凳）后面
  const n = K.add({ x0, x1, z0, z1, y0: 0, y1: y1 + 0.2 }, (r) => {
    const lit = r.litAt(cx, cz);
    for (const p of pts) pole(r, p[0], p[2], p[1] + 0.15, r.col('#d8d8d8', 0.8, r.litAt(p[0], p[2])));
    const col = fd(c, worn);
    const A = r.col(col, 1, lit);
    const B = r.col(col, 0.86, lit);
    const sp = pts as unknown as Pt[];
    const my = ((pts[0]?.[1] ?? 3) + (pts[1]?.[1] ?? 3) + (pts[2]?.[1] ?? 3)) / 3 - 0.3;
    const mid: Pt = [
      ((sp[0]?.[0] ?? cx) + (sp[1]?.[0] ?? cx) + (sp[2]?.[0] ?? cx)) / 3,
      my,
      ((sp[0]?.[2] ?? cz) + (sp[1]?.[2] ?? cz) + (sp[2]?.[2] ?? cz)) / 3,
    ];
    // 布中间往下兜一点：分成三个小三角，背光的一块暗一点
    r.wpoly([sp[0] as Pt, sp[1] as Pt, mid], A);
    r.wpoly([sp[1] as Pt, sp[2] as Pt, mid], B);
    r.wpoly([sp[2] as Pt, sp[0] as Pt, mid], A);
    const ec = r.col(mixHex(col, '#ffffff', 0.5), 1, lit);
    for (let i = 0; i < 3; i++) r.wline(sp[i] as Pt, sp[(i + 1) % 3] as Pt, ec);
  });
  n.renderOrder = 20;
}

/** 一张长凳 / 一张床（沿 x 放） */
function benchX(K: Kit, x: number, z: number, w: number, d: number, h: number, c: string, top?: string): void {
  K.add({ x0: x - w, x1: x + w, z0: z - d, z1: z + d, y0: 0, y1: h }, (r) => {
    const lit = r.litAt(x, z);
    const lc = r.col('#3a3a42', 1, lit);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      r.wline([x + dx * (w - 0.1), 0, z + dz * (d - 0.08)], [x + dx * (w - 0.1), h - 0.12, z + dz * (d - 0.08)], lc);
    box(r, x - w, x + w, z - d, z + d, h - 0.14, h, c, { lit, top: top ?? c, edge: false });
  });
}

/* ---------------- 红土场（outer_23）：clay 保留红土 / hard 改硬地 ---------------- */

export function outer23Extras(fac: Facilities, K: Kit): void {
  const v = fac.variant('outer_23');
  const worn = fac.look('outer_23') === 'worn';
  const hard = v === 'hard';
  const pro = fac.up('outer_23', hard ? 'pro_hard' : 'tournament_clay');
  for (const F of [F_O2, F_O3]) {
    if (v === 'clay') {
      // 红土的拖网（刷场用的拖把）靠在西边的围网上
      const x = F.ox - F.hx + 0.35;
      for (const dz of [2.2, 3.3]) {
        const z = F.oz + dz;
        K.add({ x0: x - 0.1, x1: x + 0.8, z0: z - 0.6, z1: z + 0.6, y0: 0, y1: 1.6 }, (r) => {
          const lit = r.litAt(x, z);
          r.wline([x + 0.75, 0.05, z], [x, 1.5, z], r.col('#8a6a45', 1, lit));
          box(r, x + 0.6, x + 0.9, z - 0.55, z + 0.55, 0, 0.15, '#6b5a48', { lit, edge: false });
        });
      }
    }
    if (pro) tournamentKit(K, F, hard, worn);
  }
}

/** 赛事升级：主裁椅、两张带伞的球员椅、底线外的记分牌（红土是绿配色，硬地是藏青配色） */
function tournamentKit(K: Kit, F: CourtLike, hard: boolean, worn: boolean): void {
  const main = fd(hard ? '#2c3f7a' : '#2f6b48', worn);
  // 主裁椅：南边网柱外
  const ux = F.ox;
  const uz = F.oz + 6.7;
  K.add({ x0: ux - 0.45, x1: ux + 0.45, z0: uz - 0.45, z1: uz + 0.45, y0: 0, y1: 2.6 }, (r) => {
    const lit = r.litAt(ux, uz);
    const lc = r.col(main, 0.8, lit);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      r.wline([ux + dx * 0.35, 0, uz + dz * 0.35], [ux + dx * 0.3, 1.6, uz + dz * 0.3], lc);
    r.wline([ux - 0.35, 0.8, uz + 0.35], [ux + 0.35, 0.8, uz + 0.35], lc);
    box(r, ux - 0.4, ux + 0.4, uz - 0.4, uz + 0.4, 1.55, 1.7, main, { lit, edge: false });
    box(r, ux - 0.4, ux + 0.4, uz + 0.25, uz + 0.4, 1.7, 2.5, main, { lit, edge: false });
  });
  // 两张球员椅和伞：北边网柱两旁
  const uc = hard ? (['#2c3f7a', '#ffffff'] as const) : (['#2f7a4a', '#f6f3ea'] as const);
  for (const dx of [-2.2, 2.2]) {
    const bx = F.ox + dx;
    const bz = F.oz - 6.9;
    benchX(K, bx, bz, 0.8, 0.25, 0.5, main);
    if (!worn) K.umbrella(bx, bz, 0.95, uc[0], uc[1], 2.1);
  }
  // 记分牌：西边底线外，面朝东（+x）
  const sx = F.ox - F.hx + 0.8;
  const z0 = F.oz - 1.5;
  const z1 = F.oz + 1.5;
  K.cast({ x0: sx - 0.12, x1: sx + 0.12, z0, z1, h: 2.6 });
  K.add({ x0: sx - 0.15, x1: sx + 0.15, z0, z1, y0: 0, y1: 2.7 }, (r) => {
    const lit = r.litAt(sx, F.oz);
    const gc = r.col('#596069', 1, lit);
    r.wline([sx, 0, z0 + 0.3], [sx, 1.1, z0 + 0.3], gc);
    r.wline([sx, 0, z1 - 0.3], [sx, 1.1, z1 - 0.3], gc);
    box(r, sx - 0.12, sx + 0.12, z0, z1, 1.1, 2.6, hard ? '#1d2a4a' : '#1e3a2a', {
      lit,
      face: (nx) => {
        if (nx !== 1) return;
        const N = dark(r) && !worn;
        for (let i = 0; i < 4; i++)
          for (const [y0, c] of [
            [1.35, hard ? '#ffffff' : '#ffcf5a'],
            [1.95, '#ffcf5a'],
          ] as const)
            fq(
              r,
              'x',
              sx + 0.12,
              1,
              0,
              z0 + 0.35 + i * 0.62,
              z0 + 0.7 + i * 0.62,
              y0,
              y0 + 0.45,
              worn ? r.col('#4a4a40', 1, lit) : N ? r.em(c) : r.col(c, 1, lit),
            );
      },
    });
  });
}

/* ---------------- 匹克球场（stadium_3）：pickle4 四片匹克球 / tennis2 两片网球场 ---------------- */

export function stadium3Variant(fac: Facilities, K: Kit, v: string): void {
  const worn = fac.look('stadium_3') === 'worn';
  const fresh = !worn;
  if (v === 'pickle4') {
    PICK4.forEach(([x, z], i) => {
      netLine(K, 'x', x, z, 2.05, 0.86, worn && i === 3);
    });
    // 中间十字两道矮隔网
    K.fenceSeg(44, PICKLE.z0 + 0.5, 44, 5.6, 1.0, { c: '#2f4a3c' });
    K.fenceSeg(44, 6.4, 44, PICKLE.z1 - 0.5, 1.0, { c: '#2f4a3c' });
    K.fenceSeg(PICKLE.x0 + 0.5, 6, 43.6, 6, 1.0, { c: '#2f4a3c' });
    K.fenceSeg(44.4, 6, PICKLE.x1 - 0.5, 6, 1.0, { c: '#2f4a3c' });
    // 场边一张长凳，上面一排球拍（匹克球拍是方头的彩色板）
    const bx = PICKLE.x1 - 1.2;
    K.add({ x0: bx - 0.3, x1: bx + 0.3, z0: 4, z1: 8, y0: 0, y1: 0.8 }, (r) => {
      const lit = r.litAt(bx, 6);
      box(r, bx - 0.25, bx + 0.25, 4.2, 7.8, 0.32, 0.45, fd('#e9c999', worn), { lit, edge: false });
      const pc = ['#e2463c', '#f0c53c', '#3fb37f', '#7a4fd0'];
      for (let i = 0; i < 4; i++) {
        const p = r.P(bx, 0.5, 4.6 + i * 0.85);
        r.rect(
          p[0] - 1,
          p[1] - Math.max(2, r.k * 0.35),
          Math.max(2, Math.round(r.k * 0.3)),
          Math.max(2, Math.round(r.k * 0.35)),
          r.col(fd(pc[i] as string, worn), 1, lit),
        );
      }
    });
  } else {
    for (const F of [F_PB1, F_PB2]) netLine(K, 'z', F.ox, F.oz, 3.75, 0.95, worn && F === F_PB2);
  }
  if (fac.up('stadium_3', 'league_lights')) {
    // 联赛灯：四角四根高灯杆（夜里整片照亮）+ 围网顶上一圈彩旗
    for (const [x, z] of [
      [36.2, -2.8],
      [51.8, -2.8],
      [36.2, 14.8],
      [51.8, 14.8],
    ] as const)
      K.lightPole(x, z, 12, { on: fresh, lx: 44 + (x - 44) * 0.4, lz: 6 + (z - 6) * 0.4, r: 13, i: 0.9 });
    const top = v === 'tennis2' ? 2.95 : 2.55;
    bunting(
      K,
      [
        [PICKLE.x0, PICKLE.z1],
        [PICKLE.x1, PICKLE.z1],
        [PICKLE.x1, PICKLE.z0],
      ],
      top,
      worn,
    );
  } else if (fresh) {
    K.lampAt({ x: 44, z: 6, r: 12, i: 0.8 });
    K.lightPole(36.2, -2.8, 8, { on: true, r: 5, i: 0.4 });
    K.lightPole(51.8, 14.8, 8, { on: true, r: 5, i: 0.4 });
  } else K.lightPole(36.2, -2.8, 8, {});
}

/* ---------------- 会所露台（clubhouse）：cafe 咖啡吧 / physio 理疗室 ---------------- */

export function clubVariant(fac: Facilities, K: Kit, v: string): void {
  const worn = fac.look('clubhouse') === 'worn';
  const fresh = !worn;
  if (v === 'cafe') {
    // 桌子还是八张，伞换成咖啡馆的红、棕、奶油条纹；掉档时伞收起来
    const ucols = [
      ['#b5562f', '#fff3d6'],
      ['#6b3f26', '#f3e6cc'],
      ['#e2463c', '#ffffff'],
    ] as const;
    let u = 0;
    for (const x of [-34, -29])
      for (const z of [-32, -26, -20, -14.5]) {
        const c = ucols[u++ % 3] as readonly [string, string];
        K.add({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, y0: 0, y1: 0.9 }, (r) => {
          const lit = r.litAt(x, z);
          const p = r.P(x, 0.85, z);
          const b = r.P(x, 0, z);
          r.line(b[0], b[1], p[0], p[1], r.col('#6b4a30', 1, lit));
          r.ell(p[0], p[1], 0.8 * r.k * 1.41, 0.8 * r.k * 0.7, r.col(fd('#fff8ea', worn), 1, lit));
        });
        if (fresh) K.umbrella(x, z, 1.5, c[0], c[1], 2.6);
        else folded(K, x, z, 2.4, fd(c[0], true));
      }
    K.stringLights(
      [
        [-36.6, -35.5],
        [-26.4, -29.5],
        [-36.6, -23.5],
        [-26.4, -17.5],
        [-36.6, -11.5],
      ],
      fresh,
      3.3,
    );
    // 北头的咖啡亭：奶油色小屋、棕白条纹的遮阳篷、柜台上一台咖啡机
    const kx0 = -33.6;
    const kx1 = -29.4;
    const kz0 = -35.8;
    const kz1 = -34.2;
    K.cast({ x0: kx0, x1: kx1, z0: kz0, z1: kz1, h: 2.4 });
    if (fresh) K.lampAt({ x: -31.5, z: -33.5, r: 5, i: 0.6 });
    K.add({ x0: kx0, x1: kx1, z0: kz0, z1: kz1 + 0.9, y0: 0, y1: 2.8 }, (r) => {
      const lit = r.litAt(-31.5, -34);
      box(r, kx0, kx1, kz0, kz1, 0, 2.2, fd('#f3e6cc', worn), {
        lit,
        face: (_nx, nz) => {
          if (nz !== 1) return;
          fq(
            r,
            'z',
            kz1,
            0,
            1,
            kx0 + 0.3,
            kx1 - 0.3,
            0.9,
            1.9,
            dark(r) && fresh ? r.em('#ffcf7a') : r.col('#5a3a26', 1, lit),
          );
          fq(r, 'z', kz1, 0, 1, kx0 + 0.2, kx1 - 0.2, 0, 0.95, r.col(fd('#8a5a32', worn), 1, lit));
        },
      });
      // 遮阳篷：从屋顶斜着伸出来
      const a = r.col(fd('#6b3f26', worn), 1, lit);
      const b = r.col(fd('#fff3d6', worn), 1, lit);
      const s0 = r.P(kx0, 2.5, kz0);
      r.wpoly(
        [
          [kx0 - 0.2, 2.5, kz1 - 0.3],
          [kx1 + 0.2, 2.5, kz1 - 0.3],
          [kx1 + 0.2, 1.95, kz1 + 0.9],
          [kx0 - 0.2, 1.95, kz1 + 0.9],
        ],
        0,
        (px) => (Math.floor((px - s0[0]) / Math.max(2, r.k * 0.5)) & 1 ? a : b),
      );
      // 柜台上的咖啡机
      const m = r.P(-31.5, 0.95, kz1 + 0.2);
      const mw = Math.max(2, Math.round(r.k * 0.35));
      r.rect(m[0] - mw, m[1] - mw * 2, mw * 2, mw * 2, r.col('#c0c6cc', 1, lit));
      r.rect(m[0] - mw + 1, m[1] - mw * 2 - 1, mw * 2 - 2, 1, r.col('#2a2238', 1, lit));
    });
    // 东南角的大杯子招牌
    K.add({ x0: -26.7, x1: -26.5, z0: -11.7, z1: -11.5, y0: 0, y1: 3.3 }, (r) =>
      pole(r, -26.6, -11.6, 3.3, r.col('#5a4636', 1, r.litAt(-26.6, -11.6))),
    );
    sprite(K, CUP_SIGN, -26.6, 3.3, -11.6);
    // 门口的小黑板（A 字架）
    const ax = -38.2;
    const az = -12.6;
    K.add({ x0: ax - 0.4, x1: ax + 0.4, z0: az - 0.3, z1: az + 0.3, y0: 0, y1: 1.1 }, (r) => {
      const lit = r.litAt(ax, az);
      r.wpoly(
        [
          [ax + 0.35, 0, az - 0.35],
          [ax + 0.35, 0, az + 0.35],
          [ax + 0.05, 1.05, az + 0.35],
          [ax + 0.05, 1.05, az - 0.35],
        ],
        r.col('#2f3a34', 1, lit),
      );
      const c = r.col('#f6f3ea', 1, lit);
      for (let i = 0; i < 3; i++) {
        const p = r.P(ax + 0.28 - i * 0.07, 0.8 - i * 0.22, az - 0.2);
        r.rect(p[0], p[1], Math.max(2, Math.round(r.k * 0.35)), 1, c);
      }
    });
    return;
  }
  // 理疗室：白色小房子（大窗、青色十字）、四张按摩床、三只冰桶；没有伞和串灯
  const rx0 = -36.2;
  const rx1 = -30.2;
  const rz0 = -35.8;
  const rz1 = -29.4;
  K.cast({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, h: 3 });
  if (fresh) {
    K.lampAt({ x: -33, z: -28, r: 6, i: 0.6 });
    K.lampAt({ x: -31, z: -20, r: 7, i: 0.45 });
  }
  K.add({ x0: rx0, x1: rx1, z0: rz0, z1: rz1, y0: 0, y1: 3.2 }, (r) => {
    const lit = r.litAt(-33, -32);
    const glass = dark(r) && fresh ? r.em('#cdf3ff') : r.col(fd('#8fd0e6', worn), 1, lit);
    box(r, rx0, rx1, rz0, rz1, 0, 3, fd('#f6f3ea', worn), {
      lit,
      top: fd('#d9dfe0', worn),
      face: (nx, nz) => {
        if (nx === 1)
          for (const z of [-35, -32.4]) {
            fq(r, 'x', rx1, 1, 0, z, z + 1.9, 0.9, 2.4, glass);
            fq(r, 'x', rx1, 1, 0, z - 0.1, z + 2, 0.75, 0.9, r.col('#ffffff', 1, lit));
          }
        if (nz === 1) {
          fq(r, 'z', rz1, 0, 1, rx0 + 0.8, rx0 + 2.0, 0, 2.2, r.col(fd('#17a2b8', worn), 1, lit));
          fq(r, 'z', rz1, 0, 1, rx0 + 2.8, rx1 - 0.6, 0.9, 2.4, glass);
          fq(r, 'z', rz1, 0, 1, rx0, rx1, 2.65, 2.85, r.col(fd('#17a2b8', worn), 1, lit));
        }
      },
    });
    if (dark(r) && fresh) {
      const p = r.P(rx1, 1.6, -33.5);
      r.glow(p[0], p[1], r.k * 2.6, [40, 70, 80], 0.7);
    }
  });
  sprite(K, PHYSIO_SIGN, rx0 + 4.4, 3.0, rz1 + 0.05);
  // 按摩床：白床垫、青色床脚、一条叠好的毛巾
  for (const x of [-33.8, -29.4])
    for (const z of [-25.2, -19.6]) {
      benchX(K, x, z, 1.0, 0.36, 0.75, fd('#17a2b8', worn), fd('#ffffff', worn));
      K.add({ x0: x + 0.4, x1: x + 0.9, z0: z - 0.3, z1: z + 0.3, y0: 0.75, y1: 0.9 }, (r) =>
        box(r, x + 0.45, x + 0.85, z - 0.28, z + 0.28, 0.75, 0.85, fd('#9fdcec', worn), {
          lit: r.litAt(x, z),
          edge: false,
        }),
      );
    }
  // 冰桶：不锈钢圆桶，冰水、浮着冰块；掉档时只剩半桶浑水
  for (const z of [-15.4, -13.2]) for (const x of [-34.2, -31.6, -29]) tub(K, x, z, 0.62, worn);
}

/** 收起来的伞（掉档的咖啡吧）：一根杆子、一束布 */
function folded(K: Kit, x: number, z: number, h: number, c: string): void {
  K.add({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, y0: 0.9, y1: h + 0.3 }, (r) => {
    const lit = r.litAt(x, z);
    const b = r.P(x, 0.9, z);
    const t = r.P(x, h, z);
    r.line(b[0], b[1], t[0], t[1], r.col('#e8e2d2', 0.8, lit));
    const w = Math.max(1, Math.round(r.k * 0.2));
    const top = r.P(x, h - 0.1, z);
    const bot = r.P(x, h - 1.1, z);
    r.rect(top[0] - w, top[1], w * 2 + 1, Math.max(2, Math.round(bot[1] - top[1])), r.col(c, 1, lit));
  });
}

/** 一只冰桶（理疗室、冷水恢复池） */
function tub(K: Kit, x: number, z: number, rad: number, worn: boolean): void {
  K.cast({ x, z, h: 0.8, r: rad, tw: 0 });
  K.add({ x0: x - rad, x1: x + rad, z0: z - rad, z1: z + rad, y0: 0, y1: 0.9 }, (r) => {
    const lit = r.litAt(x, z);
    cyl(r, x, z, rad, 0, 0.85, '#b8c0c8', { lit, top: '#dfe6ea' });
    const t = r.P(x, 0.85, z);
    const rx = rad * r.k * Math.SQRT2 * 0.8;
    const ry = rx * 0.5;
    const w = r.col(worn ? '#7f9a8a' : '#a8e6f4', 1, lit);
    const ice = r.col('#ffffff', 1, lit);
    ellSh(r, t[0], t[1], rx, ry, (px, py) => (!worn && hash(px >> 1, py, 13) > 0.72 ? ice : w));
  });
}

/** 球拍店升级：会所东墙上的橱窗和绿白遮阳篷、一架球拍、挂出来的球拍招牌 */
export function proShop(K: Kit, worn: boolean): void {
  const wx = -42;
  const z0 = -31.6;
  const z1 = -27.4;
  K.add({ x0: wx - 0.05, x1: wx + 1.4, z0, z1, y0: 0, y1: 3.3 }, (r) => {
    const lit = r.litAt(wx, -29.5);
    if (r.vis(1, 0)) {
      // 橱窗：玻璃里挂着几把彩色球拍
      r.wpoly(
        [
          [wx + 0.04, 0.6, z0 + 0.3],
          [wx + 0.04, 0.6, z1 - 0.3],
          [wx + 0.04, 2.4, z1 - 0.3],
          [wx + 0.04, 2.4, z0 + 0.3],
        ],
        dark(r) && !worn ? r.em('#ffe2a0') : r.col(fd('#9fd0e0', worn), 1, lit),
      );
      const rc = ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f'];
      for (let i = 0; i < 4; i++) {
        const p = r.P(wx + 0.05, 1.8, z0 + 0.9 + i * 0.85);
        const rr = Math.max(1.5, r.k * 0.22);
        r.ell(p[0], p[1], rr, rr * 1.3, r.col(fd(rc[i] as string, worn), 1, lit));
        r.line(p[0], p[1] + rr, p[0], p[1] + rr * 2.6, r.col('#2a2238', 1, lit));
      }
    }
    // 遮阳篷：绿白条纹，从墙上斜着伸出来
    const a = r.col(fd('#2f7a4a', worn), 1, lit);
    const b = r.col(fd('#f6f3ea', worn), 1, lit);
    const s0 = r.P(wx, 3, z0);
    r.wpoly(
      [
        [wx, 3.1, z0],
        [wx, 3.1, z1],
        [wx + 1.3, 2.6, z1],
        [wx + 1.3, 2.6, z0],
      ],
      0,
      (px) => (Math.floor((px - s0[0]) / Math.max(2, r.k * 0.45)) & 1 ? a : b),
    );
  });
  // 球拍架：两根腿一根横杆，挂四把球拍
  const rx = -40.5;
  K.add({ x0: rx - 0.15, x1: rx + 0.15, z0: -30.9, z1: -28.1, y0: 0, y1: 1.6 }, (r) => {
    const lit = r.litAt(rx, -29.5);
    const wc = r.col('#8a6a45', 1, lit);
    r.wline([rx, 0, -30.8], [rx, 1.5, -30.8], wc);
    r.wline([rx, 0, -28.2], [rx, 1.5, -28.2], wc);
    r.wline([rx, 1.5, -30.8], [rx, 1.5, -28.2], wc);
    const rc = ['#e2463c', '#2f7fd8', '#f0c53c', '#3fb37f'];
    for (let i = 0; i < 4; i++) {
      const z = -30.4 + i * 0.75;
      const h = r.P(rx, 1.5, z);
      const head = r.P(rx, 0.95, z);
      r.line(h[0], h[1], head[0], head[1], r.col('#2a2238', 1, lit));
      const rr = Math.max(1.5, r.k * 0.2);
      r.ell(head[0], head[1] + rr, rr, rr * 1.3, r.col(fd(rc[i] as string, worn), 1, lit));
    }
  });
  // 挂出来的招牌：墙上伸出一根杆子
  K.add({ x0: wx, x1: wx + 1.6, z0: -26.9, z1: -26.7, y0: 3.4, y1: 3.6 }, (r) =>
    r.wline([wx, 3.5, -26.8], [wx + 1.5, 3.5, -26.8], r.col('#3a3a42', 1, r.litAt(wx, -26.8))),
  );
  sprite(K, RACKET_SIGN, wx + 1.2, 2.5, -26.8);
}

/* ---------------- 青训（practice）：academy 学院 / bootcamp 晨间训练营 ---------------- */

export function practiceVariant(fac: Facilities, K: Kit, v: string): void {
  const worn = fac.look('practice') === 'worn';
  const basket = bakeArt(GROUND_PROPS.basket as PixelArt, GROUND_SLOTS.basket);
  if (v === 'academy') {
    // 两块场各一台发球机、两筐球；北边场外一块学员看板
    for (const F of [F_P1, F_P2]) {
      const mx = F.ox + 10.6;
      const mz = F.oz;
      K.add({ x0: mx - 0.45, x1: mx + 0.45, z0: mz - 0.4, z1: mz + 0.4, y0: 0, y1: 1.1 }, (r) => {
        const lit = r.litAt(mx, mz);
        box(r, mx - 0.42, mx + 0.42, mz - 0.35, mz + 0.35, 0.1, 0.65, fd('#2f5d8a', worn), { lit });
        box(r, mx - 0.4, mx + 0.4, mz - 0.4, mz + 0.4, 0.65, 0.97, '#1e1e1e', {
          lit,
          top: worn ? '#8a8a6a' : '#d7e64a',
        });
      });
      if (worn) continue;
      for (const [dx, dz] of [
        [-3.5, 6.6],
        [3.5, -6.6],
      ] as const) {
        const bx = F.ox + dx;
        const bz = F.oz + dz;
        K.add({ x0: bx - 0.3, x1: bx + 0.3, z0: bz - 0.3, z1: bz + 0.3, y0: 0, y1: 1 }, (r) =>
          r.art(basket, bx, 0, bz, { lit: r.litAt(bx, bz) }),
        );
      }
    }
    sprite(K, STUDENT_BOARD, -10.5, 0, -3.4);
    if (!worn) sprite(K, STUDENT_BOARD, 23.5, 0, -3.4);
    return;
  }
  // 训练营：每块场一排标志桶，北边场外一副体能架（单杠和吊环）、一摞轮胎、几只壶铃
  for (const F of [F_P1, F_P2]) {
    if (!worn) for (let i = 0; i < 5; i++) K.cone(F.ox - 8 + i * 4, F.oz - 6.6);
    else for (let i = 0; i < 2; i++) K.cone(F.ox - 6 + i * 9, F.oz - 6.6);
  }
  const gx0 = 7.5;
  const gx1 = 13.5;
  const gz = -3.4;
  K.cast({ x0: gx0, x1: gx1, z0: gz - 0.1, z1: gz + 0.1, h: 2.8 });
  K.add({ x0: gx0 - 0.1, x1: gx1 + 0.1, z0: gz - 0.15, z1: gz + 0.15, y0: 0, y1: 2.9 }, (r) => {
    const lit = r.litAt((gx0 + gx1) / 2, gz);
    const mc = r.col(fd('#3a4a5a', worn), 1, lit);
    const yc = r.col(fd('#f0c53c', worn), 1, lit);
    const pw = Math.max(1, Math.round(r.k * 0.25));
    for (const x of [gx0, (gx0 + gx1) / 2, gx1]) r.wline([x, 0, gz], [x, 2.8, gz], mc, pw);
    r.wline([gx0, 2.8, gz], [gx1, 2.8, gz], yc, pw);
    r.wline([gx0, 2.1, gz], [(gx0 + gx1) / 2, 2.1, gz], mc);
    // 吊环
    for (const x of [gx1 - 2, gx1 - 1]) {
      const a = r.P(x, 2.8, gz);
      const b = r.P(x, 1.9, gz);
      r.line(a[0], a[1], b[0], b[1], mc);
      const rr = Math.max(1, r.k * 0.15);
      r.ell(b[0], b[1] + rr, rr, rr, yc);
    }
  });
  // 一摞轮胎
  const tx = 5.4;
  const tz = -3.3;
  K.add({ x0: tx - 0.6, x1: tx + 0.6, z0: tz - 0.6, z1: tz + 0.6, y0: 0, y1: 0.8 }, (r) => {
    const lit = r.litAt(tx, tz);
    for (let i = 0; i < (worn ? 1 : 3); i++)
      cyl(r, tx, tz, 0.55, i * 0.25, i * 0.25 + 0.22, '#2c2c30', { lit, top: '#46464c' });
    const t = r.P(tx, worn ? 0.22 : 0.72, tz);
    r.ell(t[0], t[1], 0.25 * r.k * Math.SQRT2, 0.25 * r.k * Math.SQRT1_2, r.col('#1a1a1e', 1, lit));
  });
  if (!worn)
    for (const [x, c] of [
      [14.6, '#e2463c'],
      [15.3, '#2f7fd8'],
      [16, '#3a3a42'],
    ] as const)
      K.add({ x0: x - 0.2, x1: x + 0.2, z0: gz - 0.2, z1: gz + 0.2, y0: 0, y1: 0.5 }, (r) => {
        const lit = r.litAt(x, gz);
        const p = r.P(x, 0.2, gz);
        const rr = Math.max(1.5, r.k * 0.25);
        r.ell(p[0], p[1], rr, rr * 0.9, r.col(c, 1, lit));
        r.pix(p[0] - 1, p[1] - 1, r.col('#ffffff', 0.9, lit));
      });
}

/** 场边大屏（青训升级）：两根柱子撑着一块屏，屏上放着慢动作回放（球的弧线在走）；掉档时黑屏 */
export function videoWall(K: Kit, worn: boolean): void {
  const x0 = -3.6;
  const x1 = 3.6;
  const z = -3.6;
  const y0 = 1.3;
  const y1 = 4.7;
  K.cast({ x0, x1, z0: z - 0.15, z1: z + 0.15, h: y1 });
  K.add({ x0, x1, z0: z - 0.2, z1: z + 0.2, y0: 0, y1: y1 + 0.2 }, (r) => {
    const lit = r.litAt(0, z);
    const gc = r.col('#596069', 1, lit);
    const pw = Math.max(1, Math.round(r.k * 0.35));
    r.wline([x0 + 0.6, 0, z], [x0 + 0.6, y0, z], gc, pw);
    r.wline([x1 - 0.6, 0, z], [x1 - 0.6, y0, z], gc, pw);
    box(r, x0, x1, z - 0.15, z + 0.12, y0, y1, '#22262c', { lit });
  });
  // 屏幕内容放动态层（会动）
  K.addDyn({ x0: x0 + 0.2, x1: x1 - 0.2, z0: z + 0.12, z1: z + 0.16, y0: y0 + 0.2, y1: y1 - 0.2 }, (r) => {
    if (!r.vis(0, 1)) return;
    const lit = r.litAt(0, z);
    const N = dark(r);
    const C = (hex: string) => (N && !worn ? r.em(hex) : r.col(hex, 1, worn ? lit : 0));
    const sky = C(worn ? '#2c3036' : '#3a7fd0');
    const sky2 = C(worn ? '#24282e' : '#4a90dc');
    const court = C(worn ? '#2a2e30' : '#3f9a55');
    const line = C(worn ? '#3a3e44' : '#f6f3ea');
    const ball = C('#d7e64a');
    const zs = z + 0.14;
    const a = r.P(x0 + 0.2, y0 + 0.2, zs);
    const ex = r.P(x0 + 1.2, y0 + 0.2, zs);
    const ey = r.P(x0 + 0.2, y0 + 1.2, zs);
    const W = x1 - x0 - 0.4;
    const H = y1 - y0 - 0.4;
    const ux = ex[0] - a[0];
    const uy = ex[1] - a[1];
    const vx = ey[0] - a[0];
    const vy = ey[1] - a[1];
    const det = ux * vy - vx * uy || 1e-9;
    const t = r.t;
    // 球沿抛物线从左走到右（循环）
    const bu = ((t * 0.35) % 1) * W;
    const bv = H * (0.35 + 0.45 * Math.sin((bu / W) * Math.PI));
    r.wpoly(
      [
        [x0 + 0.2, y0 + 0.2, zs],
        [x1 - 0.2, y0 + 0.2, zs],
        [x1 - 0.2, y1 - 0.2, zs],
        [x0 + 0.2, y1 - 0.2, zs],
      ],
      0,
      (px, py) => {
        const dx = px + 0.5 - a[0];
        const dy = py + 0.5 - a[1];
        const u = (dx * vy - vx * dy) / det;
        const v = (ux * dy - dx * uy) / det;
        if (worn) return (py & 3) === 0 ? sky2 : sky;
        if (Math.hypot((u - bu) * 1.2, v - bv) < 0.22) return ball;
        if (v < H * 0.32) {
          if (Math.abs(v - H * 0.16) < 0.05 || Math.abs(u - W / 2) < 0.05) return line;
          return court;
        }
        // 回放的轨迹：一串点
        for (let k = 1; k <= 3; k++) {
          const pu = bu - k * 0.45;
          if (pu < 0) break;
          const pv = H * (0.35 + 0.45 * Math.sin((pu / W) * Math.PI));
          if (Math.hypot(u - pu, v - pv) < 0.09) return line;
        }
        return (py & 1) === 0 ? sky : sky2;
      },
    );
    if (N && !worn) {
      const p = r.P(0, (y0 + y1) / 2, zs);
      r.glow(p[0], p[1], r.k * 4, [40, 80, 140], 0.8);
    }
  });
}

/* ---------------- 棕榈喷泉（plaza）：nightlife 夜场 / shade_lawn 遮阳观赛坡 ---------------- */

/** 喷泉周围的长凳（和原来修好时一样的四张）；skip 跳过某个角度 */
function plazaBenches(K: Kit, worn: boolean, skip = -1): void {
  for (const a of [0.4, 2, 3.6, 5.2]) {
    if (a === skip) continue;
    const x = FOUNTAIN.x + Math.cos(a) * 11;
    const z = FOUNTAIN.z + Math.sin(a) * 11;
    K.add({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.6 }, (r) =>
      box(r, x - 0.6, x + 0.6, z - 0.25, z + 0.25, 0.25, 0.5, fd('#8a5a32', worn), { lit: r.litAt(x, z) }),
    );
  }
}

export function plazaVariant(fac: Facilities, K: Kit, v: string): void {
  const worn = fac.look('plaza') === 'worn';
  const fresh = !worn;
  if (v === 'nightlife') {
    plazaBenches(K, worn, 2);
    // 串灯织成一张网：之字形拉过整个广场，每个拐点一根杆子
    const web: [number, number][] = [
      [33.5, -34.5],
      [54.5, -30],
      [33.5, -24.5],
      [54.5, -19],
      [33.5, -13.5],
    ];
    K.stringLights(web, fresh, 4.4);
    for (const p of web.slice(1, -1))
      K.add({ x0: p[0] - 0.1, x1: p[0] + 0.1, z0: p[1] - 0.1, z1: p[1] + 0.1, y0: 0, y1: 4.4 }, (r) =>
        pole(r, p[0], p[1], 4.4, r.col('#5a4636', 1, r.litAt(p[0], p[1]))),
      );
    K.stringLights(
      [
        [54.5, -34.5],
        [44, -24],
        [33.5, -34.5],
      ],
      fresh,
      5.2,
    );
    // 吧台：东北角，木柜台、后面一排酒瓶、紫红白条纹的顶棚、四张高脚凳、霓虹鸡尾酒杯
    const bx0 = 49.4;
    const bx1 = 55.4;
    const bz0 = -35.8;
    const bz1 = -33.4;
    K.cast({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, h: 2.9 });
    if (fresh) {
      K.lampAt({ x: 52.4, z: -32.5, r: 7, i: 0.8 });
      K.lampAt({ x: 42.6, z: -14.5, r: 6, i: 0.5 });
    }
    K.add({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, y0: 0, y1: 3.2 }, (r) => {
      const lit = r.litAt(52.4, -34.5);
      // 后墙的酒架
      box(r, bx0 + 0.2, bx1 - 0.2, bz0, bz0 + 0.5, 0, 2.3, fd('#3a2450', worn), {
        lit,
        face: (_nx, nz) => {
          if (nz !== 1) return;
          const bc = ['#3fb37f', '#f0c53c', '#e2463c', '#7af0ff', '#ffffff'];
          for (let i = 0; i < 12; i++) {
            const x = bx0 + 0.5 + i * 0.45;
            const c = bc[i % 5] as string;
            fq(
              r,
              'z',
              bz0 + 0.5,
              0,
              1,
              x,
              x + 0.16,
              1.4,
              1.75,
              dark(r) && fresh ? r.em(c, 0.8) : r.col(fd(c, worn), 1, lit),
            );
            fq(
              r,
              'z',
              bz0 + 0.5,
              0,
              1,
              x + 0.1,
              x + 0.26,
              0.75,
              1.05,
              r.col(fd(bc[(i + 2) % 5] as string, worn), 1, lit),
            );
          }
        },
      });
      // 柜台
      box(r, bx0, bx1, bz1 - 0.8, bz1, 0, 1.1, fd('#8a5a32', worn), {
        lit,
        top: '#3a2a2a',
        face: (_nx, nz) => {
          if (nz === 1)
            fq(
              r,
              'z',
              bz1,
              0,
              1,
              bx0,
              bx1,
              0.85,
              0.95,
              dark(r) && fresh ? r.em('#ff6ad5') : r.col(fd('#d63c8c', worn), 1, lit),
            );
        },
      });
      // 顶棚：四根柱子、紫红白条纹
      const pc = r.col('#5a4636', 1, lit);
      for (const [x, zz] of [
        [bx0, bz0],
        [bx1, bz0],
        [bx0, bz1],
        [bx1, bz1],
      ] as const)
        r.wline([x, 0, zz], [x, 2.9, zz], pc);
      const a = r.col(fd('#d63c8c', worn), 1, lit);
      const b = r.col(fd('#ffffff', worn), 1, lit);
      const s0 = r.P(bx0, 3, bz0);
      r.wpoly(
        [
          [bx0 - 0.2, 3.1, bz0 - 0.2],
          [bx1 + 0.2, 3.1, bz0 - 0.2],
          [bx1 + 0.2, 2.75, bz1 + 0.5],
          [bx0 - 0.2, 2.75, bz1 + 0.5],
        ],
        0,
        (px) => (Math.floor((px - s0[0]) / Math.max(2, r.k * 0.55)) & 1 ? a : b),
      );
    });
    for (let i = 0; i < 4; i++) {
      const x = bx0 + 0.9 + i * 1.4;
      const z = bz1 + 0.55;
      K.add({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.85 }, (r) => {
        const lit = r.litAt(x, z);
        r.wline([x, 0, z], [x, 0.75, z], r.col('#3a3a42', 1, lit));
        const t = r.P(x, 0.8, z);
        r.ell(t[0], t[1], 0.3 * r.k * Math.SQRT2, 0.3 * r.k * Math.SQRT1_2, r.col(fd('#d63c8c', worn), 1, lit));
      });
    }
    K.add({ x0: bx0 - 0.9, x1: bx0 - 0.7, z0: bz1 + 0.3, z1: bz1 + 0.5, y0: 0, y1: 3.3 }, (r) =>
      pole(r, bx0 - 0.8, bz1 + 0.4, 3.3, r.col('#3a3a42', 1, r.litAt(bx0, bz1))),
    );
    sprite(K, NEON_GLASS, bx0 - 0.8, 3.3, bz1 + 0.4, { light: worn ? '#8a7a90' : '#ff6ad5' });
    // 高脚桌：长凳之间
    for (const k of [0, 6, 7]) {
      const a = k * 0.785;
      const x = FOUNTAIN.x + Math.cos(a) * 10.5;
      const z = FOUNTAIN.z + Math.sin(a) * 10.5;
      K.add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y0: 0, y1: 1.2 }, (r) => {
        const lit = r.litAt(x, z);
        r.wline([x, 0, z], [x, 1.1, z], r.col('#3a3a42', 1, lit));
        const t = r.P(x, 1.1, z);
        r.ell(t[0], t[1], 0.45 * r.k * Math.SQRT2, 0.45 * r.k * Math.SQRT1_2, r.col(fd('#f6f3ea', worn), 1, lit));
      });
    }
    return;
  }
  // 遮阳观赛坡：广场南边两面遮阳帆；草坪东头一道三级草坡看台（朝西看红土场），坡上两面帆、几块野餐毯
  plazaBenches(K, worn);
  sail(
    K,
    [
      [33, 4.6, -20],
      [39, 3.4, -13],
      [33.4, 4.0, -12.8],
    ],
    '#f6f3ea',
    worn,
  );
  sail(
    K,
    [
      [49.5, 4.2, -13],
      [55.5, 4.8, -19],
      [55.5, 3.4, -12.8],
    ],
    '#3fb3a8',
    worn,
  );
  const steps = [
    { x0: 45, h: 0.6 },
    { x0: 48.6, h: 1.2 },
    { x0: 52.2, h: 1.8 },
  ];
  const sx1 = 55.8;
  const sz0 = 18.4;
  const sz1 = 31.4;
  for (const s of steps) K.cast({ x0: s.x0, x1: sx1, z0: sz0, z1: sz1, h: s.h });
  const blankets = (
    [
      [46.2, 21.5, '#e2463c'],
      [49.8, 27.6, '#2f7fd8'],
      [53.2, 22.4, '#f0c53c'],
    ] as const
  ).filter((b) => !(worn && b[2] === '#2f7fd8'));
  // 三级台阶和坡上的野餐毯画在同一个节点里（从低到高），台阶之间不靠深度排序
  K.add({ x0: steps[0]?.x0 ?? 45, x1: sx1, z0: sz0, z1: sz1, y0: 0, y1: 1.85 }, (r) => {
    const lit = r.litAt(50, 25);
    const g1 = fd('#77c452', worn);
    const g2 = fd('#6ab748', worn);
    const curb = r.col(fd('#ecdcbf', worn), 1, lit);
    const unP = unprojector(r);
    for (const s of steps) {
      // 侧面是石砌的挡土墙；顶面是草，前沿一道浅色石条（坐的地方）
      box(r, s.x0, sx1, sz0, sz1, 0, s.h, fd('#c9b08a', worn), {
        lit,
        top: g1,
        topSh: (tc) => {
          const d = r.col(g2, 1, lit);
          return (px, py) => {
            const w = unP(px + 0.5, py + 0.5, s.h);
            if (w[0] < s.x0 + 0.45) return curb;
            return Math.floor(w[1] / 1.6) & 1 ? d : tc;
          };
        },
        sideSh: (_nx, _nz, _pts, cc) => {
          const d = r.col(fd('#a8906c', worn), 1, lit);
          return (x, y) => (y % 3 === 0 || (x + (((y / 3) | 0) & 1) * 2) % 5 === 0 ? d : cc);
        },
      });
      for (const [x, z, c] of blankets) {
        const y = x < 48.6 ? 0.6 : x < 52.2 ? 1.2 : 1.8;
        if (y !== s.h) continue;
        const a = r.col(fd(c, worn), 1, 0);
        const b = r.col('#ffffff', 1, 0);
        r.wpoly(
          [
            [x - 0.8, y + 0.02, z - 0.7],
            [x + 0.8, y + 0.02, z - 0.7],
            [x + 0.8, y + 0.02, z + 0.7],
            [x - 0.8, y + 0.02, z + 0.7],
          ],
          0,
          (px, py) => (((px >> 1) + (py >> 1)) & 1 ? a : b),
        );
      }
    }
  });
  sail(
    K,
    [
      [45.6, 4.2, 18.8],
      [53.5, 5.2, 19.2],
      [48.5, 3.8, 25.5],
    ],
    '#ff8a3d',
    worn,
  );
  sail(
    K,
    [
      [50, 4.6, 24.2],
      [55.5, 5.4, 31],
      [45.6, 3.8, 31],
    ],
    '#f6f3ea',
    worn,
  );
}

/** 喷雾杆（广场升级）：喷泉外一圈四根，顶上一圈喷嘴往外冒白雾（动态，随风飘）；掉档时堵了不冒 */
export function misters(K: Kit, worn: boolean): void {
  for (const a of [1.2, 2.8, 4.4, 6.0]) {
    const x = FOUNTAIN.x + Math.cos(a) * 11.6;
    const z = FOUNTAIN.z + Math.sin(a) * 11.6;
    const h = 3.1;
    K.add({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5, y0: 0, y1: h + 0.2 }, (r) => {
      const lit = r.litAt(x, z);
      const gc = r.col('#9aa2aa', 1, lit);
      pole(r, x, z, h, gc);
      r.wline([x - 0.45, h, z], [x + 0.45, h, z], gc);
      r.wline([x, h, z - 0.45], [x, h, z + 0.45], gc);
      const t = r.P(x, h, z);
      r.pix(t[0], t[1] - 1, r.col('#3fb3d8', 1, lit));
    });
    if (worn) continue;
    K.addDyn({ x0: x - 1.4, x1: x + 1.4, z0: z - 1.4, z1: z + 1.4, y0: 0.8, y1: h }, (r) => {
      const lit = r.litAt(x, z);
      const c = r.col('#ffffff', 1, lit);
      const c2 = r.col('#dff4ff', 1, lit);
      const wind = K.wx.wind;
      for (let i = 0; i < 28; i++) {
        const u = (r.t * 0.45 + i * 0.137 + a) % 1;
        const ang = i * 2.39 + a;
        const rr = 0.35 + u * 1.1;
        const px = x + Math.cos(ang) * rr + wind * u * 1.2;
        const pz = z + Math.sin(ang) * rr;
        const py = h - 0.1 - u * 1.9;
        const p = r.P(px, py, pz);
        const s = Math.max(1, Math.round(r.k * 0.22 * (0.6 + u)));
        for (let q = 0; q < s; q++)
          for (let w = 0; w < s; w++)
            if (bay(Math.round(p[0]) + q, Math.round(p[1]) + w) < (1 - u) * 0.75)
              r.pix(p[0] + q, p[1] + w, u < 0.4 ? c : c2);
      }
    });
  }
}

/* ---------------- 泳池（stadium_2）：resort 度假 / recovery 冷水恢复池 ---------------- */

/** 度假：每张躺椅一条彩色浴巾，单数的躺椅也打上伞 */
export function resortLounger(K: Kit, x: number, z: number, i: number, worn: boolean): void {
  const tc = ['#ff8a3d', '#17a2b8', '#ffcf3a', '#ff6f91', '#3fb37f', '#7a4fd0'][i % 6] as string;
  K.add({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.9, z1: z + 0.9, y0: 0.3, y1: 0.75 }, (r) => {
    const lit = r.litAt(x, z);
    box(r, x - 0.34, x + 0.34, z - 0.8, z + 0.38, 0.3, 0.34, fd(tc, worn), { lit, edge: false });
    box(r, x - 0.34, x + 0.34, z + 0.42, z + 0.48, 0.34, 0.72, fd(tc, worn), { lit, edge: false });
  });
  if (!worn && i % 2 === 1) K.umbrella(x + 1.7, z + 0.4, 1.3, '#ff6f91', '#ffffff');
}

export function poolVariant(fac: Facilities, K: Kit, v: string): void {
  const worn = fac.look('stadium_2') === 'worn';
  const fresh = !worn;
  if (v === 'resort') {
    // 池子里漂着火烈鸟和游泳圈（动态，轻轻晃）
    if (fresh) {
      const fl = bakeArt(FLAMINGO);
      const dn = bakeArt(DONUT);
      K.addDyn({ x0: -53.5, x1: -50.5, z0: 6.5, z1: 9.5, y0: -0.4, y1: 0.8 }, (r) => {
        const x = -52 + Math.sin(r.t * 0.23) * 1.2;
        const z = 8 + Math.sin(r.t * 0.17 + 1) * 0.8;
        r.art(fl, x, -0.3 + Math.sin(r.t * 1.6) * 0.05, z, { lit: r.litAt(x, z) });
      });
      K.addDyn({ x0: -48, x1: -45, z0: 4.5, z1: 7, y0: -0.4, y1: 0.4 }, (r) => {
        const x = -46.5 + Math.sin(r.t * 0.19 + 2) * 1;
        const z = 5.6 + Math.sin(r.t * 0.29) * 0.5;
        r.art(dn, x, -0.32 + Math.sin(r.t * 1.9 + 1) * 0.04, z, { lit: r.litAt(x, z) });
      });
    }
    // 东头的草棚吧：木柜台、茅草顶
    const tx0 = -42.6;
    const tx1 = -39.8;
    const tz0 = 10.4;
    const tz1 = 13.6;
    K.cast({ x0: tx0, x1: tx1, z0: tz0, z1: tz1, h: 3 });
    if (fresh) K.lampAt({ x: -41, z: 12, r: 5, i: 0.6 });
    K.add({ x0: tx0 - 0.3, x1: tx1 + 0.3, z0: tz0 - 0.3, z1: tz1 + 0.3, y0: 0, y1: 3.4 }, (r) => {
      const lit = r.litAt(-41.2, 12);
      const wc = r.col('#6b4a30', 1, lit);
      for (const [x, z] of [
        [tx0, tz0],
        [tx1, tz0],
        [tx0, tz1],
        [tx1, tz1],
      ] as const)
        r.wline([x, 0, z], [x, 2.3, z], wc, Math.max(1, Math.round(r.k * 0.2)));
      box(r, tx0, tx1 - 1.6, tz0, tz1, 0, 1.1, fd('#a8743f', worn), { lit, top: '#6b4a30' });
      hipRoof(r, tx0 - 0.4, tx1 + 0.4, tz0 - 0.4, tz1 + 0.4, 2.3, 1.0, fd('#d8b45a', worn), { lit });
      if (dark(r) && fresh) {
        const p = r.P(-41.2, 1.9, 12);
        r.glow(p[0], p[1], r.k * 2.2, [80, 50, 10], 0.8);
      }
    });
    return;
  }
  // 冷水恢复池：池畔南边三只冷水桶、两个毛巾架，东头一只大计时钟
  for (const x of [-58.2, -55, -51.8]) tub(K, x, 15.4, 0.85, worn);
  for (const x of [-47.8, -44.6]) {
    const z = 15.4;
    K.add({ x0: x - 1, x1: x + 1, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 1.5 }, (r) => {
      const lit = r.litAt(x, z);
      const mc = r.col('#a8b0ba', 1, lit);
      r.wline([x - 0.9, 0, z], [x - 0.9, 1.4, z], mc);
      r.wline([x + 0.9, 0, z], [x + 0.9, 1.4, z], mc);
      r.wline([x - 0.9, 1.4, z], [x + 0.9, 1.4, z], mc);
      r.wline([x - 0.9, 0.8, z], [x + 0.9, 0.8, z], mc);
      // 搭着的毛巾：白、藏青相间
      for (let i = 0; i < 3; i++) {
        const u0 = x - 0.8 + i * 0.55;
        const c = r.col(fd(i === 1 ? '#2f5d8a' : '#f6f3ea', worn), 1, lit);
        r.wpoly(
          [
            [u0, 1.42, z + 0.03],
            [u0 + 0.45, 1.42, z + 0.03],
            [u0 + 0.45, worn && i === 2 ? 1.2 : 0.75, z + 0.03],
            [u0, worn && i === 2 ? 1.2 : 0.75, z + 0.03],
          ],
          c,
        );
      }
    });
  }
  const cx = -42.4;
  const cz = 3.4;
  K.add({ x0: cx - 0.1, x1: cx + 0.1, z0: cz - 0.1, z1: cz + 0.1, y0: 0, y1: 2.6 }, (r) =>
    pole(r, cx, cz, 2.6, r.col('#596069', 1, r.litAt(cx, cz))),
  );
  sprite(K, PACE_CLOCK, cx, 2.5, cz);
  if (fresh) K.lampAt({ x: -50, z: 15, r: 6, i: 0.4 });
}

/** 冷水恢复池的水色（build.ts 的池底用）：发白的冰蓝，掉档时发灰发绿 */
export function poolIceColors(
  r: DrawContext,
  murky: boolean,
  N: boolean,
): { w1: number; w3: number; red: number; white: number; chunk: number } {
  if (murky)
    return {
      w1: r.col('#7a9a8a', 1, 0),
      w3: r.col('#6a8a7a', 1, 0),
      red: r.col('#9a6a5a', 1, 0),
      white: r.col('#b8c0b0', 1, 0),
      chunk: r.col('#7a9a8a', 1, 0),
    };
  return {
    w1: N ? r.em('#5fc8e0') : r.col('#9fe4f0', 1, 0),
    w3: N ? r.em('#48b0cc') : r.col('#82d4e6', 1, 0),
    red: N ? r.em('#ff6a5a') : r.col('#e2463c', 1, 0),
    white: N ? r.em('#ffffff') : r.col('#ffffff', 1, 0),
    chunk: N ? r.em('#e8fbff') : r.col('#f4fdff', 1, 0),
  };
}

/** 小木屋一排（泳池升级）：西边池畔四间木屋、茅草顶、彩色门帘，门朝东对着池子 */
export function cabanaRow(K: Kit, worn: boolean): void {
  const x0 = -61.4;
  const x1 = -58.6;
  const curtains = ['#e2463c', '#17a2b8', '#f0c53c', '#3fb37f'];
  for (let i = 0; i < 4; i++) {
    const z0 = 3.6 + i * 3.4;
    const z1 = z0 + 2.6;
    K.cast({ x0, x1, z0, z1, h: 2.8 });
    K.add({ x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.3, y0: 0, y1: 3.4 }, (r) => {
      const lit = r.litAt((x0 + x1) / 2, (z0 + z1) / 2);
      box(r, x0, x1, z0, z1, 0, 2.2, fd('#b07a48', worn), {
        lit,
        noTop: true,
        sideSh: (_nx, _nz, _pts, cc) => {
          const d = r.col(fd('#b07a48', worn), 0.62, lit);
          const s = Math.max(2, Math.round(r.k * 0.45));
          return (_x, y) => (y % s === 0 ? d : cc);
        },
        face: (nx) => {
          if (nx !== 1) return;
          fq(r, 'x', x1, 1, 0, z0 + 0.5, z1 - 0.5, 0, 1.9, r.col(fd(curtains[i] as string, worn), 1, lit));
          fq(r, 'x', x1, 1, 0, z0 + 1.2, z0 + 1.4, 0, 1.9, r.col('#ffffff', 0.9, lit));
        },
      });
      hipRoof(r, x0 - 0.35, x1 + 0.35, z0 - 0.35, z1 + 0.35, 2.2, 1.1, fd('#d8b45a', worn), { lit });
    });
  }
  if (!worn) K.lampAt({ x: -59, z: 10, r: 7, i: 0.5 });
}
