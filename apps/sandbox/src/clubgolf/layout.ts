// clubgolf 的构图：南墙外的沙漠高尔夫（白模阶段）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）：GOLF（x −64…92、z 53…74）、GOLF_POND、GROUNDS（南墙 z 52）、PATHS 只读 import。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米），等效地面 z_eq = z − y。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
// 地块是一条 156 × 21 米的细长条：只在水塘边做一个洞当主画面（第 7 洞，三杆洞，过水），两头用低成本的球道条带延伸到地块的两头。
//
//        x −64        −50     −43        −36.5   −30         −22       −10      −2 ……………… 92
//   z 52 ▓▓▓▓▓▓▓▓▓▓▓▓ 南墙（暗带 1）▓▓▓▓▓▓▓ ╡门╞ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//        棕榈            palo verde    ↓总监   棕榈          棕榈             棕榈
//   z 55 ═════════════ 球车道（沿南墙，整条地块）════════ 球车 ══════════════ 球车 ═══════════
//   z 58  ～西边球道～  ┌──── 果岭岛（草）──────────────────┐   砂石地    ┌─发球岛─┐  ～东边球道条带～
//   z 63  条纹    沙坑 │ 果岭 ⚑ 推杆的人      水  塘       │ 石头 仙人球 │ ▤发球台▤ │  条纹 … 远处的果岭 ⚑
//   z 68              │    沙坑                           │             └────────┘
//   z 72              └───────────────────────────────────┘ 砂石地、石头、龙舌兰
//   z 74 ……………………………………………… 沙漠 ………………………………………………………… 南边的矮山（z ≈ 93 起）……
//
// 原则：主角 = **水塘 + 果岭上的旗子**（全画面唯一一块冷色 + 最亮的一块绿），视线从发球台挥杆的人（右）→ 越过水塘 → 果岭上推杆的人（左）。
// 沙漠高尔夫的对比：修剪整齐的绿草是"岛"，岛与岛之间是沙漠砂石地（碎花岗岩）+ 石头 + 仙人球（"过沙漠、过水"的目标式打法）。
// 太阳在北偏东 8°（仰角 44°）：南墙朝镜头的南面是一条暗带（框）；墙边的棕榈影子往南落 ~8 米 —— 不落在果岭、发球台、推杆的人身上（见 SLOTS 的棕榈）。
// 安静的地方：果岭四周的草、水面、球车道、墙里的沙地、南边的砂石地。
import { GOLF, GOLF_POND, GROUNDS, LOT_S, PATHS, type Rect, type V2 } from '../clubsite/world';

export type { Rect, V2 };
export { GOLF, GOLF_POND, GROUNDS, LOT_S };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏 x −48.8…−31.2：南墙 + 新门 + 总监在上 1/6，果岭、旗子、推杆的人（左）和水塘西半（右）在上 1/3 线，
 * 中下是南边的砂石地和沙漠里几丛灌木，下沿是南边矮山的山脚（框）。
 * 横屏 x −55.5…2.1：整个第 7 洞（左果岭、中水塘、右发球台），上沿南墙 + 门，下沿砂石地。
 */
export const TARGET = {
  portrait: { x: -40.0, z: 69.0 },
  landscape: { x: -26.7, z: 63.6 },
};

/** 太阳：同 clubpark / clubdesk / clubplaza / clubfood（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 各层高度（米）：地块基本是平的；水塘、沙坑往下挖，发球台垫高 */
export const H = {
  ground: 0,
  /** 碎花岗岩（沙漠砂石地，整条地块） */
  gravel: 0.006,
  /** 球车道 */
  cartPath: 0.012,
  /** 草：长草（rough）一圈 → 球道草 → 修剪条纹 → 果岭边（collar）→ 果岭 */
  rough: 0.01,
  fairway: 0.014,
  stripe: 0.017,
  collar: 0.02,
  green: 0.023,
  /** 发球台顶（垫高，朝镜头的一面是一条矮石墙） */
  tee: 0.35,
  /** 水面（塘沿是一圈石头，北岸朝镜头的岸壁 = 一条暗带） */
  water: -0.38,
  /** 沙坑底 */
  bunker: -0.22,
} as const;

