import { Grid } from './pix';

/**
 * 场景小人（方向 C 的下层）：约 10×18 含描边，比现在的 8×14 高 4 行、宽 2 列。
 * 不追求五官，只追求三件事在游戏缩放下看得出：轮廓（体型、头发/帽子的外形）、一块招牌色、一件随身道具。
 *
 * 一帧 = 一个"姿势"（身体上下、头的偏移、两只手的形状、两条腿的形状、手里的东西、眼睛）按固定顺序拼出来，
 * 拼完自动描一圈 1 像素的描边（和游戏的 `#2a2238` 一样）。部件全是字符画（见本文件的 HAIR、FACE），
 * 字母表见 pix.ts。帧尺寸固定 18×23，锚点 (9, 22)：两脚中间、鞋底下面那一行；身体左右对称于第 8、9 列之间。
 *
 * 朝向：front 脸朝镜头，角色的右手在画面左边；back 背朝镜头，右手在画面右边。朝左由运行时水平翻转。
 */

export const FW = 18;
export const FH = 23;
export const OX = 9;
export const OY = 22;
const SHOE_Y = 21;

export type Build = 'normal' | 'wide' | 'tall' | 'teen' | 'kid';
const BUILDS: Record<Build, { tw: number; th: number; bh: number; lh: number }> = {
  normal: { tw: 6, th: 4, bh: 2, lh: 3 },
  wide: { tw: 8, th: 4, bh: 2, lh: 3 },
  tall: { tw: 6, th: 4, bh: 2, lh: 4 },
  teen: { tw: 6, th: 3, bh: 2, lh: 3 },
  kid: { tw: 4, th: 3, bh: 1, lh: 2 },
};

export type HairId =
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
export type FaceId = 'beard' | 'stache' | 'glasses' | 'shades' | 'blush';
export type ExtraId =
  | 'collar'
  | 'belt'
  | 'bandana'
  | 'hood'
  | 'apron'
  | 'tank'
  | 'kneebrace'
  | 'lanyard'
  | 'camera'
  | 'skirt'
  | 'socks'
  | 'hawaii'
  | 'stripe'
  | 'wristband';
export type HeldId = 'racket' | 'phone' | 'cup' | 'clip' | 'ball' | 'cane' | 'brush' | 'pliers' | 'tote';

export interface SpriteSpec {
  build: Build;
  hair: HairId;
  face?: readonly FaceId[];
  extra?: readonly ExtraId[];
  /** 平时手里拿着的东西（idle、走路） */
  carry?: HeldId;
  idle: IdleId;
  walk?: 'normal' | 'limp' | 'bouncy' | 'slouch';
}

/* ---------------- 姿势 ---------------- */

/** 手的形状（以肩为原点，画面左边那只手的写法；右边那只自动镜像） */
export type Arm =
  | 'down'
  | 'fwd'
  | 'bk'
  | 'up'
  | 'out'
  | 'outLow'
  | 'chest'
  | 'across'
  | 'over'
  | 'face'
  | 'brow'
  | 'hip'
  | 'back'
  | 'knee'
  | 'hidden';
export type Legs = 'stand' | 'stepL' | 'stepR' | 'wide' | 'tuck' | 'stomp';
export type Eyes = 'open' | 'closed' | 'down' | 'happy' | 'angry' | 'side';
export interface Held {
  id: HeldId | 'racketUp' | 'racketBack' | 'racketFront' | 'racketOver' | 'racketFace' | 'ballHi' | 'ballMid';
  /** 拿在哪只手：r 角色右手（拍子手），l 左手 */
  hand: 'r' | 'l';
}
export interface Pose {
  /** 上半身往下沉（蹲、呼吸） */
  by?: number;
  /** 整个人离地 */
  lift?: number;
  hx?: number;
  hy?: number;
  r: Arm;
  l: Arm;
  legs?: Legs;
  eyes?: Eyes;
  held?: readonly Held[];
  /** 马尾、辫子甩动 */
  sway?: number;
}

export type Facing = 'front' | 'back';

