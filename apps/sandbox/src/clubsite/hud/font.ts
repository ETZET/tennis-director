// 像素字：英文、数字用手画的 5×7 点阵；汉字用系统字体在 1 倍小画布上画一次、按透明度阈值切成实心纹素（不糊）。
// 都加 1 纹素靛黑描边 + 下面 1 纹素深影（同图标），CSS 整数倍放大。参考里的 "SPR DAY 1"、金币数字就是这种白字黑边。
import { CREAM, INK, INK_SHADOW } from './colors';

const G5: Record<string, string> = {
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '####.|....#|....#|.###.|....#|....#|####.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  ':': '.|#|#|.|#|#|.',
  '.': '.|.|.|.|.|#|#',
  ',': '..|..|..|..|.#|.#|#.',
  '-': '....|....|....|####|....|....|....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
  $: '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '·': '..|..|..|##|##|..|..',
  '!': '#|#|#|#|#|.|#',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  "'": '#|#|.|.|.|.|.',
  '(': '.#|#.|#.|#.|#.|#.|.#',
  ')': '#.|.#|.#|.#|.#|.#|#.',
  '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
  '→': '.....|..#..|...#.|#####|...#.|..#..|.....',
};

/**
 * 两种密度：
 * - lo（默认）：汉字 11 px、点阵字 1 倍，整段按界面纹素（2 倍）放大 —— 只适合点阵字（数字、英文）；汉字 11 px 切出来太碎。
 * - hi：汉字 12 px、点阵字画成 2 倍粗，整段按 1 倍显示（描边 1 像素）—— 汉字清楚，点阵字和 lo 的 2 倍一样大。
 */
interface Dens {
  cjk: number;
  line: number;
  k: number;
  top: number;
}
const LO: Dens = { cjk: 11, line: 11, k: 1, top: 2 };
const HI: Dens = { cjk: 12, line: 14, k: 2, top: 0 };
let D: Dens = LO;
let LINE = LO.line;

const glyphCache = new Map<string, { w: number; a: Uint8Array }>();
let scratch: CanvasRenderingContext2D | null = null;

