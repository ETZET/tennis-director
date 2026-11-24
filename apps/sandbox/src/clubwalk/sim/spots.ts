// 站位表：clubsite/sim/places.ts 的每个地点在世界里怎么站（坐标、朝向、姿势、排队的线、门）。契约见 ./types.ts。
// 数都从各场景的 layout.ts（站位 SPOTS、摆件 SLOTS、场地 COURTS）来：能 import 的直接 import（clubwalk 可以引用场景），
// 场景里没导出的数照抄，注释写出处。核对：spots.test.ts（个数 = cap、在区域范围里）、
// docs/lab/2026-11-24-clubsim/tools/spotcheck.mjs（每个站位在世界导航里站得住）。
//
// 约定（演出 clubwalk/sim/* 照这个读）：
// - yaw：0 = 朝 +z（南、朝镜头），π/2 = 朝 +x（东）；打球的人朝网，吃饭的人朝桌子，排队的人朝队头，摊主朝客人。
// - 站着的位置不给 y（= 导航的地面高度）；坐着的位置 pose 'sit'：人的原点 = 髋正下方，座高按 0.52（长椅）算 ——
//   座面不是 0.52 的（看台 0.4、吧凳 0.74、裁判椅 1.77…）给 y = 座面高 − 0.52，演出照常 setSeat(0.52) 就坐对了。
//   坐的位置本身在长椅 / 桌凳的脚印里（导航挡着），走过去时停在旁边一步再坐下（spotcheck 查"旁边 1.2 米内站得住"）。
// - 楼上 / 地下（会所 2F、B1）的位置 hidden：人走到 door（一楼楼梯口 / 后门里）就藏起来；坐标照实给（y = 那一层），以后要演再用。
// - 泳池水里的位置 y = 水面下（人泡在水里只露上半身）：演出用最接近的姿势（idle），"游泳"记进 gaps。
// - 一伙人占前几个位置（spots[0..n−1]）：两个人打球 = 网两边各一个，两个人吃饭 = 面对面，所以表里先排"对面"那个。

import { SPOTS as KS } from '../../clubclay/layout';
import { SPOTS as CS, QUEUE as KID_QUEUE } from '../../clubcourts/layout';
import { SPOTS as DS } from '../../clubdesk/layout';
import { PICNIC_XS, PICNIC_Z, TABLE, TABLE_ROWS, TABLE_XS, TRUCK_FLOOR, TRUCKS } from '../../clubfood/layout';
import { SPOTS as GS, TEE } from '../../clubgolf/layout';
import { DOORS as HOUSE_DOORS } from '../../clubhouse/layout';
import { SPOTS as HS } from '../../clubhouse/routes';
import { SPOTS as PS, ROWS, STALL } from '../../clubpark/layout';
import { QUEUE_DOOR, QUEUE_IN } from '../../clubpickle/layout';
import { FOUNTAIN_SPEC, SPOTS as ZS } from '../../clubplaza/layout';
import { SPOTS as LS, H as POOL_H } from '../../clubpool/layout';
import { PLACES } from '../../clubsite/sim/places';
import type { PlaceId } from '../../clubsite/sim/types';
import { COURTS, type Court, FOUNTAIN, POOL } from '../../clubsite/world';
import { seatList } from '../../clubstadium/assets/stands/seats';
import { northTread, SPOTS as SS } from '../../clubstadium/layout';
import type { PlaceSpots, Spot, SpotTable } from './types';

type V2 = readonly [number, number];
const P = Math.PI;
const S_ = 0; // 朝南（+z）
const N_ = P; // 朝北（−z）
const E_ = P / 2; // 朝东（+x）
const W_ = -P / 2; // 朝西（−x）
/** 站座位的人：座高 0.52 的长椅不用 y */
const BENCH = 0.52;
const r2 = (v: number) => Math.round(v * 100) / 100;
/** 从 a 看向 b 的 yaw */
const face = (a: V2, b: V2) => Math.atan2(b[0] - a[0], b[1] - a[1]);
/** 资产本地 (lx, lz) → 世界（资产在 at、转 rot；同各场景 layout 的 local()） */
const local = (at: V2, rot: number, lx: number, lz: number): V2 => [
  r2(at[0] + lx * Math.cos(rot) + lz * Math.sin(rot)),
  r2(at[1] - lx * Math.sin(rot) + lz * Math.cos(rot)),
];
const court = (id: string) => COURTS.find((c) => c.id === id) as Court;

const at = (p: V2, yaw: number, pose?: string, y?: number): Spot => ({
  x: r2(p[0]),
  z: r2(p[1]),
  yaw: r2(yaw),
  ...(y === undefined ? {} : { y: r2(y) }),
  ...(pose ? { pose } : {}),
});
/** 长椅（本地朝 +z，座位 ±0.45、往后 0.05；s 缩放）上的两个座位 */
const bench = (c: V2, rot: number, s = 1): Spot[] =>
  [-0.45, 0.45].map((lx) => at(local(c, rot, lx * s, -0.05), rot, 'sit'));
/**
 * 排队的线：from = 柜台前的位置（spots[0]），pts = 队头往外的点；每个人朝前一个人（队头朝 from）
 */
const queue = (from: V2, pts: readonly V2[]): Spot[] => pts.map((p, k) => at(p, face(p, k === 0 ? from : pts[k - 1])));
/** 自助饮水点：接水的人站 p 朝 yaw，后面等的两个人在他背后一条线上 */
/**
 * 窗口边等取餐的 n 个位置：客人站位 c 的左右两边（sides：1 = 往右手、−1 = 往左手，先给的那边先站），
 * 往后退 back 米、每个隔 gap 米，人朝着窗口（c 前面 1.2 米）。只给一边的（另一边是队）：那一边站两排，不拉成一长串
 */
