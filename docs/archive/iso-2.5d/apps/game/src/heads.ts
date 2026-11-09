import { personHead } from '@td/iso';
import { DIRECTOR } from '@td/sim';
import { DIRECTOR_LOOK, LOOKS } from './scene';

/**
 * 每日结算卡"今天的人"的像素头像（daily-settlement-contract.md）：和地图上的小人同一张站立正面帧、同一套换色，
 * 用 @td/iso 的 personHead 裁出头和肩，画到小画布上转成 data URL（放大交给 CSS 的最近邻）。外观不变就不重画。
 */
const cache = new Map<string, { key: string; url: string | undefined }>();

export function headOf(id: string): string | undefined {
  const look = id === DIRECTOR ? DIRECTOR_LOOK : LOOKS[id];
  if (!look) return undefined;
  const key = JSON.stringify(look);
  const hit = cache.get(id);
  if (hit?.key === key) return hit.url;
  let url: string | undefined;
  const art = personHead({ name: id, x: 0, z: 0, ...look });
  if (art && typeof document !== 'undefined') {
    // 画成正方形，人放在底部中间（头像框是 32 × 32）
    const n = Math.max(art.w, art.h);
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const g = c.getContext('2d');
    if (g) {
      const img = g.createImageData(art.w, art.h);
      new Uint32Array(img.data.buffer).set(art.px);
      g.putImageData(img, Math.floor((n - art.w) / 2), n - art.h);
      url = c.toDataURL();
    }
  }
  cache.set(id, { key, url });
  return url;
}
