import { MESS_PROPS, type MessProp } from '../art/props/mess';
import { hash, mixP, ph } from '../core/color';

/**
 * 场地脏乱的"一格怎么画"（court-care-contract.md，ADR 0022），不属于哪张地图：
 * 地图的脏乱叠层（site/<地图>/mess.ts）和游戏的亲手扫小游戏（apps/game/src/care）用同一个函数画每一格、同一套像素画画垃圾，
 * 所以进出小游戏时场上的沙、水、裂缝、线、垃圾一模一样（不跳、不换位置）。
 * 输入是画面上的量（沙多厚、水多深、裂缝多清楚……），不是模拟的 0..1；那一步由各自的格子算。纯函数，不碰 DOM。
 */

export { MESS_PROPS, type MessProp };

/**
 * 一块球场上的脏乱（court-care-contract.md，ADR 0022）：各 0..1，0 干净、1 最脏。和模拟的 CourtMess 结构一样
 * （游戏直接把 s.care[f].mess 传进来）；画面只按它画，不改它。
 * sand 积沙、water 积水（红土画成深色湿泥和水洼）、litter 球、瓶子、落叶、lines 白线褪色（红土是线带被盖住）、
 * cracks 裂缝（红土画成干裂发白的斑块）。
 */
export interface CourtMessLook {
  readonly sand: number;
  readonly water: number;
  readonly litter: number;
  readonly lines: number;
  readonly cracks: number;
}

/** 格子边长（米），和地面贴图的纹素一样 */
export const MESS_TS = 0.2;
/** 沙厚到这个数整格盖住 */
export const MESS_SAND_THICK = 0.55;
/** 水深过这个数是水洼（硬地）/ 小水洼（红土） */
export const MESS_PUDDLE = 0.12;

export const MESS_HEX = {
  sand: '#e9c999',
  sand2: '#dfba86',
  sand3: '#f4dcb2',
  sandD: '#d6ae78',
  peb: '#c9a676',
  wet: '#1d2c40',
  puddle: '#86b6d2',
  puddle2: '#a6cfe4',
  rim: '#3e6584',
  glint: '#f2fbff',
  mud: '#6a2a18',
  mudPool: '#6e4a3e',
  mudRim: '#9a7a6c',
  mudGlint: '#b9dcea',
  crack: '#262c38',
  chip: '#59606c',
  dry: '#efc9a2',
  dryCrack: '#8a3c22',
  grey: '#a9a497',
  clayLine: '#d98a62',
} as const;
export type MessHexKey = keyof typeof MESS_HEX;
/** 白天的打包色（夜里逐格用 nightP 换算） */
export const MESS_DAY = Object.fromEntries(Object.entries(MESS_HEX).map(([k, v]) => [k, ph(v)])) as Readonly<
  Record<MessHexKey, number>
>;

/** 一格的输入（画面上的量；≤ 0 的项不画） */
export interface MessCellIn {
  clay: boolean;
  /** 沙的厚度（> 0.05 才画）；up / dn / lf 是北、南、西邻格的厚度（坡的明暗） */
  sand: number;
  sandUp: number;
  sandDn: number;
  sandLf: number;
  /** 水深（> 0 才画） */
  wet: number;
  /** 硬地：这一格是裂缝（1）还是裂缝边上的崩口（2），0 不是；crackA 0..1 多清楚 */
  crack: number;
  crackA: number;
  /** 红土：干裂多重（> 0 才画）；dryNet 这一格在龟裂纹上 */
  dry: number;
  dryNet: boolean;
  /** 白线格：grey 发灰的不透明度、fade 褪掉多少（> 0 才画）、base 线褪掉以后露出来的场地色 */
  line: boolean;
  grey: number;
  fade: number;
  base: number;
  /** 盖在线那一层上的颜色（小游戏：引导线、画在沙上的脏线、画歪的白点）；paintA 0 不盖 */
  paint: number;
  paintA: number;
}

export const messCellIn = (): MessCellIn => ({
  clay: false,
  sand: 0,
  sandUp: 0,
  sandDn: 0,
  sandLf: 0,
  wet: 0,
  crack: 0,
  crackA: 0,
  dry: 0,
  dryNet: false,
  line: false,
  grey: 0,
  fade: 0,
  base: 0,
  paint: 0,
  paintA: 0,
});

