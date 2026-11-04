/**
 * 社交媒体 demo 的字符画素材：头像脸、星星、图标、语气贴纸、手、场景里的评论气泡。
 * 全部是 PixelArt 字符画，用 @td/iso 的 bakeArt 烘焙（换色走槽位），再画到小 canvas 上用 CSS 像素放大。
 */
import { type BakedArt, bakeArt, ICON_ART, type IconName, type PixelArt, type SlotColors } from '@td/iso';

/** 人物外观里头像要用到的几项（来自 Person 的选项） */
export interface FaceLook {
  skin: string;
  hair: string;
  shirt: string;
  hairStyle?: string;
  cap?: string;
}
export type Mood = 'happy' | 'angry' | 'meh' | 'shock' | 'smug' | 'sad';

export const INK = '#2a2238';

/** 给字符画外面描一圈（4 邻域），描边字符 c；宽高各加 2 */
export function outline(rows: readonly string[], c = 'O'): string[] {
  const w = Math.max(...rows.map((r) => r.length));
  const g = [Array(w + 2).fill('.')];
  for (const r of rows) g.push(['.', ...r.padEnd(w, '.'), '.']);
  g.push(Array(w + 2).fill('.'));
  const out = g.map((r) => [...r]);
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < w + 2; x++) {
      if (g[y]?.[x] !== '.') continue;
      const n = [g[y - 1]?.[x], g[y + 1]?.[x], g[y]?.[x - 1], g[y]?.[x + 1]];
      if (n.some((v) => v && v !== '.')) (out[y] as string[])[x] = c;
    }
  return out.map((r) => r.join(''));
}

/** 把字符串数组某格换成字符 */
function put(rows: string[], x: number, y: number, c: string): void {
  const r = rows[y];
  if (!r || x < 0 || x >= r.length) return;
  rows[y] = r.slice(0, x) + c + r.slice(x + 1);
}

/* ---------------- 头像脸（12×12，外加描边） ---------------- */

const FACE_PAL = {
  '1': INK,
  '2': '#b8343a',
  '3': '#f28a8a',
  '4': '#66c3ff',
  '5': '#121218',
  '6': '#9ad8ff',
  '7': '#5b5664',
  '8': '#3e3a46',
  '9': '#ff4a3a',
} as const;

function hairRows(style: string): string[] {
  const top = {
    short: ['...HHHHHH...', '.HHHHHHHHHH.', 'HHHHHHHHHHHH', 'HHSSSSSSSSHH'],
    curly: ['.HH.HHHH.HH.', 'HHHHHHHHHHHH', 'HHHHHHHHHHHH', 'HHSSHSSHSSHH'],
    bald: ['............', '...SSSSSS...', '.SSSSSSSSSS.', 'HSSSSSSSSSSH'],
    cap: ['...CCCCCC...', '.CCCCCCCCCC.', 'CCCCCCCCCCCC', 'CCCCCCCCCCCC'],
    visor: ['...HHHHHH...', '.HHHHHHHHHH.', 'CCCCCCCCCCCC', 'HHSSSSSSSSHH'],
    hood: ['...777777...', '.7777777777.', '777777777777', '778888888877'],
  } as Record<string, string[]>;
  const t = top[style] ?? top.short ?? [];
  const face = [
    'HSSSSSSSSSSH',
    'HSSESSSSESSH',
    '.SSSSSSSSSS.',
    '.SSSSSSSSSS.',
    '..SSSSSSSS..',
    '....SSSS....',
    '..TTTTTTTT..',
    '.TTTTTTTTTT.',
  ];
  const rows = [...t, ...face];
  if (style === 'long' || style === 'pony') {
    for (let y = 4; y < 9; y++) {
      put(rows, 0, y, 'H');
      put(rows, 11, y, 'H');
    }
    if (style === 'long') for (let y = 6; y < 9; y++) put(rows, 1, y, 'H');
  }
  if (style === 'cap' || style === 'bald') {
    put(rows, 0, 4, style === 'bald' ? 'H' : 'S');
    put(rows, 11, 4, style === 'bald' ? 'H' : 'S');
  }
  if (style === 'hood') {
    for (let y = 4; y < 10; y++) {
      put(rows, 0, y, '7');
      put(rows, 11, y, '7');
      for (let x = 1; x < 11; x++) if (rows[y]?.[x] === 'S') put(rows, x, y, '8');
    }
    put(rows, 3, 5, '9');
    put(rows, 8, 5, '9');
  }
  return rows;
}

