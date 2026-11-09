// clubpool 的构图：会所南边的泳池（棕榈泉度假风）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；POOL、POOL_DECK、CLUBHOUSE、GROUNDS、COURTS、PATHS 从那边 import（只读）。
// 这里只放这个场景自己的东西（池畔平台的高、围栏和门、躺椅、救生员椅、帐篷、站位、路线、资产位置、云），也写在同一套世界坐标里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米），等效地面 z_eq = z − y。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
//            x −64 西墙   −61               −47.6                 −39  −38.5 西步道 −34.5   青训西场 →
//   z −16  ┌──┐ 会所南翼（红瓦，朝镜头的白墙 = 暗带 1）┐  主楼南面 + 钟楼（会所场景的）
//   z −10  │  └──────────────────────────┘  ║ 石板小路（建议）
//          │   蒲葵  龙舌兰  花坛            ║                      蒲葵 │ 长廊（z −8.6…−4.4）→ 东
//   z −1   │  ┌─帐篷─┐  ▓▓▓▓▓ 围栏 ▓▓▓ 北门 ▓▓▓▓▓  ┌─帐篷─┐             │
//          │  │      │   淋浴  救生员高椅 ║台阶  总监捞叶子 │      │             │
//   z 3    │  ├──────┴──────────────────────────────────┴──────┤             │
//          │  │ 躺椅 ×4 │      泳池（青绿，14 × 10）      │ 浅水台阶 │ 毛巾车     │
//          │  │ 伞      │  游泳的人、火烈鸟浮床、池边坐着的人 │ 孩子+家长 │ 回收筐     │
//   z 13   │  │ 梯子    ├─────────────────────────────────┤         │ 淋浴       │
//          │泵房 躺椅 ×2 伞 躺椅 ×2 伞 躺椅 ×2 伞 躺椅 ×2       东门 ═台阶═ 西步道 → 两排场之间的步道
//   z 18   │  └▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 抬高的池畔平台南沿 + 围栏（暗带 2）▓▓▓▓▓▓▓▓▓▓▓┘
//          │  蒲葵     晒太阳的草坪（建议，安静）              蒲葵  palo verde（clubcourts 的）
//   z 27   │
//
// 原则：主角 = **池水**（画面里最大、最饱和的一块冷色，青绿玻璃），在竖屏正中；它四周是浅奶油的池畔（安静），
// 上面会所南翼的白墙（朝镜头 = 暗档）+ 红瓦做背后的锚，下面抬高 0.45 米的池畔平台南沿 + 矮围栏是一条暗带，再往下是安静的草坪。
// 暖色（躺椅垫的橘子橙、火烈鸟的粉、救生员的红）一排排撒在青水的南边和池里 —— 青 ↔ 橙对着。
// 视线：右下东门进来的会员 → 南边一排躺椅 → 池里游泳的人和火烈鸟浮床 → 北边救生员高椅（最高的竖向元素）→ 北门 → 会所。
// 太阳在北偏东 8°（仰角 44°）：救生员椅、帐篷、伞的影子落向池里 / 池畔南边 —— 救生员椅的影子正好一条斜进北边池水（水面受影）。
// 安静的地方：池畔石板（除了躺椅、人不放东西）、草坪、北边的石板小路。
import { CLUBHOUSE, COURTS, GROUNDS, PATHS, POOL, POOL_DECK, type Rect, type V2 } from '../clubsite/world';

export type { Rect, V2 };
export { CLUBHOUSE, COURTS, GROUNDS, PATHS, POOL, POOL_DECK };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点（竖屏 / 横屏）。
 * 竖屏 x −58.8…−41.2：整个池子（x −57…−43）居中，两边各露一截池畔和帐篷；上 1/5 是会所南翼的白墙 + 红瓦，下 1/4 是平台南沿和草坪。
 * 横屏 x −74…−16：左边西墙和墙外的沙漠，中间整个池畔平台，右边西步道和青训西场 / 会员场的西头（邻居）。
 */
export const TARGET = {
  portrait: { x: -50, z: 5 },
  landscape: { x: -46, z: 7 },
};

