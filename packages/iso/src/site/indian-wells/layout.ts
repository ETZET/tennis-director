import type { XZ } from '@td/shared';
import { CourtFrame } from '../../world/frame';

/**
 * Palm Oasis Racquet Club 的布局（Indian Wells, CA；2026-11-02 照参考图重排，ADR 0018）。
 * 一块围墙围起来的俱乐部：北边中间是中心球场（Stadium），西北是会所和露台，西边是泳池，
 * 中间两排球场（青训两块、会员双打、红土两块），东边是匹克球、球员草坪和棕榈喷泉，
 * 东墙正中是大门，门外是代客泊车和两片停车场。南墙外是高尔夫球场，再往外是沙漠。
 *
 * 地点 id 沿用原来的设施（ADR 0018 的对照表）：stadium_1 中心球场，practice 青训，outer_1 会员双打，
 * outer_23 红土，clubhouse 会所，plaza 棕榈喷泉，stadium_3 匹克球，stadium_2 泳池。
 *
 * 世界坐标单位是米；y 向上；北是 -z。地面是平的（y = 0）。
 */

/** 整块地图（含围墙外的停车场、高尔夫和沙漠；相机范围按它算） */
export const SITE = { x0: -72, x1: 96, z0: -48, z1: 74 } as const;
/** 俱乐部围墙以内 */
export const GROUNDS = { x0: -64, x1: 60, z0: -43, z1: 52 } as const;
/** 东墙上的大门（门洞 z0..z1） */
export const GATE = { x: 60, z0: -5, z1: 5 } as const;

/** 中心球场：北边看台高，南边低，东头一段 */
export const STAD = { cx: 0, cz: -21 } as const;
export const F_S1 = new CourtFrame(STAD.cx, 0, STAD.cz, 0, 18, 9);

/** 青训：两块硬地并排（西边发球机，东边喂球） */
export const F_P1 = new CourtFrame(-17, 0, 6, 0, 16.5, 8.3);
export const F_P2 = new CourtFrame(17, 0, 6, 0, 16.5, 8.3);
/** 会员双打：西南，场边有喷雾和遮阳帆 */
export const F_O1 = new CourtFrame(-17, 0, 25, 0, 16.5, 8.3);
/** 红土：两块，一前一后 */
export const F_O2 = new CourtFrame(17, 0, 25, 0, 16.5, 8.3);
export const F_O3 = new CourtFrame(17, 0, 42.6, 0, 16.5, 8.3);

/** 匹克球：一块围起来的场子里两片小场地 */
export const PICKLE = { x0: 36, x1: 52, z0: -3, z1: 15 } as const;
export const F_PB1 = new CourtFrame(44, 0, 1.6, 0, 8, 3.9);
export const F_PB2 = new CourtFrame(44, 0, 10.4, 0, 8, 3.9);

/** 会所（西班牙复兴式，红瓦）和东边的露台餐厅 */
export const CLUBHOUSE = { x0: -62, x1: -40, z0: -40, z1: -10 } as const;
export const TERRACE = { x0: -37, x1: -26, z0: -36, z1: -11 } as const;
/** 泳池：池子和一圈池畔 */
export const POOL = { x0: -57, x1: -43, z0: 3, z1: 13 } as const;
export const POOL_DECK = { x0: -61, x1: -39, z0: -1, z1: 18 } as const;
/** 棕榈喷泉：一圈棕榈围着圆形水池 */
export const FOUNTAIN = { x: 44, z: -24 } as const;
export const PLAZA = { x0: 32, x1: 56, z0: -36, z1: -12 } as const;
/** 球员草坪（只是景观）和两棵大橡树 */
export const LAWN = { x0: 37, x1: 56, z0: 17, z1: 34 } as const;
/** 大门外：代客泊车的车道和南北两片停车场 */
export const DRIVE = { x0: 60, x1: 90, z0: -4, z1: 4 } as const;
export const LOT_N = { x0: 64, x1: 88, z0: -26, z1: -6 } as const;
export const LOT_S = { x0: 64, x1: 88, z0: 6, z1: 26 } as const;
/** 南墙外的高尔夫球场 */
export const GOLF = { x0: -64, x1: 92, z0: 53, z1: 74 } as const;

/** 步道（碎花岗岩）：中心球场南边的长廊、两排球场之间、西边和东边各一条，青训两块场地中间一条小路 */
export const PATHS: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: -0.5, x1: 0.5, z0: -4.4, z1: 14.4 },
  { x0: -38, x1: 60, z0: -8.6, z1: -4.4 },
  { x0: -38, x1: 36, z0: 14.4, z1: 16.6 },
  { x0: -38.5, x1: -34.5, z0: -8.6, z1: 51 },
  { x0: 34, x1: 37, z0: -36, z1: 34 },
];

/** 网球场（人和球脚下的高度、演出区域）；匹克球场单列 */
export const FRAMES = [F_S1, F_P1, F_P2, F_O1, F_O2, F_O3, F_PB1, F_PB2] as const;

/** 人和球脚下的高度：整块地是平的，场地面高出一点。 */
export function groundY(x: number, z: number): number {
  for (const f of FRAMES) if (f.inside(x, z)) return f.oy;
  return 0;
}