/** 头像脸：外观来自场景里那个人（同样的肤色、发色、上衣），表情换嘴和眉 */
export function faceArt(look: FaceLook, mood: Mood, o: { hood?: boolean; shades?: boolean } = {}): PixelArt {
  const style = o.hood ? 'hood' : (look.hairStyle ?? 'short');
  const r = hairRows(style);
  const ink = o.hood ? '9' : '1';
  if (!o.hood) {
    if (mood === 'happy') {
      put(r, 3, 5, '1');
      put(r, 8, 5, '1');
      put(r, 3, 4, '1');
      put(r, 8, 4, '1');
      put(r, 3, 5, 'S');
      put(r, 8, 5, 'S');
      put(r, 2, 5, '1');
      put(r, 4, 5, '1');
      put(r, 7, 5, '1');
      put(r, 9, 5, '1');
      for (const x of [4, 7]) put(r, x, 7, '1');
      for (const x of [5, 6]) put(r, x, 7, '2');
      for (const x of [5, 6]) put(r, x, 8, '1');
      put(r, 2, 6, '3');
      put(r, 9, 6, '3');
    } else if (mood === 'angry') {
      put(r, 2, 4, '1');
      put(r, 3, 4, '1');
      put(r, 8, 4, '1');
      put(r, 9, 4, '1');
      put(r, 4, 4, '1');
      put(r, 7, 4, '1');
      for (const x of [5, 6]) put(r, x, 7, '1');
      put(r, 4, 8, '1');
      put(r, 7, 8, '1');
      put(r, 2, 6, '9');
      put(r, 9, 6, '9');
    } else if (mood === 'shock') {
      put(r, 3, 3, '1');
      put(r, 8, 3, '1');
      for (const x of [5, 6]) {
        put(r, x, 7, '1');
        put(r, x, 8, '1');
      }
    } else if (mood === 'smug') {
      for (const x of [6, 7]) put(r, x, 7, '1');
      put(r, 8, 6, '1');
      put(r, 3, 4, '1');
      put(r, 4, 4, '1');
    } else if (mood === 'sad') {
      for (const x of [5, 6]) put(r, x, 7, '1');
      put(r, 4, 8, '1');
      put(r, 7, 8, '1');
      put(r, 3, 6, '4');
      put(r, 3, 7, '4');
    } else {
      for (const x of [4, 5, 6, 7]) put(r, x, 7, '1');
    }
  } else {
    // 喷子：兜帽里只看得见两只红眼和一道歪嘴
    for (const x of [4, 5, 6]) put(r, x, 7, ink);
    put(r, 7, 8, ink);
  }
  if (o.shades) {
    for (const x of [2, 3, 4, 7, 8, 9]) put(r, x, 5, '5');
    for (const x of [5, 6]) put(r, x, 5, '5');
    for (const x of [2, 3, 4, 7, 8, 9]) put(r, x, 4, rowCh(r, x, 4));
    put(r, 3, 5, '6');
    put(r, 8, 5, '6');
    // 墨镜的人笑得很假
    for (const x of [4, 5, 6, 7]) put(r, x, 7, '1');
    put(r, 3, 6, '1');
    put(r, 8, 6, '1');
  }
  return { rows: outline(r), ox: 7, oy: 13, pal: FACE_PAL };
}

function rowCh(r: string[], x: number, y: number): string {
  return r[y]?.[x] ?? '.';
}

