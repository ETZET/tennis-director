// clubcourts 的构图：会员场（outer_1）+ 两片青训场（practice_w / practice_e）。手摆，不是程序撒点。
// 世界坐标和 clubmap2/layout.ts 共用（米，y 朝上，北 = −z，东 = +x）：球场、步道、围墙从那边 import（只读）；
// 墙的尺寸从 clubdesk/layout.ts import（只读）。这里只放这个场景自己的东西（围网怎么拉、场地状态、站位、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//            x −24.3        −17（两张网）        −11.4          −6.7    竖屏取景（tx −15.5、tz 15.5）
//   z −11.4 ┌───────────────────────────────────────────────────────┐
//           │ ▓ 中心球场南看台的背墙（暗）▓  长廊（碎花岗岩，亮，路过的人）    │
//   z −2.3  │ ▓▓▓▓▓▓▓▓ 青训场北围网（暗带 1，左上/右上按钮压在这里）▓▓▓▓▓▓▓▓│
//           │ 水站   │网柱│   伞+长椅（家长 ×2）  站着拍照的家长  球包      │ 场边（围网投影里，伞顶亮）
//           │ ○ 球    │    │                                             │
//           │ 目标锥 ○ │网│ ←球── 打球的孩子 ● ● ● 排队的孩子 + 地标点  捡球篮│ practice_w：教练喂球（主角上半）
//           │ 呼啦圈  教练●球车                                           │
//           │ 捡球器（躺着）  ○ ○                                          │
//   z 14.3  │ ▓▓▓▓▓▓ 青训场南围网 + 会员场北围网（两道叠成暗带 2）▓▓▓▓▓▓▓│
//           │ 水站 ≈喷雾管≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈  记分牌   刮水板（靠围网）     │ 场边：两块遮阳帆 + 长椅（等下一场的会员）
//           │      ▒水洼▒   ▒水洼▒      ▒水洼▒                            │ 喷雾滴下来的水洼（刮水的活）
//           │   西队 ●  │网│  ● 东队     （双打：四个人都在网前截击）     │ outer_1：会员双打（主角下半）
//           │   西队 ●  │  │  ● 东队                                      │
//   z 33.3  │ ░积沙░  ░积沙░ 总监（吹叶机，面朝镜头往南吹）░积沙░         │ 南边不拉围网 → 沙从南边吹上场（吹沙的活）
//           │ ═══ 南边的小路（碎花岗岩，建议）══════════════════════════ │
//           │ 工具架（左下框）   石炭酸灌木   脆灌木          假紫荆（右下框）│ 墙里的沙地（安静）
//   z 42.4  └───────────────────────────────────────────────────────┘
//
// 原则：两片场竖着叠在画面里，两张网（x −17）上下对齐成一条竖的中轴，人都围着网：上面教练隔网喂球给一排孩子，下面四个会员在网前截击。
// 三条朝镜头的暗带（中心球场看台背墙 / 青训场北围网；两道围网叠成的中带；画面下沿的工具架和树）把画面分成"家长 / 训练 / 会员 / 维护"四层。
// 视线：左上的水站和家长 → 教练和球车 → 球（亮黄）飞过网 → 打球的孩子和排队的孩子 → 下面的遮阳帆和喷雾 → 水洼 → 网前的四个人 → 总监的橙色吹叶机和沙。
// 安静的地方：两片场的东半场（只有几个球）、南边的沙地。
import { WALL as DESK_WALL } from '../clubdesk/layout';
import { COURTS, type Court, GROUNDS, PATHS, type Rect, type V2 } from '../clubmap2/layout';

export type { Court, Rect, V2 };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/** 各层高度（米）。这一片地图是平的 */
export const H = { ground: 0 };

/** 墙的尺寸（clubmap2/build.ts 同尺寸，clubdesk 抄了一份，这里只读 import 那份）：南墙 z 52（横屏、竖屏都看不到，只在 CLIP 里画） */
export const WALL = DESK_WALL;
export const SOUTH_WALL_Z = GROUNDS.z1;

