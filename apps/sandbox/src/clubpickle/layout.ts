// clubpickle 的构图：前台西边的匹克球围场（两片场 + 中间一条场边生活带）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）：PICKLE、COURTS（pickle_1 / pickle_2）、PATHS、LAWN 从那边 import，只读。
// 和 clubdesk 重叠的部分（围网、步道、广场挡土墙、下沉草坪、前台、门、植物）原样用 clubdesk 的数据（只读 import 它的 layout），
// 两个场景画的是同一块地。这里只放这个场景自己的东西（取景、场边那一排、站位、路线、资产位置）。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面，横屏 1280×720 是 57.6 × 32.4 米。
//
//          x 34.8  36(西围网)  37.3        44(网)        50.7  52(东围网) 52.4
//   z −19  ┌────────────────────────────────────────────────────────┐  竖屏取景（tx 43.6、tz 6.5）
//          │ 喷泉广场（+1.2，石板）—— 喷泉在画外                     │
//   z −12  │ ▓▓台阶▓▓▓▓▓▓▓ 广场挡土墙（暗带 1）▓▓▓▓▓▓ 台阶 ▓▓▓▓▓▓▓▓▓│
//          │ 灌木          蒲葵（左上框）          ……                │
//   z −6.5 │ ════ 长廊（碎花岗岩）：拿着拍子去球场的人 ═══════════════│
//   z −3   │ ║▓▓▓▓▓▓▓▓ 北围网（挡风布 2.2，暗带 2）+ 投影 ▓▓▓▓▓▓▓▓▓▓│
//          │ ║ 1 号场（停用：网松了）· 散落的球 · 翻倒的球篮          │
//   z 5    │ ║门 拍架 ☂长椅  捡球篮 总监▐网柱  记分牌  ☂长椅  水 器材箱│ ← 场边生活带（z 5…7）
//   z 7    │ ║ 2 号场：双打，四个人都压在厨房线上 dink（主角）        │
//   z 15   │ ║▓▓▓▓▓▓▓▓ 南围网（暗带 3）▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
//   z 16   │ ════ 去草坪的小路（clubdesk 的 SCENE_PATHS）═══════════════│
//   z 17   │ ▓▓ 草坪北沿矮墙（下沉 0.5，暗带 4）▓▓ 台阶 ▓▓              │
//          │ 遮阳帆   假紫荆（下框）   拉伸的人  长椅                    │
//   z 33   └────────────────────────────────────────────────────────┘
//
// 原则：主角 = 2 号场的双打（四个人在厨房线上）+ 场边那一排（中间一条最热闹的带），1 号场停用、总监在网柱边绷网（第二焦点）；
// 两片场面是大块安静的蓝，网两边的深色厨房带是匹克球一眼认得出的记号；北、南围网 + 广场挡土墙 + 草坪矮墙四条暗带分层。
// 视线：左边南北步道 → 西门 → 拍架（排队）→ 场边一排往右 → 总监 → 记分牌 → 水站；2 号场的球在网上来回。

import {
  CANOPY,
  CLIP,
  CLOUD_VEL,
  CLOUDS,
  COUNTER,
  SLOTS as DESK_SLOTS,
  type Slot as DeskSlot,
  GATE_SPEC,
  HEAD_LINE_Z,
  STAIRS,
  WALL,
} from '../clubdesk/layout';
import { rampFromStairs, stairCheeks } from '../clubsite/play/nav';
import { COURTS, type Court, FORECOURT, GATE, LAWN, PATHS, PICKLE, PLAZA, type Rect, type V2 } from '../clubsite/world';

export type { Court, Rect, V2 };
export { CLOUD_VEL, CLOUDS, LAWN, PATHS, PICKLE };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

