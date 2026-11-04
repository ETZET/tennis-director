import { ghost } from '../../art/land/ghost';
import { desertAt, LC, lawnAt, paintCasts, paintCourtL, paintStalls, pathAt } from '../../art/land/ground';
import {
  bench,
  bigScreen,
  bridge,
  cabin,
  canopy,
  dorm,
  excavator,
  lounger,
  materials,
  netPosts,
  porchGlow,
  siteFence,
  stake,
  strataSh,
  terrace,
} from '../../art/land/pieces';
import { clamp, fbm, hash, mixP, nightP, vnoise } from '../../core/color';
import { SceneDrawer } from '../../core/draw';
import { Custom, type DrawContext, Group, type Node } from '../../core/graph';
import { type Rect, slabOutline } from '../../core/ground';
import type { Raster } from '../../core/raster';
import { buildStatics, type Lamp, type SiteKit, type Weather } from './build';
import {
  FORE,
  golfDecayForWeek,
  ISLE_FLOAT,
  ISLE_NET,
  isleTop,
  type PaintTarget,
  repaintLand,
  setGroundPass,
} from './foreshadow';
import { C, type Cast, SLAB } from './ground';
import {
  BRIDGE,
  CABINS,
  DORM,
  F_ISLE,
  F_SC1,
  F_SC2,
  GOLF_POND,
  GOLF_WEST,
  ISLE_DOCK,
  LOT_NEW,
  LOT_S,
  OASIS_DECK,
  OASIS_POOL,
  SE_GROW,
  SE_ROAD,
  SITE,
  SLOPE,
  SOUTH_GATE,
  SOUTH_WALK,
} from './layout';
import { Facilities, INITIAL_STATES } from './state';

/**
 * 新地的画面层（ADR 0021，wave2-5-contract.md 的 land / landPreview）：
 *
 * - golf_west（★3，高尔夫西段，岛的轮廓不变）：south_courts 南场（填塘、两片新硬地、灯、围网、通到南门的长步道）
 *   或 oasis_lawn 绿洲草坪（留塘、三间小屋、小泳池庭院、棕榈）；
 * - se_corner（★4，岛第一次长出去）：event_plaza 赛事广场（南停车场改观赛坡和大遮阳棚，东南角长出新地放挪过去的车位）
 *   或 academy_isle 学院岛（东南天上的小岛靠岸，一座长桥、宿舍、练习场）。
 *
 * 状态：locked 只有伏笔（foreshadow.ts）；building 是工地，progress 0..1 一步步清掉、搭起来
 * （拆门、清场、材料、脚手架）；open 建好。每块地用自己的随机流（hash 的种子都在 120 以上），原来那座岛的像素不变。
 *
 * 用法：createLand(world) 建一份（每个世界一份），把 land / landPreview 接进 createOverlays。
 * 地面画在 foreshadow.ts 的挂钩里（paintGround 画完自动重画新地），静态节点在自己的一个组里，不跟着设施重建。
 */

export type LandState = 'locked' | 'building' | 'open';
export const PLOTS = ['golf_west', 'se_corner'] as const;
export type Plot = (typeof PLOTS)[number];
export const LAND_VARIANTS: Readonly<Record<Plot, readonly string[]>> = {
  golf_west: ['south_courts', 'oasis_lawn'],
  se_corner: ['event_plaza', 'academy_isle'],
};

/** land.ts 要用到的 IsoWorld 的部分（overlays.ts 的 SiteWorld 再加上换地台） */
export interface LandWorld {
  readonly statics: Node;
  readonly scene: Node;
  readonly ground: PaintTarget & { get?(x: number, z: number): number };
  addLamp(l: Lamp): () => void;
  readonly view: { invalidate(): void };
  /** IsoWorld.setSlab；没有（测试替身）就不长地台 */
  setSlab?(rects: readonly Rect[], bounds?: Rect): void;
}

export interface LandLayer {
  /** 地块的状态（contract 的 land）：variant 是选的路，progress 是施工进度 0..1（building 时） */
  land(plot: string, state: LandState, variant: string | null, progress?: number): void;
  /** 选路卡上的半透明预览：这块地修成这个变体的样子；null 关掉 */
  landPreview(plot: string, variant: string | null): void;
  /** 高尔夫西段荒到几成（0..1）；golfDecayForWeek(week) 按周换算 */
  golfDecay(t: number): void;
  /** 立刻做掉排着的重建（测试、截图用） */
  flush(): void;
}

export interface LandOptions {
  /** 风（棕榈摆动；传天空层的那一份，不传就是微风） */
  weather?: Weather;
  /** 第几周（不调 golfDecay 时按它定高尔夫荒到几成） */
  week?: number;
}

interface PlotLook {
  state: LandState;
  variant: string | null;
  p: number;
}

/** 这一轮建出来的节点、影子、灯 */
interface Built {
  statics: Node[];
  dynamic: Node[];
  casts: Cast[];
  lamps: Lamp[];
}

const isPlot = (p: string): p is Plot => (PLOTS as readonly string[]).includes(p);
const q = (p: number) => Math.round(clamp(p, 0, 1) * 40) / 40;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const step = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);

/** 学院岛：施工前四分之一是"往下落、靠过来"，之后靠岸 */
const DOCK_AT = 0.25;

/**
 * 施工画面跟着工单走：模拟给的 progress 是按工作量算的总进度（plotStatus），工单有先后，一张张做。
 * 每个变体照内容里工单的顺序和工作量（小时，和 content 的 orders/*.yaml 一致）列一遍，每张工单做完时画面走到第几成。
 * 画面里各阶段的门槛都按这里的"画面进度"写：例如南场在"铺两片硬地"开工之前不会出现场地。
 */
const STAGES: Readonly<Record<string, readonly (readonly [work: number, art: number])[]>> = {
  // 拆门 → 清沙坑 → 填塘 → 铺硬地 → 网和灯
  south_courts: [
    [3, 0.2],
    [8, 0.28],
    [8, 0.35],
    [10, 0.88],
    [4, 1],
  ],
  // 清场铺小路 → 三间小屋 → 小泳池
  oasis_lawn: [
    [5, 0.3],
    [12, 0.75],
    [6, 1],
  ],
  // 挪车 → 长出新地 → 观赛坡和遮阳棚 → 新停车场和路
  event_plaza: [
    [2, 0.1],
    [12, 0.4],
    [10, 0.85],
    [4, 1],
  ],
  // 拖岛靠岸 → 桥 → 宿舍 → 练习场
  academy_isle: [
    [4, DOCK_AT],
    [8, 0.55],
    [6, 0.85],
    [4, 1],
  ],
};

/** 按工作量的总进度 → 画面进度（分段线性；没列的变体原样） */
export function stageProgress(variant: string, p: number): number {
  const st = STAGES[variant];
  if (!st) return p;
  const total = st.reduce((a, [w]) => a + w, 0);
  let w0 = 0;
  let a0 = 0;
  for (const [w, a] of st) {
    const w1 = w0 + w / total;
    if (p <= w1 + 1e-9) return a0 + (a - a0) * clamp((p - w0) / Math.max(1e-9, w1 - w0), 0, 1);
    w0 = w1;
    a0 = a;
  }
  return 1;
}

