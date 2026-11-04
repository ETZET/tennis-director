/**
 * 大门星级牌的像素素材（ART-14）：六档样子（★0 废墟 … ★5 沙漠名园）和星星。
 *
 * 牌子是整张字符画，按（档位、已经点亮几颗星）拼出来；不用 SLOT 换色，所有字符查 `SIGN_PAL`
 * （固定颜色），自发光的字符由每档的 `glow` 列出（夜里不压暗：灯泡、★4 起的星星、★5 的金边）。
 * 拼法是纯数据 + 小画板（不碰 DOM、不用随机），结果确定。运行时在 site/indian-wells/stars.ts 里烘焙和画。
 *
 * 画布 57×43，锚点在底边中间（地面点）。五个星位在同一行，★1–★5 位置一样（★0 的牌子歪了，不画星）。
 */

/** 拼好的一张牌子 */
export interface SignArt {
  readonly rows: readonly string[];
  readonly ox: number;
  readonly oy: number;
  /** 自发光的字符 */
  readonly glow: string;
}

export const SIGN_W = 57;
export const SIGN_H = 43;
/** 锚点（底边中间的地面点） */
export const SIGN_OX = 28;
export const SIGN_OY = 42;

/** 五个星位的左上角（像素，星星 7×6） */
export const STAR_SLOTS: readonly (readonly [number, number])[] = [7, 16, 25, 34, 43].map((x) => [x, 19] as const);
export const STAR_W = 7;
export const STAR_H = 7;

/**
 * 调色（暖色沙漠、Kairosoft 式饱和度）。
 * 星星单独用 * + = - 四个字符，和金边分开（★4 起星星自发光，金边到 ★5 才发光）。
 */
// biome-ignore format: 调色表按类对齐
export const SIGN_PAL: Readonly<Record<string, string>> = {
  '0': '#2a2238', // 描边
  // 风吹日晒的旧木头
  a: '#a8987e', b: '#857560', c: '#62543f', d: '#443a2c', x: '#776a56',
  // 新木头
  e: '#d7a46a', f: '#b27d4b', g: '#7e5532',
  // 奶油色油漆
  h: '#f6ead0', i: '#dccaa2', v: '#bfa982',
  // 俱乐部绿（和门楣一致）
  j: '#46a866', J: '#2f7a4a', K: '#22603a', L: '#15402a',
  // 金边
  Y: '#fff4b0', G: '#ffc93a', H: '#d98a1c', I: '#9a5512',
  // 星星（亮、主、暗、投影）
  '*': '#fffbe0', '+': '#ffd23c', '=': '#e8901a', '-': '#0e2c1c',
  // 灰泥（西班牙复兴式的柱子和基座）
  s: '#f4dfbe', t: '#dcbd92', u: '#b9966c', w: '#94744f',
  // 红瓦
  r: '#dc6f40', q: '#a94a2a', R: '#f08a58',
  // 灯泡（自发光）和灯罩
  B: '#fff3c4', k: '#3a3a40',
  // 花草
  p: '#79b84e', o: '#3f7a36', m: '#ff6f8f', n: '#ffd84a', l: '#c7d84a',
  // 枯草、石头
  y: '#c9a86a', z: '#8a8070',
  // 网球（★5 的徽章）
  T: '#d8f04a', W: '#ffffff', U: '#a8c030',
};

/** 星星（7×7，左上亮、右下暗）；投影画在右下，颜色跟牌面走 */
// biome-ignore format: 像素图
export const STAR_ON: readonly string[] = [
  '...*...',
  '..*+=..',
  '*+++++=',
  '.*+++=.',
  '..+++..',
  '.++.+=.',
  '.+...=.',
];
/** 空星位（同形状，压暗一档，左上一圈深色：凹进去的样子） */
export const STAR_SHAPE: readonly string[] = STAR_ON.map((r) => r.replace(/[^.]/g, '#'));

/** ★5 的徽章（19×13）：金边盾牌、深绿底、一颗网球，两边月桂 */
// biome-ignore format: 像素图
const CREST: readonly string[] = [
  '....00000000000....',
  '..o.0YGGGGGGGH0.o..',
  '.op.0GLLLLLLLH0.po.',
  '.op.0GLLTTTLLH0.po.',
  'op..0GLTTTWTLH0..po',
  'op..0GLTTWTTLH0..po',
  'op..0GLTWTTULH0..po',
  '.op.0GLLUUULLH0.po.',
  '.op..0GLLLLLH0..po.',
  '..op..0GLLLH0..po..',
  '...op..0GHH0..po...',
  '....oo..0H0..oo....',
  '.........0.........',
];

