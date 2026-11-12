// clubdesk 的构图：俱乐部东墙大门里面的露天前台（会员进门 → 排队签到 → 拿毛巾和水 → 去球场）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）：大门、围墙、前台、到达小院、长廊、匹克球、广场、草坪都从那边 import，
// 那个文件只读。这里只放这个场景自己的东西（高差、画到哪 CLIP、小路、站位、资产位置、云），也写在同一套世界坐标里。
// 不是浮空岛了（2026-11-08）：地面铺到画外（clubsite/ground.ts）；门外那块地（落客区、停车场）和 clubpark 是同一份几何。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//            x 45                     52   54.4  57    60（东墙）  62.5
//   z −21  ┌──────────────────────────────────────────────────────────┐  竖屏取景（tx 53.7、tz 6）
//          │ 喷泉广场 PLAZA（+1.2，陶砖）                              │
//   z −12  │ ▓▓▓▓▓▓▓▓▓▓▓ 广场挡土墙（暗带 1）▓▓▓ 台阶 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ 墙
//          │  蒲葵（左上框）      长椅        龙舌兰        蒲葵（右上框）│ 帽
//   z −8.6 │ ═══════════ 长廊（碎花岗岩，往西去球场）════ 到达小院（陶砖）══│ ║ ← 北门柱
//   z −3   │ ▓▓▓▓ 匹克球北围网（暗带 2）▓▓▓▓▓▓│                        门洞 → 门外 = clubpark
//          │ 匹克球场（东半）                  │ 黑板  ┌凉棚(帆布顶)┐ ↙ 排队 │
//          │                                   │       │ 后柜（棚下）│ 会员   ║ ← 南门柱
//   z  9.3 │                                   │ 毛巾车 总监 ▐柜台▌ 会员 │ ║
//          │                                   │ 水站   投影池（往东南）  │ ║
//   z 15   │ ▓▓▓▓ 匹克球南围网（暗带 3）▓▓▓▓▓▓│  小路 ↓        工具架    │ ║
//   z 16   │ ══════ 去草坪/西边球场的小路 ═══════╛                       │ ║
//   z 17   │ ▓▓ 草坪北沿矮墙（下沉 0.5，暗带 4）▓▓                        │ ║
//          │ 假紫荆（左下框）  长椅   球员草坪            （安静的沙地）蒲葵│ ║
//   z 33   │ 草坪一直铺到画外（南沿矮墙 z 33.6 在画外）                       │ ║
//          └──────────────────────────────────────────────────────────┘
//
// 原则：主角 = 凉棚 + 柜台 + 排队的人（中间偏上），大门两根高柱在右边做竖的框，四条朝镜头的暗带分层（以前最下面的岛沿崖壁没了）；
// 视线：右边门洞 → 排队斜着往左下 → 柜台转角（总监）→ 小路往下 → 草坪边的小路往左出画；长廊在上面横着往西。
// 安静的地方：匹克球场面、东墙脚的沙地（x 56.8…59.6、z 11…25）、草坪中段。
import { DESK, FORECOURT, GATE, LAWN, PICKLE, PLAZA, type Rect, type V2 } from '../clubsite/world';

export type { Rect, V2 };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/** 各层高度（米）。地图是平的；这里加的高差只在这个场景里（给构图做暗带），大门内外都是 0，和 clubpark 接得上 */
export const H = {
  /** 俱乐部地面、到达小院、长廊、匹克球、前台、门外车道 */
  ground: 0,
  /** 喷泉广场抬高（南沿挡土墙 = 画面上方的暗带） */
  plaza: 1.2,
  /** 球员草坪下沉（北沿矮墙朝镜头 = 画面下方的一条暗带） */
  lawn: -0.5,
};

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。竖屏：右边缘刚好在门外 2.5 米；
 * 横屏（x 17.7…75.3）：前台落在右边三分之一线上；左边露出西边两片球场的东头，右边是门外的落客区和停车场（clubpark 那块地），
 * 门外车道（两棵蒲葵夹着）从右边把视线引进门。
 */