/** 赛事广场：挪完车（第一张工单）才长出新地、旧停车场才空 */
const EP_GROW = 0.1;

export function createLand(world: LandWorld, opts: LandOptions = {}): LandLayer {
  const wx: Weather = opts.weather ?? { wind: 0.3, rain: 0 };
  const plots: Record<Plot, PlotLook> = {
    golf_west: { state: 'locked', variant: null, p: 0 },
    se_corner: { state: 'locked', variant: null, p: 0 },
  };
  let preview: { plot: Plot; variant: string } | null = null;
  // 借 build.ts 的小工具（棕榈、围网、灯杆、车）：它们往这一份 out 里加节点，用完切下来
  const kout = buildStatics(new Facilities({ ...INITIAL_STATES }, {}, {}), wx);
  const K = kout.kit as SiteKit;
  const take = (fn: () => void): Built => {
    const s0 = kout.statics.length;
    const d0 = kout.dynamic.length;
    const c0 = kout.casts.length;
    const l0 = kout.lamps.length;
    fn();
    return {
      statics: kout.statics.splice(s0),
      dynamic: kout.dynamic.splice(d0),
      casts: kout.casts.splice(c0),
      lamps: kout.lamps.splice(l0),
    };
  };
  const group = new Group();
  group.name = 'land';
  const anim = new Group();
  anim.name = 'land-anim';
  world.statics.add(group);
  world.scene.add(anim);
  let lampOffs: (() => void)[] = [];
  let casts: Cast[] = [];
  let slabKey = '';
  let scheduled = false;
  let decaySet = false;
  if (opts.week !== undefined) FORE.decay = golfDecayForWeek(opts.week);

  /** 某块地按某个样子建节点（预览也用它） */
  const buildPlot = (plot: Plot, L: PlotLook): Built =>
    take(() => {
      if (L.state === 'locked' || !L.variant) return;
      if (plot === 'golf_west') {
        if (L.variant === 'south_courts') southCourts(K, L);
        else if (L.variant === 'oasis_lawn') oasisLawn(K, L);
      } else if (L.variant === 'event_plaza') eventPlaza(K, L);
      else if (L.variant === 'academy_isle') academyIsle(K, L);
    });

  /** 地台：基础地台 + 已经长出来的地 */
  const slabFor = (P: Record<Plot, PlotLook>): Rect[] => {
    const rs: Rect[] = [SLAB];
    const se = P.se_corner;
    if (se.variant === 'event_plaza' && (se.state === 'open' || (se.state === 'building' && se.p >= EP_GROW)))
      rs.push(...SE_GROW);
    if (se.variant === 'academy_isle' && (se.state === 'open' || (se.state === 'building' && se.p >= DOCK_AT)))
      rs.push(ISLE_DOCK);
    return rs;
  };

  /** FORE（伏笔的样子）跟着地块状态走 */
  const syncFore = () => {
    const gw = plots.golf_west;
    const taken = gw.state !== 'locked' && !!gw.variant;
    FORE.golf = !taken ? 'golf' : gw.state === 'open' ? 'taken' : 'building';
    FORE.gate = {
      bricks: taken ? (gw.state === 'open' ? 0 : 1 - step(gw.p, 0, 0.2)) : 1,
      iron: gw.state === 'open',
      lamps: gw.state === 'open',
    };
    const se = plots.se_corner;
    const hide: Rect[] = [];
    if (se.variant === 'event_plaza' && (se.state === 'open' || (se.state === 'building' && se.p >= EP_GROW)))
      hide.push(LOT_S, SE_ROAD);
    if (se.state !== 'locked' && se.variant === 'academy_isle') hide.push(SE_ROAD);
    if (taken) hide.push(GOLF_WEST);
    FORE.hide = hide;
    if (se.variant === 'academy_isle' && se.state !== 'locked') {
      const t = se.state === 'open' ? 1 : step(se.p, 0, DOCK_AT);
      FORE.isle = {
        show: t < 1,
        x0: lerp(ISLE_FLOAT.x0, ISLE_DOCK.x0, t),
        z0: lerp(ISLE_FLOAT.z0, ISLE_DOCK.z0, t),
        y: lerp(ISLE_FLOAT.y, 0.2, t * t),
      };
    } else
      FORE.isle = {
        // 东南角走了赛事广场：学院岛那条路没了，天上的小岛飘走（留着的话它正好浮在新停车场前面，
        // 底下的尖像是新地台倒挂下来的一块）
        // 预览东南角的两条路时先把它收起来：赛事广场的预览里它本来就不在了，学院岛的预览画在靠岸的位置（留着会压在预览底下）
        show: !(
          (se.variant === 'event_plaza' && se.state !== 'locked') ||
          (se.state === 'locked' && preview?.plot === 'se_corner')
        ),
        x0: ISLE_FLOAT.x0,
        z0: ISLE_FLOAT.z0,
        y: ISLE_FLOAT.y,
      };
  };

  /** 地面：新地（伏笔由 foreshadow.ts 先画） */
  const paintPass = (g: PaintTarget) => {
    for (const plot of PLOTS) paintPlot(g, plot, plots[plot]);
    paintCasts(g, casts);
  };
  setGroundPass(world.ground, paintPass);

  const rebuild = () => {
    scheduled = false;
    syncFore();
    const rs = slabFor(plots);
    const key = JSON.stringify(rs);
    if (key !== slabKey) {
      slabKey = key;
      FORE.slab = rs.length > 1 ? rs : [];
      if (world.setSlab) {
        let x1: number = SITE.x1;
        let z1: number = SITE.z1;
        for (const r of rs) {
          x1 = Math.max(x1, r.x1 - 8);
          z1 = Math.max(z1, r.z1 - 8);
        }
        world.setSlab(rs, { x0: SITE.x0 + 10, x1: x1 - 10, z0: SITE.z0 + 10, z1: z1 - 6 });
      }
    }
    group.remove(...group.children);
    anim.remove(...anim.children);
    for (const off of lampOffs) off();
    const all: Built = { statics: [], dynamic: [], casts: [], lamps: [] };
    for (const plot of PLOTS) {
      const b = buildPlot(plot, plots[plot]);
      all.statics.push(...b.statics);
      all.dynamic.push(...b.dynamic);
      all.casts.push(...b.casts);
      all.lamps.push(...b.lamps);
    }
    casts = all.casts;
    group.add(...all.statics);
    anim.add(...all.dynamic);
    lampOffs = all.lamps.map((l) => world.addLamp(l));
    if (preview) {
      const gh = buildGhost(preview.plot, preview.variant);
      if (gh) group.add(gh);
    }
    repaintLand(world.ground);
    world.view.invalidate();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      if (scheduled) rebuild();
    });
  };

  /**
   * 预览幽灵：这块地修成 variant 的样子（节点 + 和现在不一样的地面 + 新长出来的地台侧面），
   * 按 Wave 1 的修复预览那样溶解、偏青、描虚线。
   */
  const buildGhost = (plot: Plot, variant: string): Custom | null => {
    const look: PlotLook = { state: 'open', variant, p: 1 };
    const b = buildPlot(plot, look);
    const sub = new Group();
    sub.add(...b.statics, ...b.dynamic);
    const regions = previewRegions(plot, variant);
    const bb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
    for (const r of regions) {
      bb.x0 = Math.min(bb.x0, r.x0);
      bb.x1 = Math.max(bb.x1, r.x1);
      bb.z0 = Math.min(bb.z0, r.z0);
      bb.z1 = Math.max(bb.z1, r.z1);
    }
    // 地面：在一小张贴图上，从现在的地面出发画一遍新地，只预览不一样的纹素
    const now = new Patch(bb, world.ground.get ? (x, z) => world.ground.get?.(x, z) ?? 0 : () => 0);
    const after = now.clone();
    paintPlot(after, plot, look);
    paintCasts(after, b.casts);
    // 新长出来的地台侧面
    const base = slabFor(plots);
    const grown = slabFor({ ...plots, [plot]: look } as Record<Plot, PlotLook>);
    const newWalls = slabOutline(grown).filter((w) => {
      const mx = (w.x0 + w.x1) / 2;
      const mz = (w.z0 + w.z1) / 2;
      return !base.some((r) => mx >= r.x0 - 0.01 && mx <= r.x1 + 0.01 && mz >= r.z0 - 0.01 && mz <= r.z1 + 0.01);
    });
    const drawer = new SceneDrawer();
    const node = new Custom(
      (r) =>
        ghost(r, { ...bb, y0: -8, y1: 9 }, regions, () => {
          for (const w of newWalls) {
            if (!r.vis(w.nx, w.nz)) continue;
            const y0 = -7;
            const pts: [number, number, number][] =
              w.nx !== 0
                ? w.nx > 0
                  ? [
                      [w.x0, y0, w.z0],
                      [w.x0, y0, w.z1],
                      [w.x0, 0, w.z1],
                      [w.x0, 0, w.z0],
                    ]
                  : [
                      [w.x0, y0, w.z1],
                      [w.x0, y0, w.z0],
                      [w.x0, 0, w.z0],
                      [w.x0, 0, w.z1],
                    ]
                : w.nz > 0
                  ? [
                      [w.x1, y0, w.z0],
                      [w.x0, y0, w.z0],
                      [w.x0, 0, w.z0],
                      [w.x1, 0, w.z0],
                    ]
                  : [
                      [w.x0, y0, w.z0],
                      [w.x1, y0, w.z0],
                      [w.x1, 0, w.z0],
                      [w.x0, 0, w.z0],
                    ];
            r.wpoly(pts, 0, strataSh(r, w.nx, w.nz, pts));
          }
          drawPatchDiff(r, bb, after, now);
          const R = r as unknown as Raster;
          if ((R as Partial<Raster>).buf instanceof Uint32Array) {
            drawer.collect(R, sub);
            drawer.draw(R);
          }
        }),
      { ...bb, y0: -8, y1: 9 },
    );
    node.name = `land-preview:${plot}`;
    node.renderOrder = 1000;
    return node;
  };

  return {
    land(plot, state, variant, progress = 0) {
      if (!isPlot(plot)) return;
      const v = variant && LAND_VARIANTS[plot].includes(variant) ? variant : null;
      const next: PlotLook = {
        state: v ? state : 'locked',
        variant: v,
        p: state === 'building' ? stageProgress(v ?? '', q(progress)) : state === 'open' ? 1 : 0,
      };
      const cur = plots[plot];
      if (cur.state === next.state && cur.variant === next.variant && cur.p === next.p) return;
      plots[plot] = next;
      schedule();
    },
    landPreview(plot, variant) {
      const next = isPlot(plot) && variant && LAND_VARIANTS[plot].includes(variant) ? { plot, variant } : null;
      if (!next && preview && preview.plot !== plot) return;
      if (preview?.plot === next?.plot && preview?.variant === next?.variant) return;
      preview = next;
      schedule();
    },
    golfDecay(t) {
      const v = Math.round(clamp(t, 0, 1) * 20) / 20;
      if (decaySet && v === FORE.decay) return;
      decaySet = true;
      FORE.decay = v;
      schedule();
    },
    flush() {
      if (scheduled) rebuild();
    },
  };
}

