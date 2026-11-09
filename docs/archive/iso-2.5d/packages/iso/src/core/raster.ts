/**
 * 软件光栅（照搬样片）：多边形扫描填充、线、椭圆、矩形、点、压暗、Bayer 抖动光晕，
 * 等距立体原语（方块、四坡屋顶、圆柱）和条纹着色器，包成 DrawContext。不碰 DOM。
 *
 * 画进一张 Uint32Array（ImageData 的像素），可选一张 Float32Array 深度缓冲（每像素存 rx + rz，越大越靠前）：
 * - ZNONE：只画颜色（背景、地面）；
 * - ZWRITE：画颜色并写深度（烘焙静态层）；
 * - ZTEST：深度不小于缓冲里的才画，不写深度（动态层被前面的建筑挡住）。
 * 平面多边形的深度逐像素按仿射平面算；点、矩形、椭圆、精灵用 `zcur`（当前节点的脚底深度）。
 */
import { flipArt, nightArt } from './art';
import { bay, Palette, pk } from './color';
import type { BakedArt, BoxStyle, DrawContext } from './graph';
import { HV, Projection } from './proj';

export const ZNONE = 0;
export const ZWRITE = 1;
export const ZTEST = 2;
export type ZMode = 0 | 1 | 2;

/** 光源方向（只决定竖直面的明暗） */
export const LX = -0.6;
export const LZ = 0.8;
/** 竖直面按世界法线的明暗（样片的 faceF） */
export const faceF = (nx: number, nz: number): number => 0.7 + 0.2 * (nx * LX + nz * LZ);

type W3 = readonly [number, number, number];
type Shader = (x: number, y: number) => number;

/** 方块的内部扩展选项（样片的 sideSh、noTop 等；场景构建和地台侧面用） */
export interface BoxOpts extends BoxStyle {
  lit?: number;
  /** 侧面亮度系数 */
  sf?: number;
  /** 顶面亮度系数 */
  tf?: number;
  noTop?: boolean;
  /** 侧面着色器工厂：(法线, 世界四角, 面色) → 着色器 */
  sideSh?: (nx: number, nz: number, pts: readonly W3[], c: number) => Shader | null;
  topSh?: (c: number) => Shader | null;
}

/** 被挡住的人物剪影色 */
const XRAY = pk(58, 51, 80);

export class Raster implements DrawContext {
  buf: Uint32Array;
  depth: Float32Array | null = null;
  W: number;
  H: number;
  zmode: ZMode = ZNONE;
  /** 非平面原语的深度 */
  zcur = 0;
  /** 深度测试的容差（米）：贴着墙站的人不被墙吃掉 */
  zeps = 0.35;
  readonly proj: Projection;
  readonly pal: Palette;
  t = 0;
  /** 该处夜里受灯光的程度 0..1（已量化）；由 IsoView 接上地面的灯光图 */
  litFn: (x: number, z: number) => number = () => 0;

  // 当前多边形的深度平面 d = da*x + db*y + dc（像素中心）
  private plane = false;
  private da = 0;
  private db = 0;
  private dc = 0;
  private sp = new Float64Array(64);
  private sd = new Float64Array(32);
  private XS = new Float64Array(64);

  constructor(buf: Uint32Array, W: number, H: number, proj = new Projection(), pal = new Palette()) {
    this.buf = buf;
    this.W = W;
    this.H = H;
    this.proj = proj;
    this.pal = pal;
  }

  setTarget(buf: Uint32Array, depth: Float32Array | null, W: number, H: number): void {
    this.buf = buf;
    this.depth = depth;
    this.W = W;
    this.H = H;
  }

  /* ---------- DrawContext：投影和调色 ---------- */

