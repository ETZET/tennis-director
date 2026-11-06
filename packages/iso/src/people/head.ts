import type { PixelArt } from '../art/format';
import { ADULT, HAIR_OVERLAYS, KID, KID_HAIR_OVERLAYS } from '../art/people';
import { bakeArt } from '../core/art';
import type { BakedArt } from '../core/graph';
import { personSlots } from './looks';
import { KID_SCALE } from './person';
import type { HairStyle, PersonOptions } from './types';

/**
 * 像素头像（每日结算卡"今天的人"，daily-settlement-contract.md）：和地图上的小人同一张站立正面帧、同一套换色和发型，
 * 叠好以后从头顶往下裁 rows 行（默认 9 行：头和肩）。不碰 DOM：返回像素，游戏自己画到画布上（放大用最近邻）。
 * 大肖像（48×48）是以后的名册，不在这里。
 */
export function personHead(o: PersonOptions, rows = 9): BakedArt | null {
  const kid = o.scale != null && o.scale < KID_SCALE;
  const sheet = kid ? KID : ADULT;
  const body = (sheet.anims.idle?.front ?? sheet.anims.idle?.back)?.frames[0];
  if (!body) return null;
  const slots = personSlots(o);
  const b = bakeArt(body, { ...slots, racket: 'none' });
  const style: HairStyle = o.hairStyle ?? 'short';
  const hairSet = (kid ? KID_HAIR_OVERLAYS : HAIR_OVERLAYS) as Partial<
    Record<HairStyle, Partial<Record<string, PixelArt>>>
  >;
  const hairArt = hairSet[style]?.front ?? hairSet.short?.front;
  const h = hairArt ? bakeArt(hairArt, slots) : null;
  // 发型素材的锚点对准身体帧的 head_top 像素（和 Person.applyFrame 一样）
  const ht = body.pts?.head_top ?? [body.ox, body.oy - body.rows.length];
  const hx = h ? ht[0] - h.ox : 0;
  const hy = h ? ht[1] - h.oy : 0;
  const x0 = Math.min(0, h ? hx : 0);
  const y0 = Math.min(0, h ? hy : 0);
  const x1 = Math.max(b.w, h ? hx + h.w : 0);
  const w = x1 - x0;
  const out = new Uint32Array(w * rows);
  const blit = (a: BakedArt, dx: number, dy: number) => {
    for (let j = 0; j < a.h; j++) {
      const y = dy + j - y0;
      if (y < 0 || y >= rows) continue;
      for (let i = 0; i < a.w; i++) {
        const c = a.px[j * a.w + i] as number;
        if (c) out[y * w + (dx + i - x0)] = c;
      }
    }
  };
  blit(b, 0, 0);
  if (h) blit(h, hx, hy);
  return { w, h: rows, ox: Math.round(w / 2), oy: rows, px: out };
}