/* ---------------- 预览用的小贴图 ---------------- */

/** 和真地面同一套纹素格子（SLAB 的西北角起），hash(i, j) 才对得上；不按地台遮罩（新长出来的地也能画） */
class Patch implements PaintTarget {
  readonly TS = 0.2;
  readonly i0: number;
  readonly j0: number;
  readonly W: number;
  readonly H: number;
  tex: Uint32Array;
  constructor(r: Rect, init: ((x: number, z: number) => number) | null) {
    this.i0 = Math.floor((r.x0 - SLAB.x0) / this.TS) - 1;
    this.j0 = Math.floor((r.z0 - SLAB.z0) / this.TS) - 1;
    this.W = Math.ceil((r.x1 - SLAB.x0) / this.TS) + 2 - this.i0;
    this.H = Math.ceil((r.z1 - SLAB.z0) / this.TS) + 2 - this.j0;
    this.tex = new Uint32Array(this.W * this.H);
    if (init)
      for (let j = 0; j < this.H; j++)
        for (let i = 0; i < this.W; i++)
          this.tex[j * this.W + i] = init(
            SLAB.x0 + (this.i0 + i + 0.5) * this.TS,
            SLAB.z0 + (this.j0 + j + 0.5) * this.TS,
          );
  }
  clone(): Patch {
    const p = Object.create(Patch.prototype) as Patch;
    Object.assign(p, this, { tex: this.tex.slice() });
    return p;
  }
  paintRect(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    fn: (x: number, z: number, c: number, i: number, j: number) => number,
  ): void {
    const TS = this.TS;
    const i0 = Math.max(this.i0, Math.ceil((x0 - SLAB.x0) / TS - 0.5));
    const i1 = Math.min(this.i0 + this.W - 1, Math.floor((x1 - SLAB.x0) / TS - 0.5));
    const j0 = Math.max(this.j0, Math.ceil((z0 - SLAB.z0) / TS - 0.5));
    const j1 = Math.min(this.j0 + this.H - 1, Math.floor((z1 - SLAB.z0) / TS - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = SLAB.z0 + (j + 0.5) * TS;
      for (let i = i0; i <= i1; i++) {
        const x = SLAB.x0 + (i + 0.5) * TS;
        const k = (j - this.j0) * this.W + (i - this.i0);
        const v = fn(x, z, this.tex[k] as number, i, j);
        if (v) this.tex[k] = v;
      }
    }
  }
  get(x: number, z: number): number {
    const i = Math.floor((x - SLAB.x0) / this.TS) - this.i0;
    const j = Math.floor((z - SLAB.z0) / this.TS) - this.j0;
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return 0;
    return this.tex[j * this.W + i] as number;
  }
}

/** 预览：反投影每个像素，after 和 now 不一样的纹素画 after */
function drawPatchDiff(r: DrawContext, bb: Rect, after: Patch, now: Patch): void {
  const o = r.P(0, 0, 0);
  const ex = r.P(1, 0, 0);
  const ez = r.P(0, 0, 1);
  const a = ex[0] - o[0];
  const c = ex[1] - o[1];
  const b = ez[0] - o[0];
  const d = ez[1] - o[1];
  const det = a * d - b * c || 1e-9;
  r.wpoly(
    [
      [bb.x0, 0, bb.z0],
      [bb.x1, 0, bb.z0],
      [bb.x1, 0, bb.z1],
      [bb.x0, 0, bb.z1],
    ],
    0,
    (px, py) => {
      const u = px + 0.5 - o[0];
      const v = py + 0.5 - o[1];
      const x = (d * u - b * v) / det;
      const z = (a * v - c * u) / det;
      const A = after.get(x, z);
      if (!A || A === now.get(x, z)) return 0;
      return r.night > 0 ? nightP(A, r.night, r.litAt(x, z)) : A;
    },
  );
}

/** 预览时描虚线的范围 */
function previewRegions(plot: Plot, variant: string): Rect[] {
  if (plot === 'golf_west') return [GOLF_WEST];
  if (variant === 'event_plaza') return [SLOPE, ...SE_GROW];
  return [ISLE_DOCK, { x0: BRIDGE.x - BRIDGE.w / 2, x1: BRIDGE.x + BRIDGE.w / 2, z0: BRIDGE.z0, z1: BRIDGE.z1 }];
}

/* ---------------- 地面 ---------------- */

const seg = (x: number, z: number, ax: number, az: number, bx: number, bz: number): number => {
  const dx = bx - ax;
  const dz = bz - az;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

/** 南门外的连接段和沿墙步道（两种用途共用）；old = 刚清出来 */
function paintSouthWalk(g: PaintTarget, old: boolean): void {
  const S = SOUTH_GATE;
  g.paintRect(-38.5, -34.5, S.z - 1.2, SOUTH_WALK.z1, (x, z, _c, i, j) => pathAt(x, z, i, j, old));
  g.paintRect(SOUTH_WALK.x0, SOUTH_WALK.x1, SOUTH_WALK.z0, SOUTH_WALK.z1, (x, z, _c, i, j) => pathAt(x, z, i, j, old));
}

/** 高尔夫西段清场：progress 越大，球道刮成土的越多（草、水塘都算） */
function paintCleared(g: PaintTarget, amt: number, keepPond: boolean): void {
  const W = GOLF_WEST;
  g.paintRect(W.x0, W.x1, W.z0, W.z1, (x, z, c, i, j) => {
    const pond = Math.hypot((x - GOLF_POND.x) * 0.6, z - GOLF_POND.z) < 4.5 + fbm(x * 0.08, z * 0.08, 4) * 2;
    if (keepPond && pond) return 0;
    // 一大片一大片地刮（从南门那头往两边推开），边上带一点碎
    const n =
      clamp(Math.abs(x - SOUTH_GATE.x) / 40, 0, 1) * 0.55 +
      fbm(x * 0.05, z * 0.05, 122) * 0.4 +
      hash(i >> 1, j >> 1, 121) * 0.05;
    if (n > amt) return 0;
    // 推土机的履带印：沿 x 的两道深一点的土
    const track = Math.abs(((z + 200) % 3.4) - 1.7) < 0.25;
    if (pond) return hash(i, j, 123) > 0.5 ? LC.mud : LC.mud2;
    const v = hash(i, j, 124) > 0.6 ? C.dirt : C.sand2;
    return track ? mixP(v, LC.mud2, 0.35) : mixP(c, v, 0.85);
  });
}

function paintPlot(g: PaintTarget, plot: Plot, L: PlotLook): void {
  if (L.state === 'locked' || !L.variant) return;
  const open = L.state === 'open';
  const p = open ? 1 : L.p;
  if (plot === 'golf_west') {
    const W = GOLF_WEST;
    if (L.variant === 'south_courts') {
      paintCleared(g, open ? 1 : step(p, 0.2, 0.28) * 1.1, false);
      // 填塘：泥塘一格格填成平整的土
      if (!open && p > 0.28) {
        const f = step(p, 0.28, 0.35);
        g.paintRect(GOLF_POND.x - 12, GOLF_POND.x + 12, GOLF_POND.z - 7, GOLF_POND.z + 7, (x, z, _c, i, j) => {
          const pond = Math.hypot((x - GOLF_POND.x) * 0.6, z - GOLF_POND.z) < 4.5 + fbm(x * 0.08, z * 0.08, 4) * 2;
          if (!pond || hash(i >> 1, j >> 1, 135) > f) return 0;
          return hash(i, j, 136) > 0.6 ? C.dirt : C.sand2;
        });
      }
      if (open || p > 0.35)
        g.paintRect(W.x0 + 0.4, W.x1 - 1, 58.6, 78.6, (x, z, c, i, j) =>
          open ? lawnAt(x, z, i, j) : p > 0.75 ? mixP(c, lawnAt(x, z, i, j), step(p, 0.75, 0.95)) : 0,
        );
      for (const [F, a] of [
        [F_SC1, 0.35],
        [F_SC2, 0.5],
      ] as const) {
        if (!open && p < a) continue;
        const surf = open ? 1 : step(p, a + 0.2, a + 0.33);
        paintCourtL(g, F, { inner: LC.hardI, outer: LC.hardO, look: surf > 0 ? 'new' : 'pad', fill: surf });
      }
      if (open || p > 0.5) paintSouthWalk(g, !open);
    } else {
      // 绿洲草坪：草皮一条条从西往东铺；塘留着，清干净以后蓄上清水
      paintCleared(g, open ? 1 : step(p, 0, 0.3) * 1.1, true);
      const sod = open ? 2 : step(p, 0.3, 0.75);
      g.paintRect(W.x0, W.x1, W.z0, W.z1 + 0.5, (x, z, c, i, j) => {
        const edge = z > W.z1 - 2.2 + vnoise(x * 0.3, 1, 125) * 1.6 || x < W.x0 + 0.6 + vnoise(z * 0.3, 2, 125) * 1.2;
        if (edge) return 0;
        const pond = Math.hypot((x - GOLF_POND.x) / GOLF_POND.rx, (z - GOLF_POND.z) / GOLF_POND.rz);
        if (pond < 1.18) return 0;
        if ((x - W.x0) / (W.x1 - W.x0) > sod) return 0;
        // 一卷卷草皮的接缝（刚铺的时候看得见）
        const v = lawnAt(x, z, i, j, 3.2);
        return !open && Math.abs(((x + 200) % 2.4) - 1.2) > 1.15 ? mixP(v, c, 0.4) : v;
      });
      // 水塘：石头砌的边、清水、睡莲
      const clean = open ? 1 : step(p, 0.1, 0.3);
      g.paintRect(
        GOLF_POND.x - GOLF_POND.rx - 1.5,
        GOLF_POND.x + GOLF_POND.rx + 1.5,
        GOLF_POND.z - GOLF_POND.rz - 1.5,
        GOLF_POND.z + GOLF_POND.rz + 1.5,
        (x, z, c, i, j) => {
          const e =
            Math.hypot((x - GOLF_POND.x) / GOLF_POND.rx, (z - GOLF_POND.z) / GOLF_POND.rz) +
            (vnoise(x * 0.6, z * 0.6, 126) - 0.5) * 0.08;
          if (e > 1.18) return 0;
          if (e > 1.0)
            return clean > 0.5 ? (hash(Math.floor(x / 0.6), Math.floor(z / 0.6), 127) > 0.5 ? LC.flag : LC.flag2) : 0;
          if (clean <= 0) return 0;
          let v = hash(i >> 1, j >> 1, 128) > 0.9 ? LC.water2 : LC.water;
          if (e > 0.72 && hash(Math.floor(x / 0.8), Math.floor(z / 0.8), 129) > 0.8) v = LC.lily;
          return mixP(c, v, clean);
        },
      );
      // 石板小路：南门 → 塘边一圈 → 三间小屋、小泳池
      if (open || p > 0.22) {
        const ring = (x: number, z: number) =>
          Math.abs(Math.hypot((x - GOLF_POND.x) / (GOLF_POND.rx + 1.6), (z - GOLF_POND.z) / (GOLF_POND.rz + 1.6)) - 1);
        const links: [number, number, number, number][] = [
          [-36.5, 52, -36.5, 61.2],
          [CABINS[0]!.x, CABINS[0]!.z + 2.5, -35.5, 63.5],
          [CABINS[1]!.x, CABINS[1]!.z - 2.5, -34, 70],
          [CABINS[2]!.x, CABINS[2]!.z - 2.5, -21.8, 67.5],
          [-20.5, 64, -22.6, 64.6],
        ];
        g.paintRect(W.x0, W.x1, W.z0 - 1, W.z1, (x, z, _c, i, j) => {
          let on = ring(x, z) < 0.055;
          for (const [ax, az, bx, bz] of links) if (seg(x, z, ax, az, bx, bz) < 0.8) on = true;
          if (!on) return 0;
          const cell = hash(Math.floor((x + 0.3 * Math.floor(z / 0.7)) / 0.7), Math.floor(z / 0.7), 130);
          const gap =
            (x / 0.7 - Math.floor(x / 0.7) < 0.1 || z / 0.7 - Math.floor(z / 0.7) < 0.1) && hash(i, j, 131) > 0.3;
          return gap ? LC.lawn2 : cell > 0.5 ? LC.flag : LC.flag2;
        });
        // 小屋门口的陶砖
        for (const cb of CABINS) {
          const dz = cb.z < GOLF_POND.z ? 1 : -1;
          const z0 = dz > 0 ? cb.z + cb.d / 2 : cb.z - cb.d / 2 - 1.8;
          g.paintRect(cb.x - 1.6, cb.x + 1.6, z0, z0 + 1.8, (x, z) =>
            (Math.floor(x / 0.6) + Math.floor(z / 0.6)) & 1 ? LC.terra : LC.terra2,
          );
        }
      }
      // 小泳池庭院
      const D = OASIS_DECK;
      const P = OASIS_POOL;
      if (open || p > 0.75)
        g.paintRect(D.x0, D.x1, D.z0, D.z1, (x, z, _c, i, j) => {
          const inPool = x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1;
          if (!open && p < 0.85) return inPool ? (hash(i, j, 132) > 0.5 ? LC.mud : LC.mud2) : mixP(C.dirt, LC.pad, 0.4);
          if (inPool) {
            const rim = x < P.x0 + 0.35 || x > P.x1 - 0.35 || z < P.z0 + 0.35 || z > P.z1 - 0.35;
            if (rim) return LC.line;
            return open || p > 0.93 ? (hash(i >> 1, j >> 1, 133) > 0.88 ? LC.water2 : LC.water) : LC.pad2;
          }
          return (Math.floor(x / 0.8) + Math.floor(z / 0.8)) & 1 ? LC.tile : LC.tile2;
        });
      if (open || p > 0.5) paintSouthWalk(g, !open);
    }
    // 东头和还在营业的球道之间一道矮树篱的地面（深绿）
    if (open)
      g.paintRect(W.x1 - 0.6, W.x1 + 0.4, W.z0, W.z1 - 1, (_x, _z, _c, i, j) =>
        hash(i, j, 134) > 0.5 ? C.grassD : C.weed,
      );
    return;
  }
  // se_corner
  if (L.variant === 'event_plaza') {
    // 新长出来的地先铺底色沙漠
    for (const R of SE_GROW)
      g.paintRect(R.x0, R.x1, R.z0, R.z1, (x, z, c, i, j) => {
        if (z < 82 && x < 104) return 0;
        return c ? desertAt(x, z, i, j) : 0;
      });
    // 沿新地边缘一圈松一点的沙（新地看起来是刚堆出来的；启用以后慢慢和老地一样）
    if (!open)
      for (const R of SE_GROW)
        g.paintRect(R.x0, R.x1, R.z0, R.z1, (x, z, c, i, j) => {
          if (z < 82 && x < 104) return 0;
          return c && hash(i >> 1, j >> 1, 140) > 0.7 ? mixP(c, C.sand3, 0.5) : 0;
        });
    // 观赛坡底下：先刮掉旧沥青，启用后铺广场砖
    g.paintRect(SLOPE.x0, SLOPE.x1, SLOPE.z0, SLOPE.z1, (x, z, c, i, j) => {
      if (!open && p < 0.4) return 0;
      if (!open && p < 0.62) return hash(i, j, 141) > 0.5 ? C.dirt : mixP(c, C.sand2, 0.6);
      const d = Math.floor(x / 1.5) + Math.floor(z / 1.5);
      return d & 1 ? C.plaza : C.plaza2;
    });
    // 路：沿岛东边往南，接到新停车场；沥青从北往南一段段铺
    const paved = open ? 1e9 : SE_ROAD.z0 + step(p, 0.86, 0.98) * (SE_ROAD.z1 - SE_ROAD.z0);
    const road = (x: number, z: number, i: number, j: number) => {
      if (z > paved) return hash(i, j, 142) > 0.5 ? C.dirt : C.sand2;
      const mid = Math.abs(x - (SE_ROAD.x0 + SE_ROAD.x1) / 2) < 0.12 && (z + 200) % 3 < 1.5;
      if (mid && open) return LC.line;
      return hash(i, j, 143) > 0.5 ? LC.asph : LC.asph2;
    };
    g.paintRect(88, SE_ROAD.x1, -4, 4, (x, z, _c, i, j) =>
      z > paved ? 0 : x < SE_ROAD.x0 ? (hash(i, j, 144) > 0.5 ? LC.asph : LC.asph2) : road(x, z, i, j),
    );
    g.paintRect(SE_ROAD.x0, SE_ROAD.x1, SE_ROAD.z0, SE_ROAD.z1, (x, z, _c, i, j) => road(x, z, i, j));
    g.paintRect(LOT_NEW.x1, SE_ROAD.x1, LOT_NEW.z0 + 1, LOT_NEW.z0 + 6, (x, z, _c, i, j) =>
      road(x, Math.min(z, SE_ROAD.z1 - 1), i, j),
    );
    if (open || p > 0.92) paintStalls(g, LOT_NEW, open);
    else if (p > 0.3)
      g.paintRect(LOT_NEW.x0, LOT_NEW.x1, LOT_NEW.z0, LOT_NEW.z1, (_x, _z, _c, i, j) =>
        hash(i, j, 145) > 0.5 ? C.dirt : C.sand2,
      );
    // 新地边缘一圈路缘
    if (open)
      g.paintRect(LOT_NEW.x0 - 0.4, LOT_NEW.x1 + 0.4, LOT_NEW.z0 - 0.4, LOT_NEW.z1 + 0.4, (x, z) =>
        inR(LOT_NEW, x, z) || (x > LOT_NEW.x1 && z < LOT_NEW.z0 + 6) ? 0 : LC.curb,
      );
    return;
  }
  // academy_isle：岸上的小路、靠岸的岛面
  const se = SE_ROAD;
  const cx = (se.x0 + se.x1) / 2;
  if (open || p > 0.3) {
    g.paintRect(88, cx + 1.2, -1.2, 1.2, (x, z, _c, i, j) => pathAt(x, z, i, j, !open));
    g.paintRect(cx - 1.2, cx + 1.2, 0, 82, (x, z, _c, i, j) => pathAt(x, z, i, j, !open));
  }
  if (open || p >= DOCK_AT) {
    const fresh = open || p > 0.9;
    g.paintRect(ISLE_DOCK.x0, ISLE_DOCK.x1, ISLE_DOCK.z0, ISLE_DOCK.z1, (x, z, c) =>
      c ? isleTop(x - ISLE_DOCK.x0, z - ISLE_DOCK.z0, fresh) : 0,
    );
    if (open)
      g.paintRect(BRIDGE.x - 1.1, BRIDGE.x + 1.1, ISLE_DOCK.z0, F_ISLE.oz - F_ISLE.hz, (x, z, _c, i, j) =>
        pathAt(x, z, i, j, false),
      );
  }
}

/* ---------------- 节点 ---------------- */

type B = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number };
const bx = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): B => ({ x0, x1, z0, z1, y0, y1 });

