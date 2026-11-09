// 4 正午漂白：沙、墙晒得发白（亮档抬高、彩度压低），影子是被天光照的浓蓝紫（彩度反而加），对比最强。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'noon',
  name: '正午',
  hint: '晒白的沙和墙、浓蓝紫影子、强对比',
  grade: {
    lit: { c: 0.7, lMul: 0.92, lAdd: 22 },
    mid: { hue: 272, hueK: 0.45, c: 0.55, lAdd: 6 },
    dark: { hue: 272, hueK: 0.8, c: 1.15, cMin: 0.07, cMax: 0.13, lAdd: -6 },
  },
  groups: {
    ground: {
      lit: { hue: 85, hueK: 0.5, c: 0.42, lMul: 0.8, lAdd: 58 },
      mid: { hue: 272, hueK: 1, c: 0.42, lAdd: 6 },
    },
    wall: { lit: { hue: 85, hueK: 0.5, c: 0.3, lMul: 0.8, lAdd: 62 } },
    rock: { lit: { c: 0.55 }, dark: { hue: 268, hueK: 0.85, cMax: 0.11 } },
    plants: { lit: { c: 0.75 }, mid: { hue: 200, hueK: 0.3, c: 0.8 }, dark: { hue: 240, hueK: 0.5, c: 1, cMin: 0.05 } },
    people: {
      mid: { hue: 30, hueK: 0.3, c: 0.75 },
      dark: { follow: 0.5, shift: -40, hue: 290, hueK: 0.4, c: 0.8, cMin: 0 },
    },
  },
  sky: { top: 0x2f86e0, horizon: 0x8ccaf4 },
  sun: 0xfffcf6,
  edgeTint: [0.42, 0.46, 0.86],
};
