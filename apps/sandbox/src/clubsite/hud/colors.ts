// 界面像素图标的颜色：全部从俱乐部的调色板（clubsite/render/palette.ts）里拿，每种材质三档 [亮, 中, 暗]，暗档偏靛 / 梅紫，
// 和场景是一家人。描边统一用铁艺的暗档（靛黑 #2c2848），投影用更深的 #171230（同旧 HUD 的深影）。
// 字符 → 颜色：icons.ts 的像素格子里每个字母是一种颜色（'.' = 透明）。
import { PAL } from '../render/palette';

const r = (k: keyof typeof PAL, i: 0 | 1 | 2) => PAL[k].ramp[i];

/** 描边、投影 */
export const INK = r('ironwork', 2); // #2c2848
export const INK_SHADOW = 0x171230;
/** 奶油（招牌漆）：字、纸、气泡 */
export const CREAM = r('signPaint', 0); // #fff0c4
export const GOLD = r('flowerYellow', 0); // #ffd23c

/** 像素格子的字符表 */
export const KEYS: Record<string, number> = {
  K: INK,
  k: INK_SHADOW,
  // 奶油 / 纸
  W: r('signPaint', 0),
  w: r('signPaint', 1),
  v: r('signPaint', 2),
  // 金
  Y: r('flowerYellow', 0),
  y: r('flowerYellow', 1),
  o: r('flowerYellow', 2),
  // 俱乐部蓝（柜台漆）
  B: r('counter', 0),
  b: r('counter', 1),
  n: r('counter', 2),
  // 红橙（条纹布）
  R: r('fabricStripe', 0),
  r: r('fabricStripe', 1),
  m: r('fabricStripe', 2),
  // 木头
  T: r('wood', 0),
  t: r('wood', 1),
  u: r('wood', 2),
  // 网球黄绿
  G: r('ball', 0),
  g: r('ball', 1),
  h: r('ball', 2),
  // 冷灰（石头冷档）：金属
  S: r('rockCool', 0),
  s: r('rockCool', 1),
  d: r('rockCool', 2),
  // 棕榈绿
  P: r('palm', 0),
  p: r('palm', 1),
  q: r('palm', 2),
  // 水
  A: r('jug', 0),
  a: r('jug', 1),
  c: r('jug', 2),
  // 皮肤（浅）
  F: r('skinLight', 0),
  f: r('skinLight', 1),
  // 草帽
  X: r('straw', 0),
  x: r('straw', 1),
  // 白（衣服白）
  Z: r('clothWhite', 0),
  z: r('clothWhite', 1),
};

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
