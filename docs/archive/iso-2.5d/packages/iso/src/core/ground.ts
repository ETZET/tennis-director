/**
 * 地面贴图（样片的 paintRect / paintCirc）：覆盖整个地台的俯视贴图，0.2 m 一个纹素，每帧（或烘焙静态层时）
 * 反投影采样。夜里的灯光池烘进一张夜间贴图（样片的 makeNight），按夜色档和灯光档缓存。不碰 DOM。
 *
 * 每次 paint 和增删灯都会让版本号变，IsoView 看到版本变了就重烘静态层（不用手动 invalidate，手动也行）。
 */
import { bay, clamp, mixP, mulP, nightP, pk, vnoise } from './color';

/** 世界矩形（米） */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 几块矩形的外包框 */
export function rectsBounds(rs: readonly Rect[]): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const r of rs) {
    x0 = Math.min(x0, r.x0);
    x1 = Math.max(x1, r.x1);
    z0 = Math.min(z0, r.z0);
    z1 = Math.max(z1, r.z1);
  }
  return { x0, x1, z0, z1 };
}

/** 外轮廓的一面墙：x0..x1 × z0..z1 是一条线段（x0 = x1 或 z0 = z1），(nx, nz) 朝外 */
export interface SlabWall {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  nx: number;
  nz: number;
}

/**
 * 几块矩形合并后的外轮廓：按所有矩形的边把平面切成格子，"格子在地台里、隔壁不在"的那条格边就是外墙；
 * 同一条直线上、朝向相同、首尾相接的格边并成一面墙。重叠、相接的矩形都行，中间的接缝不会出现。
 */
export function slabOutline(rs: readonly Rect[]): SlabWall[] {
  const xs = [...new Set(rs.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rs.flatMap((r) => [r.z0, r.z1]))].sort((a, b) => a - b);
  const NX = xs.length - 1;
  const NZ = zs.length - 1;
  const inside = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
    const cx = ((xs[i] as number) + (xs[i + 1] as number)) / 2;
    const cz = ((zs[j] as number) + (zs[j + 1] as number)) / 2;
    return rs.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1);
  };
  const walls: SlabWall[] = [];
  const push = (w: SlabWall) => {
    const p = walls[walls.length - 1];
    // 和上一段接上（同一条线、同一个朝向）就并起来
    if (p && p.nx === w.nx && p.nz === w.nz) {
      if (w.nx !== 0 && p.x0 === w.x0 && p.z1 === w.z0) {
        p.z1 = w.z1;
        return;
      }
      if (w.nz !== 0 && p.z0 === w.z0 && p.x1 === w.x0) {
        p.x1 = w.x1;
        return;
      }
    }
    walls.push(w);
  };
  // 竖墙（x = 常数）：每条 x 线从北往南扫
  for (let i = 0; i <= NX; i++)
    for (const nx of [-1, 1])
      for (let j = 0; j < NZ; j++) {
        const a = inside(i - 1, j);
        const b = inside(i, j);
        if ((nx === 1 && a && !b) || (nx === -1 && b && !a))
          push({ x0: xs[i] as number, x1: xs[i] as number, z0: zs[j] as number, z1: zs[j + 1] as number, nx, nz: 0 });
      }
  // 横墙（z = 常数）：每条 z 线从西往东扫
  for (let j = 0; j <= NZ; j++)
    for (const nz of [-1, 1])
      for (let i = 0; i < NX; i++) {
        const a = inside(i, j - 1);
        const b = inside(i, j);
        if ((nz === 1 && a && !b) || (nz === -1 && b && !a))
          push({ x0: xs[i] as number, x1: xs[i + 1] as number, z0: zs[j] as number, z1: zs[j] as number, nx: 0, nz });
      }
  return walls;
}

/** 夜里的灯光池：位置、半径（米）、强度 */
export interface Lamp {
  x: number;
  z: number;
  r: number;
  i: number;
}

/** 纹素的回调：返回新颜色（打包色），0 = 不改 */
export type PaintFn = (x: number, z: number, c: number, i: number, j: number) => number;
export type CircFn = (x: number, z: number, c: number, d: number, i: number, j: number) => number;

/** 建筑影子的方向（每米高往 +x、-z 偏） */
const SDX = 0.5;
const SDZ = -0.62;