// ── 墙、门、球车道 ────────────────────────────────────────────
/** 南墙（clubmap2 的围墙尺寸，clubdesk/layout.ts 的 WALL）在 z 52；壁柱按整段 floor(124/12) = 10 等分：x −51.6、−39.2、−26.8、−14.4、−2 … */
export const SOUTH_WALL_Z = GROUNDS.z1;
/** 墙上原有的壁柱 x（main 不画墙外的东西时也按这个算门柱） */
export const WALL_PIERS: number[] = Array.from(
  { length: 9 },
  (_, i) => GROUNDS.x0 + ((GROUNDS.x1 - GROUNDS.x0) * (i + 1)) / 10,
);
/** 西步道（地图的 PATHS：x −38.5…−34.5，一直往南到 z 51 —— 现在是死胡同，正对着墙） */
export const WEST_PATH: Rect = PATHS.find((p) => p.x0 === -38.5 && p.x1 === -34.5) ?? {
  x0: -38.5,
  x1: -34.5,
  z0: -8.6,
  z1: 51,
};
/**
 * 建议：南墙在西步道南头开一道"高尔夫门"（门洞 x0…x1，宽 4.3 米，正对 4 米宽的西步道）。
 * 西门柱就是墙上原有的壁柱 x −39.2（宽 1.1 → 门洞西沿 −38.65），东门柱新加在 x −33.8。门扇往外（往南）开，平时开着。
 * 总监从会所 / 长廊沿西步道一直往南走就出门：墙里 (−36.5, 50.8) → 门洞 (−36.5, 52) → 墙外 (−36.5, 53.8) → 球车道。
 */
export const GOLF_GATE = { x: -36.5, x0: -38.65, x1: -34.35, z: GROUNDS.z1, eastPier: -33.8, h: 2.9 } as const;
/** 门外的落脚地（碎花岗岩 → 接球车道） */
export const GATE_APRON: Rect = { x0: -38.5, x1: -34.5, z0: GROUNDS.z1 + 0.35, z1: 55.0 };
/** 球车道（沿南墙，整条地块；2.2 米宽，球车停在上面） */
export const CART_PATH: Rect = { x0: GOLF.x0 - 2, x1: GOLF.x1 + 2, z0: 55.0, z1: 57.2 };

// ── 第 7 洞（三杆洞，过水）：发球台在东、果岭在西，中间是水塘 ───────────────
/** 发球台（垫高 0.35，四周一圈矮石墙；w 沿 x、d 沿 z） */
export const TEE = { x: -10, z: 64, w: 5.2, d: 3.6 } as const;
/** 果岭（椭圆）+ 一圈 0.6 米的果岭边（collar） */
export const GREEN = { x: -42.8, z: 63.0, rx: 3.6, rz: 2.8, collar: 0.6 } as const;
/** 旗杆（洞杯）的位置：果岭偏西北 */
export const PIN: V2 = [-44.0, 62.5];
/** 沙坑：果岭西边一个竖的、果岭和水塘之间（东南）一个横的 */
export const BUNKERS = [
  { id: 'bunker-w', x: -48.6, z: 62.8, rx: 1.0, rz: 1.9 },
  { id: 'bunker-s', x: -40.4, z: 67.6, rx: 1.7, rz: 0.95 },
] as const;
/** 水塘塘沿（一圈石头，宽 0.35） */
export const POND_RIM = 0.35;