export const TARGET = {
  portrait: { x: 53.7, z: 6.0 },
  landscape: { x: 46.5, z: 4.5 },
};

/**
 * 太阳：仰角、方位（度；0 = 正北 = 画面正后方，正 = 偏东 → 影子落向左下，负 = 偏西 → 右下）。
 * 午后：仰角 44°（同 clubpark），方位只偏东 8°，影子几乎正对镜头往下落。试过三个方位（截图 v2 / v2ne / az8）：
 * - 偏东 22°（clubfront、clubpark 现在的）：南门柱 5.5 米高的影子斜着横在排队的人身上，墙里一条暗带压住排队道；
 * - 偏西 24°：凉棚投影池往东南落，把第一、二个会员和石板引导道都压进影子；门柱影子落到墙外 clubpark 的落客区上；
 * - 偏东 8°：凉棚投影正好落在柜台转角和总监身上（主角的深色底座），排队的人站在亮着的石板道上；门柱影子顺着墙往南落，
 *   两边的场景都不压。**建议 clubpark 也用 { el: 44, az: 8 }**（两个场景接在大门，太阳必须一样）。
 */
export const SUN = { el: 44, az: 8 };

/**
 * 墙里面这个场景画到的范围（球场、步道、围网都裁到这里面）：横屏左边缘 x ≈ 17.7，往外留 8 米；南北到围墙。
 * 墙外（x > 60）是 clubpark 的那块地（clubpark/terrain.ts 的 buildApproach），不裁。
 * 中心球场（看台在 clubmap2 里才有）不画，那一角是墙里的浅沙。
 */
export const CLIP: Rect = { x0: 10, x1: GATE.x, z0: -43, z1: 52 };

// ── 围墙和大门（和 clubmap2/build.ts 同尺寸：两个场景在大门接上） ──────────────
/** 围墙：土坯 1.9 米高、0.7 米厚、陶砖压顶 0.18；每 12 米左右一根壁柱（1.1 见方、2.4 米 + 压顶 0.2） */
export const WALL = { h: 1.9, t: 0.7, cap: 0.18, pier: 1.1, pierH: 2.4, pierCap: 0.2 } as const;
/** 大门：两根门柱 1.7 见方、4.6 米高（压顶 1.9 见方 0.4 厚，柱顶网球半径 0.55、球心 y 5.5），木横梁 0.8×0.7、底 y 3.7，招牌朝东 */
export const GATE_SPEC = {
  pier: 1.7,
  pierH: 4.6,
  cap: 1.9,
  capH: 0.4,
  ball: 0.55,
  ballY: 5.5,
  beamW: 0.8,
  beamH: 0.7,
  beamY: 3.7,
  /** 门柱中心 z（门洞两边各外 0.8） */
  pierZ: [GATE.z0 - 0.8, GATE.z1 + 0.8] as [number, number],
} as const;

// ── 前台（地图的 DESK = 凉棚的地盘：x 52.4…56.4、z 2.3…9.3，顶 3.4 米）──────────
/**
 * 凉棚顶：四边比 DESK 各伸一点，但**南沿不伸、不挂垂边**（垂边会挡住总监的帽子）。顶厚 0.12 → 南沿底 3.28 米。
 * 遮挡算式（45° 俯视）：站在 z_d 的人（帽顶 2.0 米）露得出来 ⇔ z_d > z_南沿 − (y_南沿底 − 2.0) = 9.3 − 1.28 = 8.02。
 * 地面上的东西 z > 6.0 就露得出来（帆布南沿底下能看进去 3.3 米深的一条）。
 */
export const CANOPY = {
  x0: DESK.x - DESK.w / 2 - 0.1,
  x1: DESK.x + DESK.w / 2 + 0.1,
  z0: DESK.z - DESK.d / 2 - 0.2,
  z1: DESK.z + DESK.d / 2,
  top: DESK.h,
  thick: 0.12,
} as const;
/** 头顶 2.0 米的人在棚下要站到这条线以南才露得出来（总监的导航界线） */
export const HEAD_LINE_Z = CANOPY.z1 - (CANOPY.top - CANOPY.thick - 2.0);