function pickupAt(
  c: Spot,
  n: number,
  sides: readonly number[] | readonly (readonly [number, number])[] = [1, -1],
  back = 0.35,
  gap = 0.95,
): Spot[] {
  const fx = Math.sin(c.yaw);
  const fz = Math.cos(c.yaw);
  // 右手 = 朝向顺时针转 90°
  const rx = -fz;
  const rz = fx;
  const win: V2 = [c.x + fx * 1.2, c.z + fz * 1.2];
  const out: Spot[] = [];
  // 手摆的：[往右手几米（负 = 左手）, 往后几米]
  if (typeof sides[0] !== 'number') {
    for (const [l, b] of (sides as readonly (readonly [number, number])[]).slice(0, n)) {
      const p: V2 = [r2(c.x + rx * l - fx * b), r2(c.z + rz * l - fz * b)];
      out.push(at(p, r2(face(p, win))));
    }
    return out;
  }
  const rows = sides.length === 1 ? [back, back + 0.9] : [back];
  for (let d = 1.15; out.length < n; d += gap)
    for (const sd of sides as readonly number[])
      for (const b of rows) {
        if (out.length >= n) break;
        const p: V2 = [r2(c.x + rx * sd * d - fx * b), r2(c.z + rz * sd * d - fz * b)];
        out.push(at(p, r2(face(p, win))));
      }
  return out;
}
const tap = (p: V2, yaw: number): PlaceSpots => {
  const back: V2 = [-Math.sin(yaw), -Math.cos(yaw)];
  const pts = [1, 2].map((k) => [p[0] + back[0] * 0.9 * k, p[1] + back[1] * 0.9 * k] as V2);
  return { spots: [at(p, yaw)], queue: queue(p, pts) };
};
/** 从 head 起沿 dir（单位向量）每 step 米一个点，n 个 */
const line = (head: V2, dir: V2, n: number, step = 0.9): V2[] =>
  Array.from({ length: n }, (_, k) => [r2(head[0] + dir[0] * step * k), r2(head[1] + dir[1] * step * k)] as V2);

// ── 网球场：双打四个位置（网在 c.x、东西向）。先排两个底线（两个人 = 单打对打），再排两个网前 ─────────
function tennis(c: Court, eastBack = 12.2): Spot[] {
  return [
    at([c.x - 12.2, c.z + 2.0], E_, 'ready'),
    at([c.x + eastBack, c.z - 2.0], W_, 'ready'),
    at([c.x - 3.6, c.z - 2.4], E_, 'ready'),
    at([c.x + 3.6, c.z + 2.4], W_, 'ready'),
  ];
}
/** 匹克球场：四个人都在厨房线上（同 clubpickle 的 RALLY：离网 2.13 + 0.35） */
function pickle(c: Court): Spot[] {
  const k = 2.48;
  return [
    at([c.x - k - 0.1, c.z - 1.45], E_, 'ready'),
    at([c.x + k, c.z - 1.4], W_, 'ready'),
    at([c.x - k, c.z + 1.45], E_, 'ready'),
    at([c.x + k + 0.1, c.z + 1.4], W_, 'ready'),
  ];
}

// ── 停车场（clubpark/layout.ts 的 ROWS、STALL、AISLE_Z）：每个车位在通道那头站一个人 ────────────
/** 一排车位在通道这一边的站位（离车位边 0.7 米），朝大门（西） */
function lotRow(rowIdx: number, gap?: readonly [number, number]): Spot[] {
  const row = ROWS[rowIdx];
  const z = row.nose < 0 ? row.z1 + 0.7 : row.z0 - 0.7;
  const out: Spot[] = [];
  for (let i = 0; i < STALL.n; i++) {
    if (gap && i >= gap[0] && i <= gap[1]) continue;
    out.push(at([STALL.x0 + STALL.w * (i + 0.5), z], W_));
  }
  return out;
}
// 进出口（clubpark 的 ENTRY）那两个车位没有车：near 两排的 gap [3, 4]
const LOT_N = [...lotRow(1, [3, 4]), ...lotRow(0)];
const LOT_S = [...lotRow(2, [3, 4]), ...lotRow(3)];

// ── 前台（clubdesk/layout.ts SPOTS）───────────────────────────────────────────
const DESK_Q: V2[] = [DS.queue1, DS.queue2, DS.queue3, [58.95, 3.95], [59.3, 2.85], [59.45, 1.75]];

// ── 匹克球（clubpickle/layout.ts：COURTS pickle_1 / pickle_2、QUEUE_IN、QUEUE_DOOR、长椅 A / B 在 x 40.3 / 48.2、z 6.3）──
const PK1 = court('pickle_1');
const PK2 = court('pickle_2');
/** 拍架边排队（1 号场用围场里那几格，2 号场用西门外步道上那几格）；朝拍架 */
const RACK: V2 = [37.45, 5.35];
const PK1_Q: V2[] = [...QUEUE_IN, [37.2, 3.6], [38.4, 3.4]];
const PK2_Q: V2[] = [...QUEUE_DOOR, [34.9, 9.6]];

// ── 喷泉广场（clubplaza/layout.ts）─────────────────────────────────────────────
const FC: V2 = [FOUNTAIN.x, FOUNTAIN.z];
/** 喷泉池外一圈（池壁外沿 basinR 4.6 再往外 0.55）上第 deg 度的点，朝池心 */
const aroundFountain = (deg: number, r: number, pose?: string, y?: number): Spot => {
  const a = (deg * P) / 180;
  const p: V2 = [FC[0] + Math.cos(a) * r, FC[1] + Math.sin(a) * r];
  return at(p, face(p, FC), pose, y);
};
const RIM_R = FOUNTAIN_SPEC.basinR - 0.3;
/** 饮料车（clubplaza：DRINKS_CART (47.9, −32.6) 朝南，摊主在本地 (−0.7, −0.85)）：队往东南排（西南是喷泉池） */
const DRINKS_Q: V2[] = [
  [48.55, -30.45],
  [49.35, -29.95],
  [50.15, -29.45],
  [50.95, -28.95],
  [51.75, -28.45],
  [52.55, -27.95],
];

// ── 中心球场（clubstadium：看台座位 = assets/stands/seats.ts 的 seatList，球员、裁判、球童 = SPOTS）───────────
const SEATS = seatList();
/**
 * 一面看台的座位：每排按左右切成"两个座 + 空一个"的小块，按"前排、居中"先坐小块里的两个座（一伙人挨着坐，
 * 和下一伙隔一个空座，不一排人肩并肩贴着），小块都坐满了才坐空着的那些（表演赛人多时坐满）
 */
