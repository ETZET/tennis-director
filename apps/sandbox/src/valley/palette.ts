// valley 的调色板 = clubmap2 的表（PAL）+ 市中心三栋办事楼的新材质（TOWN，2026-11-16 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-town.md）。
// 规则同 clubsite/render/palette.ts 头注（material-spec.md）：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝、亮边差 15～30（< 60）；
// 大面积亮面的亮档低一级 ≥ 170，暗档高一级 ≤ 120；暗档往冷（靛、紫、深青）走，不是亮档乘系数。L = 0.2126R + 0.7152G + 0.0722B。
// 归组：新材质不在 clubsite/render/palettes 的 GROUP 里 → PROXY 借一个同组的老材质名过午后调色（ctx.mat(PROXY[key], 本材质的参数)）。
// 用法：场景里 valleyMat(底图 ctx, key)（build.ts 的 DetailCtx.mat 已经走它），画廊 / 资产里 ctx.mat(key)（ctx.ts 的 AssetCtx）。
import { EL as MAP_EL, PAL as MAP_PAL } from '../clubmap2/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones, ToonOpts } from '../clubsite/render/toon';
import type { MapCtx } from './reuse';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones: Tones, opts?: ToonOpts): Swatch => ({
  ramp,
  edge,
  convex,
  tones,
  ...(opts ? { opts } : {}),
});
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级]；缝、亮边是三档各一个 */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 很薄的布、网（遮阳网）：不接收投影（阴影毛边落在薄片上是麻点） */
const THIN: ToonOpts = { noShadowReceive: true };

/**
 * 朝南立面上的招牌、字、太阳牌（立面永远在暗档 → 亮色变褐 / 靛）：光往上偏 + 低档位线 → 落中档（资产代理的经验 0.5～0.65 / [−0.45, 0.3]）。
 * 资产里 ctx.mat('sunEnamel', SIGN_FACE)。
 */
export const SIGN_FACE: ToonOpts = { lightUp: 0.55, bands: [-0.4, 0.3], noShadowReceive: true };

