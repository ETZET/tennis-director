// 5 印第安维尔斯实景：浅黄褐的沙、灰扑扑的鼠尾草绿和橄榄绿、远处和影子是薰衣草灰、白灰泥墙、陶红瓦、深蓝天。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'wells',
  name: '实景',
  hint: '印第安维尔斯：浅褐沙、灰绿、薰衣草灰影、白墙陶瓦、深蓝天',
  grade: {
    lit: { hue: 80, hueK: 0.08, c: 0.78 },
    mid: { hue: 290, hueK: 0.2, c: 0.65 },
    dark: { hue: 292, hueK: 0.65, c: 0.55, cMax: 0.055 },
  },
  groups: {
    ground: {
      lit: { hue: 82, hueK: 0.55, c: 0.52, lMul: 0.9, lAdd: 26 },
      mid: { hue: 290, hueK: 1, c: 0.4 },
      dark: { hue: 288, hueK: 0.7, c: 0.5 },
    },
    wall: {
      lit: { hue: 85, hueK: 0.7, c: 0.22, lMul: 0.82, lAdd: 50 },
      dark: { hue: 285, hueK: 0.7, c: 0.45 },
    },
    terracotta: {
      lit: { c: 0.85 },
      mid: { follow: 0.5, shift: -10, c: 0.75 },
      dark: { follow: 0.8, shift: -15, hueK: 0, c: 0.5, cMax: 0.055 },
    },
    rock: {
      lit: { hue: 70, hueK: 0.4, c: 0.55 },
      dark: { hue: 285, hueK: 0.8, c: 0.5 },
    },
    plants: {
      lit: { hue: 118, hueK: 0.35, c: 0.55, lAdd: -4 },
      mid: { hue: 140, hueK: 0.3, c: 0.55 },
      dark: { hue: 165, hueK: 0.45, c: 0.6 },
    },
    dry: { lit: { c: 0.7 } },
    court: { lit: { c: 0.9 }, dark: { hue: 262, hueK: 0.3, c: 0.8 } },
    people: { dark: { follow: 0.6, shift: -25, hue: 300, hueK: 0.25, c: 0.6 } },
  },
  sky: { top: 0x2f78d0, horizon: 0x9cc8ec },
  sun: 0xfff6e6,
  edgeTint: [0.52, 0.52, 0.7],
};
