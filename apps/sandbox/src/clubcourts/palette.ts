// clubcourts 的调色板 = clubdesk 的整张表（= clubmap2 + clubmap + clubfront + desert3d-v2 + 前台的 granite / slate / brass，只读 import）
// + 这个场景新加的两种"湿"的硬地（喷雾滴下来的水洼、刮水之前）。硬地的青蓝 `court`、外场绿 `surround`、白线 `line`、
// 场上积的沙 `sandDrift`、红土 `clay`（地图那个，红土代理统一调过）都用现成的。
// 规则同 clubsite/render/palette.ts：每档 [本色, 高一级, 低一级]，高/低一级差 6～12，缝 −10…−20、亮边 +15…+20；暗档换冷色相，不是亮档乘系数。
// L = 0.2126R + 0.7152G + 0.0722B（sRGB 原值）。
//
// 新名字不在 clubsite/render/palettes 的 GROUP 表里：main.ts 的 GROUP_AS 让 courtWet 按 `court` 组、surroundWet 按 `surround` 组调色
// （同一家颜色，同一种调法；只吃全局调色的话亮档会被往金色染 25%，蓝的湿面发灰 —— 匹克球场面就是这么灰的，见 material-spec.md）。

import { EL as DESK_EL, PAL as DESK_PAL, SKY as DESK_SKY } from '../clubdesk/palette';
import type { Swatch } from '../clubsite/render/palette';
import type { Elem, Tones } from '../clubsite/render/toon';

type Ramp = [number, number, number];
const s = (ramp: Ramp, edge: number, convex: number, tones?: Tones): Swatch => ({ ramp, edge, convex, tones });
/** tn(亮, 中, 暗, 缝, 亮边)：每档 [本色, 高一级, 低一级] */
const tn = (lit: Ramp, mid: Ramp, dark: Ramp, seam: Ramp, hi: Ramp): Tones => ({ bands: [lit, mid, dark], seam, hi });

const WET = {
  /**
   * 湿的硬地内场（喷雾滴下来的水洼、刮水之前）：比 `court`（L 148）暗 33、彩度更高 —— 水洼读成"更深更艳的一块蓝"，
   * 和人、伞的投影（暗档靛蓝 L 74）靠亮度和形状分开（水洼是一团弯边、边上一圈 1 纹素的亮反光）。
   */
  courtWet: s(
    [0x1688bb, 0x1a679e, 0x24407e],
    0.05,
    0,
    tn(
      [0x1688bb, 0x1a8ec2, 0x1282b2], // L 115 / 121 / 110
      [0x1a679e, 0x1e6da4, 0x166198], // L 91 / 95 / 86
      [0x24407e, 0x284684, 0x213a76], // L 63 / 68 / 58
      [0x0f78a6, 0x155c90, 0x1e346c], // 缝（水最深的地方）−10 / −9 / −8
      [0x2898c8, 0x2676ac, 0x2e4c8a], // 亮边（水面反光）+16 / +9 / +6
    ),
  ),
  /** 湿的外场绿（水洼漫到场边的那一截）：比 `surround`（L 153）暗 29 */
  surroundWet: s(
    [0x2e9660, 0x217a5e, 0x27506a],
    0.05,
    0,
    tn(
      [0x2e9660, 0x339c66, 0x2a905a], // L 124 / 130 / 118
      [0x217a5e, 0x258064, 0x1e7458], // L 101 / 106 / 96
      [0x27506a, 0x2a5670, 0x244a64], // L 70 / 75 / 65
      [0x26864f, 0x1a6a50, 0x20445e],
      [0x3eaa70, 0x2c8a6a, 0x305c78],
    ),
  ),
} as const satisfies Record<string, Swatch>;

/** 整张表：clubdesk（含 clubmap2、clubmap 的 clay、clubfront、desert3d-v2）+ WET */
export const PAL = { ...DESK_PAL, ...WET } as const;
export type Pal = typeof PAL;
export const SKY = DESK_SKY;

/** 新名字按哪个 GROUP 调色（main.ts 的 palOpts 用） */
export const GROUP_AS: Partial<Record<keyof Pal, keyof Pal>> = { courtWet: 'court', surroundWet: 'surround' };

/**
 * 元素预设：clubdesk 的（sand / strata / path / water / foam / tile / flagstone / adobe / granite）+ 白模阶段硬地的近似
 * （stage 2 的 hard-court 资产代理从零画：漆面的低频深浅块、积沙的波纹和边、水洼的反光边）。
 */
export const EL = {
  ...DESK_EL,
  /** 硬地漆面（内场、外场）：大块低频深浅 + 很少的擦痕（俱乐部的场是新漆的，不是 desert3d-v2 那片晒旧的） */
  hard: { kind: 'paint', size: [26, 14], density: [0, 0.02], patch: 5 },
  /** 水洼：深浅不匀 + 少量更深的点 */
  wet: { kind: 'paint', size: [12, 7], density: [0, 0.08], patch: 2 },
  /** 场上积的沙：波纹（窄长的浅条）+ 少量碎粒 */
  drift: { kind: 'pebbles', size: [9, 3], seam: 0.25, density: [0.02, 0.1], patch: 2, pebbles: 0.02 },
  /** 红土（地图那个，横屏右下露出 outer_2 的西半）：同 clubclay 的 EL.clay */
  clay: { kind: 'paint', size: [22, 13], density: [0, 0.04], patch: 4 },
} as const satisfies Record<string, Elem>;