/** 头像的换色表（槽位名） */
export function faceSlots(look: FaceLook): SlotColors {
  return {
    skin: look.skin,
    hair: look.hair,
    shirt: look.shirt,
    cap: look.cap ?? look.hair,
    eye: INK,
    outline: INK,
  };
}

/* ---------------- 星星 ---------------- */

const STAR_ROWS = ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.'];
const STAR_FULL: PixelArt = { rows: outline(STAR_ROWS, 'k'), ox: 4, oy: 8, pal: { y: '#ffd23a', k: INK } };
const STAR_EMPTY: PixelArt = { rows: outline(STAR_ROWS, 'k'), ox: 4, oy: 8, pal: { y: '#6c7488', k: INK } };
const STAR_HALF: PixelArt = {
  rows: outline(
    STAR_ROWS.map((r) => [...r].map((c, i) => (c === 'y' && i > 3 ? 'g' : c)).join('')),
    'k',
  ),
  ox: 4,
  oy: 8,
  pal: { y: '#ffd23a', g: '#6c7488', k: INK },
};
const STAR_RED: PixelArt = { rows: outline(STAR_ROWS, 'k'), ox: 4, oy: 8, pal: { y: '#ff6a4a', k: INK } };

/* ---------------- 图标（固定色，小写字母查 pal） ---------------- */

const IP = {
  k: INK,
  w: '#f6f3ea',
  y: '#ffd23a',
  o: '#e8a33a',
  r: '#e8463d',
  d: '#a52a2a',
  g: '#8c9298',
  h: '#5b6270',
  b: '#5fb2ff',
  n: '#3fae5a',
  p: '#ff8fb0',
  s: '#f2c9a2',
  c: '#2f7fd8',
  m: '#c9962a',
  t: '#1d2f4e',
};

function icon(rows: string[]): PixelArt {
  const r = outline(rows, 'k');
  return { rows: r, ox: Math.floor((r[0]?.length ?? 0) / 2), oy: r.length - 1, pal: IP };
}