function stand(id: 'north' | 'east' | 'south'): Spot[] {
  const mid = id === 'east' ? -21 : 0;
  const axis = (s: (typeof SEATS)[number]) => (id === 'east' ? s.z : s.x);
  const mine = SEATS.filter((s) => s.stand === id);
  const rows = new Map<number, typeof mine>();
  for (const s of mine) rows.set(s.row, [...(rows.get(s.row) ?? []), s]);
  const ranked: { s: (typeof SEATS)[number]; k: number }[] = [];
  for (const [row, list] of rows) {
    list.sort((a, b) => axis(a) - axis(b));
    list.forEach((s, i) => {
      const blk = Math.floor(i / 3);
      const gap = i % 3 === 2;
      const c = list.slice(blk * 3, blk * 3 + 2).reduce((m, q) => m + axis(q), 0) / Math.min(2, list.length - blk * 3);
      ranked.push({ s, k: (gap ? 1000 : 0) + row * 2.2 + Math.abs(c - mid) / 2.5 + (i % 3) * 0.001 });
    });
  }
  return ranked
    .sort((a, b) => a.k - b.k || axis(a.s) - axis(b.s))
    .map(({ s }) => at([s.x, s.z], s.rotY, 'sit', s.y - BENCH));
}
/** 北看台东走道（x 7）第 3 级：卖水的站的地方（clubstadium SLOTS 的 vendor） */
const T3 = northTread(3);

// ── 会员场 · 青训（clubcourts/layout.ts）────────────────────────────────────────
const PE = court('practice_e');
const M1 = court('outer_1');

// ── 红土（clubclay/layout.ts：BENCH_Z 35.0、三张长椅 x 14.6 / 19.4 / 23.9）──────────
const FAR = court('outer_2');
const NEAR = court('outer_3');
const CLAY_BENCH_Z = 35.0;

// ── 会所（clubhouse/routes.ts 的 SPOTS、slots-*.ts 的家具）──────────────────────
const Y2 = 4;
const YB = -4;
/** 楼上 / 地下的人在一楼楼梯口藏起来、冒出来（routes.ts 的 stairMouth） */
const STAIR = { x: HS.stairMouth.at[0], z: HS.stairMouth.at[1] };
/** 后门里（货梯厅）：后厨、洗衣房、员工休息处从这里上下 */
const BACK = { x: HOUSE_DOORS.kitchenBack.in[0], z: HOUSE_DOORS.kitchenBack.in[1] };
/** cafe-table（两张椅子在桌子东西两边 ±0.62，朝桌子；同 slots-2f 露台的人） */
const cafeTable = (c: V2, y?: number): Spot[] => [
  at([c[0] - 0.62, c[1]], E_, 'sit', y),
  at([c[0] + 0.62, c[1]], W_, 'sit', y),
];
const hidden = (spots: Spot[], door = STAIR): PlaceSpots => ({ spots, door, hidden: true });

// ── 泳池（clubpool/layout.ts）────────────────────────────────────────────────
/** 南边四对躺椅（SOUTH_PAIRS，人躺在 z 15.7、朝北看池子）、西边两对（WEST_X −59.4 → 人在 −59.2、朝东） */
const SOUTH_PAIRS = [-57.4, -52.7, -48.0, -43.3];
const WEST_PAIRS = [5.6, 10.6];
/** 泡在水里：脚在水面下 1.1 米（clubpool 的 swimmer：y = 水面 − sink） */
const SWIM_Y = POOL_H.water - 1.1;
/** 泳池的"门"：浅水台阶（POOL_STEPS x −44.5…−43、z 5.5…10.5）东边的池畔 */
const POOL_DOOR = { x: -42.2, z: 8.0 };
const KID_Y = POOL_H.water - 0.75;

// ── 餐车院子（clubfood/layout.ts；小推车的位置、朝向照抄那边没导出的常量）──────────────
const { coffee: TC, taco: TT, pizza: TP } = TRUCKS;
/** 车窗里的摊主（同 clubfood 的 vendor()：车本地 lx、窗口后 0.45、站在车地板上） */
const truckVendor = (t: { x: number; z: number; dep: number }, lx: number) =>
  at([t.x + lx, t.z + t.dep / 2 - 0.25], S_, 'idle', TRUCK_FLOOR);
const AGUA: V2 = [-24.3, -34.2]; // clubfood/layout.ts AGUA、AGUA_ROT
const AGUA_ROT = -0.5;
const PALETA: V2 = [-23.9, -29.2]; // PALETA、PALETA_ROT
const PALETA_ROT = -0.75;
const TRAILER: V2 = [-40.8, -24.6]; // TRAILER、TRAILER_ROT（汉堡拖车，摊主在车里 y 0.7）
const TRAILER_ROT = 0.22;
const BOBA: V2 = [-40.0, -14.4]; // BOBA、BOBA_ROT
const BOBA_ROT = -0.35;
const CHURRO: V2 = [-26.3, -12.6]; // CHURRO、CHURRO_ROT
const CHURRO_ROT = -0.3;
/**
 * 小推车：摊主（车本地 v，朝车的正面）、客人（本地 cu，朝车）+ 排队的点（世界坐标，手摆：院子东边那条只有 3.8 米宽，
 * 两辆车、凉棚的柱子和长桌挤在一起，队要绕开）
 */
