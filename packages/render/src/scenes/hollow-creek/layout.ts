import type { XZ } from '@td/shared';
import { lerp } from '@td/shared';
import { CourtFrame } from '../../world/frame';

/**
 * Hollow Creek 的布局（Board Layouts 方案 5「溪流分岛」）：
 * 小溪从西到东横穿岛的中部，把岛分成两岸。
 * - 北岸是还在运转的俱乐部：上层台地是会所、露台、泳池和停车场，中层台地是 1、2 号场；
 * - 南岸是要收复的部分：塌掉的气膜场和长草的红土场，只能走人行桥过去。
 * 台地一直铺到岛边，岛就是一块往南一级级下降的方台。
 *
 * 世界坐标单位是米；y 向上；北是 -z。
 */

/** 上层台地（会所、露台、泳池、停车场）高度 */
export const UP = 2.4;
/** 中层台地（1、2 号场）高度 */
export const MID = 1.2;
/** 上/中层分界的 z */
export const ZU = -18;
/** 中层台地和北岸低地的分界 z */
export const ZL = 6;

/** 两段楼梯在同一条南北脊线上：会所 → 球场 → 人行桥。 */
export const SPINE_X = 6.1;
export const STAIRS = [
  { x0: SPINE_X - 1.1, x1: SPINE_X + 1.1, z0: ZU, z1: ZU + 3.6, y0: UP, y1: MID },
  { x0: SPINE_X - 1.1, x1: SPINE_X + 1.1, z0: ZL, z1: ZL + 3.6, y0: MID, y1: 0 },
] as const;

/** 露台：会所南面，伸出上层台地边缘 1.4 米，俯瞰 1 号场。 */
export const DECK = { x0: -40, x1: -27, z0: -23.6, z1: -16.6, y: UP + 0.35 } as const;
/** 会所：露台正北。 */
export const CLUBHOUSE = { x0: DECK.x0, x1: DECK.x1, z0: DECK.z0 - 12.4, z1: DECK.z0 } as const;
/** 干涸的泳池：会所西边。 */
export const POOL = { x0: -57, x1: -43, z0: -34, z1: -26 } as const;
/** 碎石停车场：东北角。 */
export const LOT = { x0: 22, x1: 42, z0: -44, z1: -24 } as const;
/** 出岛的公路：从停车场东边一直往东，到岛边断开。 */
export const ROAD = { z0: -34, z1: -28 } as const;
export const ROAD_Z = (ROAD.z0 + ROAD.z1) / 2;

/** 1 号场：最后一块网球场（中层台地西侧，正对露台） */
export const FA = new CourtFrame(-14, MID, -6, -0.06, 17, 9.15);
/** 2 号场：租给匹克球（中层台地东侧） */
export const FB = new CourtFrame(26, MID, -6, 0.05, 17, 9.15);
/** 气膜场：塌了（南岸西侧） */
export const FC = new CourtFrame(-18, 0, 31, 0.04, 19, 9.6);
/** 红土场：荒废（南岸东侧） */
export const FD = new CourtFrame(25, 0, 31, -0.06, 17, 9.15);
export const FRAMES = [FA, FB, FC, FD] as const;

/**
 * 浮空岛：俱乐部所在的整块地是一块悬在天上的方台（设计稿「Floating island」）。
 * 边缘是笔直的硬边，四角切掉一点；边外什么都没有，只有天空和云。
 */
export const ISLAND = {
  x0: -62,
  x1: 58,
  z0: -50,
  z1: 52,
  /** 四角切角（米） */
  chamfer: 4,
} as const;

/** 台地铺满岛的宽度，北边一直到岛边。 */
export const XW = ISLAND.x0;
export const XE = ISLAND.x1;
export const ZB = ISLAND.z0;

/** 公路在岛的东边缘断开，路就到这里为止。 */
export const ROAD_END_X = ISLAND.x1 - 1;

/** 地形高度（不含场地）。 */
export function terrainY(x: number, z: number): number {
  for (const s of STAIRS)
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
      const u = (z - s.z0) / (s.z1 - s.z0);
      return lerp(s.y0, s.y1, (Math.min(5, Math.floor(u * 6)) + 1) / 6);
    }
  if (x >= DECK.x0 && x <= DECK.x1 && z >= DECK.z0 && z <= DECK.z1) return DECK.y;
  if (z < ZU) return UP;
  if (z < ZL) return MID;
  return 0;
}

/** 人和球脚下的高度：场地优先，其次地形。 */
export function groundY(x: number, z: number): number {
  for (const f of FRAMES) if (f.inside(x, z)) return f.oy;
  return terrainY(x, z);
}

