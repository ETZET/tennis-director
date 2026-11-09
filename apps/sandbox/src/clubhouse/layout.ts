// clubhouse 的构图：会所（西班牙复兴式、红瓦、钟楼、拱廊），地图西北角 —— 外观 + 里面（剖面 / 娃娃屋）。手摆，不是程序撒点。
// 世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；CLUBHOUSE、GROUNDS、PATHS、POOL… 从那边 import（只读）。
// 东边的餐车院子（clubfood）：FOOD_COURT、ARCADE_YARD（拱廊前的小院，x −46…−40、z −27…−9.4）在 world.ts，SPINE（球员通道）从 clubfood/layout 只读 import
// —— 院子归它，拱廊立面归这里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
// 会所的脚印 CLUBHOUSE x −62…−40、z −40…−10 减掉 clubfood 的 ARCADE_YARD（x −46…−40、z −27…−9.4）：
//
//        x −62        −58.5   −55     −51  −50   −46        −40
//  z −40  ┌───────────────────┬──────────────────┬──────────┐
//         │ 会员休息室  9×10    │ 咖啡吧  7×10      │ 后厨/储藏 │  东翼（一层，红瓦）
//         │  壁炉（北墙）沙发    ┊（拱门）  吧台 ‖ 传菜门 │  6×13     │
//  z −30  ├────────┬───┊───┬─────────┬──────────┤ 后门 → x −40, z −35.6（clubfood 的 kitchenDoor）
//         │ 行政    │ 会员 │ 穿线台   ┊ 专卖店    │          │
//         │ 办公室  │ 前厅 │ 4×7.6   ┊ 5×7.6    │ 厨房门 ↓ (−43, −27)
//  z −22.4├───┊────┴─┊─┴──┊──────┴───┊──────┤ ← 拱窗（橱窗）
//         │            球员走廊 z −22.4…−19.6                  正门 (−46, −21) → SPINE → 中心球场
//  z −19.6├───┊────┬───┊───┬───┊───┬───┊────┤
//         │ 男更衣   │ 女更衣   │ 理疗室  │ 钟楼底│
//         │ 4×6.6   │ 4×6.6   │ 4×6.6  │ 楼梯  │
//         │         │         │        ├──┊──┤ 南门 (−48, −15.6)
//  z −13  ├─────────┴─────────┴────────┘ 拱廊转角 ⌒ 朝东两拱（对着拱廊前的小院）
//  z −10  │ 南拱廊（朝泳池、朝镜头）：六个拱 ⌒⌒⌒⌒⌒⌒                 │
//         └───────────────────────────────────────────┘
//            ↓ 9 米沙地（建议：陶砖前院）↓ 泳池（clubpool，POOL_DECK z −1 起）
//
// 体块：一层（檐 4.4）铺满脚印；二层只压在北边一排（休息室、咖啡吧上面，x −62…−46、z −40…−30，檐 7.6）；东翼一层（后厨，檐 4.6）；
// 钟楼（4 × 4，钟楼底 = 楼梯间，塔身 13 米 + 2.6 米红瓦尖顶，在主楼东南角、正门南边）。从镜头看一级级往后退：
// 南拱廊的拱（暗带 1）→ 一层的红瓦 → 二层南墙（窗、阳台，暗带 2）→ 二层的红瓦 → 北墙外的蒲葵；钟楼从一层屋顶里拔出来。
//
// 外观（默认）：屋顶、二楼、朝镜头的墙都在；朝镜头（朝南）的面是暗档：南拱廊一排深色拱洞 + 白墙暗档 + 红瓦亮档 + 钟楼。
// 里面（?inside=1 / setInside(true)）：剖面 —— 屋顶、二楼、钟楼塔身隐藏，**朝镜头的墙和所有隔墙切到 1 米**（顶上一条深色 wallCut），
// 北外墙（背景墙）和沿 z 的外墙（西墙、东立面）留 2.8 米 → 三面框住，一个个房间像娃娃屋 / 平面图一样敞开。
import { SPINE } from '../clubfood/layout';
import {
  ARCADE_YARD,
  CLUBHOUSE,
  CLUBHOUSE_DOORS,
  COURTS,
  FOOD_COURT,
  GROUNDS,
  PATHS,
  POOL,
  POOL_DECK,
  type Rect,
  type V2,
} from '../clubsite/world';

export type { Rect, V2 };
export { ARCADE_YARD, CLUBHOUSE, COURTS, FOOD_COURT, GROUNDS, PATHS, POOL, POOL_DECK, SPINE };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点：外观 / 里面 × 竖屏 / 横屏。
 * 竖屏 x −62.8…−45.2：主楼整面（16 米）+ 钟楼 + 正门那一截东立面；上沿北围墙外的蒲葵，下沿泳池北沿。东翼（后厨）在画外。
 * 横屏 x −78.8…−21.2：整座会所在左中，右边是餐车院子（clubfood）的西半；上沿北墙外的沙漠和山，下沿泳池。
 */
export const TARGET = {
  outside: { portrait: { x: -54, z: -22 }, landscape: { x: -47, z: -25.5 } },
  inside: { portrait: { x: -54, z: -26.5 }, landscape: { x: -48, z: -25.5 } },
};

/** 太阳：同 clubpark / clubdesk / clubplaza / clubfood（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（围墙、步道、邻居裁到这里面）。西到西墙，东到餐车院子东沿（横屏右沿 x −21） */
export const CLIP: Rect = { x0: GROUNDS.x0, x1: -14, z0: GROUNDS.z0, z1: 20 };

/** 各层高度（米）：这个场景没有台地（都在 0） */
export const H = { ground: 0 } as const;

// ── 体块 ─────────────────────────────────────────────────────────────
/** 一层的层高、里面模式朝镜头的墙和隔墙切到多高（cut）、沿 z 的外墙和北外墙留多高（frame：娃娃屋的三面框，比门洞稍高）、切口顶上那条深色多厚 */
export const STOREY = { gf: 4.0, cut: 1.0, frame: 2.8, cutCap: 0.1 } as const;
/** 墙厚：外墙 0.5、隔墙 0.22 */
export const WALL_T = { ext: 0.5, int: 0.22 } as const;

