// clubhouse 的调色板 = clubplaza 的整张表（= clubdesk + clubmap2 的白灰泥 stucco、红瓦 roofTile + 池水、花砖）+ 会所里面新加的四种（HOUSE）。
// 外观几乎都是现成的：stucco（白灰泥墙）、roofTile（红瓦）、ironwork（铁花窗栅、门洞）、tile（陶砖：走廊、咖啡吧、拱廊地面）、
// wood（会员休息室、办公室、穿线台、专卖店的木地板）、concrete（后厨地面）、talavera（拱廊尽头的花砖壁泉）。
// 新加的只有"剖面"要的：切墙的顶（娃娃屋的惯例：切开的墙顶一条深色，平面图一样读出房间）、隔墙的赭石石灰水、更衣室 / 理疗室的水青瓷砖地、休息室的蜂蜜色橡木地板。
// 规则同 clubdesk/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12；大面积亮面的亮档低一级 ≥ 170，暗档高一级 ≤ 120；
// 暗档换冷色相，不是亮档乘系数。L = 0.2126R + 0.7152G + 0.0722B。

import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });

/** 这个场景新加的材质 */
const HOUSE = {
  /**
   * 切墙的顶（里面模式：朝镜头的墙切到 1 米，顶上 0.1 米这一条）：深梅紫（L 86 / 66 / 44）。
   * 和白灰泥（L 236）、陶砖地（L 177）、木地板（L 190）都拉开 > 60 → 房间的轮廓一眼读出来（就是这里该有的强边缘）。
   * 借 club 组过调色（暗档往蓝紫走）。
   */
  wallCut: s([0x7a4e6e, 0x5c3c5e, 0x382a4e], 0.6, 0.2),
  /**
   * 更衣室、理疗室的地：水青色釉面砖（西班牙 azulejo 的那种青，L 196 / 141 / 82，S 0.36 / 0.55）。暖色调的会所里唯一的冷地面 →
   * "湿区 / 球员区"一眼分开（第一版 #cfe4e6 太浅，S 0.1，里面模式整帧饱和度掉到 0.38）。借 club 组（jug，暗档留青蓝）。
   */
  floorCool: s([0xa2e2dc, 0x4eb0c0, 0x3a5a94], 0.1, 0.05),
  /**
   * 隔墙的里面（会所里的隔墙刷暖赭石色的石灰水，外墙是白灰泥 stucco）：L 206 / 150 / 96。里面模式切开的隔墙一圈暖色，
   * 和白外墙、水青地、陶砖地分得开。借 terracotta 组（cap 一家）。
   */
  plaster: s([0xf6cc94, 0xd8946e, 0x8a5c80], 0.5, 0.4),
  /**
   * 会员休息室、专卖店的橡木地板：蜂蜜色（L 190 / 138 / 82），比 wood（家具、长椅的木头，L 158）亮一截 → 地板和家具分得开。
   * 借 dry 组（wood 一家）。
   */
  floorOak: s([0xe8b87e, 0xbe8462, 0x6e4e7a], 0.1, 0.05),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubplaza（含 clubdesk、clubmap2、clubfront、desert3d-v2）+ HOUSE */
export const PAL = { ...PLAZA_PAL, ...HOUSE } as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;

/** 元素预设：clubplaza 的 + 木地板（长条 16×4 纹素 ≈ 0.7 × 0.18 米的板）、瓷砖（7×7 纹素 ≈ 0.3 米见方） */
export const EL = {
  ...PLAZA_EL,
  floorOak: { kind: 'stones', size: [16, 4], seam: 0.5, hi: 0.3 } as Elem,
  floorCool: { kind: 'stones', size: [7, 7], seam: 0.55, hi: 0.2 } as Elem,
};

/** 这个场景新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）；clubplaza 的池水、花砖照旧 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  wallCut: 'ironwork',
  floorCool: 'jug',
  plaster: 'cap',
  floorOak: 'wood',
};