/** 小溪中心线的 z：横穿岛的中部，在两岸的球场之间。 */
export const creekZ = (x: number): number => 13 + 1.6 * Math.sin(x * 0.09) + 0.7 * Math.sin(x * 0.23 + 1);

/** 停车场和路面上车的高度（都在上层台地上）。 */
export const carY = (_x: number, _z: number): number => UP + 0.04;

const deckFront = DECK.z1 - 3;

/**
 * 锚点：模拟和剧情只按名字引用位置，位置在哪由场景决定。
 * 改布局只改这里，不影响事件和存档。
 */
export const ANCHORS = {
  court_1: { x: FA.ox, z: FA.oz },
  court_2: { x: FB.ox, z: FB.oz },
  bubble_court: { x: FC.ox, z: FC.oz },
  clay_court: { x: FD.ox, z: FD.oz },
  /** 1 号场东门外 / 门内（门在朝楼梯的东侧） */
  court_1_gate_out: FA.w({ x: 18.6, z: 0 }),
  court_1_gate_in: FA.w({ x: 15.6, z: 0 }),
  stairs_top: { x: SPINE_X, z: ZU - 0.4 },
  stairs_bottom: { x: SPINE_X, z: ZU + 3.9 },
  /** 中层台地上从楼梯到 1 号场门口的拐点 */
  mid_walk: { x: SPINE_X, z: -9 },
  deck: { x: (DECK.x0 + DECK.x1) / 2, z: (DECK.z0 + DECK.z1) / 2 },
  deck_edge: { x: DECK.x1 - 1.2, z: DECK.z1 - 0.8 },
  director_post: { x: DECK.x1 - 5, z: DECK.z1 - 1.6 },
  /** 从楼梯口走上露台：露台东边外 / 露台上 */
  deck_approach: { x: DECK.x1 + 0.4, z: deckFront },
  deck_meet: { x: DECK.x1 - 2.4, z: deckFront - 0.2 },
  director_meet: { x: DECK.x1 - 3.6, z: deckFront - 0.5 },
  /** 上层台地沿南边的步道，楼梯口 → 停车场 */
  upper_path: { x: SPINE_X, z: ZU - 3.6 },
  lot_path: { x: LOT.x0 + 2, z: ZU - 3.6 },
  lot: { x: (LOT.x0 + LOT.x1) / 2, z: (LOT.z0 + LOT.z1) / 2 },
  pool: { x: (POOL.x0 + POOL.x1) / 2, z: (POOL.z0 + POOL.z1) / 2 },
  creek_bridge: { x: SPINE_X, z: creekZ(SPINE_X) },
  /** 过了桥的南岸路口 */
  south_landing: { x: SPINE_X - 1.5, z: 20 },
} satisfies Record<string, XZ>;

export type HollowCreekAnchor = keyof typeof ANCHORS;

/** 流浪狗在南岸的巡游点：沿溪边、绕过气膜场西头、在南边转一圈。 */
export const DOG_WAYPOINTS = [
  [-4, 19],
  [-14, 18.5],
  [-30, 18.5],
  [-44, 24],
  [-44, 40],
  [-30, 46],
  [-10, 45],
  [3.5, 43],
  [3.5, 30],
  [2, 20],
] as const;

/** 岛底剖面：下层 y=0 往下。两层土，下面的岩层逐层往里收，收成一个钝底。 */
export const UNDERSIDE = {
  /** 草皮唇边 */
  lip: -0.6,
  soil: [
    { to: -4, col: '#6f5a42' },
    { to: -8, col: '#5f4b37' },
  ],
  stone: [
    { to: -11, inset: 0, col: '#7b7468' },
    { to: -15, inset: 3, col: '#6b655a' },
    { to: -19, inset: 7, col: '#5e594f' },
    { to: -23, inset: 12, col: '#514c44' },
    { to: -27, inset: 18, col: '#46423b' },
    { to: -30, inset: 25, col: '#3f3c37' },
  ],
} as const;

/** 到岛边的有向距离（米）：负数在岛上，正数在岛外。inset 把边界往里收。 */
export function coastDistance(x: number, z: number, inset = 0): number {
  const { x0, x1, z0, z1, chamfer } = ISLAND;
  const dx = Math.max(x0 + inset - x, x - (x1 - inset));
  const dz = Math.max(z0 + inset - z, z - (z1 - inset));
  // 切角：到 45° 斜线的距离
  const cx = Math.min(x - (x0 + inset), x1 - inset - x);
  const cz = Math.min(z - (z0 + inset), z1 - inset - z);
  const dc = (chamfer - cx - cz) / Math.SQRT2;
  return Math.max(dx, dz, dc);
}

