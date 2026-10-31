import * as THREE from 'three';

/**
 * 像素表情图标：每个图标是几行字符画，字符对应调色板里的颜色，'.' 是透明。
 * 画到画布上时外面描一圈深色边，最近邻采样放大，保持像素感。
 */

interface IconDef {
  pal: Record<string, string>;
  px: readonly string[];
}

export const ICONS = {
  heart: {
    pal: { R: '#e8463d', r: '#a52a2a', W: '#ffd7d0' },
    px: [
      '..RR...RR..',
      '.RWRR.RRRr.',
      '.RWRRRRRRr.',
      '.RRRRRRRRr.',
      '..RRRRRRr..',
      '...RRRRr...',
      '....RRr....',
      '.....r.....',
    ],
  },
  sweat: {
    pal: { B: '#66c3ff', b: '#2f7fc4', W: '#e6f6ff' },
    px: ['...B...', '...B...', '..BBB..', '.BBBBB.', 'BWBBBBb', 'BWBBBBb', '.BBBBb.', '..bbb..'],
  },
  note: {
    pal: { P: '#3b2a5a' },
    px: ['....PPPP', '....PPPP', '....P..P', '....P..P', '.PPPP.PP', 'PPPPPPPP', 'PPPP.PP.', '.PP.....'],
  },
  anger: {
    pal: { R: '#ff4a3a' },
    px: ['.RR...RR.', '.R.....R.', 'RR.....RR', '.........', 'RR.....RR', '.R.....R.', '.RR...RR.'],
  },
  excl: { pal: { Y: '#ffe14a' }, px: ['.YYY.', '.YYY.', '.YYY.', '.YYY.', '..Y..', '.....', '.YYY.', '.YYY.'] },
  ques: {
    pal: { Y: '#ffe14a' },
    px: ['.YYYY.', 'YY..YY', '....YY', '...YY.', '..YY..', '..YY..', '......', '..YY..', '..YY..'],
  },
  zzz: {
    pal: { Z: '#d8ecff' },
    px: ['....ZZZZ', '......Z.', '.....Z..', '....ZZZZ', 'ZZZZZ...', '...Z....', '..Z.....', '.Z......', 'ZZZZZ...'],
  },
  star: {
    pal: { Y: '#ffe14a', W: '#fff8c8' },
    px: [
      '....Y....',
      '....Y....',
      '...YWY...',
      'YYYYWYYYY',
      '.YYYYYYY.',
      '..YYYYY..',
      '..YY.YY..',
      '.YY...YY.',
      '.Y.....Y.',
    ],
  },
  cloud: {
    pal: { G: '#8e98a3', g: '#6b7581', B: '#7cc4ff' },
    px: [
      '...GGG......',
      '..GGGGG.GG..',
      '.GGGGGGGGGG.',
      'GGGGGGGGGGGG',
      'gGGGGGGGGGGg',
      '.gggggggggg.',
      '..B...B..B..',
      '.B...B..B...',
    ],
  },
  flash: {
    pal: { W: '#ffffff', Y: '#fff4a8' },
    px: [
      '.....W.....',
      '..W..W..W..',
      '...WWYWW...',
      '.WWWYYYWWW.',
      'WWWYYWYYWWW',
      '.WWWYYYWWW.',
      '...WWYWW...',
      '..W..W..W..',
      '.....W.....',
    ],
  },
  sad: { pal: { B: '#7cc4ff' }, px: ['B.....B', 'B.....B', '.......', '.BBBBB.', 'B.....B'] },
  bulb: {
    pal: { Y: '#ffe14a', W: '#fff8c8', G: '#9aa0a3' },
    px: ['.YYYY.', 'YWWYYY', 'YWYYYY', 'YYYYYY', '.YYYY.', '..GG..', '..GG..'],
  },
  fire: {
    pal: { R: '#ff5a2a', Y: '#ffd23a', W: '#fff6c0' },
    px: ['...R....', '..RR..R.', '.RRR.RR.', '.RYRRRR.', 'RRYYRYRR', 'RYYWYYYR', 'RYWWWWYR', '.RYWWYR.'],
  },
} satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

export interface SpriteTex {
  tex: THREE.Texture;
  /** 宽高比 */
  aspect: number;
}

const iconCache = new Map<IconName, SpriteTex>();

/** 图标贴图（画布，缓存）。只在浏览器里调用。 */
export function iconTexture(name: IconName): SpriteTex {
  const hit = iconCache.get(name);
  if (hit) return hit;
  const ic: IconDef = ICONS[name];
  const h = ic.px.length;
  const w = Math.max(...ic.px.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const x = c.getContext('2d') as CanvasRenderingContext2D;
  const on = (i: number, j: number) => j >= 0 && j < h && i >= 0 && i < w && (ic.px[j]?.[i] ?? '.') !== '.';
  for (let j = -1; j <= h; j++)
    for (let i = -1; i <= w; i++) {
      if (on(i, j)) continue;
      if (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1)) {
        x.fillStyle = '#1a1612';
        x.fillRect(i + 1, j + 1, 1, 1);
      }
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (on(i, j)) {
        x.fillStyle = ic.pal[ic.px[j]?.[i] ?? ''] ?? '#fff';
        x.fillRect(i + 1, j + 1, 1, 1);
      }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  const r = { tex: t, aspect: (w + 2) / (h + 2) };
  iconCache.set(name, r);
  return r;
}