/** 太阳：同 clubpark / clubdesk / clubplaza / clubfood（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（围墙、球场、步道裁到这里面）。西到西墙，东到青训西场的一半（横屏右沿 x −16） */
export const CLIP: Rect = { x0: GROUNDS.x0, x1: -8, z0: GROUNDS.z0, z1: 40 };

/**
 * 各层高度（米）：**池畔平台抬高 0.45**（建议：三级台阶上去；朝镜头的南沿 + 围栏是画面下面那条暗带）；池水面比平台低 0.3；
 * 池沿压顶比平台高 0.08。地面（草坪、步道、会所门前）都在 0。
 */
export const H = { ground: 0, deck: 0.45, water: 0.15, coping: 0.53 } as const;
/** 池沿压顶宽（池子 POOL 外面一圈） */
export const COPING = 0.45;

/** 池畔平台（= POOL_DECK，抬高 H.deck）、矮围栏（平台边往里 0.2 米，高 1.2） */
export const DECK: Rect = POOL_DECK;
export const FENCE = { x0: DECK.x0 + 0.2, x1: DECK.x1 - 0.2, z0: DECK.z0 + 0.2, z1: DECK.z1 - 0.2, h: 1.2 } as const;
/**
 * 门（沿那一边的世界坐标 + 门宽）：
 * - 北门：x −47.6，正对会所钟楼底的南门（world.ts 的 CLUBHOUSE_DOORS.south，出来是南拱廊东头），外面三级台阶下到石板小路；
 * - 东门：z 15.5，正对西步道和两排场之间那条步道（PATHS z 14.4…16.6）的丁字口，外面三级台阶下到西步道；
 * - 西边工作门：z 14.6，对着围栏外的泵房（总监加氯、洗滤网）。
 */
export const GATES = {
  north: { side: 'n' as const, at: -47.6, gap: 1.8 },
  east: { side: 'e' as const, at: 15.5, gap: 1.8 },
  service: { side: 'w' as const, at: 14.6, gap: 1.0 },
};
/** 平台外的台阶（三级，每级高 0.15、深 0.3）：北门往北下、东门往东下（东门那段压进西步道 0.4 米） */
export const DECK_STEPS = {
  north: { x0: -48.7, x1: -46.5, z0: DECK.z0 - 0.9, z1: DECK.z0, dir: 'n' as const },
  east: { x0: DECK.x1, x1: DECK.x1 + 0.9, z0: 14.4, z1: 16.6, dir: 'e' as const },
  service: { x0: DECK.x0 - 0.6, x1: DECK.x0, z0: 14.0, z1: 15.2, dir: 'w' as const },
};
/** 会所 → 北门的石板小路（建议）：只画到 z −10（再往北是 CLUBHOUSE 的范围，归会所场景） */
export const NORTH_WALK: Rect = { x0: -48.7, x1: -46.5, z0: CLUBHOUSE.z1, z1: DECK_STEPS.north.z0 };
/** 平台南边晒太阳的草坪（建议，安静）：围栏外 1.4 米起 */
export const LAWN: Rect = { x0: -59.5, x1: -42.5, z0: DECK.z1 + 1.4, z1: 25.4 };
/** 泵房（围栏外西南角，西墙和平台之间；门朝东对着工作门） */
export const PUMP = { x: -62.5, z: 14.6, w: 2.2, d: 3.6, h: 2.6 } as const;
/** 浅水台阶（池东头，罗马台阶：三级，池里）、深水在西头 */
export const POOL_STEPS = { x0: POOL.x1 - 1.5, x1: POOL.x1, z0: 5.5, z1: 10.5 } as const;

/** 会所的体块（照 clubmap2/build.ts 的 house() 抄，没导出；邻居 / 背景，归会所场景） */
export const HOUSE = {
  main: { x0: CLUBHOUSE.x0, x1: -46, z0: CLUBHOUSE.z0, z1: -16, h: 8, roof: 3.4 },
  east: { x0: -46, x1: CLUBHOUSE.x1, z0: CLUBHOUSE.z0, z1: -27, h: 5.2, roof: 2.4 },
  south: { x0: CLUBHOUSE.x0, x1: -50, z0: -16, z1: CLUBHOUSE.z1, h: 4.4, roof: 2 },
  tower: { x: -45.6, z: -18.2, w: 3.6, h: 12.5, roof: 2.6 },
} as const;

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const E = P / 2; // 面朝 +x（东）
const N = P; // 面朝 −z（北，背对镜头）

