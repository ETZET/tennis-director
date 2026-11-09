// clubplaza 的调色板 = clubdesk 的整张表（= clubmap2 + 碎花岗岩 / 黑板 / 黄铜）+ 这个场景新加的两种（PLAZA）。
// 喷泉广场的颜色基本都是现成的：石板（广场）、陶砖（喷泉一圈的铺装、压顶）、土坯（挡土墙）、蒲葵、长椅、人。
// 新加的只有主角的冷色：池水（比 desert3d-v2 的小池更饱和）和池壁上一圈塔拉韦拉蓝釉砖。
// 午后配色（golden）的全局调色会把暗档往玫瑰褐拉、彩度压到 0.06 —— 池水在影子里会变成褐水。所以这两种在 main.ts 里**借 club 组调色**
// （PROXY：fountainWater → jug、talavera → signBoard；club 组暗档往 285° 蓝紫走），不改 clubfront/palettes。建议核心代理把它们归进 GROUP。
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
const PLAZA = {
  /**
   * 喷泉池水（主角的冷色）：亮档青绿 L 183、中档孔雀蓝 L 140、暗档钴蓝 L 75。比 desert3d-v2 的 water（L 165 / 131 / 87）
   * 彩度高一截（暖陶砖一圈里唯一的冷色块，饱和度靠它）。水面朝天 → 几乎全落亮/中档；暗档只在池壁投影和水花背光面。
   * 亮边（+25 左右）给以后的闪光、涟漪圈用；缝给水底的砖缝（透过水看得到的格子）用。
   */
  fountainWater: s(
    [0x48d4dc, 0x24a4cc, 0x244e9c],
    0.05,
    0,
    tn(
      [0x48d4dc, 0x58dce2, 0x3cc6d4], // L 183 / 192 / 173
      [0x24a4cc, 0x2eaed2, 0x1e96c0], // L 140 / 148 / 129
      [0x244e9c, 0x2c58a6, 0x204690], // L 75 / 83 / 68
      [0x34b4c8, 0x1a84b0, 0x1a3c84], // 缝 −28 / −29 / −13
      [0x8cf0ee, 0x5cc8dc, 0x3c74b8], // 亮边 +34 / +32 / +29（闪光、涟漪）
    ),
  ),
  /**
   * 塔拉韦拉蓝釉砖（池壁朝外的一圈花砖带、碗沿下一圈）：钴蓝底 + 奶白花（花用 signPaint）。
   * 池壁朝镜头 → 几乎总在暗档：暗档要留得住蓝（L 62，色相 ~250°），不然一圈花砖带读成黑带。釉面 → convex 高，上沿一条亮线。
   */
  talavera: s(
    [0x4a8ee8, 0x2e62c0, 0x263c8a],
    0.5,
    0.6,
    tn(
      [0x4a8ee8, 0x5698ee, 0x4084de], // L 134 / 143 / 125
      [0x2e62c0, 0x366ac8, 0x285ab4], // L 93 / 101 / 86
      [0x263c8a, 0x2c4494, 0x223680], // L 62 / 68 / 56
      [0x3474cc, 0x24509e, 0x1c2c6c], // 缝 −24 / −17 / −12
      [0x7ab4f6, 0x5a8ae0, 0x4660b4], // 亮边 +33 / +33 / +31
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubdesk（含 clubmap2、clubfront、desert3d-v2）+ PLAZA */
export const PAL = { ...DESK_PAL, ...PLAZA } as const;
export type Pal = typeof PAL;
export const SKY = DESK_SKY;
export const EL = DESK_EL;

/**
 * 这个场景新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）：
 * 池水、花砖借 club 组（暗档往蓝紫走，不往玫瑰褐走），这样午后配色下影子里的水还是蓝的。
 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  fountainWater: 'jug',
  talavera: 'signBoard',
};
