import type { XZ } from '@td/shared';
import { CourtFrame } from '../../world/frame';

/**
 * Indian Wells Tennis Garden 的布局（2026-11-01：整局只有这一张地图，开局是废弃的）。
 * 按真实场馆的大致关系摆，不是一比一：中心是 Stadium 1 的大碗，西边是 Stadium 2 和下沉的 Stadium 3，
 * 南边一排外场，北边是会所，东边是广场、入口和停车场。四周是沙漠。
 *
 * 世界坐标单位是米；y 向上；北是 -z。地面是平的（y = 0），下沉的 Stadium 3 自己挖下去。
 */

/** 整块园区（含四周一圈沙漠） */
export const SITE = { x0: -104, x1: 104, z0: -76, z1: 76 } as const;

/** Stadium 1：中心球场，四面看台的大碗 */
export const S1 = { cx: 0, cz: 0, hx: 32, hz: 26 } as const;
export const F_S1 = new CourtFrame(S1.cx, 0, S1.cz, 0, 18, 9.6);

/** Stadium 2：西南，两侧看台 */
export const S2 = { cx: -70, cz: 44, hx: 24, hz: 18 } as const;
export const F_S2 = new CourtFrame(S2.cx, 0, S2.cz, 0, 18, 9.6);

/** Stadium 3：西北，下沉的场地（开局被沙填满） */
export const S3 = { cx: -70, cz: -46, hx: 20, hz: 15, depth: 2.4 } as const;
export const F_S3 = new CourtFrame(S3.cx, -S3.depth, S3.cz, 0, 17, 9.2);

/** 练习场：西边两块并排 */
export const F_P1 = new CourtFrame(-72, 0, -7, 0, 17, 9.15);
export const F_P2 = new CourtFrame(-72, 0, 13, 0, 17, 9.15);

/** 外场：南边一排。外场 1 能最先救回来；外场 2、3 是一起修的一片 */
export const F_O1 = new CourtFrame(-20, 0, 54, 0, 17, 9.15);
export const F_O2 = new CourtFrame(18, 0, 54, 0, 17, 9.15);
export const F_O3 = new CourtFrame(56, 0, 54, 0, 17, 9.15);

/** 会所：北边，正门朝南 */
export const CLUBHOUSE = { x0: -26, x1: 10, z0: -68, z1: -50 } as const;
/** 广场：Stadium 1 东边，喷泉和长水池、餐饮棚 */
export const PLAZA = { x0: 44, x1: 72, z0: -16, z1: 16 } as const;
export const FOUNTAIN = { x: 58, z: -6, r: 5 } as const;
/** 入口（Washington St 一侧）：大门在广场东边 */
export const GATE = { x: 86, z0: -8, z1: 8 } as const;
/** 停车场：东北角 */
export const PARKING = { x0: 50, x1: 98, z0: -70, z1: -34 } as const;

/** 所有场地框（人和球脚下的高度、演出区域） */
export const FRAMES = [F_S1, F_S2, F_S3, F_P1, F_P2, F_O1, F_O2, F_O3] as const;

/** 地面高度：下沉的 Stadium 3 低一截，其余是平地。 */
export function terrainY(x: number, z: number): number {
  if (Math.abs(x - S3.cx) <= S3.hx - 2 && Math.abs(z - S3.cz) <= S3.hz - 2) return -S3.depth;
  return 0;
}

/** 人和球脚下的高度：场地优先，其次地形。 */
export function groundY(x: number, z: number): number {
  for (const f of FRAMES) if (f.inside(x, z)) return f.oy;
  return terrainY(x, z);
}

/**
 * 锚点：模拟和剧情只按名字引用位置（和内容里地图的 anchors 一一对应）。
 * 这里是每个地点的中心（活动牌挂在这儿）。
 */
export const ANCHORS = {
  entrance: { x: GATE.x, z: 0 },
  parking: { x: (PARKING.x0 + PARKING.x1) / 2, z: (PARKING.z0 + PARKING.z1) / 2 },
  plaza: { x: FOUNTAIN.x, z: FOUNTAIN.z },
  clubhouse: { x: (CLUBHOUSE.x0 + CLUBHOUSE.x1) / 2, z: (CLUBHOUSE.z0 + CLUBHOUSE.z1) / 2 },
  stadium_1: { x: F_S1.ox, z: F_S1.oz },
  stadium_2: { x: F_S2.ox, z: F_S2.oz },
  stadium_3: { x: F_S3.ox, z: F_S3.oz },
  practice: { x: F_P1.ox, z: (F_P1.oz + F_P2.oz) / 2 },
  outer_1: { x: F_O1.ox, z: F_O1.oz },
  outer_23: { x: (F_O2.ox + F_O3.ox) / 2, z: F_O2.oz },
} satisfies Record<string, XZ>;