/**
 * 入口（clubwalk 把场景连起来时用；世界坐标，站在台阶外面的地上）：
 * - fromClub：会所 → 石板小路 → 北门台阶脚下（会所的门 / 小路北头归 clubhouse，见 NORTH_WALK）；
 * - fromWestPath：西步道（x −38.5…−34.5）→ 东门台阶脚下（正对两排场之间的步道 z 14.4…16.6）；
 * - service：泵房门口（只有总监）。
 */
export const ENTRANCES = {
  fromClub: [-47.6, -2.4] as V2,
  fromWestPath: [-37.6, 15.5] as V2,
  service: [-61.5, 14.6] as V2,
} satisfies Record<string, V2>;

/**
 * 站位。director 系列 = 总监的活（stage 3，见 clubpool.md「玩法计划」）：
 * - 捞叶子：池水里漂着蒲葵叶 / 虫子 → 拿捞网沿池边捞（skimN / skimE / skimW）；
 * - 收毛巾：躺椅上、地上留下用过的毛巾 → 收进回收筐（hamper），干净的补到毛巾车（towels）；
 * - 加氯 / 洗滤网：泵房（pump）—— 不管的话池水慢慢变绿（先出画面信号）；
 * - 顶班：救生员要休息 → 总监坐上高椅（guard）顶一会儿（这段时间别处没人管）；
 * - 摆椅子、撑伞：客人走了躺椅乱了、伞没收（lounger*、umbrella*）。
 */
export const SPOTS = {
  ...ENTRANCES,
  /** 北门里面、东门里面（门内一步） */
  northGate: [-47.6, -0.2] as V2,
  eastGate: [-39.8, 15.5] as V2,
  /** 捞叶子：北池沿（朝南、给脸）、东头、西头（深水） */
  skimN: [-49.6, 2.4] as V2,
  skimE: [-42.3, 5.0] as V2,
  skimW: [-57.7, 8.0] as V2,
  /** 救生员高椅（顶班坐上去）、椅子脚下 */
  guard: [-52.5, 1.7] as V2,
  guardFoot: [-52.5, 2.5] as V2,
  /** 毛巾：干净的毛巾车、用过的回收筐 */
  towels: [-41.2, 11.6] as V2,
  hamper: [-41.2, 9.7] as V2,
  /** 泵房里（加氯、洗滤网） */
  pump: [-62.0, 14.6] as V2,
  /** 两个淋浴 */
  showerN: [-45.9, 0.6] as V2,
  showerE: [-40.0, 14.2] as V2,
  /** 南边一排躺椅前（摆椅子、收毛巾的路线经过） */
  loungerW: [-57.5, 14.2] as V2,
  loungerE: [-43.3, 14.2] as V2,
  /** 客人：浅水台阶下水、深水端的梯子 */
  stepsIn: [-42.4, 8.0] as V2,
  ladder: [-55.6, 2.4] as V2,
} satisfies Record<string, V2>;

/** 路线 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  // 会员从西步道进来：东门台阶 → 毛巾车拿毛巾 → 沿南池沿 → 躺椅
  { id: 'member-in', pts: [ENTRANCES.fromWestPath, SPOTS.eastGate, [-41.0, 13.6], SPOTS.loungerE, SPOTS.loungerW] },
  // 从会所来（换好衣服）：北门 → 淋浴冲一下 → 东池沿 → 浅水台阶下水
  { id: 'club-in', pts: [ENTRANCES.fromClub, SPOTS.northGate, SPOTS.showerN, [-42.3, 2.6], SPOTS.stepsIn] },
  // 总监：捞叶子（北 → 东 → 南 → 西，绕池一圈）
  {
    id: 'director-skim',
    pts: [SPOTS.skimN, [-42.3, 2.6], SPOTS.skimE, [-42.3, 13.6], [-57.7, 13.6], SPOTS.skimW, [-57.7, 2.6], SPOTS.skimN],
  },
  // 总监：收毛巾（躺椅一排 → 回收筐 → 毛巾车）
  { id: 'director-towels', pts: [SPOTS.loungerW, SPOTS.loungerE, [-41.4, 13.4], SPOTS.hamper, SPOTS.towels] },
  // 总监：加氯（南池沿西头 → 工作门 → 泵房）
  { id: 'director-pump', pts: [SPOTS.loungerW, [-60.2, 14.6], SPOTS.service, SPOTS.pump] },
];

/**
 * 总监能走的地方（stage 3 的 clubsite/play 照这个做碰撞）：
 * 池畔平台（DECK 里、FENCE 里面，减掉池子 + 池沿、帐篷、躺椅、伞座、救生员椅、淋浴、毛巾车的脚印）；
 * 三处台阶（DECK_STEPS）；石板小路 NORTH_WALK；草坪 LAWN；泵房（工作门进去）。池里不能走（以后要不要下水见「要商量的」）。
 * 往外：北门 → 会所（clubhouse），东门 → 西步道（往北 = 长廊 / clubfood，往东 = 两排场之间的步道 / clubcourts）。
 */
