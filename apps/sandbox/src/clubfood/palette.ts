// clubfood 的调色板 = clubplaza 的整张表（= clubdesk + 池水、花砖）+ 这个场景提议的餐车主色（FOOD）。
// 地面、会所、凉棚、人几乎都是现成的：granite（餐车院子的碎花岗岩）、tile（凉棚下的陶砖）、flagstone（球员通道那条石板）、lawn（孩子的草皮角）、
// stucco / roofTile / ironwork（会所）、timber（凉棚）、adobe / cap（围墙）。
// 新加的只有每辆餐车 / 小推车的"招牌色"：白模里占位是冷灰体块，**只有车顶 / 遮阳篷 / 伞面这一块涂上提议的主色**（方便看配色和饱和度；?accent=0 关掉）。
// 资产阶段每件车按这里的主色画（每档三色、暗档换冷色相，规矩同 clubdesk/palette.ts）；这里先给三档主色 [亮, 中, 暗]。
//
// 配色原则（6 午后金光）：
// - 一排车是画面里饱和度最高的东西 → 主色彩度要高（午后的全局调色会把彩度压一截，用户定的是"主角材质给更多彩度"，不改方案）。
// - 七种主色在色环上拉开：番茄红（披萨）、日落橙（塔可）、芥末黄（吉事果）、薄荷青（咖啡）、叶绿（波奇碗）、粉（冰棍）、薰衣草（珍珠奶茶）。
//   挨着的两辆车不用相邻的色相（红 ↔ 青 ↔ 橙），暖色多、冷色少（青、紫各一块，像撒在暖底上的点）。
// - 冷色主色（薄荷、薰衣草）借 club 组过调色（暗档往 285° 蓝紫走，影子里留得住冷色）；暖色借 accent 组（暗档和全场的影子一家玫瑰褐）；
//   叶绿借 plants 组。见 PROXY。
// L = 0.2126R + 0.7152G + 0.0722B。

import type { Tones } from '../clubdesk/toon';
import type { Swatch } from '../clubfront/palette';
import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });

/** 这个场景提议的主色（白模：占位的车顶 / 篷 / 伞面；资产阶段照这个画） */
const FOOD = {
  /** #1 咖啡车：薄荷青（L 186 / 132 / 84）。整条街唯一的青，夹在红、橙中间 */
  accCoffee: s([0x5edcc4, 0x2fa69c, 0x2a6482], 0.4, 0.3),
  /** #2 塔可车：日落橙（L 168 / 120 / 70） */
  accTaco: s([0xff9a32, 0xe8622a, 0x8e3446], 0.4, 0.3),
  /** #3 窑烤披萨车：番茄红 + 奶油（L 120 / 82 / 52；奶油用 clothWhite） */
  accPizza: s([0xf4503a, 0xc4303e, 0x6c2448], 0.4, 0.3),
  /** #4 银色拖车（波奇碗 / 沙拉）：车身银（资产用 carSilver），主色叶绿（L 186 / 140 / 88） */
  accPoke: s([0xa4dc5a, 0x64ae48, 0x2e6c52], 0.4, 0.3),
  /** #5 冰棍三轮：粉（L 168 / 118 / 78） */
  accPaleta: s([0xff8cb4, 0xe25a90, 0x844070], 0.4, 0.3),
  /** #6 吉事果车：芥末黄（L 205 / 160 / 98）+ 红条（flowerRed） */
  accChurro: s([0xffcc3c, 0xdc9a2e, 0x8c5a3c], 0.4, 0.3),
  /** #7 珍珠奶茶三轮摩托：薰衣草（L 153 / 112 / 66） */
  accBoba: s([0xb890f4, 0x8c64d4, 0x4c3c90], 0.4, 0.3),
  /** 三色垃圾桶的桶盖：灰（其他垃圾）用 placeholder 灰，蓝（回收）、绿（厨余）用这两个 */
  accRecycle: s([0x4a9ef0, 0x2e6ac4, 0x283c8c], 0.4, 0.3),
  accCompost: s([0x7cc84a, 0x4c9a40, 0x2a5e48], 0.4, 0.3),
  /** 串灯的灯泡（白天不亮：暖白玻璃；傍晚亮成 flowerYellow，stage 3） */
  bulb: s([0xfff4d6, 0xf0d8a8, 0x9c8494], 0.2, 0.6),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubplaza（含 clubdesk、clubmap2、clubfront、desert3d-v2）+ FOOD */
export const PAL = { ...PLAZA_PAL, ...FOOD } as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;
export const EL = PLAZA_EL;

/** 这个场景的主色借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）；clubplaza 的池水、花砖照旧 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  accCoffee: 'jug',
  accBoba: 'jug',
  accRecycle: 'jug',
  accTaco: 'toolOrange',
  accPizza: 'flowerRed',
  accPaleta: 'flowerRed',
  accChurro: 'flowerYellow',
  accPoke: 'lawn',
  accCompost: 'lawn',
  bulb: 'clothWhite',
};

/** 主色的 key（占位用） */
export type Accent = keyof typeof FOOD;
