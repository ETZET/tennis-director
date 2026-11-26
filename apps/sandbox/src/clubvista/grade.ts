// clubvista 默认的配色：午后金光（golden，用户 2026-11-08 选的）的亮档 + 冷的暗档（《垂钓手记》的"受光暖、背光冷"）。
// 只在这个场景里用（clubsite/render/palettes 归颜色代理，不在那里加方案）：?pal=vista（默认）/ ?pal=golden / 别的方案照旧。
// 暗档：色相往 268°（冷灰紫）染、彩度夹在 0.03～0.06（低彩度：参考图路和木板上的影子 #686880），亮度 × 0.94；
// 植物的暗档往青 195°（参考图草上的影子 #388d76 是青绿）。亮档、中档和 golden 一样。
import { scheme as golden } from '../clubsite/render/palettes/golden';
import type { Scheme } from '../clubsite/render/palettes/types';

export const vista: Scheme = {
  ...golden,
  id: 'vista',
  name: '午后冷影',
  hint: '午后金光的亮面 + 低彩度冷灰紫的影子（clubvista）',
  grade: {
    ...golden.grade,
    dark: { hue: 268, hueK: 0.75, c: 0.8, cMin: 0.03, cMax: 0.06, lMul: 0.94 },
  },
  groups: {
    ...golden.groups,
    // 沙地的亮档彩度不压（golden 压到 0.85）：没草没水的屏饱和度全靠它
    ground: { lit: { hue: 68, hueK: 0.3, c: 1 } },
    plants: {
      ...golden.groups?.plants,
      dark: { follow: 0, hue: 195, hueK: 0.6, c: 0.8, cMax: 0.07 },
    },
    water: { lit: { hueK: 0.04 }, mid: { hueK: 0.08 }, dark: { hue: 262, hueK: 0.4, c: 1 } },
  },
};
