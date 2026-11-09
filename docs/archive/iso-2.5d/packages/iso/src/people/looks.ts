import type { SlotColors } from '../art/format';
import type { PersonOptions } from './types';

/** 戴帽子的发型（cap 槽位画帽子颜色） */
export const CAP_STYLES = new Set(['cap', 'visor']);

/**
 * 人物外观 → 精灵换色表。
 * 没帽子：cap 槽位用头发色；没球拍：racket 槽位透明；拿匹克球拍：racket 用拍子颜色。
 * capOn=false 表示帽子被吹飞了（cap 也换成头发色）。
 */
export function personSlots(o: PersonOptions, capOn = true): SlotColors {
  const hasCap = capOn && !!o.hairStyle && CAP_STYLES.has(o.hairStyle);
  return {
    skin: o.skin,
    hair: o.hair,
    shirt: o.shirt,
    trim: o.trim ?? o.shirt,
    sleeve: o.longSleeve ? (o.sleeve ?? o.shirt) : (o.sleeve ?? o.shirt),
    bottoms: o.shorts,
    socks: o.pants ? o.shorts : (o.socks ?? '#e6e2d6'),
    shoes: o.shoes,
    cap: hasCap ? (o.cap ?? o.hair) : o.hair,
    racket: o.racket ?? o.paddle ?? 'none',
    eye: eyeFor(o.skin),
  };
}

/** 眼睛颜色：深肤色上默认的描边色看不清，换成更深的近黑色，保证正面脸上两个眼点读得出来。 */
function eyeFor(skin: string): string {
  const n = Number.parseInt(skin.slice(1, 7), 16);
  if (!Number.isFinite(n)) return '#2a2238';
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 150 ? '#100b16' : '#2a2238';
}