/** 施工围挡：沿一个矩形的几条边（sides 里 n/e/s/w），留出 gaps 附近的口子 */
function fenceAround(K: SiteKit, R: Rect, sides: string, gaps: readonly (readonly [number, number])[] = []): void {
  const edges: [string, number, number, number, number][] = [
    ['n', R.x0, R.z0, R.x1, R.z0],
    ['e', R.x1, R.z0, R.x1, R.z1],
    ['s', R.x0, R.z1, R.x1, R.z1],
    ['w', R.x0, R.z0, R.x0, R.z1],
  ];
  for (const [s, ax, az, bx2, bz] of edges) {
    if (!sides.includes(s)) continue;
    const len = Math.hypot(bx2 - ax, bz - az);
    const n = Math.max(1, Math.round(len / 5));
    for (let i = 0; i < n; i++) {
      const a = i / n;
      const b = (i + 1) / n;
      const sx = ax + (bx2 - ax) * a;
      const sz = az + (bz - az) * a;
      const ex = ax + (bx2 - ax) * b;
      const ez = az + (bz - az) * b;
      if (gaps.some((g) => Math.hypot(g[0] - (sx + ex) / 2, g[1] - (sz + ez) / 2) < 3)) continue;
      K.add(bx(Math.min(sx, ex), Math.max(sx, ex) + 0.05, Math.min(sz, ez), Math.max(sz, ez) + 0.05, 0, 1.2), (r) =>
        siteFence(r, sx, sz, ex, ez),
      );
    }
  }
}