/** 果岭岛（球道草，包住果岭、两个沙坑和整个水塘；外面一圈 1 米的长草） */
export const ISLAND_GREEN: V2[] = [
  [-50.6, 61.0],
  [-48.8, 58.0],
  [-42.0, 57.8],
  [-36.5, 58.9],
  [-29.0, 59.5],
  [-22.5, 60.5],
  [-19.6, 63.0],
  [-19.4, 67.4],
  [-22.0, 70.6],
  [-29.0, 72.2],
  [-37.0, 71.8],
  [-43.5, 69.8],
  [-49.5, 67.4],
  [-51.4, 64.0],
];
/** 发球岛 */
export const ISLAND_TEE: V2[] = [
  [-15.0, 61.4],
  [-12.0, 60.4],
  [-6.5, 60.8],
  [-4.6, 63.6],
  [-5.4, 66.8],
  [-9.0, 68.2],
  [-13.6, 67.4],
  [-15.6, 64.6],
];
/** 长草一圈的宽（米） */
export const ROUGH_W = 1.0;

/**
 * 低成本的球道条带（两头，延伸到地块的两头）：照 clubmap2/build.ts 的公式（弯弯的一条），z 夹在球车道南边和地块南沿之间；
 * 上面一道道修剪条纹（每 9 米一条 4.5 米宽的亮绿）；东边条带上有地图上的两块果岭（远处的旗子）和一个平的沙坑。
 */
export const BANDS = [
  { id: 'west', x0: GOLF.x0 - 6, x1: -53.4 },
  { id: 'east', x0: -2.0, x1: GOLF.x1 + 4 },
] as const;
export const BAND_Z: [number, number] = [57.9, 72.8];
/** 地图上的球道中线和半宽（clubmap2/build.ts 同一个公式） */
export const bandZc = (x: number) => 63.5 + Math.sin(x * 0.045) * 4 + Math.sin(x * 0.11 + 1) * 1.4;
export const bandHw = (x: number) => 6.5 + Math.sin(x * 0.07 + 2) * 2;
/** 东边条带上远处的果岭（地图上的位置）和一个平的沙坑 */
export const FAR_GREENS: { x: number; z: number; r: number }[] = [
  { x: 8, z: 66.5, r: 3.4 },
  { x: 66, z: 60.5, r: 3.6 },
];
export const FAR_BUNKERS: { x: number; z: number; rx: number; rz: number }[] = [
  { x: 2.6, z: 68.4, rx: 1.8, rz: 1.0 },
  { x: 36, z: 68, rx: 3, rz: 1.8 },
];

/** 沙漠砂石地（碎花岗岩）：整条地块，北沿贴墙脚，南沿起伏地融进沙漠 */
export const GRAVEL_N = GROUNDS.z1 + 0.35;

// ── 站位、路线、入口（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）

/**
 * 站位。总监的活（以后，见 clubgolf.md「玩法计划」）：耙沙坑、修果岭上的球痕、从水塘里捞球、开球车把球童 / 会员送到发球台。
 */
export const SPOTS = {
  /** 入口（建议的南墙门）：墙里、墙外 */
  gateIn: [-36.5, 50.8] as V2,
  gateOut: [-36.5, 53.8] as V2,
  /** 东边绕（开车来打球的会员）：停车场南片南沿 → 东墙外往南 → 球车道东段 */
  eastIn: [76.0, 26.6] as V2,
  eastOut: [76.0, 56.1] as V2,
  /** 球车停的地方（球车道上） */
  cartTee: [-12.2, 56.1] as V2,
  cartGreen: [-46.0, 56.1] as V2,
  /** 打球的人：发球台挥杆、等着的人；果岭推杆、扶旗的人 */
  tee: [-10.6, 64.4] as V2,
  teeWait: [-7.9, 62.9] as V2,
  putt: [-41.4, 62.4] as V2,
  pin: [-44.6, 62.0] as V2,
  /** 总监的活：耙两个沙坑、塘边捞球（北岸）、果岭修球痕 */
  rakeW: [-49.9, 62.6] as V2,
  rakeS: [-40.4, 69.0] as V2,
  pondBalls: [-28.5, 61.0] as V2,
  greenRepair: [-42.2, 64.6] as V2,
} satisfies Record<string, V2>;