export const ART = {
  reply: icon([
    '.wwwwwwwwwwww.',
    'wwwwwwwwwwwwww',
    'wwkkwwkkwwkkww',
    'wwkkwwkkwwkkww',
    'wwwwwwwwwwwwww',
    '.wwwwwwwwwwww.',
    '..www.........',
    '..ww..........',
    '..w...........',
  ]),
  gift: icon([
    '..rr....rr..',
    '...rr..rr...',
    '....rrrr....',
    'yyyyyrryyyyy',
    'oooooddooooo',
    '.yyyyrryyyy.',
    '.yyyyrryyyy.',
    '.yyyyrryyyy.',
    '.oooorroooo.',
  ]),
  flag: icon([
    'gg.........',
    'grrrrrrr...',
    'grrrrrrrrrr',
    'grrrwwrrrr.',
    'grrrwwrrrrr',
    'grrrrrrrr..',
    'gg.........',
    'gg.........',
    'gg.........',
    'ggg........',
  ]),
  trash: icon([
    '....hhhh....',
    'gggggggggggg',
    'hhhhhhhhhhhh',
    '.gwgggwgggg.',
    '.gwghgwghgg.',
    '.gwghgwghgg.',
    '.gwghgwghgg.',
    '.gggggggggg.',
    '..hhhhhhhh..',
  ]),
  camera: icon([
    '...hhh......',
    'gggggggggggg',
    'ghhhkkkkhhyg',
    'ghhkbbbbkhhg',
    'ghhkbwbbkhhg',
    'ghhkbbbbkhhg',
    'ghhhkkkkhhhg',
    'gggggggggggg',
  ]),
  bag: icon([
    '...kk.kk...',
    '....kkk....',
    '...yyyyy...',
    '..yyyyyyy..',
    '.yyyykyyyy.',
    'yyyykkkyyyy',
    'yyyyykyyyyy',
    'yyyykkkyyyy',
    '.yyyykyyyy.',
    '..ooooooo..',
  ]),
  ticket: icon(['yyyyyyyyyyyy', 'yyokyyyyyyyy', '.yokyrryryy.', '.yykyrryryy.', 'yyokyyyyyyyy', 'yyyyyyyyyyyy']),
  heartTalk: icon([
    '.wwwwwwwwwwww.',
    'wwwrrwwwrrwwww',
    'wwrrrrwrrrrwww',
    'wwrrrrrrrrrwww',
    'wwwrrrrrrrwwww',
    'wwwwwrrrwwwwww',
    '.wwwwwrwwwwww.',
    '..www.........',
    '..w...........',
  ]),
  fist: icon([
    '.r...r...r.',
    '..r..r..r..',
    '...........',
    '..ssssss...',
    '.sskskskss.',
    '.ssssssssss',
    '.sssssssss.',
    '..sssssss..',
    '...ccccc...',
    '...ccccc...',
  ]),
  cat: icon([
    'o........o.',
    'oo......oo.',
    'ooooooooooo',
    'okoooooooko',
    'okooooooko.',
    'ooppokoppoo',
    'ooookkkoooo',
    '.ooooooooo.',
  ]),
  coin: icon(['..yyyy..', '.yyoyyy.', 'yyoyyyyy', 'yyoyyyyy', 'yyoyyyyy', '.yyyyyy.', '..oooo..']),
  heart: icon(['.pp..pp.', 'pppppppp', 'pppppppp', '.pppppp.', '..pppp..', '...pp...']),
  pin: icon(['.rrrr.', 'rrwwrr', 'rrwwrr', '.rrrr.', '..rr..', '..r...']),
  pinQ: icon(['.gggg.', 'ggwwgg', 'gggwgg', '.ggwg.', '..gg..', '..g...']),
  speaker: icon(['...w....', '..ww..w.', 'wwww.w..', 'wwww.w..', '..ww..w.', '...w....']),
  speakerOff: icon(['...w....', '..ww.r.r', 'wwww..r.', 'wwww.r.r', '..ww....', '...w....']),
  shutter: icon([
    '...wwww...',
    '.wwkkkkww.',
    '.wkbbbbkw.',
    'wkbbwbbbkw',
    'wkbbbbbbkw',
    '.wkbbbbkw.',
    '.wwkkkkww.',
    '...wwww...',
  ]),
  /** 门口来人统计：进门 / 掉头 */
  doorIn: icon(['.nnnn.', 'nwwwwn', 'nwnnwn', 'nwnnwn', 'nwnnyn', 'nwnnwn', 'nnnnnn']),
  /** 草地场照片（托儿的破绽：我们没有草地场） */
  grassCourt: icon([
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nwwwwwwwwwwwwwwwwwwwwwwwwwwn',
    'nwnnnnnnnnnnnnnnnnnnnnnnnnwn',
    'nwnnnnnnnnnnnnnnnnnnnnnnnnwn',
    'nwnnnnnnnnnnnnwnnnnnnnnnnnwn',
    'nwwwwwwwwwwwwwwwwwwwwwwwwwwn',
    'nwnnnnnnnnnnnnwnnnnnnnnnnnwn',
    'nwnnnnnnnnnnnnnnnnnnnnnnnnwn',
    'nwnnnnnnnnnnnnnnnnnnnnnnnnwn',
    'nwwwwwwwwwwwwwwwwwwwwwwwwwwn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnn',
  ]),
} satisfies Record<string, PixelArt>;
export type ArtName = keyof typeof ART;

/** 场景里冒出来的评论小卡（好评金星 / 差评红星），锚点在底边中间 */
export function bubbleArt(good: boolean): PixelArt {
  const s = good ? 'y' : 'r';
  const rows = outline(
    [
      'wwwwwwwwwwwww',
      `ww${s}w${s}w${s}w${s}w${s}ww`.slice(0, 13),
      'wwwwwwwwwwwww',
      'wggggggggwwww',
      'wwwwwwwwwwwww',
      '...www.......',
      '...ww........',
      '...w.........',
    ],
    'k',
  );
  return { rows, ox: 4, oy: rows.length - 1, pal: { ...IP, y: '#ffd23a', r: '#e8463d' } };
}
/** 正在打字（三个点） */
export const TYPING: PixelArt = (() => {
  const rows = outline(['wwwwwwwww', 'wkwwkwwkw', 'wwwwwwwww', '..ww.....', '..w......'], 'k');
  return { rows, ox: 3, oy: rows.length - 1, pal: IP };
})();

