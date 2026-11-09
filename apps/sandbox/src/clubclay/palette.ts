// clubclay 的调色板 = clubdesk 的整张表（= clubmap2 + clubfront + desert3d-v2 + 前台的 granite / slate / brass，只读 import）
// + 这个场景新加的红土几种状态和胶带线（CLAY）。红土是这一片的主角色、饱和度的主力。
// 规则同 clubfront/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −15…−38、亮边 +15…+33；暗档换冷色相（梅紫），不是亮档乘系数。
// L = 0.2126R + 0.7152G + 0.0722B（sRGB 原值）。
//
// 午后配色（golden）的全局调色会：亮档往 62°（OKLCH）染 25%、L +9；中档往 40° 染 35%、彩度 ×0.9；暗档往 32° 染 70%、彩度夹到 ≤ 0.06（玫瑰褐）。
// 这几种名字不在 clubfront/palettes 的 GROUP 表里 → 只吃全局调色。所以底色故意挑得更红（OKLCH 色相 ~36°）、彩度更高（C 0.166）：
// 红土调完落在 #ed763f（色相 ~44°，HSV 饱和 0.73，L 139）—— 比陶砖铺地（#faae7c，L 187）暗、比沙（#edbd83，色相 71°）红得多，
// 和金色的沙分得开，不撞色；L 139 落在亮度直方图第 5 档，和暗带（围网、投影 L 73～100）分成两个峰（2026-11-08 提亮，见下）。
// （node --experimental-strip-types 跑 clubfront/palettes/grade.ts 的 gradeHex 算的，见 clubclay.md「调色板」）

import { EL as DESK_EL, PAL as DESK_PAL, SKY as DESK_SKY } from '../clubdesk/palette';
import type { Swatch } from '../clubfront/palette';
import type { Elem, Tones } from '../clubfront/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/**
 * 红土的四种状态 + 胶带线（干净 / 盖了土）。2026-11-08（clay-court 资产）：用户定"红土提亮一点、全图统一"——
 * `clay` 不在这里定义，就是地图那条（clubmap/palette.ts，经 clubdesk 的表传过来）；其余几种照它一起提亮：
 * 亮档 +11（clay / clayBrushed）、+6（clayDust）、+5（clayWet）、+4（tapeDust），中档 +3～6，暗档（投影）不动。
 * 午后调完的亮档：clay #ed763f L 139 · clayBrushed #eb7441 L 138 · clayDust #f19a70 L 169 · clayWet #c25b3d L 111 · tapeDust #f1b493 L 191 · tape L 244。
 * 旧值（白模）：clay #d8603c、clayBrushed #d65e3e、clayDust #e48a68、clayWet #b84a3e、tapeDust #e6a68a（调完 L 127 / 126 / 163 / 106 / 187）。
 */
