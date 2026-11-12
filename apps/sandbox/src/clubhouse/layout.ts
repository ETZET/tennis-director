// clubhouse 的构图：会所（西班牙复兴式、红瓦、钟楼、拱廊），地图西北角 —— 外观 + 里面三层（负一层 B1、一层 1F、二层 2F）的剖面 / 娃娃屋。
// 手摆，不是程序撒点。世界坐标和 clubsite/world.ts 共用（米，y 朝上，北 = −z，东 = +x）；CLUBHOUSE、GROUNDS、PATHS、POOL… 从那边 import（只读）。
// 东边的餐车院子（clubfood）：FOOD_COURT、ARCADE_YARD（拱廊前的小院，x −46…−40、z −27…−9.4）在 world.ts，SPINE（球员通道）从 clubfood/layout 只读 import
// —— 院子归它，拱廊立面归这里。
// 相机 yaw 0（看向北）：+x 画面右，+z 朝镜头（画面下方）。屏幕竖直坐标 v = (y − (z − tz))·cos45°（米）。
// 竖屏 390×844 在 1× 下是 17.6 × 38 米的画面（地面纵深 54 米），横屏 1280×720 是 57.6 × 32.4 米（纵深 46 米）。
//
// 2026-11-11 第二版（用户："目前造的太小了，太杂"、"地下一层应该是一个很大很丰富的健身房"；clubhouse.md「三层的方案 · 第二版」）：
// 地上的脚印、四扇外门、楼梯芯、钟楼电梯都不动；房间少一半、每间大一倍：
//   1F（y 0）  8 间：大堂 · 商店街（+ 西廊）、专卖店（含穿线、租借）、理疗、咖啡吧（L 形）、男 / 女更衣（含淋浴、厕位）、钟楼门厅、后厨 · 收货。
//   2F（y 4）  4 间大的：会员休息室 + 酒吧（一间）、总监办公室 · 董事会、宴会 · 多功能厅（盖到东翼上面）、露台（盖住南翼和拱廊顶）。
//   B1（y −4） 一整层的大健身房（≈ 620 m²），伸到北巷、西巷、拱廊前沙地的下面（都在会所的 clubwalk 区域里）；后场（洗衣、机房、储藏）收在东翼下面一条。
//   天光：北巷整条铁格栅采光带、西巷玻璃砖带、沙地上两个天窗 + 一条玻璃砖（不做下沉天井：坑的南沿会挡住北边 4 米）。
//
// 1F（墙按中线）：
//        x −62  −60       −54   −50.4   −46        −40
//  z −40  ┌──────────────┬───────────────┬──────────┐
//         │ 理疗          │               │          │← 后门 (−40, −35.6)
//  z −34  ├─⊓──┬─────────┤    咖啡吧      ‖ 后厨     │
//         │西廊 │ 专卖店   ├──────┬        │ · 收货   │
//  z −30  │    :（穿线、  │ 楼梯  │ 咖啡吧 │          │
//         │    │ 租借）   │ ↑2F  │ 前段   ├────▲─────┘ 厨房门 (−43, −27)
//  z −24  │    └─⌒──⌒───┘ ↓B1  └──⌒───┤
//         │      大堂 · 商店街                    ◀ 正门 (−46, −21)
//  z −19.6├──⊓───────┬───⊓────────┬──┊───┤
//         │ 男更衣     │ 女更衣      │ 钟楼门厅│
//  z −13  ├───────────┴────────────┘ 转角   南门 (−47.6, −15.6)
//  z −10  │ 南拱廊 ⌒⌒⌒⌒⌒⌒（六个拱，朝泳池）               │
//
// 体块（外观，从镜头往后一级级退）：南拱廊的拱（暗带 1）→ 露台的女儿墙 + 伞（盖住南翼和拱廊）→ 二层南墙（暗带 2，三扇落地门）→ 二层前排红瓦
// → 0.6 米的一条墙（后排檐 8.2，暗带 3）→ 后排红瓦（盖到东翼）+ 烟囱 → 北墙外的蒲葵；钟楼从露台东头拔起来。
//
// 里面（剖面）：看哪一层，就藏掉它上面的一切（屋顶、上面的楼层），这一层朝镜头的墙和所有隔墙切到 1 米（顶上一条深色 wallCut），
// 沿 z 的外墙和北外墙留 2.8 米（负一层的挡土墙留到地面）；看二层时一层是外面的样子；看负一层时 B1 的范围（比会所大）挖成一个坑，
// 坑上面的地（两条巷子、沙地、石板小路）藏起来，B1 南边到池畔那 5 米填着切开的土（soilCut，顶在 −3）。见 view.ts。
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
import type { Floor } from './view';

export type { Floor } from './view';
export type { Rect, V2 };
export { ARCADE_YARD, CLUBHOUSE, COURTS, FOOD_COURT, GROUNDS, PATHS, POOL, POOL_DECK, SPINE };

/** 设计纹素（米/纹素，2× 像素级别时）。默认 1× 像素时实际 0.045 米/纹素，素材仍按 0.09 建模 */
export const MPT = 0.09;

/**
 * 相机默认看向的地面点：外观 / 里面 × 竖屏 / 横屏（里面模式的 y = 那一层的地面 FLOOR_Y，三层同一个 x、z）。
 * 竖屏 x −62.8…−45.2：主楼整面（16 米）+ 钟楼 + 正门那一截东立面；东翼（后厨）在画外。
 * 横屏 x −76…−20：整座会所在左中，右边是餐车院子（clubfood）的西半。
 */
export const TARGET = {
  outside: { portrait: { x: -54, z: -22 }, landscape: { x: -47, z: -25.5 } },
  inside: { portrait: { x: -54, z: -26.5 }, landscape: { x: -48, z: -25.5 } },
  /** 看负一层：B1 比会所大（x −63.2…−40、z −42.2…−6）—— 竖屏对准主区（17.2 米宽），横屏整层 */
  b1: { portrait: { x: -54.6, z: -25 }, landscape: { x: -50, z: -24 } },
};

/** 太阳：同 clubpark / clubdesk / clubplaza / clubfood（仰角 44°、方位偏东 8°）。影子方向 (−sin8°, +cos8°)，长 ≈ 1.04 × 高 */
export const SUN = { el: 44, az: 8 };

/** 这个场景画到的范围（围墙、步道、邻居裁到这里面）。西到西墙，东到餐车院子东沿（横屏右沿 x −21） */
export const CLIP: Rect = { x0: GROUNDS.x0, x1: -14, z0: GROUNDS.z0, z1: 20 };

/** 各层高度（米）：这个场景没有台地（都在 0） */
export const H = { ground: 0 } as const;

// ── 层 ───────────────────────────────────────────────────────────────
/** 每层的地面高度（楼板顶）：负一层 −4、一层 0、二层 4 */
export const FLOOR_Y: Record<Floor, number> = { [-1]: -4, 1: 0, 2: 4 };
export const FLOOR_NAME: Record<Floor, string> = { [-1]: 'B1', 1: '1F', 2: '2F' };
/**
 * 层高 4；里面模式朝镜头的墙和隔墙切到 1 米（cut）；沿 z 的外墙和北外墙留 frame（娃娃屋的三面框，比门洞稍高）：
 * 一层、二层 2.8，负一层 4（挡土墙一直到地面）；切口顶上那条深色 cutCap。
 */