export type IndianWellsAnchor = keyof typeof ANCHORS;

/** 每个地点上人站在哪儿（场地中心有网，人不能站在网上）。 */
export const STANDS: Record<IndianWellsAnchor, XZ> = {
  entrance: { x: GATE.x - 3, z: 3 },
  parking: { x: PARKING.x0 + 10, z: PARKING.z1 - 3 },
  plaza: { x: PLAZA.x0 + 4, z: 5 },
  clubhouse: { x: -8, z: CLUBHOUSE.z1 + 3 },
  stadium_1: F_S1.w({ x: 15.5, z: 12.5 }),
  stadium_2: F_S2.w({ x: 15.5, z: -12 }),
  stadium_3: F_S3.w({ x: 15, z: 14 }),
  practice: F_P1.w({ x: 15.5, z: 10 }),
  outer_1: F_O1.w({ x: 4, z: -10.6 }),
  outer_23: F_O2.w({ x: 19, z: -10.6 }),
};

/* ---------------- 步道：Stadium 1 外面一圈环路，各地点从环上分出去 ---------------- */

const RX = S1.hx + 6;
const RZ = S1.hz + 6;

/** 路网节点（含每个地点的站位） */
const NODES: Record<string, XZ> = {
  r_n: { x: 0, z: -RZ },
  r_ne: { x: RX, z: -RZ },
  r_e: { x: RX, z: 0 },
  r_se: { x: RX, z: RZ },
  r_s: { x: 0, z: RZ },
  r_sw: { x: -RX, z: RZ },
  r_w: { x: -RX, z: 0 },
  r_nw: { x: -RX, z: -RZ },
  /** Stadium 1 东、南两个入场口 */
  t_e: { x: S1.hx - 4, z: 0 },
  t_s: { x: 0, z: S1.hz - 6 },
  /** 广场南边的路口：环路 → 广场 / 大门 */
  pz: { x: 64, z: 12 },
  /** 停车场到大门的路 */
  lot_gate: { x: GATE.x, z: PARKING.z1 + 2 },
  /** 外场北边的步道 */
  o_w: { x: F_O1.ox, z: RZ + 6 },
  o_e: { x: F_O2.ox, z: RZ + 6 },
  ...Object.fromEntries(Object.entries(STANDS).map(([k, v]) => [`@${k}`, v])),
};

const EDGES: readonly (readonly [string, string])[] = [
  ['r_n', 'r_ne'],
  ['r_ne', 'r_e'],
  ['r_e', 'r_se'],
  ['r_se', 'r_s'],
  ['r_s', 'r_sw'],
  ['r_sw', 'r_w'],
  ['r_w', 'r_nw'],
  ['r_nw', 'r_n'],
  ['r_e', 't_e'],
  ['t_e', '@stadium_1'],
  ['r_s', 't_s'],
  ['t_s', '@stadium_1'],
  ['r_e', 'pz'],
  ['pz', '@plaza'],
  ['pz', '@entrance'],
  ['@entrance', 'lot_gate'],
  ['lot_gate', '@parking'],
  ['r_ne', '@parking'],
  ['r_n', '@clubhouse'],
  ['r_nw', '@stadium_3'],
  ['r_w', '@practice'],
  ['r_sw', '@stadium_2'],
  ['r_s', 'o_w'],
  ['r_s', 'o_e'],
  ['o_w', '@outer_1'],
  ['o_e', '@outer_23'],
  ['o_w', 'o_e'],
];

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

const ADJ = new Map<string, [string, number][]>();
for (const [a, b] of EDGES) {
  const d = dist(NODES[a] as XZ, NODES[b] as XZ);
  ADJ.set(a, [...(ADJ.get(a) ?? []), [b, d]]);
  ADJ.set(b, [...(ADJ.get(b) ?? []), [a, d]]);
}

