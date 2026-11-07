// 荒废硬地的像素贴图（每像素 0.1 米）：褪色的蓝紫内场和绿色外场、断断续续的白线、
// 几条长裂缝和一小片龟裂、几块剥落露出的沥青。顺便记下裂缝点（种杂草用）。
import type * as THREE from 'three';
import { COURT } from '../../layout';
import { fbm, white } from './noise';
import { hex, Pix, type RGB } from './pix';

export const TEX = 0.1;
export const PAD_W = COURT.padHw * 2;
export const PAD_L = COURT.padHl * 2;

// 亮档颜色（材质 ramp 给中、暗档的冷色比例）。大块纯色，细节少而清楚。
const C = {
  inA: hex(0x86a0bc),
  inBleach: hex(0x9cb0c4),
  outA: hex(0x84a084),
  outBleach: hex(0x98ae96),
  line: hex(0xe8e0d0),
  asphalt: hex(0x7c7884),
  asphaltRim: hex(0xb4bcc8),
};

/** 裂缝 = 当地漆色的深一档（偏靛），不是黑 */
const crackOf = (c: RGB): RGB => [c[0] * 0.62, c[1] * 0.64, c[2] * 0.78];

/** 翘起的板块（世界坐标的凸多边形），lift 米：从 hinge 边到对边线性抬起 */
export interface Slab {
  poly: [number, number][];
  /** 抬起方向（单位向量，xz）和起点（铰链线上的一点） */
  dir: [number, number];
  hinge: [number, number];
  span: number;
  lift: number;
}

export const SLABS: Slab[] = [
  {
    poly: [
      [2.3, -16.7],
      [8.6, -16.9],
      [8.7, -13.5],
      [5.3, -13.8],
      [2.1, -14.3],
    ],
    dir: [0, 1],
    hinge: [0, -16.9],
    span: 3.2,
    lift: 0.24,
  },
  {
    poly: [
      [-8.7, 3.5],
      [-5.4, 3.9],
      [-4.9, 7.3],
      [-8.7, 7.7],
    ],
    dir: [1, 0],
    hinge: [-8.7, 0],
    span: 3.8,
    lift: 0.2,
  },
  {
    poly: [
      [0.9, 1.3],
      [3.7, 1.1],
      [3.9, 3.1],
      [1.1, 3.3],
    ],
    dir: [0, -1],
    hinge: [0, 3.3],
    span: 2.1,
    lift: 0.14,
  },
];

export interface Painted {
  tex: THREE.DataTexture;
  /** 裂缝上的点（世界坐标），杂草从这里长 */
  crackPts: { x: number; z: number; major: boolean }[];
  /** 剥落斑中心 */
  peels: { x: number; z: number; r: number }[];
}

