import { lerp, type XZ } from '@td/shared';
import { CourtFrame } from '../../world/frame';

/**
 * Hollow Creek 的布局：三层台地沿山坡往下，最下面是小溪。
 * 世界坐标单位是米；y 向上；北是 -z。
 */

/** 上层台地（会所、泳池、停车场）高度 */
export const UP = 2.4;
/** 中层台地（1、2 号场）高度 */
export const MID = 1.2;
/** 上/中层分界的 z */
export const ZU = -17;
/** 中/下层分界的 z */
export const ZL = 9;
export const XW = -58;
export const XE = 42;
export const ZB = -70;

export const STAIRS = [
  { x0: -1.1, x1: 1.1, z0: ZU, z1: ZU + 3.6, y0: UP, y1: MID },
  { x0: -1.1, x1: 1.1, z0: ZL, z1: ZL + 3.6, y0: MID, y1: 0 },
] as const;
export const DECK = { x0: -16, x1: -3, z0: -22.6, z1: -15.6, y: UP + 0.35 } as const;
export const POOL = { x0: 3, x1: 17, z0: -31, z1: -23 } as const;
export const LOT = { x0: 20, x1: 40, z0: -42, z1: -20 } as const;

/** 东侧坡道路面高度。 */
export function roadY(z: number): number {
  return z <= -30 ? UP : z >= 10 ? 0 : lerp(UP, 0, (z + 30) / 40);
}

/** 1 号场：最后一块网球场 */
export const FA = new CourtFrame(-19.5, MID, -3.6, -0.08, 17, 9.15);
/** 2 号场：租给匹克球 */
export const FB = new CourtFrame(19.5, MID, -3.2, 0.1, 17, 9.15);
/** 气膜场：塌了 */
export const FC = new CourtFrame(19.5, 0, 23, 0.04, 19, 9.6);
/** 红土场：荒废 */
export const FD = new CourtFrame(-21, 0, 23, -0.12, 17, 9.15);
export const FRAMES = [FA, FB, FC, FD] as const;

/** 地形高度（不含场地）。 */
export function terrainY(x: number, z: number): number {
  for (const s of STAIRS)
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
      const u = (z - s.z0) / (s.z1 - s.z0);
      return lerp(s.y0, s.y1, (Math.min(5, Math.floor(u * 6)) + 1) / 6);
    }
  if (x >= DECK.x0 && x <= DECK.x1 && z >= DECK.z0 && z <= DECK.z1) return DECK.y;
  if (x > XW && x < XE) {
    if (z < ZU) return UP;
    if (z < ZL) return MID;
  }
  if (x >= XE && x <= 48 && z > -31 && z < 12) return roadY(z);
  return 0;
}

/** 人和球脚下的高度：场地优先，其次地形。 */
export function groundY(x: number, z: number): number {
  for (const f of FRAMES) if (f.inside(x, z)) return f.oy;
  return terrainY(x, z);
}

/** 小溪中心线的 z。 */
export const creekZ = (x: number): number => 37.5 + 2.2 * Math.sin(x * 0.09) + 1.0 * Math.sin(x * 0.23 + 1);

/** 停车场和路面上车的高度。 */
export const carY = (x: number, z: number): number => (x < 41 ? UP + 0.04 : roadY(z) + 0.04);

/**
 * 锚点：模拟和剧情只按名字引用位置，位置在哪由场景决定。
 * 改布局只改这里，不影响事件和存档。
 */
export const ANCHORS = {
  court_1: { x: FA.ox, z: FA.oz },
  court_2: { x: FB.ox, z: FB.oz },
  bubble_court: { x: FC.ox, z: FC.oz },
  clay_court: { x: FD.ox, z: FD.oz },
  /** 1 号场东门外 / 门内 */
  court_1_gate_out: FA.w({ x: 18.6, z: 0 }),
  court_1_gate_in: FA.w({ x: 15.6, z: 0 }),
  stairs_top: { x: 0, z: ZU - 0.4 },
  stairs_bottom: { x: 0, z: ZU + 3.9 },
  /** 中层台地上从楼梯到 1 号场门口的拐点 */
  mid_walk: { x: 2.2, z: -12 },
  deck: { x: (DECK.x0 + DECK.x1) / 2, z: (DECK.z0 + DECK.z1) / 2 },
  deck_edge: { x: -4.2, z: -16.4 },
  director_post: { x: -8, z: -17.2 },
  upper_path: { x: 2, z: -20.6 },
  lot_path: { x: 21, z: -20.6 },
  lot: { x: (LOT.x0 + LOT.x1) / 2, z: (LOT.z0 + LOT.z1) / 2 },
  pool: { x: (POOL.x0 + POOL.x1) / 2, z: (POOL.z0 + POOL.z1) / 2 },
  creek_bridge: { x: 0, z: creekZ(0) },
} satisfies Record<string, XZ>;

export type HollowCreekAnchor = keyof typeof ANCHORS;

/** 流浪狗在下层台地的巡游点。 */
export const DOG_WAYPOINTS = [
  [-4, 33],
  [-12, 34.5],
  [-20, 30],
  [-26, 25],
  [-14, 21],
  [-6, 30],
  [3, 31],
  [1.5, 17],
  [-2, 24],
] as const;

/**
 * 浮空岛：俱乐部所在的整块地是一块悬在天上的方形土台（设计稿「Floating island」）。
 * 边缘是笔直的硬边，四角切掉一点；边外什么都没有，只有天空和云。
 * 所有台地、场地、树、小溪和公路都在岛上；小溪从东西两侧的边缘落下去。
 */
export const ISLAND = {
  x0: -66,
  x1: 70,
  z0: -78,
  z1: 58,
  /** 四角切角（米） */
  chamfer: 4,
} as const;

/** 岛底剖面：下层台地 y=0 往下。两层土，下面的岩层逐层往里收，收成一个钝底。 */
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

/** 东侧公路在岛的南边缘断开，路就到这里为止。 */
export const ROAD_END_Z = ISLAND.z1 - 1;

/** 车从停车场开出去的路线：顺着公路开到岛的南边缘，在那里消失。 */
export const EXIT_ROUTE: readonly XZ[] = [
  { x: 39, z: -31 },
  { x: 45, z: -30 },
  { x: 45, z: 12 },
  { x: 45, z: ROAD_END_Z - 3 },
];

/** 小溪从岛边落下去的两个位置（西、东）。 */
export const CREEK_OUTFALLS: readonly XZ[] = [
  { x: ISLAND.x0, z: creekZ(ISLAND.x0) },
  { x: ISLAND.x1, z: creekZ(ISLAND.x1) },
];