/** 体块：檐高 eave、屋顶高 roof（四坡顶，出檐 0.5） */
export const MASS = {
  /** 主楼一层的脚印：会员休息室、咖啡吧、办公室、前厅、穿线台、专卖店、球员走廊。eave / roof = 中间一排（办公室到走廊，z −30…−19.6）的檐高和屋顶 */
  main: { x0: -62, x1: -46, z0: -40, z1: -19.6, eave: 5.0, roof: 1.8 },
  /** 二层只压在北边一排（休息室、咖啡吧上面；二楼以后 = 会员餐厅 / 董事会议室，见 clubhouse.md）：一层的屋顶、二层的南墙、二层的屋顶一级级往后退，朝镜头的墙各是一条暗带 */
  upper: { x0: -62, x1: -46, z0: -40, z1: -30, eave: 7.6, roof: 2.4 },
  /** 东翼（一层）：后厨 / 储藏（clubfood 的厨房门、后门在这里） */
  east: { x0: -46, x1: -40, z0: -40, z1: -27, eave: 4.6, roof: 2.2 },
  /** 南翼（一层，比中间一排矮 0.6）：男 / 女更衣、理疗室 + 南拱廊（z −13…−10） */
  south: { x0: -62, x1: -50, z0: -19.6, z1: -10, eave: 4.4, roof: 1.8 },
  /** 拱廊转角（一层，敞开：南面、东面各是拱） */
  corner: { x0: -50, x1: -46, z0: -15.6, z1: -10, eave: 4.4, roof: 1.4 },
} as const;
/** clubpool 建议的石板小路（会所南拱廊转角 → 泳池北门，x −48.7…−46.5、z −10…−1.9）：这里当邻居画，归 clubpool */
export const NORTH_WALK: Rect = { x0: -48.7, x1: -46.5, z0: -10, z1: -1.9 };
/**
 * 屋顶（外观），从后往前一级比一级低：二层（7.6）、中间一排（办公室到走廊，5.0）、南翼（更衣、理疗、南拱廊，4.4）、拱廊转角（4.4）；东翼（后厨，4.6）。
 * 每一片都是小的四坡顶（屋脊沿 x），片与片之间是一条朝镜头的墙（暗带）—— 不是一整片大屋顶。
 */
export const ROOFS: (Rect & { eave: number; roof: number; over: number })[] = [
  { ...MASS.upper, over: 0.5 },
  { ...MASS.east, over: 0.5 },
  {
    x0: MASS.main.x0,
    x1: MASS.main.x1,
    z0: MASS.upper.z1,
    z1: MASS.main.z1,
    eave: MASS.main.eave,
    roof: MASS.main.roof,
    over: 0.5,
  },
  { ...MASS.south, over: 0.5 },
  { ...MASS.corner, over: 0.35 },
];
/** 钟楼：主楼东南角、正门南边；钟楼底 = 楼梯间（北门通走廊、南门通拱廊转角）。塔身 15 米、钟室 11.2…14、红瓦尖顶 2.8 */
export const TOWER = {
  x0: -50,
  x1: -46,
  z0: -19.6,
  z1: -15.6,
  h: 15,
  belfry: [11.2, 14] as [number, number],
  roof: 2.8,
};

// ── 房间（一层）──────────────────────────────────────────────────────────
export type FloorKey = 'floorOak' | 'tile' | 'floorCool' | 'concrete' | 'wood';
export interface Room {
  id: string;
  name: string;
  r: Rect;
  floor: FloorKey;
}
/** 一层的房间（按墙的中线分；地面铺到脚印边，墙压在上面） */
export const ROOMS: Room[] = [
  { id: 'lounge', name: '会员休息室', r: { x0: -62, x1: -53, z0: -40, z1: -30 }, floor: 'floorOak' },
  { id: 'cafe', name: '咖啡吧', r: { x0: -53, x1: -46, z0: -40, z1: -30 }, floor: 'tile' },
  { id: 'kitchen', name: '后厨 / 储藏', r: { x0: -46, x1: -40, z0: -40, z1: -27 }, floor: 'concrete' },
  { id: 'office', name: '行政办公室', r: { x0: -62, x1: -58.5, z0: -30, z1: -22.4 }, floor: 'wood' },
  { id: 'foyer', name: '会员前厅', r: { x0: -58.5, x1: -55, z0: -30, z1: -22.4 }, floor: 'tile' },
  { id: 'stringing', name: '穿线台', r: { x0: -55, x1: -51, z0: -30, z1: -22.4 }, floor: 'wood' },
  { id: 'shop', name: '专卖店', r: { x0: -51, x1: -46, z0: -30, z1: -22.4 }, floor: 'floorOak' },
  { id: 'hall', name: '球员走廊', r: { x0: -62, x1: -46, z0: -22.4, z1: -19.6 }, floor: 'tile' },
  { id: 'lockerM', name: '男更衣', r: { x0: -62, x1: -58, z0: -19.6, z1: -13 }, floor: 'floorCool' },
  { id: 'lockerW', name: '女更衣', r: { x0: -58, x1: -54, z0: -19.6, z1: -13 }, floor: 'floorCool' },
  { id: 'physio', name: '理疗室', r: { x0: -54, x1: -50, z0: -19.6, z1: -13 }, floor: 'floorCool' },
  { id: 'stair', name: '钟楼楼梯', r: { x0: -50, x1: -46, z0: -19.6, z1: -15.6 }, floor: 'tile' },
  { id: 'loggia', name: '南拱廊', r: { x0: -62, x1: -46, z0: -13, z1: -10 }, floor: 'tile' },
  { id: 'loggiaCorner', name: '拱廊转角', r: { x0: -50, x1: -46, z0: -15.6, z1: -13 }, floor: 'tile' },
];