export function paintCourt(rnd: () => number): Painted {
  const W = Math.round(PAD_W / TEX);
  const H = Math.round(PAD_L / TEX);
  const p = new Pix(W, H);
  const tx = (x: number) => (x + COURT.padHw) / TEX;
  const tz = (z: number) => (z + COURT.padHl) / TEX;
  const wx = (i: number) => -COURT.padHw + (i + 0.5) * TEX;
  const wz = (j: number) => -COURT.padHl + (j + 0.5) * TEX;
  const inner = (x: number, z: number) => Math.abs(x) <= COURT.hw + 0.05 && Math.abs(z) <= COURT.hl + 0.05;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H;

  // 1. 底色：两种漆，几大块晒白（低频、约 20%）
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = wx(i);
      const z = wz(j);
      const b = fbm(x * 0.09 + 4, z * 0.16, 102, 3);
      const ins = inner(x, z);
      p.set(i, j, ins ? (b > 0.6 ? C.inBleach : C.inA) : b > 0.6 ? C.outBleach : C.outA);
    }
  }

  // 2. 白线：干净的实线，只在几处断开
  const paintLine = (i: number, j: number) => {
    if (!inside(i, j)) return;
    if (fbm(wx(i) * 0.5, wz(j) * 0.5, 120, 2) > 0.7) return;
    p.set(i, j, C.line);
  };
  const hline = (z: number, x0: number, x1: number, wTex: number) => {
    const j0 = Math.round(tz(z) - wTex / 2);
    for (let j = j0; j < j0 + wTex; j++) for (let i = Math.round(tx(x0)); i < Math.round(tx(x1)); i++) paintLine(i, j);
  };
  const vline = (x: number, z0: number, z1: number, wTex: number) => {
    const i0 = Math.round(tx(x) - wTex / 2);
    for (let i = i0; i < i0 + wTex; i++) for (let j = Math.round(tz(z0)); j < Math.round(tz(z1)); j++) paintLine(i, j);
  };
  const { hw, hl, shw, service } = COURT;
  hline(-hl, -hw - 0.1, hw + 0.1, 3);
  hline(hl, -hw - 0.1, hw + 0.1, 3);
  vline(-hw, -hl, hl, 2);
  vline(hw, -hl, hl, 2);
  vline(-shw, -hl, hl, 2);
  vline(shw, -hl, hl, 2);
  hline(-service, -shw, shw, 2);
  hline(service, -shw, shw, 2);
  vline(0, -service, service, 2);
  vline(0, -hl, -hl + 0.3, 2);
  vline(0, hl - 0.3, hl, 2);

  // 3. 裂缝：少而长，1 纹素，当地颜色的深一档
  const crackPts: Painted['crackPts'] = [];
  const base = new Uint8Array(p.data); // 取色用画裂缝前的颜色，避免越描越黑
  const crackPx = (i: number, j: number) => {
    if (!inside(i, j)) return;
    const k = (j * W + i) * 4;
    p.set(i, j, crackOf([base[k], base[k + 1], base[k + 2]]));
  };
  const walk = (x: number, z: number, ang: number, len: number, depth: number, major: boolean) => {
    const step = 0.3;
    for (let s = 0; s < len / step; s++) {
      const nx = x + Math.cos(ang) * step;
      const nz = z + Math.sin(ang) * step;
      if (Math.abs(nx) > COURT.padHw || Math.abs(nz) > COURT.padHl) return;
      p.line(tx(x), tz(z), tx(nx), tz(nz), 1, crackPx);
      if (s % 3 === 0) crackPts.push({ x: nx, z: nz, major });
      x = nx;
      z = nz;
      ang += (rnd() - 0.5) * 0.45;
      if (depth > 0 && rnd() < 0.035)
        walk(x, z, ang + (rnd() < 0.5 ? 1 : -1) * (0.8 + rnd() * 0.6), 1.5 + rnd() * 2.5, depth - 1, false);
    }
  };
  for (const z of [-14.6, -7.8, 4.6, 12.9]) {
    const fromW = rnd() < 0.5;
    walk(
      fromW ? -COURT.padHw : COURT.padHw,
      z + (rnd() - 0.5),
      fromW ? (rnd() - 0.5) * 0.2 : Math.PI + (rnd() - 0.5) * 0.2,
      10 + rnd() * 9,
      1,
      true,
    );
  }
  walk(-6.8, -COURT.padHl, Math.PI / 2, 12, 1, true);
  walk(3.2, COURT.padHl, -Math.PI / 2, 8, 1, true);
  // 一小片龟裂（Voronoi 边，1 纹素）
  const zn = { x: -3.2, z: -10.6, r: 1.6 };
  const pts = Array.from({ length: 9 }, () => {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * zn.r;
    return [zn.x + Math.cos(a) * d, zn.z + Math.sin(a) * d];
  });
  const R = Math.ceil(zn.r / TEX);
  for (let j = Math.floor(tz(zn.z) - R); j <= tz(zn.z) + R; j++) {
    for (let i = Math.floor(tx(zn.x) - R); i <= tx(zn.x) + R; i++) {
      if (!inside(i, j)) continue;
      const x = wx(i);
      const z = wz(j);
      if (Math.hypot(x - zn.x, z - zn.z) > zn.r) continue;
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [px, pz] of pts) {
        const d = Math.hypot(x - px, z - pz);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      if (d2 - d1 < 0.06) {
        crackPx(i, j);
        if (white(i, j, 131) < 0.05) crackPts.push({ x, z, major: false });
      }
    }
  }

  // 4. 剥落：几块干净的形状，平涂沥青 + 一纹素翘起的亮边
  const peels: Painted['peels'] = [];
  const spots: [number, number, number][] = [
    [-2.2, 3.4, 0.9],
    [3.6, -8.6, 0.7],
    [-5.6, -15.2, 1.1],
    [5.9, 10.8, 0.8],
    [1.2, 15.6, 0.6],
    [-6.9, 9.4, 0.7],
  ];
  for (const [cx, cz, r] of spots) {
    peels.push({ x: cx, z: cz, r });
    const ins = (i: number, j: number) => {
      const x = wx(i);
      const z = wz(j);
      const a = Math.atan2(z - cz, x - cx);
      const rr = r * (0.8 + 0.25 * Math.sin(a * 3 + cx) + 0.12 * Math.sin(a * 5 + cz));
      return Math.hypot((x - cx) / 1.25, z - cz) < rr;
    };
    const RR = Math.ceil((r * 1.8) / TEX);
    for (let j = Math.floor(tz(cz) - RR); j <= tz(cz) + RR; j++) {
      for (let i = Math.floor(tx(cx) - RR); i <= tx(cx) + RR; i++) {
        if (!inside(i, j) || !ins(i, j)) continue;
        // 亮边只在上沿（远离镜头的一侧），像翘起的漆皮迎着光
        p.set(i, j, !ins(i, j - 1) ? C.asphaltRim : C.asphalt);
      }
    }
  }

  // 5. 翘起板块的边：裂缝
  for (const s of SLABS) {
    for (let k = 0; k < s.poly.length; k++) {
      const [x0, z0] = s.poly[k];
      const [x1, z1] = s.poly[(k + 1) % s.poly.length];
      if (Math.abs(x0) >= COURT.padHw - 0.35 && Math.abs(x1) >= COURT.padHw - 0.35) continue;
      p.line(tx(x0), tz(z0), tx(x1), tz(z1), 1, crackPx);
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.9);
      for (let t = 0; t < n; t++)
        crackPts.push({ x: x0 + ((x1 - x0) * t) / n, z: z0 + ((z1 - z0) * t) / n, major: true });
    }
  }

  return { tex: p.texture(), crackPts, peels };
}