// ── 球场（匹克球标准尺寸；和 clubdesk/terrain.ts 的 paintCourt 一样画）──────────
/** 匹克球场：长 13.41（沿 x）、宽 6.1（沿 z）、厨房（非截击区）离网 2.13；网柱在边线外 0.3；场面平涂比线外多 0.6 / 0.36 */
export const PK = {
  L: 13.41,
  W: 6.1,
  NVZ: 2.13,
  postOut: 0.3,
  padX: 0.6,
  padZ: 0.36,
  netH: 0.86,
  postH: 0.914,
} as const;
const court = (id: string) => COURTS.find((c) => c.id === id) as Court;
/** 1 号场（北）：这一轮停用 —— 网松了，总监在南网柱边重新绷网；场上散着球 */
export const COURT1 = court('pickle_1');
/** 2 号场（南，离镜头近）：双打 */
export const COURT2 = court('pickle_2');
/** 网柱（每片两根：北柱、南柱），z = 场中心 ± (半宽 + 0.3) */
export const posts = (c: Court): [V2, V2] => [
  [c.x, c.z - PK.W / 2 - PK.postOut],
  [c.x, c.z + PK.W / 2 + PK.postOut],
];

/**
 * 场边生活带：两片场的场面（含 0.36 米的线外漆）中间那条 2 米宽的绿色场边（surround）。
 * 西门（clubdesk 的围网在西边 z 4.5…7.5 留了 3 米的门）正对着它：人从南北步道进门就走在这条带上。
 * 拍架、长椅 + 遮阳伞、记分牌、水站、器材箱都排在这里（画面正中一条最热闹的带）。
 */
export const STRIP: Rect = {
  x0: PICKLE.x0,
  x1: PICKLE.x1,
  z0: COURT1.z + PK.W / 2 + PK.padZ,
  z1: COURT2.z - PK.W / 2 - PK.padZ,
};
/** 西门（和地图的 PICKLE_DOORS 一致：clubsite/world.ts，各场景的 terrain.ts 都按它拉围网） */
export const WEST_DOOR = { x: PICKLE.x0, z0: 4.5, z1: 7.5 } as const;

/**
 * 相机默认看向的地面点。竖屏：x 34.8…52.4 —— 左边露出南北步道（x 34…36，西门外）、右边刚好到东围网外 0.4 米（到达小院的陶砖边）；
 * 上沿 z ≈ −19（广场 +1.2，喷泉在画外），下沿 z ≈ 33（草坪）。围场（北围网顶 → 南围网脚）占画面高的 38%，稍偏上。
 * 横屏（x 13.7…71.3）：围场在正中偏右一点；左边是练习硬地场的东半（网在 x 17），右边三分之一是前台、大门和门外的落客区（clubdesk 的那一套）。
 */
export const TARGET = {
  portrait: { x: 43.6, z: 6.5 },
  landscape: { x: 42.5, z: 5.6 },
};

/** 太阳：同 clubpark / clubdesk（仰角 44°，方位偏东 8° → 影子几乎正对镜头往下落，略偏左） */
export const SUN = { el: 44, az: 8 };

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
const [, c1South] = posts(COURT1);
const [c2North] = posts(COURT2);
/**
 * 站位（世界 x, z）。
 * - netCrank1：总监在 1 号场南网柱边摇绞盘（重新绷网；面朝东北对着网柱）。netCrank2 = 2 号场北网柱（同一条带上，背对背）。
 * - basket：捡球篮（复用 ball-hopper，立着）——总监捡完球倒进去。
 * - gearBox：器材箱前（备用网、绞盘摇把、捡球管）。water：水站前（会员接水 / 总监换桶）。
 * - rackDrop：拍架前（来打球的人把拍子插进架子排队 = 匹克球场的"挂拍排队"）。
 * - scoreFlip：记分牌前（打完一分翻牌）。
 * - doorOut / doorIn：西门外 / 里（南北步道 → 场边带）。serviceGate：东围网北头的员工小门（z −2.0…−0.8；地图 PICKLE_DOORS，2026-11-08 采纳了提议 2）。
 */