export class GroundPainter {
  /** 米每纹素 */
  readonly TS = 0.2;
  /** 贴图的范围（地台几块矩形的外包框；setExtent 会改） */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  TW: number;
  TH: number;
  /** 白天的贴图（打包色；0 = 没有地面，透明） */
  tex: Uint32Array;
  /** 地台由几块矩形拼成时：哪些纹素在地台里（1 = 在）；单块矩形时 null（整张都是地面） */
  mask: Uint8Array | null = null;
  private readonly fill: number;
  /** 改一次加一 */
  version = 0;
  lampVersion = 0;
  private readonly lamps: Lamp[] = [];
  private LIT: Float32Array | null = null;
  private litVer = -1;
  private nightKey = '';
  private nightBuf: Uint32Array | null = null;

  /** slab：一块矩形，或几块拼出的轮廓（贴图覆盖外包框，框里不在地台上的纹素是 0） */
  constructor(slab: Rect | readonly Rect[], fill = pk(233, 201, 153)) {
    const rs = Array.isArray(slab) ? (slab as readonly Rect[]) : [slab as Rect];
    const b = rectsBounds(rs);
    this.fill = fill;
    this.x0 = b.x0;
    this.z0 = b.z0;
    this.x1 = b.x1;
    this.z1 = b.z1;
    this.TW = Math.round((b.x1 - b.x0) / this.TS);
    this.TH = Math.round((b.z1 - b.z0) / this.TS);
    this.tex = new Uint32Array(this.TW * this.TH).fill(fill);
    if (rs.length > 1) this.applyMask(rs, null);
  }

  /**
   * 地台换了轮廓（world.setSlab）：贴图换成新外包框的大小，原来画过的纹素按世界坐标原样搬过去
   * （外包框的西北角没动时，纹素下标也不变，hash(i, j) 的花纹对得上）；新进地台的纹素填底色，
   * 出了地台的纹素清成 0。之后由场景把新地画上去。
   */
  setExtent(slab: readonly Rect[]): void {
    const b = rectsBounds(slab);
    const TS = this.TS;
    const TW = Math.round((b.x1 - b.x0) / TS);
    const TH = Math.round((b.z1 - b.z0) / TS);
    const old = { tex: this.tex, TW: this.TW, TH: this.TH, mask: this.mask };
    const di = Math.round((this.x0 - b.x0) / TS);
    const dj = Math.round((this.z0 - b.z0) / TS);
    const tex = new Uint32Array(TW * TH);
    const keep = new Uint8Array(TW * TH);
    for (let j = 0; j < old.TH; j++) {
      const nj = j + dj;
      if (nj < 0 || nj >= TH) continue;
      for (let i = 0; i < old.TW; i++) {
        const ni = i + di;
        if (ni < 0 || ni >= TW) continue;
        const o = j * old.TW + i;
        if (old.mask && !old.mask[o]) continue;
        tex[nj * TW + ni] = old.tex[o] as number;
        keep[nj * TW + ni] = 1;
      }
    }
    this.x0 = b.x0;
    this.z0 = b.z0;
    this.x1 = b.x1;
    this.z1 = b.z1;
    this.TW = TW;
    this.TH = TH;
    this.tex = tex;
    this.mask = null;
    if (slab.length > 1) this.applyMask(slab, keep);
    else for (let p = 0; p < tex.length; p++) if (!keep[p]) tex[p] = this.fill;
    this.LIT = null;
    this.litVer = -1;
    this.litBuild = -1;
    this.nightBuf = null;
    this.nightKey = '';
    this.version++;
    this.lampVersion++;
  }

  /** 按几块矩形算出地台的纹素：框外的清成 0；keep 里没标的地台纹素填底色（keep = null：全填过了） */
  private applyMask(rs: readonly Rect[], keep: Uint8Array | null): void {
    const { TS, TW, TH, tex } = this;
    const mask = new Uint8Array(TW * TH);
    for (const r of rs) {
      const i0 = Math.max(0, Math.round((r.x0 - this.x0) / TS));
      const i1 = Math.min(TW, Math.round((r.x1 - this.x0) / TS));
      const j0 = Math.max(0, Math.round((r.z0 - this.z0) / TS));
      const j1 = Math.min(TH, Math.round((r.z1 - this.z0) / TS));
      for (let j = j0; j < j1; j++) mask.fill(1, j * TW + i0, j * TW + i1);
    }
    for (let p = 0; p < tex.length; p++) {
      if (!mask[p]) tex[p] = 0;
      else if (keep && !keep[p]) tex[p] = this.fill;
    }
    this.mask = mask;
  }

