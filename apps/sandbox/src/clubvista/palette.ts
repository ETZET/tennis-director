// clubvista 的调色板 = 餐车院子（clubfood：广场 + 前台 + clubmap2 的整张表）+ 泳池（clubpool）+ 会员场（clubcourts）+ 中心球场（clubstadium）
// 的超集（只读 import，复用它们的资产时颜色一个不差）+ 这张"分图地图"新加的地面（VISTA）。
// 新材质照 clubsite/render/palette.ts 的规则手挑：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝、亮边差 15～30（< 60）；
// 暗档换冷色相（不是亮档乘系数）。L = 0.2126R + 0.7152G + 0.0722B，S = HSV 饱和度。
// 《垂钓手记》的整屏规则（~/workspace/tennis-director-refs/club-redo/brief/analysis.md）：大面安静（元素少、缝浅、块大），
// 受光暖、背光冷，冷的大面（球场、池水、干河床、马路）放在每张图最低的那层。

import { GROUP_AS as COURTS_AS, PAL as COURTS_PAL } from '../clubcourts/palette';
import { PAL as FOOD_PAL, PROXY as FOOD_PROXY } from '../clubfood/palette';
import { PAL as POOL_PAL, PROXY as POOL_PROXY, SUN_SKIP as POOL_SUN_SKIP } from '../clubpool/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones } from '../clubsite/render/toon';
import { PAL as STADIUM_PAL, PROXY as STADIUM_PROXY } from '../clubstadium/palette';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

