/**
 * 方向 B「小而全 12×24」：按体型 + 姿势 + 脸部特征拼一帧。
 *
 * 坐标：身体的列用"离中缝的偏移" c（中缝左边是 -1、-2…，右边是 0、1…），格子列 = AX + c；
 * 行用身体内部的 y（0 = 头顶第一行头发/皮肤，不含描边）。成人内部 22 行、加上下描边 24 行。
 * 头 6×6（加描边 8 宽），一行一样：0 头发、1 刘海、2 眉毛、3 眼睛、4 鼻子和脸颊、5 嘴。
 * 正面：脸朝镜头，人物右手在画面左边（A 侧）；背面：右手在画面右边（B 侧）。左右朝向由运行时翻转。
 */
import type { Built, Pal } from './grid';
import { finish, Grid } from './grid';

export type Facing = 'front' | 'back';
export type Build = 'slim' | 'avg' | 'athletic' | 'broad' | 'heavy' | 'stooped' | 'slouch' | 'teen' | 'kid';
export type Hair =
  | 'short'
  | 'neat'
  | 'pony'
  | 'braid'
  | 'bun'
  | 'long'
  | 'bob'
  | 'curly'
  | 'bald'
  | 'pigtails'
  | 'white'
  | 'messy';
export type Hat = 'cap' | 'capBack' | 'wide' | 'visor' | 'bucket';
export type Top = 'tee' | 'polo' | 'tank' | 'long' | 'apron' | 'oversize' | 'blouse' | 'hawaii' | 'vest';
export type Bottom = 'shorts' | 'pants' | 'skirt' | 'cargo';
export type Acc =
  | 'whistle'
  | 'bandana'
  | 'tape'
  | 'wristband'
  | 'brace'
  | 'cane'
  | 'pouch'
  | 'gloves'
  | 'pliers'
  | 'phone'
  | 'cup'
  | 'camera'
  | 'clipboard'
  | 'lanyard'
  | 'tote'
  | 'backpack'
  | 'sunUp'
  | 'earbuds'
  | 'rake'
  | 'towel'
  | 'pearls';
export type Expr = 'n' | 'blink' | 'happy' | 'angry' | 'sigh' | 'wince' | 'down' | 'oh' | 'smile' | 'squint';

export interface Face {
  eyes: 'dot' | 'wide' | 'tired' | 'narrow';
  brows: 'thin' | 'thick' | 'arched' | 'skeptic' | 'bushy';
  nose: 'small' | 'big' | 'button';
  mouth: 'flat' | 'smile' | 'lips' | 'stern' | 'grin';
  beard?: 'full' | 'stubble' | 'mustache';
  glasses?: 'reading' | 'round' | 'sun';
  freckles?: boolean;
  blush?: boolean;
  wrinkles?: boolean;
  bags?: boolean;
}

export type IdleKind =
  | 'breathe'
  | 'rubBack'
  | 'sigh'
  | 'phone'
  | 'toss'
  | 'cane'
  | 'hips'
  | 'pliers'
  | 'coffee'
  | 'bounce'
  | 'clip'
  | 'photo'
  | 'fan'
  | 'rake';
export type WalkKind = 'normal' | 'limp' | 'shuffle' | 'bouncy' | 'strut' | 'kid';

export interface Spec {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly tags: readonly string[];
  readonly build: Build;
  readonly pal: Pal;
  readonly hair: Hair;
  readonly hat?: Hat;
  readonly face: Face;
  readonly top: Top;
  readonly bottom: Bottom;
  readonly socks?: boolean;
  readonly acc: readonly Acc[];
  readonly racket?: boolean;
  readonly idle: IdleKind;
  readonly walk: WalkKind;
  readonly emo: 'happy' | 'angry';
}

/* ---------------- 体型 ---------------- */

interface Lay {
  top: number;
  neck: boolean;
  /** 躯干半宽（列 -tw..tw-1） */
  tw: number;
  /** 腰比肩窄几格（腰两行） */
  waist: number;
  /** 肚子比躯干宽几格（肚子三行） */
  belly: number;
  /** 肩那一行窄一格（溜肩、驼背） */
  round: boolean;
  sh: number;
  belt: number;
  bot: number;
  leg0: number;
  leg1: number;
  shoe: number;
  foot: number;
  /** 腿：每条腿的列（A 是画面左边那条） */
  legA: readonly [number, number];
  legB: readonly [number, number];
  /** 手臂接在第几列（A 侧，B 侧镜像） */
  arm: number;
  /** 手臂长（像素） */
  armLen: number;
  /** 肩膀往下挪（溜肩） */
  armDrop: number;
}

function layout(b: Build): Lay {
  const adult: Lay = {
    top: 0,
    neck: true,
    tw: 3,
    waist: 0,
    belly: 0,
    round: false,
    sh: 7,
    belt: 13,
    bot: 14,
    leg0: 16,
    leg1: 19,
    shoe: 20,
    foot: 22,
    legA: [-3, -2],
    legB: [1, 2],
    arm: -4,
    armLen: 6,
    armDrop: 0,
  };
  switch (b) {
    case 'slim':
      return { ...adult, tw: 2, legA: [-2, -2], legB: [1, 1], arm: -3 };
    case 'athletic':
      return { ...adult, waist: 1 };
    case 'broad':
      return { ...adult, tw: 4, arm: -5, legA: [-3, -2], legB: [1, 2] };
    case 'heavy':
      return { ...adult, tw: 4, belly: 1, arm: -5, legA: [-3, -2], legB: [1, 2] };
    case 'stooped':
      return { ...adult, top: 2, neck: false, round: true, sh: 8, armDrop: 1, armLen: 6 };
    case 'slouch':
      return { ...adult, tw: 4, top: 1, neck: false, round: true, sh: 7, arm: -5, armDrop: 1, armLen: 7 };
    case 'teen':
      return { ...adult, tw: 3, top: 2, sh: 9, legA: [-2, -2], legB: [1, 1], arm: -4, armLen: 5 };
    case 'kid':
      return {
        ...adult,
        top: 0,
        neck: false,
        tw: 2,
        sh: 6,
        belt: 9,
        bot: 9,
        leg0: 11,
        leg1: 11,
        shoe: 12,
        foot: 14,
        legA: [-2, -2],
        legB: [1, 1],
        arm: -3,
        armLen: 4,
      };
    default:
      return adult;
  }
}

