// clubmap2 里复用资产放在哪：成丛的植物（不是一格一格排）、喷泉一圈棕榈、北墙外一排棕榈、车道两边、长椅、人。
// 全部用种子随机流，每次一样。

import { LOOP_ROUND } from '../clubsite/mountains';
import {
  CLUBHOUSE,
  COURTS,
  DESERT,
  DESK,
  DRIVE,
  FORECOURT,
  FOUNTAIN,
  GOLF,
  GROUNDS,
  LAWN,
  LOT_N,
  LOT_S,
  PATHS,
  PICKLE,
  PLAZA,
  POOL_DECK,
  type Rect,
  TERRACE,
} from '../clubsite/world';

export interface Place {
  asset: string;
  x: number;
  z: number;
  y?: number;
  s?: number;
  v?: number;
  rotY?: number;
  /** 人：手里拿什么、什么姿势 */
  prop?: string | null;
}

const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const inRect = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** 不放植物的地方（场地、建筑、铺地、停车场……） */
const BLOCKED: Rect[] = [
  ...COURTS.map((c) => grow({ x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz }, 1.2)),
  { x0: -23, x1: 24, z0: -39, z1: -8.6 }, // 中心球场看台
  grow(CLUBHOUSE, 1.5),
  grow(TERRACE, 1),
  grow(POOL_DECK, 0.5),
  grow(PLAZA, 0.5),
  grow(LAWN, 0.5),
  grow(PICKLE, 1),
  grow(FORECOURT, 1),
  grow({ x0: DESK.x - DESK.w / 2, x1: DESK.x + DESK.w / 2, z0: DESK.z - DESK.d / 2, z1: DESK.z + DESK.d / 2 }, 1.5),
  ...PATHS.map((p) => grow(p, 1)),
  grow(LOT_N, 1.5),
  grow(LOT_S, 1.5),
  grow(DRIVE, 2),
  { x0: GOLF.x0 - 6, x1: GOLF.x1 + 6, z0: 54, z1: 73 }, // 球道一带
];

function free(x: number, z: number, inside: boolean): boolean {
  if (BLOCKED.some((r) => inRect(x, z, r))) return false;
  const g = grow(GROUNDS, inside ? -1.6 : 2.2);
  if (inside !== inRect(x, z, g)) return false;
  // 离地图边（山脚以内的沙漠的边）至少 4 米
  if (!inRect(x, z, grow(DESERT, -4))) return false;
  // 四个角是圆的（clubsite/mountains.ts 的 LOOP_ROUND）：角上离圆弧也要 4 米
  const R = LOOP_ROUND - 4;
  const cx = Math.min(Math.max(x, DESERT.x0 + LOOP_ROUND), DESERT.x1 - LOOP_ROUND);
  const cz = Math.min(Math.max(z, DESERT.z0 + LOOP_ROUND), DESERT.z1 - LOOP_ROUND);
  if (Math.hypot(x - cx, z - cz) > R) return false;
  return true;
}

/** 成丛撒：先挑丛心，再在丛心附近撒 2～5 棵 */
function clusters(
  rnd: () => number,
  zone: Rect,
  nClusters: number,
  pick: () => string,
  inside: boolean,
  spread = 4,
): Place[] {
  const out: Place[] = [];
  let tries = 0;
  let made = 0;
  while (made < nClusters && tries++ < nClusters * 60) {
    const cx = zone.x0 + rnd() * (zone.x1 - zone.x0);
    const cz = zone.z0 + rnd() * (zone.z1 - zone.z0);
    if (!free(cx, cz, inside)) continue;
    made++;
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * spread;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!free(x, z, inside)) continue;
      out.push({ asset: pick(), x, z, v: Math.floor(rnd() * 3), s: 0.8 + rnd() * 0.45, rotY: rnd() * Math.PI * 2 });
    }
  }
  return out;
}

const weighted = (rnd: () => number, table: [string, number][]) => () => {
  let t = rnd() * table.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of table) if ((t -= w) <= 0) return k;
  return table[0][0];
};