type Px = readonly [number, number, string];
/** 手臂：相对肩膀的 (dx, dy, 字母)；th 是躯干高度，最后一格是手 */
function armPx(a: Arm, th: number): { px: Px[]; hand: [number, number] } {
  const fore = th - 2; // 小臂格数
  const px: Px[] = [];
  let hand: [number, number];
  const col = (n: number, x = 0) => {
    for (let i = 0; i < n; i++) px.push([x, 1 + i, 'X']);
  };
  switch (a) {
    case 'down':
      px.push([0, 0, 'T']);
      col(fore);
      hand = [0, th - 1];
      break;
    case 'fwd':
      px.push([0, 0, 'T']);
      col(fore + 1);
      hand = [0, th];
      break;
    case 'bk':
      px.push([0, 0, 'T']);
      col(Math.max(0, fore - 1));
      hand = [0, th - 2];
      break;
    case 'up':
      px.push([0, 0, 'T'], [0, -1, 'X'], [0, -2, 'X']);
      hand = [0, -3];
      break;
    case 'out':
      px.push([0, 0, 'T'], [-1, 0, 'X']);
      hand = [-2, 0];
      break;
    case 'outLow':
      px.push([0, 0, 'T'], [0, 1, 'X'], [-1, 2, 'X']);
      hand = [-2, 2];
      break;
    case 'chest':
      px.push([0, 0, 'T'], [0, 1, 'X']);
      hand = [1, 2];
      break;
    case 'across':
      px.push([0, 0, 'T'], [0, 1, 'X'], [1, 2, 'X'], [2, 2, 'X']);
      hand = [3, 2];
      break;
    case 'over':
      px.push([0, 0, 'T'], [1, -1, 'X'], [2, -2, 'X']);
      hand = [3, -3];
      break;
    case 'face':
      px.push([0, 0, 'T'], [0, 1, 'X'], [1, 0, 'X']);
      hand = [2, -1];
      break;
    case 'brow':
      px.push([0, 0, 'T'], [0, -1, 'X'], [0, -2, 'X'], [0, -3, 'X'], [1, -4, 'X']);
      hand = [2, -4];
      break;
    case 'hip':
      px.push([0, 0, 'T'], [-1, 1, 'X']);
      hand = [0, 2];
      break;
    case 'back':
      px.push([0, 0, 'T'], [-1, 1, 'X'], [-1, 2, 'X']);
      hand = [0, 3];
      px.push([0, 3, 's']);
      break;
    case 'knee':
      px.push([0, 0, 'T']);
      col(fore + 2);
      hand = [1, th + 1];
      break;
    default:
      px.push([0, 0, 'T']);
      hand = [0, 1];
      break;
  }
  if (a !== 'back' && a !== 'hidden') px.push([hand[0], hand[1], 'S']);
  return { px, hand };
}

/* ---------------- 头发（盒子 10 宽，原点 = 头左上角往左 2、往上 2；第 2..7 列是脸，眼睛在 (3,5) 和 (6,5)） ---------------- */

interface HairArt {
  front: readonly string[];
  back: readonly string[];
  /** 从第几行起随 sway 甩 */
  tail?: number;
}

