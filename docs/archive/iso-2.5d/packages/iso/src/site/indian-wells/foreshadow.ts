import { floatingIsle, netPosts, oldPin, puff, southGate, tuft } from '../../art/land/pieces';
import { clamp, fbm, hash, mixP, mulP, nightP, ph, vnoise } from '../../core/color';
import { Custom, type DrawContext, type Node } from '../../core/graph';
import { unprojector } from './kit';
import { F_ISLE, GOLF_POND, GOLF_WEST, ISLE_DOCK, ISLE_SKY, LOT_S, SE_ROAD, SOUTH_GATE } from './layout';

/**
 * 地图长大的伏笔（ADR 0021，从 ★0 起就在画面里）和新地画面层的"挂钩"：
 *
 * - 西步道断头处砌死的南门（南墙从西数第 5 段换成一道砖砌的旧门）；
 * - 高尔夫西段一周比一周荒（golfDecay 0..1：草黄、沙漫进来、水塘缩出泥边、旗杆倒下）；
 * - 东南天上一座浮着的小岛，上面两根锈了的旧网柱。
 *
 * 这些东西的样子跟着地块的状态变（南门拆开、小岛靠岸、停车场让位），状态放在模块里的 FORE
 * （一页只有一座 Palm Oasis；画面层读它，land.ts 写它）。原来那座岛的随机流一点不动：
 * 南门和小岛是 build.ts 最后追加的节点，荒草是 ground.ts 最后追加的一遍；只有这几处像素是有意改的。
 *
 * 地面挂钩：paintGround 画完会调 afterPaintGround(g)——先把新地会改到的那几块地面存一份底（setGroundPass 之前也存），
 * 再画伏笔，再画登记过的新地（land.ts）。新地状态变了用 repaintLand(g) 从存的底重来，不用整张重画。
 * 这个文件不引用 ground.ts / build.ts（它们引用它），避免成环。
 */

type Rect = { x0: number; x1: number; z0: number; z1: number };
/** 地面画笔（ground.ts 的 GroundLike，这里按结构写一遍） */
export interface PaintTarget {
  paintRect(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    fn: (x: number, z: number, c: number, i: number, j: number) => number,
  ): void;
}

export interface ForeLook {
  /** 高尔夫西段荒到几成（0 第一天，1 全枯） */
  decay: number;
  /** 南门：砖还剩几成、新铁门、门柱灯 */
  gate: { bricks: number; iron: boolean; lamps: boolean };
  /** 高尔夫西段：golf 还是球场（一周比一周荒）、building 在清场（荒草按全枯画，由 land.ts 一块块刮掉）、taken 新地画完了 */
  golf: 'golf' | 'building' | 'taken';
  /** 浮空小岛：show = false 时它已经靠岸，由地台和 land.ts 画；x0、z0 是岛的西北角，y 是顶面高 */
  isle: { show: boolean; x0: number; z0: number; y: number };
  /** 这些范围里原来的静态节点不画（停车场让位、修路） */
  hide: Rect[];
  /** 地台现在的几块矩形（land.ts 写，别的画面层可以查；空 = 只有基础地台） */
  slab: Rect[];
}

/**
 * 浮空小岛在天上的位置：在 layout 的 ISLE_SKY 上再往东南推一段（默认竖屏镜头里，原位置的岛正好贴着
 * 东南角地台的下沿，底下的尖看着像地台倒挂下来的一块；推开以后四个转角都是一座离岸浮着的小岛）
 */
export const ISLE_FLOAT = {
  x0: ISLE_SKY.x0 + 16,
  x1: ISLE_SKY.x1 + 16,
  z0: ISLE_SKY.z0 + 16,
  z1: ISLE_SKY.z1 + 16,
  y: ISLE_SKY.y,
} as const;

const defaults = (): ForeLook => ({
  decay: 0,
  gate: { bricks: 1, iron: false, lamps: false },
  golf: 'golf',
  isle: { show: true, x0: ISLE_FLOAT.x0, z0: ISLE_FLOAT.z0, y: ISLE_FLOAT.y },
  hide: [],
  slab: [],
});