/* ---------------- 姿势 ---------------- */

export type ArmKind =
  | 'down'
  | 'fwd'
  | 'back'
  | 'hip'
  | 'up'
  | 'upOut'
  | 'chest'
  | 'face'
  | 'behind'
  | 'outLow'
  | 'across'
  | 'over'
  | 'fist'
  | 'cane'
  | 'pocket'
  | 'hold'
  | 'raise'
  | 'glasses';

/** 手臂路径：从肩开始，dx 朝外为正，dy 朝下为正。最后一格是手。 */
const ARM: Record<ArmKind, readonly (readonly [number, number])[]> = {
  down: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
  ],
  fwd: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [-1, 4],
  ],
  back: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 4],
  ],
  hip: [
    [0, 0],
    [0, 1],
    [1, 2],
    [1, 3],
    [0, 4],
    [-1, 5],
  ],
  up: [
    [0, 0],
    [0, -1],
    [0, -2],
    [0, -3],
    [0, -4],
    [0, -5],
    [0, -6],
  ],
  upOut: [
    [0, 0],
    [1, -1],
    [1, -2],
    [2, -3],
    [2, -4],
    [2, -5],
  ],
  chest: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [-1, 3],
    [-2, 3],
  ],
  face: [
    [0, 0],
    [0, 1],
    [0, 2],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ],
  glasses: [
    [0, 0],
    [0, 1],
    [0, 2],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [-1, -2],
  ],
  behind: [
    [0, 0],
    [0, 1],
    [1, 2],
    [1, 3],
  ],
  outLow: [
    [0, 0],
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 3],
  ],
  across: [
    [0, 0],
    [0, 1],
    [-1, 2],
    [-2, 3],
    [-3, 3],
    [-4, 3],
  ],
  over: [
    [0, 0],
    [-1, 0],
    [-2, -1],
    [-3, -2],
    [-4, -3],
  ],
  fist: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 5],
  ],
  cane: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 3],
    [1, 4],
    [1, 5],
  ],
  pocket: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  hold: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
    [-1, 4],
    [-1, 5],
  ],
  raise: [
    [0, 0],
    [0, 1],
    [0, 2],
    [-1, 2],
    [-1, 1],
  ],
};

export interface Leg {
  /** 脚抬起几格（负数 = 往前迈，脚比地面低一格） */
  lift: number;
  dx: number;
}

export type RacketDir = 'down' | 'up' | 'out' | 'across' | 'over' | 'back';

export interface Pose {
  bob?: number;
  headDy?: number;
  headDx?: number;
  /** 上身左右挪（挥拍转身） */
  lean?: number;
  /** 整个人离地（跳） */
  hop?: number;
  legA?: Leg;
  legB?: Leg;
  /** 拿拍手 / 另一只手（正面拿拍手在 A 侧） */
  rk?: ArmKind;
  fr?: ArmKind;
  racket?: RacketDir;
  face?: Expr;
  /** 球（抛球）在头顶上多高；undefined = 不画 */
  ball?: number;
  /** 拐杖往前点地（行走时） */
  caneDx?: number;
  /** 这一帧一定拿拍子（挥拍动作：平时不拿拍的人也借一支） */
  forceRacket?: boolean;
  /** 拿着手机 / 杯子 / 相机的那只手放哪 */
  prop?: 'fr' | 'rk';
}

/* ---------------- 部件字符画 ---------------- */

/**
 * 发型（正面 / 背面）：宽 10（头占第 2–7 列，左右各留 2 列给蓬松的头发和马尾），
 * 第 0 行对齐头顶上两格（y = top - 2）。'_' 是挖空（露出下面的皮肤或背景），'.' 不动。
 */
