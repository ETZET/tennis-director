// valley 的调色板 = clubmap2 的表（PAL）+ 市中心三栋办事楼、日出公园的新材质（TOWN，2026-11-16 美术关卡 2，docs/lab/2026-11-07-3d-pixel/valley-town.md）。
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
  /**
   * 五金大超市的墙：暖沙粉的预制混凝土板（tilt-up，6 米一块竖缝）；暗档梅紫（同 adobe 一家）。
   * 2026-11-21：中档、暗档饱和一点（亮度不动）—— 朝南的墙永远落暗档，门口一屏中午饱和度 0.34 < 0.35
   */
  tiltup: s(
    [0xe8c4a4, 0xd28e7e, 0x74489a],
    0.4,
    0.3,
    tn(
      [0xe8c4a4, 0xf2d0b0, 0xdcb898], // L 201 / 213 / 189
      [0xd28e7e, 0xdc9a8a, 0xc68474],
      [0x74489a, 0x7e54a4, 0x6a408e],
      [0xceaa8a, 0xb4766e, 0x54347a], // 缝
      [0xfadcc0, 0xe4a898, 0x9668b6], // 亮边
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
  // 2026-11-21：中档、暗档带一点玫瑰（亮度不动）—— 正门前庭大半在连廊的影子里，一屏中午饱和度 0.349 < 0.35
  // 2026-11-21 核心调色板（小镇压紧 · 关卡 2）：暗档推到玫瑰冷紫 #664a8c（调完 #5a5075 L 85、S 0.32；原 #6c6490 调完 L 105、S 0.27）——
  // 午后暗档封顶 OKLCH C 0.06，同彩度下只有压一点亮度 S 才上得去；元素 TOWN_EL.campusConcrete（1.6 米一道缝）
  campusConcrete: s(
    [0xe2ded6, 0xc0b4bc, 0x664a8c],
    0.2,
    0.1,
    tn(
      [0xe2ded6, 0xebe7df, 0xd7d3cb], // L 222 / 231 / 211
      [0xc0b4bc, 0xc9bdc5, 0xb5a9b1], // L 183 / 192 / 172
      [0x664a8c, 0x6f5395, 0x583f87], // L 85 / 94 / 74
      [0xcbc8c2, 0xada2ac, 0x533b85], // 缝 −22 / −18 / −16
      [0xf4f0e8, 0xd2c6ce, 0x765a9c], // 亮边 +18 / +18 / +16
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
  // ── 日出公园（2026-11-18 公园关卡 1，用户选"褪色红绿"；docs/lab/2026-11-07-3d-pixel/valley-park.md）──
  /**
   * 公共球场内场：偏冷、偏暗的市政绿（2026-11-18 美术返工 G4：原来的 #70bc84 画面 #92be7d 和草地 #8ab044 只差 16 个亮度、色相都是黄绿，
   * 总览里几乎看不见 → 往青绿、往暗走：画面约 #589877，比草暗 ~22、色相差 ~65°（低一级也留在第 5 档亮度，暗带才单独成一个峰）；俱乐部是饱和青蓝 #22b0d5（S 0.84、195°），这里 S 0.6、≈ 165°）。
   * 漆面斑块（paint）只差约 6 个亮度（material-spec「沙漠移植」：远看不花，原来 ±10～12 像迷彩）；暗档往冷石板蓝走
   */
  muniCourt: s(
    [0x3ba089, 0x2e7c78, 0x2a4f66],
    0.03,
    0.03,
    tn(
      [0x3ba089, 0x3ea78f, 0x389983], // L 137 / 143 / 131
      [0x2e7c78, 0x31837f, 0x2b7571], // L 107 / 113 / 101
      [0x2a4f66, 0x2d566e, 0x27485e], // L 73 / 79 / 67
      [0x328874, 0x266764, 0x203d4e], // 缝 −20 / −18 / −17
      [0x46bda2, 0x399994, 0x386988], // 亮边 +25 / +25 / +24
    ),
  ),
  /** 公共球场外场、场间：褪色的铁锈红（斑块 ±6，同内场） */
  muniOuter: s(
    [0xc4806a, 0xa0645e, 0x5c4060],
    0.03,
    0.03,
    tn(
      [0xc4806a, 0xcc856f, 0xbc7b65], // L 141 / 147 / 135
      [0xa0645e, 0xa96963, 0x975f59], // L 112 / 118 / 106
      [0x5c4060, 0x644568, 0x543b58], // L 72 / 78 / 66
      [0xae6c5a, 0x8a5254, 0x4a3254], // 缝 −20 / −18 / −15
      [0xdc9c82, 0xb87a70, 0x765878], // 亮边 +27 / +22 / +24
    ),
  ),
  /** 公共球场上重新补过的漆：比内场新一点、亮一点、偏绿一点（跟着内场往冷、往暗走；补丁本身就是元素，平涂） */
  muniPatch: s(
    [0x4cae8e, 0x3a8a80, 0x30586c],
    0.03,
    0.03,
    tn(
      [0x4cae8e, 0x50b694, 0x48a688], // L 150 / 157 / 143
      [0x3a8a80, 0x3e9286, 0x36827a], // L 119 / 126 / 113
      [0x30586c, 0x346074, 0x2c5066], // L 81 / 88 / 74
      [0x3e967a, 0x2e706c, 0x244456], // 缝 −20 / −20 / −16
      [0x5ccaa6, 0x48a69a, 0x3e7290], // 亮边 +25 / +23 / +25
    ),
  ),
  /** 晒褪的旧绿挡风布、市政铁件（长椅腿、垃圾桶）；薄 → 不接收投影 */
  windscreenOld: s(
    [0x6f8f5e, 0x4f6f56, 0x2c4250],
    0.3,
    0.1,
    tn(
      [0x6f8f5e, 0x7a9a68, 0x668654], // L 133 / 144 / 124
      [0x4f6f56, 0x58785e, 0x47664e], // L 102 / 111 / 94
      [0x2c4250, 0x324a58, 0x273a48], // L 62 / 70 / 55
      [0x5a7a4c, 0x42604c, 0x1e3040], // 缝 −21 / −14 / −17
      [0x8cab72, 0x6a8a66, 0x44606a], // 亮边 +28 / +26 / +28
    ),
    THIN,
  ),
  /** 镀锌铁丝网带（围网上沿，不画网眼）、灯杆 */
  chainLink: s(
    [0xa7b2b4, 0x7e8a98, 0x474e6a],
    0.4,
    0.4,
    tn(
      [0xa7b2b4, 0xb2bcbe, 0x9ca8aa], // L 176 / 186 / 166
      [0x7e8a98, 0x8894a0, 0x74808e], // L 136 / 146 / 126
      [0x474e6a, 0x4f5672, 0x404662], // L 79 / 87 / 71
      [0x8c989c, 0x68748a, 0x363c58], // 缝 −26 / −21 / −18
      [0xc4ced0, 0x9ca8b4, 0x5e6684], // 亮边 +28 / +30 / +24
    ),
  ),
  /** 对墙练习墙：灰绿漆的混凝土；朝南那面在资产里加 SIGN_FACE 那套光照（落中档） */
  hitWall: s(
    [0x8fa894, 0x6e8a82, 0x3e5466],
    0.4,
    0.2,
    tn(
      [0x8fa894, 0x9ab29e, 0x86a08a], // L 161 / 171 / 153
      [0x6e8a82, 0x78948a, 0x66807a], // L 131 / 141 / 122
      [0x3e5466, 0x465c6e, 0x384c5e], // L 81 / 89 / 73
      [0x768e7c, 0x56706c, 0x2c3e50], // 缝 −26 / −25 / −21
      [0xacc4ae, 0x8ca69a, 0x56707e], // 亮边 +28 / +28 / +27
    ),
  ),
  /** 市政公园牌、挂拍处木牌的棕 */
  parkBrown: s(
    [0x9a6a46, 0x74504a, 0x3e3050],
    0.5,
    0.4,
    tn(
      [0x9a6a46, 0xa6744e, 0x8e603e], // L 114 / 124 / 103
      [0x74504a, 0x7e5850, 0x6a4844], // L 87 / 96 / 79
      [0x3e3050, 0x463658, 0x382a48], // L 53 / 60 / 47
      [0x7e5436, 0x5c3e3c, 0x2c2240], // 缝 −23 / −19 / −15
      [0xb8865c, 0x946a5c, 0x584870], // 亮边 +28 / +27 / +25
    ),
  ),
  // ── 小镇的地面、屋顶、住宅墙（2026-11-21 小镇压紧 · 关卡 2 核心调色板；critic-material-1 第 1、2、3、5、9、11 条）──
  // 画面色 = 原值过午后调色（PROXY 借的组）再乘一遍暖阳光；下面注的"调完"是过了调色、没乘阳光的（tools 的 grade 脚本算的）。
  /**
   * 镇里的车道（ROADS 全部 + 细节模块里铺的 'asphalt'：build.ts 换成这一条；不动共用的 asphalt）。
   * 照 clubpark lotAsphalt 终稿（俱乐部门口那段车道就是它）：亮档晒暖的灰（画面 ≈ #9b8972，S 0.26；再暖读成土路），
   * 中档、投影冷石板蓝（调完 ≈ #3d475f）。元素 paint 大块封层斑（±6 / −7）+ 少量擦痕（缝色 −12）。借 asphalt（court 组），和 lotAsphalt 同一套调法。
   */
  street: s(
    [0x918a7c, 0x5e6a80, 0x384862],
    0.05,
    0,
    tn(
      [0x918a7c, 0x989183, 0x898274], // L 138 / 145 / 130
      [0x5e6a80, 0x657187, 0x566278], // L 105 / 112 / 97
      [0x384862, 0x3f4f69, 0x2d4060], // L 70 / 77 / 62
      [0x7f796d, 0x4f5c74, 0x293d5f], // 缝 −17 / −14 / −11（擦痕、补丁边：> 12 才算一条边）
      [0xa59e90, 0x727e94, 0x4a5a74], // 亮边 +20 / +20 / +18
    ),
  ),
  /**
   * 车位漆线、停止线（2 纹素宽，平涂）：褪色奶油漆，和 street 亮档差 47、低一级差 56（< 60，不算强边缘）；中档中性灰、暗档石板蓝灰（投影里的线也还在）。
   * 同 clubpark lotPaint，借 asphalt（court 组）。不给元素
   */
  lotPaint: s(
    [0xc4b8a6, 0x9e9ca2, 0x5c6274],
    0.05,
    0,
    tn(
      [0xc4b8a6, 0xcabeac, 0xbeb2a0], // L 185 / 191 / 179（193 时和 street 的低一级差 60，画面上算强边缘）
      [0x9e9ca2, 0xa4a2a8, 0x98969c], // L 157 / 163 / 151
      [0x5c6274, 0x62687a, 0x535c74], // L 98 / 104 / 92
      [0xbdb2a2, 0x919098, 0x4e5872], // 缝
      [0xd8ccba, 0xaaa8ae, 0x676d7f], // 亮边
    ),
  ),
  /**
   * 停车场、店前场的暖铺面（五金停车场、餐馆 / 银行的车场、店前的空场）：晒暖的灰褐水泥，比 street（138）亮一档、比沙（调完 195）暗 ~35（画面 ≈ 157 vs 沙 185）
   * （第 2 轮：原来 #e8c69e 调完 L 211、画面和沙只差 ~14，两个批判都说"就是沙" → 往暗、往暖灰走；彩度留 S 0.36，五金门口的饱和度靠它）。
   * 暗档提亮到 L 112（调完 ≈ #8a696e）：车影、楼影和亮面差 ≤ 60（18.1 点五金停车场 / 银行强边缘超线）。
   * 元素 planks 每 1.5 米一道 1 纹素伸缩缝、每条板 ±6、80% 碎石。借 concrete（wall 组），调完亮档 ≈ L 160、S 0.37
   */
  lotPave: s(
    [0xb8926e, 0xa47e80, 0x7c68a0],
    0.05,
    0,
    tn(
      [0xb8926e, 0xbe9874, 0xb28c68], // L 151 / 157 / 145
      [0xa47e80, 0xaa8486, 0x9e787a], // L 134 / 140 / 128
      [0x7c68a0, 0x826ea6, 0x7362a0], // L 112 / 118 / 106
      [0xa5805e, 0x946f73, 0x6c5c9c], // 缝 −18 / −15 / −12
      [0xcaa480, 0xb69092, 0x8c78b0], // 亮边 +18 / +18 / +16
    ),
  ),
  /**
   * 住宅的白碎石平屋面（棕榈泉中世纪现代的 white rock roof）：亮档冷灰白（调完 ≈ #e2e5ed L 229，画面 ≈ L 222，比沙 #edb170 L 185 亮 ~37），
   * 中档冷灰紫、暗档靛灰（调完 #595a80）。元素 pebbles 6×4 纹素的石团 + 8% 碎石，不画脚印。借 surround（court 组：亮档不被午后染黄）。
   * 屋顶边一圈 1 纹素亮压顶是几何的事（住宅代理），封檐板颜色不变
   */
  // 第 2 轮：亮档 L 220 → 234（调完 243）—— 18.1 点和沙只差 18～23；高一级只留 +7（再高贴白边），低一级 −14（> 12 才算边）。
  // convex 0.2 → 0.6：顶面和朝南立面的折棱出一纹素亮线 = 屋檐的亮压顶（材质层能做的；要真的一圈压顶条归住宅代理的几何）
  roofGravel: s(
    [0xe6eaf2, 0xaca8c0, 0x585a86],
    0.3,
    0.6,
    tn(
      [0xe6eaf2, 0xedf1f9, 0xd8dce4], // L 234 / 241 / 220
      [0xaca8c0, 0xb3afc7, 0x9f9bb3], // L 171 / 178 / 158
      [0x585a86, 0x5f618d, 0x484d7f], // L 93 / 100 / 80
      [0xc9ced8, 0x9390aa, 0x41477b], // 缝 / 碎石 −28 / −24 / −20
      [0xf2f6fe, 0xb8b4cc, 0x636591], // 亮边 +12 / +12 / +11
    ),
  ),
  /**
   * 住宅的灰泥墙（四个色变体，一栋一个：houseStucco 奶油 / houseWhite 白 / housePink 淡粉 / houseMint 浅薄荷）。
   * 房子的墙几乎都背着太阳（朝南、朝东西）→ 画面上看到的是**暗档**：四个变体主要在暗档拉开（冷丁香 / 靛灰 / 梅紫 / 石板青），
   * 午后暗档封顶 C 0.06 → 暗档压到 L 87～106、S 0.29～0.36（原 stucco 暗档 #947c7e L 129、S 0.16 发灰）。
   * 元素 paint 16×10 纹素的深浅块（墙上是竖向的晒褪条）。借 signBoard（club 组：暗档往 285° 拉，留冷色，不被染成玫瑰褐）
   */
  houseStucco: s(
    [0xf4e2c4, 0xd8b8b0, 0x6250a4],
    0.5,
    0.5,
    tn(
      [0xf4e2c4, 0xfceacc, 0xebd9bb], // L 228 / 236 / 219
      [0xd8b8b0, 0xe0c0b8, 0xcfafa7], // L 190 / 198 / 181
      [0x6250a4, 0x6a58ac, 0x5647a1], // L 90 / 98 / 81（调完 #5a567c S 0.31）
      [0xdfceb2, 0xc6a7a1, 0x50429e], // 缝
      [0xfff1d3, 0xe6c6be, 0x6f5db1], // 亮边
    ),
  ),
  houseWhite: s(
    [0xf2f0ea, 0xc4c0cc, 0x5e6496],
    0.5,
    0.5,
    tn(
      [0xf2f0ea, 0xf8f6f0, 0xe9e7e1], // L 240 / 246 / 231
      [0xc4c0cc, 0xcac6d2, 0xbbb7c3], // L 194 / 200 / 185
      [0x5e6496, 0x646a9c, 0x525b93], // L 102 / 108 / 93（调完 #61648a S 0.30）
      [0xdddcd8, 0xb2afbd, 0x4c5690], // 缝
      [0xfcfaf4, 0xcecad6, 0x676d9f], // 亮边
    ),
  ),
  housePink: s(
    [0xf6d8d0, 0xdca8a8, 0x84467e],
    0.5,
    0.5,
    tn(
      [0xf6d8d0, 0xfddfd7, 0xedcfc7], // L 222 / 229 / 213
      [0xdca8a8, 0xe3afaf, 0xd39f9f], // L 179 / 186 / 170
      [0x84467e, 0x8b4d85, 0x783d7b], // L 87 / 94 / 78（调完 #685070 S 0.29）
      [0xe1c4be, 0xca9799, 0x723878], // 缝
      [0xffe7df, 0xeab6b6, 0x91538b], // 亮边
    ),
  ),
  houseMint: s(
    [0xd4ecd8, 0xa8c8c0, 0x4a7088],
    0.5,
    0.5,
    tn(
      [0xd4ecd8, 0xdbf3df, 0xcbe3cf], // L 229 / 236 / 220
      [0xa8c8c0, 0xafcfc7, 0x9fbfb7], // L 193 / 200 / 184
      [0x4a7088, 0x51778f, 0x3e6785], // L 106 / 113 / 96（调完 #566d86 S 0.36）
      [0xbfd8c6, 0x96b7b1, 0x386282], // 缝
      [0xe2fae6, 0xb6d6ce, 0x577d95], // 亮边
    ),
  ),
  /**
   * 镇里的草坪（院子、主街东的草、公园草地；不动俱乐部的 lawn）：亮档同 lawn 的暖草绿，中档（云影）往青绿走（调完 ≈ #6c9261，不是橄榄），
   * 暗档深青绿。元素 blades 草叶（亮边色的竖划），斑块 3 米、1% → 25%，阴影里照画。借 lawn（plants 组）
   */
  townLawn: s(
    [0x7cb543, 0x389a74, 0x286068],
    0.05,
    0,
    tn(
      [0x7cb543, 0x85be4c, 0x73ac3a], // L 161 / 170 / 152
      [0x389a74, 0x41a37d, 0x2f916b], // L 130 / 139 / 121
      [0x286068, 0x316971, 0x1c5765], // L 85 / 94 / 75
      [0x67a131, 0x268965, 0x165262], // 缝
      [0x94cd5b, 0x50b28c, 0x3e767e], // 亮边（草叶）+24 / +24 / +22
    ),
  ),
  /**
   * 住宅前院的碎石院子（decomposed granite + 碎石）：比沙灰、冷，亮度低一截（调完 ≈ L 172，沙 L 195 → 画面差 ~20），
   * 中档灰玫瑰、暗档靛紫。元素 pebbles 8×5 纹素的土团 + 25% 碎石，不龟裂。借 surround（court 组：亮档不被染黄，跟沙拉开）
   */
  gravelYard: s(
    [0xb8a090, 0x96808a, 0x5e507a],
    0.05,
    0,
    tn(
      [0xb8a090, 0xc0a898, 0xaf9787], // L 164 / 172 / 155
      [0x96808a, 0x9e8892, 0x8d7781], // L 133 / 141 / 124
      [0x5e507a, 0x665882, 0x524777], // L 86 / 94 / 77
      [0xa18a7c, 0x836e7a, 0x4b4173], // 缝 / 碎石 −22 / −18 / −15
      [0xceb6a6, 0xac96a0, 0x72648e], // 亮边 +22 / +22 / +20
    ),
  ),
  // ── 第 3 轮（2026-11-22，critic-material-2 / composition-2）──
  /**
   * 住宅后院的暖碎石（替换满铺的陶砖：陶砖占住宅屏 31%）：暖杏色碎石（调完 #e5ad7d L 181、S 0.45），比沙暗 ~14、比陶砖淡；
   * 暗档梅紫（调完 #6b577a）。元素 pebbles 8×5 纹素土团 + 25% 碎石，不龟裂。借 surround（court 组：亮档不再被染黄、暗档留冷）
   */
  yardGravel: s(
    [0xdca474, 0xbc8070, 0x7e5088],
    0.05,
    0,
    tn(
      [0xdca474, 0xe4ac7c, 0xd39b6b], // L 172 / 180 / 163
      [0xbc8070, 0xc48878, 0xb37767], // L 140 / 148 / 131
      [0x7e5088, 0x865890, 0x724785], // L 94 / 102 / 85
      [0xc58e60, 0xa96e60, 0x6b4181], // 缝 / 碎石 −22 / −18 / −15
      [0xf0b888, 0xd09484, 0x90629a], // 亮边 +20 / +20 / +18
    ),
  ),
  /**
   * 市中心店、办公楼的平屋顶：暖色焦油碎石（tar & gravel，调完 L ≈ 152、S ≈ 0.5；L 162 时 18.1 点和沙只差 22）—— 原来 concrete 调完 L 211、画面 189 和沙 190 同亮、平涂。
   * 比沙暗 ~40、比 lotPave 略暗略红；暗档冷靛（调完 #584a6e）。元素 pebbles 6×4 纹素 + 40% 碎石。借 surround
   */
  roofTar: s(
    [0xbc865e, 0x9a6a64, 0x5e4870],
    0.3,
    0.6,
    tn(
      [0xbc865e, 0xc48e66, 0xb37d55], // L 143 / 151 / 134
      [0x9a6a64, 0xa2726c, 0x91615b], // L 116 / 124 / 107
      [0x5e4870, 0x665078, 0x523f6d], // L 80 / 88 / 70
      [0xa36e48, 0x845551, 0x493767], // 缝 / 碎石 −24 / −21 / −18
      [0xd09a72, 0xae7e78, 0x705a82], // 亮边 +20 / +20 / +18
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
  muniCourt: 'surround',
  muniOuter: 'surround',
  muniPatch: 'surround',
  windscreenOld: 'lawn',
  chainLink: 'surround',
  hitWall: 'surround', // 借 concrete 调完正午只剩 S 0.08（批 KW 量的）→ 中性灰那组
  parkBrown: 'concrete',
  // 小镇的地面、屋顶、住宅墙（2026-11-21）
  street: 'asphalt', // court 组，同 clubpark 的 lotAsphalt
  lotPaint: 'asphalt',
  lotPave: 'concrete',
  roofGravel: 'surround',
  houseStucco: 'signBoard',
  houseWhite: 'signBoard',
  housePink: 'signBoard',
  houseMint: 'signBoard',
  townLawn: 'lawn',
  gravelYard: 'surround',
  yardGravel: 'surround',
  roofTar: 'surround',
} as const satisfies Record<TownKey, keyof typeof MAP_PAL>;

/** 住宅墙的四个色变体（一栋一个；住宅代理按 rnd 挑） */
export const HOUSE_WALLS = [
  'houseStucco',
  'houseWhite',
  'housePink',
  'houseMint',
] as const satisfies readonly TownKey[];

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
  // 公园：球场漆面有机深浅块（大、低对比）；挡风布每 1.5 米一条竖接缝；公园牌木板
  muniCourt: { kind: 'paint', size: [14, 8] },
  muniOuter: { kind: 'paint', size: [18, 10] },
  windscreenOld: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 1.5] },
  hitWall: { kind: 'paint', size: [12, 6] },
  parkBrown: { kind: 'planks', seam: 1, hi: 0.5, p: [0, 1, 0, 0.2] },
  // 小镇的地面、屋顶、住宅墙（2026-11-21 核心调色板）
  /**
   * 车道：封层斑（22×12 纹素，+7 / −8）+ 按 4 米斑块 2% → 12% 的擦痕（缝色 −17）。试过 16×9、±9、擦痕 20%：整屏像迷彩，
   * 横向边缘还是只有 0.035（斑块之间差 < 12 不算边）—— 路面本来就该是安静的中间调带子，边缘留给手摆的东西：
   * 中线、停止线（lotPaint，2 纹素）、补丁（street 低一级的方块）、井盖是各分区代理手摆的几何。
   * 再加 chip seal 的碎石（pebbles 0.55：每 7×5 纹素格按斑块 19%～90% 的概率一颗 2 纹素缝色 + 上面一纹素亮边色）——棕榈泉的路多是
   * 撒石封层，横向边缘靠它到 0.06
   */
  street: { kind: 'paint', size: [22, 12], density: [0.02, 0.12], patch: 4, pebbles: 0.55 },
  /**
   * 停车场 / 店前场：每 1.5 米（沿 x）一道 1 纹素伸缩缝，缝后 30% 一纹素亮条，每条一个深浅（±6）+ 80% 碎石（骨料；0.2 / 0.45 时场景里横向边缘只有 0.02 / 0.03，±6 的板之间不算边）。
   * critic 给的是 3 米一道：画廊里量过，3 米（67 纹素）一条板 = 一块平涂，阴影里只剩一个颜色、边缘 0.02 → 1.5 米。
   * 油渍、轮胎弧、路缘是各店代理手摆的几何（street 低一级 / kerb）
   */
  lotPave: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 1.5], pebbles: 0.8 },
  /** 白碎石屋面：6×4 纹素的石团 + 20% 碎石（缝色 2 纹素 + 上面一纹素亮），不画脚印、不龟裂 */
  roofGravel: { kind: 'pebbles', size: [6, 4], seam: 0, density: [0, 0], pebbles: 0.2 },
  /** 住宅墙：16×10 纹素的深浅块（墙上按 x 走 = 竖向晒褪条），擦痕很少 */
  houseStucco: { kind: 'paint', size: [16, 10], density: [0, 0.02] },
  houseWhite: { kind: 'paint', size: [16, 10], density: [0, 0.02] },
  housePink: { kind: 'paint', size: [16, 10], density: [0, 0.02] },
  houseMint: { kind: 'paint', size: [16, 10], density: [0, 0.02] },
  /** 草坪：草叶（亮边色的 1 × 2～4 竖划），3 米斑块 3% → 12%（1% 的斑块落在树影里就是一块平涂；28% 亮处边缘 0.26 太忙），阴影里照画；6% 深一级草团 */
  townLawn: {
    kind: 'blades',
    density: [0.03, 0.12],
    patch: 3,
    pebbles: 0.06,
    accent: [0x5f9a32, 0x2a8466, 0x1c4e5c], // 深一级的草团（2 纹素 + 上面一纹素草叶色）
  },
  /** 学校前庭：每 1.6 米一道缝（沿 x；critic 的 2.4 米在画廊里一块板就是一块平涂），缝后 30% 亮条，每块一个深浅 + 4% 碎石 */
  campusConcrete: { kind: 'planks', seam: 1, hi: 0.3, p: [1, 0, 0, 1.6], pebbles: 0.04 },
  /** 碎石院子：8×5 纹素土团、25% 碎石，不龟裂（第 2 轮：seam 0.5 的龟裂整片像干泥地）、不画脚印 */
  gravelYard: { kind: 'pebbles', size: [8, 5], seam: 0, density: [0, 0], patch: 3, pebbles: 0.25 },
  /** 后院暖碎石：同 gravelYard（不龟裂、25% 碎石） */
  yardGravel: { kind: 'pebbles', size: [8, 5], seam: 0, density: [0, 0], patch: 3, pebbles: 0.25 },
  /** 焦油碎石平顶：6×4 纹素石团 + 40% 碎石（20% 时一屋顶 3 色、边缘 0.013） */
  roofTar: { kind: 'pebbles', size: [6, 4], seam: 0, density: [0, 0], pebbles: 0.4 },
  /**
   * 土坯（老材质 adobe，原值不动）：EL.adobe 要 aElem 顶点属性（露出高度）+ 墙 uv（米），build.ts 的 prep() 和 houses.ts 的盒子都没有 →
   * toon.ts 走"实心一条"，朝镜头的墙一块平涂。屏幕空间的 strata 也不行（层按离屏幕 y = 0 数，只有 24 层，远处整面一块）→
   * valley 里换成屏幕空间的扁 Voronoi 土坯块（20×7 纹素，缝 1 纹素，三成的块上沿亮边；14×5 边缘 0.16 太碎）：任何盒子、任何朝向都有
   */
  adobe: { kind: 'stones', size: [20, 7], seam: 0.6, hi: 0.3 },
  /** 校队球场面（老材质 court，原值不动、只在 valley）：大块漆面深浅 18×10 纹素（court 自己的 tones ±6），很少擦痕 */
  court: { kind: 'paint', size: [18, 10], density: [0, 0.02] },
  /** 西班牙红瓦（老材质 roofTile，颜色不变；tones 用下面 TOWN_TONES 的）：筒瓦一列一列（沿 x 每 0.28 米一条缝，缝后 60% 亮条） */
  roofTile: { kind: 'planks', seam: 1, hi: 0.6, p: [1, 0, 0, 0.28] },
} satisfies Partial<Record<TownKey | 'roofTile' | 'adobe' | 'court', Elem>>;

/**
 * 老材质（clubmap2 的表，原值不动）带元素时用的手挑 tones：build.ts 的 mat 在 ELEM 有它时一起给；资产里 ctx.mat('roofTile', { elem: TOWN_EL.roofTile, tones: TOWN_TONES.roofTile })。
 * roofTile：同 ramp 的三档本色，缝是瓦间的暗槽（−26 / −22 / −18），亮边是筒瓦的圆背
 */
export const TOWN_TONES = {
  roofTile: tn(
    [0xdc744e, 0xe47c56, 0xd46c46], // L 135 / 143 / 127
    [0xa84a48, 0xb05250, 0xa04240], // L 94 / 102 / 86
    [0x5c2c52, 0x64345a, 0x512450], // L 57 / 65 / 49
    [0xc15a36, 0x913434, 0x461a48], // 缝 −26 / −22 / −18
    [0xf48c66, 0xc06260, 0x724268], // 亮边 +24 / +24 / +22
  ),
} satisfies Partial<Record<keyof typeof MAP_PAL, Tones>>;

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