export const STOREY = { gf: 4.0, cut: 1.0, frame: 2.8, frameB1: 4.0, cutCap: 0.1 } as const;
/** 墙厚：外墙 0.5、隔墙 0.22 */
export const WALL_T = { ext: 0.5, int: 0.22 } as const;

// ── 体块 ─────────────────────────────────────────────────────────────
/** 体块：檐高 eave、屋顶高 roof（四坡顶，出檐 0.5） */
export const MASS = {
  /** 主楼的脚印（一层、二层都在这块上；南翼在它南边） */
  main: { x0: -62, x1: -46, z0: -40, z1: -19.6, eave: 7.6, roof: 1.8 },
  /** 二层后排（办公室、宴会厅上面，盖到东翼）：比前排高 0.6 —— 两片屋顶之间一条朝镜头的墙（暗带 3） */
  upperBack: { x0: -62, x1: -40, z0: -40, z1: -30, eave: 8.2, roof: 2.4 },
  /** 二层前排（休息室 + 酒吧、楼梯井上面） */
  upperFront: { x0: -62, x1: -46, z0: -30, z1: -19.6, eave: 7.6, roof: 1.8 },
  /** 二层东翼前段（卫生间，后厨上面一小块） */
  upperWc: { x0: -46, x1: -40, z0: -30, z1: -27, eave: 7.6, roof: 1.2 },
  /** 东翼（一层）：后厨 + 收货（clubfood 的厨房门、后门在这里）；上面整个是二层 */
  east: { x0: -46, x1: -40, z0: -40, z1: -27, eave: 4.0, roof: 0 },
  /** 南翼（一层，平顶 = 二层的露台）：男 / 女更衣 + 南拱廊（z −13…−10） */
  south: { x0: -62, x1: -50, z0: -19.6, z1: -10, eave: 4.0, roof: 0 },
  /** 拱廊转角（一层，敞开：南面、东面各是拱；上面是露台东头） */
  corner: { x0: -50, x1: -46, z0: -15.6, z1: -10, eave: 4.0, roof: 0 },
} as const;
/** 露台（二层，y 4，南翼 + 拱廊的平屋顶）：x −62…−50、z −19.6…−10 + 钟楼南边的转角 x −50…−46.25、z −15.6…−10；女儿墙 1 米 */
export const TERRACE: Rect[] = [
  { x0: -62, x1: -50, z0: -19.6, z1: -10 },
  { x0: -50, x1: -46.25, z0: -15.6, z1: -10 },
];
/** clubpool 建议的石板小路（会所南拱廊转角 → 泳池北门，x −48.7…−46.5、z −10…−1.9）：这里当邻居画，归 clubpool */
export const NORTH_WALK: Rect = { x0: -48.7, x1: -46.5, z0: -10, z1: -1.9 };
/** 屋顶（外观的四坡红瓦）。level = 它盖的那一层（剖面看比它低的层时藏起来） */
export const ROOFS: (Rect & { eave: number; roof: number; over: number; level: Floor })[] = [
  { ...MASS.upperBack, over: 0.5, level: 2 },
  { ...MASS.upperFront, over: 0.5, level: 2 },
  { ...MASS.upperWc, over: 0.4, level: 2 },
];
/** 钟楼：主楼东南角、正门南边；钟楼底 = 门厅 + 电梯（北门通商店街、南门通拱廊转角）。塔身 15 米、钟室 11.2…14、红瓦尖顶 2.8 */
export const TOWER = {
  x0: -50,
  x1: -46,
  z0: -19.6,
  z1: -15.6,
  h: 15,
  belfry: [11.2, 14] as [number, number],
  roof: 2.8,
};

/**
 * 负一层的范围（墙的外沿）：主楼 + 北巷 + 西巷 + 拱廊前沙地的北半（x −63.2…−46、z −42.2…−6）+ 东翼下面（x −46…−40、z −42.2…−27）。
 * 南沿停在 z −6：45° 看下去，坑南沿的地面会挡住它北边 4 米；B1 南边到池畔（z −1）那 5 米是会所自己的地，看 B1 时切成土（顶在 −3）。
 * 东边 x −46 以外、z −27 以南是 clubfood 的拱廊前小院，不挖。
 */
export const B1: Rect[] = [
  { x0: -63.2, x1: -46, z0: -42.2, z1: -6 },
  { x0: -46, x1: -40, z0: -42.2, z1: -27 },
];
/** 看 B1 时挖开的坑（地面在这里挖洞）：B1 + 南边那 5 米（填土）。从西北角顺时针 */
export const PIT_LOOP: V2[] = [
  [-63.2, -42.2],
  [-40, -42.2],
  [-40, -27],
  [-46, -27],
  [-46, -1],
  [-63.2, -1],
];
/** 看 B1 时坑里填着的土（顶在切墙的高度 −3）：B1 南沿到池畔 */
export const SOIL: Rect[] = [{ x0: -63.2, x1: -46, z0: -6, z1: -1 }];
/** 地上的地（坑里、会所脚印以外的那几块；外观、一层、二层画，看 B1 时藏起来）：北巷、西巷、拱廊前的沙地 */
export const GRADE: Rect[] = [
  { x0: -63.2, x1: -40, z0: -42.2, z1: -40 },
  { x0: -63.2, x1: -62, z0: -40, z1: -10 },
  { x0: -63.2, x1: -46, z0: -10, z1: -1 },
];
/** 北巷整条铁格栅采光带（下面是健身房北墙的高窗）；`LIGHT_WELL` 同一块（平面图用） */
export const GRATE: Rect = { x0: -63.2, x1: -40, z0: -42.2, z1: -40.4 };
export const LIGHT_WELL = GRATE;
/** 西巷的玻璃砖带（和地面平，能走） */
export const GLASS_W: Rect = { x0: -63.2, x1: -62.3, z0: -40, z1: -10 };
/** 沙地上的两个天窗（边框高 0.45，挡路）+ 一条玻璃砖：都在有氧区上面，避开石板小路 */
export const SKYLIGHTS: Rect[] = [
  { x0: -58, x1: -55, z0: -9.2, z1: -7.0 },
  { x0: -53.5, x1: -50.5, z0: -9.2, z1: -7.0 },
];
export const GLASS_S: Rect = { x0: -61, x1: -50, z0: -9.9, z1: -9.5 };

/** 每层的脚印（并集）。1F = CLUBHOUSE 减掉 clubfood 的 ARCADE_YARD；2F = 主楼 + 东翼 + 钟楼 + 露台；B1 = 上面的 B1 */
export const FOOT: Record<Floor, Rect[]> = {
  1: [
    { x0: -62, x1: -46, z0: -40, z1: -10 },
    { x0: -46, x1: -40, z0: -40, z1: -27 },
  ],
  [-1]: B1,
  2: [
    { x0: -62, x1: -46, z0: -40, z1: -19.6 },
    { x0: -46, x1: -40, z0: -40, z1: -27 },
    { x0: -50, x1: -46, z0: -19.6, z1: -15.6 },
    ...TERRACE,
  ],
};
/** 一层的脚印（L 形，从西北角顺时针） */
export const FOOT_LOOP: V2[] = [
  [-62, -40],
  [-40, -40],
  [-40, -27],
  [-46, -27],
  [-46, -10],
  [-62, -10],
];