export const SPOTS = {
  netCrank1: [c1South[0] - 0.45, c1South[1] + 0.5] as V2,
  netCrank2: [c2North[0] - 0.45, c2North[1] - 0.5] as V2,
  basket: [42.5, 5.45] as V2,
  gearBox: [51.55, 6.4] as V2,
  water: [49.85, 6.3] as V2,
  rackDrop: [37.45, 6.2] as V2,
  scoreFlip: [45.8, 6.95] as V2,
  doorOut: [35.3, 6.0] as V2,
  doorIn: [36.7, 6.0] as V2,
  serviceGate: [52.6, -1.4] as V2,
  /** 1 号场捡球的路线起点（西北角）和终点（回到捡球篮） */
  sweepStart: [38.2, -0.6] as V2,
  promWest: [35.5, -6.5] as V2,
  promEast: [52.0, -6.5] as V2,
  lawnPath: [44.0, 15.9] as V2,
  // ── stage 3 ──
  /** 备用水桶：前台凉棚北边（到达小院里，东围网外）—— 总监从员工小门出去拿 */
  jugSpare: [53.0, 0.9] as V2,
  /** 捡球器靠在捡球篮西边（不拿的时候） */
  pickerRest: [41.75, 5.45] as V2,
  /** 撑伞（伞 B 的杆西边） */
  umbrellaB: [47.45, 5.5] as V2,
  /** 喝水排第二个的人等在这里 */
  waterNext: [49.15, 6.9] as V2,
} satisfies Record<string, V2>;

// ── stage 3：演出（life.ts）和玩法（play.ts）用的数据 ──────────────────────
/** 场边带上人走的那条线（长椅、记分牌、水站的前沿以南，2 号场北边线以北） */
export const STRIP_LANE = 6.9;
/** 排队：拍架旁边站 3 个 + 1 号场西头围网边 1 个（拍子插在架上；离伞 A 下的长椅远一点，不和观众叠在一起），再多的站到西门外的步道上（第 7 个起拍架满了，没地方插 → 跺脚） */
export const QUEUE_IN: V2[] = [
  [38.7, 6.55],
  [38.15, 6.85],
  [38.85, 5.8],
  [36.4, 4.2],
];
export const QUEUE_DOOR: V2[] = [
  [35.05, 4.3],
  [35.5, 3.5],
  [34.85, 7.9],
  [35.45, 8.7],
  [34.7, 2.8],
];
/** 拍架的槽数（paddle-rack 的 setPaddles 0..6） */
export const RACK_MAX = 6;
/** 来打球的人：长廊西头（横屏画外）→ 南北步道往南 → 西门外 */
export const ARRIVE: V2[] = [
  [12.0, -6.4],
  [34.9, -6.4],
  [35.1, -3.0],
  [35.2, 2.0],
];
/** 打完的人：西门 → 南北步道往南 → 去草坪的小路往东 → 前台南边的小路往北 → 到达小院 → 大门出去（横屏画外） */
export const LEAVE: V2[] = [
  SPOTS.doorIn,
  SPOTS.doorOut,
  [35.0, 9.0],
  [35.1, 15.9],
  [55.8, 15.9],
  [55.9, 11.4],
  [58.0, 6.0],
  [60.0, 0.6],
  [76.0, 0.6],
];
/** 长廊上来回走的人（两头都在横屏画外） */
export const PROM_X: [number, number] = [10.0, 76.0];

/**
 * 总监的导航（clubsite/play 的 NavSpec 形状：Rect / Circle / Seg / Poly）。
 * 能走：围场里（南边 z ≤ 12.8：再往南被南围网挡住半身）、南北步道、长廊、去草坪的小路、到达小院（整块，到东墙里面的脸）和大门、
 * 广场挡土墙前的绿带、广场南边一片、草坪北沿一条（广场、草坪走台阶上下）。
 * 挡路：四边围网（胶囊，西门和东北员工小门留口）、两张网 + 网柱、拍架、两把伞的杆、两张长椅、记分牌、水站、器材箱、捡球篮、
 * 前台那边（同 clubdesk：凉棚下 HEAD_LINE_Z 以北、柜台、凉棚西南柱、毛巾车、水站、今日场地板）、门柱、陶罐、植物、两张长椅。
 */
const SOUTH_HIDE_Z0 = PICKLE.z1 - 2.2;
/**
 * 围网胶囊：半径 0.1 = 画出来的柱子半宽（fence-screen 的柱 0.18 见方、顶杆 0.12、底杆 0.16）。
 * 门边的线段端点就在门边：端头的半圆只伸进门洞 0.1（和门框柱一样），1.2 米的员工小门留得下 0.44 米宽的一条给身体中心走。
 */