/**
 * 柜台：L 形，包住凉棚东南角。东边一段朝东（朝大门，会员沿着它排队），南边一小段朝南（朝镜头：俱乐部蓝的正面 + 网球徽标）。
 * 总监站在转角里面（z 8.6，帽子离帆布南沿 0.58 米 ≈ 1× 下 9 行）。南段伸出棚外 0.4 米。
 */
export const COUNTER = {
  east: { x0: 56.0, x1: 56.6, z0: 6.0, z1: 9.1 },
  south: { x0: 55.2, x1: 56.6, z0: 9.1, z1: 9.7 },
  h: 1.05,
} as const;

/** 到达小院（陶砖，地图的 FORECOURT）、凉棚、草坪的地盘，从地图拿 */
export { DESK, FORECOURT, LAWN, PICKLE, PLAZA };

/** 喷泉广场（抬高 1.2）：地图的 PLAZA；两段台阶下到长廊北边的绿带（x 34…37 是东边那条南北步道接上来的地方） */
export const PLAZA_TERRACE: Rect = { x0: PLAZA.x0, x1: PLAZA.x1, z0: PLAZA.z0, z1: PLAZA.z1 };

/** 台阶：x0..x1 宽，z0 = 顶（上层的南沿），往 +z 下 steps 级，每级 run 米，从 from 下到 to */
export interface Stairs {
  x0: number;
  x1: number;
  z0: number;
  steps: number;
  run: number;
  from: number;
  to: number;
}
export const STAIRS: Stairs[] = [
  { x0: 49.0, x1: 51.4, z0: PLAZA.z1, steps: 5, run: 0.42, from: H.plaza, to: H.ground },
  { x0: 34.0, x1: 37.0, z0: PLAZA.z1, steps: 5, run: 0.42, from: H.plaza, to: H.ground },
  // 下草坪：北沿正中两级
  { x0: 47.4, x1: 49.6, z0: 17.2, steps: 2, run: 0.4, from: H.ground, to: H.lawn },
];

/** 球员草坪（下沉 0.5）：地图的 LAWN，四角圆一点（南沿 z 33.6，竖屏下沿 z ≈ 32.4 → 草坪一直铺到画外） */
export const LAWN_PIT: Rect = { x0: LAWN.x0 + 0.5, x1: LAWN.x1 - 0.4, z0: LAWN.z0 + 0.2, z1: LAWN.z1 - 0.4 };

/**
 * 这个场景自己加的小路（碎花岗岩）：前台南边往下接到草坪北边，再往西接地图上 z 14.4…16.6 那条（两排球场之间）。
 * 签完到的会员从这里走（不逆着排队的人回长廊）。
 */
export const SCENE_PATHS: Rect[] = [
  { x0: 54.8, x1: 56.8, z0: FORECOURT.z1, z1: 15.25 },
  { x0: 36, x1: 56.8, z0: 15.25, z1: 16.6 },
];

/**
 * 到达小院里的石板引导道（这个场景加的，画面最亮的地面）：从门洞斜着引到柜台转角，再接上往下的小路。
 * 排队的人就站在它上面 → 视线：门 → 队伍 → 总监 → 小路。宽 1.8 米。
 */
export const RUNNER = {
  w: 1.8,
  pts: [
    [59.6, 0.4],
    [58.7, 3.0],
    [58.0, 5.9],
    [57.5, 8.4],
    [56.9, 10.0],
    [55.9, 11.0],
  ] as V2[],
};

/**
 * 第二条路（次要，碎花岗岩 = 长廊的材质，比石板暗）：门洞 → 西北接上长廊。不签到的人（会员卡直接进、教练、送货）走这条，
 * 门里就是一个 Y 字路口：左下（亮石板）去前台排队，左上（灰一点的碎花岗岩）去长廊。
 */
