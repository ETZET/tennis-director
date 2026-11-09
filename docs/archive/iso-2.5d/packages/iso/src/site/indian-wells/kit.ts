import type { DrawContext } from '../../core/graph';

/**
 * 场景构建用的立体画法（照样片的 box / fq / hipRoof / cyl）：在 DrawContext 的光栅原语上
 * 多加几样样片里有、契约里没有的东西——侧面和顶面的着色函数、立面上贴的小方块（窗、门、招牌）、
 * 带洞的屋顶、按列着色的圆柱、反投影。
 */

export type Pt = readonly [number, number, number];
export type Shader = (x: number, y: number) => number;

/** 光从西北偏上来（样片的 LX/LZ） */
export const LX = -0.6;
export const LZ = 0.8;
export const faceF = (nx: number, nz: number): number => 0.7 + 0.2 * (nx * LX + nz * LZ);

/** 世界点 → 缓冲像素（平铺的 [x0,y0,x1,y1,...]） */
export function proj(r: DrawContext, pts: readonly Pt[]): number[] {
  const f: number[] = [];
  for (const p of pts) {
    const s = r.P(p[0], p[1], p[2]);
    f.push(s[0], s[1]);
  }
  return f;
}

/** 填一个世界多边形，返回投影后的点（样片的 wpoly） */
export function wp(r: DrawContext, pts: readonly Pt[], c: number, sh?: Shader | null): number[] {
  r.wpoly(pts, c, sh ?? undefined);
  return proj(r, pts);
}

/** 斜条纹着色（屋瓦、条纹布） */
export function stripeSh(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  period: number,
  c1: number,
  c2: number,
): Shader {
  const ex = bx - ax;
  const ey = by - ay;
  const l = Math.hypot(ex, ey) || 1;
  const nx = -ey / l;
  const ny = ex / l;
  return (x, y) => (Math.floor(((x - ax) * nx + (y - ay) * ny) / period) & 1 ? c2 : c1);
}

export interface BoxOpts {
  lit?: number;
  top?: string;
  side?: string;
  noTop?: boolean;
  edge?: boolean;
  /** 顶面、侧面的明暗倍数 */
  tf?: number;
  sf?: number;
  sideSh?: (nx: number, nz: number, pts: readonly Pt[], c: number) => Shader | null;
  topSh?: (tc: number) => Shader;
  /** 每个看得见的侧面画完以后调（贴窗、门） */
  face?: (nx: number, nz: number, sp: number[]) => void;
}

const FACES = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) =>
  [
    [
      1,
      0,
      [
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
    ],
    [
      -1,
      0,
      [
        [x0, y0, z1],
        [x0, y0, z0],
        [x0, y1, z0],
        [x0, y1, z1],
      ],
    ],
    [
      0,
      1,
      [
        [x1, y0, z1],
        [x0, y0, z1],
        [x0, y1, z1],
        [x1, y1, z1],
      ],
    ],
    [
      0,
      -1,
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
    ],
  ] as const satisfies readonly (readonly [number, number, readonly Pt[]])[];

/** 等距挤出的方块：看得见的侧面按法线明暗，顶面加一圈高光线 */
export function box(
  r: DrawContext,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  h: string,
  o: BoxOpts = {},
): void {
  const lit = o.lit ?? 0;
  const F = FACES(x0, x1, z0, z1, y0, y1);
  for (const [nx, nz, pts] of F) {
    if (!r.vis(nx, nz)) continue;
    const c = r.col(o.side ?? h, faceF(nx, nz) * (o.sf ?? 1), lit);
    const sp = wp(r, pts, c, o.sideSh ? o.sideSh(nx, nz, pts, c) : null);
    o.face?.(nx, nz, sp);
  }
  if (o.noTop) return;
  const tc = r.col(o.top ?? h, o.tf ?? 1, lit);
  const tp: Pt[] = [
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x0, y1, z1],
  ];
  r.wpoly(tp, tc, o.topSh ? o.topSh(tc) : undefined);
  if (o.edge !== false && (x1 - x0) * r.k > 3 && (z1 - z0) * r.k > 3) {
    const ec = r.col(o.top ?? h, 1.12, lit);
    for (const [nx, nz, pts] of F) if (r.vis(nx, nz)) r.wline(pts[2], pts[3], ec);
  }
}