// ── 墙（中线、厚、外观高度、开口）─────────────────────────────────────────
/** 墙上的开口：at = 沿墙的世界坐标（沿 x 的墙是 x，沿 z 的墙是 z）；w 宽、top 洞顶高、sill 窗台高（门 = 0，能走过去） */
export interface Opening {
  at: number;
  w: number;
  top: number;
  sill?: number;
}
/**
 * 一道直墙：a → b 沿 x（a[1] = b[1]）或沿 z（a[0] = b[0]）；t 厚、h 外观高度（主楼外墙 7.6 = 两层）。
 * keep = 里面模式也不切（北外墙）；tower = 钟楼底的墙（外观被钟楼占位盖住，只在里面模式出现）；upper = 只有二层那一截。
 */
export interface Wall {
  id: string;
  a: V2;
  b: V2;
  t: number;
  h: number;
  open?: Opening[];
  keep?: boolean;
  tower?: boolean;
  /** 只有二层那一截（一层高度以上；外观才有） */
  upper?: boolean;
}

const E = WALL_T.ext;
const I = WALL_T.int;
const ext = (edge: number, inward: 1 | -1) => edge + (inward * E) / 2;
const door = (at: number, w = 1.0, top = 2.3): Opening => ({ at, w, top });
const win = (at: number, w = 1.2, sill = 1.0, top = 2.6): Opening => ({ at, w, top, sill });
/** a0…a1 之间 n 个等宽的拱（w 宽、洞顶 top），柱子等分剩下的 */
function arches(a0: number, a1: number, n: number, w: number, top: number): Opening[] {
  const pier = (a1 - a0 - n * w) / (n + 1);
  return Array.from({ length: n }, (_, i) => ({ at: a0 + pier + w / 2 + i * (w + pier), w, top }));
}
/** 南拱廊：六个拱（2.0 宽、洞顶 3.0）；拱廊转角朝东两个 */
export const LOGGIA_ARCHES = arches(MASS.main.x0, MASS.main.x1, 6, 2.0, 3.0);
export const CORNER_ARCHES = arches(MASS.corner.z0, MASS.corner.z1, 2, 2.0, 3.0);

