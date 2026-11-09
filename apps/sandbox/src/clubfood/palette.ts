// clubfood 的调色板 = clubplaza 的整张表（= clubdesk + 池水、花砖）+ 这个场景提议的餐车主色（FOOD）。
// 地面、会所、凉棚、人几乎都是现成的：granite（餐车院子的碎花岗岩）、tile（凉棚下的陶砖）、flagstone（球员通道那条石板）、lawn（孩子的草皮角）、
// stucco / roofTile / ironwork（会所）、timber（凉棚）、adobe / cap（围墙）。
// 新加的：每辆餐车 / 小推车的"招牌色"（FOOD，stage 2 补了 tones）+ 资产要的银、玻璃、轮胎、面包色、烟。
//
// 配色原则（6 午后金光）：
// - 一排车是画面里饱和度最高的东西 → 主色彩度要高（午后的全局调色会把彩度压一截，用户定的是"主角材质给更多彩度"，不改方案）。
// - 七种主色在色环上拉开：番茄红（披萨）、日落橙（塔可）、芥末黄（吉事果）、薄荷青（咖啡）、酸黄瓜绿（汉堡）、粉（冰棍）、薰衣草（珍珠奶茶）。
//   挨着的两辆车不用相邻的色相（红 ↔ 青 ↔ 橙），暖色多、冷色少（青、紫各一块，像撒在暖底上的点）。
// - 冷色主色（薄荷、薰衣草）借 club 组过调色（暗档往 285° 蓝紫走，影子里留得住冷色）；暖色借 accent 组（暗档和全场的影子一家玫瑰褐）；
//   叶绿借 plants 组。见 PROXY。
// L = 0.2126R + 0.7152G + 0.0722B。

import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });

/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/**
 * 这个场景的主色（每辆车 / 小推车一个"招牌色"）+ 资产要的几种新材质。
 * 主色的三档是白模定的（用户 2026-11-09 同意），stage 2 补了 tones：高/低一级差 ±8，缝 −26…−14（往冷走一点），亮边 +24。
 * 用法：车顶、篷、伞面这些朝天的面 = 亮档（主色最亮的一块）；朝镜头的车身侧面在暗档 → 资产用 lightUp + 低 bands 留住中档。
 */