/**
 * 方块侧面上贴的一小块（窗、门、招牌）：ax 'x' 是平面 x=c、横跨 z u0..u1；'z' 是平面 z=c、横跨 x。
 * 背对镜头时不画，返回 null。
 */
export function fq(
  r: DrawContext,
  ax: 'x' | 'z',
  c: number,
  nx: number,
  nz: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  colr: number,
  sh?: Shader | null,
): number[] | null {
  if (!r.vis(nx, nz)) return null;
  const o = 0.03 * (nx + nz);
  const pts: Pt[] =
    ax === 'x'
      ? [
          [c + o, v0, u0],
          [c + o, v0, u1],
          [c + o, v1, u1],
          [c + o, v1, u0],
        ]
      : [
          [u0, v0, c + o],
          [u1, v0, c + o],
          [u1, v1, c + o],
          [u0, v1, c + o],
        ];
  return wp(r, pts, colr, sh);
}

/** 四坡屋顶（瓦的条纹、檐口暗线、屋脊高光）；holes 在每个看得见的坡面上画破洞 */
export function hipRoof(
  r: DrawContext,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  rise: number,
  h: string,
  o: { lit?: number; holes?: ((nx: number, nz: number, pts: readonly Pt[]) => void) | null } = {},
): void {
  const lit = o.lit ?? 0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const A: Pt = [x0, y, z0];
  const B: Pt = [x1, y, z0];
  const C: Pt = [x1, y, z1];
  const D: Pt = [x0, y, z1];
  let r0: Pt;
  let r1: Pt;
  let faces: [number, number, Pt[], [Pt, Pt]][];
  if (x1 - x0 >= z1 - z0) {
    const hh = (z1 - z0) / 2;
    r0 = [x0 + hh, y + rise, cz];
    r1 = [x1 - hh, y + rise, cz];
    faces = [
      [0, -1, [A, B, r1, r0], [A, B]],
      [0, 1, [D, C, r1, r0], [D, C]],
      [-1, 0, [A, D, r0], [A, D]],
      [1, 0, [B, C, r1], [B, C]],
    ];
  } else {
    const hh = (x1 - x0) / 2;
    r0 = [cx, y + rise, z0 + hh];
    r1 = [cx, y + rise, z1 - hh];
    faces = [
      [-1, 0, [A, D, r1, r0], [A, D]],
      [1, 0, [B, C, r1, r0], [B, C]],
      [0, -1, [A, B, r0], [A, B]],
      [0, 1, [D, C, r1], [D, C]],
    ];
  }
  faces.sort((a, b) => (r.vis(a[0], a[1]) ? 1 : 0) - (r.vis(b[0], b[1]) ? 1 : 0));
  for (const [nx, nz, pts, eave] of faces) {
    const f = 0.86 + 0.2 * (nx * LX + nz * LZ);
    const c1 = r.col(h, f, lit);
    const c2 = r.col(h, f * 0.84, lit);
    const e0 = r.P(...eave[0]);
    const e1 = r.P(...eave[1]);
    r.wpoly(pts, c1, stripeSh(e0[0], e0[1], e1[0], e1[1], Math.max(2, r.k * 0.75), c1, c2));
    o.holes?.(nx, nz, pts);
    r.line(e0[0], e0[1], e1[0], e1[1], r.col(h, f * 0.62, lit));
  }
  const a = r.P(...r0);
  const b = r.P(...r1);
  r.line(a[0], a[1], b[0], b[1], r.col(h, 1.15, lit));
}

/** 带着色函数的椭圆（契约的 ell 只有纯色）；sh 返回 0 = 不画 */
export function ellSh(r: DrawContext, cx: number, cy: number, rx: number, ry: number, sh: Shader): void {
  if (rx <= 0 || ry <= 0) return;
  const y0 = Math.ceil(cy - ry - 0.5);
  const y1 = Math.floor(cy + ry - 0.5);
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (dy * dy >= 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const xa = Math.ceil(cx - hw - 0.5);
    const xb = Math.floor(cx + hw - 0.5);
    for (let x = xa; x <= xb; x++) {
      const v = sh(x, y);
      if (v) r.pix(x, y, v);
    }
  }
}