const fence = (a: V2, b: V2) => ({ a, b, r: 0.1 });
const netSeg = (c: Court) => ({ a: [c.x, c.z - 3.35] as V2, b: [c.x, c.z + 3.35] as V2, r: 0.18 });
/** 东墙里面的脸（墙心 x 60、厚 0.7；同 clubdesk/play.ts 的 WALL_IN）：墙里能走的到这里为止 */
const WALL_IN = GATE.x - WALL.t / 2;
/**
 * 导航网格范围：西到这个场景画到的地方（clubdesk 的 CLIP.x0：长廊一直画到那里，来打球的人从那头走来）、
 * 北到广场上（竖屏上沿 z ≈ −19，喷泉池在外），南到下草坪的台阶脚下再 0.6 米
 */
const NAV_BOUNDS: Rect = { x0: CLIP.x0, x1: 62, z0: -19, z1: 18.6 };
/** 挡路的植物（同 clubdesk/play.ts 的 PLANT_R：按资产 id 的树干/株半径，乘 slot 的缩放；摆在高处的不算） */
const PLANT_R: Record<string, number> = {
  'fan-palm': 0.45,
  'palo-verde': 0.45,
  'smoke-tree': 0.5,
  creosote: 0.6,
  brittlebush: 0.45,
  agave: 0.6,
};
/** 广场两段台阶、下草坪一段 */
const RAMPS = STAIRS.map(rampFromStairs);
export const NAV = {
  bounds: NAV_BOUNDS,
  walkable: [
    { x0: PICKLE.x0, x1: PICKLE.x1, z0: PICKLE.z0, z1: SOUTH_HIDE_Z0 },
    { x0: 33.6, x1: 36.2, z0: -8.6, z1: 16.6 },
    { x0: NAV_BOUNDS.x0, x1: WALL_IN, z0: -8.6, z1: -4.4 },
    { x0: 33.6, x1: 56.8, z0: 15.25, z1: 16.6 },
    // 到达小院（地图的 FORECOURT，整块；凉棚下、柜台在 blocked 里扣掉，同 clubdesk）；西边多 0.6 米接上员工小门
    { x0: 51.6, x1: WALL_IN, z0: FORECOURT.z0, z1: FORECOURT.z1 },
    // 门洞 → 门外（同 clubdesk：门洞 z 两边各收 0.05）
    { x0: WALL_IN - 0.5, x1: NAV_BOUNDS.x1, z0: GATE.z0 + 0.05, z1: GATE.z1 - 0.05 },
    // 广场（+1.2）南边一片、广场挡土墙和长廊之间的绿带、去草坪的小路以南到草坪里（−0.5）一条：高差由 groundAt 给，
    // 挡土墙 / 草坪矮墙的高差 > stepUp 挡住，只能走 STAIRS（下面的 ramps；同 clubdesk）
    { x0: PLAZA.x0, x1: PLAZA.x1, z0: NAV_BOUNDS.z0, z1: PLAZA.z1 },
    { x0: PLAZA.x0, x1: WALL_IN, z0: PLAZA.z1, z1: -8.6 },
    { x0: 33.6, x1: LAWN.x1, z0: 16.6, z1: NAV_BOUNDS.z1 },
    { x0: 54.8, x1: 56.8, z0: FORECOURT.z1, z1: 15.25 },
  ],
  blocked: [
    // 围网（西门 z 4.5…7.5、东北员工小门 z −2.0…−0.8 留口）
    fence([PICKLE.x0, PICKLE.z0], [PICKLE.x1, PICKLE.z0]),
    fence([PICKLE.x0, PICKLE.z0], [PICKLE.x0, 4.5]),
    fence([PICKLE.x0, 7.5], [PICKLE.x0, PICKLE.z1]),
    fence([PICKLE.x1, PICKLE.z0], [PICKLE.x1, -2.0]),
    fence([PICKLE.x1, -0.8], [PICKLE.x1, PICKLE.z1]),
    // 两张网（网身 + 网柱）
    netSeg(COURT1),
    netSeg(COURT2),
    // 场边带的家具
    { x0: 36.6, x1: 38.3, z0: 5.12, z1: 5.58 }, // 拍架
    { x: 40.3, z: 5.25, r: 0.32 }, // 伞 A 的杆和配重
    { x: 48.2, z: 5.25, r: 0.32 }, // 伞 B
    { x0: 39.38, x1: 41.22, z0: 6.02, z1: 6.6 }, // 长椅 A（含坐着的人的脚）
    { x0: 47.28, x1: 49.12, z0: 6.02, z1: 6.6 }, // 长椅 B
    { x0: 45.1, x1: 46.5, z0: 6.22, z1: 6.58 }, // 记分牌
    { x: 50.7, z: 6.3, r: 0.42 }, // 水站
    { x0: 51.12, x1: 51.98, z0: 5.32, z1: 5.88 }, // 器材箱
    { x: 42.5, z: 5.45, r: 0.34 }, // 捡球篮
    // 前台那边（同 clubdesk/play.ts 的 deskNav）：凉棚下帽子会被帆布挡住的那块（HEAD_LINE_Z 以北，含后柜和北边两根柱）不让进、
    // 柜台两段、凉棚南边西柱；毛巾车、水站、今日场地板按资产的包围盒（四边缩 0.04，同 clubdesk 的 footprint）
    { x0: CANOPY.x0, x1: CANOPY.x1, z0: CANOPY.z0, z1: HEAD_LINE_Z },
    COUNTER.east,
    COUNTER.south,
    { x: 52.6, z: 9.0, r: 0.2 },
    { x0: 52.71, x1: 54.01, z0: 8.44, z1: 8.96 },
    { x0: 53.1, x1: 53.7, z0: 10.15, z1: 10.95 },
    { x0: 56.69, x1: 57.59, z0: 3.02, z1: 3.83 },
    // 大门的两根门柱（1.7 见方，柱心 x 60、z = 门洞两边各外 0.8；同 clubdesk）
    ...GATE_SPEC.pierZ.map((z) => ({
      x0: GATE.x - GATE_SPEC.pier / 2,
      x1: GATE.x + GATE_SPEC.pier / 2,
      z0: z - GATE_SPEC.pier / 2,
      z1: z + GATE_SPEC.pier / 2,
    })),
    // 门里北边的陶罐（上面种着龙舌兰；同 clubdesk）
    { x: 58.4, z: -7.3, r: 0.45 },
    // 绿带上的长椅、草坪北沿的长椅（资产包围盒四边缩 0.04，同 clubdesk 的 footprint）
    { x0: 52.49, x1: 54.31, z0: -9.76, z1: -9.16 },
    { x0: 51.49, x1: 53.31, z0: 18.04, z1: 18.64 },
    // 植物（clubdesk 的 SLOTS：绿带上的蒲葵、龙舌兰、灌木，草坪上的假紫荆……）
    ...DESK_SLOTS.filter((s) => PLANT_R[s.asset] && (s.y ?? 0) < 0.5).map((s) => ({
      x: s.x,
      z: s.z,
      r: PLANT_R[s.asset] * (s.s ?? 1),
    })),
    // 台阶两侧的挡路条（同 clubplaza 的 PLAZA-7）：台阶两侧的地面 = 台阶低的那头（广场两段是地面 0，下草坪那段是草坪 −0.5）
    ...RAMPS.flatMap((r) => stairCheeks(r, Math.min(r.from, r.to))),
  ],
  /** 广场两段台阶、下草坪一段（同 clubdesk：按坡道插高度） */
  ramps: RAMPS,
};