/** 市中心三栋楼的新材质（原值 = 午后金光调色之前；后面的 L 是本色 / 高一级 / 低一级） */
const TOWN = {
  /** 五金大超市的墙：暖沙粉的预制混凝土板（tilt-up，6 米一块竖缝）；暗档梅紫（同 adobe 一家） */
  tiltup: s(
    [0xe8c4a4, 0xc89a90, 0x6c5a8c],
    0.4,
    0.3,
    tn(
      [0xe8c4a4, 0xf2d0b0, 0xdcb898], // L 201 / 213 / 189
      [0xc89a90, 0xd2a69a, 0xbc8e86], // L 163 / 174 / 151
      [0x6c5a8c, 0x766496, 0x625082], // L 97 / 107 / 87
      [0xceaa8a, 0xaa827e, 0x4c4072], // 缝 −26 / −25 / −27
      [0xfadcc0, 0xdcb2a4, 0x8a76aa], // 亮边 +23 / +23 / +29
    ),
  ),
  /**
   * 五金大超市的主色一：芥末黄（用户 2026-11-16 定：芥末黄 + 深海军蓝，不用青绿 —— 青绿是俱乐部的颜色）。
   * 女儿墙带、海军蓝牌子上的字、防撞桩以外的黄。几乎都贴在朝南的立面上（永远暗档）→ 默认带 SIGN_FACE，立面上落中档（赭黄 #c48a26，
   * 不是暗档的梅褐）；朝上的面（屋顶上的东西）要真的亮档就 ctx.mat('hwMustard', { lightUp: 0, bands: [0.1, 0.5], noShadowReceive: false })。
   * 暗档往梅褐走（同 flowerYellow 的暗档一家）。S 0.79
   */
  hwMustard: s(
    [0xe8b030, 0xc48a26, 0x745458],
    0.6,
    0.4,
    tn(
      [0xe8b030, 0xf0bc40, 0xdca42a], // L 179 / 190 / 167
      [0xc48a26, 0xce962e, 0xb67e22], // L 143 / 154 / 131
      [0x745458, 0x7e5e60, 0x684a50], // L 91 / 101 / 81
      [0xc8942a, 0x9c6a24, 0x563a44], // 缝 −28 / −31 / −26
      [0xfcd060, 0xe0aa48, 0x926e6c], // 亮边 +30 / +31 / +27
    ),
    SIGN_FACE,
  ),
  /**
   * 五金大超市的主色二：深海军蓝（门头大招牌底、高杆招牌底、厢式货车驾驶室）。比 signBoard（俱乐部蓝 L 106）深、偏紫，
   * 亮档 L 78，上面的芥末黄字差 ~95（字面积小，强边缘只在字上）。暗档往靛紫走。S 0.70
   */
  hwNavy: s(
    [0x2f5096, 0x243a74, 0x1c2450],
    0.6,
    0.4,
    tn(
      [0x2f5096, 0x3a5ca4, 0x284888], // L 78 / 90 / 70
      [0x243a74, 0x2c447e, 0x1e326a], // L 58 / 67 / 50
      [0x1c2450, 0x242c5a, 0x181e46], // L 38 / 46 / 32
      [0x1f3a72, 0x18285a, 0x121838], // 缝 −22 / −18 / −13
      [0x4a6cb2, 0x3c5694, 0x34406e], // 亮边 +28 / +27 / +27
    ),
  ),
  /** 园艺棚的花砖墙（breeze block，棕榈泉中世纪现代）：奶油白，格心的洞 = 缝色（比规则深，但 < 60） */
  breezeBlock: s(
    [0xf6e4c8, 0xd8b4a4, 0x7c6492],
    0.3,
    0.3,
    tn(
      [0xf6e4c8, 0xfdeed6, 0xecd8ba], // L 230 / 239 / 218
      [0xd8b4a4, 0xe0c0b0, 0xcca896], // L 186 / 198 / 174
      [0x7c6492, 0x866e9c, 0x725a88], // L 108 / 118 / 98
      [0xd4b4a0, 0xb08c8c, 0x5a4878], // 缝 −45 / −38 / −29（花砖的洞）
      [0xfff4e0, 0xead0c0, 0x9a84b2], // 亮边 +15 / +26 / +32
    ),
  ),
  /** 园艺棚的遮阳网（深绿网布，薄 → 不接收投影） */
  shadeCloth: s(
    [0x5d9a6a, 0x3f7a62, 0x24485a],
    0.3,
    0.1,
    tn(
      [0x5d9a6a, 0x68a674, 0x528e60], // L 138 / 149 / 126
      [0x3f7a62, 0x48846a, 0x366e5a], // L 108 / 117 / 97
      [0x24485a, 0x2b5264, 0x1f3f52], // L 66 / 75 / 58
      [0x3a6e52, 0x2c5a50, 0x18324a], // 缝 −41 / −29 / −20
      [0x7cb67e, 0x5a9474, 0x3a6274], // 亮边 +28 / +25 / +25
    ),
    THIN,
  ),
  /** 太阳报的太阳牌、送报车标：橙黄搪瓷（市中心最暖的一个圆）；朝镜头那面用 SIGN_FACE */
  sunEnamel: s(
    [0xffb43c, 0xec7c38, 0x8a3a5a],
    0.6,
    0.6,
    tn(
      [0xffb43c, 0xffc252, 0xf4a632], // L 187 / 199 / 174
      [0xec7c38, 0xf48a42, 0xde6e32], // L 143 / 155 / 129
      [0x8a3a5a, 0x964666, 0x7c3050], // L 77 / 89 / 66
      [0xd88a2c, 0xc05e30, 0x5e2448], // 缝 −39 / −31 / −26
      [0xffd27a, 0xfca05e, 0xb05a78], // 亮边 +26 / +32 / +33
    ),
  ),
  /** 新闻纸：纸卷、报捆、报头字底 */
  newsprint: s(
    [0xf0eade, 0xcfc4c6, 0x6c6690],
    0.5,
    0.6,
    tn(
      [0xf0eade, 0xf8f2e8, 0xe6dfd0], // L 234 / 243 / 223
      [0xcfc4c6, 0xd8cdd0, 0xc4b8bc], // L 198 / 208 / 187
      [0x6c6690, 0x746e98, 0x625c86], // L 106 / 114 / 96
      [0xd2c8b8, 0xaa9ea8, 0x4a446e], // 缝 −33 / −37 / −34
      [0xfffaf0, 0xe6dce0, 0x8882ae], // 亮边 +16 / +24 / +28
    ),
  ),
  /** 压型金属屋面：锯齿顶、五金屋面分格、卸货台雨棚（中性灰，court 组不被染黄） */
  roofMetal: s(
    [0xd0d2d0, 0xa4a6b4, 0x5c6080],
    0.3,
    0.5,
    tn(
      [0xd0d2d0, 0xdadcda, 0xc4c6c6], // L 209 / 219 / 198
      [0xa4a6b4, 0xaeb0bc, 0x9a9caa], // L 167 / 176 / 157
      [0x5c6080, 0x666a8a, 0x545876], // L 97 / 107 / 89
      [0xb2b4b4, 0x888aa0, 0x42465e], // 缝 −29 / −28 / −26
      [0xeef0ec, 0xc4c6d0, 0x7a7ea0], // 亮边 +30 / +31 / +31
    ),
  ),
  /** 牛皮纸袋（袋装沙）、纸箱 */
  kraft: s(
    [0xe8b878, 0xc48a62, 0x6c4c74],
    0.4,
    0.4,
    tn(
      [0xe8b878, 0xf2c486, 0xdcac6c], // L 190 / 201 / 178
      [0xc48a62, 0xce966c, 0xb87e58], // L 147 / 159 / 136
      [0x6c4c74, 0x76567e, 0x624268], // L 86 / 96 / 76
      [0xc69a5e, 0xa26e56, 0x4c3458], // 缝 −31 / −28 / −26
      [0xfcd49a, 0xdca480, 0x8a6a94], // 亮边 +26 / +26 / +30
    ),
  ),
  /** 白塑料：灌溉管、线漆桶、丙烷罐 */
  pvc: s(
    [0xf0f0ea, 0xc4c0cc, 0x6a6692],
    0.5,
    0.8,
    tn(
      [0xf0f0ea, 0xf8f8f4, 0xe4e4de], // L 240 / 248 / 228
      [0xc4c0cc, 0xceccd6, 0xb8b4c2], // L 194 / 205 / 182
      [0x6a6692, 0x726e9a, 0x605c88], // L 106 / 114 / 96
      [0xd2d2cc, 0xa29eb0, 0x484470], // 缝 −30 / −34 / −34
      [0xffffff, 0xdcdae2, 0x8a86b0], // 亮边 +15 / +25 / +32
    ),
  ),
  /** 白车身：送报车、厢式货车、皮卡 */
  truckWhite: s(
    [0xf6f2ea, 0xcdc6d2, 0x6c6a94],
    0.6,
    0.6,
    tn(
      [0xf6f2ea, 0xfdfaf4, 0xeae4da], // L 242 / 250 / 229
      [0xcdc6d2, 0xd6d0dc, 0xc2bac8], // L 200 / 210 / 189
      [0x6c6a94, 0x74729c, 0x62608a], // L 109 / 117 / 99
      [0xd6d0c6, 0xaaa2b4, 0x4a4872], // 缝 −33 / −35 / −34
      [0xffffff, 0xe6e0ea, 0x8a88b2], // 亮边 +13 / +26 / +30
    ),
  ),
  /**
   * 黑板（人字小黑板 a-board 的板面：报社"今日头条"、体育店的特价）：同 clubdesk 的 slate（深青灰，暖色世界里一块冷的暗面），
   * 粉笔字用 signPaint（暗档也亮）。归 club 组（亮档不被染成灰绿、暗档留青蓝）
   */
  slate: s(
    [0x4e7a72, 0x3a5a62, 0x26384e],
    0.5,
    0.3,
    tn(
      [0x4e7a72, 0x56847a, 0x46706a], // L 112 / 122 / 103
      [0x3a5a62, 0x42646a, 0x34525a], // L 84 / 93 / 76
      [0x26384e, 0x2c4056, 0x223246], // L 54 / 61 / 48
      [0x3c625c, 0x2c4850, 0x1a283c], // 缝 −22 / −17 / −15
      [0x6e9a8c, 0x56787c, 0x3a4e66], // 亮边 +31 / +29 / +22（黑板框的上沿）
    ),
  ),
  // ── 第二批办事地点（2026-11-18，docs/lab/2026-11-07-3d-pixel/valley-civic.md）──
  /** 市政厅：沙色的立面板、挑檐、雨棚顶、钟塔立板（中世纪现代；暗档梅紫）S 0.38 */
  civicSand: s(
    [0xe8c890, 0xc49c7c, 0x6c5a86],
    0.4,
    0.3,
    tn(
      [0xe8c890, 0xf2d49e, 0xdcbc84],
      [0xc49c7c, 0xcea886, 0xb89072],
      [0x6c5a86, 0x766490, 0x62507c],
      [0xcca870, 0xa07c70, 0x4c4070], // 缝
      [0xfce0ac, 0xdcb898, 0x8c78a8], // 亮边
    ),
  ),
  /** 市政厅：立面的金属管格栅、旗杆顶球（convex 高，出圆柱的明暗）S 0.59 */
  pipeGold: s(
    [0xe2b45c, 0xb8884c, 0x5e4a6e],
    0.5,
    0.8,
    tn(
      [0xe2b45c, 0xeec06a, 0xd6a650],
      [0xb8884c, 0xc49456, 0xaa7c44],
      [0x5e4a6e, 0x685478, 0x544064],
      [0xc2963e, 0x966440, 0x3e3054], // 缝
      [0xfcd488, 0xd8a864, 0x806a92], // 亮边
    ),
  ),
  /** 银行：遮阳片、铜字、门框、夜间存款口、雨棚封檐（立面上的字 / 板带用 SIGN_FACE）S 0.55 */
  bankBronze: s(
    [0xc8925a, 0x9a6a4a, 0x4e3c58],
    0.6,
    0.5,
    tn(
      [0xc8925a, 0xd29e64, 0xbc8650],
      [0x9a6a4a, 0xa47452, 0x8e6042],
      [0x4e3c58, 0x584462, 0x46344e],
      [0xa8744a, 0x7a5040, 0x342840], // 缝
      [0xe2ac72, 0xb88660, 0x6a5474], // 亮边
    ),
  ),
  /** 银行：叠石墙、花池、招牌石座（灰缝比规则深、< 60，同 breezeBlock 的洞）S 0.23 */
  desertStone: s(
    [0xc4ae96, 0x9a8682, 0x564c6c],
    0.4,
    0.3,
    tn(
      [0xc4ae96, 0xceb8a0, 0xb8a28a],
      [0x9a8682, 0xa4908a, 0x907c78],
      [0x564c6c, 0x605676, 0x4c4262],
      [0x9a8470, 0x6e5e64, 0x3a3250], // 缝
      [0xe0ccb0, 0xb8a49c, 0x76698c], // 亮边
    ),
  ),
  /** 餐馆：屋顶封檐、高杆、主牌底、软木板抬头（不用青绿 —— 俱乐部的颜色）。朝南的牌子用 SIGN_FACE。S 0.57 */
  dinerCoral: s(
    [0xf4866a, 0xd4605a, 0x7c3e62],
    0.6,
    0.4,
    tn(
      [0xf4866a, 0xfa9276, 0xea7a60],
      [0xd4605a, 0xdc6c62, 0xc85852],
      [0x7c3e62, 0x864868, 0x703658],
      [0xd86a50, 0xb04a4c, 0x5a2c4c], // 缝
      [0xffa888, 0xec8070, 0x9a5a7a], // 亮边
    ),
  ),
  /** 餐馆：店堂水磨石地（白格）、门前台阶面 S 0.15 */
  terrazzo: s(
    [0xefe2cc, 0xcdbcb4, 0x6e6488],
    0.3,
    0.2,
    tn(
      [0xefe2cc, 0xf7ead6, 0xe4d6c0],
      [0xcdbcb4, 0xd6c6be, 0xc2b0aa],
      [0x6e6488, 0x786e92, 0x645a7e],
      [0xd6c4b0, 0xb2a2a2, 0x504870], // 缝
      [0xfff6e6, 0xe2d2ca, 0x8c82aa], // 亮边
    ),
  ),
  /** 学校：教学楼、体育馆的混凝土砌块墙（冷灰，和市中心暖沙的灰泥拉开）S 0.02 */
  cmuGrey: s(
    [0xcfd2d4, 0xa9aab8, 0x5e6282],
    0.4,
    0.3,
    tn(
      [0xcfd2d4, 0xd8dbdd, 0xc4c7cb],
      [0xa9aab8, 0xb2b3c0, 0x9fa0ae],
      [0x5e6282, 0x686c8c, 0x565a78],
      [0xb6b9be, 0x9294a4, 0x4a4e6c], // 缝
      [0xe6e8ea, 0xc0c2ce, 0x767a9a], // 亮边
    ),
  ),
  /** 学校校色一：酒红（女儿墙带、门、储物柜、帐篷、记分牌；几乎都在朝南立面上 → 默认 SIGN_FACE）S 0.69 */
  schoolMaroon: s(
    [0x9c3046, 0x7a2440, 0x46203e],
    0.6,
    0.4,
    tn(
      [0x9c3046, 0xa83a50, 0x8e283e],
      [0x7a2440, 0x842c48, 0x6e1e38],
      [0x46203e, 0x4e2846, 0x3e1a36],
      [0x7e2236, 0x5a1830, 0x30142c], // 缝
      [0xc0506a, 0x9c4060, 0x643a5c], // 亮边
    ),
    SIGN_FACE,
  ),
  /** 学校校色二：浅金（校名字、记分牌的分、校旗金条；SIGN_FACE）S 0.54 */
  schoolGold: s(
    [0xcbb85e, 0xa69454, 0x645a66],
    0.5,
    0.3,
    tn(
      [0xcbb85e, 0xd6c46c, 0xbead52],
      [0xa69454, 0xb09e5e, 0x9a884a],
      [0x645a66, 0x6e646e, 0x5a505c],
      [0xb09c50, 0x8c7646, 0x4c4250], // 缝
      [0xe6d488, 0xc8b076, 0x867a86], // 亮边
    ),
    SIGN_FACE,
  ),
  /** 学校：前庭（3.5 米分格）、练习墙、连廊下的路（中性，不被午后金光染黄）S 0.05 */
  campusConcrete: s(
    [0xe2ded6, 0xbcb8c0, 0x6a6a88],
    0.2,
    0.1,
    tn(
      [0xe2ded6, 0xeae6de, 0xd8d4cc],
      [0xbcb8c0, 0xc6c2ca, 0xb2aeb8],
      [0x6a6a88, 0x747492, 0x62627e],
      [0xc4c0b8, 0x9e9aa8, 0x50506e], // 缝
      [0xf4f0e8, 0xd4d0d8, 0x86869e], // 亮边
    ),
  ),
  /** 学校：屋顶太阳能板、停车场太阳能车棚 S 0.56 */
  solarBlue: s(
    [0x4a6aa8, 0x34508a, 0x22305a],
    0.3,
    0.3,
    tn(
      [0x4a6aa8, 0x5676b4, 0x3e5e9c],
      [0x34508a, 0x3c5a94, 0x2c4680],
      [0x22305a, 0x283864, 0x1c2a50],
      [0x3a5890, 0x283e70, 0x161e40], // 缝
      [0x6888c0, 0x5a78b0, 0x3c4a78], // 亮边
    ),
  ),
} as const satisfies Record<string, Swatch>;

