import { bakeArt, ICON_ART, type PixelArt } from '@td/iso';

/**
 * 场地养护 demo 自己的字符画：裂缝里的杂草、工具栏图标。配色取自游戏调色板（ground.ts、held.ts、icons）。
 * 数字是固定色（pal），O 是描边槽位。
 */

/** 裂缝里长出来的一丛草（锚点在根部） */
export const WEED_ART: PixelArt = {
  rows: ['1...1', '.1.1.', '12121', '.222.', '..3..'],
  ox: 2,
  oy: 4,
  pal: { '1': '#8fbf4a', '2': '#5a8a2e', '3': '#6a4a2a' },
};

const ICONS: Record<string, PixelArt> = {
  broom: ICON_ART.broom,
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
};

/** 一张字符画画成 DOM 小画布（CSS 放大、pixelated） */
export function artCanvas(name: string, scale = 3): HTMLCanvasElement {
  const a = ICONS[name] ?? ICON_ART.broom;
  const b = bakeArt(a);
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