export const WALKABLE = [
  {
    id: 'deck',
    note: 'DECK x −61…−39、z −1…18（y = 0.45），围栏里面；减池子 x −57.45…−42.55、z 2.55…13.45 和 SLOTS 的脚印',
  },
  { id: 'steps', note: '北门台阶 x −48.7…−46.5、z −1.9…−1；东门台阶 x −39…−38.1、z 14.4…16.6；工作门台阶（西）' },
  { id: 'walk', note: 'NORTH_WALK x −48.7…−46.5、z −10…−1.9（建议的石板小路，北头接会所的南拱廊）' },
  { id: 'lawn', note: 'LAWN x −59.5…−42.5、z 19.4…25.4（建议的草坪；东边隔 4 米沙地是西步道）' },
  { id: 'pump', note: '泵房 x −63.6…−61.4、z 12.8…16.4（门朝东）' },
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
  /** 标签文字（不给 = id） */
  label?: string;
  /** 标签贴在脚下（挤在一起的小东西） */
  labelBelow?: boolean;
  /** 没有标签 */
  noLabel?: boolean;
  /** 标签放在这个世界坐标（挤在一起时挪开） */
  labelAt?: [number, number, number];
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点（lookAt） */
  look?: [number, number, number];
  /** 围栏：这一段的长（沿本地 x，米） */
  len?: number;
}

/**
 * 躺椅（本地：长边沿 z，靠背 / 头在 −z，脚在 +z）。rotY 0 = 头朝北、脚朝南；池南边那排头朝南、脚朝池子（rotY π）；
 * 池西边那排头朝西、脚朝池子（rotY π/2）。
 */
const LOUNGE_S = N;
const LOUNGE_W = E;
/** 南边一排：四对躺椅（每对中心 x），对与对之间一把伞 */
const SOUTH_PAIRS = [-57.4, -52.7, -48.0, -43.3] as const;
const SOUTH_Z = 15.9;
const UMB_S_Z = 16.9;
/** 西边：两对躺椅（z），中间一把伞 */
const WEST_X = -59.4;
const WEST_PAIRS = [5.6, 10.6] as const;

/** 坐在躺椅上的人（躺的姿势还没有：先用 sit 坐在躺椅上，座高 0.42，朝躺椅脚那头） */
const lounger = (
  id: string,
  x: number,
  z: number,
  rotY: number,
  v: number,
  pose: string,
  phase: number,
  extra: Partial<Slot> = {},
): Slot => ({
  id,
  asset: 'player',
  x,
  z,
  y: H.deck,
  rotY: rotY === LOUNGE_S ? N : rotY === LOUNGE_W ? E : 0,
  variant: v,
  seat: [0.42, 0.3],
  pose: [pose, phase],
  prop: pose === 'sip' ? 'cup' : null,
  noLabel: true,
  ...extra,
});

/** 池里的人：只露头和肩（人站在池底，y 往下沉；水面不透明，水下的身子看不见） */
const swimmer = (
  id: string,
  x: number,
  z: number,
  rotY: number,
  v: number,
  sink: number,
  extra: Partial<Slot> = {},
): Slot => ({
  id,
  asset: 'player',
  x,
  z,
  y: H.water - sink,
  rotY,
  variant: v,
  pose: ['idle', 0.3],
  prop: null,
  noLabel: true,
  ...extra,
});