function mat(K: SiteKit, x: number, z: number, kind: 'bricks' | 'pipes' | 'roll' | 'pallet'): void {
  K.add(bx(x - 1.6, x + 1.6, z - 0.7, z + 0.7, 0, 1.4), (r) => materials(r, x, z, kind));
}

function digger(K: SiteKit, x: number, z: number, dir: 1 | -1): void {
  K.cast({ x0: x - 1.2, x1: x + 1.2, z0: z - 1, z1: z + 1, h: 1.6 });
  K.add(bx(x - 1.5, x + 1.5, z - 1.2, z + 1.2, 0, 3), (r) => excavator(r, x, z, dir));
}

function courtLights(
  K: SiteKit,
  F: { ox: number; oz: number; hx: number; hz: number },
  on: boolean,
  broken: boolean,
): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      K.lightPole(F.ox + sx * (F.hx + 0.7), F.oz + sz * (F.hz + 0.7), 8, {
        on,
        broken,
        lx: F.ox + sx * F.hx * 0.5,
        lz: F.oz + sz * F.hz * 0.4,
        r: 12,
        i: 0.7,
      });
}

/** 南场：两片新硬地、围网和挡风布、球网、灯，沿南墙的步道和棕榈 */
function southCourts(K: SiteKit, L: PlotLook): void {
  const open = L.state === 'open';
  const p = open ? 1 : L.p;
  const W = GOLF_WEST;
  if (!open) {
    fenceAround(K, { x0: W.x0 + 0.6, x1: W.x1 - 0.4, z0: W.z0 + 0.8, z1: W.z1 - 0.6 }, 'esw');
    if (p < 0.3) mat(K, -41.5, 54.5, 'bricks');
    if (p > 0.15 && p < 0.33) {
      K.sandPile(-26, 62, 2.2);
      K.sandPile(-33, 70, 1.6);
    }
    if (p > 0.15 && p < 0.45) digger(K, -27, 66, -1);
    if (p >= 0.35 && p < 0.9) {
      mat(K, -55, 56.6, 'pallet');
      mat(K, -8, 56.6, 'pipes');
      mat(K, -20, 56.6, 'roll');
      mat(K, -44, 56.6, 'roll');
    }
    for (const [x, z] of [
      [-36.5, 54],
      [-34, 57.5],
      [-39, 57.5],
    ] as const)
      K.cone(x, z);
    if (p > 0.9) courtLights(K, F_SC1, false, true);
    if (p > 0.94) courtLights(K, F_SC2, false, true);
    if (p > 0.96)
      K.fenceRect(
        F_SC1.ox - F_SC1.hx,
        F_SC1.ox + F_SC1.hx,
        F_SC1.oz - F_SC1.hz,
        F_SC1.oz + F_SC1.hz,
        3,
        [[F_SC1.ox + F_SC1.hx - 2.5, F_SC1.oz - F_SC1.hz]],
        false,
        2101,
      );
    return;
  }
  for (const [F, seed, gx] of [
    [F_SC1, 2101, F_SC1.ox + F_SC1.hx - 2.5],
    [F_SC2, 2102, F_SC2.ox - F_SC2.hx + 2.5],
  ] as const) {
    K.fenceRect(F.ox - F.hx, F.ox + F.hx, F.oz - F.hz, F.oz + F.hz, 3, [[gx, F.oz - F.hz]], false, seed, true);
    K.net(F);
    courtLights(K, F, true, false);
  }
  // 沿墙步道边的棕榈和长凳，南门两边各一盏路灯
  for (const x of [-58, -48, -26, -14, -6]) K.palm(x, 54.2, 8.5 + hash(x | 0, 54, 150) * 2.5, { up: true });
  K.add(bx(-33, -30, 57.8, 58.6, 0, 0.6), (r) => bench(r, -31.5, 58.2, 'x'));
  K.lamp(-39.4, 54, true);
  K.lamp(-33.6, 54, true);
  K.lamp(-20, 58.2, true);
  K.lamp(-52, 58.2, true);
  hedge(K);
}