/** 路线 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  // 总监：西步道往南 → 南墙门 → 球车道 → 果岭北边
  { id: 'director-gate', pts: [[-36.5, 44], SPOTS.gateIn, SPOTS.gateOut, [-37.6, 56.1], [-43.0, 57.6]] },
  // 球车：沿球车道从发球台开到果岭（停在两头）
  { id: 'cart', pts: [SPOTS.cartTee, [-24, 56.1], SPOTS.cartGreen] },
  // 打完的人：果岭 → 球车
  { id: 'golfer-walk', pts: [SPOTS.putt, [-44.0, 58.6], SPOTS.cartGreen] },
];

/**
 * 能走的地方（stage 3 的 control.ts 照这个做碰撞）：
 * 球车道 + 门外落脚地 + 草（两个岛）+ 砂石地，减掉水塘、发球台的立面（从岛上上台：西边、东边坡上去）、石头、仙人球的脚印；
 * 沙坑能进（耙沙）、果岭能上（修球痕，演出里会员推杆时总监别站在推杆线上）。往外：南墙门 = 西步道 → 俱乐部；
 * 球车道往东到 x 92 再往北（东墙外）= 停车场南片（开车来的会员）；地块南沿往南是沙漠和矮山（不能去）。
 */
export const WALKABLE = [
  { id: 'gate', note: '门洞 x −38.65…−34.35、z 51.65…52.35（墙厚 0.7）；墙里接西步道 x −38.5…−34.5' },
  { id: 'path', note: '球车道 z 55…57.2（整条地块）+ 门外落脚地 x −38.5…−34.5、z 52.35…55' },
  { id: 'turf', note: 'ISLAND_GREEN、ISLAND_TEE 加一圈 1 米长草；减水塘（GOLF_POND + 塘沿 0.35）' },
  { id: 'gravel', note: 'GOLF x −64…92、z 52.35…~74 的砂石地，减 SLOTS 里石头、仙人球、棕榈的脚印' },
];

/** 资产位置（占位或资产）。asset = assets/<asset>.ts 或复用的资产；rotY 弧度（0 = 面朝镜头 +z）；s 缩放；y 不填 = 地面高度 */
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
  /** 人物：手里拿一件占位（新资产 id，例如 golf-club / putter），用 clubsite/people 的 hold() 挂到右手 */
  hold?: string;
  /** 标签文字（不给 = id） */
  label?: string;
  /** 标签贴在脚下 */
  labelBelow?: boolean;
  /** 没有标签 */
  noLabel?: boolean;
  /** 标签放在这个世界坐标 */
  labelAt?: [number, number, number];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)） */
  seat?: [number, number?];
}

