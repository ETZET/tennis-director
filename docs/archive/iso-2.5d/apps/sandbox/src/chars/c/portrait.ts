import { Grid } from './pix';

/**
 * 大肖像（方向 C 的上层）：48×48 胸像，小号 32×32 是同一张图裁脸（不另画，零成本，像素一模一样）。
 *
 * 拼法（全部是字符画部件，字母表同 pix.ts，换色和小人共用一份 Look）：
 *   头发后层 → 衣服/胸像 → 脖子 → 耳朵 → 脸型 → 脸上的明暗 → 皱纹/雀斑/胡茬 → 眼睛、眉毛、鼻子、嘴（随表情换）
 *   → 胡子 → 头发前层 → 帽子 → 眼镜 → 胸前的配饰 → 选择描边（描边取旁边颜色的最暗档）。
 *
 * 脸型是一张"每行半宽"的表（数据），头发和帽子是按行写的像素段（数据），五官是小字符画。
 * 光从画面左边来，暗面在右边，和场景一致。
 */

export const PW = 48;
export const PH = 48;

export type FaceShape = 'oval' | 'square' | 'long' | 'round' | 'heart' | 'kid';
export type Age = 'kid' | 'teen' | 'young' | 'mid' | 'old';
export type EyeType = 'round' | 'mono' | 'squint' | 'sharp' | 'lash' | 'tired' | 'big' | 'narrow';
export type BrowType = 'thin' | 'thick' | 'bushy' | 'arched';
export type NoseType = 'small' | 'big' | 'broad' | 'long' | 'button';
export type Mark =
  | 'beard'
  | 'stache'
  | 'stubble'
  | 'freckles'
  | 'blush'
  | 'lipstick'
  | 'eyeshadow'
  | 'earrings'
  | 'readers'
  | 'shades'
  | 'shadesUp'
  | 'bigGlasses'
  | 'mole'
  | 'spots'
  | 'sunburn'
  | 'crow'
  | 'forehead'
  | 'jowls'
  | 'bags'
  | 'cheek'
  | 'fuzz'
  | 'gap'
  | 'tanline';
export type Bust = 'polo' | 'tee' | 'hoodie' | 'blazer' | 'work' | 'tank' | 'hawaii' | 'apron' | 'kid';
export type Acc =
  | 'whistle'
  | 'bandana'
  | 'lanyard'
  | 'cup'
  | 'phone'
  | 'pliers'
  | 'tape'
  | 'keys'
  | 'towel'
  | 'tote'
  | 'camera';
export type PHair =
  | 'cap'
  | 'sunhat'
  | 'spiky'
  | 'pony'
  | 'bald'
  | 'long'
  | 'bob'
  | 'bun'
  | 'neat'
  | 'curly'
  | 'side'
  | 'pigtails'
  | 'backcap'
  | 'visor'
  | 'momPony'
  | 'bucket';

export interface PortraitSpec {
  face: FaceShape;
  age: Age;
  eyes: EyeType;
  brows: BrowType;
  nose: NoseType;
  hair: PHair;
  marks: readonly Mark[];
  bust: Bust;
  acc: readonly Acc[];
}

export type Expr = 'neutral' | 'happy' | 'angry' | 'sad' | 'surprised';
export const EXPRS: readonly Expr[] = ['neutral', 'happy', 'angry', 'sad', 'surprised'];
export const EXPR_ZH: Record<Expr, string> = {
  neutral: '平常',
  happy: '高兴',
  angry: '生气',
  sad: '累/难过',
  surprised: '吃惊',
};

/* ---------------- 脸型 ---------------- */

interface Shape {
  top: number;
  hw: readonly number[];
  browY: number;
  eyeY: number;
  eL: number;
  eR: number;
  noseY: number;
  mouthY: number;
  earY: number;
  /** 胸像半宽的加量 */
  wide: number;
}
const ADULT = { browY: 17, eyeY: 19, eL: 16, eR: 26, noseY: 22, mouthY: 28, earY: 18 };
const SHAPES: Record<FaceShape, Shape> = {
  oval: {
    top: 6,
    hw: [5, 7, 8, 9, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 8, 8, 7, 6, 5, 4, 3],
    ...ADULT,
    wide: 0,
  },
  square: {
    top: 6,
    hw: [6, 8, 9, 10, 10, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 10, 10, 10, 9, 9, 8, 7, 6],
    ...ADULT,
    wide: 2,
  },
  long: {
    top: 5,
    hw: [5, 7, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 8, 7, 7, 6, 5, 4, 3, 2],
    ...ADULT,
    wide: -1,
  },
  round: {
    top: 7,
    hw: [6, 8, 9, 10, 10, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11, 10, 10, 10, 9, 8, 7, 6, 4],
    ...ADULT,
    wide: 0,
  },
  heart: {
    top: 6,
    hw: [6, 8, 9, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 8, 8, 7, 7, 6, 5, 4, 3, 2],
    ...ADULT,
    wide: -1,
  },
  kid: {
    top: 6,
    hw: [7, 9, 10, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 11, 11, 10, 9, 8, 6, 4],
    browY: 20,
    eyeY: 22,
    eL: 15,
    eR: 27,
    noseY: 27,
    mouthY: 30,
    earY: 21,
    wide: -6,
  },
};
const CX = 24; // 中缝在第 23、24 列之间

function faceHW(s: Shape, y: number): number {
  const i = y - s.top;
  if (i < 0 || i >= s.hw.length) return -1;
  return s.hw[i] as number;
}
const chinY = (s: Shape) => s.top + s.hw.length - 1;

/* ---------------- 小工具 ---------------- */

/** 按行写的像素段：rows[i] = [x0, x1, x0, x1, ...]，画在 y0 + i 行 */
function spans(g: Grid, y0: number, rows: readonly (readonly number[])[], ch: string): void {
  rows.forEach((r, i) => {
    for (let k = 0; k + 1 < r.length; k += 2)
      for (let x = r[k] as number; x <= (r[k + 1] as number); x++) g.set(x, y0 + i, ch);
  });
}
/** 左右对称的像素段：rows[i] = [半宽外, 半宽内?]：从中缝往两边量 */
function symSpans(g: Grid, y0: number, rows: readonly (readonly number[])[], ch: string): void {
  rows.forEach((r, i) => {
    const out = r[0] as number;
    const inn = (r[1] as number | undefined) ?? 0;
    for (let x = CX - out; x < CX - inn; x++) g.set(x, y0 + i, ch);
    for (let x = CX + inn; x < CX + out; x++) g.set(x, y0 + i, ch);
  });
}
function mirror(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}
const SKIN = 'S+sz';
function onSkin(g: Grid, pts: readonly (readonly [number, number])[], ch: string): void {
  for (const [x, y] of pts) if (SKIN.includes(g.get(x, y))) g.set(x, y, ch);
}
/** 把一层盖到底图上 */
function merge(dst: Grid, src: Grid): void {
  for (let i = 0; i < src.d.length; i++) if (src.d[i] !== '.') dst.d[i] = src.d[i] as string;
}
/**
 * 头发/帽子的自动明暗：每段连续像素右边 30% 压暗、最右一格最暗，左上一条高光。
 * 只动 base 字母（H 或 C），手画的 h/x/^ 不动。
 */