const HAIR: Record<HairId, HairArt> = {
  // Dale：深蓝棒球帽，帽檐压到眉毛，两鬓白发
  cap: {
    front: ['..........', '...CCCC...', '..CCCCCCc.', '..CDCCCCc.', '.cccccccd.', '..H....H..', '..H....H..'],
    back: ['..........', '...CCCC...', '..CCCCCCc.', '..CCCCCCc.', '..cCCCCcc.', '..HHHHHHh.', '...hHHh...'],
  },
  // Rosa：宽檐草帽 + 背后一根黑辫子
  sunhat: {
    front: ['....CC....', '...CC9Cc..', '..C9CCC9c.', 'CCCCCCCCcd', '..HH..HH..', '..H....H..', '..H....H..'],
    back: [
      '....CC....',
      '...CC9Cc..',
      '..C9CCC9c.',
      'CCCCCCCCcd',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '....Hh....',
      '....Hh....',
      '....hH....',
      '....Aa....',
    ],
    tail: 8,
  },
  // Ben：竖起来的短发，刘海参差
  spiky: {
    front: ['..........', '..H.HH.H..', '..HHHHHHh.', '..HH^HHHh.', '..H.H..h..'],
    back: ['..........', '..H.HH.H..', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHhh.', '...hHHh...'],
  },
  // Jess：高马尾，珊瑚色头带
  pony: {
    front: ['.......HH.', '...HHHHHhH', '..HHHHHHhh', '..AA@AAAa.', '..H....h..'],
    back: [
      '....HH....',
      '...HHHHh..',
      '..HHHHHHh.',
      '..AAAAAAa.',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '...HHHHh..',
      '....HH....',
      '....Hh....',
      '.....h....',
    ],
    tail: 7,
  },
  // Gus：秃顶发亮，两边一撮灰发翘出来
  bald: {
    front: ['..........', '..........', '...+SSS...', '..S+SSSs..', '..H....H..', '.HH....HH.', '..H....H..'],
    back: ['..........', '..........', '...SSSS...', '..S+SSSs..', '..HHHHHh..', '.HHHHHHhh.', '..HHHHHh..'],
  },
  // Lily：齐刘海，黑长直披到肩上
  long: {
    front: [
      '..........',
      '...HHHH...',
      '..HHHHHHh.',
      '.HHHHHHHHh',
      '.HHHHH^HHh',
      '.H......Hh',
      '.H......Hh',
      '.Hh....hHh',
      '.Hh....hH.',
      '.h......h.',
    ],
    back: [
      '..........',
      '...HHHH...',
      '..HHHHHHh.',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.HHHHHHHhh',
      '.HHHHHHHh.',
      '..hHHHHh..',
    ],
  },
  // Teodora：深红棕齐下巴的波波头，侧分
  bob: {
    front: [
      '..........',
      '...HHHH...',
      '..HHH^HHh.',
      '.HHH^HHHHh',
      '.HH...HHHh',
      '.H......Hh',
      '.H......Hh',
      '.hh....hh.',
    ],
    back: [
      '..........',
      '...HHHH...',
      '..HHHHHHh.',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.HHHHHHHHh',
      '.hhhhhhhh.',
    ],
  },
  // Nadia：铂金色往后梳的低发髻，墨镜推在头顶
  bun: {
    front: ['..........', '...H^HH...', '..H^HHHHh.', '..HVVGVVh.', '..H....h..'],
    back: [
      '..........',
      '...HHHH...',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '...HHHHh..',
      '...HhHHh..',
      '....hh....',
    ],
  },
  // Ray：灰白头发往一边梳得整整齐齐
  neat: {
    front: ['..........', '...HHHH...', '..HHHHH^h.', '..HH^HHHh.', '..H...Hh..'],
    back: ['..........', '...HHHH...', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHhh.', '...hhhh...'],
  },
  // Mateo：蓬松的黑卷发，头显得大
  curly: {
    front: ['...H..H...', '..HHHHHHH.', '.HH^HH^HHh', '.HHHHHHHHh', '..HhH.HhH.', '..H....H..'],
    back: ['...H..H...', '..HHHHHHH.', '.HH^HH^HHh', '.HHHHHHHHh', '.HHHHHHHHh', '..HHHHHHh.', '...HhHh...'],
  },
  // 总监：棕色短发，右边一绺刘海
  side: {
    front: ['..........', '...HHHH...', '..HHHHHHh.', '..H^HHHHh.', '..HHH...h.'],
    back: ['..........', '...HHHH...', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHHh.', '..HHHHHhh.', '...hhhh...'],
  },
  // 小女孩：两根羊角辫
  pigtails: {
    front: ['..........', '...HHHH...', '..HHHHHHh.', '..HHH^HHh.', '.AH....hA.', 'HH......hh', 'H........h'],
    back: ['..........', '...HHHH...', '..HHHHHHh.', '..HHHHHHh.', '.AHHHHHHhA', 'HHHHHHHHhh', 'H.HHHHHh.h'],
  },
  // 小男孩：反戴的红帽子
  backcap: {
    front: ['..........', '...CCCC...', '..CCCCCCc.', '..CCDCCCc.', '..ccc_cc..', '..H....h..'],
    back: ['..........', '...CCCC...', '..CCCCCCc.', '..CCCCCCc.', '.cccccccd.', '..HHHHHHh.', '...HHHh...'],
  },
  // 退休老人：白色遮阳帽檐，银白短发从上面露出来
  visor: {
    front: ['..........', '...HHHH...', '..HHHHHHh.', '..CCCCCCc.', '.cccccccc.', '..H....h..'],
    back: ['..........', '...HHHH...', '..HHHHHHh.', '..CCCCCCc.', '..HHHHHHh.', '..HHHHHHh.', '...hhhh...'],
  },
  // 网球妈妈：粉色遮阳帽檐 + 金色高马尾
  momPony: {
    front: ['......HH..', '...HHHHHH.', '..HHHHHHhh', '..CCCCCCc.', '.ccccccccH', '..H....hH.'],
    back: [
      '....HH....',
      '...HHHHh..',
      '..HHHHHHh.',
      '..CCCCCCc.',
      '..HHHHHHh.',
      '..HHHHHHh.',
      '...HHHHh..',
      '....HH....',
      '....hH....',
      '....h.....',
    ],
    tail: 7,
  },
  // 游客：卡其色渔夫帽，帽檐往下塌
  bucket: {
    front: ['..........', '...CCCC...', '..CCCDCCc.', '..CCCCCCc.', '.cCCCCCCcd', '.c......c.'],
    back: ['..........', '...CCCC...', '..CCCCCCc.', '..CCCCCCc.', '.cCCCCCCcd', '.cHHHHHHc.', '...HHHh...'],
  },
};

/** 头（6×6，眼睛在第 3 行第 1、4 列） */
const HEAD_FRONT = ['.SSSS.', 'SSSSSS', 'SSSSSs', 'SESSEs', 'SSSSSs', '.SSSs.'];
const HEAD_BACK = ['.SSSS.', 'SSSSSS', 'SSSSSs', 'SSSSSs', 'SSSSSs', '.SsSs.'];

/** 脸上的东西（盒子同头发） */
const FACE: Record<FaceId, readonly string[]> = {
  beard: ['', '', '', '', '', '', '..K.KK.K..', '..KKKKKK..', '...KKKK...', '....kk....'],
  stache: ['', '', '', '', '', '', '...KKKK...', '...k..k...'],
  glasses: ['', '', '', '', '', '..G.GG.G..'],
  shades: ['', '', '', '', '', '..V%VV%V..'],
  blush: ['', '', '', '', '', '', '..L....L..'],
};

/* ---------------- 手里的东西（相对手的格子；画面左手的写法，右手镜像） ---------------- */

const RING = ['.QQ.', 'Q..Q', 'Q..Q', '.QQ.'];
function heldArt(id: Held['id'], handRow: number, shoeRow: number): { rows: string[]; dx: number; dy: number } | null {
  switch (id) {
    case 'racket':
      return { rows: ['...Q', ...RING], dx: -3, dy: 1 };
    case 'racketUp':
      return { rows: [...RING, '...Q'], dx: -3, dy: -5 };
    case 'racketBack':
      return { rows: [...RING, '....Q'], dx: -4, dy: -5 };
    case 'racketFront':
      return { rows: ['Q...', ...RING].map((r) => r), dx: 0, dy: -5 };
    case 'racketOver':
      return { rows: [...RING, 'Q...'], dx: 0, dy: -5 };
    case 'racketFace':
      return { rows: [...RING, '.Q..', '.Q..'], dx: -1, dy: -6 };
    case 'phone':
      return { rows: ['2', '1'], dx: 0, dy: -1 };
    case 'cup':
      return { rows: ['WW', '88'], dx: 0, dy: -2 };
    case 'clip':
      return { rows: ['44', '44', '33'], dx: 0, dy: -2 };
    case 'ball':
      return { rows: ['5'], dx: 0, dy: -1 };
    case 'ballMid':
      return { rows: ['5'], dx: 0, dy: -4 };
    case 'ballHi':
      return { rows: ['5'], dx: 0, dy: -7 };
    case 'pliers':
      return { rows: ['7', '7'], dx: -1, dy: 0 };
    case 'tote':
      return { rows: ['.N.', 'N.N', 'NNN', 'NnN'], dx: -1, dy: 0 };
    case 'cane': {
      const n = Math.max(1, shoeRow - handRow);
      return { rows: Array.from({ length: n }, () => '3'), dx: -1, dy: 1 };
    }
    case 'brush': {
      const n = Math.max(1, shoeRow - handRow);
      const rows = ['..3..', '..3..', '..3..'];
      for (let i = 0; i < n - 1; i++) rows.push('..3..');
      rows.push('nnnnn');
      return { rows, dx: -4, dy: -3 };
    }
    default:
      return null;
  }
}

function mirrorRows(rows: readonly string[]): string[] {
  return rows.map((r) => [...r].reverse().join(''));
}

/* ---------------- 拼一帧 ---------------- */

export function compose(spec: SpriteSpec, pose: Pose, facing: Facing): Grid {
  const g = new Grid(FW, FH);
  const b = BUILDS[spec.build];
  const ex = new Set(spec.extra ?? []);
  const lift = pose.lift ?? 0;
  const by = pose.by ?? 0;
  const U = by - lift;
  const tx0 = OX - b.tw / 2;
  const tx1 = tx0 + b.tw - 1;
  const legY0 = SHOE_Y - b.lh;
  const botY = legY0 - b.bh + U;
  const torY = legY0 - b.bh - b.th + U;
  const headY = torY - 6 + (pose.hy ?? 0);
  const headX = OX - 3 + (pose.hx ?? 0);
  const shoeRow = SHOE_Y - lift;
  const back = facing === 'back';

  // 腿和鞋
  const legsShape = pose.legs ?? 'stand';
  const lw = spec.build === 'wide' ? 3 : spec.build === 'kid' ? 1 : 2;
  const legX = [tx0 + (spec.build === 'wide' ? 0 : spec.build === 'kid' ? 0 : 0), tx1 - lw + 1];
  for (let side = 0; side < 2; side++) {
    let raise = 0;
    let dx = 0;
    if (legsShape === 'stepL' && side === 0) raise = 1;
    if (legsShape === 'stepR' && side === 1) raise = 1;
    if (legsShape === 'tuck') raise = 1;
    if (legsShape === 'wide') dx = side === 0 ? -1 : 1;
    if (legsShape === 'stomp' && side === 1) raise = 2;
    const top = botY + b.bh;
    const sRow = shoeRow - raise;
    const x0 = legX[side] as number;
    for (let y = top; y < sRow; y++) {
      const lower = y >= top + Math.floor((sRow - top) / 2);
      for (let i = 0; i < lw; i++) {
        const x = x0 + i + (lower ? dx : 0);
        const last = y === sRow - 1;
        g.set(x, y, ex.has('socks') && last ? '6' : 'J');
      }
    }
    // 护膝（Ray 的左膝；正面在画面右边，背面在画面左边）
    if (ex.has('kneebrace') && side === (back ? 0 : 1)) {
      const ky = top + Math.floor((sRow - top) / 2);
      for (let i = 0; i < lw; i++) g.set(x0 + i, ky, 'A');
    }
    for (let i = 0; i < lw + (spec.build === 'kid' ? 1 : 0); i++) {
      const x = x0 + i + dx + (spec.build === 'kid' && side === 0 ? -1 : 0);
      g.set(x, sRow, i === lw - 1 + (spec.build === 'kid' ? 1 : 0) ? 'f' : 'F');
    }
  }

  // 下装
  for (let j = 0; j < b.bh; j++) for (let x = tx0; x <= tx1; x++) g.set(x, botY + j, x === tx1 ? 'b' : 'B');
  if (b.bh >= 2 && !ex.has('skirt')) {
    // 两条裤腿中间的缝
    g.set(OX - 1, botY + b.bh - 1, 'v');
    g.set(OX, botY + b.bh - 1, 'v');
  }
  if (ex.has('skirt')) {
    const y = botY + b.bh - 1;
    for (let x = tx0 - 1; x <= tx1 + 1; x++) g.set(x, y, x >= tx1 ? 'b' : 'B');
  }

  // 躯干
  for (let j = 0; j < b.th; j++)
    for (let x = tx0; x <= tx1; x++) g.set(x, torY + j, x === tx1 ? 't' : x === tx0 && j > 0 ? 'U' : 'T');
  if (ex.has('belt')) for (let x = tx0; x <= tx1; x++) g.set(x, torY + b.th - 1, x === tx1 ? 'r' : 'R');
  if (ex.has('collar') && !back) {
    g.set(OX - 1, torY, 'R');
    g.set(OX, torY, 'R');
  }
  if (ex.has('collar') && back) for (let x = OX - 2; x <= OX + 1; x++) g.set(x, torY, 'R');
  if (ex.has('stripe')) for (let j = 0; j < b.th; j++) g.set(back ? tx1 - 1 : tx0 + 1, torY + j, 'R');
  if (ex.has('tank')) {
    g.set(tx0, torY, 'S');
    g.set(tx1, torY, 's');
  }
  if (ex.has('hawaii'))
    for (const [x, y, c] of [
      [tx0 + 1, 0, 'A'],
      [tx0 + 4, 1, 'N'],
      [tx0 + 2, 2, 'N'],
      [tx0 + 5, 3, 'A'],
      [tx0, 3, 'A'],
      [tx0 + 3, 0, 'N'],
    ] as const)
      if (y < b.th) g.set(x, torY + y, c);
  if (ex.has('hood')) {
    if (back) {
      for (let x = OX - 2; x <= OX + 1; x++) g.set(x, torY, 't');
      g.set(OX - 1, torY + 1, 't');
      g.set(OX, torY + 1, 't');
    } else {
      g.set(OX - 2, torY + 1, 'W');
      g.set(OX + 1, torY + 1, 'W');
      g.set(OX - 2, torY + 2, 'W');
    }
  }
  if (ex.has('apron')) {
    if (back) {
      g.set(OX - 1, torY + b.th - 1, 'N');
      g.set(OX, torY + b.th - 1, 'n');
    } else {
      g.set(tx0 + 1, torY, 'N');
      g.set(tx1 - 1, torY, 'N');
      for (let y = torY + 1; y < botY + b.bh; y++)
        for (let x = tx0 + 1; x <= tx1 - 1; x++) g.set(x, y, x === tx1 - 1 ? 'n' : 'N');
      g.set(OX - 1, torY + 2, '7');
    }
  }
  if (ex.has('lanyard') && !back) {
    g.set(tx0 + 1, torY, 'A');
    g.set(tx1 - 1, torY, 'A');
    g.set(tx0 + 2, torY + 1, 'A');
    g.set(tx1 - 2, torY + 1, 'A');
    g.set(OX - 1, torY + 2, 'W');
    g.set(OX, torY + 2, 'w');
  }
  if (ex.has('camera') && !back) {
    g.set(tx0 + 1, torY, 'O');
    g.set(tx1 - 1, torY, 'O');
    g.set(OX - 1, torY + 2, '1');
    g.set(OX, torY + 2, '7');
    g.set(OX - 1, torY + 1, '1');
    g.set(OX, torY + 1, '1');
  }
  if (ex.has('bandana')) {
    for (let x = tx0 + 1; x <= tx1 - 1; x++) g.set(x, torY, 'A');
    if (!back) {
      g.set(OX - 1, torY + 1, 'A');
      g.set(OX, torY + 1, 'a');
    }
  }

  // 头和头发
  g.stamp(back ? HEAD_BACK : HEAD_FRONT, headX, headY);
  const hair = HAIR[spec.hair];
  const hrows = back ? hair.back : hair.front;
  const sway = pose.sway ?? 0;
  hrows.forEach((r, j) => {
    const dx = hair.tail != null && j >= hair.tail ? sway : 0;
    g.stamp([r], headX - 2 + dx, headY - 2 + j);
  });
  if (!back) {
    for (const f of spec.face ?? [])
      FACE[f].forEach((r, j) => {
        if (r) g.stamp([r], headX - 2, headY - 2 + j);
      });
    // 眼睛
    const e = pose.eyes ?? 'open';
    const ey = headY + 3;
    const exs = [headX + 1, headX + 4];
    const glass = (spec.face ?? []).includes('shades');
    if (!glass) {
      if (e === 'closed' || e === 'happy') for (const x of exs) g.set(x, ey, 'z');
      if (e === 'down')
        for (const x of exs) {
          g.set(x, ey, 's');
          g.set(x, ey + 1, 'E');
        }
      if (e === 'side')
        for (const x of exs) {
          g.set(x, ey, 'S');
          g.set(x - 1, ey, 'E');
        }
      if (e === 'angry') for (const x of exs) g.set(x + (x === exs[0] ? 1 : -1), ey - 1, 'z');
    }
    const beard = (spec.face ?? []).includes('beard') || (spec.face ?? []).includes('stache');
    if (e === 'happy' && !beard) {
      g.set(headX + 2, headY + 4, 'm');
      g.set(headX + 3, headY + 4, 'm');
    }
    if (e === 'angry' && !beard) {
      g.set(headX + 2, headY + 4, 'z');
      g.set(headX + 3, headY + 4, 'z');
    }
  }

  // 手（正面：角色右手在画面左边）
  const handPos: Record<'r' | 'l', [number, number]> = { r: [0, 0], l: [0, 0] };
  for (const who of ['r', 'l'] as const) {
    const screenLeft = (who === 'r') !== back;
    const arm = armPx(pose[who], b.th);
    const sx = screenLeft ? tx0 - 1 : tx1 + 1;
    const m = screenLeft ? 1 : -1;
    for (const [dx, dy, c] of arm.px) {
      let ch = c;
      if (ch === 'T' && ex.has('tank')) ch = 'S';
      if (ex.has('wristband') && dy === arm.hand[1] - 1 && dx === arm.hand[0] && who === 'r') ch = 'A';
      g.set(sx + dx * m, torY + dy, ch);
    }
    // Nadia 右肩的肌效贴
    if (ex.has('tank') && who === 'r') {
      g.set(sx, torY, 'A');
      g.set(sx, torY + 1, 'A');
    }
    handPos[who] = [sx + arm.hand[0] * m, torY + arm.hand[1]];
  }

  // 手里的东西
  for (const h of pose.held ?? []) {
    const [hx, hy] = handPos[h.hand];
    const screenLeft = (h.hand === 'r') !== back;
    const art = heldArt(h.id, hy, shoeRow);
    if (!art) continue;
    const w = Math.max(...art.rows.map((r) => r.length));
    if (screenLeft) g.stamp(art.rows, hx + art.dx, hy + art.dy);
    else g.stamp(mirrorRows(art.rows.map((r) => r.padEnd(w, '.'))), hx - art.dx - w + 1, hy + art.dy);
  }
  return g.outline();
}

/* ---------------- 动画 ---------------- */

export type IdleId =
  | 'rubBack'
  | 'sigh'
  | 'phone'
  | 'toss'
  | 'bounce'
  | 'sip'
  | 'squint'
  | 'inspect'
  | 'shoulder'
  | 'knee'
  | 'clip'
  | 'kidSwing'
  | 'kidSpin'
  | 'wipe'
  | 'clap'
  | 'photo';
export type AnimId = 'idle' | 'walk' | 'swing' | 'happy' | 'angry';
export type EmoteId = 'sweat' | 'puff' | 'heart' | 'anger' | 'note' | 'excl' | 'zzz' | 'wind' | 'steam' | 'flash';
export interface Anim {
  dt: number;
  poses: readonly Pose[];
  /** 每帧可以带一个头顶表情 */
  emote?: readonly (EmoteId | null)[];
}

const C = (h: Held['id'], hand: 'r' | 'l' = 'r'): Held => ({ id: h, hand });
function carried(spec: SpriteSpec): Held[] {
  if (!spec.carry) return [];
  const hand = spec.carry === 'racket' || spec.carry === 'cane' || spec.carry === 'brush' ? 'r' : 'l';
  return [C(spec.carry, hand)];
}

const IDLES: Record<IdleId, (s: SpriteSpec) => Anim> = {
  // Dale 揉腰：一手叉到背后，闭眼，冒一滴汗
  rubBack: (s) => ({
    dt: 0.5,
    poses: [
      { r: 'down', l: 'down', held: carried(s) },
      { r: 'down', l: 'down', by: 1, held: carried(s) },
      { r: 'down', l: 'back', hx: -1, eyes: 'closed', held: carried(s) },
      { r: 'down', l: 'back', hx: -1, by: 1, eyes: 'closed', held: carried(s) },
    ],
    emote: [null, null, 'sweat', 'sweat'],
  }),
  // Gus 叹气：耸肩吸气，然后整个人塌下去，吐一口气
  sigh: (s) => ({
    dt: 0.55,
    poses: [
      { r: 'down', l: 'down', hy: 1, held: carried(s) },
      { r: 'bk', l: 'bk', lift: 0, by: -1, held: carried(s) },
      { r: 'down', l: 'down', by: 1, hy: 1, eyes: 'closed', held: carried(s) },
      { r: 'down', l: 'down', by: 1, hy: 1, eyes: 'closed', held: carried(s) },
    ],
    emote: [null, null, 'puff', 'puff'],
  }),
  // Lily 低头看手机，屏幕在夜里发光
  phone: () => ({
    dt: 0.45,
    poses: [
      { r: 'chest', l: 'chest', eyes: 'down', hy: 1, held: [C('phone', 'l')] },
      { r: 'chest', l: 'chest', eyes: 'down', hy: 1, held: [C('phone', 'l')] },
      { r: 'face', l: 'chest', eyes: 'down', hy: 1, held: [C('phone', 'l')] },
      { r: 'chest', l: 'chest', eyes: 'happy', hy: 1, held: [C('phone', 'l')] },
    ],
    emote: [null, null, null, 'note'],
  }),
  // Mateo 抛球玩
  toss: () => ({
    dt: 0.18,
    poses: [
      { r: 'chest', l: 'down', held: [C('ball')] },
      { r: 'up', l: 'down', held: [C('ballMid')] },
      { r: 'down', l: 'down', held: [C('ballHi')], eyes: 'open', hy: -1 },
      { r: 'up', l: 'down', held: [C('ballMid')] },
      { r: 'chest', l: 'down', held: [C('ball')] },
      { r: 'chest', l: 'down', held: [C('ball')] },
    ],
  }),
  // Jess 踮脚跳着等，停不下来
  bounce: (s) => ({
    dt: 0.2,
    poses: [
      { r: 'chest', l: 'chest', legs: 'wide', by: 1, held: [C('racketUp')], sway: 0 },
      { r: 'chest', l: 'chest', legs: 'stand', lift: 1, held: [C('racketUp')], sway: -1 },
      { r: 'chest', l: 'chest', legs: 'wide', by: 1, held: [C('racketUp')], sway: 1 },
      { r: 'chest', l: 'chest', legs: 'stand', held: carried(s).length ? [C('racketUp')] : [], sway: 0 },
    ],
  }),
  // Ben 喝口咖啡，早上精神
  sip: () => ({
    dt: 0.5,
    poses: [
      { r: 'down', l: 'chest', held: [C('cup', 'l')] },
      { r: 'down', l: 'face', eyes: 'closed', held: [C('cup', 'l')] },
      { r: 'down', l: 'face', eyes: 'closed', held: [C('cup', 'l')] },
      { r: 'down', l: 'chest', eyes: 'happy', held: [C('cup', 'l')] },
    ],
    emote: [null, 'steam', 'steam', null],
  }),
  // Rosa 手搭凉棚看天：风要来了
  squint: () => ({
    dt: 0.6,
    poses: [
      { r: 'down', l: 'down' },
      { r: 'brow', l: 'down', eyes: 'side', hx: -1 },
      { r: 'brow', l: 'down', eyes: 'side', hx: -1 },
      { r: 'brow', l: 'hip', eyes: 'open' },
    ],
    emote: [null, null, 'wind', 'wind'],
  }),
  // Teodora 把拍子举到眼前看线
  inspect: () => ({
    dt: 0.5,
    poses: [
      { r: 'chest', l: 'down', held: [C('racketFront'), C('pliers', 'l')] },
      { r: 'face', l: 'down', held: [C('racketFace'), C('pliers', 'l')], eyes: 'angry' },
      { r: 'face', l: 'chest', held: [C('racketFace'), C('pliers', 'l')], eyes: 'angry' },
      { r: 'chest', l: 'down', held: [C('racketFront'), C('pliers', 'l')] },
    ],
  }),
  // Nadia 转一转受过伤的右肩
  shoulder: () => ({
    dt: 0.3,
    poses: [
      { r: 'down', l: 'hip' },
      { r: 'out', l: 'hip', eyes: 'closed' },
      { r: 'up', l: 'hip', eyes: 'closed' },
      { r: 'out', l: 'hip', eyes: 'closed' },
      { r: 'down', l: 'hip' },
      { r: 'down', l: 'hip' },
    ],
  }),
  // Ray 弯腰揉膝盖，拄着拐
  knee: () => ({
    dt: 0.55,
    poses: [
      { r: 'down', l: 'down', held: [C('cane')] },
      { r: 'down', l: 'knee', by: 1, hy: 1, held: [C('cane')], eyes: 'closed' },
      { r: 'down', l: 'knee', by: 1, hy: 1, held: [C('cane')], eyes: 'closed' },
      { r: 'down', l: 'down', held: [C('cane')] },
    ],
    emote: [null, 'sweat', null, null],
  }),
  // 总监看夹板、记两笔
  clip: () => ({
    dt: 0.4,
    poses: [
      { r: 'chest', l: 'chest', eyes: 'down', held: [C('clip', 'l')] },
      { r: 'across', l: 'chest', eyes: 'down', held: [C('clip', 'l')] },
      { r: 'chest', l: 'chest', eyes: 'down', held: [C('clip', 'l')] },
      { r: 'down', l: 'chest', eyes: 'open', held: [C('clip', 'l')] },
    ],
  }),
  kidSwing: () => ({
    dt: 0.22,
    poses: [
      { r: 'down', l: 'down', held: [C('racket')], sway: 0 },
      { r: 'out', l: 'down', held: [C('racketBack')], sway: -1 },
      { r: 'across', l: 'down', held: [C('racketFront')], lift: 1, sway: 1, eyes: 'happy' },
      { r: 'down', l: 'down', held: [C('racket')] },
    ],
  }),
  kidSpin: () => ({
    dt: 0.25,
    poses: [
      { r: 'chest', l: 'down', held: [C('racketUp')] },
      { r: 'chest', l: 'down', held: [C('racketFront')], eyes: 'side' },
      { r: 'chest', l: 'down', held: [C('racketUp')] },
      { r: 'chest', l: 'down', held: [C('racketFront')], eyes: 'happy' },
    ],
  }),
  wipe: () => ({
    dt: 0.5,
    poses: [
      { r: 'down', l: 'down' },
      { r: 'brow', l: 'down', eyes: 'closed' },
      { r: 'down', l: 'down', by: 1 },
      { r: 'down', l: 'down' },
    ],
    emote: [null, 'sweat', null, null],
  }),
  clap: () => ({
    dt: 0.25,
    poses: [
      { r: 'chest', l: 'down', held: [C('tote', 'l')] },
      { r: 'across', l: 'down', held: [C('tote', 'l')], eyes: 'happy' },
      { r: 'chest', l: 'down', held: [C('tote', 'l')] },
      { r: 'down', l: 'down', held: [C('tote', 'l')] },
    ],
  }),
  photo: () => ({
    dt: 0.45,
    poses: [
      { r: 'down', l: 'down' },
      { r: 'face', l: 'face', eyes: 'closed' },
      { r: 'face', l: 'face', eyes: 'closed' },
      { r: 'down', l: 'down', eyes: 'happy' },
    ],
    emote: [null, null, 'flash', null],
  }),
};

export function anim(spec: SpriteSpec, id: AnimId): Anim {
  const held = carried(spec);
  switch (id) {
    case 'idle':
      return IDLES[spec.idle](spec);
    case 'walk': {
      const w = spec.walk ?? 'normal';
      if (w === 'limp')
        return {
          dt: 0.2,
          poses: [
            { r: 'fwd', l: 'bk', legs: 'stepL', by: 1, held },
            { r: 'down', l: 'down', held },
            { r: 'down', l: 'down', legs: 'stepR', by: 0, held, hy: 1 },
            { r: 'down', l: 'down', held, by: 1 },
          ],
        };
      const slouch = w === 'slouch' ? 1 : 0;
      const bounce = w === 'bouncy';
      return {
        dt: bounce ? 0.12 : 0.15,
        poses: [
          { r: 'fwd', l: 'bk', legs: 'stepL', by: bounce ? 0 : 1, hy: slouch, held, sway: 1 },
          { r: 'down', l: 'down', lift: bounce ? 1 : 0, hy: slouch, held, sway: 0 },
          { r: 'bk', l: 'fwd', legs: 'stepR', by: bounce ? 0 : 1, hy: slouch, held, sway: -1 },
          { r: 'down', l: 'down', lift: bounce ? 1 : 0, hy: slouch, held, sway: 0 },
        ],
      };
    }
    case 'swing':
      return {
        dt: 0.16,
        poses: [
          { r: 'chest', l: 'chest', legs: 'wide', by: 1, held: [C('racketUp')] },
          { r: 'out', l: 'chest', legs: 'wide', by: 1, hx: -1, held: [C('racketBack')] },
          { r: 'across', l: 'out', legs: 'stepR', held: [C('racketFront')], sway: 1 },
          { r: 'over', l: 'down', legs: 'stepR', hx: 1, held: [C('racketOver')], sway: 1 },
          { r: 'over', l: 'down', legs: 'stand', held: [C('racketOver')] },
          { r: 'chest', l: 'chest', legs: 'wide', by: 1, held: [C('racketUp')] },
        ],
      };
    case 'happy':
      return {
        dt: 0.2,
        poses: [
          { r: 'up', l: 'up', lift: 2, legs: 'tuck', eyes: 'happy', sway: -1 },
          { r: 'up', l: 'up', lift: 1, eyes: 'happy', sway: 1 },
          { r: 'out', l: 'out', by: 1, eyes: 'happy' },
          { r: 'up', l: 'up', eyes: 'happy' },
        ],
        emote: ['heart', 'heart', 'heart', 'heart'],
      };
    case 'angry':
      return {
        dt: 0.16,
        poses: [
          { r: 'hip', l: 'hip', eyes: 'angry', hx: -1 },
          { r: 'hip', l: 'hip', eyes: 'angry', hx: 1, legs: 'stomp' },
          { r: 'hip', l: 'hip', eyes: 'angry', hx: -1, by: 1 },
          { r: 'hip', l: 'hip', eyes: 'angry', hx: 1, legs: 'stomp' },
        ],
        emote: ['anger', 'anger', 'anger', 'anger'],
      };
  }
}

/* ---------------- 头顶表情（固定色字符画，和人物分开画） ---------------- */

export const EMOTES: Record<EmoteId, { rows: readonly string[]; pal: Readonly<Record<string, string>> }> = {
  sweat: { rows: ['.b.', 'bwb', 'bbb', '.b.'], pal: { b: '#7fc4e0', w: '#ffffff' } },
  puff: { rows: ['.ww.', 'wwww', '.ww.w'], pal: { w: '#eef0f4' } },
  heart: { rows: ['r.r', 'rrr', '.r.'], pal: { r: '#ff5a6a' } },
  anger: { rows: ['r.r', '.r.', 'r.r'], pal: { r: '#e83a2a' } },
  note: { rows: ['.yy', '.y.', 'yy.'], pal: { y: '#ffd84a' } },
  excl: { rows: ['y', 'y', '.', 'y'], pal: { y: '#ffd84a' } },
  zzz: { rows: ['ww.', '.w.', 'ww.'], pal: { w: '#dfe6ef' } },
  wind: { rows: ['ww..', '..ww', 'www.'], pal: { w: '#e8e0cc' } },
  steam: { rows: ['w.', '.w', 'w.'], pal: { w: '#f0f0f0' } },
  flash: { rows: ['y.y', '.y.', 'y.y'], pal: { y: '#fff6a0' } },
};
