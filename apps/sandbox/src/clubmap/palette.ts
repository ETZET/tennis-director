// clubmap 的调色板 = clubfront 的整张表（= desert3d-v2 + 前台那批新材质）+ 微缩地图要的几样：红土、草地、按功能分色的屋顶、车。
// 微缩地图是看"什么在哪"的，颜色按功能分得开就行：硬地青蓝 + 外场绿、红土陶红、草地两种绿的条纹、屋顶一种功能一个颜色。
import { EL as CLUB_EL, PAL as CLUB_PAL, SKY as CLUB_SKY, type Swatch } from '../clubsite/render/palette';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number): Swatch => ({ ramp, edge, convex });

/**
 * 红土场面（全俱乐部同一个红土，2026-11-08 用户定；clubclay 的 `clay` 就是这一条）：砖红偏橙，比陶砖铺地更红、更暗。
 * 亮档 L 130（午后调完 #ed763f L 139，HSV 饱和 0.73，OKLCH 色相 ~44°）：比 clubclay 白模的 #d8603c（调完 L 127）提了 ~12，
 * 让红土落进亮度直方图的第 5 档、和围网 / 投影的暗带（2～3 档）分成两个峰；彩度 C 0.166 照旧（主角色）。
 * 和沙（调完 #edbd83，色相 71°、L 195）、陶砖铺地（L 187）靠"更红、更暗"分开。暗档梅紫 L 73（调完玫瑰褐 #654143）= 投影。
 * 旧值 #e2784c / #b4584e / #6a3a6a（调完 #e8834d 偏橙）。tones 只在带 elem 时起作用（clubclay 的 clay-court），缝 / 亮边差 ≈ 20。
 */
const CLAY: Swatch = {
  ramp: [0xe86a44, 0xbe514f, 0x6a3c64],
  edge: 0.05,
  convex: 0,
  tones: {
    bands: [
      [0xe86a44, 0xf0744c, 0xdc623e], // L 130 / 139 / 121
      [0xbe514f, 0xc65953, 0xb44b4b], // L 104 / 112 / 97
      [0x6a3c64, 0x74446c, 0x62365c], // L 73 / 81 / 66
    ],
    seam: [0xce563c, 0xa44349, 0x52305a], // L 110 / 88 / 58
    hi: [0xfc845a, 0xd2655a, 0x7e4c76], // L 154 / 123 / 90
  },
};

const MAP = {
  clay: CLAY,
  /**
   * 草地场：底色 + 修剪的亮条纹（L 161 / 180）。
   * 第二轮（2026-11-08）：彩度 × 1.05、色相 −8°（往黄绿偏，午后读成暖草，不是纯绿）；GROUP 归 plants（暗档跟着草走成深绿，原来被全局染成褐灰 #5f5550）。
   * 原值 #6cb85a / #4a9a5e、#86ca66 / #5aa864。
   */
  lawn: s([0x7cb543, 0x56984f, 0x2c6262], 0.05, 0),
  lawnStripe: s([0x96c750, 0x67a654, 0x346a66], 0.05, 0),
  /** 屋顶：一种功能一个颜色（商店用柜台的俱乐部蓝 counter，咖啡吧用 fabricStripe 珊瑚橙） */
  roofString: s([0xf6cc4a, 0xd49a3c, 0x7a5466], 0.5, 0.4), // 穿线店：网球黄
  roofLounge: s([0x3cb4a4, 0x2a8890, 0x24506e], 0.5, 0.4), // 球员休息室：青绿
  /** 车（停车场里的方块） */
  carRed: s([0xe85a48, 0xb43c4c, 0x62285a], 0.6, 0.5),
} as const satisfies Record<string, Swatch>;

export const PAL = { ...CLUB_PAL, ...MAP } as const;
export type Pal = typeof PAL;
export const SKY = CLUB_SKY;
export const EL = CLUB_EL;