/** 路网上两点间的最短折线（节点名）。 */
function shortest(from: string, to: string): string[] | null {
  const d = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set([from]);
  while (todo.size) {
    let cur = '';
    let best = Number.POSITIVE_INFINITY;
    for (const n of [...todo].sort()) {
      const v = d.get(n) ?? Number.POSITIVE_INFINITY;
      if (v < best) {
        best = v;
        cur = n;
      }
    }
    todo.delete(cur);
    if (cur === to) break;
    for (const [nb, m] of ADJ.get(cur) ?? []) {
      // 别的地点的站位不当路口穿过去（避免穿过别人的场地）
      if (nb.startsWith('@') && nb !== to) continue;
      const nd = best + m;
      if (nd < (d.get(nb) ?? Number.POSITIVE_INFINITY)) {
        d.set(nb, nd);
        prev.set(nb, cur);
        todo.add(nb);
      }
    }
  }
  if (!d.has(to)) return null;
  const path: string[] = [];
  for (let n: string | undefined = to; n; n = prev.get(n)) path.unshift(n);
  return path;
}

const lines = new Map<string, XZ[] | null>();

/** 两个地点之间步行的折线（含两头的站位）。不认识的地点返回 null。 */
export function routeLine(a: string, b: string): XZ[] | null {
  const key = `${a}|${b}`;
  if (!lines.has(key)) {
    const p = a in STANDS && b in STANDS ? shortest(`@${a}`, `@${b}`) : null;
    lines.set(key, p ? p.map((n) => NODES[n] as XZ) : null);
  }
  const l = lines.get(key);
  return l ? [...l] : null;
}

export const polylineLength = (pts: readonly XZ[]): number =>
  pts.reduce((sum, p, i) => (i ? sum + dist(p, pts[i - 1] as XZ) : 0), 0);

/** 画面里走路的速度（米 / 游戏分钟）。园区很大，按快步走算；内容里导航边的分钟数按它从路径长度换算。 */
export const WALK_METERS_PER_MINUTE = 3;

/** 两个地点之间要走几分钟（内容里的 nav 应该和它一致，layout.test 检查）。 */
export function walkMinutes(a: string, b: string): number | null {
  const l = routeLine(a, b);
  return l ? Math.max(1, Math.round(polylineLength(l) / WALK_METERS_PER_MINUTE)) : null;
}

/* ---------------- 美术用的布局常量（只管画面，不影响步道、站位和导航分钟数） ---------------- */

/** 园区围墙以内（墙外是沙漠）。东墙在大门（ARCH_X）两侧，停车场那一截往东凸出去到 LOT_WALL_X */
export const CAMPUS = { x0: -98, x1: 89.5, z0: -75, z1: 68 } as const;
/** 大门的门楼（在站位东边，门外是售票亭和前广场） */
export const ARCH_X = 89.5;
/** 停车场东边的围墙 */
export const LOT_WALL_X = 100;
/** 大门外的 Washington St（南北向） */
export const ROAD = { x0: 104, x1: 111 } as const;
/**
 * Stadium 1 看台：内沿是圆角矩形（半宽 ix、半深 iz），往外 rows 排，每排 rowD 深、高 rise。
 * 东边和南边各留一个入场口（步道从这里穿进去），东南角上半截是塌的。
 */
export const S1_BOWL = { ix: 22, iz: 15, rows: 10, rowD: 1, rise: 0.55, corner: 3 } as const;
/** Stadium 2：南北两条看台（东头敞开，步道从东边进场） */
export const S2_STANDS = { x0: -88, x1: -52, iz: 13.6, rows: 6 } as const;

/**
 * 草坪：每块归一个设施。开局是枯草，那处设施修好了就换成剪过的绿草（overlays.ts）。
 * 步道和场地都盖在草坪上面。
 */
export const LAWNS: Readonly<Record<string, readonly { x0: number; x1: number; z0: number; z1: number }[]>> = {
  outer_1: [{ x0: -42, x1: 0, z0: 40, z1: 67 }],
  outer_23: [{ x0: 0, x1: 78, z0: 40, z1: 67 }],
  practice: [{ x0: -94, x1: -50, z0: -20, z1: 25 }],
  stadium_2: [{ x0: -96, x1: -44, z0: 25, z1: 66 }],
  stadium_3: [{ x0: -96, x1: -44, z0: -66, z1: -26 }],
  clubhouse: [
    { x0: -36, x1: 20, z0: -49, z1: -38 },
    { x0: -36, x1: -27, z0: -70, z1: -49 },
    { x0: 11, x1: 20, z0: -70, z1: -49 },
  ],
  plaza: [
    { x0: 42, x1: 78, z0: 18, z1: 36 },
    { x0: 73, x1: 84, z0: -20, z1: 18 },
  ],
  stadium_1: [
    { x0: -36, x1: 36, z0: -30, z1: -26 },
    { x0: -36, x1: 36, z0: 26, z1: 30 },
  ],
};