/**
 * 锚点：模拟和剧情只按名字引用位置（和内容里地图的 anchors 一一对应）。
 * 这里是每个地点的中心（活动牌挂在这儿）。
 */
export const ANCHORS = {
  entrance: { x: GATE.x, z: 0 },
  parking: { x: (LOT_N.x0 + LOT_N.x1) / 2, z: (LOT_N.z0 + LOT_N.z1) / 2 },
  plaza: { x: FOUNTAIN.x, z: FOUNTAIN.z },
  clubhouse: { x: (CLUBHOUSE.x0 + CLUBHOUSE.x1) / 2, z: (CLUBHOUSE.z0 + CLUBHOUSE.z1) / 2 },
  stadium_1: { x: F_S1.ox, z: F_S1.oz },
  stadium_2: { x: (POOL.x0 + POOL.x1) / 2, z: (POOL.z0 + POOL.z1) / 2 },
  stadium_3: { x: (PICKLE.x0 + PICKLE.x1) / 2, z: (PICKLE.z0 + PICKLE.z1) / 2 },
  practice: { x: 0, z: F_P1.oz },
  outer_1: { x: F_O1.ox, z: F_O1.oz },
  outer_23: { x: F_O2.ox, z: (F_O2.oz + F_O3.oz) / 2 },
} satisfies Record<string, XZ>;

export type IndianWellsAnchor = keyof typeof ANCHORS;

/** 每个地点上人站在哪儿（场地中心有网，人不能站在网上；场上的站位在场边）。 */
export const STANDS: Record<IndianWellsAnchor, XZ> = {
  entrance: { x: GATE.x - 3, z: 2 },
  parking: { x: 72, z: -8 },
  plaza: { x: FOUNTAIN.x - 7, z: FOUNTAIN.z + 6 },
  clubhouse: { x: CLUBHOUSE.x1 + 1.6, z: -13 },
  stadium_1: F_S1.w({ x: 3, z: 7.4 }),
  stadium_2: { x: POOL.x1 + 2.6, z: 8 },
  stadium_3: { x: PICKLE.x0 + 1.4, z: 6 },
  practice: F_P1.w({ x: 14, z: 6.6 }),
  outer_1: F_O1.w({ x: 14, z: -6.6 }),
  outer_23: F_O2.w({ x: -14, z: -6.6 }),
};

/* ---------------- 步道：长廊、两排球场之间的横路、东西两条竖路 ---------------- */

/** 路网节点（含每个地点的站位） */
const NODES: Record<string, XZ> = {
  /** 中心球场南边的长廊 */
  p_w: { x: -36.5, z: -6.5 },
  p_mid: { x: 0, z: -6.5 },
  p_e: { x: 35.5, z: -6.5 },
  p_gate: { x: 54, z: -6.5 },
  /** 中心球场南看台中间的球员通道 */
  t_s: { x: 0, z: -10.5 },
  /** 东边竖路 */
  e_f: { x: 35.5, z: -18 },
  e_pb: { x: 35.5, z: 6 },
  e_q: { x: 35.5, z: 15.5 },
  /** 两排球场之间的横路 */
  q_w: { x: -36.5, z: 15.5 },
  q_mid: { x: 0, z: 15.5 },
  /** 西边竖路：泳池路口 */
  w_pool: { x: -36.5, z: 8 },
  /** 大门外的车道 */
  drive: { x: 66, z: 0 },
  ...Object.fromEntries(Object.entries(STANDS).map(([k, v]) => [`@${k}`, v])),
};

const EDGES: readonly (readonly [string, string])[] = [
  ['p_w', 'p_mid'],
  ['p_mid', 'p_e'],
  ['p_e', 'p_gate'],
  ['p_gate', '@entrance'],
  ['@entrance', 'drive'],
  ['drive', '@parking'],
  ['p_mid', 't_s'],
  ['t_s', '@stadium_1'],
  ['p_e', 'e_f'],
  ['e_f', '@plaza'],
  ['p_e', 'e_pb'],
  ['e_pb', '@stadium_3'],
  ['e_pb', 'e_q'],
  ['e_q', 'q_mid'],
  ['q_mid', 'q_w'],
  ['q_w', 'w_pool'],
  ['w_pool', 'p_w'],
  ['w_pool', '@stadium_2'],
  ['p_w', '@clubhouse'],
  ['q_mid', '@practice'],
  ['q_mid', '@outer_1'],
  ['q_mid', '@outer_23'],
  // 青训两块场地中间的小路：长廊直通两排球场之间
  ['p_mid', 'q_mid'],
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
      // 别的地点的站位不当路口穿过去（避免穿过别人的场地）；大门是去停车场的必经之路
      if (nb.startsWith('@') && nb !== to && nb !== '@entrance') continue;
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

/**
 * 画面里走路的速度（米 / 游戏分钟）。俱乐部比原来的园区小一半多，按慢步走算，
 * 让地点之间的分钟数和原来差不多（平衡不变）；内容里导航边的分钟数按它从路径长度换算。
 */
export const WALK_METERS_PER_MINUTE = 1.6;

/** 两个地点之间要走几分钟（内容里的 nav 应该和它一致，game.test 检查）。 */
export function walkMinutes(a: string, b: string): number | null {
  const l = routeLine(a, b);
  return l ? Math.max(1, Math.round(polylineLength(l) / WALK_METERS_PER_MINUTE)) : null;
}
