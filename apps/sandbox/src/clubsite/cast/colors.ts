// 演员表的颜色：肤色、发色、衣服色的三档色阶 [亮, 中, 暗]（同 render/palette-base.ts 的人物色：亮档偏暖黄、暗档往紫压，
// 和沙漠里的影子一致）。纯数据：dress.ts 拿它建色阶材质，名册的像素肖像拿它画格子。
// 原有的五个人物色（skinLight / skinTan / skinDark / hair / cloth*）照抄底表，新加的按同样的明度台阶补。
import type { Cloth, HairColor, SkinTone } from './types';

export type Ramp3 = readonly [number, number, number];

export const SKIN: Record<SkinTone, Ramp3> = {
  pale: [0xfcd8b8, 0xe2a294, 0x926684],
  light: [0xf6c69c, 0xda8e80, 0x8a5a7c], // = skinLight
  tan: [0xdc9a66, 0xb2685a, 0x6a426c], // = skinTan
  olive: [0xc8925e, 0x9a6a50, 0x5e4262],
  brown: [0x9e6242, 0x74423a, 0x422a4e], // = skinDark
  deep: [0x7a4a34, 0x5a3230, 0x34203e],
};

export const HAIR: Record<HairColor, Ramp3> = {
  black: [0x3a2c3a, 0x2a1e30, 0x1a1224],
  darkBrown: [0x5a3a3a, 0x40283a, 0x261a30], // = hair
  brown: [0x8a5a3e, 0x643e3a, 0x3a2638],
  auburn: [0xb85a3a, 0x8a3a38, 0x4e2238],
  red: [0xe0703c, 0xb04a36, 0x642a3a],
  blonde: [0xf2cc6e, 0xc89a52, 0x7a5a5a],
  gray: [0xb8b0b8, 0x8a8098, 0x52486a],
  white: [0xf2ece6, 0xc8bccc, 0x7e7298],
};

export const CLOTH: Record<Cloth, Ramp3> = {
  white: [0xf4f0e8, 0xc6bcd4, 0x7a6ea0], // = clothWhite
  cream: [0xf4e2bc, 0xcab098, 0x80688a],
  khaki: [0xd8c08a, 0xa88c6a, 0x5e4e6a],
  tan: [0xc89a6a, 0x9a6c56, 0x5a4060],
  brown: [0x8a5a42, 0x643a3a, 0x3a2440],
  red: [0xe85a48, 0xb43c4c, 0x62285a], // = clothRed
  coral: [0xf8826a, 0xcc5a5e, 0x743a62],
  pink: [0xf6a2b8, 0xc8728e, 0x744a7a],
  orange: [0xf89a3c, 0xd0663a, 0x7a3a4a],
  yellow: [0xffd23c, 0xe49c34, 0x8a5466], // = flowerYellow
  lime: [0xb8e05a, 0x7eaa4e, 0x3e6458],
  green: [0x5aae5a, 0x3a7e54, 0x24485a],
  teal: [0x3cb4a4, 0x2a8890, 0x24506e], // = clothTeal
  sky: [0x8ccaf0, 0x5e94cc, 0x3a568a],
  blue: [0x4a82dc, 0x3a5cac, 0x2a3274], // = clothBlue
  navy: [0x3a4a8a, 0x2a3466, 0x1a1e44],
  purple: [0x9a5ae0, 0x6c40b0, 0x3a2a7a], // = clothPurple
  lavender: [0xc4a8ec, 0x9478c0, 0x544a88],
  gray: [0xa8a4b4, 0x7c7690, 0x48425e],
  charcoal: [0x5e5a6e, 0x403c52, 0x262234],
  black: [0x3a3444, 0x28243a, 0x16142a],
};

/** 眼睛、眉毛（不跟发色走：金发的人眼睛也是深色） */
export const EYE: Ramp3 = [0x3a2c3a, 0x2a1e30, 0x1a1224];

export const SKIN_TONES = Object.keys(SKIN) as SkinTone[];
export const HAIR_COLORS = Object.keys(HAIR) as HairColor[];
export const CLOTHS = Object.keys(CLOTH) as Cloth[];

/** #rrggbb（界面用） */
export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