export const FORE: ForeLook = defaults();

/** 回到第一天的样子（测试、读档） */
export function resetForeshadow(): void {
  Object.assign(FORE, defaults());
}

/** 第几周 → 高尔夫西段荒到几成：第 1 周 0，往后每周一成，第 11 周起全枯 */
export function golfDecayForWeek(week: number): number {
  return clamp((week - 1) / 10, 0, 1);
}

/* ---------------- 地面 ---------------- */

/** 新地和伏笔会改到的地面（存底、还原只碰这几块） */
const SNAP_REGIONS: readonly Rect[] = [
  { x0: GOLF_WEST.x0 - 2, x1: GOLF_WEST.x1 + 2, z0: SOUTH_GATE.z - 4, z1: 82 },
  { x0: 58, x1: 104, z0: -6, z1: 82 },
];
const TS = 0.2;

interface Snap {
  rs: { R: Rect; W: number; px: Uint32Array }[];
}
const SNAPS = new WeakMap<object, Snap>();
const PASSES = new WeakMap<object, (g: PaintTarget) => void>();

function capture(g: PaintTarget): void {
  const rs = SNAP_REGIONS.map((R) => {
    const W = Math.ceil((R.x1 - R.x0) / TS);
    const Hh = Math.ceil((R.z1 - R.z0) / TS);
    const px = new Uint32Array(W * Hh);
    g.paintRect(R.x0, R.x1, R.z0, R.z1, (x, z, c) => {
      const i = Math.floor((x - R.x0) / TS);
      const j = Math.floor((z - R.z0) / TS);
      if (i >= 0 && j >= 0 && i < W && j < Hh) px[j * W + i] = c;
      return 0;
    });
    return { R, W, px };
  });
  SNAPS.set(g, { rs });
}

function restore(g: PaintTarget): void {
  const s = SNAPS.get(g);
  if (!s) return;
  for (const { R, W, px } of s.rs)
    g.paintRect(R.x0, R.x1, R.z0, R.z1, (x, z) => {
      const i = Math.floor((x - R.x0) / TS);
      const j = Math.floor((z - R.z0) / TS);
      return i >= 0 && j >= 0 && i < W ? ((px[j * W + i] as number) ?? 0) : 0;
    });
}

/** paintGround 的最后一步（ground.ts 调）：存底 → 伏笔 → 新地 */
export function afterPaintGround(g: PaintTarget): void {
  capture(g);
  paintForeshadowGround(g);
  PASSES.get(g)?.(g);
}

/** 新地或伏笔的状态变了：从存的底重画这几块（没存过底就什么也不还原，直接画上去） */
export function repaintLand(g: PaintTarget): void {
  restore(g);
  paintForeshadowGround(g);
  PASSES.get(g)?.(g);
}

/** 登记这块地面上的新地画法（land.ts）；null 取消 */
export function setGroundPass(g: PaintTarget, fn: ((g: PaintTarget) => void) | null): void {
  if (fn) PASSES.set(g, fn);
  else PASSES.delete(g);
}

// 高尔夫的颜色（同 ground.ts 的 C.golf / golf2 / rough / green / bunk / pond / pond2）
const G = {
  golf: ph('#82c85b'),
  golf2: ph('#78bf53'),
  rough: ph('#6aa94b'),
  green: ph('#9bdc70'),
  pond: ph('#4fb6d8'),
  pond2: ph('#7fd0ea'),
  sand: ph('#e9c999'),
  sand2: ph('#dfba86'),
  tired: ph('#a9b65a'),
  straw: ph('#c8b36a'),
  dead: ph('#b59757'),
  dead2: ph('#a3874c'),
  mud: ph('#9c8a62'),
  algae: ph('#6fae8a'),
  path: ph('#d6bb8e'),
  paver: ph('#e6dcc4'),
  paver2: ph('#d9ccb0'),
  joint: ph('#b89c70'),
  peb: ph('#c9a676'),
} as const;
const GRASS = new Set<number>([G.golf, G.golf2, G.rough, G.green]);
const POND = new Set<number>([G.pond, G.pond2]);