const HAIR: Record<Hair, { front: readonly string[]; back: readonly string[] }> = {
  short: {
    front: ['..........', '...HHHH...', '..HHHHHH..', '..HHHHHh..'],
    back: ['..........', '...HHHH...', '..HHHHHH..', '..HHHHHh..', '..HHHHHh..', '..HHHHHh..', '...hhhh...'],
  },
  neat: {
    front: ['..........', '...HHHHH..', '..HHHHHHH.', '..H..HHHh.'],
    back: ['..........', '...HHHHH..', '..HHHHHHH.', '..HHHHHHh.', '..HHHHHh..', '..HHHHHh..'],
  },
  messy: {
    front: ['....H.H...', '..HHHHHH..', '.HHHHHHHH.', '..HHH.HHh.'],
    back: ['....H.H...', '..HHHHHH..', '.HHHHHHHH.', '..HHHHHHh.', '..HHHHHh..', '..HHHHHh..', '...hhhh...'],
  },
  curly: {
    front: ['...H.HH...', '..HHHHHH..', '.HHHHHHHH.', '.HHHhHHHh.', '.H......h.'],
    back: ['...H.HH...', '..HHHHHH..', '.HHHHHHHH.', '.HHHHHHHh.', '.HHHHHHHh.', '.hHHHHHhh.', '..hhhhhh..'],
  },
  pony: {
    front: ['..........', '...HHHH...', '..HHHHHH..', '..HHH.HH..', '..H....H..'],
    back: [
      '.....HH...',
      '...HHHHh..',
      '..HHHHHH..',
      '..HHHHHh..',
      '..HHHHHh..',
      '...HHHh...',
      '....HH....',
      '....Hh....',
      '....hh....',
      '.....h....',
    ],
  },
  braid: {
    front: [
      '..........',
      '...HHHH...',
      '..HHHHHH..',
      '..H.HHHH..',
      '..H.....H.',
      '........H.',
      '........h.',
      '........H.',
    ],
    back: [
      '..........',
      '...HHHH...',
      '..HHHHHH..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..HHHHHh..',
      '...hHHh...',
      '....Hh....',
      '....hH....',
      '....Hh....',
      '....hH....',
    ],
  },
  bun: {
    front: ['....HH....', '...HhHh...', '..HHHHHH..', '..HHHHHH..', '..H....H..'],
    back: ['....HH....', '...HHHh...', '..HHHHHH..', '..HHHHHh..', '..HHHHHh..', '..HHHHHh..', '...hhhh...'],
  },
  long: {
    front: [
      '..........',
      '...HHHH...',
      '..HHHHHH..',
      '..HHHHHH..',
      '..H....h..',
      '..H....h..',
      '..H....h..',
      '..H....h..',
      '..h....h..',
      '..h....h..',
    ],
    back: [
      '..........',
      '...HHHH...',
      '..HHHHHH..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..HHHHHh..',
      '..hHHHhh..',
    ],
  },
  bob: {
    front: ['..........', '...HHHH...', '..HHHHHH..', '.HHHHHHHh.', '.H......h.', '.H......h.', '.h......h.'],
    back: ['..........', '...HHHH...', '..HHHHHH..', '.HHHHHHHh.', '.HHHHHHHh.', '.HHHHHHHh.', '.hHHHHHhh.'],
  },
  pigtails: {
    front: ['..........', '...HHHH...', '..HHHHHH..', 'HHH.HHHHHH', 'H.H....H.h', 'h.......hh'],
    back: ['..........', '...HHHH...', '..HHHHHH..', 'HHHHHHHHHh', 'H.HHHHHh.h', 'h.HHHHHh.h', '...hhhh...'],
  },
  bald: {
    front: ['..........', '..........', '..........', '..H....h..'],
    back: ['..........', '..........', '..........', '..H....h..', '..HHHHHh..', '...hhhh...'],
  },
  white: {
    front: ['..........', '...HHHH...', '..HHHHHH..', '..H....h..', '..H....h..'],
    back: ['..........', '...HHHH...', '..HHHHHH..', '..HHHHHh..', '..HHHHHh..', '..HHHHHh..', '...hhhh...'],
  },
};

/** 帽子：同样宽 10，第 0 行对齐 y = top - 2 */
const HAT: Record<Hat, { front: readonly string[]; back: readonly string[] }> = {
  cap: {
    front: ['..........', '...CCCC...', '..CCUCCC..', '.cccccccc.'],
    back: ['..........', '...CCCC...', '..CCCCCC..', '..CCCCCc..', '...S..S...'],
  },
  capBack: {
    front: ['..........', '...CCCC...', '..CCCCCC..', '..c.....c.'],
    back: ['..........', '...CCCC...', '..CCCCCC..', '.ccccccc..'],
  },
  wide: {
    front: ['..........', '...CCCC...', '..CUUUUC..', 'CCCCCCCCCc', '.cccccccc.'],
    back: ['..........', '...CCCC...', '..CUUUUC..', 'CCCCCCCCCc', '.cccccccc.'],
  },
  visor: {
    front: ['..........', '..........', '..CCCCCC..', '.cccccccc.'],
    back: ['..........', '..........', '..CCCCCC..', '..C....c..'],
  },
  bucket: {
    front: ['..........', '...CCCC...', '..CCCCCC..', '..UUUUUU..', '.cccccccc.'],
    back: ['..........', '...CCCC...', '..CCCCCC..', '..UUUUUU..', '.cccccccc.'],
  },
};

/**
 * 球拍：hx, hy 是"手"那一格在图里的位置（那一格本身不画）。只画在空格上（不描边、不压身体）。
 * 画给 A 侧（画面左边）的手；B 侧左右镜像。
 */
interface Stamp {
  rows: readonly string[];
  hx: number;
  hy: number;
}
const RACKET: Record<RacketDir, Stamp> = {
  down: { rows: ['...x', '..q.', '.QQ.', 'QJ.Q', 'Q.JQ', 'QJ.Q', '.QQ.'], hx: 3, hy: 0 },
  up: { rows: ['.QQ.', 'QJ.Q', 'Q.JQ', 'QJ.Q', '.QQ.', '..q.', '...x'], hx: 3, hy: 6 },
  out: { rows: ['.QQQ...', 'QJ.JQqx', 'Q.J.Q..', '.QQQ...'], hx: 6, hy: 1 },
  back: { rows: ['.QQ..', 'QJ.Q.', 'Q.JQ.', 'QJ.Q.', '.QQq.', '....x'], hx: 4, hy: 5 },
  across: { rows: ['x.......', '.qQQQ...', '.QJ.JQ..', '.Q.J.Q..', '..QQQ...'], hx: 0, hy: 0 },
  over: { rows: ['..QQ.', '.QJ.Q', '.Q.JQ', '.QJ.Q', '..QQ.', '.q...', 'x....'], hx: 0, hy: 6 },
};

/* ---------------- 拼一帧 ---------------- */

const GW = 32;
const GH = 34;
/** 中缝右边那一列在格子里的 x；身体内部 y=0 在格子里的行 */
const AX = 16;
const AY0 = 6;