/**
 * 路线：
 * - player：南北步道往南 → 西门 → 拍架（插拍子排队）→ 场边带 → 上 2 号场（西半场）。
 * - director-in：前台（clubdesk 的接待位那边）→ 到达小院往北绕过凉棚 → 建议的东北员工小门 → 1 号场东头 → 南网柱。
 *   （没有那扇门的话要走长廊 → 南北步道 → 西门，≈ 35 米，见提议 2。）
 * - director-sweep：1 号场推捡球器（desert3d-v2 的 push 姿势）来回三趟 → 捡球篮倒球（dump）。
 * - director-gear：南网柱 → 器材箱（拿摇把 / 备用网）→ 回网柱。
 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  {
    id: 'player',
    pts: [
      [35.4, -4.0],
      [35.4, 2.0],
      SPOTS.doorOut,
      SPOTS.doorIn,
      SPOTS.rackDrop,
      [39.0, 6.85],
      [40.4, 7.6],
      [41.4, 9.0],
    ],
  },
  {
    id: 'director-in',
    pts: [[55.0, 1.6], [53.4, -1.4], SPOTS.serviceGate, [51.4, -1.4], [51.2, 2.2], [46.2, 5.4], SPOTS.netCrank1],
  },
  {
    id: 'director-sweep',
    pts: [
      SPOTS.sweepStart,
      [50.0, -0.6],
      [50.0, 1.6],
      [38.2, 1.6],
      [38.2, 3.8],
      [50.0, 3.8],
      [47.0, 5.4],
      SPOTS.basket,
    ],
  },
  { id: 'director-gear', pts: [SPOTS.netCrank1, [47.0, 5.6], [50.6, 5.5], SPOTS.gearBox] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）：
 * 围场里面（两片场 + 场边带 + 场地两头 1.3 米的后场），减掉：两张网（网身 + 网柱，网下钻不过去）、拍架、长椅、遮阳伞杆、
 * 记分牌、水站、器材箱、捡球篮；正在打球的 2 号场"能走但别走"（走进去 = 打断对攻，玩法上算一次干扰）。
 * 围场外：长廊、南北步道、去草坪的小路、到达小院（接 clubdesk）。进出围场：西门（3 米），以及建议的东北员工小门。
 * 遮挡：北围网 2.2 米 —— 站在 z < −0.8 的人帽子以上压在围网的暗带上（看得见，不挡）；南围网挡住 z 12.8…15 的地面，
 * 2 号场南边线外那一条（z > 12.8）进去了只露上半身 → 不让进（南后场的导航界线 z 12.8）。
 */