const VISTA = {
  /**
   * 沙漠地面（每张图最大的一块暖色）：和 sand 同一家，亮档略浅、略黄（L 190），暗档冷灰紫（L 104，色相 262°，彩度低）——
   * 参考图路上、木板上的影子是 #686880 那种低彩度冷灰紫，不是玫瑰褐。
   */
  floor: s(
    [0xeec286, 0xc89a8a, 0x77729a],
    0.05,
    0,
    tn(
      [0xeec286, 0xf2ca92, 0xe6b87a], // L 199 / 207 / 190（S 0.44：奶油一点的沙，不抢焦点的暖色）
      [0xc89a8a, 0xd0a492, 0xbe9082], // L 163 / 172 / 154
      [0x77729a, 0x7f7aa2, 0x6f6a92], // L 117 / 125 / 109
      [0xdcb27e, 0xb08680, 0x625e88], // 缝 −17 / −22 / −16
      [0xfadaa4, 0xdcb09c, 0x8e8aae], // 亮边 +15 / +16 / +19
    ),
  ),
  /** 台地顶（高一层的地面）：比沙漠地面更浅、更冷一点的钙质土（层和层一眼分开） */
  mesa: s(
    [0xf4d49c, 0xd2aa9a, 0x7a76a0],
    0.05,
    0,
    tn(
      [0xf4d49c, 0xf8dca8, 0xeccb90], // L 213 / 221 / 204
      [0xd2aa9a, 0xdab4a2, 0xc8a090], // L 177 / 186 / 167
      [0x7a76a0, 0x827ea8, 0x726e98], // L 121 / 129 / 113
      [0xe2be8a, 0xb69486, 0x66628c],
      [0xfde6b8, 0xe4c0ae, 0x928eb4],
    ),
  ),
  /**
   * 干河床（沙漠里的"水"：最低一层、冷色）：灰蓝的鹅卵石（L 170，色相 245°）。暗档靛（L 88）。
   * 石块大、缝浅（大面安静），亮边只给上沿。
   */
  washBed: s(
    [0x8696cc, 0x6870aa, 0x404684],
    0.05,
    0,
    tn(
      [0x8696cc, 0x8c9cd0, 0x8090c6], // L 150 / 156 / 144（比沙暗一截的冷灰蓝，S 0.34）
      [0x6c74a6, 0x7078aa, 0x6870a2], // L 118 / 122 / 114
      [0x434680, 0x474a84, 0x3f427c], // L 72 / 76 / 68
      [0x8690bc, 0x666ea0, 0x3e4178], // 缝只差 6～8：几乎看不见
      [0xa0aad2, 0x7a82b2, 0x50548e],
    ),
  ),
  /** 马路沥青（图的南边界）：冷石板灰（L 132，色相 230°），暗档靛灰 */
  road: s(
    [0x7c8cb6, 0x62709c, 0x40467a],
    0.05,
    0,
    tn(
      [0x7c8cb6, 0x8494bc, 0x7484ae], // L 137 / 145 / 129（S 0.32，冷石板蓝）
      [0x62709c, 0x6a78a4, 0x5a6894], // L 110 / 118 / 102
      [0x40467a, 0x484e82, 0x3a4070], // L 69 / 76 / 62
      [0x6c7ca6, 0x56628e, 0x363c6a],
      [0x96a4cc, 0x7c88b2, 0x585e92],
    ),
  ),
  /**
   * 球场外场（缓冲区）：深一级的钴蓝（L 122，色相 216°），内场是 court 的青蓝（L 148）—— 整块球场是一大片冷色、两档蓝，
   * 不用 surround 的绿（绿不算冷，也和沙地的暖抢）。暗档靛（L 66）。
   */
  courtOut: s(
    [0x7a6cc4, 0x5e52a6, 0x3c3478],
    0.05,
    0,
    tn(
      [0x7a6cc4, 0x8274cc, 0x7264ba], // L 117 / 125 / 109（S 0.45，蓝紫：印第安维尔斯的外场；色相离开影子的低彩度灰紫）
      [0x5e52a6, 0x665aae, 0x564a9c], // L 93 / 100 / 85
      [0x3c3478, 0x423a80, 0x362e6e], // L 61 / 67 / 55
      [0x6e60b8, 0x54489a, 0x342c6c],
      [0x9488d8, 0x7468bc, 0x544c94],
    ),
  ),
  /** 中心球场内场：饱和的蓝（L 135，色相 212°），和外场的蓝紫一眼分开 */
  courtIn: s(
    [0x4c8edc, 0x3a70bc, 0x2e4a8c],
    0.05,
    0,
    tn(
      [0x4c8edc, 0x5496e2, 0x4486d2], // L 130 / 137 / 123
      [0x3a70bc, 0x4078c2, 0x3468b2], // L 103 / 110 / 96
      [0x2e4a8c, 0x345094, 0x2a4482],
      [0x4482cc, 0x3466aa, 0x2a4480],
      [0x6aa6ea, 0x4e86ce, 0x40609e],
    ),
  ),
  /** 练习场：绿土场（Har-Tru 那种）内场 + 深青绿外场 —— 和中心球场的蓝 / 蓝紫一眼分开 */
  practiceIn: s([0x52b08a, 0x3e8e78, 0x2a5e66], 0.05, 0), // L 147，色相 154°（青绿：冷，但和中心球场的蓝分得开）
  practiceOut: s([0x2f8e8c, 0x267070, 0x204a5e], 0.05, 0), // L 117，色相 179°
  /**
   * 草坪（俱乐部里浇水的草：前台台地、球场四周、绿洲）：参考图的亮草 #96cd5c，草上的影子青绿 #3c8b75（颜色代理的结论）。
   * 沙漠里一块块绿 = "到了俱乐部"，也是整屏饱和度的来源。
   */
  turf: s(
    [0x96cd5c, 0x6aab60, 0x3c8b75],
    0.05,
    0,
    tn(
      [0x96cd5c, 0x9ed466, 0x8cc454], // L 180 / 188 / 171
      [0x6aab60, 0x72b268, 0x62a258], // L 146 / 153 / 138
      [0x3c8b75, 0x42917b, 0x36836e], // L 114 / 120 / 107
      [0x86bc52, 0x5e9a56, 0x347c68],
      [0xb0e070, 0x84c070, 0x56a08a],
    ),
  ),
  /** 看台座位（俱乐部青绿漆） */
  seatRow: s([0x4ab8a4, 0x34908a, 0x2a5a72], 0.3, 0.3),
  /**
   * 主路（踩实的红土路，比沙漠地面深一档：L 158 vs 199，色相 22°）：参考图的主路是草地上一条更深的橙土路，
   * 一眼认得出"这条是路"。暗档冷灰紫（L 92）。块大、缝浅（路也要安静）。
   */
  trail: s(
    [0xd8986e, 0xb07a78, 0x645e8c],
    0.08,
    0,
    tn(
      [0xd8986e, 0xdea278, 0xce8e64], // L 165 / 174 / 156
      [0xb07a78, 0xb88480, 0xa6706e], // L 133 / 142 / 124
      [0x645e8c, 0x6c6694, 0x5c5684], // L 99 / 107 / 91
      [0xc48662, 0x9a6a6c, 0x58527e], // 缝 −16 / −16 / −10
      [0xeab48a, 0xc69290, 0x7c76a4], // 亮边 +20 / +19 / +20
    ),
  ),
  /** 踏脚石（支路）：一块块扁平的冷灰石（L 196，色相 245°，低彩度），撒在沙上 */
  stepStone: s([0xd4d0e0, 0xa8a2c0, 0x6a6696], 0.3, 0.3),
  /**
   * 绿洲池水：深一点的青蓝（L 151，色相 197°），高/低一级只差 6～8（水面安静：两档相近的色，参考图的水也是这样），
   * 暗档（崖的投影里）靛蓝 L 82。亮档不吃午后的太阳色（SUN_SKIP），否则成薄荷绿。
   */
  lagoon: s(
    [0x3cb2d6, 0x2f8cc0, 0x2c5a98],
    0.05,
    0,
    tn(
      [0x3cb2d6, 0x44b8da, 0x36aad0], // L 151 / 157 / 145
      [0x2f8cc0, 0x3592c4, 0x2a86ba], // L 120 / 125 / 115
      [0x2c5a98, 0x30609e, 0x285492], // L 82 / 87 / 77
      [0x34a2cc, 0x2a7cb2, 0x284e8a],
      [0x6ccce4, 0x4aa4d0, 0x3a6ca8],
    ),
  ),
  /** 人行道 / 马路牙子（亮暖灰，一条亮线把马路和沙地分开） */
  curb: s([0xf2e2c8, 0xc8b4b4, 0x6e6a96], 0.3, 0.4),
  /** 马路中线（暖黄虚线，参考图同） */
  roadPaint: s([0xf6d276, 0xd0a868, 0x7a6a86], 0.05, 0),
  /** 崖壁（台地朝镜头的面）：沙岩条带，暗档靛紫（L 70）。和 cliff 同一家，暗档更冷（画面的深色框） */
  bluff: s(
    [0xd88a66, 0xa86a78, 0x4e4a86],
    0.3,
    0.3,
    tn(
      [0xd88a66, 0xe09670, 0xcc7e5e], // L 155 / 165 / 145
      [0xa86a78, 0xb07482, 0x9c606e], // L 121 / 130 / 112
      [0x4e4a86, 0x56528e, 0x46427c], // L 77 / 85 / 70
      [0xb46a54, 0x8a5466, 0x3c3870], // 缝 −28 / −27 / −20
      [0xf0aa80, 0xc48890, 0x6e6aa2], // 亮边 +25 / +26 / +27
    ),
  ),
  /** 崖顶一纹素的亮唇 */
  bluffLip: s([0xf8d49a, 0xd8a088, 0x7a74a6], 0.3, 0.6),
  /** 白模：占位体块（冷灰，按高度一档档） */
  box: s([0xd8d6e4, 0xa8a4c0, 0x6a6690], 0.6, 0.5),
  /** 白模：占位体块的主角色（每张图一个最鲜艳的暖色：入口的车、前台的帆、泳池的伞……） */
  boxHot: s([0xff8a5c, 0xd85a5a, 0x7a3a6a], 0.6, 0.5),
} as const satisfies Record<string, Swatch>;