export type TownKey = keyof typeof TOWN;
export const TOWN_KEYS = Object.keys(TOWN) as TownKey[];

/**
 * 新材质借谁的组过午后调色（clubsite/render/palettes 的 GROUP）。借的老材质不能有 opts（不然它的 lightUp 之类会漏进来；valley.test.ts 查）：
 * wall = concrete、club = signBoard（冷色不被染成薰衣草）、plants = lawn、accent = flowerYellow、court = surround、不归组（只吃全局调色）= stucco
 */
export const PROXY = {
  tiltup: 'concrete',
  hwMustard: 'flowerYellow',
  hwNavy: 'signBoard',
  breezeBlock: 'concrete',
  shadeCloth: 'lawn',
  sunEnamel: 'flowerYellow',
  newsprint: 'stucco',
  roofMetal: 'surround',
  kraft: 'flowerYellow',
  pvc: 'stucco',
  truckWhite: 'flowerYellow',
  slate: 'signBoard',
  civicSand: 'concrete',
  pipeGold: 'flowerYellow',
  bankBronze: 'flowerYellow',
  desertStone: 'concrete',
  dinerCoral: 'flowerYellow',
  terrazzo: 'stucco',
  cmuGrey: 'concrete',
  schoolMaroon: 'flowerYellow',
  schoolGold: 'flowerYellow',
  campusConcrete: 'surround',
  solarBlue: 'signBoard',
} as const satisfies Record<TownKey, keyof typeof MAP_PAL>;

