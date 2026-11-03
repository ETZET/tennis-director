/**
 * IsoView：画布、低分辨率缓冲、投影、分层渲染（ADR 0019，契约见 docs/design/iso-architecture.md）。
 *
 * 一帧：
 * 1. 背景（天空渐变、星星、太阳 / 月亮、三道山脊、地台外的荒原）：几何（每像素是哪段天、哪道山、哪种荒原）
 *    烘成一张索引图，和静态层同一块缓存区域；颜色每帧按当前天色查表，所以天色连续变化不用重画。
 *    星星、太阳、月亮每帧按位置补画在露天的像素上（太阳落到山后被山挡住）。
 * 2. 静态层（地台侧面的地层 + 地面贴图反投影采样 + 静态节点树），按夜色分 NIGHT_STEPS 档烘焙，
 *    当前夜色落在两档之间时按 Bayer 阈值逐像素在两档之间抖动过渡（灯头、窗户也就一点点亮起来）。
 *    下一档在后台分几帧慢慢烘（每帧最多 bakeBudgetMs），黄昏时提前烘好要走到的那一档；
 *    缓存比屏幕大一圈，平移只是挪像素；转角、缩放、地面版本、invalidate() 变了才整张重烘（只烘最近的一档）；
 *    转动和缩放动画途中不缓存，实时画；
 * 3. 动态层：场景图每帧排序、光栅，和静态层的深度缓冲做遮挡测试；夜色按 1/64 量化，跟静态层的过渡对得上。
 *
 * 只有这个文件和 camera.ts 碰 DOM。
 */
import { BAY, bay, clamp, fbm, hash, Palette, pk, vnoise } from './color';
import { type Light, lampsOf, NOON } from './daylight';
import { SceneDrawer } from './draw';
import type { Node } from './graph';
import { GroundPainter, type Rect } from './ground';
import { HV, Projection } from './proj';
import { faceF, Raster, ZNONE, ZTEST, ZWRITE } from './raster';

/** 静态层的夜色档数（0 白天 .. NIGHT_STEPS 深夜） */
export const NIGHT_STEPS = 16;
/** 同时留着的静态层档数（当前两档 + 提前烘的一档） */
const KEEP = 3;
/** 离最近一档超过这么多档就当场整张烘（时间跳了），不等后台慢慢烘 */
const JUMP = 2;
/** 背景索引：0..SKY_N-1 天空渐变，之后三道山脊各三种明暗，再两种荒原 */
const SKY_N = 128;
const MTN0 = SKY_N;
const PLAIN0 = SKY_N + 9;
const LUT_N = PLAIN0 + 2;