export const PAL = { ...FOOD_PAL, ...POOL_PAL, ...COURTS_PAL, ...STADIUM_PAL, ...VISTA } as const;
export type Pal = typeof PAL;

/** 新材质借哪个名字过配色方案的分组（同 clubpool / clubfood 的 PROXY 做法；方案的 GROUP 表不归这里改） */
export const GRADE_AS: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(FOOD_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  ...(POOL_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  ...(STADIUM_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  ...(COURTS_AS as Partial<Record<keyof Pal, keyof Pal>>),
  floor: 'sand',
  mesa: 'sandHigh',
  washBed: 'water',
  road: 'asphalt',
  courtOut: 'court',
  courtIn: 'court',
  practiceIn: 'court',
  practiceOut: 'court',
  turf: 'lawn',
  seatRow: 'seat',
  lagoon: 'water',
  trail: 'path',
  stepStone: 'flagstone',
  curb: 'concrete',
  roadPaint: 'line',
  bluff: 'cliff',
  bluffLip: 'cliffLip',
  box: 'placeholder',
  boxHot: 'placeholder',
};

/** 亮档要除掉多少太阳色（1 = 一点不染）：水面亮处是天光 */
export const SUN_SKIP: Partial<Record<keyof Pal, number>> = {
  ...POOL_SUN_SKIP,
  lagoon: 0.8,
  washBed: 1,
  road: 0.8,
  courtOut: 0.6,
  courtIn: 0.6,
  practiceIn: 0.7,
  practiceOut: 0.7,
  stepStone: 0.6,
};

/** 大面的元素预设（材质规范 v2）：一开始就照"大块安静"画——块大、缝浅、撒的细节少 */
export const EL = {
  /** 沙漠地面：几乎纯色，只有低频的深浅斑（比 EL.sand 的沙纹少一个数量级） */
  floor: { kind: 'ripples', size: [14, 4], density: [0.008, 0.1], patch: 4, mottle: 0, pebbles: 0.01 },
  mesa: { kind: 'ripples', size: [16, 5], density: [0.002, 0.03], patch: 6, mottle: 0, pebbles: 0.004, seed: 5 },
  /** 干河床：大块鹅卵石，缝浅 */
  wash: { kind: 'stones', size: [26, 14], seam: 0.4, hi: 0.25 },
  /** 崖壁：岩层（墙 uv） */
  bluff: { kind: 'strata', space: 'wall', size: [14, 5], hi: 0.6, q: [9, 18, 0, 0], attr: true },
  /** 步道：踩实的土，碎石少 */
  path: { kind: 'pebbles', size: [12, 7], seam: 0.5, density: [0.01, 0.08], patch: 3, pebbles: 0.04 },
  /** 主路：土团大、缝浅，几乎不撒 */
  trail: { kind: 'pebbles', size: [16, 8], seam: 0.4, density: [0.005, 0.04], patch: 4, pebbles: 0.02 },
  water: { kind: 'water', attr: true },
} as const satisfies Record<string, Elem>;