/**
 * 新材质的元素图案（材质规范 v2）：大面积的面才给。build.ts 的 ELEM 合进去（put 进区域桶的几何按这个画），资产里 ctx.mat(key, { elem: TOWN_EL.x }) 自己选。
 * - tiltup：6 米一块的竖缝（planks 沿 x 每 6 米一条）+ 低频深浅斑
 * - breezeBlock：每 4×4 纹素一格、格缝 1 纹素（先借 stones 顶上，不加新 kind；资产要真的"格心是洞"就在几何上挖）
 * - shadeCloth：大块的布纹斑（paint）
 * - roofMetal：压型板，每 0.45 米一条缝
 * - kraft：一袋一块（横向，每 0.18 米一条缝）
 */
export const TOWN_EL = {
  tiltup: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 6], mottle: 0.3 },
  breezeBlock: { kind: 'stones', size: [4, 4], seam: 1, hi: 0.5 },
  shadeCloth: { kind: 'paint', size: [10, 6] },
  roofMetal: { kind: 'planks', seam: 1, hi: 0.5, p: [1, 0, 0, 0.45] },
  kraft: { kind: 'planks', seam: 1, hi: 0.5, p: [0, 1, 0, 0.18] },
  // 第二批（2026-11-18）
  civicSand: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 3] },
  desertStone: { kind: 'stones', size: [6, 3], seam: 1, hi: 0.4 },
  terrazzo: { kind: 'stones', size: [2, 2], seam: 1, hi: 0.3 },
  cmuGrey: { kind: 'stones', size: [4, 2], seam: 1, hi: 0.3 },
  solarBlue: { kind: 'planks', seam: 1, hi: 0.4, p: [1, 0, 0, 1] },
} satisfies Partial<Record<TownKey, Elem>>;