const M = MASS.main;
const U = MASS.upper;
export const WALLS: Wall[] = [
  // ── 外墙 ──
  // 北外墙（主楼 + 东翼）：背景墙，里面模式也留着；会员休息室两扇窗（壁炉在中间）、咖啡吧一扇、后厨一扇
  {
    id: 'north',
    a: [M.x0, ext(M.z0, 1)],
    b: [M.x1, ext(M.z0, 1)],
    t: E,
    h: U.eave,
    keep: true,
    open: [win(-60.4, 1.3), win(-54.6, 1.3), win(-49.5, 1.3)],
  },
  {
    id: 'north-e',
    a: [M.x1, ext(M.z0, 1)],
    b: [MASS.east.x1, ext(M.z0, 1)],
    t: E,
    h: MASS.east.eave,
    keep: true,
    open: [win(-42.6, 1.4, 1.2, 2.4)],
  },
  // 西外墙（主楼 + 南翼 + 拱廊西头）：休息室、办公室、男更衣的窗（更衣室是高窗）
  {
    id: 'west',
    a: [ext(M.x0, 1), M.z0],
    b: [ext(M.x0, 1), U.z1],
    t: E,
    h: U.eave,
    open: [win(-35, 1.4)],
  },
  { id: 'west-m', a: [ext(M.x0, 1), U.z1], b: [ext(M.x0, 1), M.z1], t: E, h: M.eave, open: [win(-26.2, 1.2)] },
  {
    id: 'west-s',
    a: [ext(M.x0, 1), M.z1],
    b: [ext(M.x0, 1), MASS.south.z1],
    t: E,
    h: MASS.south.eave,
    open: [win(-16.3, 1.4, 1.8, 2.6)],
  },
  // 二层的东墙（东翼屋顶上面那一截；一层是咖啡吧 | 后厨的隔墙 cafe-e）、二层的南墙（一层屋顶上面那一截：窗、阳台；一层是 mid-n 隔墙）
  { id: 'east-2f', a: [ext(M.x1, -1), U.z0], b: [ext(M.x1, -1), U.z1], t: E, h: U.eave, upper: true },
  { id: 'south-2f', a: [U.x0, U.z1], b: [U.x1, U.z1], t: E, h: U.eave, upper: true },
  // 中间一排比南翼高 0.6：走廊南墙在南翼屋顶上面露出的那一截（钟楼那段被钟楼挡着）
  { id: 'hall-s-up', a: [M.x0, M.z1], b: [TOWER.x0, M.z1], t: E, h: M.eave, upper: true },
  // 东立面（拱廊立面，对着 clubfood 的拱廊前小院）：专卖店的拱形橱窗、正门（拱）、钟楼东墙（窄窗，钟楼的）、拱廊转角两个拱
  {
    id: 'east-shop',
    a: [ext(M.x1, -1), -27],
    b: [ext(M.x1, -1), -22.4],
    t: E,
    h: M.eave,
    open: [win(-24.7, 1.8, 0.5, 3.0)],
  },
  {
    id: 'east-door',
    a: [ext(M.x1, -1), -22.4],
    b: [ext(M.x1, -1), M.z1],
    t: E,
    h: M.eave,
    open: [door(-21, 2.0, 3.0)],
  },
  {
    id: 'tower-e',
    a: [ext(TOWER.x1, -1), TOWER.z0],
    b: [ext(TOWER.x1, -1), TOWER.z1],
    t: E,
    h: STOREY.gf,
    tower: true,
    open: [win(-17.6, 0.6, 1.4, 3.2)],
  },
  {
    id: 'corner-e',
    a: [ext(MASS.corner.x1, -1), MASS.corner.z0],
    b: [ext(MASS.corner.x1, -1), MASS.corner.z1],
    t: E,
    h: MASS.corner.eave,
    open: CORNER_ARCHES,
  },
  // 南拱廊的拱（朝泳池、朝镜头）
  {
    id: 'loggia-s',
    a: [M.x0, ext(MASS.south.z1, -1)],
    b: [M.x1, ext(MASS.south.z1, -1)],
    t: E,
    h: MASS.south.eave,
    open: LOGGIA_ARCHES,
  },
  // 东翼（后厨）：东墙后门（clubfood 的 kitchenDoor）、南墙厨房门 + 两扇窗（clubfood 画的）
  {
    id: 'kitchen-e',
    a: [ext(MASS.east.x1, -1), MASS.east.z0],
    b: [ext(MASS.east.x1, -1), MASS.east.z1],
    t: E,
    h: MASS.east.eave,
    open: [door(-35.6, 1.2, 2.4)],
  },
  {
    id: 'kitchen-s',
    a: [M.x1, ext(MASS.east.z1, -1)],
    b: [MASS.east.x1, ext(MASS.east.z1, -1)],
    t: E,
    h: MASS.east.eave,
    open: [win(-45.0, 1.0, 1.2, 2.4), door(-43.0, 1.3, 2.4), win(-41.2, 1.0, 1.2, 2.4)],
  },
  // 走廊南墙：更衣室、理疗室、钟楼的门（一层屋顶下面，外观看不到）
  {
    id: 'hall-s',
    a: [M.x0, M.z1],
    b: [M.x1, M.z1],
    t: I,
    h: STOREY.gf,
    open: [door(-60.6), door(-56.6), door(-52.6), door(-47.4, 1.2)],
  },
  // ── 钟楼底（楼梯间）：西墙（和理疗室共用 = 隔墙 phys-e）、南墙南门 ──
  {
    id: 'tower-s',
    a: [TOWER.x0, ext(TOWER.z1, -1)],
    b: [TOWER.x1, ext(TOWER.z1, -1)],
    t: E,
    h: STOREY.gf,
    tower: true,
    open: [door(-47.6, 1.4, 2.6)],
  },
  // ── 隔墙（一层 4 米）──
  // 走廊北墙：办公室门、前厅（宽门洞）、穿线台门、专卖店（敞开的店面）
  {
    id: 'hall-n',
    a: [M.x0, -22.4],
    b: [M.x1, -22.4],
    t: I,
    h: STOREY.gf,
    open: [door(-60.6), door(-56.75, 2.2, 2.8), door(-52.4), door(-48.4, 2.8, 2.8)],
  },
  // 中间一排的北墙：前厅 → 休息室（拱门）；其余是实墙
  { id: 'mid-n', a: [M.x0, -30], b: [M.x1, -30], t: I, h: STOREY.gf, open: [door(-56.75, 2.0, 2.8)] },
  // 休息室 | 咖啡吧：一道宽拱门
  { id: 'lounge-e', a: [-53, M.z0], b: [-53, -30], t: I, h: STOREY.gf, open: [door(-35.4, 3.0, 3.0)] },
  // 咖啡吧 | 后厨：传菜门（吧台后面）
  { id: 'cafe-e', a: [M.x1, M.z0], b: [M.x1, -27], t: I, h: STOREY.gf, open: [door(-35.0, 1.1, 2.3)] },
  { id: 'office-e', a: [-58.5, -30], b: [-58.5, -22.4], t: I, h: STOREY.gf },
  { id: 'foyer-e', a: [-55, -30], b: [-55, -22.4], t: I, h: STOREY.gf },
  // 穿线台 | 专卖店：一扇门 + 一个递拍子的窗口（台面高 0.95）
  {
    id: 'string-e',
    a: [-51, -30],
    b: [-51, -22.4],
    t: I,
    h: STOREY.gf,
    open: [door(-28.9, 0.9), win(-26.4, 1.4, 0.95, 2.1)],
  },
  // 南翼：更衣、理疗之间的隔墙；南边和拱廊之间的墙（高窗）
  { id: 'lockM-e', a: [-58, M.z1], b: [-58, -13], t: I, h: STOREY.gf },
  { id: 'lockW-e', a: [-54, M.z1], b: [-54, -13], t: I, h: STOREY.gf },
  { id: 'phys-e', a: [-50, M.z1], b: [-50, -13], t: I, h: STOREY.gf },
  {
    id: 'south-n',
    a: [M.x0, -13],
    b: [-50, -13],
    t: I,
    h: STOREY.gf,
    open: [win(-60, 1.4, 1.8, 2.6), win(-56, 1.4, 1.8, 2.6), win(-52, 1.4, 1.8, 2.6)],
  },
];

/** 墙沿 x？ */
export const alongX = (w: Wall) => Math.abs(w.a[1] - w.b[1]) < 1e-6;
/**
 * 里面模式会被切到 1 米的墙：朝镜头的（沿 x 的，北外墙除外）+ 所有隔墙（沿 z 的隔墙 4 米高时，墙顶在屏幕上往上伸 2.8 米，
 * 像一片片鳍压在北边的房间上）。只有外墙里沿 z 的（西墙、东立面）和北外墙留一层高 —— 娃娃屋的三面框。
 */
export const isCut = (w: Wall) => !w.keep && (alongX(w) || w.t < WALL_T.ext);

/**
 * 一道墙按开口切成实心的段（沿墙坐标 [起, 止]，y [下, 上]）：开口两边整高；开口下面窗台（门没有）、上面门楣。
 * hTop = 这一段算到多高（外观 = w.h，里面模式切墙 = STOREY.cut，沿 z 的墙 = STOREY.gf）。
 */
export function wallPieces(w: Wall, hTop: number): { a0: number; a1: number; y0: number; y1: number }[] {
  const ax = alongX(w);
  const [s0, s1] = ax
    ? [Math.min(w.a[0], w.b[0]), Math.max(w.a[0], w.b[0])]
    : [Math.min(w.a[1], w.b[1]), Math.max(w.a[1], w.b[1])];
  const ops = [...(w.open ?? [])].sort((p, q) => p.at - q.at);
  const out: { a0: number; a1: number; y0: number; y1: number }[] = [];
  let p = s0;
  for (const o of ops) {
    const l = o.at - o.w / 2;
    const r = o.at + o.w / 2;
    if (l > p) out.push({ a0: p, a1: l, y0: 0, y1: hTop });
    const sill = Math.min(o.sill ?? 0, hTop);
    if (sill > 0) out.push({ a0: l, a1: r, y0: 0, y1: sill });
    if (o.top < hTop) out.push({ a0: l, a1: r, y0: o.top, y1: hTop });
    p = Math.max(p, r);
  }
  if (s1 > p) out.push({ a0: p, a1: s1, y0: 0, y1: hTop });
  return out.filter((s) => s.a1 - s.a0 > 0.02 && s.y1 - s.y0 > 0.02);
}