export const WALKABLE = [
  { id: 'court1', note: '1 号场整片（停用中，总监捡球、绷网）' },
  {
    id: 'strip',
    note: `场边带 x ${PICKLE.x0}…${PICKLE.x1}、z ${STRIP.z0.toFixed(2)}…${STRIP.z1.toFixed(2)}，减掉家具的脚印`,
  },
  { id: 'court2', note: '2 号场：z ≤ 12.8（南围网挡住的那条不让进）；有人在打时走进去 = 干扰' },
  { id: 'outside', note: '长廊、南北步道 x 33.6…36（地图采纳了提议 1：不再压进围场）、去草坪的小路、到达小院' },
  { id: 'gates', note: '西门 z 4.5…7.5；东北员工小门 z −2.0…−0.8（地图 PICKLE_DOORS）' },
];
/** 南围网挡住地面的界线（帽顶 2.0 米的人 z 超过这里就被挡住半身） */
export const SOUTH_HIDE_Z = PICKLE.z1 - 2.2;

/** 资产位置（占位或资产）。asset = assets/<asset>.ts、clubdesk 的资产或复用的资产；rotY 弧度；s 缩放；y 不填 = 地面高度 */
export interface Slot extends DeskSlot {
  /** 标签不贴（成片的小东西：散落的球） */
  noLabel?: boolean;
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)；长椅 [0.52]） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 人物：绞盘转轴的世界坐标（crank 姿势，setCrank） */
  crank?: [number, number, number];
  /** 人物（crank）：摇的是哪张网（slot id）—— 网的摇把每帧跟着人的右手转 */
  crankNet?: string;
  /** 散一地的球（pickleball v2 的 setBalls）：世界 [x, z]，main.ts 减掉 slot 的位置 */
  balls?: V2[];
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）

/** 长椅座位：长椅中心左右 ±0.45、往后 0.05（长椅本地；长椅不转，朝 +z = 朝 2 号场） */
const SEAT_X = 0.45;
const SEAT_Z = -0.05;
/**
 * 1 号场南网柱上绞盘的转轴（世界）：pickle-net 的摇把组在网本地 (0, 0.5, 柱心 3.35 + 半柱 0.135 + 1.4 纹素 0.126)，
 * 网不转 → 世界 = 网心 + 这个偏移（clubsite/assets/nets/net.ts 的 crank.position）
 */
const WINCH1: [number, number, number] = [COURT1.x, 0.5, COURT1.z + PK.W / 2 + PK.postOut + 0.135 + 0.126];