/** 伏笔的地面：高尔夫西段的荒草和泥边、砌死的南门两边的积沙和门外埋在沙里的旧路 */
export function paintForeshadowGround(g: PaintTarget): void {
  const t = FORE.golf === 'building' ? Math.max(FORE.decay, 0.9) : FORE.decay;
  if (FORE.golf !== 'taken') {
    const W = GOLF_WEST;
    g.paintRect(W.x0, W.x1, W.z0, W.z1 + 1, (x, z, c, i, j) => {
      const west = clamp((W.x1 - x) / (W.x1 - W.x0), 0, 1);
      const n = fbm(x * 0.06, z * 0.06, 91);
      // 西边先荒；东头靠着还在营业的球道，最后才黄
      const d = t * 1.25 + west * 0.45 - 0.55 + (n - 0.5) * 0.9 - clamp((x - (W.x1 - 6)) / 6, 0, 1) * 0.4;
      if (GRASS.has(c)) {
        if (d <= 0) return 0;
        let v = mixP(c, G.tired, clamp(d * 3, 0, 1) * 0.75);
        if (d > 0.35) v = mixP(v, G.straw, clamp((d - 0.35) * 3, 0, 1) * 0.85);
        if (d > 0.7) v = mixP(v, hash(i, j, 94) > 0.5 ? G.dead : G.dead2, clamp((d - 0.7) * 3, 0, 1) * 0.8);
        // 沙从南边、西边漫进来（沙坑没人耙，越来越大）
        const s = fbm(x * 0.1, z * 0.1, 93) + (z - 70) * 0.012 + west * 0.06;
        if (s > 0.86 - t * 0.26)
          v = mixP(v, hash(i, j, 95) > 0.7 ? G.sand2 : G.sand, clamp((s - (0.86 - t * 0.26)) * 6, 0, 0.9));
        if (hash(i, j, 96) > 0.993 - t * 0.01) v = G.peb;
        return v;
      }
      if (POND.has(c)) {
        // 水塘缩出一圈泥边，水发绿
        const e = Math.hypot((x - GOLF_POND.x) * 0.6, z - GOLF_POND.z) / 4.5;
        const edge = vnoise(x * 0.5, z * 0.5, 97) * 0.15;
        if (t > 0.3 && e + edge > 1.3 - (t - 0.3) * 0.7) return hash(i, j, 98) > 0.6 ? mulP(G.mud, 0.92) : G.mud;
        return mixP(c, G.algae, t * 0.45);
      }
      return 0;
    });
  }
  // 南门：门里边的步道尽头积了沙；门外一段旧路埋在沙里
  const S = SOUTH_GATE;
  if (FORE.gate.bricks > 0.5 && FORE.golf === 'golf') {
    g.paintRect(S.x0 + 0.6, S.x1 - 0.6, S.z - 2.6, S.z - 0.3, (x, z, c) => {
      const d = (z - (S.z - 2.6)) / 2.3 + (vnoise(x * 0.8, z, 99) - 0.5) * 0.5;
      return d > 0.45 ? mixP(c, G.sand, clamp((d - 0.45) * 2, 0, 0.85)) : 0;
    });
    g.paintRect(S.x0 + 0.8, S.x1 - 0.8, S.z + 0.3, S.z + 6, (x, z, c) => {
      const fade = (z - S.z) / 6 + (fbm(x * 0.3, z * 0.3, 100) - 0.5) * 0.6;
      if (fade > 0.75) return 0;
      // 旧铺地砖：一块块（0.6 米），砖缝里是沙
      const gap = x / 0.6 - Math.floor(x / 0.6) < 0.18 || z / 0.6 - Math.floor(z / 0.6) < 0.18;
      const k = hash(Math.floor(x / 0.6), Math.floor(z / 0.6), 101);
      if (k < 0.18) return 0;
      const v = gap ? G.joint : k > 0.6 ? G.paver : G.paver2;
      return mixP(v, c, clamp(fade * 0.9, 0, 0.85));
    });
  }
}

/* ---------------- 静态节点 ---------------- */