export const SLOTS: Slot[] = [
  // ── 围栏（平台边往里 0.2 米，1.2 米高；四边按门切开）+ 门 ─────────────
  ...fenceRuns(),
  { id: 'gate-north', asset: 'pool-gate', x: GATES.north.at, z: FENCE.z0, y: H.deck, labelAt: [-47.6, 2.4, -1.4] },
  { id: 'gate-east', asset: 'pool-gate', x: FENCE.x1, z: GATES.east.at, y: H.deck, rotY: E, noLabel: true },
  {
    id: 'gate-service',
    asset: 'pool-gate',
    x: FENCE.x0,
    z: GATES.service.at,
    y: H.deck,
    rotY: W,
    variant: 1,
    noLabel: true,
  },
  // 台阶（平台外三级）
  { id: 'steps-north', asset: 'deck-steps', x: GATES.north.at, z: DECK.z0 - 0.45, labelBelow: true },
  { id: 'steps-east', asset: 'deck-steps', x: DECK.x1 + 0.45, z: 15.5, rotY: W, noLabel: true },
  {
    id: 'steps-service',
    asset: 'deck-steps',
    x: DECK.x0 - 0.3,
    z: GATES.service.at,
    rotY: E,
    variant: 1,
    noLabel: true,
  },
  // ── 北边池畔：两顶帐篷（框）、救生员高椅（最高的竖向元素）、淋浴 ───────────
  { id: 'cabana-w', asset: 'cabana', x: -58.4, z: 0.85, y: H.deck },
  { id: 'cabana-e', asset: 'cabana', x: -41.6, z: 0.85, y: H.deck, variant: 1, noLabel: true },
  lounger('cabana-w-sit', -58.9, 1.1, 0, 2, 'sip', 0.5, { seat: [0.4, 0.2] }),
  { id: 'lifeguard-chair', asset: 'lifeguard-chair', x: SPOTS.guard[0], z: SPOTS.guard[1], y: H.deck },
  {
    id: 'lifeguard',
    asset: 'player',
    x: SPOTS.guard[0],
    z: SPOTS.guard[1] + 0.05,
    y: H.deck,
    rotY: 0,
    variant: 2,
    seat: [1.8, 1.45],
    pose: ['sit', 0.4],
    prop: null,
    label: '救生员',
    look: [-49, 0.2, 8],
  },
  { id: 'shower-n', asset: 'pool-shower', x: SPOTS.showerN[0], z: SPOTS.showerN[1] - 0.6, y: H.deck },
  // 总监：北池沿捞叶子（朝南 = 给脸，捞网伸进池里）
  {
    id: 'director',
    asset: 'director',
    x: SPOTS.skimN[0],
    z: SPOTS.skimN[1],
    y: H.deck,
    rotY: 0,
    pose: ['sweep', 0.25],
    prop: null,
    label: '总监（捞叶子）',
  },
  {
    id: 'skim-net',
    asset: 'skim-net',
    x: SPOTS.skimN[0] + 0.1,
    z: SPOTS.skimN[1] + 0.35,
    y: H.water + 0.63,
    rotY: E,
    label: '捞网（复用 clubplaza）',
    labelBelow: true,
  },
  // ── 池子：浅水台阶（东）、两把梯子（深水端，西）─────────────────────
  {
    id: 'pool-steps',
    asset: 'pool-steps',
    x: (POOL_STEPS.x0 + POOL_STEPS.x1) / 2,
    z: (POOL_STEPS.z0 + POOL_STEPS.z1) / 2,
    y: H.water,
    labelAt: [-43.8, 0.6, 9.6],
  },
  { id: 'ladder-n', asset: 'pool-ladder', x: -55.6, z: POOL.z0, y: H.deck, labelAt: [-55.6, 1.6, 3.0] },
  { id: 'ladder-s', asset: 'pool-ladder', x: -55.6, z: POOL.z1, y: H.deck, rotY: N, noLabel: true },
  // 池里：游泳的人（往西游）、站在水里的两个、浅水台阶边的孩子 + 游泳圈、漂着的火烈鸟浮床
  swimmer('swim-lap', -51.8, 6.0, W, 1, 1.45, { label: '游泳', noLabel: false }),
  swimmer('swim-2', -48.4, 10.6, E - 0.6, 3, 1.15),
  swimmer('swim-parent', -45.8, 8.6, E + 0.3, 0, 1.0),
  {
    id: 'swim-kid',
    asset: 'kid',
    x: -45.1,
    z: 6.5,
    y: H.water - 0.75,
    rotY: W + 0.4,
    variant: 1,
    pose: ['idle', 0.6],
    prop: null,
    noLabel: true,
  },
  { id: 'float-ring', asset: 'pool-float', x: -45.1, z: 6.5, y: H.water, variant: 1, noLabel: true },
  { id: 'float-flamingo', asset: 'pool-float', x: -53.4, z: 10.4, y: H.water, rotY: 0.6, variant: 0 },
  // 池沿坐着泡脚的人（北池沿，朝南）
  {
    id: 'edge-sit',
    asset: 'player',
    x: -46.4,
    z: POOL.z0 + 0.2,
    y: H.water,
    rotY: 0,
    variant: 0,
    seat: [H.coping - H.water, -0.45],
    pose: ['sit', 0.7],
    prop: null,
    label: '池边泡脚',
    labelBelow: true,
  },
  // 漂在水上的蒲葵叶（总监要捞的）
  { id: 'litter-1', asset: 'palm-litter', x: -50.6, z: 4.3, y: H.water + 0.01, rotY: 0.4, label: '落叶（复用）' },
  { id: 'litter-2', asset: 'palm-litter', x: -47.2, z: 12.0, y: H.water + 0.01, rotY: -0.8, variant: 1, noLabel: true },
  // 池沿喝水的大尾拟八哥
  { id: 'bird-edge', asset: 'grackle', x: -56.4, z: POOL.z1 + 0.2, y: H.coping, rotY: N + 0.3, noLabel: true },
  // ── 南边一排躺椅（头朝南、脚朝池子）+ 伞 ───────────────────────────
  ...SOUTH_PAIRS.flatMap((cx, i) => [
    {
      id: `lounger-s${i}a`,
      asset: 'lounger',
      x: cx - 0.5,
      z: SOUTH_Z,
      y: H.deck,
      rotY: LOUNGE_S,
      variant: i % 3,
      noLabel: i !== 1,
      labelAt: [cx, 1.4, SOUTH_Z + 0.4] as [number, number, number],
    },
    {
      id: `lounger-s${i}b`,
      asset: 'lounger',
      x: cx + 0.5,
      z: SOUTH_Z,
      y: H.deck,
      rotY: LOUNGE_S,
      variant: (i + 1) % 3,
      noLabel: true,
    },
  ]),
  ...SOUTH_PAIRS.slice(0, 3).map((cx, i) => ({
    id: `umb-s${i}`,
    asset: 'court-umbrella',
    x: (cx + SOUTH_PAIRS[i + 1]) / 2,
    z: UMB_S_Z,
    y: H.deck,
    variant: i === 2 ? 2 : i % 2,
    label: '遮阳伞（复用 clubsite clay 款）',
    noLabel: i !== 0,
  })),
  ...SOUTH_PAIRS.slice(0, 3).map((cx, i) => ({
    id: `table-s${i}`,
    asset: 'side-table',
    x: (cx + SOUTH_PAIRS[i + 1]) / 2,
    z: SOUTH_Z - 0.4,
    y: H.deck,
    noLabel: i !== 1,
    labelBelow: true,
  })),
  lounger('sun-1', -57.9, SOUTH_Z - 0.2, LOUNGE_S, 1, 'sit', 0.2),
  lounger('sun-2', -52.2, SOUTH_Z - 0.2, LOUNGE_S, 3, 'sip', 0.6),
  lounger('sun-3', -48.5, SOUTH_Z - 0.2, LOUNGE_S, 0, 'sit', 0.8),
  lounger('sun-4', -47.5, SOUTH_Z - 0.2, LOUNGE_S, 2, 'sit', 0.4),
  // ── 西边池畔：两对躺椅（头朝西、脚朝池子）+ 一把伞 ──────────────────
  ...WEST_PAIRS.flatMap((cz, i) => [
    {
      id: `lounger-w${i}a`,
      asset: 'lounger',
      x: WEST_X,
      z: cz - 0.5,
      y: H.deck,
      rotY: LOUNGE_W,
      variant: (i + 2) % 3,
      noLabel: true,
    },
    {
      id: `lounger-w${i}b`,
      asset: 'lounger',
      x: WEST_X,
      z: cz + 0.5,
      y: H.deck,
      rotY: LOUNGE_W,
      variant: i % 3,
      noLabel: true,
    },
  ]),
  { id: 'umb-w', asset: 'court-umbrella', x: WEST_X - 0.6, z: 8.1, y: H.deck, variant: 1, noLabel: true },
  { id: 'table-w', asset: 'side-table', x: WEST_X + 0.2, z: 8.1, y: H.deck, noLabel: true },
  lounger('sun-w1', WEST_X + 0.2, 5.1, LOUNGE_W, 1, 'sip', 0.3),
  lounger('sun-w2', WEST_X + 0.2, 11.1, LOUNGE_W, 0, 'sit', 0.5),
  // ── 东边池畔：毛巾车（复用 clubdesk）、回收筐、淋浴；东门进来的会员 ─────────
  {
    id: 'towel-cart',
    asset: 'towel-cart',
    x: SPOTS.towels[0] + 0.7,
    z: SPOTS.towels[1],
    y: H.deck,
    rotY: W,
    label: '干净毛巾（复用 clubdesk 毛巾车）',
  },
  { id: 'towel-hamper', asset: 'towel-hamper', x: SPOTS.hamper[0] + 0.65, z: SPOTS.hamper[1], y: H.deck },
  {
    id: 'shower-e',
    asset: 'pool-shower',
    x: SPOTS.showerE[0] + 0.3,
    z: SPOTS.showerE[1] - 0.5,
    y: H.deck,
    variant: 1,
    noLabel: true,
  },
  {
    id: 'member-in',
    asset: 'player',
    x: -38.4,
    z: 15.3,
    y: 0.15,
    rotY: W,
    variant: 3,
    pose: ['walk', 0.3],
    prop: 'racket',
    label: '从西步道进来（打完球）',
    labelBelow: true,
  },
  {
    id: 'kid-shower',
    asset: 'kid',
    x: SPOTS.showerE[0] - 0.3,
    z: SPOTS.showerE[1] - 0.1,
    y: H.deck,
    rotY: E,
    variant: 2,
    pose: ['idle', 0.2],
    prop: null,
    noLabel: true,
  },
  // ── 围栏外：泵房（西南）、会所 → 北门的小路上走下来的会员 ─────────────────
  { id: 'pump-house', asset: 'pump-house', x: PUMP.x, z: PUMP.z, rotY: E, labelAt: [PUMP.x, 3.2, PUMP.z] },
  {
    id: 'from-club',
    asset: 'player',
    x: -47.6,
    z: -5.2,
    rotY: 0.15,
    variant: 1,
    pose: ['walk', 0.7],
    prop: null,
    label: '从会所下来',
    labelBelow: true,
  },
  // ── 棕榈（框）：会所和平台之间两棵、平台南边两棵；北边小路两边的花坛 ────────────
  { id: 'palm-nw', asset: 'fan-palm', x: -60.2, z: -4.8, variant: 0, s: 1.1, noLabel: true },
  { id: 'palm-ne', asset: 'fan-palm', x: -41.4, z: -3.6, variant: 1, s: 1.0, noLabel: true },
  { id: 'palm-sw', asset: 'fan-palm', x: -61.4, z: 25.6, variant: 2, s: 1.15, noLabel: true },
  { id: 'palm-se', asset: 'fan-palm', x: -42.4, z: 26.2, variant: 0, s: 1.05, noLabel: true },
  // clubcourts 摆的 palo verde（同一个世界坐标，这里只是邻居）
  { id: 'paloverde-w', asset: 'palo-verde', x: -40.6, z: 24.0, s: 0.95, variant: 0, noLabel: true },
  ...(
    [
      [-51.2, -6.8, 'agave', 0, 1],
      [-50.2, -4.6, 'brittlebush', 0, 1],
      [-51.4, -2.8, 'barrel-cactus', 0, 1],
      [-44.8, -7.2, 'brittlebush', 1, 1],
      [-45.2, -4.4, 'agave', 0, 0.9],
      [-44.6, -2.7, 'barrel-cactus', 1, 1],
      [-56.4, -6.0, 'creosote', 1, 1],
      [-58.0, 18.9, 'agave', 0, 0.8],
      [-50.0, 18.8, 'agave', 0, 0.8],
      [-43.0, 18.9, 'agave', 0, 0.8],
    ] as [number, number, string, number, number][]
  ).map(([x, z, asset, v, s], i) => ({ id: `plant-${i}`, asset, x, z, variant: v, s, noLabel: true })),
];

