// 2 青影（池塘那样）：影子统一走青 / 蓝绿一家；沙是更浅的奶油色，亮面整体再暖一点。
// 皮肤的影子不跟着变青（会像生病），往玫瑰褐走。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'teal',
  name: '青影',
  hint: '青蓝影子、奶油沙、暖亮面',
  grade: {
    lit: { hue: 70, hueK: 0.12, c: 0.95 },
    mid: { follow: 1, shift: -10, c: 0.7 },
    dark: { hue: 205, hueK: 0.8, c: 0.9, cMax: 0.07 },
  },
  groups: {
    ground: {
      lit: { hue: 86, hueK: 0.4, c: 0.6, lAdd: 10 },
      mid: { hue: 222, hueK: 1, c: 0.24 },
      dark: { hue: 208, hueK: 0.85, c: 0.85, cMax: 0.068 },
    },
    rock: { dark: { hue: 228, hueK: 0.75, c: 0.9 } },
    wall: { dark: { hue: 216, hueK: 0.75, c: 0.8 } },
    terracotta: { mid: { hue: 30, hueK: 0.3, c: 0.8 }, dark: { hue: 220, hueK: 0.6, c: 1.3, cMax: 0.06 } },
    plants: { mid: { hue: 180, hueK: 0.3, c: 0.85 }, dark: { hue: 192, hueK: 0.5, c: 1 } },
    court: { dark: { hue: 238, hueK: 0.4 } },
    people: {
      mid: { follow: 0.6, shift: -20, c: 0.85 },
      dark: { follow: 0.6, shift: -30, hue: 205, hueK: 0.2, c: 0.75 },
    },
  },
  sky: { top: 0x58b4e4, horizon: 0xbce6ee },
  sun: 0xfff0d0,
  edgeTint: [0.45, 0.6, 0.68],
};