function cart(c: V2, rot: number, v: V2, cu: V2, pts: readonly V2[], vendorY?: number, nudge: V2 = [0, 0]) {
  const cust = local(c, rot, cu[0], cu[1]);
  const vp = local(c, rot, v[0], v[1]);
  return {
    post: at([vp[0] + nudge[0], vp[1] + nudge[1]], rot, 'idle', vendorY),
    stall: { spots: [at(cust, rot + P)], queue: queue(cust, pts) } satisfies PlaceSpots,
  };
}
// 鲜果水：客人在车的西南；队贴着凉棚东边的柱子往南，再拐向东（不进长桌）
const agua = cart(
  AGUA,
  AGUA_ROT,
  [-0.7, -0.85],
  [-0.3, 1.25],
  [
    [-25.45, -32.4],
    [-25.3, -31.55],
    [-24.65, -31.0],
    [-24.0, -30.9],
    [-23.05, -30.5],
    [-22.25, -30.25],
  ],
);
// 冰棍：队沿凉棚东边往南（水站在 x −25.6 的西边）
// 摊主在车东头（本地 (1.0, −0.35)，压着车的脚印：往东挪 0.3）
const paleta = cart(
  PALETA,
  PALETA_ROT,
  [1.0, -0.35],
  [-0.2, 1.0],
  [
    [-24.95, -27.75],
    [-25.0, -26.75],
    [-24.6, -25.85],
    [-24.15, -24.95],
    [-23.7, -24.05],
    [-23.25, -23.15],
  ],
  undefined,
  [0.3, 0.08],
);
// 汉堡拖车：队往南横过球员通道（会所正门在西边，不挡门），躲开北边的回收站
const burger = cart(
  TRAILER,
  TRAILER_ROT,
  [0.25, 0.9],
  [0.25, 2.25],
  [
    [-40.15, -21.6],
    [-40.3, -20.75],
    [-40.4, -19.9],
    [-40.45, -19.05],
    [-40.5, -18.2],
    [-40.5, -17.35],
  ],
  0.7,
);
// 奶茶三轮：队往西排进拱廊前小院（东边是草皮角）
// 摊主在三轮后面（本地 (0.72, −0.95)，压着车的脚印：往后挪 0.2）
const boba = cart(
  BOBA,
  BOBA_ROT,
  [0.72, -0.95],
  [-0.08, 1.47],
  [
    [-41.4, -12.75],
    [-42.25, -12.45],
    [-43.1, -12.2],
    [-43.9, -12.4],
    [-44.7, -12.7],
    [-45.4, -13.15],
  ],
  undefined,
  [-0.1, -0.2],
);
// 吉事果：队往东南绕到草皮角东边
const churro = cart(
  CHURRO,
  CHURRO_ROT,
  [0.2, -0.85],
  [-0.2, 1.2],
  [
    [-25.95, -11.0],
    [-24.95, -10.75],
    [-23.95, -10.5],
    [-23.2, -11.15],
    [-22.95, -12.1],
    [-22.7, -12.85],
  ],
);
/** 长桌（TABLE_ROWS × TABLE_XS，桌长 4.2、凳离桌心 0.65）切成两半，每半张四个座：北凳两个、南凳两个，先排面对面 */
function halfTable(row: number, tx: number, half: 0 | 1): Spot[] {
  const xs = half === 0 ? [tx - 1.5, tx - 0.5] : [tx + 0.5, tx + 1.5];
  return xs.flatMap((x) => [at([x, row - TABLE.bench], S_, 'sit'), at([x, row + TABLE.bench], N_, 'sit')]);
}
/** 野餐桌（PICNIC_XS、PICNIC_Z）：两条凳 z ± 0.62，每条两个座（± 0.5） */
const picnic = (x: number): Spot[] =>
  [-0.5, 0.5].flatMap((dx) => [at([x + dx, PICNIC_Z + 0.62], N_, 'sit'), at([x + dx, PICNIC_Z - 0.62], S_, 'sit')]);
const FOOD_Q = {
  // 咖啡车：队笔直往南（西边是手推车、补货堆，东边是凉棚西北角的柱子）
  coffee: line([-37.6, -36.65], [0, 1], 6) as V2[],
  taco: [
    [-31.45, -36.55],
    [-31.75, -35.7],
    [-32.05, -34.85],
    [-32.35, -34.0],
    [-32.0, -33.2],
    [-31.65, -32.4],
  ] as V2[],
  pizza: [
    [-25.85, -36.55],
    [-26.1, -35.7],
    [-26.35, -34.85],
    [-27.0, -34.3],
    [-27.75, -33.8],
    [-28.5, -33.3],
  ] as V2[],
};
const ORDER = {
  coffee: [-37.6, -37.55] as V2,
  taco: [-31.2, -37.4] as V2,
  pizza: [-25.6, -37.4] as V2,
};