/**
 * 画一格：从下往上 裂缝 / 干裂 → 线（发灰、褪掉）→ 小游戏盖的颜色 → 积水 → 沙。
 * i、j 只用来取每格固定的小抖动（世界格子的下标，两边传同一个就画得一样）。out.amt 0 = 不画。
 */
export function messCell(
  v: Readonly<MessCellIn>,
  i: number,
  j: number,
  P: Readonly<Record<MessHexKey, number>>,
  out: { col: number; amt: number },
): void {
  let col = 0;
  let amt = 0;
  const over = (k: number, a: number) => {
    if (a <= 0) return;
    if (a >= 1 || amt <= 0) {
      col = amt <= 0 || a >= 1 ? k : mixP(col, k, a);
      amt = a >= 1 ? 1 : Math.max(amt, a);
      return;
    }
    const na = a + amt * (1 - a);
    col = mixP(col, k, a / na);
    amt = na;
  };
  const clay = v.clay;
  // 裂缝 / 干裂
  if (!clay) {
    if (v.crack > 0 && v.crackA > 0)
      over(v.crack === 2 ? P.chip : P.crack, (v.crack === 2 ? 0.7 : 0.92) * Math.min(1, v.crackA));
  } else if (v.dry > 0) {
    over(P.dry, Math.min(0.62, 0.28 + v.dry * 3));
    if (v.dry > 0.05 && v.dryNet) over(P.dryCrack, Math.min(0.9, 0.4 + v.dry * 4));
  }
  // 线：先整体发灰，再一段段地褪掉（红土：被红土盖住）
  if (v.line) {
    if (v.grey > 0) over(clay ? P.clayLine : P.grey, v.grey);
    if (v.fade > 0) over(v.base, Math.min(0.94, 0.35 + v.fade * 4));
  }
  if (v.paintA > 0) over(v.paint, v.paintA);
  // 水：硬地是浅色反光的水洼、外圈一道深色湿印；红土是深色湿泥、深的地方积成小水洼
  const w = v.wet;
  if (w > 0) {
    if (clay) {
      over(P.mud, Math.min(0.62, 0.3 + w * 2.2));
      if (w > MESS_PUDDLE + 0.03) over(hash(i, j, 79) < 0.012 ? P.mudGlint : P.mudPool, 0.94);
      else if (w > MESS_PUDDLE) over(P.mudRim, 0.85);
    } else if (w > MESS_PUDDLE + 0.035) {
      const h = hash(i, j, 81);
      over(h < 0.012 ? P.glint : w > MESS_PUDDLE + 0.09 ? P.puddle2 : P.puddle, 1);
    } else if (w > MESS_PUDDLE) over(P.rim, 0.85);
    else over(P.wet, 0.32);
  }
  // 沙：厚的整格盖住（朝上风的坡亮、背风的暗，偶尔一颗石子），薄的按厚度分四档透出下面
  const sd = v.sand;
  if (sd > 0.05) {
    if (sd >= MESS_SAND_THICK) {
      let k = P.sand;
      if (sd - v.sandUp > 0.22 || sd - v.sandLf > 0.3) k = P.sand3;
      else if (sd - v.sandDn > 0.22) k = P.sand2;
      else if (sd > 1.6) k = P.sandD;
      if (hash(i, j, 78) > 0.985) k = P.peb;
      over(k, 1);
    } else {
      const a = Math.min(0.92, Math.round(((sd - 0.05) / 0.5) * 4 + hash(i, j, 77) * 0.9 - 0.45) / 4 + 0.18);
      over(P.sand, a);
    }
  }
  out.col = col;
  out.amt = amt;
}

/* ---------------- 快照：地图画着的样子，交给小游戏；小游戏扫完再交回来 ---------------- */

/** 场上一件画着的垃圾 */
export interface MessPiece {
  /** 在这块场里的编号（交回来时认这个） */
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly prop: MessProp;
}

