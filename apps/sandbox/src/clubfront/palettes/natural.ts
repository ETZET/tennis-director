// 1 自然沙漠：影子是暖中性的赭褐 / 土灰（跟着亮面的色相走，不往紫转）；沙更浅、不那么橙（偏黄褐）；
// 植物是灰绿（鼠尾草）；陶砖、土坯照实物的颜色。轮廓压暗也偏暖。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'natural',
  name: '自然',
  hint: '赭褐影子、浅黄褐沙、灰绿植物',
  grade: {
    lit: { c: 0.85 },
    mid: { follow: 0.6, shift: -12, c: 0.7 },
    dark: { follow: 0.85, shift: -18, c: 0.55, cMax: 0.06 },
  },
  groups: {
    ground: {
      lit: { hue: 84, hueK: 0.55, c: 0.62, lAdd: 8 },
      mid: { follow: 0.8, shift: -14, c: 0.6 },
      dark: { follow: 0.9, shift: -16, c: 0.45, cMax: 0.045 },
    },
    rock: {
      lit: { c: 0.8 },
      dark: { follow: 0.9, shift: -10, c: 0.5, cMax: 0.06 },
    },
    wall: {
      lit: { hue: 70, hueK: 0.4, c: 0.8 },
      dark: { follow: 0.9, shift: -16, c: 0.45, cMax: 0.05 },
    },
    terracotta: {
      lit: { c: 0.95 },
      dark: { follow: 0.9, shift: -12, c: 0.6 },
    },
    plants: {
      lit: { hue: 125, hueK: 0.4, c: 0.65 },
      mid: { follow: 0.7, shift: 8, c: 0.65 },
      dark: { follow: 0.85, shift: 14, c: 0.7, cMax: 0.06 },
    },
    court: { lit: { c: 0.95 }, dark: { follow: 0.8, shift: 0, c: 0.8 } },
    people: { dark: { follow: 0.8, shift: -15, c: 0.6 } },
  },
  sky: { top: 0x6aaee0, horizon: 0xc6e0ec },
  sun: 0xfff2dc,
  edgeTint: [0.56, 0.5, 0.48],
};
