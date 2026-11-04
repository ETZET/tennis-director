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
    const p = hasStand(a) && hasStand(b) ? shortest(`@${a}`, `@${b}`) : null;
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

/* ---------------- 变体的球场（Site.courtsFor；画法见 ground.ts 的 paintStadium3Variant） ---------------- */

/**
 * stadium_3 修成 pickle4：围场里 2×2 四片小匹克球场（中心同 ground.ts 的 PICK4）。
 * 网沿 x 拉，底线到底线沿 z，所以场地坐标系转 90°（局部 x 朝世界 -z）；
 * 每片的范围就是画出来的那一格（世界 x 方向半宽 4、z 方向半长 4.4）。
 */
export const F_PK4: readonly CourtFrame[] = (
  [
    [40, 1.6],
    [48, 1.6],
    [40, 10.4],
    [48, 10.4],
  ] as const
).map(([x, z]) => new CourtFrame(x, 0, z, Math.PI / 2, 4.4, 4));

/**
 * stadium_3 修成 tennis2：两片缩小的网球场，画在原来两片匹克球场的位置和范围上（网沿 z，同 F_PB1 / F_PB2）。
 * 单独给两个实例，方便以后单独调尺寸。
 */
export const F_TN2: readonly CourtFrame[] = [F_PB1, F_PB2].map((f) => new CourtFrame(f.ox, 0, f.oz, f.a, f.hx, f.hz));

/* ---------------- 地图长大（ADR 0021）：新地的锚点、站位、步道（只追加，不挪旧的） ---------------- */

/** 南墙上砌死的旧南门：西步道（x ≈ −36.5）断在这里。门洞占南墙从西数第 5 段（x0..x1），z 是墙线 */
export const SOUTH_GATE = { x: -37.43, x0: -40.381, x1: -34.476, z: 52 } as const;
/** ★3 收回的高尔夫西段（地块 golf_west） */
export const GOLF_WEST = { x0: -64, x1: 2, z0: 53, z1: 81 } as const;
/** 高尔夫的水塘（golf_west 里；绿洲草坪留着它，南场填掉它） */
export const GOLF_POND = { x: -30, z: 66, rx: 7.5, rz: 4.5 } as const;
/** 南场：两片新硬地（场边留得比墙里的窄一点，两片之间留 1 米） */
export const F_SC1 = new CourtFrame(-47.5, 0, 68.5, 0, 15.5, 8.3);
export const F_SC2 = new CourtFrame(-15.5, 0, 68.5, 0, 15.5, 8.3);
/** 南门外沿南墙的一条步道（两种用途都有） */
export const SOUTH_WALK = { x0: -60, x1: -4, z0: 55.2, z1: 57.8 } as const;
/** 绿洲草坪：三间小屋（中心、宽、深）、小泳池庭院 */
export const CABINS: readonly { x: number; z: number; w: number; d: number }[] = [
  { x: -54, z: 62.5, w: 6, d: 5 },
  { x: -47, z: 74.5, w: 6, d: 5 },
  { x: -10, z: 73.5, w: 6, d: 5 },
];
export const OASIS_POOL = { x0: -19.5, x1: -12.5, z0: 60, z1: 63.6 } as const;
export const OASIS_DECK = { x0: -23, x1: -6, z0: 58.6, z1: 66 } as const;

/** ★4 东南角：南停车场改成观赛坡（范围就是 LOT_S），大遮阳棚和大屏 */
export const SLOPE = LOT_S;
/** 赛事广场：东南角新长出来的地（两块，和基础地台合并成一个轮廓）和挪过去的停车场、接过去的路 */
export const SE_GROW: readonly { x0: number; x1: number; z0: number; z1: number }[] = [
  { x0: 64, x1: 104, z0: 82, z1: 100 },
  { x0: 104, x1: 112, z0: 66, z1: 94 },
];
export const LOT_NEW = { x0: 68, x1: 100, z0: 84, z1: 97 } as const;
export const SE_ROAD = { x0: 97.5, x1: 102.5, z0: -4, z1: 86 } as const;
/** 学院岛：靠岸以后的位置（地台多一块，和基础地台隔着一道桥）、桥、天上浮着时的位置和高度 */
export const ISLE_DOCK = { x0: 86, x1: 116, z0: 98, z1: 122 } as const;
export const ISLE_SKY = { x0: 130, x1: 160, z0: 112, z1: 136, y: 24 } as const;
export const BRIDGE = { x: 100, z0: 82, z1: 98, w: 2.6 } as const;
/** 岛上的练习场（场地坐标系同墙里的场：沿 x 打，场边窄）、宿舍 */
export const F_ISLE = new CourtFrame(101, 0, 114, 0, 13.9, 7);
export const DORM = { x0: 103, x1: 114.5, z0: 99.5, z1: 105.5 } as const;