const court = (id: string) => COURTS.find((c) => c.id === id) as Court;
/** 会员场（双打）、两片青训场（西：教练喂球；东：发球机）、东边的红土场（横屏右下，clubclay 的远场）、中心球场（上沿） */
export const MEMBER = court('outer_1');
export const PRACTICE_W = court('practice_w');
export const PRACTICE_E = court('practice_e');
export const CLAY_FAR = court('outer_2');
export const STADIUM = court('stadium_1');
export const cellOf = (c: Court): Rect => ({ x0: c.x - c.hx, x1: c.x + c.hx, z0: c.z - c.hz, z1: c.z + c.hz });

/** 标准网球场（米）：底线到底线、双打宽、单打宽、发球线离网、网长（含网柱外伸）、网高（柱 / 中间） */
export const DIM = { L: 23.77, DW: 10.97, SW: 8.23, SVC: 6.4, netLen: 12.8, netPost: 1.07, netMid: 0.914 } as const;
/** 线宽：2 设计纹素（0.18 米），同 clubclay / clubdesk */
export const LW = 0.18;
/** 硬地内场（青蓝）比线外多出来的一圈：底线外 1.4 米、边线外 0.84 米（同 clubmap2/build.ts） */
export const COURT_MARGIN = { x: 1.4, z: 0.84 };

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏（x −24.3…−6.7）：两张网（x −17）在左边 38% 处，网东边整片发球区 + 一截底线后；上沿切在中心球场南看台的背墙，下沿是南边的沙地。
 * 横屏（x −36.8…20.8）：三片场全在 —— 西边青训场整片、中间 1 米的步道、东边青训场（网和发球机）的西三分之二；
 *   下面会员场整片、右下红土场（clubclay 的远场）西半；左边露一截西步道。
 */
export const TARGET = {
  portrait: { x: -14.8, z: 16.0 },
  landscape: { x: -8.0, z: 15.0 },
};

/** 太阳：同 clubpark / clubdesk / clubclay（仰角 44°，方位偏东 8°：影子几乎正对镜头往下落、略往西） */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（球场、步道、围网裁到这里面） */
export const CLIP: Rect = { x0: -44, x1: 27, z0: -16, z1: 47 };

// ── 围网（fence-screen，2.6 米网球挡风布；clubdesk 的 buildFences，只读）────────────
/** 门：沿那条边、从起点算 at 米处、gap 米宽 */
export interface FenceDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  h: number;
  door?: { at: number; gap: number };
}
const FH = 2.6;
/**
 * 和 clubclay 一致：会员场 / 红土场之间只拉一道（x 0）；会员场南边不拉（墙离得远，但地图上南边就是沙地 —— 沙从这边吹上场，是"吹沙"这件活的来源）。
 * 地图的门都在北边离西头 3 米；这里另外加三个门（建议，见 clubcourts.md「共享坐标的建议」）：
 * 青训西场南边 x −3.5、青训东场南边 x 3.5、会员场北边 x −3.5 —— 三个门围着中间步道的南口，总监从会员场到青训场只要穿过两排场之间的步道。
 */
export const SPLIT_X = 0;
export const FENCES: FenceDef[] = [
  // 青训西场：北（门 x −30.5，照地图）、西、东（中间步道的西边）、南（门 x −3.5，建议）
  { x0: -33.5, z0: -2.3, x1: -0.5, z1: -2.3, h: FH, door: { at: 3, gap: 2.4 } },
  { x0: -33.5, z0: -2.3, x1: -33.5, z1: 14.3, h: FH },
  { x0: -0.5, z0: -2.3, x1: -0.5, z1: 14.3, h: FH },
  { x0: -33.5, z0: 14.3, x1: -0.5, z1: 14.3, h: FH, door: { at: 30, gap: 2.4 } },
  // 青训东场：北（门 x 3.5）、西（中间步道的东边）、东、南（门 x 3.5，建议）
  { x0: 0.5, z0: -2.3, x1: 33.5, z1: -2.3, h: FH, door: { at: 3, gap: 2.4 } },
  { x0: 0.5, z0: -2.3, x1: 0.5, z1: 14.3, h: FH },
  { x0: 33.5, z0: -2.3, x1: 33.5, z1: 14.3, h: FH },
  { x0: 0.5, z0: 14.3, x1: 33.5, z1: 14.3, h: FH, door: { at: 3, gap: 2.4 } },
  // 会员场：北（门 x −30.5 照地图 + x −3.5 建议）、西；东边 = 和红土场共用的那道（x 0）；南边不拉
  { x0: -33.5, z0: 16.7, x1: -16.0, z1: 16.7, h: FH, door: { at: 3, gap: 2.4 } },
  { x0: -16.0, z0: 16.7, x1: SPLIT_X, z1: 16.7, h: FH, door: { at: 12.5, gap: 2.4 } },
  { x0: -33.5, z0: 16.7, x1: -33.5, z1: 33.3, h: FH },
  { x0: SPLIT_X, z0: 16.7, x1: SPLIT_X, z1: 33.8, h: FH },
  // 红土远场（横屏右下，clubclay 的）：北边（门 x 3.5）；两片红土场之间那一道（clubclay 的 z 33.8）和近场的西边
  { x0: SPLIT_X, z0: 16.7, x1: 33.5, z1: 16.7, h: FH, door: { at: 3.5, gap: 2.4 } },
  { x0: SPLIT_X, z0: 33.8, x1: 33.5, z1: 33.8, h: FH },
  { x0: SPLIT_X, z0: 33.8, x1: SPLIT_X, z1: 50.9, h: FH },
];

