// 7 现代度假村（克制）：米白 / 沙色 / 炭灰，影子是中性的石板灰；只留一个强颜色 —— 俱乐部蓝（柜台、条纹、招牌、球场）。
import type { Scheme } from './types';

const CHARCOAL = {
  lit: { hue: 60, hueK: 0.3, c: 0.3, lMul: 0.7 },
  mid: { c: 0.3, lMul: 0.8 },
  dark: { hue: 255, hueK: 0.5, c: 0.3, lMul: 0.85 },
};

export const scheme: Scheme = {
  id: 'resort',
  name: '度假',
  hint: '米白、沙色、炭灰，只留俱乐部蓝',
  grade: {
    lit: { c: 0.55, lAdd: 6 },
    mid: { c: 0.45 },
    dark: { hue: 255, hueK: 0.5, c: 0.35, cMax: 0.035, lAdd: -6 },
  },
  groups: {
    ground: { lit: { hue: 80, hueK: 0.6, c: 0.36, lMul: 0.85, lAdd: 40 } },
    wall: { lit: { hue: 80, hueK: 0.6, c: 0.15, lMul: 0.8, lAdd: 55 }, dark: { c: 0.3 } },
    terracotta: { lit: { hue: 72, hueK: 0.5, c: 0.45 } },
    rock: { lit: { c: 0.45 } },
    plants: { lit: { hue: 140, hueK: 0.2, c: 0.6 }, dark: { hue: 200, hueK: 0.4, c: 0.6, cMax: 0.045 } },
    people: { lit: { c: 0.7 } },
    accent: { lit: { c: 0.6 } },
  },
  keys: {
    counter: 'keep',
    canvasStripe: 'keep',
    signBoard: 'keep',
    court: 'keep',
    courtBleach: 'keep',
    courtBleachCore: 'keep',
    courtCrack: 'keep',
    ball: 'keep',
    timber: CHARCOAL,
    wood: CHARCOAL,
    woodWeathered: CHARCOAL,
    ironwork: CHARCOAL,
  },
  sky: { top: 0x6eb2e2, horizon: 0xdcecf2 },
  sun: 0xfffaf0,
  edgeTint: [0.5, 0.52, 0.58],
};
