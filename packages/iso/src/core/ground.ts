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
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly TW: number;
  readonly TH: number;
  /** 白天的贴图（打包色；0 = 没有地面，透明） */
  readonly tex: Uint32Array;
  /** 改一次加一 */
  version = 0;
  lampVersion = 0;
  private readonly lamps: Lamp[] = [];
  private LIT: Float32Array | null = null;
  private litVer = -1;
  private nightKey = '';
  private nightBuf: Uint32Array | null = null;

  constructor(slab: Rect, fill = pk(233, 201, 153)) {
    this.x0 = slab.x0;
    this.z0 = slab.z0;
    this.x1 = slab.x1;
    this.z1 = slab.z1;
    this.TW = Math.round((slab.x1 - slab.x0) / this.TS);
    this.TH = Math.round((slab.z1 - slab.z0) / this.TS);
    this.tex = new Uint32Array(this.TW * this.TH).fill(fill);
  }

  paintRect(x0: number, x1: number, z0: number, z1: number, fn: PaintFn): void {
    const { TS, TW, TH, tex } = this;
    const i0 = Math.max(0, Math.ceil((x0 - this.x0) / TS - 0.5));
    const i1 = Math.min(TW - 1, Math.floor((x1 - this.x0) / TS - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - this.z0) / TS - 0.5));
    const j1 = Math.min(TH - 1, Math.floor((z1 - this.z0) / TS - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * TS;
      for (let i = i0; i <= i1; i++) {
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