export const PAL = { ...MAP_PAL, ...TOWN } as const;
export type Pal = typeof PAL;
export type PalKey = keyof Pal;
export const EL = MAP_EL;

const isTown = (key: PalKey): key is TownKey => key in TOWN;

/** 调色时用哪个材质名归组：新材质 → PROXY，老材质 → 自己 */
export function gradeKey(key: PalKey): keyof typeof MAP_PAL {
  return isTown(key) ? PROXY[key] : key;
}

/** 调色板里这一条 + extra → 材质参数（同 clubwalk mapOpts 的合法：ramp / edge / convex / tones / opts，再盖 extra） */
export function swatchOpts(key: PalKey, extra?: ToonOpts): ToonOpts {
  const sw = PAL[key] as Swatch;
  return {
    ramp: sw.ramp,
    edge: sw.edge,
    convex: sw.convex,
    tones: sw.tones,
    ...(sw.opts ?? {}),
    ...extra,
  };
}

/**
 * 底图 ctx（clubwalk 的 mapCtx，只认 clubmap2 的表）上拿 valley 的材质：老材质原样（一个字节不变），
 * 新材质 = ctx.mat(借的组, 本材质的全部参数)（extra 盖掉借的那条的 ramp / tones / edge / convex，调色按借的组）
 */
export function valleyMat(ctx: MapCtx, key: PalKey, extra?: ToonOpts) {
  if (!isTown(key)) return ctx.mat(key, extra);
  return ctx.mat(PROXY[key], swatchOpts(key, extra));
}