const CLAY = {
  /**
   * 红土（打过一阵的正常状态）：= 地图的 `clay`（clubmap/palette.ts）。L 130 / 139 / 121（调完 ~139），中档 L 104（云影），
   * 暗档梅紫 L 73（投影：调完玫瑰褐 #654143）。缝 = 压实的深一点的土、擦痕；亮边 = 土团迎光的上沿（差 ≈ 20，不出强边缘）。
   */
  clay: DESK_PAL.clay,
  /**
   * 刚拖过的红土：同一家颜色，但更匀（高/低一级只差 ±4～6），拖垫的扫痕是一道道 1 纹素、只深 10 的线（clay-court 的元素），
   * 读起来是"干净、平"。和 clay 并排时几乎一样亮 —— 区别在纹理（匀 vs 斑驳），不在颜色。
   */
  clayBrushed: s(
    [0xe66846, 0xbe514f, 0x6a3c64],
    0.05,
    0,
    tn(
      [0xe66846, 0xea6e4a, 0xe06442], // L 128 / 134 / 124
      [0xbe514f, 0xc25551, 0xb84d4d], // L 104 / 108 / 100
      [0x6a3c64, 0x704068, 0x663a60], // L 73 / 77 / 70
      [0xd85e42, 0xae494b, 0x5a345e], // 扫痕 −10 / −9 / −10（很淡：只在近处读得出）
      [0xf27a52, 0xca5f57, 0x784870], // 亮边 +17 / +13 / +12（扫痕一侧翻起的土）
    ),
  ),
  /**
   * 干、起尘的红土（打完没拖、太阳晒干了）：更浅、更粉、彩度低一点。L 161（调完 ~169，仍比陶砖暗 18）。
   * 脚印、擦痕在这上面是缝色；滑步痕是这一家的本色 / 亮边；拖垫两边翻起的一条土也是它。暗档梅灰 L 93。
   */
  clayDust: s(
    [0xea906e, 0xc67668, 0x7a5272],
    0.05,
    0,
    tn(
      [0xea906e, 0xf09a76, 0xe28868], // L 161 / 170 / 153
      [0xc67668, 0xce806e, 0xbc6c62], // L 134 / 143 / 124
      [0x7a5272, 0x845a7a, 0x704a6a], // L 93 / 101 / 84
      [0xd37a5e, 0xac625e, 0x64465e], // 缝（脚印、擦痕）−22 / −21 / −15
      [0xfaa882, 0xda8c7a, 0x8e6688], // 亮边 +22 / +21 / +20
    ),
  ),
  /**
   * 浇过水的红土：更深、更红（L 102，调完 ~111，HSV 饱和 0.69）。边上一圈稍浅的"半干"（clay 的低一级），
   * 水多的地方几块更深的小水洼（缝色，上沿一行湿面反光 = 亮边色）。球印也是这一家。暗档深梅紫 L 57。
   */
  clayWet: s(
    [0xbd4f43, 0x913d47, 0x52304e],
    0.08,
    0,
    tn(
      [0xbd4f43, 0xc55744, 0xb3493d], // L 102 / 109 / 95（调完 ~111：在影子 73 和红土 139 中间，靠彩度和影子分开）
      [0x913d47, 0x99434b, 0x893742], // L 80 / 86 / 73
      [0x52304e, 0x5a3656, 0x4a2a48], // L 57 / 64 / 51
      [0x993738, 0x77333f, 0x3e2240], // 缝（水洼）−26 / −14 / −15
      [0xc95b49, 0xa54d51, 0x6a4064], // 亮边（湿面反光）+11 / +16 / +19
    ),
  ),
  /** 红土上的白胶带线（钉在土里，不是漆）：比硬地的奶油线 `line` 更白一点。L 235（调完 ~244）；暗档冷紫 L 119 */
  tape: s(
    [0xf6ead6, 0xd6c0c0, 0x847096],
    0.05,
    0,
    tn(
      [0xf6ead6, 0xfaf0de, 0xeee2cc], // L 235 / 241 / 227
      [0xd6c0c0, 0xdcc8c6, 0xccb6b8], // L 197 / 204 / 187
      [0x847096, 0x8c789c, 0x7a6890], // L 119 / 127 / 111
      [0xe8d4c4, 0xc4aab0, 0x6e5c86], // 缝（胶带上的土渣）−20 / −20 / −17
      [0xfff8ea, 0xe6d2d0, 0x94809e], // 亮边
    ),
  ),
  /** 盖了一层土的胶带线（拖过场、还没扫线）：粉橙白，L 182（调完 ~191）—— 线还在，但糊了；扫线以后换回 tape */
  tapeDust: s(
    [0xeaaa8e, 0xc78981, 0x7e5a7c],
    0.05,
    0,
    tn(
      [0xeaaa8e, 0xeeb296, 0xe4a288], // L 182 / 189 / 174
      [0xc78981, 0xcf9187, 0xbf817b], // L 150 / 157 / 142
      [0x7e5a7c, 0x866284, 0x765474], // L 100 / 108 / 94
      [0xdc9276, 0xad716f, 0x684a6c], // 缝 −22 / −24 / −17
      [0xf6c0a4, 0xd99f93, 0x92709a], // 亮边
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubdesk（含 clubmap2、clubfront、desert3d-v2）+ CLAY（clay 就是地图那条，其余是这个场景加的） */
export const PAL = { ...DESK_PAL, ...CLAY } as const;
export type Pal = typeof PAL;
export const SKY = DESK_SKY;

/**
 * 元素预设：clubdesk 的（sand / strata / path / water / foam / tile / flagstone / adobe / granite）+ 红土几种状态（白模阶段的近似，
 * stage 2 的 clay-court 资产代理从零画：扫痕弧线、脚印、球印、滑步痕都要手摆或专门的 kind）。
 */
export const EL = {
  ...DESK_EL,
  /** 正常红土：低频深浅块（漆面那种）+ 很少的擦痕 */
  clay: { kind: 'paint', size: [22, 13], density: [0, 0.04], patch: 4 },
  /** 刚拖过：块更大更匀，几乎没有擦痕 */
  clayBrushed: { kind: 'paint', size: [30, 16], density: [0, 0.01], patch: 6 },
  /** 起尘：土团 + 脚印（pebbles 的 density = 脚印），偶尔一道龟裂 */
  clayDust: { kind: 'pebbles', size: [7, 4], seam: 0.3, density: [0.02, 0.16], patch: 2.5, pebbles: 0.02 },
  /** 湿：大块深浅（水渗得不匀）+ 少量水洼 */
  clayWet: { kind: 'paint', size: [18, 10], density: [0, 0.06], patch: 3 },
} as const satisfies Record<string, Elem>;