export const SLOTS: Slot[] = [
  // ── 南墙的门（建议）──────────────────────────────────────────
  { id: 'golf-gate', asset: 'golf-gate', x: GOLF_GATE.x, z: GOLF_GATE.z, labelAt: [GOLF_GATE.x, 3.6, GOLF_GATE.z] },
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.gateOut[0] + 0.3,
    z: SPOTS.gateOut[1] + 0.2,
    rotY: 0.15,
    pose: ['walk', 0.3],
    prop: null,
    label: '总监（从南墙门出来）',
    labelBelow: true,
  },
  // ── 果岭：旗杆 + 推杆的人 + 扶旗的人 + 球 ───────────────────────────
  { id: 'flagstick', asset: 'flagstick', x: PIN[0], z: PIN[1], variant: 0, labelAt: [PIN[0] - 1.6, 3.0, PIN[1]] },
  {
    id: 'putter',
    asset: 'player',
    x: SPOTS.putt[0],
    z: SPOTS.putt[1],
    rotY: 0,
    variant: 2,
    pose: ['idle', 0.2],
    prop: null,
    hold: 'putter',
    look: [PIN[0], 0.3, PIN[1]],
    label: '推杆（姿势待加）',
    labelBelow: true,
  },
  {
    id: 'pin-tender',
    asset: 'player',
    x: SPOTS.pin[0],
    z: SPOTS.pin[1],
    rotY: E - 0.4,
    variant: 1,
    pose: ['idle', 0.6],
    prop: null,
    look: [SPOTS.putt[0], 1.2, SPOTS.putt[1]],
    noLabel: true,
  },
  { id: 'ball-green', asset: 'golf-ball', x: -42.3, z: 62.7, y: H.green, noLabel: true },
  { id: 'bag-green', asset: 'golf-bag', x: -46.9, z: 59.5, rotY: 0.3, labelAt: [-47.6, 1.7, 59.5] },
  // ── 发球台：挥杆的人 + 等着的人 + 球包 + 发球台标志 ─────────────────────
  {
    id: 'teer',
    asset: 'player',
    x: SPOTS.tee[0],
    z: SPOTS.tee[1],
    y: H.tee,
    rotY: 0,
    variant: 0,
    pose: ['serve', 0.25],
    prop: null,
    hold: 'golf-club',
    label: '挥杆（姿势待加）',
    labelBelow: true,
  },
  {
    id: 'tee-wait',
    asset: 'player',
    x: SPOTS.teeWait[0],
    z: SPOTS.teeWait[1],
    y: H.tee,
    rotY: W + 0.5,
    variant: 3,
    pose: ['idle', 0.4],
    prop: null,
    look: [GREEN.x, 1, GREEN.z],
    noLabel: true,
  },
  { id: 'bag-tee', asset: 'golf-bag', x: -7.0, z: 62.6, y: H.tee, rotY: -0.2, noLabel: true },
  { id: 'tee-markers', asset: 'tee-markers', x: TEE.x, z: TEE.z, y: H.tee, labelAt: [TEE.x + 1.6, 1.6, TEE.z + 1.4] },
  // ── 球车：一辆停在发球台北边（有人坐着），一辆停在果岭北边 ───────────────
  { id: 'cart-tee', asset: 'golf-cart', x: SPOTS.cartTee[0], z: SPOTS.cartTee[1], rotY: 0, variant: 0 },
  {
    id: 'cart-driver',
    asset: 'player',
    x: SPOTS.cartTee[0] - 0.15,
    z: SPOTS.cartTee[1] + 0.2,
    rotY: E - 0.3,
    variant: 1,
    seat: [0.62, 0.22],
    pose: ['sit', 0.1],
    prop: null,
    look: [SPOTS.tee[0], 1.2, SPOTS.tee[1]],
    noLabel: true,
  },
  {
    id: 'cart-green',
    asset: 'golf-cart',
    x: SPOTS.cartGreen[0],
    z: SPOTS.cartGreen[1],
    rotY: P,
    variant: 1,
    noLabel: true,
  },
  // ── 沙坑的耙子、塘里的鸭子、跑过砂石地的走鹃 ──────────────────────────
  { id: 'rake-w', asset: 'bunker-rake', x: -50.0, z: 63.8, rotY: 1.3, noLabel: true },
  { id: 'rake-s', asset: 'bunker-rake', x: -40.6, z: 69.0, rotY: 0.1, labelAt: [-40.6, 0.6, 69.4] },
  { id: 'ducks', asset: 'ducks', x: -27.6, z: 67.4, y: H.water, rotY: 0.6 },
  { id: 'roadrunner', asset: 'roadrunner', x: -17.0, z: 70.6, rotY: W + 0.2, labelAt: [-17.0, 1.2, 70.6] },
  // ── 墙边：棕榈（影子往南落 ~8 米，不落在果岭、发球台上）+ 西头一棵 palo verde ──
  { id: 'palm-1', asset: 'fan-palm', x: -57.4, z: 53.9, variant: 1, s: 1.05, noLabel: true },
  { id: 'palm-2', asset: 'fan-palm', x: -32.6, z: 53.9, variant: 0, s: 1.1, label: '棕榈（复用）' },
  { id: 'palm-3', asset: 'fan-palm', x: -21.0, z: 53.8, variant: 2, s: 1.0, noLabel: true },
  { id: 'palm-4', asset: 'fan-palm', x: -1.8, z: 53.9, variant: 1, s: 1.1, noLabel: true },
  { id: 'palo-w', asset: 'palo-verde', x: -51.2, z: 53.7, variant: 0, s: 0.8, noLabel: true },
  // ── 砂石地：石头、仙人球、龙舌兰、ocotillo（成簇，放在构图标的位置）──────────────
  // 发球台和水塘之间（"过沙漠"）：一组红岩 + 两个仙人球
  { id: 'rocks-carry', asset: 'rocks', x: -17.2, z: 63.6, variant: 0, label: '石头（复用）' },
  { id: 'barrel-1', asset: 'barrel-cactus', x: -16.0, z: 65.8, variant: 0, noLabel: true },
  { id: 'barrel-2', asset: 'barrel-cactus', x: -18.2, z: 61.6, variant: 1, s: 0.8, noLabel: true },
  // 果岭岛西南的砂石地
  { id: 'rocks-sw', asset: 'rocks', x: -52.6, z: 70.2, variant: 2, noLabel: true },
  { id: 'agave-sw', asset: 'agave', x: -50.4, z: 71.0, noLabel: true },
  { id: 'ocotillo-sw', asset: 'ocotillo', x: -54.4, z: 69.0, variant: 0, noLabel: true },
  // 水塘南边砂石地
  { id: 'rocks-s', asset: 'rocks', x: -31.0, z: 73.9, variant: 1, s: 0.9, noLabel: true },
  { id: 'agave-s', asset: 'agave', x: -26.4, z: 73.2, s: 0.9, noLabel: true },
  // 发球岛东南
  { id: 'rocks-se', asset: 'rocks', x: -3.4, z: 69.4, variant: 2, s: 0.85, noLabel: true },
  { id: 'barrel-se', asset: 'barrel-cactus', x: -1.2, z: 70.4, variant: 2, noLabel: true },
  { id: 'brittle-se', asset: 'brittlebush', x: -6.6, z: 70.8, variant: 0, noLabel: true },
  // 塘沿的大石（北岸两块、东头一块：打水漂的地方，鸭子歇脚）
  { id: 'rock-pond-n', asset: 'rocks', x: -33.4, z: 61.8, variant: 1, s: 0.6, noLabel: true },
  { id: 'rock-pond-e', asset: 'rocks', x: -22.0, z: 66.6, variant: 0, s: 0.55, noLabel: true },
  // 墙边球车道北侧的灌木（门东边）
  { id: 'creosote-w', asset: 'creosote', x: -46.6, z: 53.4, variant: 1, noLabel: true },
  { id: 'brittle-n', asset: 'brittlebush', x: -27.4, z: 53.6, variant: 1, noLabel: true },
  // 墙里：西步道南头两边各一盆（门里）—— 用 agave 代
  { id: 'agave-in-w', asset: 'agave', x: -39.6, z: 50.6, s: 0.8, noLabel: true },
  { id: 'agave-in-e', asset: 'agave', x: -33.4, z: 50.6, s: 0.8, noLabel: true },
  // 打偏到沙漠里找球的会员（故事点：竖屏下半、横屏下沿；以后可以是"总监开球车去接"的活）
  {
    id: 'ball-hunter',
    asset: 'player',
    x: -39.2,
    z: 80.6,
    rotY: W + 0.6,
    variant: 2,
    pose: ['pickup', 0.3],
    prop: null,
    hold: 'golf-club',
    label: '打进沙漠找球的人',
    labelBelow: true,
  },
  { id: 'ball-desert', asset: 'golf-ball', x: -40.1, z: 81.3, noLabel: true },
  // 南边的沙漠（地块外，z 76…88）：几丛手摆的灌木和石头，竖屏的下半、横屏的下沿（不撒满，成簇）
  { id: 'desert-a1', asset: 'creosote', x: -47.0, z: 78.4, variant: 0, noLabel: true },
  { id: 'desert-a2', asset: 'rocks', x: -45.6, z: 79.2, variant: 2, s: 0.7, noLabel: true },
  { id: 'desert-a3', asset: 'barrel-cactus', x: -48.4, z: 79.6, variant: 1, s: 0.8, noLabel: true },
  { id: 'desert-b1', asset: 'smoke-tree', x: -36.4, z: 82.6, variant: 0, noLabel: true },
  { id: 'desert-b2', asset: 'brittlebush', x: -34.6, z: 83.4, variant: 1, noLabel: true },
  { id: 'desert-c1', asset: 'creosote', x: -22.4, z: 79.0, variant: 1, noLabel: true },
  { id: 'desert-c2', asset: 'agave', x: -20.8, z: 79.8, s: 0.9, noLabel: true },
  { id: 'desert-d1', asset: 'ocotillo', x: -8.4, z: 82.6, variant: 1, noLabel: true },
  { id: 'desert-d2', asset: 'rocks', x: -6.8, z: 83.4, variant: 0, s: 0.8, noLabel: true },
  { id: 'desert-e1', asset: 'creosote', x: -42.4, z: 89.0, variant: 2, noLabel: true },
  { id: 'desert-e2', asset: 'brittlebush', x: -40.8, z: 89.6, variant: 0, noLabel: true },
  { id: 'desert-f1', asset: 'cholla', x: -53.6, z: 84.6, variant: 0, noLabel: true },
  { id: 'desert-f2', asset: 'brittlebush', x: -52.0, z: 85.4, variant: 1, noLabel: true },
  { id: 'desert-g1', asset: 'creosote', x: 1.8, z: 78.2, variant: 0, noLabel: true },
  // 东边条带远处的果岭（地图上的位置）：旗杆
  { id: 'flag-far-1', asset: 'flagstick', x: FAR_GREENS[0].x, z: FAR_GREENS[0].z, variant: 1, noLabel: true },
  { id: 'flag-far-2', asset: 'flagstick', x: FAR_GREENS[1].x, z: FAR_GREENS[1].z, variant: 1, noLabel: true },
  // 发球岛北边一张长椅（等的人坐）
  { id: 'bench-tee', asset: 'bench', x: -4.4, z: 57.9, rotY: 0, noLabel: true },
];

