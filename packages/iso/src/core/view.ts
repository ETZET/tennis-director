/**
 * IsoView：画布、低分辨率缓冲、投影、分层渲染（ADR 0019，契约见 docs/design/iso-architecture.md）。
 *
 * 一帧：
 * 1. 背景（天空渐变、星星、太阳 / 月亮、三道山脊、地台外的荒原）——和静态层同一块缓存区域，换天色时重画；
 * 2. 静态层（地台侧面的地层 + 地面贴图反投影采样 + 静态节点树），连同每像素深度一起缓存。
 *    缓存比屏幕大一圈，平移只是挪像素；转角、缩放、夜色档、灯光档、地面版本、invalidate() 变了才重烘；
 *    转动和缩放动画途中不缓存，实时画；
 * 3. 动态层：场景图每帧排序、光栅，和静态层的深度缓冲做遮挡测试。
 *
 * 只有这个文件和 camera.ts 碰 DOM。
 */
import { bay, clamp, fbm, hash, hx, Palette, pk, vnoise } from './color';
import { type Light, NOON } from './daylight';
import { SceneDrawer } from './draw';
import type { Node } from './graph';
import { GroundPainter, type Rect } from './ground';
import { HV, Projection } from './proj';
import { faceF, Raster, ZNONE, ZTEST, ZWRITE } from './raster';

export interface IsoViewOptions {
  /** 地台（浮空岛）的范围；地面贴图覆盖它 */
  slab: Rect;
  /** 地台厚度（米），默认 7 */
  slabDepth?: number;
  /** 旋转中心，默认地台中心 */
  center?: { x: number; z: number };
  /** 每个缓冲像素多少 CSS 像素；默认手机 1、宽屏（≥ 820 CSS px）2 */
  pixelSize?: number;
}

interface Layer {
  buf: Uint32Array;
  depth: Float32Array;
  W: number;
  H: number;
  /** 烘焙时旋转中心在缓存里的像素 */
  OX: number;
  OY: number;
  key: string;
}

/** 性能读数 */
export interface ViewStats {
  /** 上一次烘焙静态层的毫秒数 */
  bakeMs: number;
  /** 上一帧的毫秒数 */
  frameMs: number;
  /** 上一帧画的静态 / 动态节点数 */
  statics: number;
  dynamics: number;
  /** 上一帧静态层是实时画的（转动、缩放途中） */
  live: boolean;
  bakes: number;
}

export class IsoView {
  readonly canvas: HTMLCanvasElement;
  readonly proj = new Projection();
  readonly pal = new Palette();
  readonly raster: Raster;
  readonly ground: GroundPainter;
  readonly slab: Rect;
  readonly slabDepth: number;
  /** 每个缓冲像素多少 CSS 像素 */
  PS = 1;
  BW = 1;
  BH = 1;
  light: Light = NOON;
  /** 灯光强度（量化后） */
  lamps = 0;
  /** 屏幕底部被 HUD 挡住的缓冲像素（镜头目标放在剩下部分的中间） */
  occludedBottom = 0;
  readonly stats: ViewStats = { bakeMs: 0, frameMs: 0, statics: 0, dynamics: 0, live: false, bakes: 0 };

  private readonly ctx: CanvasRenderingContext2D;
  private readonly pixelSize: number | undefined;
  private img: ImageData | null = null;
  private frame = new Uint32Array(1);
  private depth = new Float32Array(1);
  private st: Layer | null = null;
  private bg: Layer | null = null;
  private version = 0;
  private settled = true;
  private readonly sDraw = new SceneDrawer();
  private readonly dDraw = new SceneDrawer();

