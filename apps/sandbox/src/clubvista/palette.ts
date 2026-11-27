// clubvista 的调色板 = 餐车院子（clubfood：广场 + 前台 + clubmap2 的整张表）+ 泳池（clubpool）+ 会员场（clubcourts）+ 中心球场（clubstadium）
// 的超集（只读 import，复用它们的资产时颜色一个不差）+ 这张"分图地图"新加的地面（VISTA）。
// 新材质照 clubsite/render/palette.ts 的规则手挑：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝、亮边差 15～30（< 60）；
// 暗档换冷色相（不是亮档乘系数）。L = 0.2126R + 0.7152G + 0.0722B，S = HSV 饱和度。
// 《垂钓手记》的整屏规则（~/workspace/tennis-director-refs/club-redo/brief/analysis.md）：大面安静（元素少、缝浅、块大），
// 受光暖、背光冷，冷的大面（球场、池水、干河床、马路）放在每张图最低的那层。

import { PAL as CLAY_PAL } from '../clubclay/palette';
import { GROUP_AS as COURTS_AS, PAL as COURTS_PAL } from '../clubcourts/palette';
import { PAL as FOOD_PAL, PROXY as FOOD_PROXY } from '../clubfood/palette';
import { PAL as GOLF_PAL, PROXY as GOLF_PROXY } from '../clubgolf/palette';
import { PAL as HOUSE_PAL, PROXY as HOUSE_PROXY } from '../clubhouse/palette';
import { PAL as PARK_PAL } from '../clubpark/palette';
import { PAL as PICKLE_PAL } from '../clubpickle/palette';
import { PAL as PLAZA_PAL, PROXY as PLAZA_PROXY } from '../clubplaza/palette';
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
    [0xf0c07c, 0xc89a8a, 0x77729a],
    0.05,
    0,
    tn(
      [0xf0c07c, 0xf4c888, 0xe8b670], // L 198 / 206 / 189（S 0.48：奶油一点的沙，不抢焦点的暖色）
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
    [0x9298bc, 0x70749e, 0x46487c],
    0.05,
    0,
    tn(
      [0x9298bc, 0x989ec2, 0x8c92b6], // L 154 / 160 / 148（比沙暗一截的冷灰卵石，S 0.22：读成干的石头不是水，第 6 轮）
      [0x6c74a6, 0x7078aa, 0x6870a2], // L 118 / 122 / 114
      [0x434680, 0x474a84, 0x3f427c], // L 72 / 76 / 68
      [0x8690bc, 0x666ea0, 0x3e4178], // 缝只差 6～8：几乎看不见
      [0xa0aad2, 0x7a82b2, 0x50548e],
    ),
  ),
  /** 马路沥青（图的南边界）：冷石板灰（L 132，色相 230°），暗档靛灰 */
  road: s(
    [0x6e88c0, 0x5a6ca4, 0x3c4680],
    0.05,
    0,
    tn(
      [0x6e88c0, 0x7690c6, 0x6680b8], // L 133 / 141 / 125（S 0.43，冷石板蓝）
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
    [0x46a05c, 0x348054, 0x388d76],
    0.05,
    0,
    tn(
      [0x46a05c, 0x4ea864, 0x3e9654], // L 130（美网那种绿外场；第二轮第 3 轮 S 0.49 → 0.56：整屏饱和度差 0.01）
      [0x348054, 0x3a885c, 0x2e764c], // L 104
      [0x388d76, 0x3e957c, 0x328570], // L 120（第 4 轮：草上的影子是青绿 #388d76，原来 L 75 近黑）
      [0x46905e, 0x367252, 0x284c50],
      [0x6ab07e, 0x52966e, 0x3c6a68],
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
  stepStone: s([0xb4b0c4, 0x8e88a8, 0x5e5a86], 0.3, 0.3), // L 177：比沙暗一点的灰石（第 5 轮：原来 L 210 的浅灰是全屏最亮的条）
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
  /**
   * 铺地（廊道、广场、池边、露台）：flagstone 压暗 ~15 级、彩度不降（第 2 轮评判：两大片浅米色是最大的平面、暖色超标），
   * 暗档同 flagstone 的冷紫。块大、缝浅（EL.flag）。
   */
  paving: s(
    [0xd8a470, 0xb47c6c, 0x6c6886],
    0.1,
    0.05,
    tn(
      [0xd8a470, 0xdeae7a, 0xcc9a66], // L 178（第 3 轮：再压一档、往陶土沙色走，和米白伞拉开；彩度 0.48）
      [0xb47c6c, 0xbc8674, 0xa87264], // L 143
      [0x6c6886, 0x74708e, 0x66627e], // L 106（第 4 轮：铺地上的影子是中明度冷灰紫 #686880，不是墨水坑的深紫）
      [0xd2b088, 0xa88478, 0x624a84],
      [0xf2d8b0, 0xd4b0a0, 0x9478ae],
    ),
  ),
  /** 会所屋顶：陶土褐（红瓦降彩度，第 2 轮评判：一整条通栏最饱和的暖色） */
  roofClay: s(
    [0xc4866c, 0x8e5a60, 0x4e3a5e],
    0.4,
    0.3,
    tn(
      [0xc4866c, 0xcc9074, 0xb87c64], // L 146
      [0x8e5a60, 0x966268, 0x845258], // L 104
      [0x4e3a5e, 0x564266, 0x463456], // L 66
      [0xa86c5c, 0x784a54, 0x3e2e50],
      [0xdca084, 0xac7270, 0x6a5478],
    ),
  ),
  /** 边看台的遮阳篷：灰蓝（第 3 轮评判：俱乐部蓝和场面的蓝连成一片） */
  awning: s([0x6a88c4, 0x546ca6, 0x42528a], 0.3, 0),
  /** 看台座椅：低反差的冷灰紫（空场时安静，不抢球场） */
  seatCalm: s([0x8478dc, 0x6458c0, 0x463a98], 0.15, 0.2),
  /** 露台的伞：接近纯白（和铺地拉开），暗档冷灰紫 */
  parasolWhite: s([0xf3ede2, 0xcdc2cc, 0x8a80a2], 0.4, 0.35),
  /** 看台踏面、走道：中灰紫一档（第 4 轮） */
  treadMid: s([0x9a92b4, 0x8a86a0, 0x6c6886], 0.1, 0.2),
  /** 池边一圈浅米石（偏冷，和露台的陶土色分开；第 4 轮） */
  poolStone: s([0xeadcc4, 0xc8b8b8, 0x7a7896], 0.1, 0.05),
  /** 歇脚的小路：浅一档的灰沙（第 4 轮：露台、池边、小路是同一种陶土橙，糊成一团） */
  gravel: s([0xdcc6a2, 0xb4a49c, 0x6e6a8a], 0.08, 0),
  /** 白模：占位体块（冷灰，按高度一档档） */
  box: s([0xd8d6e4, 0xa8a4c0, 0x6a6690], 0.6, 0.5),
  /** 白模：占位体块的主角色（每张图一个最鲜艳的暖色：入口的车、前台的帆、泳池的伞……） */
  boxHot: s([0xff8a5c, 0xd85a5a, 0x7a3a6a], 0.6, 0.5),
} as const satisfies Record<string, Swatch>;

// 第三轮：内场剩下的地方也改成分图 —— 红土、匹克球、广场、停车场、高尔夫的表也并进来（它们的资产只读复用时颜色一个不差）。
// 后面的盖前面的：原来四张图用到的表（会所、餐车、泳池、会员场、中心球场）排在后面，同名的条目不变。
export const PAL = {
  ...PARK_PAL,
  ...CLAY_PAL,
  ...PICKLE_PAL,
  ...PLAZA_PAL,
  ...GOLF_PAL,
  ...HOUSE_PAL,
  ...FOOD_PAL,
  ...POOL_PAL,
  ...COURTS_PAL,
  ...STADIUM_PAL,
  ...VISTA,
} as const;
export type Pal = typeof PAL;

/** 新材质借哪个名字过配色方案的分组（同 clubpool / clubfood 的 PROXY 做法；方案的 GROUP 表不归这里改） */
export const GRADE_AS: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  ...(GOLF_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  ...(HOUSE_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
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
  paving: 'flagstone',
  roofClay: 'roofTile',
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
  floor: { kind: 'ripples', size: [12, 4], density: [0.05, 0.3], patch: 4, mottle: 0.45, pebbles: 0.04 },
  mesa: { kind: 'ripples', size: [16, 5], density: [0.02, 0.14], patch: 6, mottle: 0.2, pebbles: 0.02, seed: 5 },
  /** 干河床：大块鹅卵石，缝浅 */
  wash: { kind: 'stones', size: [26, 14], seam: 0.4, hi: 0.25 },
  /** 崖壁：岩层（墙 uv） */
  bluff: { kind: 'strata', space: 'wall', size: [14, 5], hi: 0.6, q: [9, 18, 0, 0], attr: true },
  /** 步道：踩实的土，碎石少 */
  path: { kind: 'pebbles', size: [12, 7], seam: 0.5, density: [0.01, 0.08], patch: 3, pebbles: 0.04 },
  /** 主路：土团大、缝浅，几乎不撒 */
  trail: { kind: 'pebbles', size: [16, 8], seam: 0.4, density: [0.005, 0.04], patch: 4, pebbles: 0.02 },
  water: { kind: 'water', attr: true },
  /** 草坪：草叶（亮边色的 1 × 2～4 竖划），3 米斑块 3% → 12%，阴影里照画（同 valley 的 townLawn）——第二轮：平涂的草让平静纹素到 85%+ */
  turf: { kind: 'blades', density: [0.02, 0.12], patch: 3, pebbles: 0.06 },
  /** 练习场的场面：用旧了的刷漆斑（中心球场平涂） */
  courtWear: { kind: 'paint', size: [8, 5], density: [0.01, 0.035], patch: 2.5 },
  /** 石板铺地：大块石板、缝浅（廊道、广场、池边、露台） */
  flag: { kind: 'stones', size: [28, 16], seam: 0.5, hi: 0.3, contrast: [0.45, 0.4, 0.2] },
} as const satisfies Record<string, Elem>;