/* ---------------- 手（拿着手机的两只手，换色：皮肤、袖子） ---------------- */

export const HAND_L: PixelArt = {
  rows: outline(
    [
      '.......SS...',
      '......SSSS..',
      '......SSSs..',
      '.....SSSSs..',
      '....SSSSs...',
      '...sSSSSs...',
      '..sSSSOSs...',
      '.sSSSSOSS...',
      'sSSSSSSSs...',
      'sSSSSSSSs...',
      'ssSSSSSSs...',
      'ssSSSSSs....',
      '.sSSSSSs....',
      '.LLLLLLLL...',
      'LLLLLLLLLL..',
      'LLLLLLLLLL..',
      'lLLLLLLLLL..',
      'lLLLLLLLLL..',
      'lLLLLLLLLL..',
      'lLLLLLLLLL..',
    ],
    'O',
  ),
  ox: 0,
  oy: 0,
};

/* ---------------- 画到 canvas ---------------- */

const imgCache = new WeakMap<BakedArt, ImageData>();
function imageOf(b: BakedArt): ImageData {
  let im = imgCache.get(b);
  if (!im) {
    const data = new Uint8ClampedArray(b.w * b.h * 4);
    data.set(new Uint8Array(b.px.buffer, b.px.byteOffset, b.px.byteLength));
    im = new ImageData(data, b.w, b.h);
    imgCache.set(b, im);
  }
  return im;
}

/** 一张素材 → 原尺寸 canvas，CSS 放大 scale 倍（像素清晰） */
export function artCanvas(a: PixelArt, scale: number, slots?: SlotColors, flip = false): HTMLCanvasElement {
  const b = bakeArt(a, slots);
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.putImageData(imageOf(b), 0, 0);
  if (flip) {
    const t = document.createElement('canvas');
    t.width = b.w;
    t.height = b.h;
    const tg = t.getContext('2d') as CanvasRenderingContext2D;
    tg.translate(b.w, 0);
    tg.scale(-1, 1);
    tg.drawImage(c, 0, 0);
    return sized(t, scale);
  }
  return sized(c, scale);
}

/** 在已有 canvas 的 (x, y) 处画一张素材（1:1 像素，透明的地方不覆盖） */
export function blit(g: CanvasRenderingContext2D, a: PixelArt, x: number, y: number, slots?: SlotColors): void {
  const b = bakeArt(a, slots);
  const t = document.createElement('canvas');
  t.width = b.w;
  t.height = b.h;
  (t.getContext('2d') as CanvasRenderingContext2D).putImageData(imageOf(b), 0, 0);
  g.drawImage(t, Math.round(x), Math.round(y));
}

export function sized(c: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  c.style.width = `${c.width * scale}px`;
  c.style.height = `${c.height * scale}px`;
  c.style.imageRendering = 'pixelated';
  return c;
}

/** iso 的表情图标 → canvas */
export function iconCanvas(name: IconName, scale: number): HTMLCanvasElement {
  return artCanvas(ICON_ART[name], scale);
}

/** 一排 5 颗星（stars 可以是 x.5） */
export function starsCanvas(stars: number, scale: number, red = false): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 5 * 9 - 4 + 4;
  c.height = 9;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  for (let i = 0; i < 5; i++) {
    const f = stars - i;
    const a = f >= 0.75 ? (red ? STAR_RED : STAR_FULL) : f >= 0.25 ? STAR_HALF : STAR_EMPTY;
    blit(g, a, i * 8, 0);
  }
  return sized(c, scale);
}