/** 和还在营业的高尔夫之间一道矮树篱 */
function hedge(K: SiteKit): void {
  const x = GOLF_WEST.x1 - 0.1;
  for (let z = GOLF_WEST.z0 + 0.5; z < GOLF_WEST.z1 - 1.5; z += 2.2) {
    const zz = z;
    K.add(bx(x - 0.5, x + 0.5, zz, zz + 2.2, 0, 1.1), (r) => {
      const lit = r.litAt(x, zz);
      r.box(x - 0.45, x + 0.45, zz, zz + 2.1, 0, 0.95 + hash(zz | 0, 3, 151) * 0.2, '#4f8f3a', { lit, top: '#5fa846' });
    });
  }
}

/** 绿洲草坪：三间小屋、小泳池庭院、塘边一圈棕榈和路灯 */
function oasisLawn(K: SiteKit, L: PlotLook): void {
  const open = L.state === 'open';
  const p = open ? 1 : L.p;
  const W = GOLF_WEST;
  CABINS.forEach((cb, i) => {
    const built = open ? 1 : step(p, 0.3 + i * 0.1, 0.55 + i * 0.1);
    if (built <= 0) return;
    const face = cb.z < GOLF_POND.z ? 1 : -1;
    if (built >= 0.85)
      K.cast({ x0: cb.x - cb.w / 2, x1: cb.x + cb.w / 2, z0: cb.z - cb.d / 2, z1: cb.z + cb.d / 2, h: 3.4 });
    K.add(
      bx(cb.x - cb.w / 2 - 0.4, cb.x + cb.w / 2 + 0.4, cb.z - cb.d / 2 - 0.4, cb.z + cb.d / 2 + 0.4, 0, 4.6),
      (r) => {
        cabin(r, cb.x, cb.z, cb.w, cb.d, { built, face });
        if (open) porchGlow(r, cb.x, 1.6, face > 0 ? cb.z + cb.d / 2 + 0.3 : cb.z - cb.d / 2 - 0.3);
      },
    );
    if (open) K.lampAt({ x: cb.x, z: cb.z + face * (cb.d / 2 + 1), r: 4, i: 0.5 });
  });
  const P = OASIS_POOL;
  if (open || p > 0.96) {
    K.umbrella(P.x0 - 1.8, P.z0 + 0.6, 1.2, '#e2463c', '#ffffff');
    K.umbrella(P.x1 + 2, P.z1 + 1.2, 1.2, '#2f7fd8', '#ffffff');
    for (const x of [P.x0 + 1, P.x0 + 2.6, P.x0 + 4.2])
      K.add(bx(x - 0.4, x + 0.4, P.z1 + 0.6, P.z1 + 2.6, 0, 0.9), (r) => lounger(r, x, P.z1 + 1.6));
  }
  // 塘边一圈棕榈
  if (open || p > 0.7)
    for (let a = 0; a < 6; a++) {
      const ang = 0.4 + (a / 6) * Math.PI * 2;
      const x = GOLF_POND.x + Math.cos(ang) * (GOLF_POND.rx + 2.6);
      const z = GOLF_POND.z + Math.sin(ang) * (GOLF_POND.rz + 2.2);
      if (Math.abs(x + 36.5) < 2 && z < GOLF_POND.z) continue;
      K.palm(x, z, 8 + hash(a, 7, 152) * 3, { up: open, half: !open });
    }
  if (open) {
    for (const [x, z] of [
      [-60, 58],
      [-58, 76],
      [-4, 61],
      [-3, 78],
      [-24, 76],
    ] as const)
      K.palm(x, z, 9 + hash(x | 0, z | 0, 153) * 2, { up: true });
    K.lamp(-37.8, 59, true);
    K.lamp(-24, 62, true);
    K.lamp(-38, 71, true);
    K.stringLights(
      [
        [OASIS_DECK.x0, OASIS_DECK.z0],
        [OASIS_DECK.x1, OASIS_DECK.z0],
        [OASIS_DECK.x1, OASIS_DECK.z1],
      ],
      true,
      3,
    );
    hedge(K);
    return;
  }
  fenceAround(K, { x0: W.x0 + 0.6, x1: W.x1 - 0.4, z0: W.z0 + 0.8, z1: W.z1 - 0.6 }, 'esw');
  if (p < 0.3) mat(K, -41.5, 54.5, 'bricks');
  if (p > 0.15 && p < 0.6) digger(K, -16, 61.5, 1);
  if (p > 0.25 && p < 0.9) {
    mat(K, -52, 56.6, 'pallet');
    mat(K, -12, 56.6, 'bricks');
    K.planks(-44, 57);
  }
  K.cone(-36.5, 54);
  K.cone(-34, 57.5);
}