export function compose(s: Spec, facing: Facing, p: Pose): Built {
  const L = layout(s.build);
  const g = new Grid(GW, GH);
  const pal = s.pal;
  const hop = p.hop ?? 0;
  const Y = (y: number) => AY0 + y - hop;
  const X = (c: number) => AX + c;
  const bob = p.bob ?? 0;
  const lean = p.lean ?? 0;
  const front = facing === 'front';
  // 拿拍手：正面在 A 侧（画面左），背面在 B 侧
  const rkSide: 'A' | 'B' = front ? 'A' : 'B';
  const armKind = (side: 'A' | 'B'): ArmKind => (side === rkSide ? (p.rk ?? 'down') : (p.fr ?? 'down'));
  const hands: Record<'A' | 'B', [number, number] | null> = { A: null, B: null };
  const has = (a: Acc) => s.acc.includes(a);

  /* 腿和鞋 */
  const pants = s.bottom === 'pants' || s.bottom === 'cargo';
  const drawLeg = (cols: readonly [number, number], leg: Leg) => {
    const dx = leg.dx;
    const l0 = L.leg0;
    const l1 = L.leg1 - Math.max(0, leg.lift);
    const extra = leg.lift < 0 ? -leg.lift : 0;
    for (let y = L.bot; y <= l1 + extra; y++)
      for (let c = cols[0]; c <= cols[1]; c++) {
        let ch = pants || y <= L.bot + 1 ? 'B' : 'S';
        if (s.bottom === 'skirt' && y <= L.bot + 2) ch = 'B';
        if (s.bottom === 'cargo' && y >= l1 + extra - 1) ch = 'S';
        if (s.socks && !pants && y === l1 + extra) ch = 'K';
        if (has('brace') && c === cols[0] && cols === L.legA && y === l0 + 1 && ch === 'S') ch = 'A';
        g.set(X(c + dx), Y(y), ch);
      }
    // 护膝（Ray，A 侧膝盖）：两格宽的黑色护具
    if (has('brace') && cols === L.legA) {
      const ky = Math.min(l1 + extra, l0 + 1);
      for (let c = cols[0]; c <= cols[1]; c++) g.set(X(c + dx), Y(ky), c === cols[0] ? 'A' : 'a');
    }
    const sy0 = L.shoe - Math.max(0, leg.lift) + extra;
    const shoeRows = L.foot - L.shoe;
    for (let k = 0; k < shoeRows; k++) for (let c = cols[0]; c <= cols[1]; c++) g.set(X(c + dx), Y(sy0 + k), 'F');
    // 鞋尖朝外多一格
    const out = cols === L.legA ? cols[0] - 1 : cols[1] + 1;
    g.set(X(out + dx), Y(sy0 + shoeRows - 1), 'F');
  };
  drawLeg(L.legA, p.legA ?? { lift: 0, dx: 0 });
  drawLeg(L.legB, p.legB ?? { lift: 0, dx: 0 });

  /* 下装上沿：一整行盖住两腿之间（短裤、裙子） */
  const bw = L.tw - L.waist;
  for (let c = -bw; c < bw; c++) g.set(X(c), Y(L.bot), 'B');
  if (s.bottom === 'skirt') {
    for (let c = -bw; c < bw; c++) g.set(X(c), Y(L.bot + 1), 'B');
    for (let c = -bw - 1; c < bw + 1; c++) g.set(X(c), Y(L.bot + 2), c === -bw - 1 || c === bw ? 'b' : 'B');
  }
  // 中缝：裤子两腿之间那一格在第二行起是空的（描边自动补）
  if (s.build !== 'kid' && s.bottom !== 'skirt') {
    g.put(X(-1), Y(L.bot + 1), L.legA[1] >= -1 ? g.get(X(-1), Y(L.bot + 1)) : 'B');
    g.put(X(0), Y(L.bot + 1), L.legB[0] <= 0 ? g.get(X(0), Y(L.bot + 1)) : 'B');
  }

  /* 躯干 */
  const ty0 = L.sh + bob;
  for (let y = ty0; y < L.bot; y++) {
    let w = L.tw;
    if (L.round && y === ty0) w = L.tw - 1;
    if (L.waist && y >= L.belt - 1) w = L.tw - L.waist;
    if (L.belly && y >= L.belt - 3 && y <= L.belt - 1) w = L.tw + L.belly;
    const isBelt = y === L.belt;
    for (let c = -w; c < w; c++) {
      let ch = 'T';
      if (isBelt && s.top !== 'oversize' && s.top !== 'hawaii' && s.top !== 'blouse' && s.top !== 'apron') ch = 'U';
      if (s.top === 'oversize' && isBelt) ch = 't';
      g.set(X(c + lean), Y(y), ch);
    }
  }
  // 上衣花样
  const tcol = (c: number) => X(c + lean);
  if (front) {
    if (s.top === 'polo') {
      g.set(tcol(-1), Y(ty0), 'U');
      g.set(tcol(0), Y(ty0), 'U');
      g.set(tcol(-1), Y(ty0 + 1), 'S');
      g.set(tcol(0), Y(ty0 + 1), 'U');
    } else if (s.top === 'tee' || s.top === 'oversize') {
      g.set(tcol(-1), Y(ty0), 'S');
      g.set(tcol(0), Y(ty0), 'S');
    } else if (s.top === 'tank') {
      for (let c = -L.tw; c < L.tw; c++) if (c !== -L.tw && c !== L.tw - 1) g.set(tcol(c), Y(ty0), 'S');
      g.set(tcol(-1), Y(ty0 + 1), 'S');
      g.set(tcol(0), Y(ty0 + 1), 'S');
      for (let c = -L.tw; c < L.tw; c++) g.set(tcol(c), Y(ty0 + 3), 'U');
    } else if (s.top === 'blouse') {
      g.set(tcol(-1), Y(ty0), 'U');
      g.set(tcol(0), Y(ty0), 'U');
      g.set(tcol(-1), Y(ty0 + 1), 'S');
      for (let y = ty0 + 2; y < L.belt; y++) g.set(tcol(0), Y(y), 'U');
    } else if (s.top === 'apron') {
      g.set(tcol(-1), Y(ty0), 'S');
      g.set(tcol(0), Y(ty0), 'S');
      for (let y = ty0 + 1; y <= L.belt + 1; y++)
        for (let c = -L.tw + 1; c < L.tw - 1; c++) g.set(tcol(c), Y(y), y === L.belt - 1 ? 'a' : 'A');
      g.set(tcol(-L.tw + 1), Y(ty0), 'A');
      g.set(tcol(L.tw - 2), Y(ty0), 'A');
    } else if (s.top === 'hawaii') {
      g.set(tcol(-1), Y(ty0), 'S');
      g.set(tcol(0), Y(ty0), 'U');
      for (let y = ty0; y < L.bot; y++)
        for (let c = -L.tw - L.belly; c < L.tw + L.belly; c++) if ((c * 3 + y * 2) % 5 === 0) g.set(tcol(c), Y(y), 'U');
    } else if (s.top === 'vest') {
      for (let y = ty0; y < L.belt; y++) {
        g.set(tcol(-1), Y(y), 'U');
        g.set(tcol(0), Y(y), 'U');
      }
      g.set(tcol(-1), Y(ty0), 'S');
      g.set(tcol(0), Y(ty0), 'S');
    } else if (s.top === 'long') {
      g.set(tcol(-1), Y(ty0), 'U');
      g.set(tcol(0), Y(ty0), 'U');
    }
  } else if (s.top === 'apron') {
    // 背面：围裙带在腰上系个结，肩带从两边绕过来
    for (let c = -L.tw; c < L.tw; c++) g.set(tcol(c), Y(L.belt - 1), 'A');
    g.set(tcol(-1), Y(L.belt), 'a');
    g.set(tcol(0), Y(L.belt), 'A');
    g.set(tcol(-L.tw), Y(ty0), 'A');
    g.set(tcol(L.tw - 1), Y(ty0), 'a');
  } else if (s.top === 'tank') {
    for (let c = -L.tw + 1; c < L.tw - 1; c++) g.set(tcol(c), Y(ty0), 'S');
  } else if (s.top === 'hawaii') {
    for (let y = ty0; y < L.bot; y++)
      for (let c = -L.tw - L.belly; c < L.tw + L.belly; c++) if ((c * 3 + y * 2) % 5 === 0) g.set(tcol(c), Y(y), 'U');
  }

  /* 脖子 */
  const hy = L.top + bob + (p.headDy ?? 0);
  const hdx = (p.headDx ?? 0) + lean;
  if (L.neck) {
    g.set(X(-1 + hdx), Y(hy + 6), 'S');
    g.set(X(0 + hdx), Y(hy + 6), 'S');
  }

  /* 头 */
  for (let y = 0; y < 6; y++)
    for (let c = -3; c < 3; c++) {
      if ((y === 5 && (c === -3 || c === 2)) || (y === 0 && (c === -3 || c === 2))) continue; // 圆角
      g.set(X(c + hdx), Y(hy + y), 'S');
    }
  // 耳朵（正面两侧各一格，和眼睛同一行下面）
  if (s.build !== 'kid') {
    g.set(X(-4 + hdx), Y(hy + 3), 'S');
    g.set(X(3 + hdx), Y(hy + 3), 's');
  }
  const hx0 = X(-5 + hdx);
  const hy0 = Y(hy - 2);
  if (front) drawFace(g, s, p.face ?? 'n', X(-3 + hdx), Y(hy));
  const hairArt = HAIR[s.hair][facing];
  // 帽子下面不画头顶的头发（只留两侧和后面）
  if (s.hat && s.hat !== 'visor') g.stamp(hairArt.slice(Math.min(hairArt.length, 4)), hx0, hy0 + 4);
  else g.stamp(hairArt, hx0, hy0);
  if (!front && s.hair !== 'bald' && s.hat !== 'visor') {
    // 背面：后脑勺整片都是头发（留最后一行露出脖子）
    for (let y = s.hat ? 2 : 0; y < 5; y++)
      for (let c = -3; c < 3; c++)
        if (g.get(X(c + hdx), Y(hy + y)) === 'S') g.put(X(c + hdx), Y(hy + y), c === 2 ? 'h' : 'H');
  }
  if (front && s.hat && s.hat !== 'visor' && s.hair === 'long') {
    // 戴帽子的长发：两侧垂下来
    g.stamp(hairArt.slice(4), hx0, hy0 + 4);
  }
  if (s.hat) g.stamp(HAT[s.hat][facing], hx0, hy0);
  if (has('sunUp')) {
    // 墨镜推在头顶
    const yy = Y(hy) - 1;
    for (const c of [-2, -1, 0, 1]) g.put(X(c + hdx), yy, c === -1 || c === 0 ? 'x' : 'X');
  }
  if (has('earbuds') && front) {
    g.put(X(-4 + hdx), Y(hy + 3), 'W');
    g.put(X(3 + hdx), Y(hy + 3), 'W');
  }
  if (has('bandana')) {
    const by = Y(hy + 6);
    for (let c = -2; c < 2; c++) g.put(X(c + hdx), by, c === 1 ? 'a' : 'A');
    if (front) g.put(X(0 + hdx), by + 1, 'A');
  }

  /* 手臂 */
  const sleeve = (k: number, n: number): string => {
    if (s.top === 'tank') return 'S';
    if (s.top === 'long' || s.top === 'blouse') return k < n - 1 ? 'T' : 'S';
    if (s.top === 'oversize') return k < 3 ? 'T' : 'S';
    if (s.top === 'apron' || s.top === 'vest') return k < 1 ? 'T' : 'S';
    return k < 2 ? 'T' : 'S';
  };
  for (const side of ['A', 'B'] as const) {
    const kind = armKind(side);
    const path = ARM[kind];
    const sx = side === 'A' ? L.arm : -L.arm - 1;
    const dir = side === 'A' ? -1 : 1;
    let n = path.length;
    // 手臂长度：躯干短的人手也短
    if (kind === 'down' || kind === 'fist' || kind === 'cane') n = Math.min(n, L.armLen);
    const sy = ty0 + L.armDrop;
    for (let k = 0; k < n; k++) {
      const [dx, dy] = path[k];
      let x = sx + dx * dir + lean;
      // 胖子的手臂绕着肚子
      if (L.belly && (kind === 'down' || kind === 'fist') && dy >= 3) x += dir;
      let ch = sleeve(k, n);
      if (k === n - 1) ch = has('gloves') ? 'G' : 'S';
      if (has('wristband') && side === rkSide && k === n - 2 && ch === 'S') ch = 'U';
      if (has('tape') && side !== rkSide && k === 1 && s.top === 'tank') ch = 'A';
      // 背面：手臂在身体前面的部分被身体挡住（只画在空格上）
      if (front || dx >= 0 || g.get(X(x), Y(sy + dy)) === '.') g.put(X(x), Y(sy + dy), ch);
      // 手臂和躯干之间压一道暗线，手臂才分得出来
      if (k >= 1 && dx === 0) {
        const ix = X(x - dir);
        const t = g.get(ix, Y(sy + dy));
        if (t === 'T' || t === 'U' || t === 'A') g.put(ix, Y(sy + dy), t.toLowerCase());
      }
    }
    const last = path[n - 1];
    hands[side] = [X(sx + last[0] * dir + lean), Y(sy + last[1])];
  }
  // 肩上的肌贴（Nadia：不拿拍的那边肩膀两道彩条）
  if (has('tape') && s.top === 'tank') {
    const side = rkSide === 'A' ? 'B' : 'A';
    const sx = side === 'A' ? L.arm : -L.arm - 1;
    g.put(X(sx + lean), Y(ty0), 'A');
    g.put(X(sx + lean + (side === 'A' ? 1 : -1)), Y(ty0), 'A');
  }
  // 胸前的哨子 / 挂绳
  if (front && (has('whistle') || has('lanyard'))) {
    g.put(tcol(-2), Y(ty0 + 1), 'A');
    g.put(tcol(1), Y(ty0 + 1), 'A');
    g.put(tcol(-1), Y(ty0 + 2), 'A');
    g.put(tcol(0), Y(ty0 + 3), has('whistle') ? 'G' : 'W');
  }
  if (front && has('pearls')) {
    // 珍珠项链：领口一圈白点
    for (const c of [-2, -1, 0, 1]) g.put(tcol(c), Y(ty0 + (c === -2 || c === 1 ? 0 : 1)), 'W');
  }
  if (front && has('camera')) {
    g.put(tcol(-2), Y(ty0 + 1), 'A');
    g.put(tcol(1), Y(ty0 + 1), 'A');
    if ((p.fr ?? 'down') !== 'face') {
      g.put(tcol(-1), Y(ty0 + 3), 'G');
      g.put(tcol(0), Y(ty0 + 3), 'G');
      g.put(tcol(-1), Y(ty0 + 4), 'g');
      g.put(tcol(0), Y(ty0 + 4), 'V');
    }
  }
  // 球童的球袋：腰侧挂一个装满球的袋子
  if (has('pouch')) {
    const side = front ? 'B' : 'A';
    const c = side === 'A' ? -L.tw - 1 : L.tw;
    const yy = L.belt;
    g.put(X(c), Y(yy), 'A');
    g.put(X(c + (side === 'A' ? -1 : 1)), Y(yy), 'a');
    g.put(X(c), Y(yy + 1), 'A');
    g.put(X(c + (side === 'A' ? -1 : 1)), Y(yy + 1), 'a');
    g.put(X(c), Y(yy - 1), 'I');
    g.put(X(c + (side === 'A' ? -1 : 1)), Y(yy - 1), 'I');
  }
  // 包：托特包（网球妈妈）、双肩包（游客，背面看得见）
  if (has('tote')) {
    const c = front ? L.tw : -L.tw - 1;
    const d = front ? 1 : -1;
    for (let y = L.belt - 2; y <= L.belt + 1; y++) {
      g.put(X(c + d), Y(y), 'A');
      g.put(X(c + 2 * d), Y(y), 'a');
    }
    g.put(X(c), Y(ty0), 'a');
  }
  if (has('backpack')) {
    if (front) {
      g.put(tcol(-L.tw), Y(ty0), 'A');
      g.put(tcol(L.tw - 1), Y(ty0), 'a');
      g.put(tcol(-L.tw), Y(ty0 + 1), 'A');
      g.put(tcol(L.tw - 1), Y(ty0 + 1), 'a');
    } else
      for (let y = ty0; y <= ty0 + 4; y++)
        for (let c = -2; c < 2; c++) g.put(tcol(c), Y(y), c === 1 || y === ty0 + 4 ? 'a' : 'A');
  }
  if (has('towel')) {
    const c = front ? -L.tw : L.tw - 1;
    g.put(tcol(c), Y(ty0), 'W');
    g.put(tcol(c), Y(ty0 + 1), 'W');
    g.put(tcol(c), Y(ty0 + 2), 'w');
  }

  /* 手里的东西 */
  const propSide: 'A' | 'B' = p.prop === 'rk' ? rkSide : rkSide === 'A' ? 'B' : 'A';
  const ph = hands[propSide];
  // 背面看不见拿在胸前的东西（耙子、拐杖除外）
  const inFront = !front && ph != null && g.get(ph[0], ph[1]) !== 'S' && g.get(ph[0], ph[1]) !== 'G';
  if (ph && (front || !inFront)) {
    const d = propSide === 'A' ? -1 : 1;
    const [hx, hy2] = ph;
    const fk = armKind(propSide);
    if (has('phone') && (fk === 'chest' || fk === 'face' || fk === 'raise')) {
      g.put(hx - d, hy2 - 1, 'P');
      g.put(hx - d, hy2, 'p');
      if (fk === 'chest') g.put(hx - d, hy2 - 1, 'V');
    }
    if (has('cup') && (fk === 'chest' || fk === 'face' || fk === 'raise' || fk === 'hold')) {
      g.put(hx, hy2 - 1, 'W');
      g.put(hx - d, hy2 - 1, 'w');
      g.put(hx - d, hy2, 'P');
    }
    if (has('clipboard') && (fk === 'chest' || fk === 'hold' || fk === 'raise')) {
      for (let y = -2; y <= 0; y++)
        for (let k = 1; k <= 2; k++) g.put(hx - d * k, hy2 + y, y === -2 ? 'D' : k === 1 ? 'W' : 'w');
    }
    if (has('camera') && fk === 'face') {
      g.put(hx - d, hy2, 'G');
      g.put(hx - d * 2, hy2, 'V');
      g.put(hx - d, hy2 + 1, 'g');
    }
    if (has('pliers')) {
      // 穿线钳：垂在手下面，两片钳嘴张开
      g.put(hx, hy2 + 1, 'G');
      g.put(hx - d, hy2 + 2, 'g');
      g.put(hx + d, hy2 + 2, 'G');
    }
    if (has('rake') && (fk === 'hold' || fk === 'down' || fk === 'fwd' || fk === 'back')) {
      for (let y = -4; y <= 6; y++) g.put(hx + d, hy2 + y, y === 6 ? 'G' : 'D');
      g.put(hx + 2 * d, hy2 + 6, 'G');
      g.put(hx, hy2 + 6, 'G');
    }
    if (s.id === 'mom' && fk === 'chest') {
      g.put(hx - d, hy2 - 1, 'P');
      g.put(hx - d, hy2, 'p');
    }
    if (has('tote') === false && s.id === 'retiree' && fk === 'raise') {
      // 扇子
      g.put(hx - d, hy2 - 1, 'A');
      g.put(hx - 2 * d, hy2 - 2, 'A');
      g.put(hx, hy2 - 2, 'a');
    }
  }
  // 拐杖：Ray 的另一只手，一直点到地上
  if (has('cane')) {
    const side: 'A' | 'B' = rkSide === 'A' ? 'B' : 'A';
    const h = hands[side];
    if (h) {
      const d = side === 'A' ? -1 : 1;
      const cx = h[0] + d * (1 + (p.caneDx ?? 0));
      g.put(h[0] + d, h[1] - 1, 'D');
      for (let y = h[1]; y <= Y(L.foot - 1) + hop; y++) g.put(cx, y, 'D');
      g.put(cx, Y(L.foot - 1) + hop, 'd');
    }
  }

  /* 球拍（描边之后也不压身体：只画在空格上） */
  const rs = hands[rkSide];
  if ((s.racket || p.forceRacket) && p.racket && rs) {
    const st = RACKET[p.racket];
    const flip = rkSide === 'B';
    const w = st.rows[0].length;
    const hx = flip ? w - 1 - st.hx : st.hx;
    for (let j = 0; j < st.rows.length; j++)
      for (let i = 0; i < w; i++) {
        const ch = st.rows[j][flip ? w - 1 - i : i];
        if (ch === '.' || ch === 'x') continue;
        const gx = rs[0] - hx + i;
        const gy = rs[1] - st.hy + j;
        // 击球、随挥时拍子在身体前面：可以压身体
        if (g.get(gx, gy) === '.' || p.racket === 'across') g.put(gx, gy, ch);
      }
  }
  // 抛起来的球
  if (p.ball != null) {
    const h = hands[rkSide === 'A' ? 'B' : 'A'];
    if (h) g.put(h[0], h[1] - 1 - p.ball, 'I');
  }

  const pts: Record<string, readonly [number, number]> = {
    head_top: [X(0 + hdx), Y(hy) - 1],
  };
  if (hands.A) pts.hand_a = hands.A;
  if (hands.B) pts.hand_b = hands.B;
  return finish(g, X(0), Y(L.foot), pal, pts);
}