/** 围栏：四边按门切开成几段（本地 x 沿围栏，rotY 转到那一边），每段一个 pool-fence 占位 */
function fenceRuns(): Slot[] {
  const out: Slot[] = [];
  const cut = (a0: number, a1: number, doors: { at: number; gap: number }[]) => {
    const pieces: [number, number][] = [];
    let p = a0;
    for (const d of [...doors].sort((a, b) => a.at - b.at)) {
      if (d.at - d.gap / 2 > p) pieces.push([p, d.at - d.gap / 2]);
      p = d.at + d.gap / 2;
    }
    if (a1 > p) pieces.push([p, a1]);
    return pieces;
  };
  const { x0, x1, z0, z1 } = FENCE;
  const add = (side: 'n' | 's' | 'e' | 'w', a: number, b: number, i: number) => {
    const mid = (a + b) / 2;
    const alongX = side === 'n' || side === 's';
    out.push({
      id: `fence-${side}${i}`,
      asset: 'pool-fence',
      x: alongX ? mid : side === 'e' ? x1 : x0,
      z: alongX ? (side === 'n' ? z0 : z1) : mid,
      y: H.deck,
      rotY: alongX ? 0 : P / 2,
      len: b - a,
      noLabel: !(side === 's' && i === 0),
      labelAt: [-56, 1.8, z1],
    });
  };
  for (const [i, [a, b]] of cut(x0, x1, [GATES.north]).entries()) add('n', a, b, i);
  for (const [i, [a, b]] of cut(x0, x1, []).entries()) add('s', a, b, i);
  for (const [i, [a, b]] of cut(z0, z1, [GATES.east]).entries()) add('e', a, b, i);
  for (const [i, [a, b]] of cut(z0, z1, [GATES.service]).entries()) add('w', a, b, i);
  return out;
}