/** 新地的锚点（地点中心）。地块没开时内容里有、画面上不显示；没并进 ANCHORS，免得 Object.keys(STANDS) 的闲逛人走过去 */
export const LAND_ANCHORS = {
  south_courts: { x: -31.5, z: F_SC1.oz },
  oasis_lawn: { x: GOLF_POND.x, z: GOLF_POND.z },
  event_plaza: { x: (SLOPE.x0 + SLOPE.x1) / 2, z: (SLOPE.z0 + SLOPE.z1) / 2 },
  academy_isle: { x: F_ISLE.ox, z: F_ISLE.oz },
} satisfies Record<string, XZ>;
export type LandAnchor = keyof typeof LAND_ANCHORS;

/** 新地上人站在哪儿 */
export const LAND_STANDS: Record<LandAnchor, XZ> = {
  south_courts: { x: -31.5, z: 57 },
  oasis_lawn: { x: -34, z: 60 },
  event_plaza: { x: 70, z: 8.6 },
  academy_isle: { x: 100, z: 103 },
};

/** 哪块地上有哪些新锚点 */
export const PLOT_ANCHORS: Readonly<Record<string, Readonly<Record<string, LandAnchor>>>> = {
  golf_west: { south_courts: 'south_courts', oasis_lawn: 'oasis_lawn' },
  se_corner: { event_plaza: 'event_plaza', academy_isle: 'academy_isle' },
};

/** 旧站位 + 已经开了的新地的站位（Site.stands 想按"哪些地开了"增减时用） */
export function standsWith(open: readonly string[]): Record<string, XZ> {
  const out: Record<string, XZ> = { ...STANDS };
  for (const a of open) if (a in LAND_STANDS) out[a] = LAND_STANDS[a as LandAnchor];
  return out;
}

function hasStand(k: string): boolean {
  return k in STANDS || k in LAND_STANDS;
}

/** 新的路网节点：都是挂在旧节点上的支线（不连两个旧节点，旧的最短路一条也不变） */
const LAND_NODES: Record<string, XZ> = {
  /** 西步道的南头（砌死的南门里边）和门外 */
  s_gate: { x: -36.5, z: 50.5 },
  s_out: { x: -36.5, z: 56.5 },
  /** 车道往东接到岛边，再沿东边往南到桥头；桥那头 */
  se_e: { x: 100, z: 0 },
  se_head: { x: 100, z: 81 },
  isle_foot: { x: 100, z: 99.5 },
  ...Object.fromEntries(Object.entries(LAND_STANDS).map(([k, v]) => [`@${k}`, v])),
};

const LAND_EDGES: readonly (readonly [string, string])[] = [
  ['q_w', 's_gate'],
  ['s_gate', 's_out'],
  ['s_out', '@south_courts'],
  ['s_out', '@oasis_lawn'],
  ['drive', '@event_plaza'],
  ['drive', 'se_e'],
  ['se_e', 'se_head'],
  // 桥：一条单独的导航边
  ['se_head', 'isle_foot'],
  ['isle_foot', '@academy_isle'],
];

Object.assign(NODES, LAND_NODES);
for (const [a, b] of LAND_EDGES) {
  const d = dist(NODES[a] as XZ, NODES[b] as XZ);
  ADJ.set(a, [...(ADJ.get(a) ?? []), [b, d]]);
  ADJ.set(b, [...(ADJ.get(b) ?? []), [a, d]]);
}
