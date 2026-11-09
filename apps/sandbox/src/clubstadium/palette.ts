// clubstadium 的调色板 = clubdesk 的整张表（= clubmap2 + 碎花岗岩 / 黑板 / 黄铜）+ 这个场景新加的（STADIUM）。
// 中心球场几乎全是现成的颜色：看台混凝土 `concrete`（台阶）、`stucco`（看台外墙、球员通道，和会所同一种白灰泥）、
// 座椅 `seat`（俱乐部绿）、场地 `court` / `surround` / `line`、广告板 `signBoard` / `signPaint`、记分牌 `slate` + `ball`（数字）、
// 观众的衣服、皮肤、草帽（人物那一套）。
// 新加的一种：看台的走道台阶（比台阶本身亮一档的灰白水泥，竖着把看台切成几块 —— 不然六层横带一直连到画外，没有节奏）。
// 规则同 clubdesk/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −15…−38、亮边 +15…+33；暗档换冷色相。
// L = 0.2126R + 0.7152G + 0.0722B。

import { EL as DESK_EL, PAL as DESK_PAL, SKY as DESK_SKY } from '../clubdesk/palette';
import type { Tones } from '../clubdesk/toon';
import type { Swatch } from '../clubfront/palette';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

/** 这个场景新加的材质 */
const STADIUM = {
  /**
   * 看台走道（每段看台之间往上走的台阶条）：比 `concrete` 冷一点、亮一点的灰白水泥（亮档 L 214 → 混凝土 L 205），
   * 暗档留冷灰紫（不和座椅的深青绿撞）。走道竖着切开六层横带 —— 看台读成"几块坐满人的看台"，不是一片横条纹。
   */
  aisle: s(
    [0xeedcc4, 0xc4aeac, 0x6c6488],
    0.4,
    0.5,
    tn(
      [0xeedcc4, 0xf6e6d0, 0xe4d0b8], // L 222 / 231 / 211
      [0xc4aeac, 0xccb8b4, 0xb8a2a2], // L 178 / 186 / 167
      [0x6c6488, 0x766e92, 0x625a7c], // L 103 / 113 / 94
      [0xc8b29c, 0xa08a8c, 0x4c4668], // 缝 −34 / −35 / −23
      [0xfff4e4, 0xe0ccc6, 0x887ea0], // 亮边 +19 / +24 / +28
    ),
  ),
  /**
   * 中心球场的内场（表演场自己的颜色，用户定的）：比青训场 / 会员场的青蓝 `court`（#22b0d5，色相 194°，L 148）
   * 深一档、往群青走的俱乐部蓝（色相 213°，L 132，彩度比 court 高）—— 一眼分得出"这是中心球场"，又和外圈的 `surround` 绿、
   * 广告板的 `counter`（L 144，更灰）拉得开。暗档往靛紫（色相 232°），和看台立面的暗带同一家。
   * 漆面平涂为主（paint 元素），高 / 低一级差 6～8（远看是一整块安静的蓝）。用法：terrain.ts 的 paintCourt 对 stadium_1 用它代替 'court'。
   */
  courtShow: s(
    [0x3a8ff0, 0x2a6ad0, 0x2a3896],
    0.05,
    0,
    tn(
      [0x3a8ff0, 0x4296f4, 0x3486e4], // L 132 / 139 / 123
      [0x2a6ad0, 0x2f71d6, 0x2664c4], // L 100 / 106 / 94
      [0x2a3896, 0x2f3e9c, 0x27328a], // L 60 / 65 / 54
      [0x2c7ddc, 0x2256ac, 0x212a7c], // 缝 −16 / −19 / −11
      [0x5aa6f6, 0x3e82d8, 0x3a4aa6], // 亮边 +20 / +20 / +12
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubdesk（含 clubmap2、clubfront、desert3d-v2）+ STADIUM */
export const PAL = { ...DESK_PAL, ...STADIUM } as const;
export type Pal = typeof PAL;
export const SKY = DESK_SKY;
export const EL = DESK_EL;

/**
 * 这个场景新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）：
 * 走道借 `concrete`（和看台台阶同一组调色，午后配色下两者的明暗关系不变）。
 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  aisle: 'concrete',
  // 中心球场的内场借 `court` 那一组（午后配色的 court grade：亮档色相往金色挪一点、暗档往紫）
  courtShow: 'court',
};