/** 竖着的圆柱：侧面按列分三档明暗，顶面一个椭圆 */
export function cyl(
  r: DrawContext,
  x: number,
  z: number,
  rad: number,
  y0: number,
  y1: number,
  h: string,
  o: { lit?: number; top?: string; noTop?: boolean } = {},
): void {
  const lit = o.lit ?? 0;
  const a = r.P(x, y0, z);
  const b = r.P(x, y1, z);
  const rx = rad * r.k * Math.SQRT2;
  const ry = rx * 0.5;
  const c1 = r.col(h, 0.92, lit);
  const c2 = r.col(h, 0.76, lit);
  const c3 = r.col(h, 0.62, lit);
  const sh = (px: number): number => {
    const t = (px + 0.5 - a[0]) / rx;
    return t < -0.35 ? c1 : t < 0.35 ? c2 : c3;
  };
  ellSh(r, a[0], a[1], rx, ry, (px) => sh(px));
  const ya = Math.round(b[1]);
  const yb = Math.round(a[1]);
  if (yb > ya)
    for (let px = Math.ceil(a[0] - rx - 0.5); px <= Math.floor(a[0] + rx - 0.5); px++)
      r.rect(px, ya, 1, yb - ya, sh(px));
  if (!o.noTop) r.ell(b[0], b[1], rx, ry, r.col(o.top ?? h, 1.05, lit));
}

/**
 * 反投影：缓冲像素 + 高度 → 世界 (x, z)。投影是仿射的，用 P 取三个点解 2×2 方程
 * （DrawContext 没有 unproject；泳池池底这种"只在洞口里看得见"的东西要用）。
 */
export function unprojector(r: DrawContext): (sx: number, sy: number, y: number) => [number, number] {
  const o = r.P(0, 0, 0);
  const ex = r.P(1, 0, 0);
  const ez = r.P(0, 0, 1);
  const ey = r.P(0, 1, 0);
  const a = ex[0] - o[0];
  const c = ex[1] - o[1];
  const b = ez[0] - o[0];
  const d = ez[1] - o[1];
  const hy0 = ey[0] - o[0];
  const hy1 = ey[1] - o[1];
  const det = a * d - b * c || 1e-9;
  return (sx, sy, y) => {
    const u = sx - o[0] - hy0 * y;
    const v = sy - o[1] - hy1 * y;
    return [(d * u - b * v) / det, (a * v - c * u) / det];
  };
}

/** 3×5 像素字（大门招牌），只收用到的字母 */
const FONT: Record<string, string> = {
  P: '111101111100100',
  A: '010101111101101',
  L: '100100100100111',
  M: '101111111101101',
  O: '111101101101111',
  S: '111100111001111',
  I: '111010010010111',
  ' ': '000000000000000',
};

/**
 * 在平面 x=x 上 z0 往 +z 那一段写一行字（大门门楣）。
 * 字总是从屏幕左往右读：镜头转到 +z 朝屏幕左边的时候，整行在同一段 z 里倒过来排（不然看到的是镜像字）。
 */
export function drawText(r: DrawContext, s: string, x: number, y: number, z0: number, size: number, c: number): void {
  const px = size / 5;
  const span = s.length * px * 4 - px;
  const flip = r.P(x, y, z0 + 1)[0] < r.P(x, y, z0)[0];
  let z = z0;
  for (const ch of s) {
    const g = FONT[ch];
    if (g)
      for (let row = 0; row < 5; row++)
        for (let q = 0; q < 3; q++)
          if (g[row * 3 + q] === '1') {
            const zq = z + q * px;
            const zz = flip ? 2 * z0 + span - zq - px : zq;
            const yy = y + (4 - row) * px * 0.9;
            // 每个字像素是门楣平面上的一小块平行四边形（跟着门楣斜，字不会被剪成锯齿）
            r.wpoly(
              [
                [x, yy, zz],
                [x, yy, zz + px],
                [x, yy + px * 0.9, zz + px],
                [x, yy + px * 0.9, zz],
              ],
              c,
            );
          }
    z += px * 4;
  }
}