function autoShade(
  g: Grid,
  base: string,
  sh: string,
  deep: string,
  hi: string,
  hiRows: readonly [number, number],
): void {
  for (let y = 0; y < g.h; y++) {
    let x = 0;
    while (x < g.w) {
      if (g.get(x, y) === '.') {
        x++;
        continue;
      }
      let e = x;
      while (e + 1 < g.w && g.get(e + 1, y) !== '.') e++;
      const n = e - x + 1;
      for (let i = x; i <= e; i++) {
        if (g.get(i, y) !== base) continue;
        const t = (i - x) / Math.max(1, n - 1);
        if (n >= 4 && i === e) g.set(i, y, deep);
        else if (n >= 3 && t > 0.68) g.set(i, y, sh);
        else if (y >= hiRows[0] + 1 && y <= hiRows[0] + 2 && hiRows[1] > hiRows[0]) {
          const k = y - hiRows[0] - 1;
          if (t > 0.2 + 0.04 * k && t < 0.42 - 0.04 * k) g.set(i, y, hi);
        }
      }
      x = e + 1;
    }
  }
}

/* ---------------- 五官 ---------------- */

/** 左眼（画面左边那只），右眼镜像。每种眼型五个状态。 */
const EYES: Record<EyeType, Record<'open' | 'narrow' | 'closed' | 'wide' | 'sad', readonly string[]>> = {
  round: {
    open: ['.EEEE.', 'EWIEWs', '.sIIs.'],
    narrow: ['......', 'EEEEEE', '.sIEs.'],
    closed: ['......', '.EEEE.', 'E....E'],
    wide: ['.EEEE.', 'EWIEWE', '.WWWW.'],
    sad: ['......', '.EEEE.', 'EsIEs.'],
  },
  mono: {
    open: ['.EEEE.', 'EWIEWs', '......'],
    narrow: ['......', 'EEEEEE', '..IEs.'],
    closed: ['......', '.EEEE.', 'E....E'],
    wide: ['.EEEE.', 'EWIEWE', '.sWWs.'],
    sad: ['......', '.EEEEE', 'EsIEs.'],
  },
  squint: {
    open: ['......', 'EEEEEE', '.sIEs.'],
    narrow: ['......', 'EEEEEE', '..zz..'],
    closed: ['......', '.EEEE.', 'E....E'],
    wide: ['.EEEE.', 'EWIEWE', '.sWWs.'],
    sad: ['......', '.EEEE.', 'EzIEz.'],
  },
  narrow: {
    open: ['......', 'EEEEEE', '.WIEWs'],
    narrow: ['......', 'EEEEEE', '..zz..'],
    closed: ['......', '.EEEE.', 'E....E'],
    wide: ['.EEEE.', 'EWIEWE', '.sWWs.'],
    sad: ['......', '.EEEEE', 'EsIEs.'],
  },
  sharp: {
    open: ['E.....', '.EEEEE', 'EWIEWs'],
    narrow: ['E.....', 'EEEEEE', '.sIEs.'],
    closed: ['E.....', '.EEEE.', 'E....E'],
    wide: ['EEEEE.', 'EWIEWE', '.WWWW.'],
    sad: ['......', '.EEEEE', 'EsIEs.'],
  },
  lash: {
    open: ['EE....', 'EEEEEE', '.WIEWs'],
    narrow: ['EE....', 'EEEEEE', '..IEs.'],
    closed: ['EE....', '.EEEE.', 'E....E'],
    wide: ['EEEEE.', 'EWIEWE', '.WWWW.'],
    sad: ['E.....', '.EEEEE', 'EsIEs.'],
  },
  tired: {
    open: ['......', '.EEEEE', 'EzIEz.'],
    narrow: ['......', 'EEEEEE', '.zIEz.'],
    closed: ['......', '......', 'EEEEEE'],
    wide: ['.EEEE.', 'EWIEWE', '.zWWz.'],
    sad: ['......', '..EEEE', 'EEzIEz'],
  },
  big: {
    open: ['.EEEE.', 'EWIEIE', 'EIIIIE', '.EEEE.'],
    narrow: ['......', 'EEEEEE', 'EIIEIE', '.EEEE.'],
    closed: ['......', '.EEEE.', 'E....E', '......'],
    wide: ['.EEEE.', 'EWIEIE', 'EIIIIE', '.WWWW.'],
    sad: ['......', '.EEEE.', 'EWIEIE', '.EEEE.'],
  },
};

/** 眉毛：6 格，每格一个高度偏移（左眉；右眉镜像） */
const BROW_SHAPE: Record<Expr, readonly number[]> = {
  neutral: [1, 0, 0, 0, 0, 1],
  happy: [0, -1, -1, -1, -1, 0],
  angry: [-1, -1, 0, 0, 1, 2],
  sad: [2, 1, 1, 0, -1, -1],
  surprised: [-1, -2, -3, -3, -2, -2],
};

const MOUTH: Record<Expr, readonly string[]> = {
  neutral: ['..szzs..', '...MM...'],
  happy: ['.z....z.', '.zWWWWz.', '..zmmz..'],
  angry: ['.zzzzzz.', 'zWzWWzWz', '.zzzzzz.'],
  sad: ['...zz...', '..z..z..', '.z....z.'],
  surprised: ['...zz...', '..zmmz..', '..zmmz..', '...zz...'],
};

const NOSE: Record<NoseType, readonly string[]> = {
  small: ['......', '....s.', '....s.', '..+ss.', '..zz..'],
  big: ['....s.', '....s.', '...ss.', '...ss.', '.+.ss.', 'zs.szz', '.zzz..'],
  broad: ['......', '....s.', '....s.', '..+ss.', 'zs..sz', '.zzzz.'],
  long: ['....s.', '....s.', '....s.', '....s.', '..+ss.', '..zz..'],
  button: ['......', '......', '..+s..', '..zz..'],
};

