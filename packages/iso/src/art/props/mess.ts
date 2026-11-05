import type { PixelArt } from '../format';

/**
 * 球场上的球和垃圾（场地可用度的 litter，court-care-contract.md）：一个个贴地的小像素块，
 * 锚点是落地点。比真东西大好几倍（一颗网球 4 像素宽），手机上从总览也看得出"场上散着东西"。
 * 固定颜色（数字），不换色；0 是落在地上的一点影子。
 */

const S = '#28303a';

/** 一颗网球（亮黄绿，左上高光，右下一点影子） */
const ball: PixelArt = {
  rows: ['.75.', '7556', '.660'],
  ox: 2,
  oy: 2,
  pal: { '5': '#d7e64a', '6': '#a8b83a', '7': '#f4f8a8', '0': S },
};

/** 倒在地上的塑料水瓶（蓝盖、透明瓶身） */
const bottle: PixelArt = {
  rows: ['.11112', '441122', '.22220'],
  ox: 3,
  oy: 2,
  pal: { '4': '#2f6fd0', '1': '#eef7fa', '2': '#9cc7d8', '0': S },
};

/** 一只红色易拉罐 */
const can: PixelArt = {
  rows: ['993', '333', '330'],
  ox: 1,
  oy: 2,
  pal: { '9': '#e8e8e8', '3': '#d6362f', '0': S },
};

/** 一片吹进来的枯叶 */
const leaf: PixelArt = {
  rows: ['..48', '.448', '448.'],
  ox: 2,
  oy: 2,
  pal: { '4': '#c09452', '8': '#8a6a35' },
};

/** 揉成一团的纸巾 / 包装纸 */
const wrap: PixelArt = {
  rows: ['.1.', '122', '220'],
  ox: 1,
  oy: 2,
  pal: { '1': '#ffffff', '2': '#d8d2c2', '0': S },
};

export const MESS_PROPS = { ball, bottle, can, leaf, wrap } as const;
export type MessProp = keyof typeof MESS_PROPS;