// ── 步道（碎花岗岩，同 clubdesk / clubclay）───────────────────────────────
/**
 * 地图的步道：会员场南边那条 1.4 米的小路（z 33.6…35.0，西接西步道、东到红土场的西围网）是这个场景提的，
 * 2026-11-08 地图（clubmap2/layout.ts 的 PATHS）采纳了 —— 这里不再另加。工具架靠在它南边。
 */
export const SOUTH_WALK: Rect = PATHS.find((p) => p.z0 === 33.6 && p.z1 === 35.0) as Rect;
export const SCENE_PATHS: Rect[] = [...PATHS];

// ── 场地状态（白模用平涂区块 + 标签，stage 2 的 hard-court 资产照这里画）──────────
/**
 * 会员场 outer_1：
 * - drift：南边吹上来的积沙（舌头形，从场地南沿往北伸 1.5～2.5 米；地图南边是沙地、没有围网）。总监正在吹中间那一段：
 *   他脚下往南已经吹干净（露出场地），西边、东边还没吹。
 * - drifted：已经吹薄的一层（比积沙浅、透出底色）—— 总监身后
 * - puddles：喷雾管下面滴出来的水洼（x, z, rx, rz）：一团团扁的，落在北边双打走廊和场边绿上（刮水的活）
 */
export const MEMBER_STATE = {
  drift: [
    [
      [-11.0, 33.3],
      [-10.5, 32.2],
      [-9.4, 31.4],
      [-8.0, 31.1],
      [-6.9, 31.6],
      [-6.2, 32.5],
      [-5.4, 33.3],
    ],
    [
      [-23.0, 33.3],
      [-22.3, 32.1],
      [-20.8, 31.3],
      [-19.0, 31.5],
      [-17.5, 32.3],
      [-16.7, 33.3],
    ],
    // 横屏：西南角一大片
    [
      [-33.3, 33.3],
      [-33.2, 31.4],
      [-31.6, 30.2],
      [-29.2, 30.4],
      [-27.6, 31.4],
      [-26.6, 33.3],
    ],
  ] as V2[][],
  /** 吹薄了的（总监身后、东边那一截） */
  thinned: [
    [
      [-16.2, 33.3],
      [-15.6, 32.6],
      [-14.4, 32.3],
      [-13.6, 32.8],
      [-13.4, 33.3],
    ],
  ] as V2[][],
  /** 小路上的沙（细细一层，吹沙的时候也顺带吹） */
  walkDust: [
    [-20.0, 34.3, 3.4, 0.5],
    [-8.0, 34.3, 2.6, 0.45],
  ] as [number, number, number, number][],
  puddles: [
    [-19.2, 22.75, 0.95, 0.4],
    [-15.9, 22.95, 0.8, 0.36],
    [-23.1, 21.0, 0.7, 0.32],
    [-11.7, 20.6, 0.6, 0.3],
  ] as [number, number, number, number][],
};