/** 墙的挡路矩形（导航用）：门洞是通的，窗、窗台挡 */
export function wallBlocked(): Rect[] {
  const out: Rect[] = [];
  for (const w of WALLS) {
    if (w.upper) continue;
    const ax = alongX(w);
    const c = ax ? w.a[1] : w.a[0];
    for (const s of wallPieces(w, STOREY.gf)) {
      if (s.y0 > 0.3) continue; // 门楣
      out.push(
        ax
          ? { x0: s.a0, x1: s.a1, z0: c - w.t / 2, z1: c + w.t / 2 }
          : { x0: c - w.t / 2, x1: c + w.t / 2, z0: s.a0, z1: s.a1 },
      );
    }
  }
  return out;
}

// ── 门（世界坐标；clubwalk 用）──────────────────────────────────────────
/**
 * 会所的门：x, z = 门洞中心（墙中线上），w 宽，facing = 朝哪边开向外面；out / in = 门外 / 门里站的点（走进来、走出去的路点）。
 * 正门在东立面（拱廊立面）正对 clubfood 的球员通道 SPINE（z −22.4…−19.6）：总监、会员、球员都走这里；
 * 南门从钟楼底（楼梯间）出到拱廊转角，再从南拱廊的拱或者朝东的两个拱出去（去泳池、长廊）；
 * 厨房门、后门是 clubfood 的补货 / 倒垃圾路线用的（后厨不对会员开）。
 */
export const DOORS = {
  main: { ...CLUBHOUSE_DOORS.main, out: [-44.9, -21] as V2, in: [-47.3, -21] as V2, name: '正门' },
  south: { ...CLUBHOUSE_DOORS.south, out: [-47.6, -14.3] as V2, in: [-47.4, -17.6] as V2, name: '南门（钟楼）' },
  kitchen: { ...CLUBHOUSE_DOORS.kitchen, out: [-43, -26.1] as V2, in: [-43, -28.0] as V2, name: '厨房门' },
  kitchenBack: { ...CLUBHOUSE_DOORS.kitchenBack, out: [-39.4, -35.6] as V2, in: [-41.0, -35.6] as V2, name: '后门' },
} as const;

// ── 站位、路线、能走的地方（玩法以后用；白模里标签开着时画成洋红小圆盘 + 小点）──────
const P = Math.PI;
const W = -P / 2; // 面朝 −x（西）
const EA = P / 2; // 面朝 +x（东）
const N = P; // 面朝 −z（北，背对镜头）

/** 站位（里面的活，stage 3 再定玩法；这一版只定位置） */
export const SPOTS = {
  doorOut: DOORS.main.out,
  doorIn: DOORS.main.in,
  southOut: DOORS.south.out,
  /** 总监的办公桌（办公桌后面，面朝镜头） */
  desk: [-60.3, -28.9] as V2,
  /** 场地排班板（办公室西墙） */
  board: [-61.0, -25.6] as V2,
  /** 咖啡吧：吧台里（咖啡师 / 帮忙）、吧台外（点单） */
  barIn: [-47.2, -37.2] as V2,
  barOut: [-49.4, -34.0] as V2,
  /** 穿线机前 */
  stringer: [-53.0, -27.9] as V2,
  /** 递拍子的窗口（专卖店一侧） */
  handover: [-50.3, -26.4] as V2,
  /** 专卖店收银台后面 */
  till: [-48.9, -28.6] as V2,
  /** 理疗床边 */
  physio: [-51.4, -17.4] as V2,
  /** 更衣室长凳 */
  lockerM: [-60.0, -15.0] as V2,
  lockerW: [-56.0, -15.0] as V2,
  /** 壁炉前（会员休息室的焦点） */
  fireplace: [-57.5, -37.4] as V2,
  /** 南拱廊（看泳池）、壁泉 */
  loggia: [-54.0, -11.4] as V2,
  fountain: [-60.6, -11.5] as V2,
} satisfies Record<string, V2>;

/** 路线 */
export const ROUTES: { id: string; pts: V2[] }[] = [
  // 球员出场：更衣室 → 走廊 → 正门 → 球员通道（clubfood 的 SPINE）往东
  { id: 'players', pts: [SPOTS.lockerM, [-60.6, -20.4], [-50, -21], DOORS.main.in, DOORS.main.out, [-41.5, -21]] },
  // 会员：正门 → 走廊 → 前厅（奖杯）→ 休息室 → 拱门 → 咖啡吧吧台
  {
    id: 'members',
    pts: [
      DOORS.main.out,
      DOORS.main.in,
      [-56.75, -21.2],
      [-56.75, -26.0],
      [-56.75, -31.6],
      [-54.0, -33.3],
      [-53, -35.4],
      SPOTS.barOut,
    ],
  },
  // 总监上班：正门 → 走廊 → 办公室
  { id: 'director', pts: [DOORS.main.out, DOORS.main.in, [-60.6, -21.0], [-60.6, -24.0], SPOTS.desk] },
  // 泳池那边进来：南拱廊 → 转角 → 南门 → 钟楼底 → 走廊
  // 泳池那边上来：clubpool 的北门外 (−47.6, −2.4) → 石板小路 NORTH_WALK（clubpool 的建议，x −48.7…−46.5）→ 拱廊转角 → 南门 → 钟楼底 → 走廊
  { id: 'pool', pts: [[-47.6, -2.4], [-47.6, -9.6], DOORS.south.out, DOORS.south.in, [-47.4, -21]] },
];

/**
 * 总监能走的地方（clubsite/play 的 NavSpec 形状）：会所脚印 + 四周的沙地 / 步道（walkable）减掉墙（wallBlocked()：门洞是通的）
 * 和家具的脚印（nav.ts 的 houseBlocked() 按 SLOTS 的规格算）。往外：正门 → clubfood 的拱廊前小院 / 球员通道，
 * 拱廊的拱 → 南边的沙地 → 泳池（clubpool）/ 长廊西头（x −38）/ 西步道。
 */