function glyph(ch: string): { w: number; a: Uint8Array } {
  const ck = `${D.k}|${ch}`;
  const hit = glyphCache.get(ck);
  if (hit) return hit;
  const CJK = D.cjk;
  const ASC_TOP = D.top;
  const K = D.k;
  let out: { w: number; a: Uint8Array };
  const up = ch.length === 1 && /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
  const g5 = G5[up];
  if (ch === ' ') {
    out = { w: 3 * K, a: new Uint8Array(3 * K * LINE) };
  } else if (g5) {
    const rows = g5.split('|');
    const w = Math.max(...rows.map((r) => r.length)) * K;
    const a = new Uint8Array(w * LINE);
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++)
        if (r[x] === '#')
          for (let dy = 0; dy < K; dy++) for (let dx = 0; dx < K; dx++) a[(y * K + dy + ASC_TOP) * w + x * K + dx] = 1;
    });
    out = { w, a };
  } else {
    // 汉字（和别的字）：系统字体画在 1 倍画布上，阈值切成实心
    if (!scratch) {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      scratch = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    }
    const g = scratch;
    g.clearRect(0, 0, 32, 32);
    g.font = `${CJK}px "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    g.textBaseline = 'top';
    g.fillStyle = '#fff';
    const mw = Math.max(1, Math.ceil(g.measureText(ch).width));
    g.fillText(ch, 0, 0);
    const d = g.getImageData(0, 0, mw, LINE).data;
    const w = mw;
    const a = new Uint8Array(w * LINE);
    for (let i = 0; i < w * LINE; i++) a[i] = d[i * 4 + 3] >= 110 ? 1 : 0;
    out = { w, a };
  }
  glyphCache.set(ck, out);
  return out;
}

export interface TextOpts {
  color?: number;
  /** 描边颜色；null = 不描边 */
  outline?: number | null;
  shadow?: boolean;
  /** 一行最多多宽（纹素），超过就折行（按字） */
  maxW?: number;
  /** 行距（纹素） */
  gap?: number;
  /** 'left' | 'center' */
  align?: 'left' | 'center';
  /** 高密度（汉字 12 px、点阵字 2 倍粗；按 1 倍显示） */
  hi?: boolean;
}

/** 一段字 → 1 倍 canvas（纹素 = 像素），带描边、投影 */
export function textCanvas(text: string, o: TextOpts = {}): HTMLCanvasElement {
  D = o.hi ? HI : LO;
  LINE = D.line;
  const sp = D.k;
  const color = o.color ?? CREAM;
  const outline = o.outline === undefined ? INK : o.outline;
  const shadow = o.shadow ?? outline !== null;
  const gap = o.gap ?? 2;
  // 排版：按字折行
  const lines: { chars: { w: number; a: Uint8Array }[]; w: number }[] = [];
  let cur: { chars: { w: number; a: Uint8Array }[]; w: number } = { chars: [], w: 0 };
  for (const para of text.split('\n')) {
    for (const ch of [...para]) {
      const g = glyph(ch);
      const add = (cur.chars.length ? sp : 0) + g.w;
      if (o.maxW && cur.w + add > o.maxW && cur.chars.length) {
        lines.push(cur);
        cur = { chars: [], w: 0 };
      }
      cur.w += (cur.chars.length ? sp : 0) + g.w;
      cur.chars.push(g);
    }
    lines.push(cur);
    cur = { chars: [], w: 0 };
  }
  const pad = outline !== null ? 1 : 0;
  const tw = Math.max(1, ...lines.map((l) => l.w));
  const w = tw + pad * 2;
  const h = lines.length * LINE + (lines.length - 1) * gap + pad * 2 + (shadow ? 1 : 0);
  const solid = new Uint8Array(w * h);
  lines.forEach((l, li) => {
    let x = pad + (o.align === 'center' ? Math.floor((tw - l.w) / 2) : 0);
    const y0 = pad + li * (LINE + gap);
    for (const g of l.chars) {
      for (let y = 0; y < LINE; y++)
        for (let xx = 0; xx < g.w; xx++) if (g.a[y * g.w + xx]) solid[(y0 + y) * w + x + xx] = 1;
      x += g.w + sp;
    }
  });
  // 去掉多余的空行（点阵字上面空 2 行）：裁到实际用到的范围
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(w, h);
  const px = img.data;
  const put = (i: number, col: number) => {
    px[i * 4] = (col >> 16) & 255;
    px[i * 4 + 1] = (col >> 8) & 255;
    px[i * 4 + 2] = col & 255;
    px[i * 4 + 3] = 255;
  };
  const edge = new Uint8Array(w * h);
  if (outline !== null)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (solid[y * w + x]) continue;
        // 四邻域 + 斜角：字的描边用八邻域，粗细一致
        let n = false;
        for (let dy = -1; dy <= 1 && !n; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx]) {
              n = true;
              break;
            }
          }
        if (n) edge[y * w + x] = 1;
      }
  for (let i = 0; i < w * h; i++) {
    if (solid[i]) put(i, color);
    else if (edge[i]) put(i, outline as number);
  }
  if (shadow)
    for (let y = h - 1; y > 0; y--)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i] || edge[i]) continue;
        const up = (y - 1) * w + x;
        if (solid[up] || edge[up]) put(i, INK_SHADOW);
      }
  g.putImageData(img, 0, 0);
  return trimRows(c);
}

/** 上下的全空行裁掉（点阵字的格子比字高） */
function trimRows(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const rowUsed = (y: number) => {
    for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) return true;
    return false;
  };
  let y0 = 0;
  let y1 = c.height - 1;
  while (y0 < y1 && !rowUsed(y0)) y0++;
  while (y1 > y0 && !rowUsed(y1)) y1--;
  if (y0 === 0 && y1 === c.height - 1) return c;
  const o = document.createElement('canvas');
  o.width = c.width;
  o.height = y1 - y0 + 1;
  (o.getContext('2d') as CanvasRenderingContext2D).drawImage(c, 0, -y0);
  return o;
}