/**
 * 青训场：
 * - 西场（教练喂球）：底线后、发球线前被孩子们踩出来的浅块（白模不画：新漆的场不该有"旧"）—— 只有散在教练那半场的球（BALLS）
 * - 东场（发球机）：同上
 */

// ── 站位、路线、能走的地方（stage 3 用；白模里标签开着时画成洋红小圆盘 + 小点）──────
/**
 * 站位。总监的活：会员场南边吹沙（现在）、喷雾管下面刮水、青训西场捡球（捡球器躺在南围网边）、青训东场给发球机加球（捡球篮在机器边）。
 * 工具都住在会员场南边小路外的工具架上（吹叶机现在在总监手里）。
 */
export const SPOTS = {
  blowNow: [-12.6, 31.6] as V2,
  toolRack: [-21.0, 36.4] as V2,
  squeegee: [-9.8, 17.4] as V2,
  puddle: [-17.6, 22.9] as V2,
  picker: [-23.4, 12.0] as V2,
  cartDump: [-18.45, 4.9] as V2,
  coach: [-18.7, 6.4] as V2,
  kidHit: [-11.7, 6.1] as V2,
  queue: [-8.8, 7.0] as V2,
  parents: [-12.6, -1.2] as V2,
  members: [-19.4, 17.6] as V2,
  machineE: [18.0, 7.6] as V2,
  hopperE: [19.8, 8.6] as V2,
  teen: [4.3, 5.4] as V2,
  doorPW_S: [-3.5, 14.3] as V2,
  doorPE_S: [3.5, 14.3] as V2,
  doorM_N: [-3.5, 16.7] as V2,
  doorM_NW: [-30.5, 16.7] as V2,
  doorPW_N: [-30.5, -2.3] as V2,
  doorPE_N: [3.5, -2.3] as V2,
} satisfies Record<string, V2>;

/**
 * 路线：
 * - blow：吹沙（沿会员场南边、从东往西，人面朝南，把沙吹回沙地）
 * - squeegee：刮水（帆前面的水洼，往北推进场边绿、再到围网脚下的排水缝；每团来回一趟，人在帆下走）
 * - collect：捡球（青训西场教练那半场，推捡球器之字走，最后倒进教练的球车）
 * - refill：加球（会员场 → 北门 x −3.5 → 两排场之间的步道 → 青训东场南门 x 3.5 → 捡球篮 → 发球机）
 * - rotate：孩子轮换（打完的孩子绕到队尾）
 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  {
    id: 'blow',
    pts: [[-6.2, 31.2], SPOTS.blowNow, [-18.0, 31.0], [-23.0, 30.8], [-28.0, 30.2], [-32.4, 30.6]],
  },
  {
    id: 'squeegee',
    pts: [
      [-23.6, 21.6],
      [-23.6, 19.6],
      [-20.2, 23.4],
      [-20.2, 21.6],
      [-18.2, 23.4],
      [-18.2, 21.6],
      [-16.6, 23.4],
      [-16.6, 21.6],
      [-15.0, 23.4],
      [-15.0, 21.6],
      [-11.7, 21.2],
      [-11.7, 19.6],
    ],
  },
  {
    id: 'collect',
    pts: [SPOTS.picker, [-20.4, 10.6], [-24.4, 8.8], [-20.6, 7.6], [-24.6, 4.6], [-20.4, 2.4], SPOTS.cartDump],
  },
  {
    id: 'refill',
    pts: [
      SPOTS.blowNow,
      [-4.6, 22.0],
      [-3.5, 18.0],
      SPOTS.doorM_N,
      [-3.5, 15.5],
      [3.5, 15.5],
      SPOTS.doorPE_S,
      [10.0, 10.6],
      SPOTS.hopperE,
      SPOTS.machineE,
    ],
  },
  { id: 'rotate', pts: [SPOTS.kidHit, [-10.8, 8.6], [-7.0, 8.4], [-6.9, 6.6]] },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）。进出场只走门：
 * 会员场北门 x −30.5 / −3.5、南边整条敞开；青训场北门 x −30.5 / 3.5、南门 x −3.5 / 3.5（建议）。
 * 比赛中的会员场：能进北边场边那一条（z 16.9…19.5，喷雾、水洼、长椅）和南边场外（z 30.5…33.3，积沙）；双打线以内不让进（打扰比赛）。
 * 训练中的青训西场：能进教练那半场（捡球），不能进孩子排队、打球的那一块（x > −13）。
 */