/* ---------------- 脸 ---------------- */

/** 脸：x0, y0 是头的左上角（6×6）。眼睛在第 1、4 列，第 3 行。 */
function drawFace(g: Grid, s: Spec, e: Expr, x0: number, y0: number): void {
  const f = s.face;
  const P = (c: number, r: number, ch: string) => g.put(x0 + c, y0 + r, ch);
  const old = !!f.wrinkles;
  // 眉毛
  const browRow = 2;
  const brow = (c: number, r: number) => P(c, r, 'Z');
  const angry = e === 'angry';
  const sad = e === 'sigh' || e === 'wince';
  const up = e === 'happy' || e === 'oh';
  if (angry) {
    brow(1, browRow - 1);
    brow(2, browRow);
    brow(3, browRow);
    brow(4, browRow - 1);
    if (f.brows === 'thick' || f.brows === 'bushy') {
      brow(0, browRow - 1);
      brow(5, browRow - 1);
    }
  } else if (sad) {
    brow(0, browRow);
    brow(1, browRow - 1);
    brow(4, browRow - 1);
    brow(5, browRow);
  } else {
    const r = up ? browRow - 1 : browRow;
    switch (f.brows) {
      case 'thin':
        brow(1, r);
        brow(4, r);
        break;
      case 'thick':
        brow(0, r);
        brow(1, r);
        brow(4, r);
        brow(5, r);
        break;
      case 'bushy':
        brow(0, r);
        brow(1, r);
        brow(2, r);
        brow(3, r);
        brow(4, r);
        brow(5, r);
        break;
      case 'arched':
        brow(0, r);
        brow(1, r - 1);
        brow(4, r - 1);
        brow(5, r);
        break;
      case 'skeptic':
        brow(0, r);
        brow(1, r);
        brow(4, r - 1);
        brow(5, r - 1);
        break;
    }
  }
  // 眼睛
  const er = 3;
  const closed = e === 'blink' || e === 'sigh' || e === 'down';
  if (e === 'happy' || e === 'smile') {
    // 笑弯的眼：一条往上拱的线
    P(1, er, 'Z');
    P(4, er, 'Z');
    if (e === 'happy') {
      P(0, er + 1, 's');
      P(5, er + 1, 's');
    }
  } else if (closed) {
    P(1, er, 'Z');
    P(4, er, 'Z');
    if (e === 'down') {
      P(0, er, 'Z');
      P(5, er, 'Z');
    }
  } else if (e === 'wince') {
    P(1, er, 'Z');
    P(4, er, 'E');
  } else if (e === 'squint' || f.eyes === 'narrow') {
    P(1, er, 'E');
    P(4, er, 'E');
    P(1, er - 1, f.brows === 'bushy' ? 'Z' : 's');
    P(4, er - 1, f.brows === 'bushy' ? 'Z' : 's');
  } else {
    P(1, er, 'E');
    P(4, er, 'E');
    if (f.eyes === 'wide' || e === 'oh') {
      P(0, er, 'W');
      P(5, er, 'W');
    }
    if (f.eyes === 'tired') {
      P(1, er - 1, 's');
      P(4, er - 1, 's');
    }
  }
  // 眼袋、皱纹
  if (f.bags || old) {
    P(1, er + 1, 's');
    P(4, er + 1, 's');
  }
  if (old) {
    P(0, er, 's');
    P(5, er, 's');
  }
  // 鼻子：亮面在左，鼻子投影在右
  if (f.nose === 'big') {
    P(2, 4, 's');
    P(3, 4, 's');
  } else if (f.nose === 'button') P(2, 4, 'R');
  else P(3, 4, 's');
  // 雀斑、腮红
  if (f.freckles) {
    P(0, 4, 'R');
    P(5, 4, 'R');
    P(1, 4, 'R');
  }
  if (f.blush || e === 'happy') {
    P(0, 4, 'R');
    P(5, 4, 'R');
  }
  // 嘴
  const mr = 5;
  if (e === 'happy') {
    P(1, mr, 'M');
    P(2, mr, 'm');
    P(3, mr, 'm');
    P(4, mr, 'M');
  } else if (e === 'oh' || e === 'sigh') {
    P(2, mr, 'm');
  } else if (angry) {
    P(1, mr, 'Z');
    P(2, mr, 'Z');
    P(3, mr, 'Z');
    P(4, mr, 'Z');
  } else if (e === 'wince') {
    P(1, mr, 'm');
    P(2, mr, 'M');
    P(3, mr, 'm');
  } else {
    switch (f.mouth) {
      case 'smile':
        P(1, mr - 1 >= 4 ? mr : mr, 'm');
        P(2, mr, 'M');
        P(3, mr, 'M');
        P(4, mr, 'm');
        break;
      case 'grin':
        P(1, mr, 'M');
        P(2, mr, 'W');
        P(3, mr, 'W');
        P(4, mr, 'M');
        break;
      case 'lips':
        P(2, mr, 'M');
        P(3, mr, 'M');
        break;
      case 'stern':
        P(1, mr, 'm');
        P(2, mr, 'm');
        P(3, mr, 'm');
        P(4, mr, 'm');
        break;
      default:
        P(2, mr, 'm');
        P(3, mr, 'm');
    }
  }
  // 胡子
  if (f.beard === 'full') {
    P(0, 4, 'Y');
    P(5, 4, 'y');
    P(0, mr, 'Y');
    P(5, mr, 'y');
    P(1, mr, 'Y');
    P(4, mr, 'Y');
    if (e !== 'happy' && e !== 'oh') {
      P(2, mr, 'm');
      P(3, mr, 'm');
    }
    // 下巴以下再长一行
    for (let c = 1; c < 5; c++) P(c, 6, c === 4 ? 'y' : 'Y');
    P(1, 4, 'Y');
    P(4, 4, 'Y');
  } else if (f.beard === 'mustache') {
    P(1, 4, 'Y');
    P(2, 4, 'Y');
    P(3, 4, 'Y');
    P(4, 4, 'y');
  } else if (f.beard === 'stubble') {
    P(0, mr, 'Y');
    P(5, mr, 'y');
    if (f.mouth !== 'smile') {
      P(1, mr, 'Y');
      P(4, mr, 'y');
    }
  }
  // 眼镜
  if (f.glasses === 'reading') {
    // 细金属框的老花镜：镜框夹着眼睛，镜片下沿压在鼻梁上
    P(0, er, 'X');
    P(2, er, 'X');
    P(3, er, 'X');
    P(5, er, 'X');
    P(1, er + 1, 'V');
    P(4, er + 1, 'V');
  } else if (f.glasses === 'round') {
    P(0, er, 'X');
    P(2, er, 'X');
    P(3, er, 'X');
    P(5, er, 'X');
  } else if (f.glasses === 'sun') {
    for (let c = 0; c < 6; c++) P(c, er, c === 2 || c === 3 ? 'x' : 'X');
    P(1, er, 'V');
  }
}