/** 浮空小岛的顶面：沙、几丛草、一块荒了的旧练习场（褪色的场地和白线、裂缝、积沙）。u、v 是离岛西北角多少米 */
export function isleTop(u: number, v: number, fresh: boolean): number {
  const i = Math.floor(u / TS);
  const j = Math.floor(v / TS);
  const cu = u - (F_ISLE.ox - ISLE_DOCK.x0);
  const cv = v - (F_ISLE.oz - ISLE_DOCK.z0);
  const au = Math.abs(cu);
  const av = Math.abs(cv);
  // 岛边一圈沙和草
  const n = fbm(u * 0.15, v * 0.15, 111);
  let base: number = n < 0.42 ? G.sand2 : n > 0.62 ? ph('#a9b65a') : G.sand;
  if (hash(i, j, 112) > 0.985) base = G.peb;
  if (au > F_ISLE.hx || av > F_ISLE.hz) return base;
  const L = 11.885;
  const Wd = 5.485;
  const Ws = 4.115;
  const lw = 0.11;
  let c = au <= L && av <= Wd ? ph('#4fa760') : ph('#3b7f8c');
  if (
    (au <= L + lw && (Math.abs(av - Wd) < lw || Math.abs(av - Ws) < lw)) ||
    (av <= Wd + lw && Math.abs(au - L) < lw) ||
    (av <= Ws && Math.abs(au - 6.4) < lw) ||
    (au <= 6.4 && av < lw)
  )
    c = ph('#f6f3ea');
  if (fresh) return c;
  c = mixP(c, ph('#b3aa9a'), 0.5);
  const d = fbm(u * 0.14, v * 0.14, 113);
  if (d > 0.52) c = mixP(c, G.sand, clamp((d - 0.52) * 4, 0, 0.92));
  if (Math.abs(fbm(u * 0.3, v * 0.3, 114) - 0.5) < 0.014) c = ph('#5e574d');
  if (hash(i, j, 115) > 0.98) c = ph('#7d8f3e');
  return c;
}

/** 浮空小岛上那两根旧网柱的位置（局部坐标同 F_ISLE；靠岸以后 land.ts 在同一处立新网） */
export const ISLE_NET = {
  u: F_ISLE.ox - ISLE_DOCK.x0,
  v0: F_ISLE.oz - ISLE_DOCK.z0 - 6.4,
  v1: F_ISLE.oz - ISLE_DOCK.z0 + 6.4,
} as const;

const W_ISLE = ISLE_DOCK.x1 - ISLE_DOCK.x0;
const D_ISLE = ISLE_DOCK.z1 - ISLE_DOCK.z0;

/** 预先算好的小岛顶面（0.2 米一格） */
let ISLE_TEX: Uint32Array | null = null;
function isleTex(): Uint32Array {
  if (ISLE_TEX) return ISLE_TEX;
  const W = Math.round(W_ISLE / TS);
  const Hh = Math.round(D_ISLE / TS);
  const t = new Uint32Array(W * Hh);
  for (let j = 0; j < Hh; j++)
    for (let i = 0; i < W; i++) t[j * W + i] = isleTop((i + 0.5) * TS, (j + 0.5) * TS, false);
  ISLE_TEX = t;
  return t;
}

const inR = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * 伏笔的静态节点（build.ts 最后追加）：南门、浮空小岛、高尔夫西段倒下的旗杆和风滚草。
 * 画的时候读 FORE（状态变了 land.ts 会 invalidate），所以节点建一次就行。
 */