export const WALKABLE = [
  { id: 'member-north', note: '会员场北边场边 x −33.3…−0.2、z 16.9…19.5（减长椅、帆杆、水站、记分牌）' },
  { id: 'member-south', note: '会员场南边场外 + 南小路 x −34.5…−0.3、z 30.5…35.0（积沙，吹沙的活）' },
  { id: 'member-court', note: '会员场双打线以内：比赛时不让进（换边、一盘打完以后可以进去刮水、吹沙）' },
  {
    id: 'practice-w',
    note: '青训西场 x −33.3…−13、z −2.1…14.1（减网、球车、教练）；孩子那一块（x > −13）训练时不让进',
  },
  { id: 'practice-e', note: '青训东场整片（发球机在打的那一条除外）' },
  {
    id: 'paths',
    note: '两排场之间的步道（z 14.4…16.6，被围网挡住，走过去时相机跟着）、中间步道 x ±0.5、西步道、北边长廊',
  },
  { id: 'sand', note: '南小路外的沙地（安静区，能走，不放东西）' },
];

/** 资产位置（占位或资产）。asset = assets/<asset>.ts 或复用的资产；rotY 弧度；s 缩放；y 不填 = 地面高度 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
  /** 人物：固定姿势 [名字, phase] */
  pose?: [string, number];
  /** 人物：手里拿什么（null = 空手） */
  prop?: string | null;
  /** 建好以后调一下 userData 上的函数：[函数名, ...参数]（例：工具架藏起吹叶机、球车里剩几个球） */
  call?: [string, ...unknown[]][];
  /** 标签文字（不给 = id） */
  label?: string;
  /** 标签贴在脚下（挤在一起的小东西） */
  labelBelow?: boolean;
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）
/** 坐长椅的人：clubsite/people 的 sit 姿势（原点 = 髋正下方的地面，座面默认 0.52 = 长椅） */
const SIT: [string, number] = ['sit', 0.3];

/** 青训西场散在教练那半场的球（孩子打回来的）+ 网前两个 + 孩子脚边一个 */
const BALLS_W: V2[] = [
  [-20.2, 3.4],
  [-21.6, 7.9],
  [-23.1, 5.1],
  [-19.7, 10.0],
  [-24.0, 8.7],
  [-22.0, 11.2],
  [-20.9, 1.7],
  [-23.6, 2.9],
  [-26.8, 6.3],
  [-28.4, 3.6],
  [-27.2, 10.8],
  [-30.6, 8.2],
  [-16.2, 4.1],
  [-15.6, 9.0],
  [-12.7, 4.8],
];
/** 青训东场：发球机打过来、少年打不着的球（滚到西底线后、西围网脚下） */
const BALLS_E: V2[] = [
  [2.3, 2.0],
  [1.3, 4.4],
  [1.0, 8.2],
  [2.8, 10.6],
  [3.4, 0.9],
  [6.6, 9.4],
];