/** 1 号场散落的球（停用的场上没人捡；总监的第二个活）：手摆，团一点、往网和东北角多一点 */
const SCATTER: V2[] = [
  [39.2, -0.4],
  [40.6, 0.9],
  [41.4, 0.2],
  [42.9, 2.6],
  [43.3, 1.1],
  [45.1, 3.2],
  [45.5, 0.4],
  [46.4, 2.1],
  [47.9, -0.9],
  [48.6, 1.3],
  [49.4, 3.9],
  [50.2, -0.2],
  [38.6, 3.4],
  [44.6, -1.0],
];

/** 2 号场：双打，四个人都压在厨房线上（离网 2.13 米）轻吊（dink）—— 匹克球最有辨识度的一幕 */
const KL = PK.NVZ + 0.35;
export const RALLY = {
  w1: [COURT2.x - KL - 0.1, COURT2.z - 1.45] as V2,
  w2: [COURT2.x - KL, COURT2.z + 1.45] as V2,
  e1: [COURT2.x + KL, COURT2.z - 1.4] as V2,
  e2: [COURT2.x + KL + 0.1, COURT2.z + 1.4] as V2,
  /** 球：网上空中（白模里一个灰色小球占位） */
  ball: [COURT2.x + 0.7, 1.05, COURT2.z + 0.9] as [number, number, number],
};

/** clubdesk 的 SLOTS 里不要的（这个场景自己摆）：匹克球场上那四个人、总监（在这边绷网；同名 slot:director 会让玩法拿错人） */
const SKIP_DESK = (s: DeskSlot) => s.id.startsWith('pickle-') || s.id === 'director';