const table: Record<PlaceId, PlaceSpots> = {
  // ═════ 停车场 · 到达 ═════
  'park.lotN': { spots: LOT_N },
  'park.lotS': { spots: LOT_S },
  // 落客点：车（clubpark SPOTS.dropoff (67.6, −2.0)，车头朝西）两边下车
  'park.valet': {
    spots: [at([66.9, -0.35], W_), at([68.5, -0.35], W_), at([66.9, -3.75], W_), at([68.5, -3.75], W_)],
  },
  // 走路来的：车道东头（往东出地图去镇上），两边贴着路沿
  'park.walkin': {
    spots: [
      at([88.0, 3.6], W_),
      at([89.0, 3.6], W_),
      at([90.0, 3.6], W_),
      at([88.0, -3.6], W_),
      at([89.0, -3.6], W_),
      at([90.0, -3.6], W_),
    ],
  },
  // 代客：代客台北边（clubpark/life.ts 的 POD_STAND = podium − 0.8）；门童：南门柱外
  'post.park.valet': { spots: [at([PS.podium[0], PS.podium[1] - 0.8], S_)] },
  'post.park.doorman': { spots: [at(PS.doorman, 0.6)] },

  // ═════ 前台 ═════
  'desk.counter': { spots: [at(DS.serve, W_)], queue: queue(DS.serve, DESK_Q) },
  // 自助饮水站（water-station 在 (53.4, 10.55) 朝东）：人站东边朝西
  'desk.water': tap(DS.water, W_),
  // 草坪边的长椅（clubdesk SLOTS bench-lawn (52.4, 18.4)，下沉草坪 −0.5）
  'desk.lawn.bench': { spots: bench([52.4, 18.4], S_) },

  // ═════ 匹克球 ═════
  'pickle.court1': { spots: pickle(PK1), queue: queue(RACK, PK1_Q), door: { x: 36.0, z: 6.0 } },
  'pickle.court2': { spots: pickle(PK2), queue: queue(RACK, PK2_Q), door: { x: 36.0, z: 6.0 } },
  // 场边带的两张长椅（伞下），朝 2 号场
  'pickle.benches': { spots: [...bench([40.3, 6.3], S_), ...bench([48.2, 6.3], S_)], door: { x: 36.0, z: 6.0 } },
  // 场边水站（water-court (50.7, 6.3)）：第二个人等在南边（clubpickle SPOTS.waterNext），不排进长椅 B
  'pickle.water': {
    spots: [at([49.85, 6.3], E_)],
    queue: queue(
      [49.85, 6.3],
      [
        [49.15, 6.9],
        [48.35, 7.2],
      ],
    ),
    door: { x: 36.0, z: 6.0 },
  },
  // 球员草坪（下沉 −0.5）遮阳帆下（clubdesk SLOTS sail-lawn (39.8, 21.0)）：拉伸、热身
  'pickle.lawn': {
    spots: [
      at([39.0, 20.2], 0.3),
      at([40.6, 20.4], -0.3),
      at([39.2, 21.8], 0.5),
      at([40.8, 21.9], -0.4),
      at([42.4, 21.0], -0.6),
      at([49.6, 21.6], 0.3),
    ],
  },

  // ═════ 棕榈喷泉广场 ═════
  'plaza.bench.w': { spots: bench(ZS.benchW, face(ZS.benchW, FC)) },
  'plaza.bench.n': { spots: bench(ZS.benchN, S_) },
  'plaza.bench.prom': { spots: bench([53.4, -9.4], S_) },
  // 坐在喷泉池沿上（池壁 0.6 高：座高 1.2 + 0.6；人背对池子朝外）。一整圈分四处、每处两个挨着的座（一伙人挨着坐），
  // 按南、北、东、西的顺序先坐：陌生人隔着池子坐开，不在南边一小段肩并肩
  'plaza.rim': {
    spots: [80, 100, 260, 280, 350, 10, 170, 190].map((deg) => {
      const s = aroundFountain(deg, RIM_R, 'sit', 1.2 + 0.6 - BENCH);
      return { ...s, yaw: r2(s.yaw + P) };
    }),
  },
  // 孩子玩水：池壁外一圈（南边、西边、东边，朝池子）
  'plaza.fountain': {
    spots: [95, 125, 65, 155, 35, 180].map((deg) => aroundFountain(deg, FOUNTAIN_SPEC.basinR + 0.45)),
  },
  'plaza.drinks': { spots: [at(ZS.drinks, N_)], queue: queue(ZS.drinks, DRINKS_Q) },
  // 饮水点（clubplaza SLOTS drink-fountain (38.6, −14.4) 朝西）
  'plaza.water': tap([37.95, -14.4], E_),
  // 摊主在车后西头（clubplaza 的 vendor 在本地 (−0.7, −0.85)，那里压着车的脚印：往西挪 0.6）
  'post.plaza.drinks': { spots: [at([46.6, -33.45], S_)] },

  // ═════ 中心球场 ═════
  'stadium.stand.n': { spots: stand('north') },
  'stadium.stand.e': { spots: stand('east') },
  'stadium.stand.s': { spots: stand('south') },
  // 长廊边的饮水点（drink-fountain 在 SPOTS.fountain 北边 0.2，朝南）
  'stadium.water': tap([SS.fountain[0] + 0.05, SS.fountain[1] + 0.6], N_),
  // 表演赛：两条底线发球位 + 场边球员椅（换边歇着的那个）
  'post.stadium.pros': {
    spots: [at(SS.serveW, E_, 'ready'), at(SS.serveE, W_, 'ready'), at([SS.benchW[0], SS.benchW[1] + 0.05], S_, 'sit')],
  },
  // 裁判椅上（clubstadium SLOTS umpire：y 1.32）
  'post.stadium.umpire': { spots: [at([SS.umpire[0], SS.umpire[1] + 0.02], S_, 'sit', 1.32)] },
  'post.stadium.ballkids': {
    spots: [
      at(SS.kidNetN, S_, 'bkCrouch'),
      at(SS.kidNetS, N_, 'bkCrouch'),
      at(SS.kidNW, 0.4, 'bkStand'),
      at(SS.kidNE, -0.4, 'bkStand'),
      at(SS.kidSW, N_ - 0.4, 'bkStand'),
      at(SS.kidSE, N_ + 0.4, 'bkStand'),
    ],
  },
  // 看台上卖水的：北看台东走道第 3 级（clubstadium SLOTS vendor：z 前沿 − 0.55、y 踏面 − 0.45）
  'post.stadium.vendor': { spots: [at([7.0, T3.za - 0.55], W_, 'idle', T3.y - 0.45)] },
  // 职业球员的教练：西边球员椅西头的场边（北看台广告板前）
  'post.stadium.coach': { spots: [at([-5.2, -29.45], S_)] },

  // ═════ 会员场 · 青训 ═════
  'courts.member': { spots: tennis(M1), door: { x: -30.5, z: 16.7 } },
  // 青训东场：东头 x 27 以东不在会员场区域里（clubwalk/regions.ts，走底图）→ 东边的人站在后场中间（发球机在 x 18.9 网边）
  'courts.practice': { spots: tennis(PE, 9.6), door: { x: 3.5, z: -2.3 } },
  // 青训：打球的点 + 四个地标（排着的孩子），第二条线在南边 3 米（人多时分两组），孩子朝教练（西）
  'courts.lesson': {
    spots: [
      at(CS.kidHit, W_, 'ready'),
      ...KID_QUEUE.map((p) => at(p, W_)),
      at([CS.kidHit[0], 3.3], W_, 'ready'),
      at([KID_QUEUE[0][0], 3.0], W_),
      at([KID_QUEUE[1][0], 3.0], W_),
    ],
    door: { x: -30.5, z: -2.3 },
  },
  // 家长：伞下长椅（−12.6, −1.2）两个座 + 旁边站着鼓掌的一个（clubcourts SLOTS parent-3）
  // 青训场北围网外的步道（围网 z −2.3，挡风布当墙）：大一点的孩子对着挡风布打（Tommy 等 Sofía 下课），朝南对着网
  'courts.wall': { spots: [at([-6.0, -3.25], S_), at([-9.6, -3.25], S_)] },
  'courts.lesson.parents': {
    spots: [...bench([-12.6, -1.2], S_), at([-9.9, -0.9], -0.5, 'clap')],
    door: { x: -30.5, z: -2.3 },
  },
  // 会员场北边帆下两张长椅（等场、看球）
  'courts.member.bench': {
    spots: [...bench([-19.4, 17.55], S_), ...bench([-14.6, 17.55], S_)],
    door: { x: -30.5, z: 16.7 },
  },
  'courts.practice.bench': { spots: bench([14.6, -1.2], S_), door: { x: 3.5, z: -2.3 } },
  // 会员场水站（water-m (−23.3, 17.4) 朝南）
  'courts.water': { ...tap([-23.3, 18.1], N_), door: { x: -30.5, z: 16.7 } },
  'post.courts.coach': { spots: [at(CS.coach, E_, 'feed')], door: { x: -30.5, z: -2.3 } },

  // ═════ 红土 ═════
  'clay.court1': { spots: tennis(FAR), door: { x: 33.5, z: KS.doorFarE[1] } },
  'clay.court2': { spots: tennis(NEAR), door: { x: 33.5, z: KS.doorNearE[1] } },
  // 近场北边的三张长椅（伞下）+ 记分牌边站着看的一个（clubclay SLOTS spectator-3）
  'clay.courtside': {
    spots: [
      ...bench([KS.spectators[0], CLAY_BENCH_Z], S_),
      ...bench([KS.benchE[0], CLAY_BENCH_Z], S_),
      ...bench([KS.benchW[0], CLAY_BENCH_Z], S_),
      at([26.7, 35.3], -0.25),
    ],
    door: { x: 33.5, z: KS.doorNearE[1] },
  },
  'clay.water': { ...tap([21.4, 35.45], N_), door: { x: 33.5, z: KS.doorNearE[1] } },
  // 裁判椅（clubclay SLOTS umpire：座 1.77）
  'post.clay.umpire': { spots: [at([KS.umpire[0], KS.umpire[1] - 0.02], S_, 'sit', 1.77 - BENCH)] },

  // ═════ 会所 · 一楼（商店层，在导航里）═════
  // 咖啡吧台前点单（routes.ts cafeCounter），队沿商店街往西
  'house.cafe': {
    spots: [at(HS.cafeCounter.at as V2, N_)],
    queue: queue(HS.cafeCounter.at as V2, [
      [-48.75, -23.75],
      [-49.3, -23.0],
      [-50.05, -22.55],
      [-50.8, -22.1],
      [-51.55, -21.65],
      [-52.3, -21.2],
    ]),
  },
  // 咖啡吧后段的两张小圆桌（slots-1f shop-cafe-table-1 / -2）
  'house.cafe.t1': { spots: cafeTable([-52.3, -37.4]) },
  'house.cafe.t2': { spots: cafeTable([-48.9, -37.0]) },
  // 专卖店：收银台前 + 拍子墙、鞋墙、衣架前逛
  'house.proshop': {
    spots: [at([-60.1, -26.3], N_), at([-59.6, -37.4], N_), at([-61.0, -33.2], N_), at([-59.5, -31.0], W_)],
  },
  // 穿线窗口（routes.ts stringWindow）：递拍子、等着取
  'house.stringer': {
    spots: [at(HS.stringWindow.at as V2, N_)],
    queue: queue(HS.stringWindow.at as V2, [
      [-55.95, -22.7],
      [-56.7, -22.4],
      [-57.45, -22.1],
    ]),
  },
  // 商店街长椅（slots-1f shop-bench (−58.4, −23.6)，缩 0.8，朝南）：等拍子的
  'house.hall.bench': { spots: bench([-58.4, -23.6], S_, 0.8) },
  // 纪念品店：收银台前、展示桌边
  'house.merch': {
    spots: [at([-58.6, -15.5], N_), at([-59.6, -17.6], W_), at([-57.3, -17.9], N_)],
  },
  // 运动营养：拱廊上隔着柜台窗买（routes.ts nutritionWindow），队沿拱廊往东
  'house.nutri': {
    spots: [at(HS.nutritionWindow.at as V2, N_)],
    queue: queue(HS.nutritionWindow.at as V2, [
      [-53.4, -11.7],
      [-52.5, -11.5],
      [-51.6, -11.3],
      [-50.7, -11.1],
    ]),
  },
  // 便利店里（kiosk-buyer 在零食架前；冷柜前）
  'house.kiosk': {
    spots: [at([-41.7, -30.4], N_), at([-44.1, -31.6], N_)],
    door: { x: HOUSE_DOORS.kitchen.in[0], z: HOUSE_DOORS.kitchen.in[1] },
  },
  // 南拱廊的两张长椅（slots-ext loggia-bench-1 朝南、loggia-bench-2 朝西）
  'house.loggia': { spots: [...bench([-60.4, -10.85], S_), ...bench([-47.8, -12.0], W_)] },
  'post.house.proshop': { spots: [at([-60.2, -28.0], S_)] },
  'post.house.stringer': { spots: [at([-55.4, -26.4], S_)] },
  'post.house.barista': { spots: [at([-48.2, -27.2], S_)] },
  'post.house.merch': { spots: [at([-58.6, -17.0], S_)] },
  'post.house.nutri': { spots: [at([-54.3, -14.4], S_)] },
  'post.house.kiosk': { spots: [at([-44.9, -28.6], S_)] },
  'post.house.delivery': { spots: [at(HS.goodsDrop.at as V2, W_)] },

  // ═════ 会所 · 二楼（藏着，一楼楼梯口进出）═════
  // 酒吧：两张吧凳（座 0.74，朝北对着吧台）+ 高脚桌两边站着
  'house.bar2f': hidden([
    at([-49.6, -26.8], N_, 'sit', Y2 + 0.74 - BENCH),
    at([-48.6, -26.8], N_, 'sit', Y2 + 0.74 - BENCH),
    at([-48.9, -23.05], S_, 'sip', Y2),
    at([-48.9, -21.75], N_, 'sip', Y2),
  ]),
  // 休息室：壁炉前两张对着的沙发（座 0.45）
  'house.lounge2f': hidden([
    at([-59.8, -25.9], E_, 'sit', Y2 + 0.45 - BENCH),
    at([-56.2, -26.9], W_, 'sit', Y2 + 0.45 - BENCH),
    at([-59.8, -26.9], E_, 'sit', Y2 + 0.45 - BENCH),
    at([-56.2, -25.9], W_, 'sit', Y2 + 0.45 - BENCH),
  ]),
  // 露台三张小圆桌（slots-2f TERRACE_TABLES，座 0.45）、两张躺椅
  'house.terrace.t1': hidden(cafeTable([-59.8, -12.8], Y2 + 0.45 - BENCH)),
  'house.terrace.t2': hidden(cafeTable([-55.8, -12.8], Y2 + 0.45 - BENCH)),
  'house.terrace.t3': hidden(cafeTable([-51.8, -12.8], Y2 + 0.45 - BENCH)),
  'house.terrace.loungers': hidden([
    at([-58.6, -16.9], S_, 'sit', Y2 + 0.42 - BENCH),
    at([-57.7, -16.9], S_, 'sit', Y2 + 0.42 - BENCH),
  ]),
  'post.house.bartender': hidden([at([-49.3, -28.6], S_, 'idle', Y2)]),
  'post.house.server': hidden([at(HS.lounge.at as V2, N_, 'idle', Y2)]),
  'post.house.cook': hidden([at([-42.6, -36.5], S_, 'idle', Y2)], BACK),

  // ═════ 会所 · 负一层（健身房、更衣，藏着）═════
  // 自由重量、器械、有氧、拳击、雪橇（slots-b1 的人站的地方 + 没人的器械）：人在器械的脚印里，同坐的位置（旁边能站）
  'house.gym': hidden([
    at([-56.3, -36.6], S_, 'idle', YB),
    at([-61.4, -39.8], S_, 'idle', YB),
    at([-58.9, -39.8], S_, 'idle', YB),
    at([-51.9, -39.4], S_, 'idle', YB),
    at([-51.9, -35.2], S_, 'idle', YB),
    at([-48.0, -39.8], S_, 'idle', YB),
    at([-61.0, -13.5], S_, 'idle', YB),
    at([-56.8, -10.6], N_, 'idle', YB),
    at([-53.85, -8.4], S_, 'idle', YB),
    at([-55.0, -8.4], S_, 'idle', YB),
    at([-57.6, -8.57], S_, 'idle', YB),
    at([-51.7, -8.6], S_, 'idle', YB),
  ]),
  // 团课房：垫子两排四个（gym-mats (−56.6, −28.4)），朝北对着教练台
  'house.gymclass': hidden(
    [-57.8, -56.6, -55.4].flatMap((x) => [at([x, -29.4], N_, 'idle', YB), at([x, -27.4], N_, 'idle', YB)]).slice(0, 6),
  ),
  // 理疗：两张床（gym-physio-1 / -2，躺上去座 0.75）
  'house.physio': hidden([
    at([-56.9, -20.3], S_, 'sit', YB + 0.75 - BENCH),
    at([-58.2, -20.3], S_, 'sit', YB + 0.75 - BENCH),
  ]),
  // 更衣室：男女各两张长凳（缩 0.8，朝南）+ 长凳南边站着换鞋的
  'house.locker': hidden([
    ...bench([-52.65, -13.9], S_, 0.8).map((s) => ({ ...s, y: YB })),
    ...bench([-48.65, -13.9], S_, 0.8).map((s) => ({ ...s, y: YB })),
    at([-51.3, -12.9], N_, 'idle', YB),
    at([-47.3, -12.9], N_, 'idle', YB),
  ]),
  'post.house.gymdesk': hidden([at([-51.8, -21.75], S_, 'idle', YB)]),
  'post.house.gymcoach': hidden([at([-56.6, -31.0], S_, 'idle', YB)]),
  'post.house.physio': hidden([at([-56.05, -20.7], W_, 'idle', YB)]),
  'post.house.laundry': hidden([at([-41.6, -39.6], S_, 'idle', YB)], BACK),
  // 员工休息处：负一层储藏间（东翼底下，后门下去）
  'staff.house': hidden(
    [-44.6, -43.6, -42.6, -41.6].flatMap((x) => [-29.4, -28.2].map((z) => at([x, z], S_, 'idle', YB))),
    BACK,
  ),

  // ═════ 泳池 ═════
  // 水里：三条泳道 × 四段（避开东头浅水台阶 x > −44 那块）
  // 下水、上岸都走东头的浅水台阶（POOL_STEPS）：门在台阶东边的池畔上（水里不在导航里，演出从门直着游过去）
  'pool.water': {
    spots: [5.0, 8.0, 11.0].flatMap((z, i) =>
      [-55.5, -52.5, -49.5, -46.5].map((x, k) => at([x, z], (i + k) % 2 ? E_ : W_, 'idle', SWIM_Y)),
    ),
    door: POOL_DOOR,
  },
  // 浅水台阶下（POOL_STEPS x −44.05…−42.55、z 5.5…10.5 的西边）：孩子玩水
  'pool.kids': {
    spots: [
      at([-44.7, 6.5], W_, 'idle', KID_Y),
      at([-44.7, 8.0], W_, 'idle', KID_Y),
      at([-44.7, 9.5], W_, 'idle', KID_Y),
      at([-45.7, 7.2], E_, 'idle', KID_Y),
    ],
    door: POOL_DOOR,
  },
  // 池边泡脚（北池沿，同 clubpool SLOTS edge-sit：坐在池沿 0.53、脚在水里）
  'pool.edge': {
    spots: [-46.4, -48.4, -50.6, -53.4].map((x) => at([x, POOL.z0 + 0.2], S_, 'sit', 0.53 - BENCH)),
  },
  'pool.loungers.s': {
    spots: SOUTH_PAIRS.flatMap((cx) => [at([cx - 0.5, 15.7], N_, 'sit'), at([cx + 0.5, 15.7], N_, 'sit')]),
  },
  'pool.loungers.w': {
    spots: WEST_PAIRS.flatMap((cz) => [at([-59.2, cz - 0.5], E_, 'sit'), at([-59.2, cz + 0.5], E_, 'sit')]),
  },
  // 两座凉亭（cabana 3.2 × 2.6，clubpool SLOTS cabana-w-sit (−58.9, 1.1)）
  // 坐在帐篷前沿（z 1.5，往南 1 米就是池畔能站的地方）
  'pool.cabana.w': { spots: [at([-58.9, 1.5], S_, 'sit'), at([-57.9, 1.5], S_, 'sit')] },
  'pool.cabana.e': { spots: [at([-41.1, 1.5], S_, 'sit'), at([-42.1, 1.5], S_, 'sit')] },
  // 救生员高椅（座 1.8，站在平台 0.45 上）
  'post.pool.lifeguard': { spots: [at([LS.guard[0], LS.guard[1] + 0.05], S_, 'sit', POOL_H.deck + 1.8 - BENCH)] },

  // ═════ 高尔夫 ═════
  // 发球台（TEE 5.2 × 3.6，垫高 0.35）：挥杆的、等着的
  'golf.tee': {
    spots: [
      at(GS.tee, S_, 'idle'),
      at(GS.teeWait, W_),
      at([TEE.x + 1.8, TEE.z + 1.0], W_),
      at([TEE.x - 2.0, TEE.z - 1.2], W_),
    ],
  },
  // 果岭：推杆的、扶旗的、两个看的
  'golf.green': {
    spots: [at(GS.putt, face(GS.putt, GS.pin)), at(GS.pin, E_ - 0.4), at([-41.0, 64.2], N_), at([-43.4, 64.6], N_)],
  },

  // ═════ 餐车院子 ═════
  'food.coffee': { spots: [at(ORDER.coffee, N_)], queue: queue(ORDER.coffee, FOOD_Q.coffee) },
  'food.taco': { spots: [at(ORDER.taco, N_)], queue: queue(ORDER.taco, FOOD_Q.taco) },
  'food.pizza': { spots: [at(ORDER.pizza, N_)], queue: queue(ORDER.pizza, FOOD_Q.pizza) },
  'food.agua': agua.stall,
  'food.paleta': paleta.stall,
  'food.burger': burger.stall,
  'food.boba': boba.stall,
  'food.churro': churro.stall,
  'post.food.coffee': { spots: [truckVendor(TC, -0.3)] },
  'post.food.taco': { spots: [truckVendor(TT, 0.2)] },
  'post.food.pizza': { spots: [truckVendor(TP, 1.0)] },
  'post.food.agua': { spots: [agua.post] },
  'post.food.paleta': { spots: [paleta.post] },
  'post.food.burger': { spots: [burger.post] },
  'post.food.boba': { spots: [boba.post] },
  'post.food.churro': { spots: [churro.post] },
  // 凉棚下六张长桌各切两半 = 十二伙人的桌：a / b / c = 北 / 中 / 南排，1–4 = 从西往东
  ...Object.fromEntries(
    TABLE_ROWS.flatMap((row, r) =>
      TABLE_XS.flatMap((tx, k) =>
        ([0, 1] as const).map((h) => [`food.table.${'abc'[r]}${k * 2 + h + 1}`, { spots: halfTable(row, tx, h) }]),
      ),
    ),
  ),
  'food.picnic.1': { spots: picnic(PICNIC_XS[0]) },
  'food.picnic.2': { spots: picnic(PICNIC_XS[1]) },
  'food.picnic.3': { spots: picnic(PICNIC_XS[2]) },
  // 孩子的草皮角（clubfood SLOTS kid-throw、kid-wait、kid-jenga + 一个）、看孩子的家长
  'food.lawn': {
    // 第三个往草皮里挪半米（东边是吉事果车等餐的人）
    spots: [
      at([-35.0, -11.4], E_),
      at([-35.6, -12.6], E_ + 0.3),
      at([-29.7, -11.35], N_ + 0.4),
      at([-30.45, -12.4], W_),
    ],
  },
  'food.lawn.watch': { spots: [at([-33.3, -10.2], N_ - 0.3, 'sip'), at([-32.2, -10.1], N_ + 0.2)] },
  // 自助水站（water-station (−25.6, −23.6) 朝西）：西边贴着凉棚东南角的柱子，人站南边朝北
  'food.water': tap([-25.7, -22.85], N_),
  // 摊主歇班：车后面那条缝（z −42.4…−40.8，摊主上下车的地方）
  'staff.food': {
    spots: [at([-35.0, -41.6], S_), at([-34.3, -41.6], S_), at([-28.4, -41.7], S_), at([-22.0, -41.6], S_)],
  },
};