export const WALKABLE: Rect[] = [
  { x0: CLUBHOUSE.x0, x1: CLUBHOUSE.x1, z0: CLUBHOUSE.z0, z1: CLUBHOUSE.z1 },
  /** 会所四周（北边、西边到围墙脚，南边到泳池北沿） */
  { x0: GROUNDS.x0 + 0.5, x1: -46, z0: GROUNDS.z0 + 0.5, z1: -1 },
];

// ── 资产位置（占位或资产）──────────────────────────────────────────────
/** 资产位置。mode：'in' = 只在里面模式出现（家具、里面的人），'out' = 只在外观（钟楼、二楼的窗、阳台、烟囱、屋顶上的东西），不给 = 都在 */
export interface Slot {
  id: string;
  asset: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  s?: number;
  variant?: number;
  mode?: 'in' | 'out';
  /** 人物：固定姿势 [名字, phase] */
  pose?: [string, number];
  /** 人物：手里拿什么（null = 空手） */
  prop?: string | null;
  /** 标签文字（不给 = id） */
  label?: string;
  labelBelow?: boolean;
  noLabel?: boolean;
  labelAt?: [number, number, number];
  /** 人物：坐着（clubsite/people 的 setSeat(座高, 脚踩的高度)） */
  seat?: [number, number?];
  /** 人物：头转向这个世界坐标点 */
  look?: [number, number, number];
}

const person = (
  id: string,
  x: number,
  z: number,
  rotY: number,
  v: number,
  pose: string,
  phase: number,
  extra: Partial<Slot> = {},
): Slot => ({ id, asset: 'player', x, z, rotY, variant: v, pose: [pose, phase], prop: null, noLabel: true, ...extra });

/** 二层南墙（z −30，一层屋顶上面）的窗：阳台两边各一扇，咖啡吧上面两扇 */
const UP_WINDOWS = [-60.2, -54.0, -50.6, -47.6];

