// clubpickle 的调色板 = clubdesk 的整张表（clubmap2 + 前台的 granite / slate / brass；只读 import）+ 匹克球场新加的两种（PICKLE）。
// 场面、围网、步道、草坪的颜色全部沿用 clubdesk（它的画面左边已经画着这个围场，两边要一模一样）。
// 新材质照 clubsite/render/palette.ts 的规则手挑：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −15…−38、亮边 +15…+33；
// 暗档换冷色相（不是亮档乘系数）。L = 0.2126R + 0.7152G + 0.0722B，S = HSV 饱和度。
// 用户定的（2026-11-08）：饱和度目标 ≥ 0.42 靠"主角材质彩度高一点"来够，不改配色方案 → 这两种都挑得比周围艳。
// 这两种不在 clubsite/render/palettes 的 GROUP 表里（那个文件不归这个场景改）→ 午后配色只吃全局调色（见 clubpickle.md「要商量的」）。

import { EL as DESK_EL, PAL as DESK_PAL, SKY as DESK_SKY } from '../clubdesk/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

const PICKLE = {
  /**
   * 厨房（非截击区，网两边各 2.13 米）：比场面（pickle #6ab4d8，L 167）深一级、更饱和的钴蓝（L 137，S 0.72）。
   * 匹克球场一眼认得出的就是网两边这两条深色带 —— 也让网（暗靛 + 白网带）落在一块深底上，读得更清楚。
   * 暗档（投影里）走靛紫 L 69：和围网投影（court 组暗档）同一家，不变成脏灰。只是地面平涂，不加元素。
   */
  kitchen: s(
    [0x3c98d8, 0x2f72b8, 0x2c4688],
    0.05,
    0,
    tn(
      [0x3c98d8, 0x46a2e0, 0x348ecc], // L 137 / 145 / 128
      [0x2f72b8, 0x387cc0, 0x2a68ac], // L 105 / 113 / 96
      [0x2c4688, 0x325090, 0x283e7e], // L 69 / 76 / 62
      [0x2c80c0, 0x2660a0, 0x22386e], // 缝 −20 / −17 / −16
      [0x5eb2ea, 0x4a8ed0, 0x40589c], // 亮边 +22 / +22 / +18
    ),
  ),
  /**
   * 球拍面（匹克球拍，主色）：珊瑚粉红（L 139，S 0.58），全场最艳的小块。球拍架上一排拍子、球员手里的拍子用它；
   * 其他几把拍子借现成的亮色（flowerYellow、counter 俱乐部蓝、toolOrange、clothPurple）—— 不再加新颜色。
   * 暗档酒紫 L 60（暗档换色相）。
   */
  paddle: s(
    [0xff6a7a, 0xd4446a, 0x6a2a62],
    0.6,
    0.5,
    tn(
      [0xff6a7a, 0xff7a88, 0xf45e70], // L 139 / 151 / 128
      [0xd4446a, 0xdc5074, 0xc83a60], // L 101 / 110 / 91
      [0x6a2a62, 0x74326c, 0x602458], // L 60 / 67 / 53
      [0xe0506a, 0xb43458, 0x501e4c], // 缝 −22 / −20 / −16
      [0xff96a0, 0xea6a84, 0x8a4682], // 亮边 +31 / +29 / +26
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubdesk（含 clubmap2、clubfront、desert3d-v2）+ PICKLE。同名的以 PICKLE 为准（现在没有同名的） */
export const PAL = { ...DESK_PAL, ...PICKLE } as const;
export type Pal = typeof PAL;
export const SKY = DESK_SKY;
export const EL = DESK_EL;