export const RUNNER2 = {
  w: 1.6,
  pts: [
    [59.6, -0.6],
    [57.8, -3.0],
    [55.4, -5.4],
    [52.0, -6.4],
  ] as V2[],
};

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
/**
 * 站位。deskStand = 总监接待位（柜台转角里面；HEAD_LINE_Z 以南，帽子不被帆布挡）。
 * queue = 排队的三个位置（从柜台往大门斜着排，都在凉棚东沿 x 56.6 以东：头顶没有帆布）。
 */
export const SPOTS = {
  deskStand: [55.55, 8.6] as V2,
  serve: [57.2, 8.85] as V2,
  queue1: [57.6, 7.6] as V2,
  queue2: [58.05, 6.35] as V2,
  queue3: [58.5, 5.1] as V2,
  gateIn: [59.0, 0.6] as V2,
  gateOut: [63.0, 0.4] as V2,
  /** 总监从毛巾车拿毛巾（站在车的东头，面朝西） */
  towels: [54.4, 8.75] as V2,
  /** 员工口：柜台南段西头和毛巾车之间（0.9 米宽） */
  staffGap: [54.65, 9.45] as V2,
  /** 自助饮水站前（会员接水；总监来换水桶） */
  water: [54.3, 10.6] as V2,
  pathTop: [55.8, 11.2] as V2,
  lawnPath: [55.8, 16.0] as V2,
  exitWest: [37.0, 16.0] as V2,
  /** 工具架前（扫帚、捡球器、吹叶机；desert3d-v2 的 tool-rack） */
  toolRack: [58.3, 14.15] as V2,
  promenadeWest: [44.0, -6.5] as V2,
} satisfies Record<string, V2>;

/** 路线：会员 = 门外 → 进门 → 排队 → 柜台 → 接水 → 小路 → 草坪边往西；总监 = 接待位 ↔ 毛巾车、员工口 → 水站 / 工具架 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  {
    id: 'member',
    pts: [
      SPOTS.gateOut,
      [61.2, 0.5],
      SPOTS.gateIn,
      [58.9, 3.6],
      SPOTS.queue3,
      SPOTS.queue2,
      SPOTS.queue1,
      SPOTS.serve,
      [57.0, 10.2],
      SPOTS.water,
      SPOTS.pathTop,
      SPOTS.lawnPath,
      [48.0, 16.0],
      SPOTS.exitWest,
    ],
  },
  { id: 'director-towel', pts: [SPOTS.deskStand, SPOTS.towels] },
  {
    id: 'director-out',
    pts: [SPOTS.deskStand, [54.9, 8.8], SPOTS.staffGap, SPOTS.water, [56.4, 12.0], SPOTS.toolRack],
  },
];

/**
 * 总监能走的地方（stage 3 的 control.ts 照这个做碰撞，desert3d-v2 的做法）：
 * 到达小院 + 长廊 + 小路 + 墙里的沙地；减掉：匹克球围场（西门进）、柜台、后柜、毛巾车、水站、工具架、凉棚柱、
 * 以及**凉棚下 HEAD_LINE_Z 以北**（x 52.3…56.5：进去了帽子就被帆布挡住，看不见总监 = 不让进）。
 * 广场、草坪走台阶上下。门洞以东是 clubpark（门口 gateOut 换场景）。
 */
export const WALKABLE = [
  { id: 'forecourt', note: '到达小院 FORECOURT（x 52.2…59.6、z −8.6…10.6），减掉凉棚下 z < HEAD_LINE_Z 的部分和柜台' },
  { id: 'desk-strip', note: `柜台后那一条：x 52.9…55.9、z ${(8.02).toFixed(2)}…9.1（总监接待、拿毛巾），从员工口进出` },
  { id: 'paths', note: '长廊（往西出画）、SCENE_PATHS 两段小路' },
  { id: 'sand', note: '墙里的沙地（东墙脚 x 56.8…59.6 那条是安静区，能走但不放东西）' },
  { id: 'stairs', note: 'STAIRS：广场两段、草坪一段，按级插值高度' },
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
  /** 标签文字（不给 = id） */
  label?: string;
  /** 标签贴在脚下（挤在一起的小东西） */
  labelBelow?: boolean;
}

const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）

