// clubgolf 的调色板 = clubplaza 的整张表（= clubdesk + clubmap2 + clubmap + 渲染核心的表：沙、碎花岗岩、石头、植物、人、池水……）
// + 这个场景新加的几种（GOLF）。沙漠高尔夫的大面积几乎都是现成的：
// - 球道草 `lawn`、修剪条纹 `lawnStripe`（clubmap）、果岭 `green`（clubmap2，比球道亮）—— 三种都归 plants 组；
// - 沙漠砂石地 = 碎花岗岩 `granite`（clubdesk，ground 组）；墙外的沙漠 `sand`；球车道 = 踩实的钙质土 `path`（比沙浅、比沙冷，引导视线）；
// - 水塘 = 喷泉池水 `fountainWater`（clubplaza：彩度高的青，借 club 组过午后调色，影子里还是蓝的）；塘沿、发球台矮墙 = 冷石 `rockCool`；
// - 墙 `adobe` / `cap`。
// 新加的只有三种（白模的地面就用上，资产阶段照这里画；规矩同 clubdesk/palette.ts：每档 [本色, 高一级, 低一级]、暗档换冷色相）：
// - rough（长草）：比球道草深、偏青，一圈 1 米包住岛，岛的轮廓靠它出来；
// - bunker（沙坑的白沙）：比沙漠的沙白、冷、亮（L 226 vs 沙 186），"修剪整齐 vs 沙漠"之外的第三种地面，一眼不和沙漠混；
// - cartBody（球车的车身）：奶白，比 clothWhite 暖一点（俱乐部的车），白模里只有 ?accent=2 用到。
// 这几种不在 clubsite/render/palettes 的 GROUP 表里 → main.ts 的 palOpts 按 PROXY 借同组调色（照 clubplaza 的做法）。
// L = 0.2126R + 0.7152G + 0.0722B。

import { EL as PLAZA_EL, PAL as PLAZA_PAL, PROXY as PLAZA_PROXY, SKY as PLAZA_SKY } from '../clubplaza/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });

const GOLF = {
  /** 长草（rough）：球道草 lawn #7cb543 的深一档、偏青（L 133 / 102 / 72），暗档青蓝绿 —— 岛边一圈深色，草和砂石地的界线清楚 */
  rough: s([0x5ea044, 0x3f8250, 0x285a60], 0.05, 0),
  /** 沙坑的白沙（L 226 / 186 / 118）：比沙漠的沙（#f2c890 一族）白、冷；暗档淡紫（坑壁朝镜头的那一条） */
  bunker: s([0xfaead2, 0xdcc4b8, 0x8e78a8], 0.08, 0),
  /** 球车车身（奶白，L 232 / 190 / 120） */
  cartBody: s([0xf6eedc, 0xd2c0c0, 0x84769e], 0.6, 0.5),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubplaza（含 clubdesk、clubmap2、clubmap、渲染核心）+ GOLF */
export const PAL = { ...PLAZA_PAL, ...GOLF } as const;
export type Pal = typeof PAL;
export const SKY = PLAZA_SKY;
export const EL = PLAZA_EL;

/** 这个场景新加的材质借哪个材质名过配色方案的 grade（main.ts 的 palOpts 用）；clubplaza 的池水、花砖照旧 */
export const PROXY: Partial<Record<keyof Pal, keyof Pal>> = {
  ...(PLAZA_PROXY as Partial<Record<keyof Pal, keyof Pal>>),
  rough: 'lawn',
  bunker: 'path',
  cartBody: 'clothWhite',
};
