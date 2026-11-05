import { bakeArt, ICON_ART, type PixelArt } from '@td/iso';
import type { Tool } from './model';

/**
 * 亲手扫小游戏自己的字符画：工具栏图标、场上的球 / 瓶子 / 落叶（demo 06 第二轮的图标加上推水和捡）。
 * 数字是固定色（pal），O 是描边槽位。配色取自游戏调色板。
 */

const ICONS: Record<Tool, PixelArt> = {
  broom: ICON_ART.broom,
  squeegee: {
    rows: [
      '.........OO.',
      '........O1O.',
      '.......O1O..',
      '......O1O...',
      '.....O1O....',
      '.OOOOOOOOOO.',
      'O2222222222O',
      'O3333333333O',
      '.OOOOOOOOOO.',
      '.4..4..4..4.',
    ],
    ox: 6,
    oy: 9,
    pal: { '1': '#8a6a45', '2': '#f2b134', '3': '#2a2d33', '4': '#7fd0ea' },
  },
  roller: {
    rows: [
      '.........OO.',
      '........O1O.',
      '.......O1O..',
      '......O1O...',
      '.OOOOOOOOO..',
      'O2222222223O',
      'O4444444444O',
      'O2222222222O',
      'O5555555555O',
      '.OOOOOOOOOO.',
    ],
    ox: 6,
    oy: 9,
    pal: { '1': '#8a6a45', '2': '#9a9894', '3': '#d4d0c8', '4': '#d4d0c8', '5': '#5d5a57' },
  },
  paint: {
    rows: [
      '.........OO.',
      '........O1O.',
      '.......O1O..',
      '..OOOOOOOO..',
      '.O22222222O.',
      '.O23333332O.',
      '.O22222222O.',
      '..OOOOOOOO..',
      '..O4O..O4O..',
      '...O....O...',
      '333333333333',
    ],
    ox: 6,
    oy: 10,
    pal: { '1': '#8a6a45', '2': '#d94a3a', '3': '#f6f3ea', '4': '#5d5a57' },
  },
  net: {
    rows: [
      'O..........O',
      'O3333333333O',
      'O.2.2.2.2.2O',
      'O2222222222O',
      'O.2.2.2.2.2O',
      'O2222222222O',
      'O.2.2.2.2.2O',
      'O..........O',
      'O..........O',
      'OO........OO',
    ],
    ox: 6,
    oy: 9,
    pal: { '2': '#5d5a57', '3': '#f6f3ea' },
  },
  water: {
    rows: [
      '...........4',
      '..........4.',
      '.OOOOOO..4..',
      'O222222O.4..',
      'O2222222OO..',
      'O232222222O.',
      'O23222222O..',
      'O2222222O...',
      'O222222O....',
      '.OOOOOO.....',
    ],
    ox: 6,
    oy: 9,
    pal: { '2': '#3f6fb0', '3': '#7fd0ea', '4': '#4fc3d9' },
  },
  pick: {
    rows: [
      '....OO......',
      '...O11O.....',
      '...O11O.OO..',
      '...O11OO11O.',
      '.OOO11O11O..',
      'O11O1111O...',
      'O1111111O...',
      '.O11111O.OO.',
      '..O111O.O22O',
      '...OOO..O22O',
      '.........OO.',
    ],
    ox: 6,
    oy: 10,
    pal: { '1': '#f1c27d', '2': '#d8e04a' },
  },
};

/** 场上的东西（锚点在底部中间） */
export const LITTER_ART: readonly PixelArt[] = [
  // 网球
  { rows: ['.OO.', 'O12O', 'O11O', '.OO.'], ox: 2, oy: 3, pal: { '1': '#d8e04a', '2': '#f6f8c0' } },
  // 倒在地上的水瓶
  {
    rows: ['.OOOOO..', 'O22223OO', 'O111111O', '.OOOOOO.'],
    ox: 4,
    oy: 3,
    pal: { '1': '#7fd0ea', '2': '#bfeaf6', '3': '#3f6fb0' },
  },
  // 棕榈落叶
  { rows: ['1...1.', '.1.1.1', '..2222', '.1.1..'], ox: 3, oy: 3, pal: { '1': '#a8853a', '2': '#6a4a2a' } },
];

/** 一张字符画画成 DOM 小画布（CSS 整数倍放大、pixelated） */
export function artCanvas(name: Tool, scale = 3): HTMLCanvasElement {
  const b = bakeArt(ICONS[name]);
  const c = document.createElement('canvas');
  c.width = b.w;
  c.height = b.h;
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(b.w, b.h);
    new Uint32Array(img.data.buffer).set(b.px);
    ctx.putImageData(img, 0, 0);
  }
  c.style.width = `${b.w * scale}px`;
  c.style.height = `${b.h * scale}px`;
  c.style.imageRendering = 'pixelated';
  return c;
}