export const SLOTS: Slot[] = [
  // ── 和 clubdesk 同一块地：前台、大门、广场边的绿带、草坪（只读拿它的位置，两边一模一样）──
  ...DESK_SLOTS.filter((s) => !SKIP_DESK(s)).map((s) => ({ ...s, noLabel: true })),

  // ── 匹克球：两张网（1 号场松的 v1，2 号场绷紧的 v0）──
  { id: 'net-1', asset: 'pickle-net', x: COURT1.x, z: COURT1.z, variant: 1, label: '#1 网（松）' },
  { id: 'net-2', asset: 'pickle-net', x: COURT2.x, z: COURT2.z, variant: 0, noLabel: true },

  // ── 主角 1：2 号场双打（四个人在厨房线上）──
  {
    id: 'rally-w1',
    asset: 'player',
    x: RALLY.w1[0],
    z: RALLY.w1[1],
    rotY: E,
    variant: 1,
    pose: ['ready', 0.2],
    prop: 'racket',
  },
  {
    id: 'rally-w2',
    asset: 'player',
    x: RALLY.w2[0],
    z: RALLY.w2[1],
    rotY: E - 0.3,
    variant: 0,
    pose: ['forehand', 0.62],
    prop: 'racket',
    label: '双打 ×4（厨房线上 dink）',
  },
  {
    id: 'rally-e1',
    asset: 'player',
    x: RALLY.e1[0],
    z: RALLY.e1[1],
    rotY: W,
    variant: 2,
    pose: ['ready', 0.5],
    prop: 'racket',
  },
  {
    id: 'rally-e2',
    asset: 'player',
    x: RALLY.e2[0],
    z: RALLY.e2[1],
    rotY: W + 0.25,
    variant: 3,
    pose: ['ready', 0.8],
    prop: 'racket',
  },
  { id: 'ball-rally', asset: 'pickleball', x: RALLY.ball[0], y: RALLY.ball[1], z: RALLY.ball[2], label: '#6 球' },

  // ── 主角 2：场边生活带（从西门往东）──
  { id: 'paddle-rack', asset: 'paddle-rack', x: 37.45, z: 5.35 },
  {
    id: 'wait-1',
    asset: 'player',
    x: 38.55,
    z: 6.5,
    rotY: -1.1,
    variant: 2,
    pose: ['idle', 0.3],
    prop: null,
    label: '等场（拍子插在架上）',
  },
  { id: 'umbrella-a', asset: 'shade-umbrella', x: 40.3, z: 5.25 },
  { id: 'bench-a', asset: 'bench', x: 40.3, z: 6.3, noLabel: true },
  // 伞下长椅上的观众：坐着（setSeat 0.52），一个鼓掌、一个坐着看，头都转向 2 号场网上的球
  {
    id: 'fan-a1',
    asset: 'player',
    x: 40.3 - SEAT_X,
    z: 6.3 + SEAT_Z,
    variant: 0,
    pose: ['clap', 0.1],
    prop: null,
    seat: [0.52],
    look: RALLY.ball,
    label: '观众',
  },
  {
    id: 'fan-a2',
    asset: 'player',
    x: 40.3 + SEAT_X,
    z: 6.3 + SEAT_Z,
    variant: 3,
    pose: ['sit', 0.55],
    prop: null,
    seat: [0.52],
    look: RALLY.ball,
  },
  { id: 'basket', asset: 'ball-hopper', x: SPOTS.basket[0], z: SPOTS.basket[1], variant: 1, label: '捡球篮' },
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.netCrank1[0],
    z: SPOTS.netCrank1[1],
    rotY: P - 0.75,
    pose: ['crank', 0.3],
    prop: null,
    crank: WINCH1,
    crankNet: 'net-1',
    label: '总监（摇绞盘绷网）',
  },
  { id: 'scoreboard', asset: 'flip-scoreboard', x: 45.8, z: 6.4 },
  { id: 'umbrella-b', asset: 'shade-umbrella', x: 48.2, z: 5.25, variant: 1, noLabel: true },
  { id: 'bench-b', asset: 'bench', x: 48.2, z: 6.3, noLabel: true },
  {
    id: 'fan-b1',
    asset: 'player',
    x: 48.2 + SEAT_X,
    z: 6.3 + SEAT_Z,
    variant: 1,
    pose: ['sit', 0.4],
    prop: 'racket',
    seat: [0.52],
    look: RALLY.ball,
  },
  { id: 'water-court', asset: 'water-station', x: 50.7, z: 6.3, rotY: W, label: '水站', labelBelow: true },
  { id: 'gear-box', asset: 'gear-box', x: 51.55, z: 5.6 },

  // ── 1 号场（停用）：散落的球 —— 一个 pickleball v2（InstancedMesh）+ setBalls(SCATTER)，约六分之一橙 ──
  { id: 'balls-court1', asset: 'pickleball', variant: 2, x: 0, z: 0, y: 0, balls: SCATTER, label: '#6 散落的球 ×14' },

  // ── 围场外：走路的人 ──
  {
    id: 'prom-1',
    asset: 'player',
    x: 40.2,
    z: -6.7,
    rotY: W,
    variant: 3,
    pose: ['walk', 0.15],
    prop: 'racket',
    label: '去球场',
  },
  { id: 'prom-2', asset: 'player', x: 47.4, z: -5.9, rotY: E, variant: 0, pose: ['walk', 0.6], prop: null },
  {
    id: 'path-w',
    asset: 'player',
    x: 35.6,
    z: 1.2,
    rotY: 0.1,
    variant: 0,
    pose: ['walk', 0.4],
    prop: 'racket',
    noLabel: true,
  },
  {
    id: 'path-s',
    asset: 'player',
    x: 41.2,
    z: 15.95,
    rotY: E,
    variant: 2,
    pose: ['walk', 0.8],
    prop: 'racket',
    label: '打完去前台',
  },
];

/** 区域标签（白模评审用，?labels=0 不显示）：kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '喷泉广场 +1.2', x: 44, y: 2.0, z: -15.5 },
  { text: '长廊', x: 44.5, y: 0.4, z: -7.6 },
  { text: '1 号场 · 停用（网松了）', x: 44, y: 0.4, z: -0.5 },
  { text: '场边带', x: 44, y: 2.6, z: 5.0 },
  { text: '2 号场 · 双打', x: 44, y: 0.3, z: 13.2 },
  { text: '← 南北步道（来打球的人）', x: 39.4, y: 0.4, z: 2.4 },
  { text: '← 西门', x: 37.6, y: 0.3, z: 8.0 },
  { text: '球员草坪 −0.5', x: 43, y: 0.4, z: 26.5 },
  { text: '前台（clubdesk）', x: 54.4, y: 4.4, z: 6.0 },
  { text: '员工小门 →', x: 49.4, y: 2.6, z: -2.4 },
];