export const SLOTS: Slot[] = [
  // ── 主角：凉棚 + 柜台 + 总监 + 排队的会员 ─────────────────────
  { id: 'desk-canopy', asset: 'desk-canopy', x: DESK.x, z: (CANOPY.z0 + CANOPY.z1) / 2 },
  { id: 'desk-counter', asset: 'desk-counter', x: 56.3, z: 9.4 },
  { id: 'back-cabinet', asset: 'back-cabinet', x: 52.8, z: 5.3 },
  { id: 'towel-cart', asset: 'towel-cart', x: 53.45, z: 8.7 },
  { id: 'water-station', asset: 'water-station', x: 53.4, z: 10.55, rotY: E, labelBelow: true },
  { id: 'checkin-board', asset: 'checkin-board', x: 57.15, z: 3.4, rotY: -0.35 },
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.deskStand[0],
    z: SPOTS.deskStand[1],
    rotY: 1.25,
    pose: ['idle', 0],
    prop: null,
    label: '总监',
  },
  {
    id: 'member-serve',
    asset: 'player',
    x: SPOTS.serve[0],
    z: SPOTS.serve[1],
    rotY: W,
    variant: 0,
    pose: ['idle', 0],
    prop: null,
    label: '签到',
  },
  {
    id: 'member-q1',
    asset: 'player',
    x: SPOTS.queue1[0],
    z: SPOTS.queue1[1],
    rotY: -0.35,
    variant: 1,
    pose: ['idle', 0.4],
    prop: 'racket',
  },
  {
    id: 'member-q2',
    asset: 'player',
    x: SPOTS.queue2[0],
    z: SPOTS.queue2[1],
    rotY: -0.3,
    variant: 2,
    pose: ['idle', 0.7],
    prop: 'racket',
    label: '排队 ×3',
  },
  {
    id: 'member-q3',
    asset: 'player',
    x: SPOTS.queue3[0],
    z: SPOTS.queue3[1],
    rotY: -0.45,
    variant: 0,
    pose: ['idle', 0.2],
    prop: null,
  },
  {
    id: 'member-in',
    asset: 'player',
    x: 58.6,
    z: 1.8,
    rotY: -0.95,
    variant: 1,
    pose: ['walk', 0.25],
    prop: 'racket',
    label: '进门',
  },
  {
    id: 'member-out',
    asset: 'player',
    x: 55.9,
    z: 13.0,
    rotY: 0.1,
    variant: 2,
    pose: ['walk', 0.6],
    prop: 'racket',
  },
  { id: 'tool-rack', asset: 'tool-rack', x: 58.3, z: 13.4 },
  // ── 大门（内侧）：和 clubpark 共用的门柱、横梁；门里一个陶罐 ─────────
  { id: 'east-gate', asset: 'east-gate', x: GATE.x, z: 0 },
  { id: 'pot-gate', asset: 'pot', x: 58.4, z: -7.3 },
  { id: 'agave-pot', asset: 'agave', x: 58.4, z: -7.3, y: 0.85, s: 0.55 },
  { id: 'agave-out-n', asset: 'agave', x: 62, z: -8 },
  { id: 'agave-out-s', asset: 'agave', x: 62, z: 8.5 },
  // 门外车道两边的蒲葵（地图 scatter 的位置；只有横屏看得到）
  { id: 'palm-drive-n', asset: 'fan-palm', x: 66, z: -5.4, s: 0.95, variant: 2 },
  { id: 'palm-drive-s', asset: 'fan-palm', x: 69, z: 5.4, s: 0.95, variant: 0 },
  // ── 框：上面两棵蒲葵（广场挡土墙前的绿带）、左下假紫荆、右下蒲葵 ──────
  { id: 'palm-nw', asset: 'fan-palm', x: 47.2, z: -10.4, variant: 0 },
  { id: 'palm-gate', asset: 'fan-palm', x: 58, z: -10.5, variant: 2 },
  { id: 'paloverde-lawn', asset: 'palo-verde', x: 45.4, z: 24.4, y: H.lawn, s: 1.3, variant: 0 },
  { id: 'palm-se', asset: 'fan-palm', x: 58.6, z: 25.2, variant: 1 },
  // 绿带里的灌木（少）
  { id: 'agave-strip', asset: 'agave', x: 55.0, z: -10.1, s: 0.9 },
  { id: 'brittle-strip', asset: 'brittlebush', x: 52.2, z: -10.7, variant: 1 },
  { id: 'creosote-strip', asset: 'creosote', x: 43.0, z: -10.3, variant: 1 },
  { id: 'bench-prom', asset: 'bench', x: 53.4, z: -9.4 },
  // ── 匹克球：东半场两个人（横屏再多两个） ──────────────────────
  { id: 'pickle-a', asset: 'player', x: 48.8, z: 1.2, rotY: W, variant: 1, pose: ['idle', 0.1], prop: 'racket' },
  { id: 'pickle-b', asset: 'player', x: 47.6, z: 10.8, rotY: W, variant: 0, pose: ['idle', 0.5], prop: 'racket' },
  { id: 'pickle-c', asset: 'player', x: 39.4, z: 2.0, rotY: E, variant: 2, pose: ['idle', 0.3], prop: 'racket' },
  { id: 'pickle-d', asset: 'player', x: 40.2, z: 9.6, rotY: E, variant: 1, pose: ['idle', 0.8], prop: 'racket' },
  // ── 草坪：遮阳帆 + 一个在拉伸的人 + 长椅 ─────────────────────
  { id: 'sail-lawn', asset: 'shade-sail', x: 39.8, z: 21.0, y: H.lawn, s: 1.2 },
  {
    id: 'lawn-player',
    asset: 'player',
    x: 49.6,
    z: 21.6,
    y: H.lawn,
    rotY: 0.3,
    variant: 2,
    pose: ['idle', 0.9],
    prop: null,
  },
  { id: 'bench-lawn', asset: 'bench', x: 52.4, z: 18.4, y: H.lawn },
  // ── 横屏才看得到的两侧 ────────────────────────────────────
  { id: 'smoke-w', asset: 'smoke-tree', x: 32.0, z: -10.4, variant: 0 },
  { id: 'paloverde-w', asset: 'palo-verde', x: 27.6, z: -14.6, variant: 1 },
  { id: 'creosote-w', asset: 'creosote', x: 38.6, z: -10.6, variant: 0 },
  { id: 'court-player', asset: 'player', x: 30.4, z: 3.4, rotY: W, variant: 0, pose: ['idle', 0.6], prop: 'racket' },
];