const EAR = ['.SS', 'S+s', 'Szs', 'Szs', 'SSs', '.Ss'];

/* ---------------- 头发（每人一款，按脸型写死；坐标是 48×48 画布的绝对坐标） ---------------- */

interface HairLayers {
  back: Grid;
  front: Grid;
  hat: Grid;
}

function hairFor(spec: PortraitSpec): HairLayers {
  const back = new Grid(PW, PH);
  const front = new Grid(PW, PH);
  const hat = new Grid(PW, PH);
  const H = 'H';
  switch (spec.hair) {
    case 'cap': {
      // Dale：深蓝棒球帽 + 白发鬓角
      spans(
        front,
        12,
        [
          [11, 15, 32, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      symSpans(hat, 1, [[5], [8], [10], [11], [12], [12], [12], [12], [13], [13], [13]], 'C');
      symSpans(hat, 12, [[15], [16], [15]], 'c');
      for (let x = 9; x <= 38; x++) hat.set(x, 14, x > 33 ? 'd' : 'c');
      autoShade(hat, 'C', 'c', 'd', 'D', [2, 6]);
      // 帽子正面的小标（两支交叉的拍子）
      hat.stamp(['R...R', '.R.R.', '..R..', '.R.R.'], 22, 5);
      // 帽檐下的阴影压在额头上
      for (let x = 14; x <= 33; x++) front.set(x, 15, (x & 1) === 0 ? 'z' : '.');
      break;
    }
    case 'sunhat': {
      // Rosa：宽檐草帽，红帽带，黑辫子从右肩垂下来
      spans(
        back,
        12,
        [
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 35],
        ],
        H,
      );
      spans(
        front,
        12,
        [
          [14, 18, 29, 33],
          [14, 16, 31, 33],
          [14, 15, 32, 33],
          [14, 14, 33, 33],
        ],
        H,
      );
      // 辫子
      for (let y = 22; y <= 44; y++) {
        const x = 33 + ((y >> 1) % 2);
        front.set(x, y, (y & 1) === 0 ? 'H' : 'h');
        front.set(x + 1, y, (y & 1) === 0 ? 'h' : 'H');
        front.set(x + 2, y, 'x');
      }
      front.stamp(['AA', 'aa'], 33, 40);
      front.stamp(['H.', 'Hh', '.h'], 33, 42);
      symSpans(hat, 0, [[4], [7], [8], [9], [9], [9], [9], [9]], 'C');
      symSpans(hat, 8, [[10], [10]], 'A');
      symSpans(hat, 10, [[21], [22], [20]], 'C');
      for (let y = 0; y <= 12; y++)
        for (let x = 0; x < PW; x++) if (hat.get(x, y) === 'C' && (x * 3 + y * 5) % 4 === 0) hat.set(x, y, '9');
      for (let x = 2; x <= 45; x++) hat.set(x, 12, x > 36 ? 'd' : 'c');
      autoShade(hat, 'C', 'c', 'd', 'D', [1, 4]);
      for (let x = 14; x <= 33; x++) front.set(x, 13, (x & 1) === 0 ? 'z' : 's');
      break;
    }
    case 'spiky': {
      // Ben：竖起来的黑短发，刘海一绺一绺
      spans(
        front,
        1,
        [
          [19, 19, 25, 25, 30, 30],
          [18, 20, 24, 26, 29, 31],
          [16, 32],
          [14, 33],
          [13, 34],
          [12, 35],
          [12, 35],
          [11, 36],
          [11, 36],
          [12, 35],
          [12, 17, 19, 22, 24, 28, 30, 35],
          [12, 16, 20, 21, 25, 27, 31, 35],
          [12, 15, 26, 26, 32, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      front.stamp(['x..x', '.x..x', '..x'], 19, 5);
      front.stamp(['x', '.x', '..x'], 27, 6);
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      break;
    }
    case 'pony': {
      // Jess：往后梳的高马尾，珊瑚色头带
      spans(
        back,
        2,
        [
          [31, 35],
          [31, 37],
          [32, 38],
          [33, 39],
          [34, 39],
          [35, 40],
          [35, 40],
          [36, 40],
          [36, 40],
          [36, 39],
          [36, 39],
          [37, 39],
          [37, 38],
          [37, 38],
        ],
        H,
      );
      spans(
        front,
        3,
        [
          [18, 29],
          [15, 32],
          [14, 33],
          [13, 34],
          [13, 34],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 15, 32, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [13, 14, 33, 34],
          [13, 13, 34, 34],
        ],
        H,
      );
      front.stamp(['h...h...h', '.h...h...h'], 17, 5);
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      autoShade(back, 'H', 'h', 'x', '^', [2, 5]);
      for (let x = 12; x <= 35; x++) {
        hat.set(x, 9, x > 31 ? 'a' : 'A');
        hat.set(x, 10, x > 31 ? 'a' : 'A');
      }
      hat.set(16, 9, '@');
      hat.set(17, 9, '@');
      break;
    }
    case 'bald': {
      // Gus：秃顶，两侧和后脑一圈灰发，耳朵上面翘出一撮
      spans(
        front,
        13,
        [
          [11, 14, 33, 36],
          [10, 14, 33, 37],
          [10, 14, 33, 37],
          [11, 14, 33, 36],
          [11, 13, 34, 36],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      front.stamp(['h.', '.h', 'h.'], 11, 14);
      front.stamp(['.h', 'h.', '.h'], 35, 14);
      autoShade(front, 'H', 'h', 'x', '^', [13, 15]);
      break;
    }
    case 'long': {
      // Lily：齐刘海，黑长直披到肩下
      spans(
        back,
        10,
        [
          [11, 36],
          [11, 36],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [9, 38],
          [9, 38],
          [9, 38],
          [9, 38],
          [9, 38],
          [9, 38],
          [9, 38],
          [10, 37],
          [10, 37],
          [10, 16, 31, 37],
          [10, 15, 32, 37],
          [11, 14, 33, 36],
          [11, 13, 34, 36],
          [12, 13, 34, 35],
          [12, 12, 35, 35],
        ],
        H,
      );
      spans(
        front,
        2,
        [
          [18, 29],
          [15, 32],
          [13, 34],
          [12, 35],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 15, 32, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [11, 15, 32, 36],
          [11, 15, 32, 36],
          [11, 15, 32, 36],
          [11, 16, 31, 36],
          [11, 16, 31, 36],
          [11, 16, 31, 36],
        ],
        H,
      );
      // 刘海下沿参差一点
      front.stamp(['_.._._.._._.._._.._._'], 14, 16);
      for (const x of [17, 21, 25, 29]) front.set(x, 14, 'h');
      autoShade(front, 'H', 'h', 'x', '^', [3, 8]);
      autoShade(back, 'H', 'h', 'x', '^', [12, 14]);
      break;
    }
    case 'bob': {
      // Teodora：深红棕色波波头，侧分，齐下巴
      spans(
        front,
        2,
        [
          [19, 29],
          [16, 32],
          [14, 34],
          [13, 35],
          [12, 36],
          [12, 36],
          [12, 36],
          [12, 36],
          [12, 25, 27, 36],
          [12, 22, 29, 36],
          [12, 19, 31, 36],
          [12, 17, 32, 36],
          [12, 16, 33, 36],
          [12, 15, 33, 36],
          [12, 15, 33, 36],
          [12, 14, 34, 36],
          [12, 14, 34, 36],
          [12, 14, 34, 36],
          [12, 14, 34, 36],
          [12, 14, 34, 36],
          [12, 14, 34, 36],
          [12, 15, 33, 36],
          [12, 15, 33, 36],
          [12, 15, 33, 36],
          [12, 16, 32, 36],
          [12, 16, 32, 36],
          [13, 16, 32, 36],
        ],
        H,
      );
      // 侧分线和发丝
      for (let y = 3; y <= 9; y++) front.set(20 + (y > 6 ? 1 : 0), y, 'x');
      front.stamp(['h....h', '.h....h', '..h....h'], 23, 6);
      autoShade(front, 'H', 'h', 'x', '^', [3, 8]);
      for (let x = 12; x <= 36; x++) if (front.get(x, 28) !== '.') front.set(x, 28, 'x');
      break;
    }
    case 'bun': {
      // Nadia：铂金色往后梳紧，后面一个低发髻，两缕碎发
      spans(
        back,
        15,
        [
          [34, 38],
          [34, 39],
          [35, 39],
          [35, 39],
          [35, 38],
        ],
        H,
      );
      spans(
        front,
        3,
        [
          [18, 29],
          [15, 32],
          [14, 33],
          [13, 34],
          [13, 34],
          [13, 34],
          [13, 34],
          [13, 34],
          [13, 15, 32, 34],
          [13, 14, 33, 34],
          [13, 14, 33, 34],
          [13, 13, 34, 34],
        ],
        H,
      );
      front.stamp(['x.x.x.x.x', '.x.x.x.x.x'], 17, 6);
      front.stamp(['H', 'H', 'h', '.h'], 14, 14);
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      autoShade(back, 'H', 'h', 'x', '^', [15, 16]);
      break;
    }
    case 'neat': {
      // Ray：灰白头发，侧分往右梳，鬓角修得很短
      spans(
        front,
        3,
        [
          [17, 30],
          [15, 32],
          [13, 34],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 22, 24, 35],
          [12, 17, 27, 35],
          [12, 15, 30, 35],
          [12, 14, 32, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      for (let y = 3; y <= 8; y++) front.set(19, y, 'x');
      front.stamp(['h.....h', '.h.....h', '..h.....h'], 21, 5);
      autoShade(front, 'H', 'h', 'x', '^', [3, 6]);
      break;
    }
    case 'curly': {
      // Mateo：一头蓬松的黑卷发
      spans(
        front,
        0,
        [
          [17, 19, 23, 26, 30, 32],
          [15, 33],
          [13, 35],
          [11, 36],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [10, 37],
          [11, 18, 20, 23, 25, 28, 30, 36],
          [11, 16, 21, 22, 26, 27, 31, 36],
          [11, 15, 32, 36],
          [11, 14, 33, 36],
          [11, 14, 33, 36],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
        ],
        H,
      );
      // 卷：一个个小圈的高光和暗缝
      autoShade(front, 'H', 'h', 'x', 'H', [0, 0]);
      for (let y = 1; y <= 14; y += 3)
        for (let x = 10 + (((y - 1) / 3) % 2) * 2; x <= 35; x += 4) front.stampOn(['.^.', 'h.x', '.x.'], x, y);
      break;
    }
    case 'side': {
      // 总监：棕色短发，三七分，一绺搭在额头
      spans(
        front,
        3,
        [
          [17, 30],
          [15, 32],
          [13, 34],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 19, 21, 35],
          [12, 16, 24, 35],
          [12, 15, 28, 35],
          [12, 14, 32, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      for (let y = 3; y <= 9; y++) front.set(18, y, 'x');
      front.stamp(['h.....h', '.h.....h', '..h.....h'], 22, 6);
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      break;
    }
    case 'pigtails': {
      // Mia：中分，两根羊角辫，黄色发圈
      spans(
        back,
        14,
        [
          [5, 10, 37, 42],
          [4, 10, 37, 43],
          [4, 10, 37, 43],
          [4, 9, 38, 43],
          [4, 9, 38, 43],
          [5, 9, 38, 42],
          [5, 8, 39, 42],
          [6, 8, 39, 41],
          [6, 7, 40, 41],
        ],
        H,
      );
      spans(
        front,
        3,
        [
          [18, 29],
          [15, 32],
          [13, 34],
          [12, 35],
          [11, 36],
          [11, 36],
          [11, 36],
          [11, 23, 24, 36],
          [11, 21, 26, 36],
          [11, 17, 30, 36],
          [11, 14, 33, 36],
          [11, 13, 34, 36],
          [11, 12, 35, 36],
        ],
        H,
      );
      for (let y = 3; y <= 10; y++) {
        front.set(23, y, 'x');
        front.set(24, y, 'x');
      }
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      autoShade(back, 'H', 'h', 'x', '^', [14, 16]);
      front.stamp(['AA', 'Aa', 'AA', 'aa'], 9, 12);
      front.stamp(['AA', 'Aa', 'AA', 'aa'], 37, 12);
      break;
    }
    case 'backcap': {
      // Leo：反戴的红帽子，前额露出帽子扣的半圆
      spans(
        front,
        14,
        [
          [11, 12, 35, 36],
          [11, 12, 35, 36],
          [11, 12, 35, 36],
          [12, 12, 35, 35],
        ],
        H,
      );
      symSpans(hat, 2, [[6], [9], [11], [12], [13], [13], [13], [13], [13], [13], [13], [13]], 'C');
      symSpans(hat, 10, [[4], [3], [2]], '.');
      hat.replace('.', 'H', 21, 10, 27, 13);
      for (let x = 11; x <= 36; x++) if (hat.get(x, 13) === 'C') hat.set(x, 13, 'c');
      autoShade(hat, 'C', 'c', 'd', 'D', [3, 7]);
      hat.set(22, 10, 'G');
      hat.set(25, 10, 'G');
      break;
    }
    case 'visor': {
      // 退休老人：白色遮阳帽檐，上面露出稀疏的银白短发
      spans(
        front,
        3,
        [
          [19, 28],
          [16, 31],
          [14, 33],
          [13, 34],
          [13, 34],
          [12, 35],
        ],
        H,
      );
      spans(
        front,
        12,
        [
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      for (let x = 16; x <= 31; x += 3) front.set(x, 4, 'x');
      autoShade(front, 'H', 'h', 'x', '^', [3, 5]);
      symSpans(hat, 9, [[12], [12]], 'C');
      symSpans(hat, 11, [[14]], 'c');
      for (let x = 9; x <= 38; x++) hat.set(x, 12, x > 33 ? 'd' : 'c');
      autoShade(hat, 'C', 'c', 'd', 'D', [9, 9]);
      for (let x = 14; x <= 33; x++) front.set(x, 13, (x & 1) === 0 ? 'z' : '.');
      break;
    }
    case 'momPony': {
      // 网球妈妈：粉色遮阳帽檐，金色马尾从后面翘出来，鬓边碎发
      spans(
        back,
        4,
        [
          [32, 36],
          [33, 39],
          [34, 40],
          [35, 41],
          [36, 41],
          [37, 41],
          [37, 41],
          [38, 41],
          [38, 41],
          [38, 40],
          [38, 40],
          [38, 40],
          [39, 40],
          [39, 39],
        ],
        H,
      );
      spans(
        front,
        3,
        [
          [18, 29],
          [15, 32],
          [14, 33],
          [13, 34],
          [13, 34],
          [13, 34],
          [12, 35],
          [12, 35],
          [12, 35],
          [12, 15, 32, 35],
          [12, 15, 32, 35],
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [13, 14, 33, 34],
          [13, 13, 34, 34],
          [13, 13, 34, 34],
        ],
        H,
      );
      autoShade(front, 'H', 'h', 'x', '^', [3, 7]);
      autoShade(back, 'H', 'h', 'x', '^', [4, 7]);
      symSpans(hat, 8, [[12], [12]], 'C');
      symSpans(hat, 10, [[14]], 'c');
      for (let x = 8; x <= 39; x++) hat.set(x, 11, x > 33 ? 'd' : 'c');
      autoShade(hat, 'C', 'c', 'd', 'D', [8, 8]);
      break;
    }
    case 'bucket': {
      // 游客：卡其渔夫帽，帽檐往下塌，露出一点浅棕头发
      spans(
        front,
        14,
        [
          [12, 14, 33, 35],
          [12, 14, 33, 35],
          [12, 13, 34, 35],
          [13, 13, 34, 34],
        ],
        H,
      );
      symSpans(hat, 2, [[6], [8], [9], [10], [10], [10], [10], [11], [11]], 'C');
      symSpans(hat, 11, [[13], [14], [15]], 'C');
      for (let x = 13; x <= 34; x++) hat.set(x, 10, 'c');
      hat.replace('C', 'c', 8, 13, 40, 14);
      autoShade(hat, 'C', 'c', 'd', 'D', [3, 6]);
      for (let x = 14; x <= 33; x++) front.set(x, 14, (x & 1) === 0 ? 'z' : 's');
      break;
    }
  }
  return { back, front, hat };
}

/* ---------------- 胸像（衣服） ---------------- */

function bustHW(s: Shape, y: number): number {
  const base = [7, 10, 14, 17, 19, 20, 21, 21, 21, 21, 21, 21];
  const i = y - 36;
  if (i < 0) return -1;
  const v = (base[Math.min(i, base.length - 1)] as number) + (i >= 2 ? s.wide : Math.min(0, s.wide));
  return Math.max(5, Math.min(23, v));
}

function drawBust(g: Grid, spec: PortraitSpec, s: Shape): void {
  const kid = spec.face === 'kid';
  const y0 = kid ? 38 : 36;
  for (let y = y0; y < PH; y++) {
    const hw = bustHW(s, y - (kid ? 2 : 0));
    if (hw < 0) continue;
    for (let x = CX - hw; x < CX + hw; x++) {
      const t = (x - (CX - hw)) / (2 * hw);
      let c = 'T';
      if (t > 0.74) c = 't';
      if (t > 0.93) c = 'y';
      if (t < 0.2 && t > 0.06 && y > y0 && y < y0 + 4) c = 'U';
      g.set(x, y, c);
    }
  }
  // 腋下/胸口的褶
  for (let y = y0 + 6; y < PH; y++) {
    g.set(CX - 13 + s.wide, y, 't');
    g.set(CX + 12 - s.wide, y, 'y');
  }
  const R = 'R';
  switch (spec.bust) {
    case 'polo':
    case 'kid': {
      if (spec.bust === 'kid') {
        spans(
          g,
          y0,
          [
            [19, 28],
            [20, 27],
          ],
          R,
        );
        break;
      }
      spans(
        g,
        35,
        [
          [18, 19, 28, 29],
          [17, 20, 27, 30],
          [16, 21, 26, 31],
          [17, 21, 26, 30],
        ],
        R,
      );
      spans(g, 37, [[22, 25]], 'S');
      for (let y = 38; y <= 42; y++) {
        g.set(23, y, 't');
        g.set(24, y, y === 39 || y === 41 ? 'R' : 't');
      }
      g.set(20, 38, 'r');
      g.set(27, 38, 'r');
      break;
    }
    case 'tee':
      spans(
        g,
        36,
        [
          [18, 29],
          [19, 28],
        ],
        R,
      );
      spans(g, 36, [[20, 27]], 'S');
      break;
    case 'hoodie':
      spans(
        g,
        33,
        [
          [15, 18, 29, 32],
          [14, 18, 29, 33],
          [14, 19, 28, 33],
          [15, 20, 27, 32],
        ],
        'T',
      );
      spans(
        g,
        33,
        [
          [18, 18, 29, 29],
          [18, 18, 29, 29],
          [19, 19, 28, 28],
        ],
        'y',
      );
      for (let y = 37; y <= 44; y++) {
        g.set(21, y, 'W');
        g.set(26, y, 'W');
      }
      g.set(21, 45, 'w');
      g.set(26, 45, 'w');
      spans(
        g,
        44,
        [
          [16, 31],
          [15, 32],
        ],
        't',
      );
      break;
    case 'blazer':
      for (let y = 36; y < PH; y++) {
        const hw = Math.max(1, 5 - Math.floor((y - 36) / 2.5));
        for (let x = CX - hw; x < CX + hw; x++) g.set(x, y, 'R');
        g.set(CX - hw - 1, y, 'y');
        g.set(CX - hw - 2, y, 'y');
        g.set(CX + hw, y, 'y');
        g.set(CX + hw + 1, y, 'y');
      }
      spans(g, 36, [[21, 26]], 'S');
      spans(g, 37, [[22, 25]], 'S');
      g.set(21, 46, 'A');
      break;
    case 'work':
      spans(
        g,
        35,
        [
          [17, 20, 27, 30],
          [16, 21, 26, 31],
          [17, 21, 26, 30],
        ],
        R,
      );
      spans(g, 36, [[22, 25]], 'S');
      for (let y = 38; y < PH; y++) g.set(23, y, 't');
      for (const y of [39, 42, 45]) g.set(24, y, 'W');
      spans(
        g,
        40,
        [
          [12, 17],
          [12, 12, 17, 17],
          [12, 12, 17, 17],
          [12, 17],
        ],
        't',
      );
      break;
    case 'tank': {
      for (let y = 36; y < PH; y++) {
        const hw = bustHW(s, y);
        for (let x = CX - hw; x < CX + hw; x++) {
          const t = (x - (CX - hw)) / (2 * hw);
          g.set(x, y, t > 0.78 ? 's' : t < 0.15 && y < 40 ? '+' : 'S');
        }
      }
      for (let y = 39; y < PH; y++) {
        const hw = Math.min(13, 7 + (y - 39));
        for (let x = CX - hw; x < CX + hw; x++) g.set(x, y, x >= CX + hw - 3 ? 't' : 'T');
      }
      for (let y = 35; y <= 39; y++) {
        g.set(17, y, 'T');
        g.set(18, y, 'T');
        g.set(29, y, 't');
        g.set(30, y, 't');
      }
      spans(g, 39, [[19, 28]], 'R');
      break;
    }
    case 'hawaii': {
      spans(
        g,
        35,
        [
          [16, 21, 26, 31],
          [15, 21, 26, 32],
          [16, 21, 26, 31],
          [18, 21, 26, 29],
        ],
        'U',
      );
      spans(
        g,
        36,
        [
          [22, 25],
          [22, 25],
          [23, 24],
        ],
        'S',
      );
      for (let y = 38; y < PH; y++)
        for (let x = 0; x < PW; x++) {
          const c = g.get(x, y);
          if (!'TtUy'.includes(c)) continue;
          const u = (x + (y >> 2) * 3) % 7;
          const v = y % 4;
          if (u === 0 && v === 1) g.set(x, y, 'A');
          else if ((u === 1 || u === 6) && v === 1) g.set(x, y, 'N');
          else if (u === 0 && (v === 0 || v === 2)) g.set(x, y, 'N');
        }
      break;
    }
    case 'apron':
      spans(
        g,
        35,
        [
          [18, 20, 27, 29],
          [17, 20, 27, 30],
        ],
        R,
      );
      spans(g, 36, [[21, 26]], 'S');
      for (let y = 36; y <= 40; y++) {
        g.set(16, y, 'N');
        g.set(17, y, 'N');
        g.set(30, y, 'n');
        g.set(31, y, 'n');
      }
      for (let y = 40; y < PH; y++) for (let x = 16; x <= 31; x++) g.set(x, y, x > 27 ? 'n' : 'N');
      spans(
        g,
        43,
        [
          [18, 29],
          [18, 18, 29, 29],
          [18, 18, 29, 29],
          [18, 29],
        ],
        'n',
      );
      break;
  }
}

function drawAcc(g: Grid, spec: PortraitSpec): void {
  for (const a of spec.acc) {
    switch (a) {
      case 'whistle':
        for (let i = 0; i < 6; i++) {
          g.set(19 + Math.floor(i / 2), 37 + i, 'r');
          g.set(28 - Math.floor(i / 2), 37 + i, 'r');
        }
        g.stamp(['777', '.7w'], 22, 43);
        break;
      case 'bandana':
        spans(
          g,
          33,
          [
            [18, 29],
            [17, 30],
            [18, 29],
          ],
          'A',
        );
        for (let x = 25; x <= 29; x++) g.set(x, 34, 'a');
        spans(
          g,
          36,
          [
            [19, 28],
            [20, 27],
            [21, 26],
            [22, 25],
            [23, 24],
          ],
          'A',
        );
        for (let y = 36; y <= 40; y++) g.set(28 - (y - 36), y, 'a');
        g.stamp(['@'], 21, 37);
        break;
      case 'lanyard':
        for (let i = 0; i < 7; i++) {
          g.set(20 + Math.floor(i / 2), 38 + i, 'A');
          g.set(27 - Math.floor(i / 2), 38 + i, 'A');
        }
        g.stamp(['WWWWWW', 'W1WwwW', 'W1WwwW', 'WWWWWW'], 21, 44);
        break;
      case 'cup':
        g.stamp(['.1111.', '111111', 'WWWWWw', 'W888ww', 'W888ww', 'WWWWww', 'WWWWww'], 32, 40);
        g.stamp(['SS', 'Ss', 'Ss'], 30, 43);
        break;
      case 'phone':
        g.stamp(['11111', '12221', '12221', '12221', '12221', '11111'], 32, 41);
        g.stamp(['S.', 'SS', 'sS'], 31, 45);
        break;
      case 'pliers':
        g.stamp(['7.7', '7.7', '.7.', '.7.'], 20, 41);
        g.stamp(['<<', '<w'], 25, 42);
        break;
      case 'tape':
        for (let i = 0; i < 6; i++) {
          g.set(6 + i, 41 - Math.floor(i / 2), 'A');
          g.set(7 + i, 43 - Math.floor(i / 2), 'A');
          g.set(8 + i, 45 - Math.floor(i / 2), '@');
        }
        break;
      case 'keys':
        g.stamp(['<', '7', '7'], 14, 38);
        break;
      case 'towel':
        for (let y = 35; y < PH; y++)
          for (let x = 29 + Math.max(0, 38 - y); x <= Math.min(40, 33 + (y - 35)); x++)
            g.set(x, y, (x + y) % 5 === 0 ? 'w' : 'W');
        for (let x = 29; x <= 40; x++) if (g.get(x, 44) === 'W') g.set(x, 44, 'A');
        break;
      case 'tote':
        for (let y = 36; y < PH; y++) {
          const x = 30 + Math.floor((y - 36) / 2);
          g.set(x, y, 'N');
          g.set(x + 1, y, 'n');
        }
        break;
      case 'camera':
        for (let i = 0; i < 5; i++) {
          g.set(19 + i, 37 + i, '1');
          g.set(28 - i, 37 + i, '1');
        }
        g.stamp(['.11111111.', '1111111111', '11W77711W1', '1117W77111', '1117777111', '.11111111.'], 19, 41);
        break;
    }
  }
}

/* ---------------- 合成 ---------------- */

export function portrait(spec: PortraitSpec, expr: Expr): Grid {
  const s = SHAPES[spec.face];
  const g = new Grid(PW, PH);
  const marks = new Set(spec.marks);
  const hair = hairFor(spec);
  merge(g, hair.back);

  drawBust(g, spec, s);
  // 脖子
  const ch = chinY(s);
  const nhw = spec.face === 'kid' ? 4 : 5;
  for (let y = ch - 4; y <= (spec.face === 'kid' ? 39 : 37); y++)
    for (let x = CX - nhw; x < CX + nhw; x++) {
      if (y > 35 && g.get(x, y) !== '.' && !'Ss'.includes(g.get(x, y))) continue;
      g.set(x, y, x >= CX + 1 ? 's' : y <= ch + 1 ? 'z' : 'S');
    }
  for (let x = CX - nhw; x < CX + nhw; x++) g.set(x, ch + 1, 'z');
  // 耳朵
  const earL = CX - (faceHW(s, s.earY) as number) - 2;
  const earR = CX + (faceHW(s, s.earY) as number) - 1;
  g.stamp(EAR, earL, s.earY);
  g.stamp(
    mirror(EAR).map((r) => r.replace(/\+/g, 'S').replace(/S/g, 's').replace(/^s/, 'S')),
    earR,
    s.earY,
  );
  // 脸
  for (let y = s.top; y <= ch; y++) {
    const hw = faceHW(s, y);
    const x0 = CX - hw;
    const x1 = CX + hw - 1;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      let c = 'S';
      if (t > 0.8) c = 's';
      if (t > 0.94 && y > s.eyeY + 2) c = 'z';
      if (y >= ch - 1 && t > 0.3) c = 's';
      if (t > 0.1 && t < 0.24 && ((y > s.top + 4 && y < s.browY - 1) || (y > s.eyeY + 3 && y < s.eyeY + 6))) c = '+';
      g.set(x, y, c);
    }
  }
  // 眼窝和颧骨下的影
  for (let i = 0; i < 6; i++) {
    onSkin(g, [[s.eL + i, s.eyeY - 1]], 's');
    onSkin(g, [[s.eR + i, s.eyeY - 1]], 's');
  }

  // 皱纹、雀斑、胡茬（画在皮肤上）
  const eyeOuterL = s.eL - 1;
  const eyeOuterR = s.eR + 6;
  if (marks.has('forehead')) {
    for (let x = 18; x <= 29; x++) if (x !== 23) onSkin(g, [[x, s.browY - 3]], 's');
    for (let x = 19; x <= 28; x++) if (x !== 21 && x !== 26) onSkin(g, [[x, s.browY - 5]], 's');
  }
  if (marks.has('crow'))
    onSkin(
      g,
      [
        [eyeOuterL, s.eyeY + 1],
        [eyeOuterL - 1, s.eyeY],
        [eyeOuterL - 1, s.eyeY + 2],
        [eyeOuterR, s.eyeY + 1],
        [eyeOuterR + 1, s.eyeY],
        [eyeOuterR + 1, s.eyeY + 2],
      ],
      'z',
    );
  if (marks.has('bags'))
    for (let i = 1; i <= 4; i++)
      onSkin(
        g,
        [
          [s.eL + i, s.eyeY + 3],
          [s.eR + i, s.eyeY + 3],
        ],
        i === 1 || i === 4 ? 's' : 'z',
      );
  if (marks.has('jowls'))
    onSkin(
      g,
      [
        [20, s.noseY + 4],
        [19, s.noseY + 5],
        [19, s.noseY + 6],
        [18, s.noseY + 7],
        [27, s.noseY + 4],
        [28, s.noseY + 5],
        [28, s.noseY + 6],
        [29, s.noseY + 7],
      ],
      's',
    );
  if (marks.has('cheek'))
    onSkin(
      g,
      [
        [16, s.noseY + 3],
        [17, s.noseY + 4],
        [31, s.noseY + 3],
        [30, s.noseY + 4],
      ],
      's',
    );
  if (marks.has('spots'))
    onSkin(
      g,
      [
        [30, 13],
        [31, 15],
        [17, 12],
      ],
      's',
    );
  if (marks.has('freckles'))
    onSkin(
      g,
      [
        [18, s.eyeY + 4],
        [20, s.eyeY + 5],
        [17, s.eyeY + 6],
        [21, s.eyeY + 4],
        [27, s.eyeY + 4],
        [29, s.eyeY + 5],
        [30, s.eyeY + 4],
        [28, s.eyeY + 6],
        [23, s.eyeY + 3],
        [24, s.eyeY + 4],
      ],
      'z',
    );
  if (marks.has('blush') || marks.has('sunburn')) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 4; i++) pts.push([s.eL + i, s.eyeY + 4], [s.eR + 2 + i, s.eyeY + 4]);
    for (let i = 1; i < 3; i++) pts.push([s.eL + i, s.eyeY + 5], [s.eR + 2 + i, s.eyeY + 5]);
    if (marks.has('sunburn')) for (let x = 20; x <= 27; x++) pts.push([x, s.eyeY + 3], [x, s.top + 6]);
    onSkin(g, pts, 'L');
  }
  if (marks.has('stubble'))
    for (let y = s.mouthY - 2; y <= ch; y++)
      for (let x = 0; x < PW; x++) {
        const nearMouth = y >= s.mouthY && y <= s.mouthY + 2 && x >= 20 && x <= 27;
        const cheek = y < s.mouthY && Math.abs(x - 23.5) > 4.5 && Math.abs(x - 23.5) < faceHW(s, y) - 3;
        if (nearMouth || cheek) continue;
        if ((x + y) % 2 === 0) onSkin(g, [[x, y]], (x * 5 + y * 3) % 7 === 0 ? 'k' : 's');
      }
  if (marks.has('fuzz')) for (let x = 21; x <= 26; x += 2) onSkin(g, [[x, s.mouthY - 1]], 's');

  // 表情
  const eyeState =
    expr === 'happy'
      ? 'closed'
      : expr === 'angry'
        ? 'narrow'
        : expr === 'sad'
          ? 'sad'
          : expr === 'surprised'
            ? 'wide'
            : 'open';
  const eyes = EYES[spec.eyes][eyeState];
  g.stamp(eyes, s.eL, s.eyeY);
  g.stamp(mirror(eyes), s.eR, s.eyeY);
  if (marks.has('eyeshadow'))
    for (let i = 1; i < 5; i++)
      onSkin(
        g,
        [
          [s.eL + i, s.eyeY - 1],
          [s.eR + i, s.eyeY - 1],
        ],
        '>',
      );
  // 眉毛
  const bs = BROW_SHAPE[expr];
  const thick = spec.brows === 'thick' || spec.brows === 'bushy' ? 2 : 1;
  const arch = spec.brows === 'arched' ? [1, 0, -1, -1, 0, 1] : [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 6; i++) {
    const dy = (bs[i] as number) + (arch[i] as number) - (spec.face === 'kid' ? 0 : 0);
    for (let t = 0; t < thick; t++) {
      const y = s.browY + dy - t;
      const c = t === 0 ? 'x' : 'h';
      g.set(s.eL + i, y, c);
      g.set(s.eR + 5 - i, y, c);
    }
    if (spec.brows === 'bushy' && i % 2 === 0) {
      g.set(s.eL + i, s.browY + dy - 2, 'h');
      g.set(s.eR + 5 - i, s.browY + dy - 2, 'h');
    }
  }
  if (spec.brows === 'bushy') {
    g.set(s.eL - 1, s.browY + (bs[0] as number), 'h');
    g.set(s.eR + 6, s.browY + (bs[0] as number), 'h');
  }
  // 鼻子
  g.stamp(NOSE[spec.nose], 21, s.noseY);
  if (marks.has('sunburn'))
    onSkin(
      g,
      [
        [23, s.noseY + 3],
        [24, s.noseY + 2],
        [24, s.noseY + 3],
      ],
      'L',
    );
  // 嘴
  let mouth = MOUTH[expr];
  if (marks.has('lipstick')) mouth = mouth.map((r) => r.replace(/M/g, '<').replace(/^(\.\.)zzzz/, '$1<<<<'));
  if (marks.has('gap') && expr === 'happy') mouth = mouth.map((r, i) => (i === 1 ? r.replace('WWWW', 'WmWW') : r));
  g.stamp(mouth, 20, s.mouthY);
  if (marks.has('mole')) g.set(29, s.mouthY - 1, 'z');

  // 胡子
  if (marks.has('beard')) {
    const bg = new Grid(PW, PH);
    for (let y = s.eyeY + 3; y <= ch + 5; y++) {
      const fh = faceHW(s, y);
      const hw = fh > 0 ? fh + (y > s.mouthY ? 1 : 0) : Math.max(3, 9 - (y - ch) * 2);
      for (let x = CX - hw; x < CX + hw; x++) {
        const d = Math.abs(x + 0.5 - CX);
        if (y < s.mouthY - 2 && d < hw - 3) continue; // 脸颊露出来
        if (y >= s.mouthY && y <= s.mouthY + 1 && d < 3) continue; // 嘴
        bg.set(x, y, (x * 7 + y * 3) % 5 === 0 ? 'k' : 'K');
      }
    }
    for (let x = 18; x <= 29; x++) {
      bg.set(x, s.mouthY - 2, x > 26 ? 'k' : 'K');
      bg.set(x, s.mouthY - 1, x === 23 || x === 24 ? 'k' : 'K');
    }
    autoShade(bg, 'K', 'k', 'k', 'W', [ch, ch + 2]);
    merge(g, bg);
    if (expr === 'happy' || expr === 'surprised' || expr === 'angry') g.stamp(MOUTH[expr].slice(1), 20, s.mouthY);
  }
  if (marks.has('stache')) {
    g.stamp(
      ['...KKKKKK...', '.KKKKKKKKKK.', 'KKKKKkkKKKKk', 'KKk......kKk', 'Kk........kk', 'k..........k'],
      18,
      s.mouthY - 3,
    );
  }

  merge(g, hair.front);
  merge(g, hair.hat);

  // 眼镜
  if (marks.has('readers') || marks.has('shades') || marks.has('bigGlasses')) {
    const fill = marks.has('shades');
    const big = marks.has('bigGlasses');
    const ey = s.eyeY - (big ? 2 : 1);
    const hgt = big ? 7 : 5;
    for (const ex of [s.eL - 1, s.eR - 1]) {
      for (let x = ex; x < ex + 8; x++)
        for (let y = ey; y < ey + hgt; y++) {
          const edge = x === ex || x === ex + 7 || y === ey || y === ey + hgt - 1;
          if (edge) g.set(x, y, 'G');
          else if (big && (x === ex + 1 || x === ex + 6 || y === ey + 1 || y === ey + hgt - 2)) g.set(x, y, 'G');
          else if (fill) g.set(x, y, (x - ex + y - ey) % 6 === 2 ? '%' : 'V');
        }
      if (!fill) g.set(ex + 1, ey + 1, 'W');
    }
    for (let x = s.eL + 7; x < s.eR - 1; x++) g.set(x, s.eyeY, 'G');
    g.set(s.eL - 2, s.eyeY, 'G');
    g.set(s.eR + 7, s.eyeY, 'G');
  }
  if (marks.has('shadesUp')) {
    for (const ex of [16, 25]) g.stamp(['GGGGGGG', 'GVVVV%G', 'GVV%VVG', '.GGGGG.'], ex, 6);
    g.set(23, 7, 'G');
    g.set(24, 7, 'G');
  }
  if (marks.has('earrings')) {
    g.stamp(['0', '0'], earL + 1, s.earY + 6);
    g.stamp(['0', '0'], earR + 1, s.earY + 6);
  }

  drawAcc(g, spec);

  // 表情的小符号
  if (expr === 'angry') g.stamp(['#.#', '.#.', '#.#'], 33, 9);
  if (expr === 'sad') g.stamp(['.(', '((', '(('], 35, 14);

  return g.outline();
}

/** 小号：同一张图裁到脸（32×32），不另画 */
export function crop32(g: Grid, spec: PortraitSpec): Grid {
  const out = new Grid(32, 32);
  const kid = spec.face === 'kid';
  const x0 = 8;
  const y0 = kid ? 6 : 4;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) out.set(x, y, g.get(x0 + x, y0 + y));
  return out;
}