  constructor(
    readonly container: HTMLElement,
    o: IsoViewOptions,
  ) {
    this.slab = o.slab;
    this.slabDepth = o.slabDepth ?? 7;
    this.pixelSize = o.pixelSize;
    this.ground = new GroundPainter(o.slab);
    this.proj.cx = o.center?.x ?? (o.slab.x0 + o.slab.x1) / 2;
    this.proj.cz = o.center?.z ?? (o.slab.z0 + o.slab.z1) / 2;
    const cv = document.createElement('canvas');
    cv.className = 'td-iso';
    Object.assign(cv.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      imageRendering: 'pixelated',
      touchAction: 'none',
    });
    container.appendChild(cv);
    this.canvas = cv;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;
    this.raster = new Raster(this.frame, 1, 1, this.proj, this.pal);
    this.raster.litFn = (x, z) => this.ground.litAt(x, z, this.lamps);
    this.resize();
  }

  /** 按容器大小重设缓冲 */
  resize(): void {
    const W = Math.max(1, this.container.clientWidth || window.innerWidth);
    const H = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.PS = this.pixelSize ?? (W >= 820 ? 2 : 1);
    const BW = Math.ceil(W / this.PS);
    const BH = Math.ceil(H / this.PS);
    if (BW === this.BW && BH === this.BH && this.img) return;
    this.BW = BW;
    this.BH = BH;
    this.canvas.width = BW;
    this.canvas.height = BH;
    this.img = this.ctx.createImageData(BW, BH);
    this.frame = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(BW * BH);
    this.st = null;
    this.bg = null;
  }

  /**
   * 设镜头：目标点 (tx, tz) 放在可见区域中间，k = 每米缓冲像素，ang = 转角（弧度）。
   * settled = false（转动、缩放途中）时静态层实时画、不缓存。
   */
  setPose(tx: number, tz: number, k: number, ang: number, settled = true): void {
    const pr = this.proj;
    pr.k = k;
    pr.setAngle(ang);
    const dx = tx - pr.cx;
    const dz = tz - pr.cz;
    const rx = pr.m0 * dx + pr.m1 * dz;
    const rz = pr.m2 * dx + pr.m3 * dz;
    pr.ox = Math.round(this.BW / 2 - (rx - rz) * k);
    pr.oy = Math.round((this.BH - this.occludedBottom) / 2 - (rx + rz) * k * 0.5);
    this.settled = settled;
  }

  /** 换光照（daylight 调）：夜色按 1/16、灯光按 1/8 量化，跨档才重烘静态层 */
  setLight(l: Light): void {
    this.light = l;
    this.pal.setNight(Math.round(l.night * 16) / 16);
    this.lamps = Math.round(l.lamps * 8) / 8;
  }

  /** 静态层标脏：下一帧重烘（设施状态变了、静态节点增删） */
  invalidate(): void {
    this.version++;
  }

  /** 世界 → 缓冲像素 */
  P(x: number, y: number, z: number): [number, number] {
    return this.proj.P(x, y, z);
  }

  /* ---------- 一帧 ---------- */

  render(scene: Node, statics: Node, t: number): void {
    const t0 = performance.now();
    const r = this.raster;
    r.t = t;
    const { BW, BH } = this;
    const frame = this.frame;
    const depth = this.depth;
    const pr = this.proj;
    const live = !this.settled;
    this.stats.live = live;
    if (live) {
      // 背景：沿用上次的背景缓存（挪到当前位置），没有就填天色
      this.blitBg();
      depth.fill(Number.NEGATIVE_INFINITY);
      r.setTarget(frame, depth, BW, BH);
      this.drawBase(r);
      r.zmode = ZWRITE;
      this.stats.statics = this.sDraw.collect(r, statics);
      this.sDraw.draw(r);
    } else {
      const key = this.staticKey();
      const st = this.st;
      const sx = st ? st.OX - pr.ox : 0;
      const sy = st ? st.OY - pr.oy : 0;
      if (!st || st.key !== key || sx < 0 || sy < 0 || sx > st.W - BW || sy > st.H - BH) {
        this.bake(statics, key);
      }
      this.composite();
    }
    // 动态层
    r.setTarget(frame, depth, BW, BH);
    r.zmode = ZTEST;
    this.stats.dynamics = this.dDraw.collect(r, scene);
    this.dDraw.draw(r);
    r.zmode = ZNONE;
    if (this.img) this.ctx.putImageData(this.img, 0, 0);
    this.stats.frameMs = performance.now() - t0;
  }

  private staticKey(): string {
    const pr = this.proj;
    const g = this.ground;
    return `${pr.ang.toFixed(5)}|${pr.k}|${this.pal.night}|${this.lamps}|${this.version}|${g.version}|${g.lampVersion}|${this.BW}x${this.BH}`;
  }

  private bgKey(): string {
    const l = this.light;
    return `${l.sky.join()}|${l.mtn.join()}|${l.plain.join()}|${l.star.toFixed(2)}|${l.disc.join()}|${l.moon}`;
  }

  /** 烘焙静态层（和背景）到比屏幕大一圈的缓存 */
  private bake(statics: Node, key: string): void {
    const t0 = performance.now();
    const { BW, BH } = this;
    const pr = this.proj;
    const mx = Math.round(BW * 0.5);
    const my = Math.round(BH * 0.3);
    const W = BW + mx * 2;
    const H = BH + my * 2;
    let st = this.st;
    if (!st || st.W !== W || st.H !== H) {
      st = { buf: new Uint32Array(W * H), depth: new Float32Array(W * H), W, H, OX: 0, OY: 0, key: '' };
      this.st = st;
    }
    const ox = pr.ox;
    const oy = pr.oy;
    st.OX = ox + mx;
    st.OY = oy + my;
    st.key = key;
    pr.ox = st.OX;
    pr.oy = st.OY;
    st.buf.fill(0);
    st.depth.fill(Number.NEGATIVE_INFINITY);
    const r = this.raster;
    r.setTarget(st.buf, st.depth, W, H);
    this.drawBase(r);
    r.zmode = ZWRITE;
    this.stats.statics = this.sDraw.collect(r, statics);
    this.sDraw.draw(r);
    r.zmode = ZNONE;
    // 背景跟静态缓存同一块区域
    const bk = `${this.bgKey()}|${st.OX}|${st.OY}|${W}x${H}|${pr.ang.toFixed(5)}|${pr.k}`;
    let bg = this.bg;
    if (!bg || bg.key !== bk) {
      if (!bg || bg.W !== W || bg.H !== H)
        bg = { buf: new Uint32Array(W * H), depth: new Float32Array(0), W, H, OX: 0, OY: 0, key: '' };
      bg.OX = st.OX;
      bg.OY = st.OY;
      bg.key = bk;
      this.drawBackdrop(bg.buf, W, H, mx, my);
      this.bg = bg;
    }
    pr.ox = ox;
    pr.oy = oy;
    this.stats.bakes++;
    this.stats.bakeMs = performance.now() - t0;
  }

  /** 缓存 → 帧：静态层透明处用背景 */
  private composite(): void {
    const st = this.st as Layer;
    const bg = this.bg as Layer;
    const { BW, BH } = this;
    const sx = st.OX - this.proj.ox;
    const sy = st.OY - this.proj.oy;
    const frame = this.frame;
    const sb = st.buf;
    const bb = bg.buf;
    for (let y = 0; y < BH; y++) {
      const s = (y + sy) * st.W + sx;
      const d = y * BW;
      for (let x = 0; x < BW; x++) {
        const v = sb[s + x] as number;
        frame[d + x] = v !== 0 ? v : (bb[s + x] as number);
      }
      this.depth.set(st.depth.subarray(s, s + BW), d);
    }
  }

  /** 实时帧的背景：上次背景缓存挪到当前位置，缺的地方填天色 */
  private blitBg(): void {
    const { BW, BH } = this;
    const bg = this.bg;
    const frame = this.frame;
    const sky = hx(this.light.sky[0]);
    const fill = pk(sky[0], sky[1], sky[2]);
    if (!bg) {
      frame.fill(fill);
      return;
    }
    const sx = bg.OX - this.proj.ox;
    const sy = bg.OY - this.proj.oy;
    for (let y = 0; y < BH; y++) {
      const by = clamp(y + sy, 0, bg.H - 1);
      const d = y * BW;
      for (let x = 0; x < BW; x++) {
        const bx = x + sx;
        frame[d + x] = bx >= 0 && bx < bg.W ? (bg.buf[by * bg.W + bx] as number) : fill;
      }
    }
  }

  /** 地台：带地层的侧面 + 反投影采样的地面 */
  private drawBase(r: Raster): void {
    const pr = this.proj;
    const SL = this.slab;
    const k = pr.k;
    r.zmode = ZNONE;
    r.box(SL.x0, SL.x1, SL.z0, SL.z1, -this.slabDepth, 0, '#b98a58', {
      noTop: true,
      edge: false,
      sideSh: (nx, nz, pts) => {
        const p3 = pts[3] as readonly [number, number, number];
        const p2 = pts[2] as readonly [number, number, number];
        const a = pr.P(p3[0], p3[1], p3[2]);
        const b = pr.P(p2[0], p2[1], p2[2]);
        const sl = (b[1] - a[1]) / (b[0] - a[0] || 1);
        const f = faceF(nx, nz);
        const L = [
          r.col('#d9b07a', f),
          r.col('#c0905c', f),
          r.col('#a8784a', f),
          r.col('#8e623e', f),
          r.col('#74503a', f),
        ];
        return (x, y) => {
          const top = a[1] + (x + 0.5 - a[0]) * sl;
          const d = (y + 0.5 - top) / (k * HV) + Math.sin(x * 0.13) * 0.35 + (bay(x, y) - 0.5) * 0.4;
          return (d < 0.6 ? L[0] : d < 2.2 ? L[1] : d < 4 ? L[2] : d < 5.6 ? L[3] : L[4]) as number;
        };
      },
    });
    // 地面：每个缓冲像素反投影到 y=0，取贴图
    const g = this.ground;
    const tex = g.texFor(this.pal.night, this.lamps);
    const its = 1 / g.TS;
    const ik = 1 / k;
    const { W, H, buf } = r;
    const TW = g.TW;
    const TH = g.TH;
    // 只扫地台投影的上下范围
    let ya = 1e9;
    let yb = -1e9;
    for (const [x, z] of [
      [SL.x0, SL.z0],
      [SL.x1, SL.z0],
      [SL.x1, SL.z1],
      [SL.x0, SL.z1],
    ] as const) {
      const y = pr.sy(x, 0, z);
      ya = Math.min(ya, y);
      yb = Math.max(yb, y);
    }
    const y0 = Math.max(0, Math.floor(ya));
    const y1 = Math.min(H - 1, Math.ceil(yb));
    const m0 = pr.m0;
    const m1 = pr.m1;
    const m2 = pr.m2;
    const m3 = pr.m3;
    const OX = pr.ox;
    const OY = pr.oy;
    const drx = ik * 0.5;
    const drz = -ik * 0.5;
    const du = (m0 * drx + m2 * drz) * its;
    const dv = (m1 * drx + m3 * drz) * its;
    for (let y = y0; y <= y1; y++) {
      const bb = 2 * (y + 0.5 - OY) * ik;
      const a0 = (0.5 - OX) * ik;
      const rx = (a0 + bb) * 0.5;
      const rz = (bb - a0) * 0.5;
      const wx = pr.cx + m0 * rx + m2 * rz;
      const wz = pr.cz + m1 * rx + m3 * rz;
      let u = (wx - g.x0) * its;
      let v = (wz - g.z0) * its;
      // 这一行落在贴图里的 x 范围（u、v 都是 x 的线性函数）
      let xa = 0;
      let xb = W - 1;
      if (du !== 0) {
        const p = -u / du;
        const q = (TW - u) / du;
        xa = Math.max(xa, Math.ceil(Math.min(p, q)));
        xb = Math.min(xb, Math.floor(Math.max(p, q)));
      } else if (u < 0 || u >= TW) continue;
      if (dv !== 0) {
        const p = -v / dv;
        const q = (TH - v) / dv;
        xa = Math.max(xa, Math.ceil(Math.min(p, q)));
        xb = Math.min(xb, Math.floor(Math.max(p, q)));
      } else if (v < 0 || v >= TH) continue;
      if (xb < xa) continue;
      u += du * xa;
      v += dv * xa;
      const row = y * W;
      for (let x = xa; x <= xb; x++, u += du, v += dv) {
        if (u < 0 || v < 0 || u >= TW || v >= TH) continue;
        const c = tex[(v | 0) * TW + (u | 0)] as number;
        if (c) buf[row + x] = c;
      }
    }
  }

  /** 背景（样片的 drawBackdrop）：画进 W×H 的缓冲，屏幕在其中的偏移是 (offX, offY) */
  private drawBackdrop(base: Uint32Array, W: number, H: number, offX: number, offY: number): void {
    const pr = this.proj;
    const SL = this.slab;
    const L = this.light;
    const k = pr.k;
    // 群山和太阳的大小不跟着拉近无限变大
    const km = Math.min(k, 2.5);
    // 群山按屏幕高度定大小（样片：竖屏 844 高时约 5.3 倍振幅），不随缩放变
    const mh = this.BH / 158;
    let topY = 1e9;
    for (const [x, z] of [
      [SL.x0, SL.z0],
      [SL.x1, SL.z0],
      [SL.x1, SL.z1],
      [SL.x0, SL.z1],
    ] as const)
      topY = Math.min(topY, pr.sy(x, 0, z));
    const hy = Math.round(topY + 18 * km);
    const sky = L.sky.map(hx);
    const s0 = sky[0] as number[];
    const s1 = sky[1] as number[];
    const s2 = sky[2] as number[];
    const yEnd = Math.min(H, Math.max(0, hy + 2));
    for (let y = 0; y < yEnd; y++) {
      const t = clamp(y / Math.max(1, hy), 0, 1);
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const tt = t + (bay(x, y) - 0.5) * 0.12;
        let r: number;
        let g: number;
        let b: number;
        if (tt < 0.6) {
          const v = tt / 0.6;
          r = (s0[0] as number) + ((s1[0] as number) - (s0[0] as number)) * v;
          g = (s0[1] as number) + ((s1[1] as number) - (s0[1] as number)) * v;
          b = (s0[2] as number) + ((s1[2] as number) - (s0[2] as number)) * v;
        } else {
          const v = (tt - 0.6) / 0.4;
          r = (s1[0] as number) + ((s2[0] as number) - (s1[0] as number)) * v;
          g = (s1[1] as number) + ((s2[1] as number) - (s1[1] as number)) * v;
          b = (s1[2] as number) + ((s2[2] as number) - (s1[2] as number)) * v;
        }
        base[row + x] = pk(Math.floor(r / 6) * 6, Math.floor(g / 6) * 6, Math.floor(b / 6) * 6);
      }
    }
    const set = (X: number, Y: number, c: number) => {
      if (X >= 0 && Y >= 0 && X < W && Y < H && Y < hy) base[Y * W + X] = c;
    };
    // 星星
    if (L.star > 0.02) {
      const n = Math.round((260 * W * H) / (this.BW * this.BH));
      for (let i = 0; i < n; i++) {
        if (hash(i, 4, 77) > L.star) continue;
        const x = Math.floor(hash(i, 1, 77) * W);
        const y = Math.floor(hash(i, 2, 77) * hy * 0.95);
        set(x, y, hash(i, 3, 77) > 0.85 ? pk(255, 255, 230) : pk(170, 170, 210));
      }
    }
    // 太阳 / 月亮：位置按屏幕比例
    const [dc, dxf, dyf] = L.disc;
    const disc = hx(dc);
    const mxp = offX + this.BW * dxf;
    const myp = offY + Math.max(14, (hy - offY) * dyf);
    if (L.moon) {
      const mr = Math.max(5, km * 5);
      for (let y = -mr; y <= mr; y++)
        for (let x = -mr; x <= mr; x++) {
          if (Math.hypot(x, y) > mr || Math.hypot(x + mr * 0.45, y - mr * 0.3) < mr * 0.85) continue;
          set(
            (mxp + x) | 0,
            (myp + y) | 0,
            hash(x, y, 3) > 0.9 ? pk(disc[0] * 0.88, disc[1] * 0.88, disc[2] * 0.85) : pk(disc[0], disc[1], disc[2]),
          );
        }
    } else {
      const sr = Math.max(5, km * 4.5);
      for (let y = -sr * 2; y <= sr * 2; y++)
        for (let x = -sr * 2; x <= sr * 2; x++) {
          const d = Math.hypot(x, y);
          const X = (mxp + x) | 0;
          const Y = (myp + y) | 0;
          if (X < 0 || Y < 0 || X >= W || Y >= H || Y >= hy) continue;
          if (d <= sr) base[Y * W + X] = pk(disc[0], disc[1], disc[2]);
          else if (d < sr * 2 && bay(X, Y) < (1 - (d - sr) / sr) * 0.5) {
            const v = base[Y * W + X] as number;
            base[Y * W + X] = pk((v & 255) + 30, ((v >>> 8) & 255) + 24, ((v >>> 16) & 255) + 8);
          }
        }
    }
    // 三道山脊
    const layers: [string, number, number, number][] = [
      [L.mtn[0], 38, 0.02, 11],
      [L.mtn[1], 26, 0.033, 23],
      [L.mtn[2], 15, 0.05, 37],
    ];
    for (const [hc, amp, fr, seed] of layers) {
      const c = hx(hc);
      const cc = pk(c[0], c[1], c[2]);
      const ch = pk(c[0] * 1.12 + 10, c[1] * 1.1 + 8, c[2] * 1.06 + 6);
      const cd = pk(c[0] * 0.9, c[1] * 0.9, c[2] * 0.92);
      for (let x = 0; x < W; x++) {
        const wx = ((x - pr.ox) / 2.2) * 0.6;
        const n = fbm(wx * fr, seed, seed);
        const n2 = Math.abs(vnoise(wx * fr * 3, seed + 1, seed) - 0.5) * 2;
        const h = Math.round((n * 0.8 + n2 * 0.25) * amp * mh);
        const y0 = hy - h;
        for (let y = Math.max(0, y0); y < Math.min(H, hy + 2); y++) {
          const sl = fbm(wx * fr * 6, y * 0.05, seed + 4);
          base[y * W + x] = y === y0 ? ch : sl > 0.58 ? ch : sl < 0.4 ? cd : cc;
        }
      }
    }
    // 地平线以下的荒原（两色抖动，噪声按 2×2 取样省时间）
    const p0 = hx(L.plain[0]);
    const p1 = hx(L.plain[1]);
    const c0 = pk(p0[0], p0[1], p0[2]);
    const c1 = pk(p1[0], p1[1], p1[2]);
    const yb = Math.max(0, hy + 2);
    const span = Math.max(1, H - hy);
    for (let y = yb; y < H; y++) {
      const t = clamp((y - hy) / span, 0, 1);
      const row = y * W;
      let nz = 0;
      for (let x = 0; x < W; x++) {
        if ((x & 1) === 0) nz = fbm(((x - pr.ox) / 2.2) * 0.05, (y & ~1) * 0.08, 5) - 0.5;
        const tt = t + (bay(x, y) - 0.5) * 0.15 + nz * 0.5;
        base[row + x] = tt < 0.5 ? c0 : c1;
      }
    }
  }
}