/**
 * 一块球场此刻画出来的脏乱（世界坐标的格子，和地面纹素对齐）。小游戏开场照它摆（MessLayer 的 snapshot），
 * 收工把扫剩下的样子按同样的格式交回去（rebase），地图从此照剩下的画。静态的几项（inside、line、dryNet、crackCell、base）
 * 是这块场的格子自己的，别改；动态的几项（sand……fade、pieces）是画面上的量。
 */
export interface MessCourtSnapshot {
  readonly key: string;
  readonly ox: number;
  readonly oz: number;
  readonly hx: number;
  readonly hz: number;
  readonly clay: boolean;
  /** 拍这张快照时画的量（量化后）；rebase 认它 */
  readonly amounts: CourtMessLook;
  /** 第 0 格西北角（世界坐标）、格子数、格子边长 */
  readonly gx0: number;
  readonly gz0: number;
  readonly nx: number;
  readonly nz: number;
  readonly ts: number;
  readonly inside: Uint8Array;
  readonly line: Uint8Array;
  readonly dryNet: Uint8Array;
  /** 硬地：0 不是裂缝、1 裂缝、2 崩口（这一格可能长出裂缝的样子；画不画看 crack） */
  readonly crackCell: Uint8Array;
  /** 线褪掉以后露出来的场地色（白天的打包色） */
  readonly base: Uint32Array;
  readonly sand: Float32Array;
  readonly wet: Float32Array;
  /** 硬地裂缝多清楚 0..1 */
  readonly crack: Float32Array;
  readonly dry: Float32Array;
  readonly grey: Float32Array;
  readonly fade: Float32Array;
  readonly pieces: readonly MessPiece[];
}

/** 世界坐标 → 快照的格子（出界、场外 -1） */
export function snapshotCell(s: MessCourtSnapshot, x: number, z: number): number {
  const i = Math.floor((x - s.gx0) / s.ts);
  const j = Math.floor((z - s.gz0) / s.ts);
  if (i < 0 || j < 0 || i >= s.nx || j >= s.nz) return -1;
  const c = j * s.nx + i;
  return s.inside[c] ? c : -1;
}

/** 照着一张快照填一格的输入（地图和小游戏都用） */
export function snapshotCellIn(s: MessCourtSnapshot, c: number, v: MessCellIn): MessCellIn {
  const nx = s.nx;
  const sd = s.sand[c] as number;
  v.clay = s.clay;
  v.sand = sd;
  v.sandUp = c >= nx ? (s.sand[c - nx] as number) : sd;
  v.sandDn = c + nx < s.sand.length ? (s.sand[c + nx] as number) : sd;
  v.sandLf = c % nx > 0 ? (s.sand[c - 1] as number) : sd;
  v.wet = s.wet[c] as number;
  v.crack = s.crackCell[c] as number;
  v.crackA = s.crack[c] as number;
  v.dry = s.dry[c] as number;
  v.dryNet = !!s.dryNet[c];
  v.line = !!s.line[c];
  v.grey = s.grey[c] as number;
  v.fade = s.fade[c] as number;
  v.base = s.base[c] as number;
  v.paint = 0;
  v.paintA = 0;
  return v;
}

/**
 * 一张快照里每项脏乱"有多少"（小游戏拿来把一块场的进度折成整处设施的比例）：
 * 沙 Σ(厚度 − 0.03)、水 Σ 水深、裂缝 Σ 清楚程度（红土 Σ 干裂）、垃圾件数、线褪掉的格子数。
 */
export function snapshotTotals(s: MessCourtSnapshot): Record<keyof CourtMessLook, number> {
  let sand = 0;
  let water = 0;
  let cracks = 0;
  let lines = 0;
  for (let c = 0; c < s.inside.length; c++) {
    if (!s.inside[c]) continue;
    sand += Math.max(0, (s.sand[c] as number) - 0.03);
    water += Math.max(0, s.wet[c] as number);
    cracks += s.clay ? Math.max(0, s.dry[c] as number) : s.crackCell[c] ? Math.max(0, s.crack[c] as number) : 0;
    if (s.line[c] && (s.fade[c] as number) > 0) lines++;
  }
  return { sand, water, litter: s.pieces.length, lines, cracks };
}