  /** 该点在不在地台上 */
  onSlab(x: number, z: number): boolean {
    const i = Math.floor((x - this.x0) / this.TS);
    const j = Math.floor((z - this.z0) / this.TS);
    if (i < 0 || j < 0 || i >= this.TW || j >= this.TH) return false;
    return !this.mask || this.mask[j * this.TW + i] === 1;
  }

  paintRect(x0: number, x1: number, z0: number, z1: number, fn: PaintFn): void {
    const { TS, TW, TH, tex, mask } = this;
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / TS - 0.5));
    const i1 = Math.min(TW - 1, Math.floor((x1 - this.x0) / TS - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / TS - 0.5));
    const j1 = Math.min(TH - 1, Math.floor((z1 - this.z0) / TS - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * TS;
      for (let i = i0; i <= i1; i++) {
        if (mask && !mask[j * TW + i]) continue;
        const x = this.x0 + (i + 0.5) * TS;
        const v = fn(x, z, tex[j * TW + i] as number, i, j);
        if (v) tex[j * TW + i] = v;
      }
    }
    this.version++;
  }

  paintCirc(cx: number, cz: number, r: number, fn: CircFn): void {
    this.paintRect(cx - r, cx + r, cz - r, cz + r, (x, z, c, i, j) => {
      const d = Math.hypot(x - cx, z - cz);
      return d <= r ? fn(x, z, c, d, i, j) : 0;
    });
  }

  /** 某点的白天颜色（贴图外 0） */
  get(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.TS);
    const j = Math.floor((z - this.z0) / this.TS);
    if (i < 0 || j < 0 || i >= this.TW || j >= this.TH) return 0;
    return this.tex[j * this.TW + i] as number;
  }

  /** 方块投在地上的影子（样片的建筑影子） */
  shadowBox(x0: number, x1: number, z0: number, z1: number, h: number): void {
    this.paintRect(x0, x1 + h * SDX, z0 + h * SDZ, z1, (x, z, c) => {
      let t0 = 0;
      let t1 = 1;
      t0 = Math.max(t0, (x - x1) / (h * SDX));
      t1 = Math.min(t1, (x - x0) / (h * SDX));
      const az = (z - z0) / (h * SDZ);
      const bz = (z - z1) / (h * SDZ);
      t0 = Math.max(t0, Math.min(az, bz));
      t1 = Math.min(t1, Math.max(az, bz));
      return t0 <= t1 ? mulP(c, 0.7, 0.72, 0.84) : 0;
    });
  }

  /** 树冠 / 伞的团状影子（样片的棕榈影子）：高 h 处半径 r 的一团，加一条树干影 */
  shadowBlob(x: number, z: number, h: number, r: number, trunk = 0.25): void {
    const cx = x + h * SDX;
    const cz = z + h * SDZ;
    const L2 = (cx - x) ** 2 + (cz - z) ** 2 || 1;
    this.paintRect(Math.min(x, cx) - r, Math.max(x, cx) + r, Math.min(z, cz) - r, Math.max(z, cz) + r, (px, pz, c) => {
      const blob = Math.hypot(px - cx, pz - cz) < r * (0.8 + 0.3 * vnoise(px * 1.3, pz * 1.3, 27));
      const t = clamp(((px - x) * (cx - x) + (pz - z) * (cz - z)) / L2, 0, 0.85);
      const tr = Math.hypot(px - (x + t * (cx - x)), pz - (z + t * (cz - z))) < trunk;
      return blob || tr ? mulP(c, 0.7, 0.72, 0.84) : 0;
    });
  }

  /* ---------- 灯光 ---------- */

  addLamp(l: Lamp): () => void {
    const lamp = { ...l };
    this.lamps.push(lamp);
    this.lampVersion++;
    return () => {
      const i = this.lamps.indexOf(lamp);
      if (i >= 0) {
        this.lamps.splice(i, 1);
        this.lampVersion++;
      }
    };
  }

  private lit(): Float32Array {
    while (!this.litStep(Number.POSITIVE_INFINITY));
    return this.LIT as Float32Array;
  }

  /** 正在算的灯光图对应的版本、算到第几盏 */
  private litBuild = -1;
  private litNext = 0;

  /** 分几次算灯光图（每次最多 count 盏灯）；灯光图是最新的就返回 true */
  litStep(count: number): boolean {
    if (this.LIT && this.litVer === this.lampVersion) return true;
    const { TS, TW, TH } = this;
    if (this.litBuild !== this.lampVersion || !this.LIT) {
      this.LIT ??= new Float32Array(TW * TH);
      this.LIT.fill(0);
      this.litBuild = this.lampVersion;
      this.litNext = 0;
    }
    const LIT = this.LIT;
    const end = Math.min(this.lamps.length, this.litNext + count);
    for (let li = this.litNext; li < end; li++) {
      const l = this.lamps[li] as Lamp;
      const i0 = Math.max(0, Math.floor((l.x - l.r - this.x0) / TS));
      const i1 = Math.min(TW - 1, Math.ceil((l.x + l.r - this.x0) / TS));
      const j0 = Math.max(0, Math.floor((l.z - l.r - this.z0) / TS));
      const j1 = Math.min(TH - 1, Math.ceil((l.z + l.r - this.z0) / TS));
      const r2 = l.r * l.r;
      for (let j = j0; j <= j1; j++) {
        const dz = this.z0 + (j + 0.5) * TS - l.z;
        for (let i = i0; i <= i1; i++) {
          const dx = this.x0 + (i + 0.5) * TS - l.x;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r2) continue;
          const f = 1 - Math.sqrt(d2) / l.r;
          LIT[j * TW + i] = (LIT[j * TW + i] as number) + f * f * l.i * 1.6;
        }
      }
    }
    this.litNext = end;
    if (end < this.lamps.length) return false;
    this.litVer = this.lampVersion;
    return true;
  }

  /** 该处受灯光的程度（灯光强度 amt 0..1 乘上去，量化成 4 档） */
  litAt(x: number, z: number, amt: number): number {
    if (amt <= 0 || this.lamps.length === 0) return 0;
    const i = Math.floor((x - this.x0) / this.TS);
    const j = Math.floor((z - this.z0) / this.TS);
    if (i < 0 || j < 0 || i >= this.TW || j >= this.TH) return 0;
    const s = (this.lit()[j * this.TW + i] as number) * amt;
    return Math.min(1, Math.floor(Math.min(s, 1) * 4) / 4);
  }

  /** 当前夜色 n、灯光 amt、暖色 warm 下的贴图（白天直接返回 tex；只缓存一份） */
  texFor(n: number, amt: number, warm = 1): Uint32Array {
    if (n <= 0) return this.tex;
    const key = `${n}|${amt}|${warm}|${this.version}|${this.lampVersion}`;
    if (key === this.nightKey && this.nightBuf) return this.nightBuf;
    const N = this.nightBuf ?? new Uint32Array(this.TW * this.TH);
    this.nightRows(N, n, amt, warm, 0, this.TH);
    this.nightBuf = N;
    this.nightKey = key;
    return N;
  }

  /**
   * 把夜间贴图的第 j0..j1-1 行算进 out（IsoView 分几帧慢慢烘下一档夜色时用）。
   * 灯光池：受光 L 抖成 4 档，往暖白靠 q * 0.92 * n。
   */
  nightRows(out: Uint32Array, n: number, amt: number, warm: number, j0: number, j1: number): void {
    const { TW, tex } = this;
    const lamps = amt > 0 && this.lamps.length > 0;
    const LIT = lamps ? this.lit() : null;
    for (let j = j0; j < j1; j++) {
      const row = j * TW;
      for (let i = 0; i < TW; i++) {
        const p = row + i;
        const v = tex[p] as number;
        if (!v) {
          out[p] = 0;
          continue;
        }
        let c = nightP(v, n, 0, warm);
        if (LIT) {
          const L = (LIT[p] as number) * amt;
          if (L > 0.02) {
            const q = Math.min(1, Math.floor(Math.min(L, 1) * 4 + bay(i >> 1, j >> 1)) / 4);
            if (q > 0) {
              const w = pk((v & 255) * 1.02 + 8, ((v >>> 8) & 255) * 0.98 + 4, ((v >>> 16) & 255) * 0.88);
              c = mixP(c, w, q * 0.92 * n);
            }
          }
        }
        out[p] = c;
      }
    }
  }
}