/** 这个点在不在岛上。 */
export const onIsland = (x: number, z: number): boolean => coastDistance(x, z) < 0;

/** 车从停车场开出去的路线：顺着公路往东开到岛边，在那里消失。 */
export const EXIT_ROUTE: readonly XZ[] = [
  { x: 39, z: ROAD_Z },
  { x: 45, z: ROAD_Z },
  { x: ROAD_END_X - 3, z: ROAD_Z },
];

/* ---------------- 总监走位：站位和每条导航边的路径点 ---------------- */

/**
 * 每个锚点上总监站在哪里（锚点本身可能是场地中心，人不能站在网上）。
 * 名字和内容里幕配置的锚点一一对应。
 */
export const STANDS: Record<string, XZ> = {
  deck: ANCHORS.director_post,
  court_1: ANCHORS.court_1_gate_in,
  court_2: FB.w({ x: -15.6, z: 0 }),
  bubble_court: FC.w({ x: 16, z: -10.6 }),
  clay_court: FD.w({ x: -14, z: -10.4 }),
  lot: { x: LOT.x0 + 4, z: LOT.z1 - 2 },
  pool: { x: (POOL.x0 + POOL.x1) / 2, z: POOL.z1 + 2.2 },
  creek_bridge: { x: SPINE_X, z: creekZ(SPINE_X) },
};

const B_N = { x: SPINE_X, z: creekZ(SPINE_X) - 3.6 };
const B_S = { x: SPINE_X, z: creekZ(SPINE_X) + 3.6 };
const ZL_TOP = { x: SPINE_X, z: ZL - 0.4 };
const ZL_BOT = { x: SPINE_X, z: ZL + 3.9 };
const FB_GATE_OUT = FB.w({ x: -18.6, z: 0 });

/** 导航边 a|b 的中间路径点（从 a 的站位走向 b 的站位，不含两头）。反方向自动倒过来。 */
const ROUTES: Record<string, readonly XZ[]> = {
  'deck|court_1': [
    ANCHORS.deck_approach,
    ANCHORS.upper_path,
    ANCHORS.stairs_top,
    ANCHORS.stairs_bottom,
    ANCHORS.mid_walk,
    ANCHORS.court_1_gate_out,
  ],
  'deck|pool': [{ x: DECK.x0 - 1.5, z: DECK.z0 + 2 }],
  'deck|lot': [ANCHORS.deck_approach, ANCHORS.upper_path, ANCHORS.lot_path],
  'court_1|court_2': [ANCHORS.court_1_gate_out, ANCHORS.mid_walk, FB_GATE_OUT],
  'court_2|lot': [
    FB_GATE_OUT,
    ANCHORS.mid_walk,
    ANCHORS.stairs_bottom,
    ANCHORS.stairs_top,
    ANCHORS.upper_path,
    ANCHORS.lot_path,
  ],
  'court_1|creek_bridge': [ANCHORS.court_1_gate_out, { x: SPINE_X, z: -2 }, ZL_TOP, ZL_BOT, B_N],
  'court_2|creek_bridge': [FB_GATE_OUT, { x: SPINE_X, z: -2 }, ZL_TOP, ZL_BOT, B_N],
  'creek_bridge|bubble_court': [B_S, ANCHORS.south_landing],
  'creek_bridge|clay_court': [B_S, ANCHORS.south_landing],
};

/** 一条导航边的完整折线（含两头的站位）。没有这条边时返回 null。 */
export function routeLine(a: string, b: string): XZ[] | null {
  const A = STANDS[a];
  const B = STANDS[b];
  if (!A || !B) return null;
  const fwd = ROUTES[`${a}|${b}`];
  const mid = fwd ?? (ROUTES[`${b}|${a}`] ? [...(ROUTES[`${b}|${a}`] as readonly XZ[])].reverse() : null);
  return mid ? [A, ...mid, B] : null;
}

export const polylineLength = (pts: readonly XZ[]): number =>
  pts.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - (pts[i - 1] as XZ).x, p.z - (pts[i - 1] as XZ).z) : 0), 0);

/** 折线上走过比例 u（0..1）处的点。 */
export function pointAlong(pts: readonly XZ[], u: number): XZ {
  const total = polylineLength(pts);
  let left = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as XZ;
    const b = pts[i] as XZ;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d || i === pts.length - 1) {
      const f = d > 0 ? Math.min(1, left / d) : 1;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
    left -= d;
  }
  return pts[pts.length - 1] ?? { x: 0, z: 0 };
}

/** 画面里总监走路的速度（米 / 游戏分钟）。内容里导航边的分钟数按它从路径长度换算。 */
export const WALK_METERS_PER_MINUTE = 1.5;