/** 小画板：字符网格 */
class Pad {
  readonly g: string[][];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => '.'));
  }
  set(x: number, y: number, ch: string): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) (this.g[y] as string[])[x] = ch;
  }
  get(x: number, y: number): string {
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? ((this.g[y] as string[])[x] as string) : '.';
  }
  rect(x: number, y: number, w: number, h: number, ch: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
  }
  hline(x0: number, x1: number, y: number, ch: string): void {
    for (let i = x0; i <= x1; i++) this.set(i, y, ch);
  }
  vline(x: number, y0: number, y1: number, ch: string): void {
    for (let j = y0; j <= y1; j++) this.set(x, j, ch);
  }
  /** 贴一张字符图；map 把图里的字符换掉（'#' 之类），'.' 不贴 */
  blit(rows: readonly string[], x: number, y: number, map: Readonly<Record<string, string>> = {}): void {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const ch = r[i] as string;
        if (ch !== '.') this.set(x + i, y + j, map[ch] ?? ch);
      }
    });
  }
  rows(): string[] {
    return this.g.map((r) => r.join(''));
  }
}

/** 一颗点亮的星（带右下投影 sh） */
function star(p: Pad, x: number, y: number, sh: string): void {
  STAR_SHAPE.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] === '#') p.set(x + i + 1, y + j + 1, sh);
  });
  p.blit(STAR_ON, x, y);
}

/** 空星位：形状填 dim，左上方一圈 edge（凹进去） */
function slot(p: Pad, x: number, y: number, dim: string, edge: string): void {
  p.blit(STAR_SHAPE, x, y, { '#': dim });
  STAR_SHAPE.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== '#') continue;
      const up = STAR_SHAPE[j - 1]?.[i] ?? '.';
      const left = r[i - 1] ?? '.';
      if (up === '.' || left === '.') p.set(x + i, y + j, edge);
    }
  });
}

/** 星位那一行：前 earned 颗点亮，其余是空位 */
function starRow(p: Pad, earned: number, dim: string, edge: string, sh = edge): void {
  STAR_SLOTS.forEach(([x, y], i) => {
    if (i < earned) star(p, x, y, sh);
    else slot(p, x, y, dim, edge);
  });
}

/** 一根方木桩（左亮右暗，顶上一点倒角） */
function post(p: Pad, x: number, y0: number, y1: number, lt: string, md: string, dk: string): void {
  p.vline(x, y0, y1, lt);
  p.vline(x + 1, y0, y1, md);
  p.vline(x + 2, y0, y1, dk);
  p.set(x, y0, md);
  p.set(x + 2, y0, '0');
}

/** 一盆花草（宽 7） */
function planter(p: Pad, x: number, y: number, flower: string): void {
  p.blit([`.p${flower}pp${flower}.`, 'opppopo', 'ooopooo', '.uuuuu.', '.wwwww.'], x, y - 4);
}

/** 灰泥柱（宽 5）带红瓦帽 */
function pillar(p: Pad, x: number, y0: number, y1: number): void {
  p.rect(x, y0, 5, y1 - y0 + 1, 't');
  p.vline(x, y0, y1, 's');
  p.vline(x + 1, y0, y1, 's');
  p.vline(x + 4, y0, y1, 'u');
  p.hline(x, x + 4, y1, 'w');
  // 墙裙
  p.hline(x, x + 4, y1 - 3, 'u');
  // 红瓦帽
  p.hline(x - 1, x + 5, y0 - 1, 'r');
  p.hline(x, x + 4, y0 - 2, 'R');
  p.set(x + 2, y0 - 2, 'r');
  p.hline(x - 1, x + 5, y0, 'q');
}

/** 一盏挂在牌子上方的小灯（灯杆、灯罩、灯泡） */
function lamp(p: Pad, x: number, yTop: number, yBoard: number): void {
  p.vline(x, yTop + 2, yBoard - 1, 'k');
  p.blit(['.kkk.', 'kkkkk', '.BBB.'], x - 2, yTop - 1);
}

