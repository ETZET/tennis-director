import type { PixelArt } from '../format';

/**
 * Indian Wells 修复变体和升级用的小招牌、小道具（wave1-contract.md）。都是"立着朝镜头"的精灵，
 * 按 spriteScale 放大（镜头拉远时比真实比例大，Kairosoft 式），挂在场景几何（杆子、墙）上画。
 *
 * 约定同 art/props：'O' 描边；固定色查 pal；'Y' 灯光槽位夜里自发光（霓虹招牌按 slots 换色）。
 * 锚点 ox/oy 是招牌挂上去的那一点（一般是底边中间，接杆子顶）。
 */

const CREAM = '#f3e6cc';
const OUTL = '#2a2238';

/** 咖啡吧：奶油色牌子上一只红杯子冒着热气 */
export const CUP_SIGN: PixelArt = {
  rows: [
    '..OOOOOOOO..',
    '.O11111111O.',
    'O1114141111O',
    'O1141411111O',
    'O1155555111O',
    'O1152225551O',
    'O1155555151O',
    'O1155555551O',
    'O1115551111O',
    '.O11111111O.',
    '..OOOOOOOO..',
  ],
  ox: 6,
  oy: 10,
  pal: { '1': CREAM, '2': '#6b3f26', '4': '#b8a890', '5': '#d6362f' },
};

/** 理疗室：白牌子上一个青色十字 */
export const PHYSIO_SIGN: PixelArt = {
  rows: [
    '.OOOOOOOOO.',
    'OWWWWWWWWWO',
    'OWWW333WWWO',
    'OWWW333WWWO',
    'OW3333333WO',
    'OW3333333WO',
    'OW3333333WO',
    'OWWW333WWWO',
    'OWWW333WWWO',
    'OWWWWWWWWWO',
    '.OOOOOOOOO.',
  ],
  ox: 5,
  oy: 10,
  pal: { '3': '#17a2b8' },
};

/** 球拍店：绿牌子上一把白球拍和一个黄球 */
export const RACKET_SIGN: PixelArt = {
  rows: [
    '.OOOOOOOOO.',
    'O444444444O',
    'O444WWW444O',
    'O44W666W44O',
    'O44W666W44O',
    'O44W666W44O',
    'O444WWW444O',
    'O4444W4444O',
    'O4444W4544O',
    'O4444W4444O',
    '.OOOOOOOOO.',
  ],
  ox: 5,
  oy: 10,
  pal: { '4': '#2f7a4a', '6': '#cfe8d8', '5': '#d7e64a' },
};

/** 夜场吧台的霓虹鸡尾酒杯（'Y' 夜里发光；换色传 slots.light） */
export const NEON_GLASS: PixelArt = {
  rows: [
    'OOOOOOOOOOO',
    'O777777777O',
    'O7YYYYYYY7O',
    'O77Y797Y77O',
    'O777Y7Y777O',
    'O7777Y7777O',
    'O7777Y7777O',
    'O7777Y7777O',
    'O777YYY777O',
    'O777777777O',
    'OOOOOOOOOOO',
  ],
  ox: 5,
  oy: 10,
  pal: { '7': '#3a2450', '9': '#7af0ff' },
};

/** 冷水池边的计时钟：白钟面、黑刻度、红秒针 */
export const PACE_CLOCK: PixelArt = {
  rows: [
    '..OOOOO..',
    '.OWW8WWO.',
    'OWWW8W3WO',
    'OWWW83WWO',
    'O8WW8WW8O',
    'OWWWWWWWO',
    'OWWWWWWWO',
    '.OWW8WWO.',
    '..OOOOO..',
  ],
  ox: 4,
  oy: 8,
  pal: { '8': OUTL, '3': '#e2463c' },
};

/** 度假泳池里的粉色火烈鸟游泳圈 */
export const FLAMINGO: PixelArt = {
  rows: [
    '......OO...',
    '.....O33O..',
    '.....O3O2O.',
    '.....O3O...',
    '..OOOO3O...',
    '.O333333O..',
    'O33333333O.',
    'O55555555O.',
    '.OOOOOOOO..',
  ],
  ox: 5,
  oy: 7,
  pal: { '3': '#ff8fbf', '5': '#e0609a', '2': '#2a2238' },
};

/** 橙白相间的游泳圈（中间是空的，露出池水） */
export const DONUT: PixelArt = {
  rows: ['..OOOOO..', '.O6W6W6O.', 'O6WO.OW6O', '.O6W6W6O.', '..OOOOO..'],
  ox: 4,
  oy: 3,
  pal: { '6': '#ff8a3d' },
};

/** 学院的学员看板：白板上一行一个学员（彩色磁贴 + 名字 + 金色星星），两条腿 */
export const STUDENT_BOARD: PixelArt = {
  rows: [
    'OOOOOOOOOOOOOO',
    'OWWWWWWWWWWWWO',
    'OW3W8888WW5WWO',
    'OWWWWWWWWWWWWO',
    'OW4W888WW55WWO',
    'OWWWWWWWWWWWWO',
    'OW6W88888W55WO',
    'OWWWWWWWWWWWWO',
    'OOOOOOOOOOOOOO',
    '.G..........G.',
    '.G..........G.',
    '.G..........G.',
  ],
  ox: 7,
  oy: 11,
  pal: { '3': '#e2463c', '4': '#2f7fd8', '6': '#3fb37f', '8': '#8c9298', '5': '#f0c53c' },
};