export function foreshadowStatics(lv: number): Node[] {
  const out: Node[] = [];
  const S = SOUTH_GATE;
  out.push(
    new Custom((r) => southGate(r, S.x0, S.x1, S.z, { lv, ...FORE.gate }), {
      x0: S.x0 - 0.15,
      x1: S.x1 + 0.15,
      z0: S.z - 0.7,
      z1: S.z + 0.7,
      y0: 0,
      y1: 5.2,
    }),
  );
  // 浮空小岛：整个岛（连底下的岩块）都在地面以上，同一条视线上它总在地面前面，不用做遮挡
  const isle = new Custom(
    (r) => {
      const I = FORE.isle;
      if (!I.show) return;
      const R = { x0: I.x0, x1: I.x0 + W_ISLE, z0: I.z0, z1: I.z0 + D_ISLE };
      const tex = isleTex();
      const W = Math.round(W_ISLE / TS);
      const unP = unprojector(r);
      // 远处（岛后面）的一团云先画，近处的两团画在岛上
      const far = r.P(R.x0, 0, R.z0)[1] < r.P(R.x1, 0, R.z1)[1];
      const cl: [number, number, number, number, number][] = [
        [R.x1 + 3, I.y - 9, R.z0 + 4, 12, 3],
        [R.x0 - 2, I.y - 13, R.z1 - 6, 10, 5],
        [R.x0 + 8, I.y - 4, R.z1 + 4, 8, 7],
      ];
      const depthOf = (c: (typeof cl)[number]) => r.P(c[0], 0, c[2])[1];
      const mid = r.P((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2)[1];
      if (I.y > 6) for (const c of cl) if (depthOf(c) < mid === far) puff(r, c[0], c[1], c[2], c[3], c[4]);
      floatingIsle(
        r,
        R,
        I.y,
        // 土层厚度：天上 4.5 米；落到 8 米以下以后慢慢加厚到和地台一样（靠岸那一刻底边对上地台的 7 米，不跳）
        I.y >= 8 ? 4.5 : 4.5 + (I.y + 7.2 - 4.5) * (1 - I.y / 8),
        (x, z) => {
          const i = Math.min(W - 1, Math.max(0, Math.floor((x - R.x0) / TS)));
          const j = Math.max(0, Math.floor((z - R.z0) / TS));
          const v = tex[j * W + i] ?? 0;
          return r.night > 0 ? nightP(v, r.night, 0) : v;
        },
        unP,
      );
      drawIsleProps(r, R.x0, R.z0, I.y);
      if (I.y > 6) for (const c of cl) if (depthOf(c) < mid !== far) puff(r, c[0], c[1], c[2], c[3], c[4]);
    },
    {
      x0: ISLE_FLOAT.x0 - 3,
      x1: ISLE_FLOAT.x1 + 6,
      z0: ISLE_FLOAT.z0,
      z1: ISLE_FLOAT.z1 + 5,
      y0: 0,
      y1: ISLE_FLOAT.y + 3,
    },
  );
  // 包围盒跟着岛走（施工时岛从天上落下、往西北靠岸；固定在天上那个位置的话，镜头转到岸边时岛被裁掉、排序也不对）
  Object.defineProperty(isle, 'bounds', {
    get: () => {
      const I = FORE.isle;
      return { x0: I.x0 - 3, x1: I.x0 + W_ISLE + 6, z0: I.z0, z1: I.z0 + D_ISLE + 5, y0: 0, y1: I.y + 3 };
    },
    set: () => {},
    configurable: true,
  });
  isle.name = 'foreshadow:isle';
  out.push(isle);
  // 高尔夫西段：关掉的洞，旗杆一周比一周歪；荒到一半起有风滚草
  out.push(
    new Custom(
      (r) => {
        if (FORE.golf !== 'golf') return;
        const t = FORE.decay;
        oldPin(r, -50, 65, clamp(0.15 + t * 0.9, 0, 1));
        oldPin(r, -14, 69, clamp(t * 1.2 - 0.3, 0, 1));
      },
      { x0: -51, x1: -12, z0: 64, z1: 70, y0: 0, y1: 2.5 },
    ),
  );
  for (const [x, z, k] of [
    [-58, 60, 0.35],
    [-44, 72, 0.55],
    [-22, 58, 0.75],
  ] as const)
    out.push(
      new Custom(
        (r) => {
          if (FORE.golf !== 'golf' || FORE.decay < k) return;
          tuft(r, x, z, true);
          tuft(r, x + 0.8, z + 0.4, true);
        },
        { x0: x - 0.6, x1: x + 1.4, z0: z - 0.6, z1: z + 1, y0: 0, y1: 1 },
      ),
    );
  return out;
}

/** 小岛上的东西（浮着的时候）：两根旧网柱挂破网、一棵枯棕榈的树桩、几丛草 */
function drawIsleProps(r: DrawContext, x0: number, z0: number, y: number): void {
  const N = ISLE_NET;
  // 远的先画
  const items: [number, () => void][] = [
    [
      r.P(x0 + N.u, y, z0 + (N.v0 + N.v1) / 2)[1],
      () => netPosts(r, x0 + N.u, z0 + N.v0, z0 + N.v1, y, { net: 'torn', big: 1.8 }),
    ],
    [r.P(x0 + 4, y, z0 + 4)[1], () => stump(r, x0 + 4, y, z0 + 4)],
  ];
  for (const [u, v] of [
    [3, 20],
    [26, 5],
    [27, 21],
    [9, 2.5],
  ] as const)
    items.push([r.P(x0 + u, y, z0 + v)[1], () => tuftAt(r, x0 + u, y, z0 + v)]);
  items.sort((a, b) => a[0] - b[0]);
  for (const [, f] of items) f();
}

function stump(r: DrawContext, x: number, y: number, z: number): void {
  const b = r.P(x, y, z);
  const t = r.P(x, y + 1.4, z);
  const w = Math.max(1, Math.round(r.k * 0.45));
  r.rect(b[0] - (w >> 1), t[1], w, Math.max(1, b[1] - t[1]), r.col('#8a7560', 1, 0));
  r.rect(b[0] - (w >> 1), t[1], w, 1, r.col('#c4a46c', 1, 0));
}

function tuftAt(r: DrawContext, x: number, y: number, z: number): void {
  const p = r.P(x, y, z);
  const rr = Math.max(1.5, r.k * 0.5);
  const hi = r.col('#a8a05a', 1, 0);
  const lo = r.col('#857c42', 1, 0);
  for (let dy = -Math.ceil(rr); dy <= 0; dy++)
    for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++)
      if (Math.hypot(dx, dy * 1.6) <= rr && hash(dx + p[0], dy + p[1], 8) > 0.3)
        r.pix(p[0] + dx, p[1] + dy, dy < -rr / 2 ? hi : lo);
}