/** 拼一张牌子：level 0–5 的样子，点亮 earned 颗星（≤ level） */
export function signArt(level: number, earned: number): SignArt {
  const L = Math.max(0, Math.min(5, Math.round(level)));
  const n = Math.max(0, Math.min(L, Math.round(earned)));
  const p = new Pad(SIGN_W, SIGN_H);
  const G = SIGN_OY; // 地面行
  let glow = '';

  if (L === 0) {
    // ★0 废墟：一块风化的木板，右边的桩断了，牌子斜着耷拉到地上；星星只剩褪色的印子
    const b = new Pad(SIGN_W, SIGN_H);
    b.rect(4, 15, 49, 15, 'a');
    // 三条木板，板缝和木纹
    b.hline(4, 52, 19, 'c');
    b.hline(4, 52, 24, 'c');
    for (const [x, y, w] of [
      [8, 16, 6],
      [22, 17, 9],
      [37, 16, 5],
      [12, 21, 7],
      [30, 22, 10],
      [6, 26, 8],
      [24, 27, 6],
      [41, 26, 7],
    ] as const)
      b.hline(x, x + w, y, 'b');
    b.hline(4, 52, 29, 'd');
    b.vline(52, 15, 29, 'd');
    b.hline(4, 52, 15, 'x');
    // 褪色的星印
    STAR_SLOTS.forEach(([x, y], i) => {
      if (i !== 3) b.blit(STAR_SHAPE, x, y, { '#': i === 1 ? 'b' : 'x' });
    });
    // 右上角掉了一块（参差的断口）
    for (const [x, h] of [
      [52, 7],
      [51, 6],
      [50, 5],
      [49, 3],
      [48, 2],
      [47, 1],
      [45, 1],
    ] as const)
      for (let j = 0; j < h; j++) b.set(x, 15 + j, '.');
    b.set(46, 15, 'd');
    b.set(48, 17, 'd');
    b.set(50, 20, 'd');
    // 裂缝
    for (const [x, y] of [
      [27, 20],
      [28, 21],
      [28, 22],
      [29, 23],
    ] as const)
      b.set(x, y, 'd');
    // 锈钉子
    for (const [x, y] of [
      [9, 17],
      [9, 22],
      [9, 27],
    ] as const)
      b.set(x, y, 'I');
    // 左边的桩还立着（桩在牌子后面，先画）
    post(p, 8, 12, G - 1, 'b', 'c', 'd');
    // 右边的桩断了：一截桩头和木刺
    post(p, 45, G - 7, G - 1, 'b', 'c', 'd');
    p.set(45, G - 8, 'b');
    p.set(47, G - 9, 'c');
    p.set(46, G - 8, 'c');
    p.set(45, G - 7, 'b');
    // 牌子按列往右下斜（左边钉在桩上，右头掉到断桩旁边）
    for (let y = 0; y < SIGN_H; y++)
      for (let x = 0; x < SIGN_W; x++) {
        const ch = b.get(x, y);
        if (ch === '.') continue;
        const dy = Math.round(Math.max(0, x - 9) * 0.2);
        p.set(x, y + dy, ch);
      }
    // 桩上的钉子盖过牌子
    p.set(9, 17, 'I');
    // 地上：枯草、碎木片、石头
    p.blit(['.y..y.', 'yyz.yy', 'zzzyyz'], 3, G - 2);
    p.blit(['..y.', '.yy.', 'yzzy'], 51, G - 2);
    p.blit(['dc.', '.cd'], 33, G - 1);
    p.blit(['.zz.', 'zzwz'], 22, G - 1);
    p.hline(10, 44, G, 'u');
    return { rows: p.rows(), ox: SIGN_OX, oy: SIGN_OY, glow };
  }

  if (L === 1) {
    // ★1 能打球了：重新立起来，新木桩、刷了一遍奶油色，一颗手刷的金星；桩上绑着绳子，脚下一桶漆
    post(p, 8, 13, G - 1, 'e', 'f', 'g');
    post(p, 46, 13, G - 1, 'e', 'f', 'g');
    p.rect(4, 15, 49, 15, 'g');
    p.rect(5, 16, 47, 13, 'h');
    // 刷子的笔触
    for (const [x, y, w] of [
      [7, 17, 10],
      [30, 17, 14],
      [12, 27, 18],
      [40, 27, 9],
      [20, 16, 6],
    ] as const)
      p.hline(x, x + w, y, 'i');
    // 板缝隐约透出来
    p.hline(5, 51, 22, 'i');
    p.set(52, 22, 'f');
    p.set(4, 22, 'f');
    starRow(p, n, 'i', 'v');
    // 钉子
    for (const [x, y] of [
      [9, 17],
      [9, 27],
      [47, 17],
      [47, 27],
    ] as const)
      p.set(x, y, 'k');
    // 左桩上绑的绳子（接过的桩）
    p.blit(['yyy', 'zyy', 'yyz'], 8, 32);
    // 一桶漆，滴下来一点
    p.blit(['.kkk.', '0hhh0', '0vvv0', '0vvv0', '.000.'], 50, G - 4);
    p.set(52, G - 5, 'g');
    p.blit(['.y.y', 'yyzy'], 2, G - 1);
    p.hline(9, 48, G, 'u');
    return { rows: p.rows(), ox: SIGN_OX, oy: SIGN_OY, glow };
  }

  if (L === 2) {
    // ★2 会所开张：漆成俱乐部绿，奶油色边框，桩也刷白；顶上一盏小灯（夜里亮）
    post(p, 8, 13, G - 1, 'h', 'i', 'v');
    post(p, 46, 13, G - 1, 'h', 'i', 'v');
    p.rect(4, 14, 49, 17, 'v');
    p.rect(4, 14, 48, 16, 'h');
    p.rect(6, 16, 45, 13, 'J');
    p.hline(6, 50, 16, 'j');
    p.hline(6, 50, 28, 'K');
    p.vline(50, 16, 28, 'K');
    starRow(p, n, 'K', 'L');
    lamp(p, 28, 9, 14);
    glow = 'B';
    // 桩脚的小灌木
    p.blit(['.pop.', 'popop', 'ooooo'], 6, G - 2);
    p.blit(['.pop.', 'popop', 'ooooo'], 45, G - 2);
    p.hline(9, 46, G, 'u');
    return { rows: p.rows(), ox: SIGN_OX, oy: SIGN_OY, glow };
  }

  // ★3–★5：灰泥基座、绿底金边
  const gold2 = L >= 4;
  if (L >= 4) {
    // 两边的灰泥柱（红瓦帽），牌子嵌在中间
    pillar(p, 0, 12, G - 1);
    pillar(p, 52, 12, G - 1);
  }
  // 基座（灰泥台子，往下收一点）
  p.rect(7, 31, 43, G - 31, 't');
  p.hline(7, 49, 31, 's');
  p.hline(6, 50, 30, 's');
  p.vline(49, 31, G - 1, 'u');
  p.vline(7, 31, G - 1, 's');
  p.hline(7, 49, G - 1, 'w');
  // 基座上的凹槽
  p.rect(12, 34, 33, 3, 'u');
  p.hline(12, 44, 34, 'w');
  // 牌子：金边 + 绿底
  p.rect(4, 14, 49, 16, gold2 ? 'H' : 'G');
  p.hline(4, 52, 14, 'Y');
  p.vline(4, 14, 29, 'Y');
  p.hline(4, 52, 29, 'I');
  p.vline(52, 14, 29, 'I');
  if (gold2) {
    p.rect(5, 15, 47, 14, 'G');
    p.hline(5, 51, 15, 'Y');
  }
  const ix = gold2 ? 6 : 5;
  p.rect(ix, ix + 10, 57 - 2 * ix, 24 - 2 * ix, 'J');
  p.hline(ix, 56 - ix, ix + 10, 'j');
  p.hline(ix, 56 - ix, 33 - ix, 'K');
  p.vline(56 - ix, ix + 10, 33 - ix, 'K');
  if (L === 5)
    // 牌面上隐约的菱格纹（拉近了才看得出）
    for (let y = ix + 12; y < 32 - ix; y += 3)
      for (let x = ix + 2 + ((y >> 1) % 3); x < 55 - ix; x += 6) p.set(x, y, 'K');
  starRow(p, n, 'K', 'L');
  if (gold2) {
    // 四角的铆钉
    for (const [x, y] of [
      [5, 15],
      [51, 15],
      [5, 28],
      [51, 28],
    ] as const)
      p.set(x, y, 'Y');
    // 牌子顶上的红瓦檐
    p.hline(4, 52, 13, 'q');
    p.hline(5, 51, 12, 'r');
    p.hline(6, 50, 11, 'R');
    for (let x = 7; x <= 49; x += 3) p.set(x, 12, 'q');
  }
  if (L === 3) {
    // 两盏小灯挂在牌子上角
    lamp(p, 9, 10, 14);
    lamp(p, 47, 10, 14);
  }
  // 基座两边的花槽
  planter(p, 8, G - 1, 'm');
  planter(p, 42, G - 1, L >= 4 ? 'n' : 'm');
  glow = 'B';
  if (L >= 4) glow += '*+=';
  if (L === 5) {
    // 徽章立在瓦檐上，柱顶加金球
    p.blit(CREST, 19, 0);
    for (const x of [2, 54]) {
      p.set(x, 8, 'Y');
      p.blit(['GH', 'HI'], x - 1 + (x === 2 ? 0 : 0), 9);
      p.set(x, 7, '0');
    }
    // 基座凹槽里嵌一条金线
    p.hline(14, 42, 35, 'G');
    p.set(13, 35, 'Y');
    p.set(43, 35, 'H');
    glow += 'YGH';
  }
  p.hline(5, 51, G, 'u');
  return { rows: p.rows(), ox: SIGN_OX, oy: SIGN_OY, glow };
}