/** '#rrggbb' → [r, g, b]（不进缓存：天色每帧都是新字符串） */
const rgbOf = (h: string): [number, number, number] => {
  const v = Number.parseInt(h.slice(1, 7), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

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

/** 静态层几何：同一个转角、缩放、版本下所有夜色档共用的原点、大小和深度 */
interface Geo {
  key: string;
  W: number;
  H: number;
  /** 烘焙时旋转中心在缓存里的像素 */
  OX: number;
  OY: number;
  depth: Float32Array;
}

/** 某一档夜色的静态层像素 */
interface StLayer {
  buf: Uint32Array;
  /** 夜色档 0..NIGHT_STEPS */
  level: number;
  /** 暖色系数（量化后） */
  warm: number;
}

/** 背景索引图 */
interface BgLayer {
  idx: Uint8Array;
  W: number;
  H: number;
  OX: number;
  OY: number;
  key: string;
  /** 地平线（缓存坐标） */
  hy: number;
  /** 屏幕在缓存里的偏移（烘焙时） */
  mx: number;
  my: number;
  /** 星星：缓存里的像素下标、出现门槛、是不是亮星 */
  starAt: Int32Array;
  starThr: Float32Array;
  starHi: Uint8Array;
}

/** 后台分帧烘焙的一档 */
interface Job {
  geo: Geo;
  layer: StLayer;
  depth: Float32Array;
  n: number;
  amt: number;
  /** 0 侧面，1 地面夜间贴图，2 地面采样，3 收集静态节点，4 画静态节点 */
  phase: number;
  i: number;
  tex: Uint32Array;
}

/** 性能读数 */
export interface ViewStats {
  /** 上一次整张烘焙静态层的毫秒数 */
  bakeMs: number;
  /** 上一帧的毫秒数 */
  frameMs: number;
  /** 上一帧后台烘焙用掉的毫秒数 */
  jobMs: number;
  /** 上一帧画的静态 / 动态节点数 */
  statics: number;
  dynamics: number;
  /** 上一帧静态层是实时画的（转动、缩放途中） */
  live: boolean;
  /** 烘好的静态层档数（整张 + 后台） */
  bakes: number;
}

export class IsoView {
  readonly canvas: HTMLCanvasElement;
  readonly proj = new Projection();
  /** 动态层（和转动途中实时画的静态层）的调色板 */
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
  /** 动态层的灯光强度（量化后） */
  lamps = 0;
  /** 屏幕底部被 HUD 挡住的缓冲像素（镜头目标放在剩下部分的中间） */
  occludedBottom = 0;
  /** 每帧后台烘焙静态层最多用多少毫秒 */
  bakeBudgetMs = 3;
  readonly stats: ViewStats = { bakeMs: 0, frameMs: 0, jobMs: 0, statics: 0, dynamics: 0, live: false, bakes: 0 };

  private readonly ctx: CanvasRenderingContext2D;
  private readonly pixelSize: number | undefined;
  private img: ImageData | null = null;
  private frame = new Uint32Array(1);
  private depth = new Float32Array(1);
  private geo: Geo | null = null;
  /** 烘好的夜色档（都属于 geo） */
  private layers: StLayer[] = [];
  /** 换下来的缓冲，留着复用 */
  private spare: Uint32Array[] = [];
  private job: Job | null = null;
  private jobDepth: Float32Array | null = null;
  private jobTex: Uint32Array | null = null;
  private bg: BgLayer | null = null;
  /** 背景调色表（每帧按天色重算） */
  private readonly lut = new Uint32Array(LUT_N);
  private lutKey = '';
  private version = 0;
  private settled = true;
  private readonly sDraw = new SceneDrawer();
  private readonly dDraw = new SceneDrawer();
  /** 烘焙静态层专用的光栅和调色板（夜色是某一档，不跟动态层抢） */
  private readonly bakePal = new Palette();
  private readonly bakeR: Raster;
  private readonly bDraw = new SceneDrawer();
  private bakeLamps = 0;
  /** 当前夜色（以档为单位，0..NIGHT_STEPS）、暖色档 */
  private f = 0;
  private wq = 1;
  /** 夜色在往哪边走（+1 入夜、-1 天亮），最近一次变化后过了多少帧 */
  private dir = 1;
  private still = 1e9;

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
    this.bakeR = new Raster(this.frame, 1, 1, this.proj, this.bakePal);
    this.bakeR.litFn = (x, z) => this.ground.litAt(x, z, this.bakeLamps);
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
    this.geo = null;
    this.layers = [];
    this.spare = [];
    this.job = null;
    this.jobDepth = null;
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

  /**
   * 换光照（daylight 每次时间变了就调）：天色、星星、日月每帧跟着变；
   * 动态层夜色按 1/64 量化；静态层在两档夜色之间抖动过渡（render 里决定烘哪档）。
   */
  setLight(l: Light): void {
    this.light = l;
    const warm = Math.round(clamp(l.warm, 0, 1) * 8) / 8;
    const n = Math.round(clamp(l.night, 0, 1) * 64) / 64;
    this.pal.setNight(n, warm);
    this.lamps = Math.round(lampsOf(n) * 16) / 16;
    const f = clamp(l.night, 0, 1) * NIGHT_STEPS;
    if (f !== this.f) {
      this.dir = f > this.f ? 1 : -1;
      this.still = 0;
    }
    this.f = f;
    this.wq = warm;
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
    this.bakeR.t = t;
    const { BW, BH } = this;
    const frame = this.frame;
    const depth = this.depth;
    const pr = this.proj;
    const live = !this.settled;
    this.stats.live = live;
    this.stats.jobMs = 0;
    this.still++;
    this.buildLut();
    if (live) {
      // 背景：沿用上次的背景索引（挪到当前位置），没有就填天色
      this.blitBg();
      depth.fill(Number.NEGATIVE_INFINITY);
      r.setTarget(frame, depth, BW, BH);
      const lv = Math.round(this.f);
      this.drawSides(r);
      this.drawGround(r, this.ground.texFor(lv / NIGHT_STEPS, lampsOf(lv / NIGHT_STEPS), this.wq), 0, 1e9);
      r.zmode = ZWRITE;
      this.stats.statics = this.sDraw.collect(r, statics);
      this.sDraw.draw(r);
    } else {
      const key = this.geoKey();
      const g = this.geo;
      const sx = g ? g.OX - pr.ox : 0;
      const sy = g ? g.OY - pr.oy : 0;
      if (!g || g.key !== key || sx < 0 || sy < 0 || sx > g.W - BW || sy > g.H - BH) {
        this.newGeo(statics, key);
      } else {
        // 时间跳了（调试快进、读档）：最近的一档离得太远就当场烘，不等后台
        const near = this.nearest();
        if (!near || Math.abs(near.level - this.f) > JUMP) this.bakeNow(statics, Math.round(this.f));
      }
      this.pump(statics);
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

  private geoKey(): string {
    const pr = this.proj;
    const g = this.ground;
    return `${pr.ang.toFixed(5)}|${pr.k}|${pr.spriteScale}|${this.version}|${g.version}|${g.lampVersion}|${this.BW}x${this.BH}`;
  }

  /** 新的几何（转角、缩放、版本变了，或者平移出了缓存）：丢掉所有档，当场烘最近的一档，背景索引按需重画 */
  private newGeo(statics: Node, key: string): void {
    const { BW, BH } = this;
    const pr = this.proj;
    const mx = Math.round(BW * 0.5);
    const my = Math.round(BH * 0.3);
    const W = BW + mx * 2;
    const H = BH + my * 2;
    let g = this.geo;
    if (!g || g.W !== W || g.H !== H) {
      g = { key, W, H, OX: 0, OY: 0, depth: new Float32Array(W * H) };
      this.spare = [];
      for (const l of this.layers) if (l.buf.length === W * H) this.spare.push(l.buf);
      this.jobDepth = null;
    } else for (const l of this.layers) this.spare.push(l.buf);
    if (this.job) this.spare.push(this.job.layer.buf);
    this.job = null;
    this.layers = [];
    g.key = key;
    g.OX = pr.ox + mx;
    g.OY = pr.oy + my;
    this.geo = g;
    this.bakeNow(statics, Math.round(this.f));
    // 背景索引只跟几何有关（颜色查表）
    const bk = `${g.OX}|${g.OY}|${W}x${H}|${pr.ang.toFixed(5)}|${pr.k}|${BH}`;
    if (!this.bg || this.bg.key !== bk) {
      const t0 = performance.now();
      this.bg = this.drawBackdrop(W, H, mx, my, g.OX, g.OY, bk, this.bg);
      this.stats.bakeMs += performance.now() - t0;
    }
  }

  /** 当场整张烘一档（深度写进共用的深度缓冲） */
  private bakeNow(statics: Node, level: number): void {
    const t0 = performance.now();
    const g = this.geo as Geo;
    const job = this.startJob(level, g.depth);
    this.step(job, statics, Number.POSITIVE_INFINITY);
    this.stats.bakeMs = performance.now() - t0;
  }

  /** 拿一块缓冲开始烘某一档；档数满了就换掉离当前夜色最远的那档 */
  private startJob(level: number, depth: Float32Array): Job {
    const g = this.geo as Geo;
    const size = g.W * g.H;
    // 正在后台烘的作废（当场烘的优先）
    if (this.job) {
      this.spare.push(this.job.layer.buf);
      this.job = null;
    }
    this.layers = this.layers.filter((l) => {
      if (l.level === level && l.warm === this.wq) {
        this.spare.push(l.buf);
        return false;
      }
      return true;
    });
    while (this.layers.length >= KEEP) {
      let far = 0;
      for (let i = 1; i < this.layers.length; i++)
        if (this.cost(this.layers[i] as StLayer) > this.cost(this.layers[far] as StLayer)) far = i;
      this.spare.push((this.layers[far] as StLayer).buf);
      this.layers.splice(far, 1);
    }
    let buf = this.spare.pop();
    while (buf && buf.length !== size) buf = this.spare.pop();
    const n = level / NIGHT_STEPS;
    const TWH = this.ground.TW * this.ground.TH;
    if (!this.jobTex || this.jobTex.length !== TWH) this.jobTex = new Uint32Array(TWH);
    const job: Job = {
      geo: g,
      layer: { buf: buf ?? new Uint32Array(size), level, warm: this.wq },
      depth,
      n,
      amt: lampsOf(n),
      phase: 0,
      i: 0,
      tex: this.jobTex,
    };
    this.job = job;
    return job;
  }

  /** 一档离当前夜色有多"没用"（换掉的优先级） */
  private cost(l: StLayer): number {
    return Math.abs(l.level - this.f) + (l.warm === this.wq ? 0 : 100);
  }

  /** 后台烘焙：缺当前要的两档就先烘它们，都有了而且夜色在走，就提前烘下一档 */
  private pump(statics: Node): void {
    const s0 = performance.now();
    const deadline = s0 + this.bakeBudgetMs;
    if (!this.job) {
      const lo = Math.floor(this.f);
      const hi = Math.min(NIGHT_STEPS, lo + 1);
      const want: number[] = [lo];
      if (this.f - lo > 1e-3) want.push(hi);
      // 夜色最近 2 秒左右动过：提前烘它要走到的那档
      if (this.still < 120) want.push(this.dir > 0 ? hi + (this.f - lo > 1e-3 ? 1 : 0) : lo - 1);
      for (const lv of want) {
        if (lv < 0 || lv > NIGHT_STEPS || this.find(lv)) continue;
        this.startJob(lv, this.jobDepth ?? this.newJobDepth());
        break;
      }
    }
    if (this.job) {
      this.step(this.job, statics, deadline);
      this.stats.jobMs = performance.now() - s0;
    }
  }

  private newJobDepth(): Float32Array {
    const g = this.geo as Geo;
    this.jobDepth = new Float32Array(g.W * g.H);
    return this.jobDepth;
  }

  private find(level: number): StLayer | undefined {
    for (const l of this.layers) if (l.level === level && l.warm === this.wq) return l;
    return undefined;
  }

  /** 离当前夜色最近的一档（暖色对得上的优先） */
  private nearest(): StLayer | undefined {
    let best: StLayer | undefined;
    let bc = Number.POSITIVE_INFINITY;
    for (const l of this.layers) {
      const c = this.cost(l);
      if (c < bc) {
        bc = c;
        best = l;
      }
    }
    return best;
  }

  /**
   * 往前烘一段，到 deadline 为止（Infinity = 一口气烘完）。烘完把这一档放进 layers。
   * 每段都临时把投影原点挪到缓存原点、调色板换成这一档的夜色。
   */
  private step(job: Job, statics: Node, deadline: number): void {
    const g = job.geo;
    if (g !== this.geo || g.key !== (this.geo as Geo).key) {
      this.job = null;
      return;
    }
    const pr = this.proj;
    const ox = pr.ox;
    const oy = pr.oy;
    pr.ox = g.OX;
    pr.oy = g.OY;
    const r = this.bakeR;
    this.bakePal.setNight(job.n, job.layer.warm);
    this.bakeLamps = Math.round(job.amt * 16) / 16;
    r.setTarget(job.layer.buf, job.depth, g.W, g.H);
    const gp = this.ground;
    const night = job.n > 0;
    const tex = night ? job.tex : gp.tex;
    let done = false;
    while (performance.now() < deadline || deadline === Number.POSITIVE_INFINITY) {
      if (job.phase === 0) {
        job.layer.buf.fill(0);
        job.depth.fill(Number.NEGATIVE_INFINITY);
        this.drawSides(r);
        job.phase = night ? 1 : 2;
        job.i = 0;
      } else if (job.phase === 1) {
        // 灯光图（增删灯之后第一次用）也分几段算
        if (this.bakeLamps > 0 && !gp.litStep(1)) continue;
        const j1 = Math.min(gp.TH, job.i + 48);
        gp.nightRows(job.tex, job.n, this.bakeLamps, job.layer.warm, job.i, j1);
        job.i = j1;
        if (j1 >= gp.TH) {
          job.phase = 2;
          job.i = 0;
        }
      } else if (job.phase === 2) {
        const y = this.drawGround(r, tex, job.i, job.i + 96);
        job.i += 96;
        if (y) job.phase = 3;
      } else if (job.phase === 3) {
        r.zmode = ZWRITE;
        this.stats.statics = this.bDraw.collect(r, statics);
        job.phase = 4;
        job.i = 0;
      } else {
        r.zmode = ZWRITE;
        const n = this.bDraw.size;
        const to = deadline === Number.POSITIVE_INFINITY ? n : Math.min(n, job.i + 12);
        this.bDraw.draw(r, job.i, to);
        job.i = to;
        if (to >= n) {
          done = true;
        }
      }
      if (done) break;
    }
    r.zmode = ZNONE;
    pr.ox = ox;
    pr.oy = oy;
    if (done) {
      this.layers.push(job.layer);
      this.job = null;
      this.stats.bakes++;
    }
  }

  /** 缓存 → 帧：当前夜色两档之间按 Bayer 阈值逐像素挑，静态层透明处查背景 */
  private composite(): void {
    const g = this.geo as Geo;
    const bg = this.bg as BgLayer;
    const { BW, BH } = this;
    const sx = g.OX - this.proj.ox;
    const sy = g.OY - this.proj.oy;
    const frame = this.frame;
    const lut = this.lut;
    const idx = bg.idx;
    const lo = Math.floor(this.f);
    const u = this.f - lo;
    let A = this.find(lo);
    let B = u > 1e-3 ? this.find(Math.min(NIGHT_STEPS, lo + 1)) : undefined;
    if (!A || !B) {
      // 缺一档（刚换了几何、或者后台还没烘好）：只用最近的一档
      A = A && (!B || u < 0.5) ? A : (B ?? A ?? this.nearest());
      B = undefined;
    }
    const ab = (A as StLayer).buf;
    const W = g.W;
    if (!B) {
      for (let y = 0; y < BH; y++) {
        const s = (y + sy) * W + sx;
        const d = y * BW;
        for (let x = 0; x < BW; x++) {
          const v = ab[s + x] as number;
          frame[d + x] = v !== 0 ? v : (lut[idx[s + x] as number] as number);
        }
        this.depth.set(g.depth.subarray(s, s + BW), d);
      }
    } else {
      const bb = B.buf;
      for (let y = 0; y < BH; y++) {
        const s = (y + sy) * W + sx;
        const d = y * BW;
        // Bayer 表按缓存坐标取，平移时花纹不会跟着爬
        const row = ((y + sy) & 3) << 2;
        for (let x = 0; x < BW; x++) {
          const v = u > (BAY[row | ((x + sx) & 3)] as number) ? (bb[s + x] as number) : (ab[s + x] as number);
          frame[d + x] = v !== 0 ? v : (lut[idx[s + x] as number] as number);
        }
        this.depth.set(g.depth.subarray(s, s + BW), d);
      }
    }
    this.drawSkyExtras(sx, sy, ab);
  }

  /** 实时帧的背景：上次背景索引挪到当前位置，缺的地方填天色 */
  private blitBg(): void {
    const { BW, BH } = this;
    const bg = this.bg;
    const frame = this.frame;
    const lut = this.lut;
    const fill = lut[0] as number;
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
        frame[d + x] = bx >= 0 && bx < bg.W ? (lut[bg.idx[by * bg.W + bx] as number] as number) : fill;
      }
    }
    this.drawSkyExtras(sx, sy, null);
  }

  /** 背景调色表：天空渐变分 SKY_N 段（样片按 6 量化颜色），三道山脊各三种明暗，两种荒原 */
  private buildLut(): void {
    const L = this.light;
    const key = `${L.sky.join()}|${L.mtn.join()}|${L.plain.join()}`;
    if (key === this.lutKey) return;
    this.lutKey = key;
    const lut = this.lut;
    const s0 = rgbOf(L.sky[0]);
    const s1 = rgbOf(L.sky[1]);
    const s2 = rgbOf(L.sky[2]);
    for (let i = 0; i < SKY_N; i++) {
      const tt = (i / (SKY_N - 1)) * 1.12 - 0.06;
      let r: number;
      let g: number;
      let b: number;
      if (tt < 0.6) {
        const v = tt / 0.6;
        r = s0[0] + (s1[0] - s0[0]) * v;
        g = s0[1] + (s1[1] - s0[1]) * v;
        b = s0[2] + (s1[2] - s0[2]) * v;
      } else {
        const v = (tt - 0.6) / 0.4;
        r = s1[0] + (s2[0] - s1[0]) * v;
        g = s1[1] + (s2[1] - s1[1]) * v;
        b = s1[2] + (s2[2] - s1[2]) * v;
      }
      lut[i] = pk(Math.floor(r / 6) * 6, Math.floor(g / 6) * 6, Math.floor(b / 6) * 6);
    }
    for (let m = 0; m < 3; m++) {
      const c = rgbOf(L.mtn[m] as string);
      lut[MTN0 + m * 3] = pk(c[0], c[1], c[2]);
      lut[MTN0 + m * 3 + 1] = pk(c[0] * 1.12 + 10, c[1] * 1.1 + 8, c[2] * 1.06 + 6);
      lut[MTN0 + m * 3 + 2] = pk(c[0] * 0.9, c[1] * 0.9, c[2] * 0.92);
    }
    const p0 = rgbOf(L.plain[0]);
    const p1 = rgbOf(L.plain[1]);
    lut[PLAIN0] = pk(p0[0], p0[1], p0[2]);
    lut[PLAIN0 + 1] = pk(p1[0], p1[1], p1[2]);
  }

  /**
   * 星星、太阳、月亮：每帧按天色补画在露天的像素上（背景索引是天空、静态层 st 那里透明）。
   * (sx, sy) 是屏幕在背景缓存里的偏移。
   */
  private drawSkyExtras(sx: number, sy: number, st: Uint32Array | null): void {
    const bg = this.bg;
    if (!bg) return;
    const L = this.light;
    const { BW, BH } = this;
    const frame = this.frame;
    const lut = this.lut;
    const idx = bg.idx;
    const W = bg.W;
    const hy = bg.hy;
    /** 缓存坐标 (bx, by) 露天就返回帧下标，否则 -1 */
    const open = (bx: number, by: number): number => {
      const X = bx - sx;
      const Y = by - sy;
      if (X < 0 || Y < 0 || X >= BW || Y >= BH || bx < 0 || by < 0 || bx >= W || by >= bg.H || by >= hy) return -1;
      const bi = by * W + bx;
      if ((idx[bi] as number) >= SKY_N || (st && st[bi] !== 0)) return -1;
      return Y * BW + X;
    };
    // 星星：每颗有自己的出现门槛，天越黑出来得越多，刚出来时淡一些
    if (L.star > 0.02) {
      const n = bg.starAt.length;
      for (let i = 0; i < n; i++) {
        const thr = bg.starThr[i] as number;
        if (thr > L.star) continue;
        const bi = bg.starAt[i] as number;
        const o = open(bi % W, (bi / W) | 0);
        if (o < 0) continue;
        const a = Math.min(1, (L.star - thr) * 6);
        const hi = bg.starHi[i] === 1;
        const v = lut[idx[bi] as number] as number;
        const r = v & 255;
        const g = (v >>> 8) & 255;
        const b = (v >>> 16) & 255;
        frame[o] = hi
          ? pk(r + (255 - r) * a, g + (255 - g) * a, b + (230 - b) * a)
          : pk(r + (170 - r) * a, g + (170 - g) * a, b + (210 - b) * a);
      }
    }
    const km = Math.min(this.proj.k, 2.5);
    const at = (fx: number, fy: number): [number, number] => [
      bg.mx + this.BW * fx,
      bg.my + Math.max(14, (hy - bg.my) * fy),
    ];
    // 月亮（颜色已经按显隐褪进天色）
    const [mc, mfx, mfy, ma] = L.moonDisc;
    if (ma > 0.02 && mfy < 2) {
      const c = rgbOf(mc);
      const [mxp, myp] = at(mfx, mfy);
      const mr = Math.max(5, km * 5);
      const main = pk(c[0], c[1], c[2]);
      const spot = pk(c[0] * 0.88, c[1] * 0.88, c[2] * 0.85);
      for (let y = -mr; y <= mr; y++)
        for (let x = -mr; x <= mr; x++) {
          if (Math.hypot(x, y) > mr || Math.hypot(x + mr * 0.45, y - mr * 0.3) < mr * 0.85) continue;
          const o = open((mxp + x) | 0, (myp + y) | 0);
          if (o >= 0) frame[o] = hash(x, y, 3) > 0.9 ? spot : main;
        }
    }
    // 太阳：落到山后就被山挡住（只画在天空像素上），竖 > 1 就在地平线下了
    const [dc, dxf, dyf] = L.disc;
    if (dyf < 1.25) {
      const c = rgbOf(dc);
      const [mxp, myp] = at(dxf, dyf);
      const sr = Math.max(5, km * 4.5);
      const sun = pk(c[0], c[1], c[2]);
      for (let y = -sr * 2; y <= sr * 2; y++)
        for (let x = -sr * 2; x <= sr * 2; x++) {
          const d = Math.hypot(x, y);
          if (d >= sr * 2) continue;
          const bx = (mxp + x) | 0;
          const by = (myp + y) | 0;
          const o = open(bx, by);
          if (o < 0) continue;
          if (d <= sr) frame[o] = sun;
          else if (bay(bx, by) < (1 - (d - sr) / sr) * 0.5) {
            const v = frame[o] as number;
            frame[o] = pk((v & 255) + 30, ((v >>> 8) & 255) + 24, ((v >>> 16) & 255) + 8);
          }
        }
    }
  }

  /** 地台侧面（带地层） */
  private drawSides(r: Raster): void {
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
  }

  /**
   * 地面：缓冲第 ya..yb-1 行（和地台投影的上下范围取交集）每个像素反投影到 y=0，取贴图 tex。
   * 返回 true = 这一段已经到地台底了。
   */
  private drawGround(r: Raster, tex: Uint32Array, ya: number, yb: number): boolean {
    const pr = this.proj;
    const SL = this.slab;
    const k = pr.k;
    r.zmode = ZNONE;
    const g = this.ground;
    const its = 1 / g.TS;
    const ik = 1 / k;
    const { W, H, buf } = r;
    const TW = g.TW;
    const TH = g.TH;
    // 只扫地台投影的上下范围
    let sa = 1e9;
    let sb = -1e9;
    for (const [x, z] of [
      [SL.x0, SL.z0],
      [SL.x1, SL.z0],
      [SL.x1, SL.z1],
      [SL.x0, SL.z1],
    ] as const) {
      const y = pr.sy(x, 0, z);
      sa = Math.min(sa, y);
      sb = Math.max(sb, y);
    }
    const top = Math.max(0, Math.floor(sa));
    const bot = Math.min(H - 1, Math.ceil(sb));
    const y0 = top + Math.max(0, ya);
    const y1 = Math.min(bot, top + yb - 1);
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
    return y1 >= bot;
  }

  /**
   * 背景索引（样片的 drawBackdrop 的几何部分）：W×H，屏幕在其中的偏移是 (offX, offY)。
   * 每像素存"哪一段天 / 哪道山的哪种明暗 / 哪种荒原"，颜色由 buildLut 按天色查。
   */
  private drawBackdrop(
    W: number,
    H: number,
    offX: number,
    offY: number,
    OX: number,
    OY: number,
    key: string,
    old: BgLayer | null,
  ): BgLayer {
    const pr = this.proj;
    const SL = this.slab;
    const k = pr.k;
    const ox = pr.ox;
    const oy = pr.oy;
    pr.ox = OX;
    pr.oy = OY;
    const idx = old && old.W === W && old.H === H ? old.idx : new Uint8Array(W * H);
    // 群山按屏幕高度定大小（样片：竖屏 844 高时约 5.3 倍振幅），不随缩放变
    const km = Math.min(k, 2.5);
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
    const yEnd = Math.min(H, Math.max(0, hy + 2));
    for (let y = 0; y < yEnd; y++) {
      const t = clamp(y / Math.max(1, hy), 0, 1);
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const tt = t + (bay(x, y) - 0.5) * 0.12;
        idx[row + x] = clamp(Math.round(((tt + 0.06) / 1.12) * (SKY_N - 1)), 0, SKY_N - 1);
      }
    }
    // 星星（位置和门槛照样片：hash(i, 4) 是出现门槛）
    const n = Math.round((260 * W * H) / (this.BW * this.BH));
    const at: number[] = [];
    const thr: number[] = [];
    const hi: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(hash(i, 1, 77) * W);
      const y = Math.floor(hash(i, 2, 77) * hy * 0.95);
      if (y < 0 || y >= H) continue;
      at.push(y * W + x);
      thr.push(hash(i, 4, 77));
      hi.push(hash(i, 3, 77) > 0.85 ? 1 : 0);
    }
    // 三道山脊
    const layers: [number, number, number][] = [
      [38, 0.02, 11],
      [26, 0.033, 23],
      [15, 0.05, 37],
    ];
    layers.forEach(([amp, fr, seed], m) => {
      const cc = MTN0 + m * 3;
      for (let x = 0; x < W; x++) {
        const wx = ((x - pr.ox) / 2.2) * 0.6;
        const nn = fbm(wx * fr, seed, seed);
        const n2 = Math.abs(vnoise(wx * fr * 3, seed + 1, seed) - 0.5) * 2;
        const h = Math.round((nn * 0.8 + n2 * 0.25) * amp * mh);
        const y0 = hy - h;
        for (let y = Math.max(0, y0); y < Math.min(H, hy + 2); y++) {
          const sl = fbm(wx * fr * 6, y * 0.05, seed + 4);
          idx[y * W + x] = y === y0 ? cc + 1 : sl > 0.58 ? cc + 1 : sl < 0.4 ? cc + 2 : cc;
        }
      }
    });
    // 地平线以下的荒原（两色抖动，噪声按 2×2 取样省时间）
    const yb = Math.max(0, hy + 2);
    const span = Math.max(1, H - hy);
    for (let y = yb; y < H; y++) {
      const t = clamp((y - hy) / span, 0, 1);
      const row = y * W;
      let nz = 0;
      for (let x = 0; x < W; x++) {
        if ((x & 1) === 0) nz = fbm(((x - pr.ox) / 2.2) * 0.05, (y & ~1) * 0.08, 5) - 0.5;
        const tt = t + (bay(x, y) - 0.5) * 0.15 + nz * 0.5;
        idx[row + x] = tt < 0.5 ? PLAIN0 : PLAIN0 + 1;
      }
    }
    pr.ox = ox;
    pr.oy = oy;
    return {
      idx,
      W,
      H,
      OX,
      OY,
      key,
      hy,
      mx: offX,
      my: offY,
      starAt: Int32Array.from(at),
      starThr: Float32Array.from(thr),
      starHi: Uint8Array.from(hi),
    };
  }
}