export const SLOTS: Slot[] = [
  // ═════ 外观（mode out：里面模式隐藏）═════
  { id: 'tower', asset: 'bell-tower', x: (TOWER.x0 + TOWER.x1) / 2, z: (TOWER.z0 + TOWER.z1) / 2, mode: 'out' },
  { id: 'chimney', asset: 'chimney', x: -57.5, z: -39.4, y: 6.8, mode: 'out' },
  { id: 'balcony', asset: 'balcony', x: -57.0, z: U.z1 + 0.6, y: 5.4, mode: 'out', labelAt: [-57.0, 7.2, U.z1] },
  ...UP_WINDOWS.map((x, i) => ({
    id: `up-win-${i}`,
    asset: 'arch-window',
    x,
    z: U.z1 + 0.4,
    y: 5.45,
    mode: 'out' as const,
    noLabel: i > 0,
  })),
  { id: 'sign', asset: 'club-sign', x: -54.0, z: MASS.south.z1 + 0.05, y: 3.35, mode: 'out' },
  // ═════ 东立面（拱廊立面：沿 z，两种模式都在）═════
  { id: 'main-door', asset: 'main-door', x: M.x1 - 0.08, z: DOORS.main.z, rotY: EA },
  {
    id: 'shop-window',
    asset: 'arch-window',
    x: M.x1 - 0.08,
    z: -24.7,
    y: 0.5,
    rotY: EA,
    variant: 1,
    label: '#4 拱窗（橱窗）',
  },
  // 三角梅（攀在拱廊的柱子上：南拱廊两根、转角一根）
  { id: 'bougainvillea-1', asset: 'bougainvillea', x: LOGGIA_ARCHES[1].at + 1.27, z: MASS.south.z1 + 0.15 },
  {
    id: 'bougainvillea-2',
    asset: 'bougainvillea',
    x: LOGGIA_ARCHES[4].at + 1.27,
    z: MASS.south.z1 + 0.15,
    noLabel: true,
  },
  // ═════ 南拱廊（两种模式都在：里面模式拱廊的墙也切了）═════
  { id: 'wall-fountain', asset: 'wall-fountain', x: M.x0 + 0.8, z: -11.5, rotY: EA },
  { id: 'loggia-bench-1', asset: 'bench', x: -57.6, z: -12.45, label: '长椅（复用）' },
  { id: 'loggia-bench-2', asset: 'bench', x: -52.0, z: -12.45, noLabel: true },
  person('loggia-sit-1', -57.9, -12.5, 0, 1, 'sit', 0.3, { seat: [0.46] }),
  person('loggia-sit-2', -51.6, -12.5, 0, 2, 'sip', 0.5, { seat: [0.46], prop: 'cup' }),
  { id: 'pot-l1', asset: 'pot', x: -61.2, z: -9.2, label: '陶罐（复用）' },
  { id: 'pot-l1-agave', asset: 'agave', x: -61.2, z: -9.2, y: 0.85, s: 0.55, noLabel: true },
  { id: 'pot-l2', asset: 'pot', x: -46.8, z: -9.2, noLabel: true },
  { id: 'pot-l2-agave', asset: 'agave', x: -46.8, z: -9.2, y: 0.85, s: 0.55, noLabel: true },
  // 总监：外观在正门口（往里走），里面模式在走廊里
  {
    id: 'director',
    asset: 'director',
    x: -45.4,
    z: -21.0,
    rotY: W,
    mode: 'out',
    pose: ['walk', 0.3],
    label: '总监（进门）',
  },
  { id: 'director-in', asset: 'director', x: -50.2, z: -20.9, rotY: W, mode: 'in', pose: ['walk', 0.6], label: '总监' },

  // ═════ 里面（mode in）═════
  // 会员休息室：壁炉（北墙正中）、地毯、三张沙发围着壁炉、茶几、钢琴（西南角）
  { id: 'fireplace', asset: 'fireplace', x: -57.5, z: M.z0 + 0.85, mode: 'in' },
  { id: 'rug', asset: 'rug', x: -57.5, z: -34.6, mode: 'in', labelBelow: true },
  { id: 'sofa-s', asset: 'sofa', x: -57.5, z: -32.6, rotY: N, mode: 'in' },
  { id: 'sofa-w', asset: 'sofa', x: -60.4, z: -35.2, rotY: EA, mode: 'in', noLabel: true },
  { id: 'sofa-e', asset: 'sofa', x: -54.6, z: -35.2, rotY: W, mode: 'in', noLabel: true },
  { id: 'coffee-table', asset: 'coffee-table', x: -57.5, z: -35.0, mode: 'in', labelBelow: true },
  { id: 'piano', asset: 'piano', x: -61.0, z: -31.4, rotY: EA, mode: 'in' },
  person('lounge-1', -57.4, -32.55, N, 0, 'sit', 0.2, { mode: 'in', seat: [0.45] }),
  person('lounge-2', -60.35, -35.6, EA, 3, 'sip', 0.6, { mode: 'in', seat: [0.45], prop: 'cup' }),
  person('lounge-3', -56.2, -37.6, 0, 2, 'idle', 0.4, { mode: 'in' }),
  // 咖啡吧：吧台（南北向，面朝西）、后面的酒柜 + 咖啡机、三把吧凳、三张小圆桌
  { id: 'bar-counter', asset: 'bar-counter', x: -48.3, z: -36.0, mode: 'in' },
  { id: 'back-bar', asset: 'back-bar', x: -46.55, z: -38.0, rotY: W, mode: 'in' },
  ...[-38.2, -36.8, -35.4].map((z, i) => ({
    id: `stool-${i}`,
    asset: 'bar-stool',
    x: -49.25,
    z,
    mode: 'in' as const,
    noLabel: i > 0,
  })),
  ...(
    [
      [-51.4, -38.0],
      [-51.4, -34.6],
      [-49.6, -31.6],
    ] as V2[]
  ).map(([x, z], i) => ({ id: `cafe-table-${i}`, asset: 'cafe-table', x, z, mode: 'in' as const, noLabel: i > 0 })),
  person('barista', -47.2, -36.6, W, 1, 'idle', 0.2, { mode: 'in', label: '咖啡师', noLabel: false }),
  person('bar-1', -49.3, -36.8, EA, 2, 'sip', 0.3, { mode: 'in', seat: [0.74], prop: 'cup' }),
  person('cafe-1', -51.4, -33.95, N, 3, 'sip', 0.7, { mode: 'in', seat: [0.45], prop: 'cup' }),
  // 后厨（东翼）：灶台一排（北墙）、储物架（东墙）、备餐台
  { id: 'kitchen-line', asset: 'kitchen-line', x: -43.0, z: M.z0 + 0.95, mode: 'in' },
  { id: 'kitchen-shelves', asset: 'shelves', x: MASS.east.x1 - 0.65, z: -31.0, rotY: W, mode: 'in' },
  { id: 'prep-table', asset: 'prep-table', x: -43.6, z: -33.0, mode: 'in' },
  person('cook', -43.4, -38.3, N, 0, 'idle', 0.5, { mode: 'in' }),
  // 行政办公室：办公桌（面朝镜头）、场地排班板（西墙）、文件柜
  { id: 'desk', asset: 'desk', x: -60.3, z: -28.0, mode: 'in' },
  { id: 'schedule-board', asset: 'schedule-board', x: M.x0 + 0.54, z: -25.6, y: 0.9, rotY: EA, mode: 'in' },
  { id: 'filing', asset: 'filing-cabinet', x: -58.95, z: -24.0, rotY: W, mode: 'in' },
  // 会员前厅：奖杯柜（西墙）、荣誉榜（东墙边的落地展板：隔墙在里面模式只有 1 米，挂墙的东西不放隔墙上）
  { id: 'trophy-case', asset: 'trophy-case', x: -58.15, z: -26.2, rotY: EA, mode: 'in' },
  { id: 'honours-board', asset: 'honours-board', x: -55.3, z: -26.2, rotY: W, mode: 'in' },
  // 穿线台：穿线机（房间中间）、工作台（北墙）、拍子架（西墙，穿好的拍子）
  { id: 'stringing-machine', asset: 'stringing-machine', x: -53.0, z: -27.0, mode: 'in' },
  { id: 'workbench', asset: 'workbench', x: -53.0, z: -29.45, mode: 'in' },
  { id: 'racket-rack', asset: 'racket-rack', x: -54.7, z: -25.2, rotY: EA, mode: 'in' },
  person('stringer', -53.0, -27.75, 0, 0, 'idle', 0.7, { mode: 'in', label: '穿线师', noLabel: false }),
  // 专卖店：拍子墙（北墙）、收银台、两架衣服、橱窗里的展台
  { id: 'racket-wall', asset: 'racket-wall', x: -48.6, z: -29.55, mode: 'in' },
  { id: 'shop-counter', asset: 'shop-counter', x: -48.9, z: -27.7, mode: 'in' },
  { id: 'clothes-1', asset: 'clothes-rack', x: -49.6, z: -24.6, mode: 'in' },
  { id: 'clothes-2', asset: 'clothes-rack', x: -49.6, z: -23.4, mode: 'in', noLabel: true },
  { id: 'window-display', asset: 'window-display', x: -46.95, z: -24.7, rotY: W, mode: 'in' },
  person('clerk', -48.9, -28.55, 0, 2, 'idle', 0.1, { mode: 'in', label: '店员', noLabel: false }),
  person('shopper', -47.6, -26.2, N + 0.4, 1, 'idle', 0.6, { mode: 'in' }),
  // 走廊：公告板（西头）、两张长椅（复用）
  { id: 'notice-board', asset: 'notice-board', x: M.x0 + 0.54, z: -21.0, y: 0.8, rotY: EA, mode: 'in' },
  { id: 'hall-bench', asset: 'bench', x: -54.4, z: -20.3, mode: 'in', noLabel: true },
  // 男更衣 / 女更衣：一排柜子（西墙）、中间长凳、淋浴间（东墙）
  ...(
    [
      ['M', -62, -58],
      ['W', -58, -54],
    ] as [string, number, number][]
  ).flatMap(([k, x0, x1], i) => [
    {
      id: `lockers-${k}`,
      asset: 'lockers',
      x: x0 + (i === 0 ? 0.78 : 0.4),
      z: -16.3,
      rotY: EA,
      mode: 'in' as const,
      noLabel: i > 0,
    },
    {
      id: `locker-bench-${k}`,
      asset: 'locker-bench',
      x: (x0 + x1) / 2 - 0.2,
      z: -16.3,
      mode: 'in' as const,
      noLabel: i > 0,
    },
    { id: `showers-${k}`, asset: 'showers', x: x1 - 0.55, z: -16.3, rotY: W, mode: 'in' as const, noLabel: i > 0 },
  ]),
  person('locker-1', -60.1, -15.6, 0, 3, 'sit', 0.6, { mode: 'in', seat: [0.45] }),
  person('locker-2', -56.9, -17.8, W, 1, 'idle', 0.3, { mode: 'in' }),
  // 理疗室：两张理疗床、冰浴桶
  { id: 'physio-table-1', asset: 'physio-table', x: -52.6, z: -17.6, mode: 'in' },
  { id: 'physio-table-2', asset: 'physio-table', x: -52.6, z: -14.8, mode: 'in', noLabel: true },
  { id: 'ice-bath', asset: 'ice-bath', x: -50.9, z: -14.5, mode: 'in' },
  person('physio', -51.35, -17.6, W, 0, 'idle', 0.5, { asset: 'coach', mode: 'in', label: '理疗师', noLabel: false }),
  person('patient', -52.6, -17.6, 0, 2, 'sit', 0.4, { mode: 'in', seat: [0.78] }),
  // 钟楼底：楼梯（贴西墙往北上）
  { id: 'stairs', asset: 'stairs', x: -49.05, z: -17.6, mode: 'in' },

  // ═════ 四周（两种模式都在）═════
  // 北墙外一排蒲葵（叶冠从屋脊后面露出来）、西边小巷一丛灌木、拱廊前两棵蒲葵（拱廊两头，不挡拱）
  { id: 'palm-n-1', asset: 'fan-palm', x: -59.0, z: -46.6, variant: 1, s: 1.15, noLabel: true },
  { id: 'palm-n-2', asset: 'fan-palm', x: -47.5, z: -46.2, variant: 0, s: 1.05, noLabel: true },
  { id: 'creosote-w', asset: 'creosote', x: -63.0, z: -33.0, variant: 1, noLabel: true },
  // 会所和泳池之间的两棵蒲葵：照 clubpool 的位置（clubpool.md「共享坐标」7，两个场景统一）
  { id: 'palm-s-1', asset: 'fan-palm', x: -60.2, z: -4.8, variant: 2, s: 1.0, noLabel: true },
  { id: 'palm-s-2', asset: 'fan-palm', x: -41.4, z: -3.6, variant: 1, s: 0.95, noLabel: true },
  // 泳池边（邻居）一个人走过来
  person('pool-walker', -47.6, -5.2, N, 1, 'walk', 0.2),
];