// ── 房间 ────────────────────────────────────────────────────────────
export type FloorKey = 'floorOak' | 'tile' | 'floorCool' | 'concrete' | 'wood' | 'rubber' | 'turf';
export interface Room {
  id: string;
  name: string;
  r: Rect;
  floor: FloorKey;
  level: Floor;
  /** 不贴房间名（同一间房的第二块、楼梯井） */
  noLabel?: boolean;
  /** 不铺地（楼梯井：下面一层的楼梯从洞里看得到） */
  hole?: boolean;
  /** 室外（露台、拱廊）：不算"里面" */
  open?: boolean;
}
/** 三层的房间（按墙的中线分；地面铺到脚印边，墙压在上面）。每间的家具、人、总监的活见 clubhouse.md「三层的方案」 */
export const ROOMS: Room[] = [
  // ── 1F（y 0）：只有商店（用户 2026-11-11："一楼是商店层，只有商店"）+ 最少的过道：商店街、楼梯、钟楼的电梯门厅、后门的货梯厅 ──
  { id: 'proShop', name: '专卖店', r: { x0: -62, x1: -57.5, z0: -40, z1: -24 }, floor: 'floorOak', level: 1 },
  { id: 'stringing', name: '穿线 · 试拍吧', r: { x0: -57.5, x1: -54, z0: -40, z1: -24 }, floor: 'wood', level: 1 },
  { id: 'cafe', name: '咖啡吧', r: { x0: -54, x1: -46, z0: -40, z1: -30 }, floor: 'tile', level: 1 },
  {
    id: 'cafeFront',
    name: '咖啡吧',
    r: { x0: -50.4, x1: -46, z0: -30, z1: -24 },
    floor: 'tile',
    level: 1,
    noLabel: true,
  },
  {
    id: 'stairCore',
    name: '楼梯',
    r: { x0: -54, x1: -50.4, z0: -30, z1: -24 },
    floor: 'tile',
    level: 1,
    noLabel: true,
  },
  { id: 'service', name: '货梯厅（后门）', r: { x0: -46, x1: -40, z0: -40, z1: -33 }, floor: 'concrete', level: 1 },
  { id: 'kiosk', name: '便利店', r: { x0: -46, x1: -40, z0: -33, z1: -27 }, floor: 'tile', level: 1 },
  { id: 'hall', name: '商店街', r: { x0: -62, x1: -46, z0: -24, z1: -19.6 }, floor: 'tile', level: 1 },
  { id: 'merch', name: '纪念品店', r: { x0: -62, x1: -56, z0: -19.6, z1: -13 }, floor: 'floorOak', level: 1 },
  { id: 'nutrition', name: '运动营养 · 饮品', r: { x0: -56, x1: -50, z0: -19.6, z1: -13 }, floor: 'tile', level: 1 },
  { id: 'towerHall', name: '电梯门厅', r: { x0: -50, x1: -46, z0: -19.6, z1: -15.6 }, floor: 'tile', level: 1 },
  { id: 'loggia', name: '南拱廊', r: { x0: -62, x1: -46, z0: -13, z1: -10 }, floor: 'tile', level: 1, open: true },
  {
    id: 'loggiaCorner',
    name: '拱廊转角',
    r: { x0: -50, x1: -46, z0: -15.6, z1: -13 },
    floor: 'tile',
    level: 1,
    open: true,
    noLabel: true,
  },
  // ── 2F（y 4）：会员的 + 后厨（盖到东翼上，货梯直通后门）──
  { id: 'office', name: '总监办公室 · 董事会', r: { x0: -62, x1: -54, z0: -40, z1: -30 }, floor: 'wood', level: 2 },
  { id: 'function', name: '宴会厅', r: { x0: -54, x1: -46, z0: -40, z1: -30 }, floor: 'floorOak', level: 2 },
  { id: 'kitchen', name: '后厨', r: { x0: -46, x1: -40, z0: -40, z1: -30 }, floor: 'concrete', level: 2 },
  { id: 'lounge', name: '会员休息室', r: { x0: -62, x1: -54, z0: -30, z1: -19.6 }, floor: 'floorOak', level: 2 },
  { id: 'bar', name: '酒吧', r: { x0: -54, x1: -46, z0: -24, z1: -19.6 }, floor: 'wood', level: 2 },
  { id: 'barN', name: '酒吧', r: { x0: -50.4, x1: -46, z0: -30, z1: -24 }, floor: 'wood', level: 2, noLabel: true },
  {
    id: 'stairwell',
    name: '楼梯井',
    r: { x0: -54, x1: -50.4, z0: -30, z1: -24 },
    floor: 'tile',
    level: 2,
    hole: true,
    noLabel: true,
  },
  { id: 'wcUp', name: '卫生间 · 清洁', r: { x0: -46, x1: -40, z0: -30, z1: -27 }, floor: 'floorCool', level: 2 },
  { id: 'belfryRoom', name: '钟楼二层', r: { x0: -50, x1: -46, z0: -19.6, z1: -15.6 }, floor: 'tile', level: 2 },
  { id: 'terrace', name: '露台', r: TERRACE[0], floor: 'tile', level: 2, open: true },
  { id: 'terraceCorner', name: '露台', r: TERRACE[1], floor: 'tile', level: 2, open: true, noLabel: true },
  // ── B1（y −4）：一整个健身房（区和区之间不砌墙，换地面）+ 更衣淋浴 + 东翼下面的后场 ──
  { id: 'gymWeights', name: '自由重量', r: { x0: -63.2, x1: -54.6, z0: -42.2, z1: -33 }, floor: 'rubber', level: -1 },
  { id: 'gymMachines', name: '器械循环', r: { x0: -54.6, x1: -46, z0: -42.2, z1: -33 }, floor: 'rubber', level: -1 },
  { id: 'gymTurf', name: '功能草道', r: { x0: -63.2, x1: -59.2, z0: -33, z1: -6 }, floor: 'turf', level: -1 },
  { id: 'gymStudio', name: '团课房', r: { x0: -59.2, x1: -54, z0: -33, z1: -24 }, floor: 'floorOak', level: -1 },
  { id: 'gymRecover', name: '拉伸 · 理疗', r: { x0: -59.2, x1: -54, z0: -24, z1: -17 }, floor: 'wood', level: -1 },
  { id: 'gymBoxing', name: '拳击角', r: { x0: -59.2, x1: -54, z0: -17, z1: -10.3 }, floor: 'rubber', level: -1 },
  { id: 'gymLobby', name: '前台大厅', r: { x0: -54, x1: -46, z0: -24, z1: -17 }, floor: 'tile', level: -1 },
  {
    id: 'gymLobbyN',
    name: '前台大厅',
    r: { x0: -54, x1: -46, z0: -33, z1: -30 },
    floor: 'tile',
    level: -1,
    noLabel: true,
  },
  {
    id: 'gymLobbyE',
    name: '前台大厅',
    r: { x0: -50.4, x1: -46, z0: -30, z1: -24 },
    floor: 'tile',
    level: -1,
    noLabel: true,
  },
  {
    id: 'stairB1',
    name: '楼梯',
    r: { x0: -54, x1: -50.4, z0: -30, z1: -24 },
    floor: 'concrete',
    level: -1,
    noLabel: true,
  },
  { id: 'lockerM', name: '男更衣', r: { x0: -54, x1: -50, z0: -17, z1: -10.3 }, floor: 'floorCool', level: -1 },
  { id: 'lockerW', name: '女更衣', r: { x0: -50, x1: -46, z0: -17, z1: -10.3 }, floor: 'floorCool', level: -1 },
  { id: 'gymCardio', name: '有氧区', r: { x0: -59.2, x1: -46, z0: -10.3, z1: -6 }, floor: 'rubber', level: -1 },
  { id: 'laundry', name: '洗衣房', r: { x0: -46, x1: -40, z0: -42.2, z1: -35.4 }, floor: 'floorCool', level: -1 },
  { id: 'plant', name: '机房 · 配电', r: { x0: -46, x1: -40, z0: -35.4, z1: -31 }, floor: 'concrete', level: -1 },
  { id: 'store', name: '储藏', r: { x0: -46, x1: -40, z0: -31, z1: -27 }, floor: 'concrete', level: -1 },
];
export const roomsOn = (f: Floor) => ROOMS.filter((r) => r.level === f);