/** 赛事广场：观赛坡、大遮阳棚、大屏；新地上的停车场、路、棕榈 */
function eventPlaza(K: SiteKit, L: PlotLook): void {
  const open = L.state === 'open';
  const p = open ? 1 : L.p;
  const S = SLOPE;
  // 观赛坡：五级台阶朝北看大屏
  const rise = open ? 1 : step(p, 0.4, 0.62);
  const grass = open || p > 0.78;
  if (rise > 0)
    for (let i = 0; i < 5; i++) {
      const z0 = 10 + i * 3.2;
      const h = 0.38 * (i + 1) * rise;
      K.cast({ x0: S.x0 + 0.8, x1: S.x1 - 0.8, z0, z1: z0 + 3.2, h });
      K.add(bx(S.x0 + 0.8, S.x1 - 0.8, z0, z0 + 3.2, 0, h), (r) =>
        terrace(r, S.x0 + 0.8, S.x1 - 0.8, z0, z0 + 3.2, h, grass),
      );
    }
  const C0 = { x0: S.x0 + 2.5, x1: S.x1 - 2.5, z0: 12, z1: 24.5 };
  const masts = open ? 1 : step(p, 0.55, 0.72);
  const sail = open ? 1 : step(p, 0.72, 0.85);
  if (masts > 0) {
    if (sail > 0.5) K.cast({ x0: C0.x0, x1: C0.x1, z0: C0.z0 + 2, z1: C0.z1, h: 4 });
    K.add(bx(C0.x0 - 2, C0.x1 + 2, C0.z0 - 1.5, C0.z1 + 1.5, 0, 8.5), (r) => canopy(r, C0, masts, sail));
  }
  if (open || p > 0.9) {
    K.add(bx(70, 82, 6.4, 7.2, 0, 6.4), (r) => bigScreen(r, 70, 82, 7.2, open));
    K.cast({ x0: 70, x1: 82, z0: 6.6, z1: 7.2, h: 5 });
  }
  if (open) {
    // 台阶上铺着几块野餐毯（看大屏的人留下的；颜色和位置按自己的种子，坐的人由演出另算）
    const BL = ['#d65a5a', '#f6e27a', '#5a8fd6', '#f6f3ea', '#ef8f5a', '#7bc47f'];
    for (let n = 0; n < 9; n++) {
      const i = n % 5;
      const z0 = 10 + i * 3.2 + 0.7;
      const h = 0.38 * (i + 1);
      const x = S.x0 + 2 + hash(n, 1, 171) * (S.x1 - S.x0 - 6);
      const c = BL[Math.floor(hash(n, 2, 171) * BL.length)] as string;
      K.add(bx(x, x + 1.8, z0, z0 + 1.4, h, h + 0.05), (r) => {
        const lit = r.litAt(x + 0.9, z0 + 0.7);
        const a = r.col(c, 1, lit);
        const b2 = r.col('#f6f3ea', 1, lit);
        r.wpoly(
          [
            [x, h + 0.02, z0],
            [x + 1.8, h + 0.02, z0],
            [x + 1.8, h + 0.02, z0 + 1.4],
            [x, h + 0.02, z0 + 1.4],
          ],
          a,
          (px, py) => ((((px >> 1) + (py >> 1)) & 1) === 0 ? b2 : a),
        );
      });
    }
    K.lampAt({ x: (C0.x0 + C0.x1) / 2, z: 18, r: 10, i: 0.6 });
    for (const x of [S.x0 + 0.6, S.x1 - 0.6]) K.flag(x, 8.4, 4.5, '#6a4fa0', '#6a4fa0');
  }
  // 新地：停车场的车、灯杆、棕榈
  const N = LOT_NEW;
  if (open) {
    const carCols = ['#e2463c', '#ffffff', '#2f7fd8', '#f0c53c', '#3a3f47', '#c0c4cc', '#3fb37f', '#7a4fd0', '#ff8a3d'];
    for (const row of [N.z0 + 2.6, N.z1 - 2.6])
      for (let i = 0; i < 11; i++) {
        const x = N.x0 + 1.6 + i * 2.8;
        const h = hash(i, row | 0, 160);
        if (h < 0.72) K.car(x, row, carCols[Math.floor(h * 97) % carCols.length] as string, false);
      }
    K.lightPole(N.x0 + 9, (N.z0 + N.z1) / 2, 8, { on: true, r: 12, i: 0.75 });
    K.lightPole(N.x1 - 9, (N.z0 + N.z1) / 2, 8, { on: true, r: 12, i: 0.75 });
  }
  for (const [x, z] of [
    [108, 72],
    [109, 79],
    [107.5, 86],
    [96, 84],
    [104.5, 40],
    [104.5, 58],
  ] as const)
    if (open || p > 0.7) K.palm(x, z, 9 + hash(x | 0, z | 0, 161) * 2.5, { up: open, half: !open });
  if (!open) {
    fenceAround(K, { x0: S.x0, x1: S.x1, z0: S.z0, z1: S.z1 }, 'nesw', [[66, S.z0]]);
    if (p < 0.6) digger(K, 80, 16, -1);
    if (p > 0.2 && p < 0.9) {
      mat(K, 92, 30, 'pallet');
      mat(K, 92, 34, 'pipes');
      mat(K, 92, 38, 'bricks');
    }
    if (p >= EP_GROW && p < 0.45)
      for (let i = 0; i < 8; i++) {
        const x = 68 + i * 4;
        K.add(bx(x - 0.2, x + 0.2, 99 - 0.2, 99 + 0.2, 0, 1), (r) => stake(r, x, 99));
        K.add(bx(111 - 0.2, 111 + 0.2, 68 + i * 3 - 0.2, 68 + i * 3 + 0.2, 0, 1), (r) => stake(r, 111, 68 + i * 3));
      }
    K.cone(97, 2.5);
    K.cone(97, -2.5);
  }
}

