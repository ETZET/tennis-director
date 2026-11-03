/**
 * 像素素材的文本格式（ADR 0019）。所有素材都是字符画：一行一个字符串，一个字符一个像素。
 *
 * - '.' 透明；
 * - 大写/小写字母是"调色板槽位"（见 SLOT），运行时按人物外观 / 设施状态换色；
 * - 其余字符（数字、符号）查素材自己的 `pal`（固定颜色）。
 *
 * 素材不放图片文件：可以 diff、可以审查，运行时烘焙成 Uint32 像素缓冲（`bakeArt`，在 core 里实现）。
 */

/** 一张像素图。 */
export interface PixelArt {
  /** 每行同样长；行数就是高 */
  readonly rows: readonly string[];
  /** 锚点像素（人物是两脚中间的地面点；道具是放置点）。画的时候这个像素对准世界坐标的投影点 */
  readonly ox: number;
  readonly oy: number;
  /** 素材自己的固定颜色（非字母字符） */
  readonly pal?: Readonly<Record<string, string>>;
  /** 命名的挂点（相对左上角的像素坐标）：hand_r、hand_l、head_top、racket 等 */
  readonly pts?: Readonly<Record<string, readonly [number, number]>>;
}

/**
 * 换色槽位。人物素材只用这些字母（外加 `pal` 里的固定色），换色时按 `PersonLook` 填。
 * 每个槽位一亮一暗：大写是亮面，对应的小写是暗面（运行时由亮面自动压暗得到，也可以单独给）。
 */
export const SLOT = {
  /** 描边（深色，夜里也不变亮） */
  O: 'outline',
  S: 'skin',
  H: 'hair',
  T: 'shirt',
  R: 'trim',
  L: 'sleeve',
  B: 'bottoms',
  K: 'socks',
  F: 'shoes',
  C: 'cap',
  Q: 'racket',
  W: 'white',
  E: 'eye',
  /** 设施素材用：主色、副色、点缀色、木头、金属、玻璃、灯光（自发光） */
  M: 'main',
  N: 'second',
  A: 'accent',
  D: 'wood',
  G: 'metal',
  V: 'glass',
  Y: 'light',
} as const;

export type SlotChar = keyof typeof SLOT;
export type SlotName = (typeof SLOT)[SlotChar];

/** 换色表：槽位名 → 颜色（'#rrggbb'）。缺的槽位用素材默认或 DEFAULT_SLOTS。 */
export type SlotColors = Partial<Record<SlotName, string>>;

export const DEFAULT_SLOTS: Readonly<Record<SlotName, string>> = {
  outline: '#2a2238',
  skin: '#f2c9a2',
  hair: '#5a3a22',
  shirt: '#2f7fd8',
  trim: '#ffffff',
  sleeve: '#2f7fd8',
  bottoms: '#2d3a5a',
  socks: '#ffffff',
  shoes: '#ffffff',
  cap: '#ffffff',
  racket: '#3a3340',
  white: '#f6f3ea',
  eye: '#2a2238',
  main: '#e9c999',
  second: '#c96e43',
  accent: '#3fb37f',
  wood: '#8a6a45',
  metal: '#8c9298',
  glass: '#7fc4e0',
  light: '#ffe9a8',
};

/**
 * 人物精灵的朝向。等距画面里人只有两张底图：脸朝镜头（front，向右下）和背朝镜头（back，向右上）；
 * 朝左的两个方向由水平翻转得到。
 */
export type Facing = 'front' | 'back';

/** 一组动画帧（循环或一次性）。 */
export interface ArtAnim {
  readonly frames: readonly PixelArt[];
  /** 每帧秒数 */
  readonly dt: number;
}

/**
 * 人物精灵表：帧名 → 两个朝向的帧序列。
 * 帧名约定（people 运行时按名字取帧，取不到就按 FRAME_FALLBACK 往回找，最后用 idle）：
 * - 移动：idle、walk、run、hop
 * - 基础姿势：和 people/poses.ts 的 POSES 同名（relaxed、ready、seated、carry……）
 * - 击球分段：和 POSES 里的分段同名（fhB、fhC、fhF、sT、sC……）
 * - 手势：和 GESTURES 同名（cheer、clap、wave……），一般 2 帧来回
 * - 摔倒：fallFace、fallBack（躺在地上那一帧）
 */
export interface PersonSheet {
  /** 体型：adult 约 8×14，kid 约 6×10 */
  readonly body: 'adult' | 'kid';
  readonly anims: Readonly<Record<string, Readonly<Record<Facing, ArtAnim>>>>;
}

/** 取不到帧时往回找的顺序（从左到右）。 */
export const FRAME_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  run: ['walk'],
  hop: ['idle'],
  slump: ['relaxed', 'idle'],
  relaxed: ['idle'],
  pbReady: ['ready'],
  seatPhone: ['seated'],
  sitGround: ['seated'],
  phoneStand: ['idle'],
  director: ['idle'],
  crouchBK: ['ready'],
  stoop: ['ready'],
  handsKnees: ['ready'],
  dkB: ['fhB'],
  dkC: ['fhC'],
  dkF: ['fhF'],
  fdB: ['fhB'],
  fdC: ['fhC'],
  fdF: ['fhF'],
  vB: ['fhB'],
  vC: ['fhC'],
  tsB: ['sT'],
  tsF: ['sF'],
  set: ['sR', 'ready'],
  sR: ['ready'],
};
