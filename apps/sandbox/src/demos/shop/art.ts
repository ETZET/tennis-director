import { type BakedArt, bakeArt, ICON_ART, type IconName, type PixelArt } from '@td/iso';
import type { GoodId } from './data';

/**
 * 球具店的字符画：货架上的商品、HUD 的天气小图、事件卡的半身像。
 * 小写字母都在 pal 里（固定色），不走换色槽位。颜色取自游戏调色板。
 */

const INK = '#2a2238';

function art(rows: readonly string[], pal: Record<string, string>): PixelArt {
  return { rows, ox: Math.floor((rows[0]?.length ?? 1) / 2), oy: rows.length - 1, pal: { o: INK, ...pal } };
}

/** 商品（3/4 俯视里正面看，约 8–12 像素；货架、托盘、拖动、改价面板共用） */
export const GOOD_ART: Record<GoodId, PixelArt> = {
  water: art(
    [
      '...oo...',
      '..occo..',
      '..occo..',
      '.oobboo.',
      'obbbbbbo',
      'obwbbbbo',
      'oyyyyyyo',
      'oyrrryyo',
      'oyyyyyyo',
      'obwbbbbo',
      'obbbbbbo',
      '.oooooo.',
    ],
    { c: '#f3f1ea', b: '#5fc3e4', w: '#e8fbff', y: '#f3f1ea', r: '#2f7fd8' },
  ),
  balls: art(
    [
      '..oooooo..',
      '.oyyyyyyo.',
      'oyywwyyydo',
      'oywyyyyydo',
      'owyyyyyydo',
      'oyyyyyywdo',
      'oyyyyyyydo',
      'oyyyywwydo',
      '.oyyyyydo.',
      '..oooooo..',
    ],
    { y: '#d8e84a', d: '#a8b83a', w: '#f4f1e8' },
  ),
  energy: art(
    [
      '.oooooo.',
      'oggggggo',
      'oooooooo',
      'orrrrrro',
      'orrryrro',
      'orryyrro',
      'oryyyyro',
      'orryyrro',
      'orryrrro',
      'orrrrrro',
      'oggggggo',
      '.oooooo.',
    ],
    { g: '#c9cccd', r: '#d94a3a', y: '#ffd23a' },
  ),
  sunscreen: art(
    [
      '..oooo..',
      '..owwo..',
      '.oooooo.',
      'oaaaaaao',
      'oaasaaao',
      'oassssao',
      'oaasssao',
      'oaassaao',
      'oaaaaaao',
      'oaaaaaao',
      '.oaaaao.',
      '..oooo..',
    ],
    { a: '#f08a3c', s: '#ffd23a', w: '#f3f1ea' },
  ),
  hat: art(
    [
      '....oooo....',
      '...owwwwo...',
      '..owwwwwwo..',
      '..owwwwwwo..',
      '..oaaaaaao..',
      '.oooooooooo.',
      'owwwwwwwwwwo',
      '.oooooooooo.',
    ],
    { w: '#f4f1e8', a: '#3f6fb0' },
  ),
  grip: art(
    [
      '..ooooo..',
      '.owwwwwo.',
      'owlwwwlwo',
      'owwlwlwwo',
      'owwwlwwwo',
      'owwlwlwwo',
      'owlwwwlwo',
      'owwwwwwwo',
      '.owwwwwo.',
      '..ooooo..',
    ],
    { w: '#f4f1e8', l: '#3f6fb0' },
  ),
  racket: art(
    [
      '..ooooo..',
      '.orrrrro.',
      'orswswsro',
      'orwswswro',
      'orswswsro',
      'orwswswro',
      'orswswsro',
      '.orrrrro.',
      '..orrro..',
      '...ogo...',
      '...ogo...',
      '...odo...',
      '...odo...',
      '...ooo...',
    ],
    { r: '#d94a3a', s: '#f4f1e8', w: '#bfb8a8', g: '#5a3d2b', d: '#2a2238' },
  ),
};

/** 天气小图（HUD） */
export const WX_ART: Record<'sun' | 'wind' | 'ball' | 'heat', PixelArt> = {
  sun: art(['..y..', '.yyy.', 'yywyy', '.yyy.', '..y..'], { y: '#ffd23a', w: '#fff6c0', o: '#ffd23a' }),
  heat: art(['..r..', '.ryr.', 'rywyr', '.ryr.', '..r..'], { r: '#ff5a2a', y: '#ffd23a', w: '#fff6c0' }),
  wind: art(['www..', '...w.', 'wwww.', '....w', 'www..'], { w: '#d8ecff' }),
  ball: art(['.yyy.', 'ywyyy', 'yywyy', 'yyywy', '.yyy.'], { y: '#d8e84a', w: '#f4f1e8' }),
};

/** 事件卡的半身像（12×12）：c 帽子 h 头发 s 皮肤 e 眼 t 上衣 b 胡子 */
const BUST = [
  '...oooooo...',
  '..occcccco..',
  '.occcccccco.',
  'occccccccccc',
  '.ohssssssho.',
  '.osessssseo.',
  '.osssssssso.',
  '.osbbbbbbso.',
  '..obbbbbbo..',
  '.ootttttttoo',
  'otttttttttto',
  'otttttttttto',
];
export interface BustLook {
  cap: string;
  hair: string;
  skin: string;
  shirt: string;
  beard?: string;
}
const bustCache = new Map<string, PixelArt>();
export function bustArt(l: BustLook): PixelArt {
  const key = JSON.stringify(l);
  let a = bustCache.get(key);
  if (!a) {
    a = art(BUST, { c: l.cap, h: l.hair, s: l.skin, e: INK, t: l.shirt, b: l.beard ?? l.skin });
    bustCache.set(key, a);
  }
  return a;
}

export const BUSTS: Record<string, BustLook> = {
  dale: { cap: '#2b3440', hair: '#cfcac0', skin: '#f1c7a1', shirt: '#6b2e2a', beard: '#cfcac0' },
  guide: { cap: '#e8d08a', hair: '#5a3a22', skin: '#c48a62', shirt: '#f2b134' },
  coach: { cap: '#1f3a5a', hair: '#2a1d16', skin: '#a86f4c', shirt: '#2f7a49' },
};

/** 一张烘焙好的像素图 → 画布（scale 倍最近邻） */
export function bakedToCanvas(b: BakedArt, scale: number, cv?: HTMLCanvasElement): HTMLCanvasElement {
  const c = cv ?? document.createElement('canvas');
  c.width = b.w * scale;
  c.height = b.h * scale;
  const g = c.getContext('2d');
  if (!g) return c;
  const img = g.createImageData(b.w, b.h);
  new Uint32Array(img.data.buffer).set(b.px);
  if (scale === 1) g.putImageData(img, 0, 0);
  else {
    const t = document.createElement('canvas');
    t.width = b.w;
    t.height = b.h;
    t.getContext('2d')?.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(t, 0, 0, c.width, c.height);
  }
  c.style.imageRendering = 'pixelated';
  return c;
}

export function artCanvas(a: PixelArt, scale: number, cv?: HTMLCanvasElement): HTMLCanvasElement {
  return bakedToCanvas(bakeArt(a), scale, cv);
}

export function iconCanvas(name: IconName, scale: number, cv?: HTMLCanvasElement): HTMLCanvasElement {
  return bakedToCanvas(bakeArt(ICON_ART[name]), scale, cv);
}

export const goodBaked = (g: GoodId): BakedArt => bakeArt(GOOD_ART[g]);
