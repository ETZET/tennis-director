// 6 午后金（还是白天）：光更暖，亮面偏桃 / 琥珀；影子是玫瑰褐（不是紫）；天边一圈暖雾。
import type { Scheme } from './types';

export const scheme: Scheme = {
  id: 'golden',
  name: '午后',
  hint: '琥珀亮面、玫瑰褐影子、暖天边',
  grade: {
    lit: { hue: 62, hueK: 0.25, c: 1, lAdd: 9 },
    mid: { hue: 40, hueK: 0.35, c: 0.9, lAdd: 4 },
    dark: { hue: 32, hueK: 0.7, c: 0.65, cMax: 0.06 },
  },
  groups: {
    ground: { lit: { hue: 68, hueK: 0.3, c: 0.85 } },
    plants: {
      lit: { hue: 118, hueK: 0.12, c: 0.95 },
      mid: { follow: 0.4, shift: -10, hueK: 0.12, c: 0.9 },
      dark: { follow: 0.5, shift: -20, hue: 170, hueK: 0.3, c: 0.8 },
    },
    court: { lit: { hueK: 0.1 }, mid: { hueK: 0.15 }, dark: { hue: 285, hueK: 0.3, c: 0.9 } },
    club: { lit: { hueK: 0.08 }, mid: { hueK: 0.15 }, dark: { hue: 285, hueK: 0.3, c: 0.9 } },
  },
  sky: { top: 0x5c9ed8, horizon: 0xf2d6a8 },
  sun: 0xffcf96,
  edgeTint: [0.62, 0.46, 0.5],
};