  P(x: number, y: number, z: number): [number, number] {
    return this.proj.P(x, y, z);
  }
  get k(): number {
    return this.proj.k;
  }
  get spriteScale(): number {
    return this.proj.spriteScale;
  }
  vis(nx: number, nz: number): boolean {
    return this.proj.vis(nx, nz);
  }
  col(hex: string, f = 1, lit = 0): number {
    return this.pal.col(hex, f, lit);
  }
  em(hex: string, f = 1): number {
    return this.pal.em(hex, f);
  }
  litAt(x: number, z: number): number {
    return this.pal.night > 0 ? this.litFn(x, z) : 0;
  }
  get night(): number {
    return this.pal.night;
  }

  /* ---------- 像素级 ---------- */

  /** 写一个像素（按深度模式；d 缺省用 zcur） */
  put(x: number, y: number, c: number, d = this.zcur): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x;
    const z = this.depth;
    if (this.zmode === ZWRITE && z) z[i] = d;
    else if (this.zmode === ZTEST && z && d + this.zeps < (z[i] as number)) return;
    this.buf[i] = c;
  }

  pix(x: number, y: number, c: number): void {
    this.put(x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    const j1 = Math.min(this.H, y + h);
    const i1 = Math.min(this.W, x + w);
    for (let j = Math.max(0, y); j < j1; j++) for (let i = Math.max(0, x); i < i1; i++) this.put(i, j, c);
  }

  line(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    c: number,
    w = 1,
    pat?: (n: number) => boolean,
    d0 = this.zcur,
    d1 = d0,
  ): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    const steps = Math.max(1, dx, -dy);
    if (steps > 4096) return;
    let e = dx + dy;
    let n = 0;
    for (;;) {
      if (!pat || pat(n)) {
        const d = d0 + ((d1 - d0) * n) / steps;
        if (w === 1) this.put(x0, y0, c, d);
        else for (let q = 0; q < w; q++) this.put(x0 - (w >> 1) + q, y0, c, d);
      }
      n++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }

  wline(a: W3, b: W3, c: number, w = 1, pat?: (n: number) => boolean): void {
    const pr = this.proj;
    this.line(
      pr.sx(a[0], a[2]),
      pr.sy(a[0], a[1], a[2]),
      pr.sx(b[0], b[2]),
      pr.sy(b[0], b[1], b[2]),
      c,
      w,
      pat,
      pr.depth(a[0], a[2]),
      pr.depth(b[0], b[2]),
    );
  }

  ell(cx: number, cy: number, rx: number, ry: number, c: number, sh?: Shader | null): void {
    if (rx <= 0 || ry <= 0) return;
    const y0 = Math.max(0, Math.ceil(cy - ry - 0.5));
    const y1 = Math.min(this.H - 1, Math.floor(cy + ry - 0.5));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy >= 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const xa = Math.max(0, Math.ceil(cx - hw - 0.5));
      const xb = Math.min(this.W - 1, Math.floor(cx + hw - 0.5));
      for (let x = xa; x <= xb; x++) {
        const v = sh ? sh(x, y) : c;
        if (v) this.put(x, y, v);
      }
    }
  }

  /** 压暗一个像素（影子） */
  darken(x: number, y: number, f: number): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x;
    if (this.zmode === ZTEST && this.depth && this.zcur + this.zeps < (this.depth[i] as number)) return;
    const v = this.buf[i] as number;
    this.buf[i] = pk((v & 255) * f, ((v >>> 8) & 255) * f, ((v >>> 16) & 255) * f * 1.05);
  }

  /** 加色光晕（Bayer 抖动成 4 档）；不看深度 */
  glow(sx: number, sy: number, r: number, rgb: readonly [number, number, number], inten: number): void {
    const x0 = Math.max(0, Math.floor(sx - r));
    const x1 = Math.min(this.W - 1, Math.ceil(sx + r));
    const y0 = Math.max(0, Math.floor(sy - r));
    const y1 = Math.min(this.H - 1, Math.ceil(sy + r));
    const buf = this.buf;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy);
        if (d >= r) continue;
        let f = 1 - d / r;
        f = f * f * inten;
        const q = Math.floor(f * 4 + bay(x, y)) / 4;
        if (q <= 0) continue;
        const i = y * this.W + x;
        const v = buf[i] as number;
        buf[i] = pk((v & 255) + rgb[0] * q, ((v >>> 8) & 255) + rgb[1] * q, ((v >>> 16) & 255) + rgb[2] * q);
      }
  }

  /* ---------- 多边形 ---------- */

  /** 填一个屏幕多边形（p = [x0, y0, x1, y1, ...]，n 个点）；深度用当前平面或 zcur */
  fillPoly(p: ArrayLike<number>, n: number, c: number, sh?: Shader | null): void {
    let mn = 1e9;
    let mx = -1e9;
    for (let i = 0; i < n; i++) {
      const y = p[i * 2 + 1] as number;
      if (y < mn) mn = y;
      if (y > mx) mx = y;
    }
    const y0 = Math.max(0, Math.ceil(mn - 0.5));
    const y1 = Math.min(this.H - 1, Math.floor(mx - 0.5));
    if (y1 - y0 > 8192) return;
    const XS = this.XS.length >= n ? this.XS : (this.XS = new Float64Array(n * 2));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let m = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = p[i * 2 + 1] as number;
        const yj = p[j * 2 + 1] as number;
        if ((yi <= yc && yj > yc) || (yj <= yc && yi > yc)) {
          const xi = p[i * 2] as number;
          XS[m++] = xi + ((yc - yi) * ((p[j * 2] as number) - xi)) / (yj - yi);
        }
      }
      for (let a = 1; a < m; a++) {
        const v = XS[a] as number;
        let b = a - 1;
        while (b >= 0 && (XS[b] as number) > v) {
          XS[b + 1] = XS[b] as number;
          b--;
        }
        XS[b + 1] = v;
      }
      for (let a = 0; a + 1 < m; a += 2) {
        const xa = Math.max(0, Math.ceil((XS[a] as number) - 0.5));
        const xb = Math.min(this.W - 1, Math.floor((XS[a + 1] as number) - 0.5));
        if (xb >= xa) this.span(y, xa, xb, c, sh);
      }
    }
  }

  private span(y: number, xa: number, xb: number, c: number, sh?: Shader | null): void {
    const row = y * this.W;
    const buf = this.buf;
    const z = this.depth;
    const mode = z ? this.zmode : ZNONE;
    if (mode === ZNONE) {
      if (!sh) buf.fill(c, row + xa, row + xb + 1);
      else
        for (let x = xa; x <= xb; x++) {
          const v = sh(x, y);
          if (v) buf[row + x] = v;
        }
      return;
    }
    const zz = z as Float32Array;
    const pl = this.plane;
    const da = pl ? this.da : 0;
    const d0 = pl ? this.db * (y + 0.5) + this.dc + da * 0.5 : this.zcur;
    if (mode === ZWRITE) {
      for (let x = xa; x <= xb; x++) {
        const v = sh ? sh(x, y) : c;
        if (!v) continue;
        buf[row + x] = v;
        zz[row + x] = d0 + da * x;
      }
    } else {
      const eps = this.zeps;
      for (let x = xa; x <= xb; x++) {
        if (d0 + da * x + eps < (zz[row + x] as number)) continue;
        const v = sh ? sh(x, y) : c;
        if (v) buf[row + x] = v;
      }
    }
  }

  /** 由投影后的点和每点深度求深度平面 */
  private setPlane(p: ArrayLike<number>, d: ArrayLike<number>, n: number): void {
    // 找面积最大的三角形（顶点 0 + 另外两个），避免退化
    let best = 0;
    let bi = 1;
    let bj = 2;
    const x0 = p[0] as number;
    const y0 = p[1] as number;
    for (let i = 1; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const det =
          ((p[i * 2] as number) - x0) * ((p[j * 2 + 1] as number) - y0) -
          ((p[j * 2] as number) - x0) * ((p[i * 2 + 1] as number) - y0);
        if (Math.abs(det) > Math.abs(best)) {
          best = det;
          bi = i;
          bj = j;
        }
      }
    if (Math.abs(best) < 0.25) {
      let s = 0;
      for (let i = 0; i < n; i++) s += d[i] as number;
      this.plane = true;
      this.da = 0;
      this.db = 0;
      this.dc = s / n;
      return;
    }
    const x1 = (p[bi * 2] as number) - x0;
    const y1 = (p[bi * 2 + 1] as number) - y0;
    const x2 = (p[bj * 2] as number) - x0;
    const y2 = (p[bj * 2 + 1] as number) - y0;
    const d1 = (d[bi] as number) - (d[0] as number);
    const d2 = (d[bj] as number) - (d[0] as number);
    this.da = (d1 * y2 - d2 * y1) / best;
    this.db = (x1 * d2 - x2 * d1) / best;
    this.dc = (d[0] as number) - this.da * x0 - this.db * y0;
    this.plane = true;
  }

  /** 世界多边形（深度逐像素） */
  wpoly(pts: readonly W3[], c: number, sh?: Shader | null): void {
    const n = pts.length;
    if (n < 3) return;
    if (this.sp.length < n * 2) {
      this.sp = new Float64Array(n * 2);
      this.sd = new Float64Array(n);
    }
    const sp = this.sp;
    const sd = this.sd;
    const pr = this.proj;
    for (let i = 0; i < n; i++) {
      const q = pts[i] as W3;
      sp[i * 2] = pr.sx(q[0], q[2]);
      sp[i * 2 + 1] = pr.sy(q[0], q[1], q[2]);
      sd[i] = pr.depth(q[0], q[2]);
    }
    if (this.zmode !== ZNONE) this.setPlane(sp, sd, n);
    this.fillPoly(sp, n, c, sh);
    this.plane = false;
  }

  /** 已投影的多边形 + 每点深度（Box 节点用） */
  polyD(sp: ArrayLike<number>, sd: ArrayLike<number>, n: number, c: number, sh?: Shader | null): void {
    if (this.zmode !== ZNONE) this.setPlane(sp, sd, n);
    this.fillPoly(sp, n, c, sh);
    this.plane = false;
  }

  /* ---------- 立体原语 ---------- */

  box(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, hex: string, o: BoxOpts = {}): void {
    const lit = o.lit ?? 0;
    const k = this.proj.k;
    const F: [number, number, W3[]][] = [
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
    ];
    const C = (h: string, f: number) => (o.emissive ? this.em(h, f) : this.col(h, f, lit));
    if (o.outline) {
      const oc = this.col('#2a2238', 1, lit * 0.5);
      const all: W3[] = [];
      for (const f of F) for (const p of f[2]) all.push(p);
      this.outlineHull(all, oc);
    }
    for (const [nx, nz, pts] of F) {
      if (!this.vis(nx, nz)) continue;
      const c = C(o.side ?? hex, faceF(nx, nz) * (o.sf ?? 1));
      this.wpoly(pts, c, o.sideSh ? o.sideSh(nx, nz, pts, c) : null);
    }
    if (!o.noTop) {
      const tc = C(o.top ?? hex, o.tf ?? 1);
      const tp: W3[] = [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ];
      this.wpoly(tp, tc, o.topSh ? o.topSh(tc) : null);
      if (o.edge !== false && (x1 - x0) * k > 3 && (z1 - z0) * k > 3) {
        const ec = C(o.top ?? hex, 1.12);
        for (const [nx, nz, pts] of F) {
          if (!this.vis(nx, nz)) continue;
          this.wline(pts[2] as W3, pts[3] as W3, ec);
        }
      }
    }
  }

  /** 一组世界点投影后的凸包外扩 1 像素描边（小道具） */
  private outlineHull(pts: readonly W3[], c: number): void {
    const sp: number[] = [];
    for (const q of pts) sp.push(this.proj.sx(q[0], q[2]), this.proj.sy(q[0], q[1], q[2]));
    this.hullOutline(sp, pts.length, c);
  }

  /** 屏幕点集（[x0, y0, x1, y1, ...]）的凸包，往四个方向各挪 1 像素填一遍：之后在上面画本体就是一圈描边 */
  hullOutline(sp: ArrayLike<number>, n: number, c: number): void {
    const P: [number, number][] = [];
    for (let i = 0; i < n; i++) P.push([sp[i * 2] as number, sp[i * 2 + 1] as number]);
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: [number, number], a: [number, number], b: [number, number]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: [number, number][] = [];
    for (const p of P) {
      while (lo.length >= 2 && cr(lo[lo.length - 2] as [number, number], lo[lo.length - 1] as [number, number], p) <= 0)
        lo.pop();
      lo.push(p);
    }
    const up: [number, number][] = [];
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i] as [number, number];
      while (up.length >= 2 && cr(up[up.length - 2] as [number, number], up[up.length - 1] as [number, number], p) <= 0)
        up.pop();
      up.push(p);
    }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    const m = hull.length;
    if (m < 3) return;
    const s = new Float64Array(m * 2);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (let i = 0; i < m; i++) {
        s[i * 2] = (hull[i] as [number, number])[0] + ox;
        s[i * 2 + 1] = (hull[i] as [number, number])[1] + oy;
      }
      this.fillPoly(s, m, c);
    }
  }

  /** 条纹着色器（屋顶瓦） */
  static stripe(ax: number, ay: number, bx: number, by: number, period: number, c1: number, c2: number): Shader {
    const ex = bx - ax;
    const ey = by - ay;
    const l = Math.hypot(ex, ey) || 1;
    const nx = -ey / l;
    const ny = ex / l;
    return (x, y) => (Math.floor(((x - ax) * nx + (y - ay) * ny) / period) & 1 ? c2 : c1);
  }

  hipRoof(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y: number,
    rise: number,
    hex: string,
    o: { lit?: number } = {},
  ): void {
    const lit = o.lit ?? 0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const A: W3 = [x0, y, z0];
    const B: W3 = [x1, y, z0];
    const C: W3 = [x1, y, z1];
    const D: W3 = [x0, y, z1];
    let r0: W3;
    let r1: W3;
    let faces: [number, number, W3[], [W3, W3]][];
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
    faces.sort((a, b) => (this.vis(a[0], a[1]) ? 1 : 0) - (this.vis(b[0], b[1]) ? 1 : 0));
    const k = this.proj.k;
    for (const [nx, nz, pts, eave] of faces) {
      const f = 0.86 + 0.2 * (nx * LX + nz * LZ);
      const c1 = this.col(hex, f, lit);
      const c2 = this.col(hex, f * 0.84, lit);
      const e0 = this.P(...eave[0]);
      const e1 = this.P(...eave[1]);
      this.wpoly(pts, c1, Raster.stripe(e0[0], e0[1], e1[0], e1[1], Math.max(2, k * 0.75), c1, c2));
      this.wline(eave[0], eave[1], this.col(hex, f * 0.62, lit));
    }
    this.wline(r0, r1, this.col(hex, 1.15, lit));
  }

  cyl(
    x: number,
    z: number,
    r: number,
    y0: number,
    y1: number,
    hex: string,
    o: { lit?: number; top?: string; noTop?: boolean } = {},
  ): void {
    const lit = o.lit ?? 0;
    const k = this.proj.k;
    const a = this.P(x, y0, z);
    const b = this.P(x, y1, z);
    const rx = r * k * Math.SQRT2;
    const ry = rx * 0.5;
    const c1 = this.col(hex, 0.92, lit);
    const c2 = this.col(hex, 0.76, lit);
    const c3 = this.col(hex, 0.62, lit);
    const sh = (px: number) => {
      const t = (px + 0.5 - a[0]) / Math.max(0.5, rx);
      return t < -0.35 ? c1 : t < 0.35 ? c2 : c3;
    };
    const zs = this.zcur;
    this.zcur = this.proj.depth(x, z) + r;
    this.ell(a[0], a[1], Math.max(0.5, rx), Math.max(0.5, ry), 0, (px) => sh(px));
    const xl = Math.ceil(a[0] - Math.max(0.5, rx) - 0.5);
    const xr = Math.floor(a[0] + Math.max(0.5, rx) - 0.5);
    for (let y = Math.round(b[1]); y < Math.round(a[1]); y++) for (let px = xl; px <= xr; px++) this.put(px, y, sh(px));
    if (!o.noTop) this.ell(b[0], b[1], Math.max(0.5, rx), Math.max(0.5, ry), this.col(o.top ?? hex, 1.05, lit));
    this.zcur = zs;
  }

  /* ---------- 精灵 ---------- */

  /**
   * 在世界点画一张烘焙像素图：锚点像素对准投影点，按 spriteScale 放大；夜色按 lit 换算，自发光像素不压暗。
   * opacity < 1 时按 Bayer 阈值溶解像素。
   * zbias：这一张图额外的深度容差（米，加在 zeps 上；精灵的遮挡滞回用，见 Draw）。
   * 返回被挡住（没画或画成剪影）的像素数，深度测试关着时为 0。
   */
  art(
    a: BakedArt,
    x: number,
    y: number,
    z: number,
    o: {
      flipX?: boolean;
      scale?: number;
      lit?: number;
      opacity?: number;
      depth?: number;
      xray?: boolean;
      zbias?: number;
    } = {},
  ): number {
    const img = o.flipX ? flipArt(a) : a;
    const s = Math.max(1, Math.round(o.scale ?? this.proj.spriteScale));
    const n = this.pal.night;
    const lit = n > 0 ? (o.lit ?? this.litFn(x, z)) : 0;
    const px = nightArt(img, n, Math.round(lit * 4) / 4, this.pal.warm);
    const pr = this.proj;
    const ax = Math.round(pr.sx(x, z));
    const ay = Math.round(pr.sy(x, y, z));
    const left = ax - img.ox * s;
    const top = ay - img.oy * s;
    const d = o.depth ?? pr.depth(x, z);
    const op = o.opacity ?? 1;
    const { w, h } = img;
    const W = this.W;
    const H = this.H;
    const buf = this.buf;
    const zb = this.depth;
    const mode = zb ? this.zmode : ZNONE;
    const eps = this.zeps + (o.zbias ?? 0);
    let hid = 0;
    for (let j = 0; j < h; j++) {
      const by0 = top + j * s;
      if (by0 + s <= 0 || by0 >= H) continue;
      for (let i = 0; i < w; i++) {
        const v = px[j * w + i] as number;
        if (!v) continue;
        const bx0 = left + i * s;
        for (let q = 0; q < s; q++) {
          const yy = by0 + q;
          if (yy < 0 || yy >= H) continue;
          for (let p = 0; p < s; p++) {
            const xx = bx0 + p;
            if (xx < 0 || xx >= W) continue;
            const ii = yy * W + xx;
            // 溶解掉的像素照样做深度测试、计入遮挡数（精灵的遮挡滞回不随溶解变）
            const gone = op < 1 && bay(xx, yy) >= op;
            if (mode === ZTEST) {
              const zz = zb as Float32Array;
              if (d + eps < (zz[ii] as number)) {
                hid++;
                // 被挡住：剪影（隔一个像素画一个深色点）。只在成片挡住的地方画：左右两边都没挡住的像素
                // 是铁丝网的网眼线、细杆，人本来就从网眼里看得见，再涂剪影色会随人每挪一个像素闪成一片
                // 紫色花纹（QA：贴着围网走时剪影闪）
                if (
                  !gone &&
                  o.xray &&
                  ((xx + yy) & 1) === 0 &&
                  ((xx > 0 && d + eps < (zz[ii - 1] as number)) || (xx + 1 < W && d + eps < (zz[ii + 1] as number)))
                )
                  buf[ii] = XRAY;
                continue;
              }
            }
            if (gone) continue;
            if (mode === ZWRITE) (zb as Float32Array)[ii] = d;
            buf[ii] = v;
          }
        }
      }
    }
    return hid;
  }
}

export { HV };