const FOOD = {
  /** #1 咖啡车：薄荷青（L 191 / 140 / 90）。整条街唯一的青，夹在红、橙中间 */
  accCoffee: s(
    [0x49e2c5, 0x1aaca0, 0x1c678d],
    0.4,
    0.3,
    tn(
      [0x49e2c5, 0x50eacc, 0x42dabe], // L 191 / 199 / 184
      [0x1aaca0, 0x21b4a6, 0x13a499], // L 140 / 148 / 132
      [0x1c678d, 0x246f94, 0x155f87], // L 90 / 98 / 82
      [0x2ac7ba, 0x01989a, 0x055a91], // 缝 L 165 / 120 / 76
      [0x5ffadb, 0x31c4b5, 0x337fa2], // 亮边 L 215 / 163 / 113
    ),
  ),
  /** #2 塔可车：日落橙（L 168 / 122 / 72） */
  accTaco: s(
    [0xff960e, 0xff5809, 0xac2b45],
    0.4,
    0.3,
    tn(
      [0xff960e, 0xffa11a, 0xff8e07], // L 168 / 176 / 160
      [0xff5809, 0xff6111, 0xff4f01], // L 122 / 130 / 115
      [0xac2b45, 0xb0344c, 0xa8223e], // L 72 / 80 / 65
      [0xfc7a02, 0xff4303, 0x9a1c47], // 缝 L 141 / 102 / 58
      [0xffb731, 0xff7122, 0xbc455b], // 亮边 L 192 / 146 / 96
    ),
  ),
  /** #3 窑烤披萨车：番茄红 + 奶油（L 113 / 80 / 54；奶油用 clothWhite） */
  accPizza: s(
    [0xff401f, 0xff1d33, 0x841c50],
    0.4,
    0.3,
    tn(
      [0xff401f, 0xff4927, 0xff3717], // L 113 / 121 / 106
      [0xff1d33, 0xff273b, 0xff122b], // L 80 / 88 / 73
      [0x841c50, 0x882556, 0x80134a], // L 54 / 62 / 46
      [0xff2112, 0xff0331, 0x730d54], // 缝 L 87 / 60 / 40
      [0xff603e, 0xff394b, 0x943664], // 亮边 L 137 / 104 / 77
    ),
  ),
  /**
   * #4 银色拖车的汉堡（用户 2026-11-09：波奇碗换成汉堡车）：车身银（carSilver），主色酸黄瓜绿（翻板内侧、招牌、托盘上的生菜）。
   * 整条街唯一的绿（L 199 / 151 / 93）
   */
  accBurger: s(
    [0x9de044, 0x59b337, 0x246f50],
    0.4,
    0.3,
    tn(
      [0x9de044, 0xa4e84b, 0x96d83d], // L 199 / 206 / 191
      [0x59b337, 0x60bb3e, 0x52ab30], // L 151 / 159 / 143
      [0x246f50, 0x2b7757, 0x1d6749], // L 93 / 101 / 85
      [0x7ec538, 0x409f31, 0x0f614f], // 缝 L 172 / 131 / 79
      [0xb3f85a, 0x6fcb4d, 0x3a8765], // 亮边 L 222 / 174 / 116
    ),
  ),
  /** #5 冰棍三轮：粉（L 167 / 123 / 82） */
  accPaleta: s(
    [0xff84b8, 0xff4d98, 0x943a7a],
    0.4,
    0.3,
    tn(
      [0xff84b8, 0xff8fc1, 0xff7bb1], // L 167 / 175 / 160
      [0xff4d98, 0xff569f, 0xff4492], // L 123 / 131 / 115
      [0x943a7a, 0x9a4380, 0x8f3274], // L 82 / 90 / 74
      [0xfc68ae, 0xf43896, 0x812c7b], // 缝 L 141 / 103 / 68
      [0xffa6d4, 0xff67ad, 0xa8538e], // 亮边 L 192 / 146 / 105
    ),
  ),
  /** #6 吉事果车：芥末黄（L 207 / 160 / 98）+ 红条（flowerRed） */
  accChurro: s(
    [0xffd01a, 0xec9810, 0x985831],
    0.4,
    0.3,
    tn(
      [0xffd01a, 0xffdb25, 0xffc813], // L 207 / 215 / 200
      [0xec9810, 0xf2a017, 0xe59008], // L 160 / 168 / 153
      [0x985831, 0x9e6039, 0x914f2a], // L 98 / 106 / 91
      [0xebb50e, 0xd3840a, 0x834a31], // 缝 L 181 / 140 / 84
      [0xfff13b, 0xffb127, 0xac7048], // 亮边 L 231 / 184 / 122
    ),
  ),
  /** #7 珍珠奶茶三轮摩托：薰衣草（L 160 / 117 / 69） */
  accBoba: s(
    [0xbf8bff, 0x955ef9, 0x4f38b2],
    0.4,
    0.3,
    tn(
      [0xbf8bff, 0xc693ff, 0xb983ff], // L 160 / 167 / 152
      [0x955ef9, 0x9b66fe, 0x8f55f4], // L 117 / 124 / 109
      [0x4f38b2, 0x5540b6, 0x492faf], // L 69 / 77 / 62
      [0xa26fff, 0x7d48ff, 0x3a28c4], // 缝 L 133 / 97 / 55
      [0xd5a5ff, 0xaa77ff, 0x6451c1], // 亮边 L 183 / 140 / 93
    ),
  ),
  /** 三色垃圾桶的桶盖：灰（其他垃圾）用 carSilver 的中档，蓝（回收）、绿（厨余）用这两个 */
  accRecycle: s(
    [0x4a9ef0, 0x2e6ac4, 0x283c8c],
    0.4,
    0.3,
    tn(
      [0x4a9ef0, 0x51a6f7, 0x4396e9], // L 146 / 154 / 138
      [0x2e6ac4, 0x3572cb, 0x2762bd], // L 100 / 107 / 92
      [0x283c8c, 0x2f4493, 0x213485], // L 62 / 69 / 54
      [0x2c83e2, 0x1656bc, 0x152e89], // 缝 L 119 / 80 / 47
      [0x61b7ff, 0x4482da, 0x3e54a2], // 亮边 L 170 / 123 / 85
    ),
  ),
  accCompost: s(
    [0x7cc84a, 0x4c9a40, 0x2a5e48],
    0.4,
    0.3,
    tn(
      [0x7cc84a, 0x83d051, 0x75c043], // L 175 / 182 / 167
      [0x4c9a40, 0x53a247, 0x459239], // L 131 / 139 / 123
      [0x2a5e48, 0x31664f, 0x235641], // L 81 / 89 / 74
      [0x5ead3c, 0x348638, 0x175045], // 缝 L 148 / 111 / 67
      [0x92e060, 0x62b256, 0x40765e], // 亮边 L 198 / 154 / 105
    ),
  ),
  /** 串灯的灯泡（白天不亮：暖白玻璃；傍晚亮成 flowerYellow） */
  bulb: s([0xfff4d6, 0xf0d8a8, 0x9c8494], 0.2, 0.6),
  // ── 资产要的新材质 ──────────────────────────────────
  /** 银色拖车（Airstream）的铝皮、不锈钢台面、冷柜（同 clubpark 的 carSilver：中/暗档去掉蓝紫） */
  carSilver: s(
    [0xd4d4dc, 0xa09ea8, 0x5c5a74],
    0.6,
    0.6,
    tn(
      [0xd4d4dc, 0xdbdce3, 0xcdccd5], // L 213 / 220 / 205
      [0xa09ea8, 0xa7a6af, 0x9996a1], // L 159 / 167 / 151
      [0x5c5a74, 0x63627b, 0x55526d], // L 92 / 100 / 85
      [0xb6b9ce, 0x888aa0, 0x494c71], // 缝 L 186 / 139 / 78
      [0xeaecf2, 0xb6b6be, 0x72728a], // 亮边 L 236 / 183 / 116
    ),
  ),
  /** 车窗、玻璃柜（同 clubpark 的 glass）：朝天的斜面映天（L 190），侧面中档，朝镜头的暗档 */
  glass: s([0x9cc4e0, 0x56689a, 0x2c2c54], 0.4, 0.5),
  /** 轮胎（同 clubpark 的 tyre）：中性炭灰 */
  tyre: s([0x575450, 0x3a3836, 0x22212a], 0.3, 0.2),
  /** 面包、汉堡胚、吉事果、披萨饼边、薯条的烤色（暖金棕，L 189 / 136 / 85） */
  bun: s(
    [0xf0b85c, 0xc87c3e, 0x7a4a52],
    0.4,
    0.3,
    tn(
      [0xf0b85c, 0xf7c063, 0xe9b055], // L 189 / 197 / 182
      [0xc87c3e, 0xcf8445, 0xc17437], // L 136 / 143 / 128
      [0x7a4a52, 0x815259, 0x73424b], // L 85 / 92 / 77
      [0xd29d4e, 0xb06836, 0x673c4f], // 缝 L 163 / 116 / 71
      [0xffd273, 0xde9454, 0x906268], // 亮边 L 213 / 159 / 108
    ),
  ),
  /**
   * 餐车院子的地面（FOOD_COURT + ARCADE_YARD）：比长廊的碎花岗岩（granite #e6cdb2，S 0.23）暖一点、彩度高一截的"红砂碎石"
   * （亮档 #ecc29a L 200 S 0.35）—— 院子是一块自己的铺地，长廊照旧。stage 3 数字验收：整帧饱和度差 0.01 到线，大面积的地面是最大的拖累。
   * 借 granite 过配色（ground 组）。
   */
  yardGranite: s(
    [0xecc29a, 0xcc9a88, 0x8a5c96],
    0.1,
    0.05,
    tn(
      [0xecc29a, 0xf3caa1, 0xe5ba93], // L 200 / 208 / 192
      [0xcc9a88, 0xd3a28f, 0xc59281], // L 163 / 171 / 156
      [0x8a5c96, 0x91649d, 0x83548f], // L 106 / 114 / 98
      [0xcea78c, 0xb48680, 0x774e93], // 缝 L 173 / 143 / 92
      [0xffdbb1, 0xe2b29e, 0xa074ac], // 亮边 L 224 / 187 / 129
    ),
  ),
  /** 垃圾桶的灰盖（其他垃圾）：carSilver 往下挪一档 */
  binGrey: s([0xa09ea8, 0x7e7c8e, 0x5c5a74], 0.4, 0.3),
  /** 黑垃圾袋的塑料高光：ironwork 往上挪一档 */
  bagSheen: s([0x8e8cb0, 0x6a6890, 0x4a4670], 0.3, 0.2),
  /** 汉堡肉饼（深棕；暗档往紫走） */
  patty: s([0x8a5a44, 0x5e3a3c, 0x3a2638], 0.3, 0.3),
  /** 披萨窑的烟（2～3 团方块）：暖白 → 灰紫，比天亮一点；不接投影 */
  smoke: s([0xf4ece4, 0xcac0cc, 0x8c84a4], 0, 0),
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
  accBurger: 'lawn',
  accCompost: 'lawn',
  bulb: 'clothWhite',
  // carSilver（accent）、glass（club）已经在 clubsite/render/palettes 的 GROUP 表里
  tyre: 'ironwork',
  bun: 'flowerYellow',
  smoke: 'clothWhite',
  yardGranite: 'granite',
  binGrey: 'carSilver',
  bagSheen: 'ironwork',
  patty: 'wood',
};

/** 主色的 key（占位用） */
export type Accent = keyof typeof FOOD;