export const SLOTS: Slot[] = [
  // 硬地场面（assets/hard-court）：v1 青训（干净），v0 会员场（比赛中：南边积沙、帆前水洼）
  { id: 'hard-pw', asset: 'hard-court', x: PRACTICE_W.x, z: PRACTICE_W.z, variant: 1 },
  { id: 'hard-pe', asset: 'hard-court', x: PRACTICE_E.x, z: PRACTICE_E.z, variant: 1 },
  { id: 'hard-m', asset: 'hard-court', x: MEMBER.x, z: MEMBER.z, variant: 0 },
  // ── 青训西场：教练喂球给一排孩子（竖屏上半的主角）──────────────
  { id: 'court-net-pw', asset: 'court-net', x: PRACTICE_W.x, z: PRACTICE_W.z },
  {
    id: 'coach',
    asset: 'coach',
    x: SPOTS.coach[0],
    z: SPOTS.coach[1],
    rotY: E,
    pose: ['feed', 0.55],
    prop: 'racket',
    label: '教练（喂球）',
  },
  { id: 'ball-cart', asset: 'ball-cart', x: -18.45, z: 5.65, rotY: E, call: [['setCount', 40]] },
  {
    id: 'kid-hit',
    asset: 'kid',
    x: SPOTS.kidHit[0],
    z: SPOTS.kidHit[1],
    rotY: W,
    variant: 1,
    pose: ['forehand', 0.62],
    prop: 'racket',
    label: '孩子 ×4（clubsite kid）',
  },
  { id: 'kid-q1', asset: 'kid', x: -9.7, z: 6.8, rotY: W, variant: 2, pose: ['ready', 0.3], prop: 'racket' },
  {
    id: 'kid-q2',
    asset: 'kid',
    x: -8.8,
    z: 7.4,
    rotY: W - 0.3,

    variant: 0,
    pose: ['idle', 0.6],
    prop: 'racket',
  },
  {
    id: 'kid-q3',
    asset: 'kid',
    x: -7.9,
    z: 6.7,
    rotY: W + 0.4,

    variant: 1,
    pose: ['idle', 0.1],
    prop: 'racket',
  },
  { id: 'spots-queue', asset: 'drill-kit', x: -8.8, z: 7.05, variant: 2, labelBelow: true },
  { id: 'cones-n', asset: 'drill-kit', x: -22.4, z: 2.7, variant: 0 },
  { id: 'cones-s', asset: 'drill-kit', x: -22.4, z: 9.3, variant: 0 },
  { id: 'hoop', asset: 'drill-kit', x: -21.0, z: 4.6, variant: 1 },
  { id: 'hopper-kids', asset: 'ball-hopper', x: -9.9, z: 5.0, variant: 1 },
  { id: 'picker', asset: 'tool', x: -23.4, z: 12.7, variant: 1, label: '捡球器（等着捡球）' },
  ...BALLS_W.map(([x, z], i) => ({ id: `ball-w${i}`, asset: 'tennis-ball', x, z, labelBelow: true })),
  // 北边场边（围网投影里）：伞 + 长椅（家长）、站着拍照的家长、水站、孩子们的包
  { id: 'umbrella-parents', asset: 'court-umbrella', x: -12.6, z: -1.9, variant: 0 },
  { id: 'bench-parents', asset: 'bench', x: -12.6, z: -1.2 },
  {
    id: 'parent-1',
    asset: 'player',
    x: -13.05,
    z: -1.15,
    variant: 3,
    pose: SIT,
    prop: null,
    label: '家长（sit）',
  },
  {
    id: 'parent-2',
    asset: 'player',
    x: -12.15,
    z: -1.15,
    rotY: -0.3,
    variant: 2,
    pose: SIT,
    prop: null,
  },
  { id: 'parent-3', asset: 'player', x: -9.9, z: -0.9, rotY: -0.5, variant: 0, pose: ['idle', 0.5], prop: null },
  { id: 'water-pw', asset: 'water-station', x: -20.4, z: -1.6, label: '水站（clubdesk）' },
  { id: 'bag-kids-1', asset: 'kit-bag', x: -14.6, z: -0.8, rotY: 0.15 },
  { id: 'bag-kids-2', asset: 'kit-bag', x: -7.8, z: -1.5, rotY: -0.2, variant: 1 },
  // ── 会员场：双打（四个人都在网前截击）+ 北边场边的遮阳帆、喷雾、长椅、记分牌 ────────
  { id: 'court-net-m', asset: 'court-net', x: MEMBER.x, z: MEMBER.z },
  { id: 'sail-w', asset: 'court-sail', x: -19.4, z: 18.0, variant: 0 },
  { id: 'sail-e', asset: 'court-sail', x: -14.6, z: 18.0, variant: 1 },
  { id: 'mist-line', asset: 'mist-line', x: -17.0, z: 19.2 },
  { id: 'bench-m-w', asset: 'bench', x: -19.4, z: 17.55 },
  { id: 'bench-m-e', asset: 'bench', x: -14.6, z: 17.55 },
  {
    id: 'member-wait-1',
    asset: 'player',
    x: -19.85,
    z: 17.6,
    variant: 1,
    pose: SIT,
    prop: 'racket',
    label: '等下一场的会员（sit）',
  },
  {
    id: 'member-wait-2',
    asset: 'player',
    x: -18.95,
    z: 17.6,
    rotY: 0.2,
    variant: 3,
    pose: SIT,
    prop: null,
  },
  {
    id: 'member-wait-3',
    asset: 'player',
    x: -14.15,
    z: 17.6,
    rotY: -0.15,
    variant: 0,
    pose: SIT,
    prop: null,
  },
  { id: 'scoreboard', asset: 'scoreboard', x: -11.0, z: 17.25 },
  { id: 'squeegee', asset: 'squeegee', x: -9.6, z: 17.05, labelBelow: true },
  { id: 'water-m', asset: 'water-station', x: -23.3, z: 17.4 },
  { id: 'bag-m-1', asset: 'kit-bag', x: -21.0, z: 18.6, rotY: 0.1, variant: 2 },
  { id: 'bag-m-2', asset: 'kit-bag', x: -13.0, z: 18.7, rotY: -0.15, variant: 0 },
  {
    id: 'm-e1',
    asset: 'player',
    x: -13.3,
    z: 22.8,
    rotY: W,
    variant: 0,
    pose: ['ready', 0.3],
    prop: 'racket',
    label: '会员双打 ×4（网前截击）',
  },
  {
    id: 'm-e2',
    asset: 'player',
    x: -12.7,
    z: 27.6,
    rotY: W - 0.2,
    variant: 2,
    pose: ['forehand', 0.55],
    prop: 'racket',
  },
  { id: 'm-w1', asset: 'player', x: -20.9, z: 23.0, rotY: E, variant: 1, pose: ['ready', 0.7], prop: 'racket' },
  {
    id: 'm-w2',
    asset: 'player',
    x: -21.4,
    z: 27.4,
    rotY: E + 0.2,
    variant: 3,
    pose: ['backhand', 0.35],
    prop: 'racket',
  },
  { id: 'ball-m', asset: 'tennis-ball', x: -15.4, z: 26.6, y: 1.25, labelBelow: true },
  // ── 会员场南边：总监吹沙（面朝镜头，往南吹）+ 工具架（左下框）──────────────
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.blowNow[0],
    z: SPOTS.blowNow[1],
    rotY: 0,
    pose: ['blow', 0.25],
    prop: 'blower',
    call: [['setBlowSweep', false]],
    label: '总监（吹沙）',
  },
  {
    id: 'tool-rack',
    asset: 'tool-rack',
    x: -21.0,
    z: 35.65,
    call: [['show', 'blower', false]],
    label: '工具架（吹叶机在总监手里）',
  },
  // 墙里的沙地（安静）：框的树、两丛灌木
  { id: 'paloverde-se', asset: 'palo-verde', x: -8.4, z: 40.4, s: 1.1, variant: 1, label: 'palo-verde（右下框）' },
  { id: 'creosote-s', asset: 'creosote', x: -16.6, z: 38.6, variant: 0 },
  { id: 'brittle-s', asset: 'brittlebush', x: -13.2, z: 41.2, variant: 1 },
  // 横屏才看得到的
  { id: 'smoke-sw', asset: 'smoke-tree', x: -29.5, z: 39.0, variant: 0 },
  { id: 'creosote-sw', asset: 'creosote', x: -36.5, z: 37.2, variant: 1 },
  { id: 'paloverde-w', asset: 'palo-verde', x: -40.6, z: 24.0, s: 0.95, variant: 0 },
  // ── 青训东场（横屏）：发球机 + 少年；捡球篮在机器边（加球的活）──────────
  { id: 'court-net-pe', asset: 'court-net', x: PRACTICE_E.x, z: PRACTICE_E.z },
  { id: 'ball-machine', asset: 'ball-machine', x: 18.9, z: 6.6, rotY: W, variant: 1 },
  { id: 'hopper-machine', asset: 'ball-hopper', x: 19.8, z: 8.6, variant: 1 },
  {
    id: 'teen',
    asset: 'player',
    x: SPOTS.teen[0],
    z: SPOTS.teen[1],
    rotY: E,
    s: 0.9,
    variant: 2,
    pose: ['forehand', 0.5],
    prop: 'racket',
    label: '少年（对发球机）',
  },
  { id: 'bench-pe', asset: 'bench', x: 14.6, z: -1.2 },
  { id: 'bag-teen', asset: 'kit-bag', x: 13.6, z: -0.6, variant: 2 },
  ...BALLS_E.map(([x, z], i) => ({ id: `ball-e${i}`, asset: 'tennis-ball', x, z, labelBelow: true })),
  // ── 红土远场（横屏右下，clubclay 的）：只放网 ──
  { id: 'court-net-clay', asset: 'court-net', x: CLAY_FAR.x, z: CLAY_FAR.z },
  // ── 北边长廊（竖屏上沿）：路过的人 ──
  { id: 'walker', asset: 'player', x: -10.6, z: -6.4, rotY: W + 0.15, variant: 1, pose: ['walk', 0.4], prop: 'racket' },
  { id: 'walker-2', asset: 'player', x: -27.0, z: -5.8, rotY: E, variant: 3, pose: ['walk', 0.8], prop: null },
  // ── 四角灯杆（地图有；8.5 米，竖屏看不到）──
  ...[PRACTICE_W, PRACTICE_E, MEMBER, CLAY_FAR].flatMap((c, i) => {
    const r = cellOf(c);
    return [
      [r.x0 + 0.4, r.z0 + 0.4],
      [r.x1 - 0.4, r.z0 + 0.4],
      [r.x0 + 0.4, r.z1 - 0.4],
      [r.x1 - 0.4, r.z1 - 0.4],
    ].map(([x, z], k) => ({
      id: `light-${i}-${k}`,
      asset: 'court-light',
      x,
      z,
      rotY: Math.atan2(c.x - x, c.z - z),
      labelBelow: true,
    }));
  }),
];