/** 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '南墙 z 52', x: -50, y: 2.6, z: 52 },
  { text: '西步道（墙里）', x: -36.5, y: 0.3, z: 46 },
  { text: '建议：南墙开门（入口 −36.5, 52）', x: -36.5, y: 0.4, z: 48.6, kind: 'propose' },
  { text: '球车道（沿南墙）', x: -26, y: 0.3, z: 56.1 },
  { text: '第 7 洞 · 三杆洞（过水）', x: -30, y: 0.4, z: 70.8 },
  { text: '果岭', x: -42.8, y: 0.3, z: 65.4 },
  { text: '水塘 GOLF_POND', x: -30, y: 0.2, z: 66.4 },
  { text: '发球台', x: -10, y: 0.6, z: 66.4 },
  { text: '沙漠砂石地（安静）', x: -14, y: 0.3, z: 73.4 },
  { text: '→ 东边球道条带（到 x 92）', x: 0, y: 0.3, z: 60.2 },
  { text: '← 西边球道条带（到 x −64）', x: -54, y: 0.3, z: 66 },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来（每 96 米重复一次）。
 * 只走两条带：墙里的沙地（z 44…48）和南边的砂石地（z 73…77）—— 永远不上果岭、水塘、发球台（z 58…72）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-44), 45.6, 4.2, 1.5],
  [wrapX(-40.5), 46.6, 2.4, 1.0],
  [wrapX(-6), 45.2, 4.0, 1.4],
  [wrapX(-24), 75.6, 4.6, 1.5],
  [wrapX(-20), 76.6, 2.6, 1.1],
  [wrapX(-58), 76.0, 4.0, 1.4],
];
export const CLOUD_VEL = 0.12;