/** 区域标签（白模评审用，?labels=0 不显示）：mode 同 SLOTS；kind area = 区域名，propose = 共享坐标的建议，placeholder = 墙体里要画的部分 */
export const AREA_LABELS: {
  text: string;
  x: number;
  y: number;
  z: number;
  kind?: 'area' | 'propose' | 'placeholder';
  mode?: 'in' | 'out';
}[] = [
  { text: '会所（西班牙复兴式，红瓦）', x: -56, y: 10.8, z: -36, mode: 'out' },
  { text: '#2 南拱廊（方洞 → 拱券、柱头）', x: -58.0, y: 3.9, z: -10, kind: 'placeholder', mode: 'out' },
  { text: '红瓦（屋顶材质）', x: -58, y: 6.4, z: -25, kind: 'placeholder', mode: 'out' },
  { text: '拱廊前小院（clubfood）', x: -43, y: 0.4, z: -12.0 },
  { text: '餐车院子（clubfood）', x: -30, y: 0.4, z: -30 },
  { text: '泳池（clubpool）', x: -50, y: 0.6, z: 4 },
  { text: '北围墙 z −43', x: -40, y: 2.6, z: -43, mode: 'out' },
  { text: 'clubpool 的石板小路 → 南门', x: -47.6, y: 0.3, z: -6.0, kind: 'propose' },
  // 里面：房间名（地面上）
  ...ROOMS.filter((r) => r.id !== 'loggiaCorner' && r.id !== 'loggia').map((r) => ({
    text: r.name,
    x: (r.r.x0 + r.r.x1) / 2,
    y: 0.2,
    z: r.id === 'hall' ? -21.0 : r.r.z1 - 0.6,
    mode: 'in' as const,
  })),
  { text: '正门 →', x: -46.8, y: 0.2, z: -21.9, mode: 'in', kind: 'propose' },
  { text: '南门 ↓', x: -47.6, y: 0.2, z: -15.0, mode: 'in', kind: 'propose' },
];

/**
 * 云影（手摆，硬边）：每团 (x, z, rx, rz) 米，t = 0 时的位置，沿 +x 飘。toon.ts 按 x ∈ [−48, 48) 绕回来。
 * 只走两条带：北墙外的沙漠（z −46…−48）和拱廊南边到泳池之间的沙地（z −6…−3）—— 不上会所的屋顶和院子。
 */
const wrapX = (x: number) => ((((x + 48) % 96) + 96) % 96) - 48;
export const CLOUDS: [number, number, number, number][] = [
  [wrapX(-60), -47.2, 4.4, 1.5],
  [wrapX(-56.5), -47.8, 2.6, 1.1],
  [wrapX(-40), -46.6, 3.6, 1.4],
  [wrapX(-66), -4.4, 3.8, 1.4],
  [wrapX(-36), -3.4, 4.0, 1.5],
];
export const CLOUD_VEL = 0.12;