export function placements(rng: (stream: string) => () => number): Place[] {
  const out: Place[] = [];

  // 围墙里：棕榈为主，配龙舌兰、黄花灌木、桶形仙人掌
  const rIn = rng('map2:plants:in');
  out.push(
    ...clusters(
      rIn,
      GROUNDS,
      16,
      weighted(rIn, [
        ['fan-palm', 5],
        ['agave', 2],
        ['brittlebush', 2],
        ['barrel-cactus', 1],
        ['palo-verde', 1],
      ]),
      true,
      3.5,
    ),
  );

  // 围墙外的沙漠：灌木、仙人掌、石头，零星几棵树
  const rOut = rng('map2:plants:out');
  out.push(
    ...clusters(
      rOut,
      DESERT,
      30,
      weighted(rOut, [
        ['creosote', 4],
        ['brittlebush', 3],
        ['rocks', 3],
        ['cholla', 2],
        ['barrel-cactus', 1],
        ['ocotillo', 1],
        ['palo-verde', 1],
        ['smoke-tree', 1],
      ]),
      false,
      5,
    ),
  );

  // 北墙外一排高棕榈（游戏里会所后面那排）
  const rRow = rng('map2:palms:row');
  for (let x = -34; x <= 30; x += 7 + rRow() * 3)
    out.push({ asset: 'fan-palm', x, z: -46.5 - rRow() * 2.5, v: Math.floor(rRow() * 3), s: 1.05 + rRow() * 0.3 });
  // 车道两边的棕榈
  for (let x = 66; x <= 92; x += 8.5)
    for (const z of [-5.4, 5.4])
      out.push({ asset: 'fan-palm', x: x + (z > 0 ? 3 : 0), z, v: ((x / 8) % 3) | 0, s: 0.95 });
  // 喷泉一圈棕榈：4 棵，朝南（朝镜头）开口的马蹄形（同 clubplaza/layout.ts 的 PALMS：角度 0 = 东、90 = 南）——
  // 东西各一棵（15°、165°，叶冠在水面两边）、后面两棵（215°、335°）；南边敞开，默认视角里叶冠不压水面
  for (const [deg, v, s] of [
    [15, 0, 0.92],
    [165, 2, 1.0],
    [215, 1, 0.9],
    [335, 2, 0.95],
  ]) {
    const a = (deg * Math.PI) / 180;
    out.push({
      asset: 'fan-palm',
      x: FOUNTAIN.x + Math.cos(a) * FOUNTAIN.palms,
      z: FOUNTAIN.z + Math.sin(a) * FOUNTAIN.palms,
      v,
      s,
    });
  }
  // 喷泉广场两张长椅（同 clubplaza：西边那张在蒲葵荫里面朝池心，北边那张面朝南），长廊两张
  for (const [x, z, r] of [
    [38, -20.6, Math.atan2(FOUNTAIN.x - 38, FOUNTAIN.z + 20.6)],
    [40.6, -33.4, 0],
    [12, -3.6, Math.PI],
    [-20, -3.6, Math.PI],
  ])
    out.push({ asset: 'bench', x, z, rotY: r });
  // 球员草坪：两棵大树 + 遮阳帆
  out.push({ asset: 'palo-verde', x: 42, z: 22, s: 1.8, v: 0 });
  out.push({ asset: 'smoke-tree', x: 51, z: 29, s: 2.0, v: 1 });
  out.push({ asset: 'shade-sail', x: 49, z: 21, s: 1.3 });
  // 泳池边、会所门口
  out.push({ asset: 'fan-palm', x: -40.5, z: 16, v: 1, s: 1.1 });
  out.push({ asset: 'fan-palm', x: -60, z: 16.5, v: 2, s: 1.0 });
  out.push({ asset: 'fan-palm', x: -38.5, z: -38, v: 0, s: 1.15 });
  // 大门里外
  out.push({ asset: 'fan-palm', x: 58, z: -10.5, v: 2, s: 1.0 });
  out.push({ asset: 'agave', x: 62, z: -8 });
  out.push({ asset: 'agave', x: 62, z: 8.5 });
  // ── 人：总监在前台后面，会员在柜台前和长廊上，场上有人打球 ──
  const E = Math.PI / 2; // 面朝 +x
  out.push({ asset: 'director', x: DESK.x - 0.4, z: DESK.z - 0.4, rotY: E, prop: null });
  out.push({ asset: 'player', x: DESK.x + DESK.w / 2 + 0.6, z: DESK.z - 0.9, rotY: -E, v: 0 });
  out.push({ asset: 'player', x: DESK.x + DESK.w / 2 + 1.7, z: DESK.z + 1.2, rotY: -E - 0.4, v: 1 });
  out.push({ asset: 'player', x: 58.4, z: -1.5, rotY: -E, v: 2 });
  out.push({ asset: 'player', x: 26, z: -6, rotY: -E, v: 1 });
  out.push({ asset: 'player', x: 24.6, z: -7.2, rotY: -E, v: 0 });
  out.push({ asset: 'player', x: -12.4, z: -21.8, rotY: E, v: 0 });
  out.push({ asset: 'player', x: 12.1, z: -20.3, rotY: -E, v: 1 });
  out.push({ asset: 'coach', x: 6.5, z: 6.5, rotY: E });
  out.push({ asset: 'player', x: 28.8, z: 5.2, rotY: -E, v: 2 });
  out.push({ asset: 'player', x: 5.6, z: 24, rotY: E, v: 0 });
  out.push({ asset: 'player', x: 29, z: 26.2, rotY: -E, v: 1 });
  out.push({ asset: 'player', x: -29, z: 24.4, rotY: E, v: 2 });
  out.push({ asset: 'player', x: -5, z: 25.8, rotY: -E, v: 0 });
  out.push({ asset: 'player', x: -33, z: -24, rotY: 0, v: 1 });
  return out;
}