/* ---------------- 原来的节点：南墙那一段、让位的停车场 ---------------- */

/** 会被新地占掉的范围（这些范围里原来的节点画的时候先看 FORE.hide） */
const GUARD: readonly Rect[] = [
  { x0: LOT_S.x0 - 1, x1: LOT_S.x1 + 1, z0: LOT_S.z0 - 0.5, z1: LOT_S.z1 + 1 },
  SE_ROAD,
  GOLF_WEST,
];

interface Built {
  statics: Node[];
  dynamic: Node[];
  casts: (
    | { x0: number; x1: number; z0: number; z1: number; h: number }
    | { x: number; z: number; h: number; r: number }
  )[];
}

/**
 * build.ts 最后调：南墙被南门换掉的那一段不画、它的影子去掉；新地范围里原来的节点（停车场的车和灯杆、
 * 东边的灌木）画的时候先看 FORE.hide。都按包围盒找，不改前面的构建顺序。
 */
export function guardBuilt(b: Built): void {
  const S = SOUTH_GATE;
  const near = (a: number, c: number) => Math.abs(a - c) < 0.02;
  for (const n of b.statics) {
    const bb = (n as Custom).bounds;
    if (bb && near(bb.x0, S.x0) && near(bb.z0, S.z - 0.3) && near(bb.x1, S.x1)) n.visible = false;
  }
  b.casts = b.casts.filter((c) => !('x0' in c && near(c.x0, S.x0) && near(c.z0, S.z - 0.3) && near(c.x1, S.x1)));
  for (const n of [...b.statics, ...b.dynamic]) {
    const c = n as Custom;
    const bb = c.bounds;
    if (!bb || typeof c.draw !== 'function') continue;
    const x = (bb.x0 + bb.x1) / 2;
    const z = (bb.z0 + bb.z1) / 2;
    if (!GUARD.some((g) => inR(g, x, z))) continue;
    const d = c.draw;
    c.draw = (r, self) => {
      for (const h of FORE.hide) if (inR(h, x, z)) return;
      d(r, self);
    };
  }
}