/** 区域标签（白模评审用，?labels=0 不显示）：文字、位置 (x, y, z)；kind area = 区域名，propose = 共享坐标的建议 */
export const AREA_LABELS: { text: string; x: number; y: number; z: number; kind?: 'area' | 'propose' }[] = [
  { text: '会所南翼（clubhouse，邻居）', x: -56, y: 7.2, z: -13 },
  { text: '泳池（池水 = 主角）', x: -50, y: 0.4, z: 8.6 },
  { text: '池畔平台（抬高 0.45）', x: -55.2, y: 0.6, z: 13.9 },
  { text: '西步道', x: -36.5, y: 0.3, z: 6.0 },
  { text: '青训西场（clubcourts）', x: -24, y: 0.3, z: 6 },
  { text: '建议：池畔平台抬高 0.45 米，北门 / 东门三级台阶', x: -50, y: 0.6, z: 18.6, kind: 'propose' },
  { text: '建议：会所 → 北门的石板小路', x: -47.6, y: 0.4, z: -8.6, kind: 'propose' },
  { text: '建议：晒太阳的草坪', x: -50.5, y: 0.3, z: 22.8, kind: 'propose' },
  { text: '入口：会所 (−47.6, −2.4)', x: -51.6, y: 0.3, z: -2.0, kind: 'propose' },
  { text: '入口：西步道 (−37.6, 15.5)', x: -36.4, y: 0.3, z: 17.3, kind: 'propose' },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：会所和平台之间（z −5…−7）和草坪（z 24…26）—— 永远不上池子和躺椅（z −1…18）。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-56), -6.2, 4.2, 1.4],
  [wrapX(-52.5), -5.4, 2.4, 1.0],
  [wrapX(-20), -6.0, 4.0, 1.4],
  [wrapX(-46), 24.8, 4.4, 1.6],
  [wrapX(-42.5), 25.8, 2.6, 1.1],
  [wrapX(-6), 25.2, 4.2, 1.5],
];
export const CLOUD_VEL = 0.12;