/** 区域标签（白模评审用，?labels=0 不显示）：kind area = 区域名，state = 场地状态，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' | 'state' }[] = [
  { text: '青训西场 practice_w：教练喂球', x: -12.6, y: 0.4, z: 12.2 },
  { text: '会员场 outer_1：双打', x: -11.4, y: 0.4, z: 29.6 },
  { text: '青训东场：发球机', x: 10.0, y: 0.4, z: 12.2 },
  { text: '中心球场南看台（clubstadium）', x: -16.0, y: 1.6, z: -10.6 },
  { text: '长廊', x: -20.0, y: 0.3, z: -6.6 },
  { text: '积沙（南边吹上来）', x: -8.2, y: 0.3, z: 32.2, kind: 'state' },
  { text: '水洼（喷雾飘过来的）', x: -14.8, y: 0.3, z: 22.4, kind: 'state' },
  { text: '球（孩子打回来的）', x: -24.0, y: 0.3, z: 6.0, kind: 'state' },
  { text: '南边的小路', x: -28.0, y: 0.3, z: 34.3 },
  { text: '会员场南边不拉围网（同 clubclay）', x: -27.0, y: 0.4, z: 32.4, kind: 'propose' },
  { text: '南门 x −3.5（建议）', x: -3.5, y: 2.9, z: 14.3, kind: 'propose' },
  { text: '南门 x 3.5（建议）', x: 3.5, y: 2.9, z: 14.3, kind: 'propose' },
  { text: '北门 x −3.5（建议）', x: -3.5, y: 0.4, z: 17.4, kind: 'propose' },
  { text: '中间步道 x ±0.5', x: 0, y: 0.3, z: 3.0 },
  { text: '沙地（安静）', x: -12.0, y: 0.3, z: 37.4 },
  { text: '红土远场（clubclay）', x: 10.0, y: 0.4, z: 29.0 },
  { text: '西步道', x: -36.5, y: 0.3, z: 10.0 },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：南边的沙地（z 38…41）和北边中心球场看台 / 长廊（z −11…−9）—— 永远不上三片场（z −2…34）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-15), 39.6, 4.2, 1.4],
  [wrapX(-11.5), 40.4, 2.4, 1.1],
  [wrapX(-33), 39.0, 4.4, 1.5],
  [wrapX(5), 39.8, 3.6, 1.3],
  [wrapX(-6), -10.4, 4.4, 1.3],
  [wrapX(-2.5), -9.8, 2.4, 0.9],
  [wrapX(-28), -10.2, 3.8, 1.2],
];
export const CLOUD_VEL = 0.12;
