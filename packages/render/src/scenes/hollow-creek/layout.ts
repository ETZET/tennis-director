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

/** 车从停车场开出去的路线。 */
export const EXIT_ROUTE: readonly XZ[] = [
  { x: 39, z: -31 },
  { x: 45, z: -30 },
  { x: 45, z: 12 },
  { x: 45, z: 90 },
];
