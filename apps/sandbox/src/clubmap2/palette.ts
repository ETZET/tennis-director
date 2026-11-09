// clubmap2 的调色板 = clubmap（= clubfront + 红土、草、车、功能屋顶）+ 游戏地图要的几样：会所的白灰泥和红瓦、看台座椅、高尔夫果岭。

import type { Swatch } from '../clubfront/palette';
import { EL as MAP_EL, PAL as MAP_PAL, SKY as MAP_SKY } from '../clubmap/palette';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number): Swatch => ({ ramp, edge, convex });

const MORE = {
  /** 会所：西班牙复兴式的白灰泥墙（比土坯亮，L 236） */
  stucco: s([0xfaeedc, 0xdcc6c0, 0x8e7a9e], 0.5, 0.5),
  /** 红瓦屋顶 */
  roofTile: s([0xdc744e, 0xa84a48, 0x5c2c52], 0.55, 0.45),
  /** 看台座椅（俱乐部绿） */
  seat: s([0x5cb488, 0x3a8a74, 0x24546a], 0.5, 0.4),
  /** 果岭（比球道亮）。第二轮：彩度 × 1.1、色相 −10°（原 #9ad870 / #6ab866），GROUP 归 plants */
  green: s([0x96da66, 0x63bb5f, 0x3a7a64], 0.05, 0),
  /**
   * 匹克球场面：天蓝（和硬地内场的青蓝分得开）。第二轮（2026-11-08）：彩度 × 1.5 / 1.4、色相 +2°（原 #6ab4d8 / #4a86b8），
   * GROUP 归 court（原来只吃全局 grade，亮档往金色染 25% → 画面灰青 #92aba9 S 0.15；现在 ≈ #64b3cb S 0.51）。
   */
  pickle: s([0x3fbdf7, 0x328ad4, 0x304f90], 0.05, 0),
} as const satisfies Record<string, Swatch>;

export const PAL = { ...MAP_PAL, ...MORE } as const;
export type Pal = typeof PAL;
export const SKY = MAP_SKY;
export const EL = MAP_EL;