/**
 * 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议
 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '喷泉广场 +1.2', x: 47, y: 2.2, z: -15 },
  { text: '长廊 → 西边球场', x: 48, y: 0.6, z: -6.3 },
  { text: '到达小院', x: 57.6, y: 0.4, z: -3.2 },
  { text: '匹克球', x: 47, y: 0.6, z: 5.8 },
  { text: '球员草坪 −0.5', x: 53.2, y: 0.4, z: 22.5 },
  { text: '门外 → clubpark', x: 62.6, y: 0.4, z: -1.6 },
  { text: '东墙 x 60', x: 60, y: 2.6, z: 16 },
  { text: '安静', x: 57.8, y: 0.4, z: 19.6 },
  { text: '西边球场（横屏）', x: 29, y: 0.6, z: 9 },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来，
 * 这里的 x 写世界坐标，wrapX 换算。只走两条带：广场（z −14…−20）和草坪（z 19…24）—— 永远不上前台（z −4…14）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(41), -17.0, 4.6, 1.7],
  [wrapX(45), -17.8, 2.6, 1.2],
  [wrapX(-7), -16.6, 4.2, 1.5],
  [wrapX(-4), -17.4, 2.4, 1.1],
  [wrapX(40), 21.4, 4.0, 1.6],
  [wrapX(43.5), 22.2, 2.4, 1.2],
  [wrapX(-8), 21.0, 4.4, 1.6],
  [wrapX(-5), 21.8, 2.6, 1.1],
];
export const CLOUD_VEL = 0.12;