/**
 * 窗口边等取餐（地点表的 pickup）：客人站位的哪一边先站（1 = 右手、−1 = 左手），不给 = 两边轮着。
 * 队在哪边就站另一边；车挨着车的那边留给隔壁的车。
 */
const PICKUP_SIDES: Record<PlaceId, readonly number[] | readonly (readonly [number, number])[]> = {
  // 咖啡吧：队往西，等餐的站东边（吧台延长段的脚印到 x −47.1）
  'house.cafe': [
    [1.05, 0.35],
    [1.05, 1.25],
    [2.5, 0.35],
  ],
  'house.nutri': [-1],
  'plaza.drinks': [-1],
  // 鲜果水：右手是自己的队拐弯的地方、左手再远是披萨车的队：右手两个、左手一个、右手后排一个
  'food.agua': [
    [1.15, 0.35],
    [-0.85, 0.35],
    [2.05, 0.35],
    [1.15, 1.25],
  ],
  'food.boba': [1],
  // 吉事果：队往东，等餐的站西边两排（再西是草皮角）
  'food.churro': [
    [-1.15, 0.35],
    [-1.15, 1.25],
    [-2.0, 0.35],
    [-2.0, 1.25],
  ],
  // 汉堡拖车：东边第二个往后半步（回收站的边）
  'food.burger': [
    [1.15, 0.35],
    [-1.15, 0.35],
    [2.05, 0.75],
    [-2.05, 0.35],
  ],
};
for (const p of PLACES) {
  const n = p.pickup ?? 0;
  const t = table[p.id];
  if (!n || !t || t.pickup) continue;
  t.pickup = pickupAt(t.spots[0], n, PICKUP_SIDES[p.id]);
}

export const SPOTS: SpotTable = table;
