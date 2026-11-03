import { ICON_ART, type IconName } from '../art/icons';
import { bakeArt } from '../core/art';
import type { BakedArt } from '../core/graph';

/**
 * 表情图标：art/icons 的 ICON_ART（旧版 13 个原样搬过来再加了几个，已经描好边，锚点在底边中间）。
 * 这里只负责烘焙和缓存，纯数据，不碰 DOM。
 */

export type { IconName };

/** 漫画字、图标的描边色 */
export const INK = '#1a1612';

/** '#rrggbb' → ImageData 的 ABGR 打包色 */
export function packHex(hex: string): number {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

/** 图标的像素图（bakeArt 自己缓存）。 */
export function iconArt(name: IconName): BakedArt {
  return bakeArt(ICON_ART[name]);
}