// ── 墙（中线、厚、高度、开口）─────────────────────────────────────────
/** 墙上的开口：at = 沿墙的世界坐标（沿 x 的墙是 x，沿 z 的墙是 z）；w 宽、top 洞顶高、sill 窗台高（都从这层的地面算；门 = 0，能走过去） */
export interface Opening {
  at: number;
  w: number;
  top: number;
  sill?: number;
}
/**
 * 一道直墙：a → b 沿 x（a[1] = b[1]）或沿 z（a[0] = b[0]）；t 厚、h 外观高度（从这一层的地面 FLOOR_Y[level] 算）。
 * keep = 剖面也不切（北外墙、女儿墙、栏板）；tower = 钟楼的墙（外观被钟楼占位盖住：外观不画，看上面一层时画成外面的样子）；
 * upper = 只有外观才有的一截（y0 起、到 h），band 用；level 不给 = 1。
 */
export interface Wall {
  id: string;
  a: V2;
  b: V2;
  t: number;
  h: number;
  level?: Floor;
  open?: Opening[];
  keep?: boolean;
  tower?: boolean;
  /** 只有外观（从这层地面以上 y0 起）的一截 */
  upper?: { y0: number };
  /** 材质（不给：外墙白灰泥 stucco，隔墙赭石 plaster，负一层外墙 concrete） */
  mat?: 'stucco' | 'plaster' | 'concrete';
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
const UB = MASS.upperBack;
const UF = MASS.upperFront;
const [B1W, B1E] = B1;
/** 二层外墙的高（从 y 4 起）：后排 4.2（檐 8.2）、前排 3.6（檐 7.6） */
const H2B = UB.eave - FLOOR_Y[2];
const H2F = UF.eave - FLOOR_Y[2];

/**
 * 电梯（钟楼里，三层同一格）：井 x −49.75…−48.25、z −19.35…−17.85，门朝东；门口站点 door（三层一样的 x、z）。
 * 导航上不是坡道：站在门口按动作键坐电梯（传送到下一层，nav.ts / main.ts）。1F 钟楼门厅里北门 → 南门那条路走 x −48.25…−46.25。
 */
export const LIFT = {
  x0: -49.75,
  x1: -48.25,
  z0: -19.35,
  z1: -17.85,
  door: [-47.6, -18.6] as V2,
  levels: [-1, 1, 2] as Floor[],
};

export const WALLS: Wall[] = [
  // ═══════════ 1F（y 0，层高 4）═══════════
  // ── 外墙 ──
  // 北外墙（主楼）：背景墙，剖面也留着；专卖店、穿线 · 试拍吧、咖啡吧两扇
  {
    id: 'n1',
    a: [M.x0, ext(M.z0, 1)],
    b: [M.x1, ext(M.z0, 1)],
    t: E,
    h: STOREY.gf,
    keep: true,
    open: [win(-59.8, 1.3), win(-55.7, 1.3), win(-51.6, 1.3), win(-48.4, 1.3)],
  },
  // 北外墙（东翼，货梯厅）
  {
    id: 'n1-e',
    a: [M.x1, ext(M.z0, 1)],
    b: [MASS.east.x1, ext(M.z0, 1)],
    t: E,
    h: STOREY.gf,
    keep: true,
    open: [win(-42.6, 1.4, 1.2, 2.4)],
  },
  // 西外墙：专卖店两扇（主楼）；纪念品店一扇（南翼）
  {
    id: 'w1',
    a: [ext(M.x0, 1), M.z0],
    b: [ext(M.x0, 1), M.z1],
    t: E,
    h: STOREY.gf,
    open: [win(-36, 1.4), win(-28, 1.4)],
  },
  {
    id: 'w1-s',
    a: [ext(M.x0, 1), M.z1],
    b: [ext(M.x0, 1), MASS.south.z1],
    t: E,
    h: MASS.south.eave,
    open: [win(-16.3, 1.4)],
  },
  // 东立面（拱廊立面，对着 clubfood 的拱廊前小院）：咖啡吧前段的临街拱窗（窗台 0.95，外卖）、正门（拱）
  {
    id: 'e1-cafe',
    a: [ext(M.x1, -1), -27],
    b: [ext(M.x1, -1), -24],
    t: E,
    h: STOREY.gf,
    open: [win(-25.5, 1.6, 0.95, 3.0)],
  },
  {
    id: 'e1-door',
    a: [ext(M.x1, -1), -24],
    b: [ext(M.x1, -1), M.z1],
    t: E,
    h: STOREY.gf,
    open: [door(-21, 2.0, 3.0)],
  },
  // 钟楼底：东墙窄窗、南墙南门（外观被钟楼占位盖住）
  {
    id: 'tower1-e',
    a: [ext(TOWER.x1, -1), TOWER.z0],
    b: [ext(TOWER.x1, -1), TOWER.z1],
    t: E,
    h: STOREY.gf,
    tower: true,
    open: [win(-17.6, 0.6, 1.4, 3.2)],
  },
  {
    id: 'tower1-s',
    a: [TOWER.x0, ext(TOWER.z1, -1)],
    b: [TOWER.x1, ext(TOWER.z1, -1)],
    t: E,
    h: STOREY.gf,
    tower: true,
    open: [door(-47.6, 1.4, 2.6)],
  },
  // 拱廊转角朝东两个拱、南拱廊六个拱（朝泳池、朝镜头）
  {
    id: 'corner-e',
    a: [ext(MASS.corner.x1, -1), MASS.corner.z0],
    b: [ext(MASS.corner.x1, -1), MASS.corner.z1],
    t: E,
    h: MASS.corner.eave,
    open: CORNER_ARCHES,
  },
  {
    id: 'loggia-s',
    a: [M.x0, ext(MASS.south.z1, -1)],
    b: [M.x1, ext(MASS.south.z1, -1)],
    t: E,
    h: MASS.south.eave,
    open: LOGGIA_ARCHES,
  },
  // 东翼：东墙后门（clubfood 的 kitchenDoor）→ 货梯厅（送货、倒垃圾）；南墙原来的厨房门 → 便利店的门（对着拱廊前小院），两扇窗 = 外卖窗 + 橱窗
  {
    id: 'kitchen-e',
    a: [ext(MASS.east.x1, -1), MASS.east.z0],
    b: [ext(MASS.east.x1, -1), MASS.east.z1],
    t: E,
    h: STOREY.gf,
    open: [door(-35.6, 1.2, 2.4)],
  },
  {
    id: 'kitchen-s',
    a: [M.x1, ext(MASS.east.z1, -1)],
    b: [MASS.east.x1, ext(MASS.east.z1, -1)],
    t: E,
    h: STOREY.gf,
    open: [win(-44.9, 1.4, 0.95, 2.4), door(-43.0, 1.3, 2.4), win(-41.3, 1.4, 0.6, 2.4)],
  },
  // ── 隔墙（一层 4 米）──
  // 商店街北墙：专卖店的店面（宽拱 + 橱窗）、穿线台的门 + 递拍子柜台窗；楼梯芯敞开（不砌）；咖啡吧前段一道宽拱（吧台朝南对着街）
  {
    id: 'hall-n-w',
    a: [M.x0, -24],
    b: [-54, -24],
    t: I,
    h: STOREY.gf,
    open: [door(-60.6, 2.2, 2.8), win(-58.4, 1.2, 0.5, 2.6), door(-56.9, 1.0), win(-55.2, 1.6, 0.95, 2.1)],
  },
  { id: 'hall-n-e', a: [-50.4, -24], b: [M.x1, -24], t: I, h: STOREY.gf, open: [door(-48.2, 2.6, 2.8)] },
  // 商店街南墙：纪念品店、运动营养 · 饮品的门，电梯门厅的门
  {
    id: 'hall-s',
    a: [M.x0, M.z1],
    b: [M.x1, M.z1],
    t: I,
    h: STOREY.gf,
    open: [door(-59.0, 1.4), door(-53.0, 1.4), door(-47.4, 1.2)],
  },
  // 专卖店 | 穿线 · 试拍吧 | 咖啡吧、楼梯芯
  { id: 'shop-e', a: [-57.5, M.z0], b: [-57.5, -24], t: I, h: STOREY.gf },
  { id: 'cafe-w', a: [-54, M.z0], b: [-54, -24], t: I, h: STOREY.gf },
  // 楼梯芯 | 咖啡吧（北）、咖啡吧前段（东）
  { id: 'core-n', a: [-54, -30], b: [-50.4, -30], t: I, h: STOREY.gf },
  { id: 'core-e', a: [-50.4, -30], b: [-50.4, -24], t: I, h: STOREY.gf },
  // 咖啡吧 | 货梯厅（员工门：二层后厨的东西从货梯下来）、便利店
  { id: 'cafe-e', a: [M.x1, M.z0], b: [M.x1, -27], t: I, h: STOREY.gf, open: [door(-36.0, 1.1, 2.3)] },
  // 货梯厅 | 便利店（补货门）
  { id: 'service-s', a: [M.x1, -33], b: [MASS.east.x1, -33], t: I, h: STOREY.gf, open: [door(-41.6, 1.2, 2.3)] },
  // 南翼的两间店：中间隔墙、东墙（钟楼门厅 / 拱廊转角）；朝拱廊（朝泳池、朝镜头）的店面
  { id: 'merch-e', a: [-56, M.z1], b: [-56, -13], t: I, h: STOREY.gf },
  { id: 'nutri-e', a: [-50, M.z1], b: [-50, -13], t: I, h: STOREY.gf },
  {
    id: 'south-n',
    a: [M.x0, -13],
    b: [-50, -13],
    t: I,
    h: STOREY.gf,
    open: [win(-60.4, 2.4, 0.6, 2.6), door(-57.4, 1.2), win(-54.3, 2.4, 0.95, 2.4), door(-51.2, 1.2)],
  },

  // ═══════════ 2F（y 4；后排外墙 4.2、前排 3.6）═══════════
  {
    id: 'n2',
    level: 2,
    a: [M.x0, ext(M.z0, 1)],
    b: [MASS.upperBack.x1, ext(M.z0, 1)],
    t: E,
    h: H2B,
    keep: true,
    open: [win(-59.5, 1.3), win(-56.5, 1.3), win(-51.0, 1.3), win(-47.0, 1.3), win(-43.0, 1.3)],
  },
  { id: 'w2-b', level: 2, a: [ext(M.x0, 1), M.z0], b: [ext(M.x0, 1), -30], t: E, h: H2B, open: [win(-35, 1.3)] },
  {
    id: 'w2-f',
    level: 2,
    a: [ext(M.x0, 1), -30],
    b: [ext(M.x0, 1), M.z1],
    t: E,
    h: H2F,
    open: [win(-27, 1.3), win(-23, 1.3)],
  },
  // 东墙：后厨三扇窗（朝餐车院子）、卫生间那一小块、酒吧一扇
  {
    id: 'e2-b',
    level: 2,
    a: [ext(MASS.upperBack.x1, -1), M.z0],
    b: [ext(MASS.upperBack.x1, -1), -30],
    t: E,
    h: H2B,
    open: [win(-38, 1.3), win(-35, 1.3), win(-32, 1.3)],
  },
  {
    id: 'e2-wc',
    level: 2,
    a: [ext(MASS.upperWc.x1, -1), -30],
    b: [ext(MASS.upperWc.x1, -1), -27],
    t: E,
    h: H2F,
    open: [win(-28.5, 0.8, 1.8, 2.6)],
  },
  {
    id: 's2-wc',
    level: 2,
    a: [M.x1, ext(MASS.upperWc.z1, -1)],
    b: [MASS.upperWc.x1, ext(MASS.upperWc.z1, -1)],
    t: E,
    h: H2F,
  },
  {
    id: 'e2-f',
    level: 2,
    a: [ext(M.x1, -1), -27],
    b: [ext(M.x1, -1), M.z1],
    t: E,
    h: H2F,
    open: [win(-22.5, 1.3)],
  },
  // 二层南墙（朝露台、朝镜头）：休息室两扇、酒吧一扇落地门；东头一段是钟楼二层的北墙（酒吧 → 钟楼二层的门）
  {
    id: 's2',
    level: 2,
    a: [M.x0, ext(M.z1, -1)],
    b: [M.x1, ext(M.z1, -1)],
    t: E,
    h: H2F,
    open: [door(-60.0, 1.4, 2.6), door(-56.5, 1.4, 2.6), door(-52.0, 1.4, 2.6), door(-47.4, 1.2, 2.3)],
  },
  // 前后两片屋顶之间那一条（外观才有：后排南墙在前排檐口以上露出来的 0.6 米）
  { id: 'band2', level: 2, a: [M.x0, -30], b: [MASS.upperBack.x1, -30], t: E, h: H2B, upper: { y0: H2F } },
  // 钟楼二层：西墙一扇门出到露台；东墙、南墙（外观被钟楼盖住）
  {
    id: 'tower2-w',
    level: 2,
    a: [TOWER.x0, TOWER.z0],
    b: [TOWER.x0, TOWER.z1],
    t: E,
    h: H2F,
    tower: true,
    open: [door(-17.0, 1.0)],
  },
  {
    id: 'tower2-e',
    level: 2,
    a: [ext(TOWER.x1, -1), TOWER.z0],
    b: [ext(TOWER.x1, -1), TOWER.z1],
    t: E,
    h: H2F,
    tower: true,
    open: [win(-17.6, 0.6, 1.4, 3.0)],
  },
  {
    id: 'tower2-s',
    level: 2,
    a: [TOWER.x0, ext(TOWER.z1, -1)],
    b: [TOWER.x1, ext(TOWER.z1, -1)],
    t: E,
    h: H2F,
    tower: true,
    open: [door(-47.6, 1.0)],
  },
  // 露台的女儿墙（1 米，白灰泥，剖面也不切）：盖住拱廊，南沿在 z −10
  {
    id: 'parapet-w',
    level: 2,
    a: [ext(M.x0, 1), M.z1],
    b: [ext(M.x0, 1), MASS.south.z1],
    t: 0.3,
    h: 1.0,
    keep: true,
    mat: 'stucco',
  },
  { id: 'parapet-s', level: 2, a: [M.x0, -10.15], b: [-46.25, -10.15], t: 0.3, h: 1.0, keep: true, mat: 'stucco' },
  { id: 'parapet-e', level: 2, a: [-46.4, TOWER.z1], b: [-46.4, -10], t: 0.3, h: 1.0, keep: true, mat: 'stucco' },
  // 隔墙（二层 3.6 米）
  // 办公室 | 宴会厅 | 后厨（后厨的门开进宴会厅；上菜走宴会厅 → 酒吧）
  { id: 'office-e', level: 2, a: [-54, M.z0], b: [-54, -30], t: I, h: H2F },
  { id: 'kitchen2-w', level: 2, a: [M.x1, M.z0], b: [M.x1, -30], t: I, h: H2F, open: [door(-33.0, 1.2)] },
  // 后排 | 前排：办公室的门、楼梯井（内窗）、宴会厅的门（从酒吧进）、卫生间北墙
  {
    id: 'back-s',
    level: 2,
    a: [M.x0, -30],
    b: [MASS.upperBack.x1, -30],
    t: I,
    h: H2F,
    open: [door(-55.2, 1.2), win(-52.2, 1.4, 1.0, 2.4), door(-47.4, 1.8, 2.6)],
  },
  // 楼梯井：西、东两边、南沿西段是 1 米的栏板（看得到下面）；南沿中间是上楼梯的顶（敞开）
  { id: 'well-w', level: 2, a: [-54, -30], b: [-54, -24], t: 0.15, h: 1.0, keep: true, mat: 'plaster' },
  { id: 'well-e', level: 2, a: [-50.4, -30], b: [-50.4, -24], t: 0.15, h: 1.0, keep: true, mat: 'plaster' },
  { id: 'well-rail', level: 2, a: [-54, -24], b: [-52.05, -24], t: 0.15, h: 1.0, keep: true, mat: 'plaster' },
  // 酒吧 | 卫生间
  { id: 'wc2-w', level: 2, a: [M.x1, -30], b: [M.x1, -27], t: I, h: H2F, open: [door(-28.5, 0.9)] },

  // ═══════════ B1（y −4，层高 4；外墙是挡土墙 concrete，剖面留到地面）═══════════
  // 北墙：上面是北巷的格栅采光带 → 一排高窗（窗台 2.6、窗顶 3.7 = 地面下 0.3）
  {
    id: 'nB',
    level: -1,
    a: [B1W.x0, ext(B1W.z0, 1)],
    b: [B1E.x1, ext(B1W.z0, 1)],
    t: E,
    h: STOREY.gf,
    keep: true,
    open: [-61.2, -58.6, -56.0, -52.8, -50.0, -47.4, -44.0].map((x) => win(x, 1.6, 2.6, 3.7)),
  },
  // 西墙：上面是西巷的玻璃砖带 → 高窗
  {
    id: 'wB',
    level: -1,
    a: [ext(B1W.x0, 1), B1W.z0],
    b: [ext(B1W.x0, 1), B1W.z1],
    t: E,
    h: STOREY.gf,
    open: [-36, -29, -22, -15, -9].map((z) => win(z, 1.6, 2.8, 3.7)),
  },
  { id: 'eB-wing', level: -1, a: [ext(B1E.x1, -1), B1E.z0], b: [ext(B1E.x1, -1), B1E.z1], t: E, h: STOREY.gf },
  { id: 'sB-wing', level: -1, a: [B1E.x0, ext(B1E.z1, -1)], b: [B1E.x1, ext(B1E.z1, -1)], t: E, h: STOREY.gf },
  { id: 'eB', level: -1, a: [ext(B1W.x1, -1), B1E.z1], b: [ext(B1W.x1, -1), B1W.z1], t: E, h: STOREY.gf },
  { id: 'sB', level: -1, a: [B1W.x0, ext(B1W.z1, -1)], b: [B1W.x1, ext(B1W.z1, -1)], t: E, h: STOREY.gf },
  // 主区 | 后场（东翼下面）：器械区进洗衣房（z −36.6，避开货梯井）、前台大厅东头进储藏
  {
    id: 'back-w',
    level: -1,
    a: [B1W.x1, B1E.z0],
    b: [B1W.x1, B1E.z1],
    t: I,
    h: STOREY.gf,
    open: [door(-36.6, 1.0), door(-29, 1.2)],
  },
  { id: 'laundry-s', level: -1, a: [B1E.x0, -35.4], b: [B1E.x1, -35.4], t: I, h: STOREY.gf, open: [door(-43, 1.0)] },
  { id: 'plant-s', level: -1, a: [B1E.x0, -31], b: [B1E.x1, -31], t: I, h: STOREY.gf, open: [door(-43, 1.0)] },
  // 楼梯间（三面墙，南面敞开对前台大厅）
  { id: 'coreB-w', level: -1, a: [-54, -30], b: [-54, -24], t: I, h: STOREY.gf },
  { id: 'coreB-n', level: -1, a: [-54, -30], b: [-50.4, -30], t: I, h: STOREY.gf },
  { id: 'coreB-e', level: -1, a: [-50.4, -30], b: [-50.4, -24], t: I, h: STOREY.gf },
  // 电梯井（前台大厅里，门朝东）
  {
    id: 'liftB-n',
    level: -1,
    a: [LIFT.x0 - 0.125, LIFT.z0 - 0.125],
    b: [LIFT.x1 + 0.125, LIFT.z0 - 0.125],
    t: 0.25,
    h: STOREY.gf,
  },
  {
    id: 'liftB-s',
    level: -1,
    a: [LIFT.x0 - 0.125, LIFT.z1 + 0.125],
    b: [LIFT.x1 + 0.125, LIFT.z1 + 0.125],
    t: 0.25,
    h: STOREY.gf,
  },
  { id: 'liftB-w', level: -1, a: [LIFT.x0 - 0.125, LIFT.z0], b: [LIFT.x0 - 0.125, LIFT.z1], t: 0.25, h: STOREY.gf },
  // 团课房（拳击角北边那块，x −59.2…−54、z −33…−24）：北、南、西三面玻璃墙（窗台 0.3 = 玻璃），南、西各一扇门；东墙实墙
  {
    id: 'studio-n',
    level: -1,
    a: [-59.2, -33],
    b: [-54, -33],
    t: I,
    h: STOREY.gf,
    open: [win(-56.6, 4.6, 0.3, 3.4)],
  },
  {
    id: 'studio-s',
    level: -1,
    a: [-59.2, -24],
    b: [-54, -24],
    t: I,
    h: STOREY.gf,
    open: [win(-57.8, 2.4, 0.3, 3.4), door(-55.4, 1.4, 2.4)],
  },
  {
    id: 'studio-w',
    level: -1,
    a: [-59.2, -33],
    b: [-59.2, -24],
    t: I,
    h: STOREY.gf,
    open: [win(-30.8, 3.6, 0.3, 3.4), door(-27.0, 1.2, 2.4)],
  },
  { id: 'studio-e', level: -1, a: [-54, -33], b: [-54, -30], t: I, h: STOREY.gf },
  // 男 / 女更衣（淋浴、厕位在里面）：门开向前台大厅；南墙对有氧区
  {
    id: 'lockers-n',
    level: -1,
    a: [-54, -17],
    b: [B1W.x1, -17],
    t: I,
    h: STOREY.gf,
    open: [door(-52.4, 1.2), door(-47.0, 1.0)],
  },
  { id: 'lockers-w', level: -1, a: [-54, -17], b: [-54, -10.3], t: I, h: STOREY.gf },
  { id: 'lockers-mid', level: -1, a: [-50, -17], b: [-50, -10.3], t: I, h: STOREY.gf },
  { id: 'lockers-s', level: -1, a: [-54, -10.3], b: [B1W.x1, -10.3], t: I, h: STOREY.gf },
];
export const levelOf = (w: Wall): Floor => w.level ?? 1;

/** 墙沿 x？ */
export const alongX = (w: Wall) => Math.abs(w.a[1] - w.b[1]) < 1e-6;
/**
 * 剖面里会被切到 1 米的墙：朝镜头的（沿 x 的，北外墙除外）+ 所有隔墙（沿 z 的隔墙整层高时，墙顶在屏幕上往上伸，
 * 像一片片鳍压在北边的房间上）。只有外墙里沿 z 的（西墙、东立面）和北外墙留到 frame —— 娃娃屋的三面框。
 */
export const isCut = (w: Wall) => !w.keep && (alongX(w) || w.t < WALL_T.ext);
/** 剖面的三面框留多高（从这层地面算）：负一层的挡土墙一直到地面 */
export const frameOf = (w: Wall) => (levelOf(w) === -1 ? STOREY.frameB1 : STOREY.frame);

/**
 * 一道墙按开口切成实心的段（沿墙坐标 [起, 止]，y [下, 上]，从这层地面算）：开口两边整高；开口下面窗台（门没有）、上面门楣。
 * hTop = 这一段算到多高（外观 = w.h，剖面切墙 = STOREY.cut，三面框 = frame）。
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

/** 某一层的墙的挡路矩形（导航用）：门洞是通的，窗、窗台挡 */
export function wallBlocked(level: Floor = 1): Rect[] {
  const out: Rect[] = [];
  for (const w of WALLS) {
    if (w.upper || levelOf(w) !== level) continue;
    const ax = alongX(w);
    const c = ax ? w.a[1] : w.a[0];
    for (const s of wallPieces(w, Math.min(w.h, STOREY.gf))) {
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

// ── 楼梯、电梯（三层对齐）──────────────────────────────────────────────
/**
 * 楼梯芯 x −54…−50.4、z −30…−22.4：上楼、下楼两个 U 形梯叠在一起（每跑宽 1.5，中间 0.3 的实心栏板 NEWEL）。
 * 一段梯 = 导航的坡道（clubsite/play/nav 的 Ramp：矩形里高度沿 z 线性变，from 在 z0 那头、to 在 z1 那头）；平台 from = to。
 * grids = 这一段放进哪几层的导航（每层一张导航网格，同一层里一个格子只有一个高度；叠着的几段永远不在同一张里）。
 * 换层：脚下高度过了 ±1.7（上楼）/ ±1.6（下楼）就切到那一层（nav.ts 的 floorFor）—— 两头的平台、半跑都在两张网格里，切过去也站得住。
 *   1F ↔ 2F：西跑 up1（z −24 处 0 → z −27 处 2，往北上）→ 平台 landUp（2）→ 东跑 up2（z −27 处 2 → z −24 处 4，往南上，到二层落在酒吧）。
 *   1F ↔ B1：东跑 down1（z −24 处 0 → z −27 处 −2，往北下；在 up2 正下方）→ 平台 landDown（−2，在 landUp 正下方）→ 西跑 down2（z −24 处 −4，在 up1 正下方，到 B1 落在地下走廊）。
 * 1F 楼梯口（z −24…−22.4）：左手上楼、右手下楼。
 */
export interface Flight {
  id: string;
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** z0 那头、z1 那头的高度 */
  from: number;
  to: number;
  axis: 'z';
  grids: Floor[];
}
const FW = { w0: -53.85, w1: -52.35, e0: -52.05, e1: -50.55, run0: -27, run1: -24, land0: -29.85 };
export const FLIGHTS: Flight[] = [
  {
    id: 'up1',
    name: '上楼（1F → 平台）',
    x0: FW.w0,
    x1: FW.w1,
    z0: FW.run0,
    z1: FW.run1,
    from: 2,
    to: 0,
    axis: 'z',
    grids: [1, 2],
  },
  {
    id: 'landUp',
    name: '平台 +2',
    x0: FW.w0,
    x1: FW.e1,
    z0: FW.land0,
    z1: FW.run0,
    from: 2,
    to: 2,
    axis: 'z',
    grids: [1, 2],
  },
  {
    id: 'up2',
    name: '上楼（平台 → 2F）',
    x0: FW.e0,
    x1: FW.e1,
    z0: FW.run0,
    z1: FW.run1,
    from: 2,
    to: 4,
    axis: 'z',
    grids: [2],
  },
  {
    id: 'down1',
    name: '下楼（1F → 平台）',
    x0: FW.e0,
    x1: FW.e1,
    z0: FW.run0,
    z1: FW.run1,
    from: -2,
    to: 0,
    axis: 'z',
    grids: [1, -1],
  },
  {
    id: 'landDown',
    name: '平台 −2',
    x0: FW.w0,
    x1: FW.e1,
    z0: FW.land0,
    z1: FW.run0,
    from: -2,
    to: -2,
    axis: 'z',
    grids: [-1],
  },
  {
    id: 'down2',
    name: '下楼（平台 → B1）',
    x0: FW.w0,
    x1: FW.w1,
    z0: FW.run0,
    z1: FW.run1,
    from: -2,
    to: -4,
    axis: 'z',
    grids: [-1],
  },
];
/** 两跑之间的实心栏板（三层都挡） */
export const NEWEL: Rect = { x0: FW.w1, x1: FW.e0, z0: FW.run0, z1: FW.run1 };
export const flightsOn = (f: Floor) => FLIGHTS.filter((s) => s.grids.includes(f));
/** 一段梯在 (x, z) 的高度（不在里面 = null） */
export function flightHeight(s: Flight, x: number, z: number): number | null {
  if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) return null;
  const k = (z - s.z0) / (s.z1 - s.z0);
  return s.from + (s.to - s.from) * k;
}

/**
 * 货梯（东翼，后门边上，三层同一格）：1F 货梯厅（后门 (−40, −35.6) 进来的货、垃圾）↔ 2F 后厨 ↔ B1 洗衣房（隔壁是储藏）。
 * clubfood 的补货、倒垃圾都走后门（原来的厨房门 (−43, −27) 现在是便利店的门）。同样是站在门口按动作键传送。
 */
export const GOODS_LIFT = {
  x0: -45.6,
  x1: -44.0,
  z0: -39.7,
  z1: -38.1,
  door: [-44.8, -37.3] as V2,
  levels: [-1, 1, 2] as Floor[],
};

// ── 门（世界坐标；clubwalk 用）──────────────────────────────────────────
/**
 * 会所的外门：x, z = 门洞中心（墙中线上），w 宽，facing = 朝哪边开向外面；out / in = 门外 / 门里站的点（走进来、走出去的路点）。
 * 正门在东立面（拱廊立面）正对 clubfood 的球员通道 SPINE（z −22.4…−19.6）：总监、会员、球员都走这里，里面就是商店街；
 * 南门从钟楼门厅出到拱廊转角，再从南拱廊的拱或者朝东的两个拱出去（去泳池、长廊）；
 * 便利店的门（原来的厨房门，对着拱廊前小院）给客人；后门 → 货梯厅是 clubfood 的补货 / 倒垃圾路线（货梯通二楼后厨、B1 储藏）。四扇门的位置不变。
 */
export const DOORS = {
  main: { ...CLUBHOUSE_DOORS.main, out: [-44.9, -21] as V2, in: [-47.3, -21] as V2, name: '正门' },
  south: { ...CLUBHOUSE_DOORS.south, out: [-47.6, -14.3] as V2, in: [-47.4, -17.6] as V2, name: '南门（钟楼）' },
  /** 原来的厨房门：2026-11-11 起是便利店的门（对着拱廊前小院）；clubfood 的补货、倒垃圾改走后门 */
  kitchen: { ...CLUBHOUSE_DOORS.kitchen, out: [-43, -26.1] as V2, in: [-43, -28.0] as V2, name: '便利店的门' },
  kitchenBack: {
    ...CLUBHOUSE_DOORS.kitchenBack,
    out: [-39.4, -35.6] as V2,
    in: [-41.0, -35.6] as V2,
    name: '后门（送货）',
  },
} as const;

// ── 能走的地方 ─────────────────────────────────────────────────────────
/**
 * 一层 + 四周（clubsite/play 的 NavSpec 形状）：会所脚印 + 四周的沙地 / 步道 减掉墙（wallBlocked：门洞是通的）和家具的脚印（nav.ts）。
 * 往外：正门 → clubfood 的拱廊前小院 / 球员通道，拱廊的拱 → 南边的沙地 → 泳池（clubpool）/ 长廊西头（x −38）/ 西步道。
 */
export const WALKABLE: Rect[] = [
  { x0: CLUBHOUSE.x0, x1: CLUBHOUSE.x1, z0: CLUBHOUSE.z0, z1: CLUBHOUSE.z1 },
  /** 会所四周（北边、西边到围墙脚，南边到泳池北沿） */
  { x0: GROUNDS.x0 + 0.5, x1: -46, z0: GROUNDS.z0 + 0.5, z1: -1 },
];
/** 某一层里能站的地方（房间的并集；楼梯井不算，由坡道盖住） */
export const walkOn = (f: Floor): Rect[] =>
  roomsOn(f)
    .filter((r) => !r.hole)
    .map((r) => r.r);

// ── 区域标签（白模评审用，?labels=0 不显示）──────────────────────────────
/** level / mode 同 Slot（不给 level = 1）；kind area = 区域名，propose = 共享坐标的建议，placeholder = 墙体里要画的部分 */
export interface AreaLabel {
  text: string;
  x: number;
  y: number;
  z: number;
  kind?: 'area' | 'propose' | 'placeholder';
  mode?: 'in' | 'out';
  level?: Floor;
}
export const AREA_LABELS: AreaLabel[] = [
  { text: '会所（西班牙复兴式，红瓦，两层 + 地下一层健身房）', x: -56, y: 12.0, z: -36, mode: 'out' },
  { text: '#2 南拱廊（方洞 → 拱券、柱头）', x: -58.0, y: 3.4, z: -10, kind: 'placeholder', mode: 'out' },
  { text: '露台（南翼 + 拱廊的平屋顶）', x: -56, y: 5.2, z: -14, kind: 'area', mode: 'out' },
  { text: '#42–44 地下健身房的天窗、格栅、玻璃砖', x: -55, y: 0.6, z: -8, kind: 'placeholder', mode: 'out' },
  { text: '红瓦（屋顶材质）', x: -58, y: 9.6, z: -25, kind: 'placeholder', mode: 'out' },
  { text: '拱廊前小院（clubfood）', x: -43, y: 0.4, z: -12.0 },
  { text: '餐车院子（clubfood）', x: -30, y: 0.4, z: -30 },
  { text: '泳池（clubpool）', x: -50, y: 0.6, z: 4 },
  { text: '北围墙 z −43', x: -40, y: 2.6, z: -43, mode: 'out' },
  { text: 'clubpool 的石板小路 → 南门', x: -47.6, y: 0.3, z: -6.0, kind: 'propose' },
  // 房间名（贴在每层的地面上，北半 —— 南沿那一米被切墙挡住）
  ...ROOMS.filter((r) => !r.noLabel).map((r) => ({
    text: r.name,
    x: (r.r.x0 + r.r.x1) / 2,
    y: FLOOR_Y[r.level] + 0.2,
    z: r.id === 'hall' ? (r.r.z0 + r.r.z1) / 2 : r.r.z1 - 0.6,
    mode: 'in' as const,
    level: r.level,
  })),
  { text: '正门 →', x: -46.8, y: 0.2, z: -21.9, mode: 'in', kind: 'propose' },
  { text: '南门 ↓', x: -47.0, y: 0.2, z: -15.0, mode: 'in', kind: 'propose' },
  { text: '后门 →', x: -40.8, y: 0.2, z: -34.4, mode: 'in', kind: 'propose' },
  { text: '便利店的门 ↓', x: -43, y: 0.2, z: -27.8, mode: 'in', kind: 'propose' },
  { text: '↑ 2F', x: -53.1, y: 1.2, z: -25.0, mode: 'in', kind: 'propose' },
  { text: '↓ B1', x: -51.3, y: 0.2, z: -25.0, mode: 'in', kind: 'propose' },
  { text: '↓ 1F', x: -51.3, y: 4.2, z: -24.6, mode: 'in', kind: 'propose', level: 2 },
  { text: '↑ 1F', x: -53.1, y: -3.8, z: -24.6, mode: 'in', kind: 'propose', level: -1 },
  ...LIFT.levels.map((level) => ({
    text: '电梯',
    x: (LIFT.x0 + LIFT.x1) / 2,
    y: FLOOR_Y[level] + 0.2,
    z: LIFT.z1 + 0.3,
    mode: 'in' as const,
    kind: 'propose' as const,
    level,
  })),
  ...GOODS_LIFT.levels.map((level) => ({
    text: '货梯',
    x: (GOODS_LIFT.x0 + GOODS_LIFT.x1) / 2,
    y: FLOOR_Y[level] + 0.2,
    z: GOODS_LIFT.z1 + 0.3,
    mode: 'in' as const,
    kind: 'propose' as const,
    level,
  })),
  { text: '北巷格栅采光带（地面）', x: -52, y: -0.4, z: -41.3, mode: 'in', kind: 'propose', level: -1 },
  { text: '切开的土', x: -55, y: -2.8, z: -3.5, mode: 'in', kind: 'propose', level: -1 },
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