/** 学院岛：长桥、宿舍、练习场（旧网柱上挂新网）、棕榈和路灯 */
function academyIsle(K: SiteKit, L: PlotLook): void {
  const open = L.state === 'open';
  const p = open ? 1 : L.p;
  const B = BRIDGE;
  // 岸边的桥头（一开工就有）
  K.add(bx(B.x - 2.2, B.x + 2.2, B.z0 - 1.5, B.z0, 0, 1.4), (r) => {
    const lit = r.litAt(B.x, B.z0);
    for (const sx of [-1, 1])
      r.box(B.x + sx * 1.7 - 0.35, B.x + sx * 1.7 + 0.35, B.z0 - 1.2, B.z0 - 0.4, 0, 1.3, '#b9a07a', { lit });
  });
  if (!open && p < DOCK_AT) {
    mat(K, 96, 78, 'pallet');
    mat(K, 104, 78, 'pipes');
    K.cone(98, 80);
    K.cone(102, 80);
    return;
  }
  const len = open ? 1 : step(p, DOCK_AT, 0.55);
  K.add(bx(B.x - B.w / 2 - 0.3, B.x + B.w / 2 + 0.3, B.z0, B.z1, -9, 2.4), (r) =>
    bridge(r, B.x, B.z0, B.z1, B.w, len, open),
  );
  if (open) for (const z of [B.z0 + 0.4, B.z1 - 0.4]) K.lampAt({ x: B.x, z, r: 4.5, i: 0.6 });
  const D = DORM;
  const built = open ? 1 : step(p, 0.55, 0.85);
  if (built > 0) {
    if (built >= 0.7) K.cast({ x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1, h: 6.5 });
    K.add(bx(D.x0 - 1, D.x1 + 1, D.z0 - 1, D.z1 + 1.4, 0, 8), (r) => {
      dorm(r, D, built);
      if (open) porchGlow(r, (D.x0 + D.x1) / 2, 2, D.z1 + 0.5);
    });
  }
  const F = F_ISLE;
  const N = ISLE_NET;
  if (open) {
    K.fenceRect(F.ox - F.hx, F.ox + F.hx, F.oz - F.hz, F.oz + F.hz, 3, [[B.x, F.oz - F.hz]], false, 2201, true);
    K.add(bx(F.ox - 0.1, F.ox + 0.1, ISLE_DOCK.z0 + N.v0, ISLE_DOCK.z0 + N.v1, 0, 1.2), (r) =>
      netPosts(r, ISLE_DOCK.x0 + N.u, ISLE_DOCK.z0 + N.v0, ISLE_DOCK.z0 + N.v1, 0, { net: 'new' }),
    );
    for (const [x, z] of [
      [88.5, 96.5],
      [96, 96],
      [115, 120 - 3],
      [87.5, 116],
    ] as const)
      K.palm(x, z, 8 + hash(x | 0, z | 0, 170) * 2.5, { up: true });
    K.lamp(98.6, 101.5, true);
    K.add(bx(95.6, 97.4, 100.6, 101.4, 0, 0.6), (r) => bench(r, 96.5, 101, 'x'));
  } else {
    // 旧网柱还立着；脚手架、材料
    K.add(bx(F.ox - 0.1, F.ox + 0.1, ISLE_DOCK.z0 + N.v0, ISLE_DOCK.z0 + N.v1, 0, 1.2), (r) =>
      netPosts(r, ISLE_DOCK.x0 + N.u, ISLE_DOCK.z0 + N.v0, ISLE_DOCK.z0 + N.v1, 0, { net: 'torn' }),
    );
    mat(K, 92, 98, 'bricks');
    mat(K, 96, 100, 'pallet');
    if (p > 0.6) mat(K, 108, 104.5, 'pipes');
    K.cone(99, 95.2);
  }
}
