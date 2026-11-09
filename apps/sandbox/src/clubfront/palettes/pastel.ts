// 3 柔和 / 温馨（星露谷那样）：整体降饱和、对比收一点（亮档压一点、暗档抬一点，规则线不破：
// 暗档高一级还在 120 以下、亮档低一级还在 170 以上）；沙偏桃粉、植物偏薄荷绿、影子是浅丁香紫，天边一点桃色；描边轻一点。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'pastel',
  name: '柔和',
  hint: '低饱和、轻对比、桃粉沙、丁香紫影',
  grade: {
    lit: { hue: 60, hueK: 0.15, c: 0.72, lMul: 0.92, lAdd: 16 },
    mid: { hue: 20, hueK: 0.15, c: 0.6, lMul: 0.9, lAdd: 16 },
    dark: { hue: 300, hueK: 0.8, c: 0.62, cMax: 0.058, lMul: 0.78, lAdd: 22 },
  },
  groups: {
    ground: { lit: { hue: 62, hueK: 0.4, c: 0.62, lMul: 0.92, lAdd: 20 } },
    plants: {
      lit: { hue: 145, hueK: 0.35, c: 0.8 },
      mid: { hue: 150, hueK: 0.2, c: 0.7 },
      dark: { hue: 200, hueK: 0.4, c: 0.6 },
    },
    people: { dark: { follow: 0.6, shift: -30, hue: 330, hueK: 0.2, c: 0.65 } },
  },
  sky: { top: 0x94c4ec, horizon: 0xf4dcd0 },
  sun: 0xfff4e0,
  edgeTint: [0.66, 0.62, 0.78],
  edges: { depthStrength: 0.36, normalStrength: 0.5 },
};
