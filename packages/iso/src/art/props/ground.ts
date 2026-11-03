import type { ArtAnim, PixelArt, SlotColors } from '../format';
import { HELD } from './held';

/**
 * 摆在地上的小道具（活动里用 Box 拼不好看的那些）。
 *
 * 约定：
 * - 等距 2:1 画法，光从左上来：顶面最亮、左前面中等、右前面最暗；描边用 'O'。
 * - 锚点 ox/oy 是"落地点"：道具占地面积的中心在地面上的投影像素（盒状的东西不是最底下那一行，而是底面菱形的中心）。
 *   画的时候这个像素对准世界坐标 (x, 0, z) 的投影；深度排序也按它。
 * - 可以换色的部分用槽位：M/A/N（台布、气球、牌子），W 白、D 木头、G 金属；默认颜色见 GROUND_SLOTS。
 * - 尺寸按"人约 8×14 像素 = 1.8 米"略放大（Kairosoft 式），1 米大约 8 像素宽。
 */

const BALL = '#d7e64a';
const BALL_D = '#a8b83a';
const WIRE = '#2c2c30';

/** 一筐网球（旧版 basket()）：网面露出黄球，四条腿。 */
const basket: PixelArt = {
  rows: [
    '....OO.....',
    '..OO56OO...',
    '.O656565O..',
    'O65656569O.',
    'O65656797O.',
    'O96569779O.',
    'O65657979O.',
    'OG656797gO.',
    'OGgO69OGgO.',
    'OGgOGgOGgO.',
    'OGgOGgOGgO.',
    'OGgOGgOGgO.',
    '.OOOGgOOO..',
    '...OGgO....',
    '....OO.....',
  ],
  ox: 5,
  oy: 12,
  pal: { '5': BALL, '6': BALL_D, '7': '#7a8a2a', '9': WIRE },
};

/** 捡球器（圆筒网篮，两边提手竖起来）。 */
const hopper: PixelArt = {
  rows: [
    'OO....OO',
    'OG....GO',
    'OGOOOOGO',
    'O556565O',
    'O695969O',
    'O969596O',
    'O695969O',
    '.OOOOOO.',
    '.OG..GO.',
    '.OO..OO.',
  ],
  ox: 4,
  oy: 9,
  pal: { '5': BALL, '6': BALL_D, '9': WIRE },
};

/** 标志桶（mkCone）：橙色带白圈。 */
const cone: PixelArt = {
  rows: ['..OO..', '.O13O.', '.O22O.', '.O13O.', 'O1113O', 'O1133O', '.OOOO.'],
  ox: 3,
  oy: 5,
  pal: { '1': '#ec6b23', '2': '#f4f1e8', '3': '#b84a14' },
};

/** 运动饮料桶（橙色大水桶，白盖，右边一个水龙头）。 */
const cooler: PixelArt = {
  rows: [
    '.OOOO..',
    'O1111O.',
    'O1111O.',
    'OOOOOO.',
    'O2223O.',
    'O2WW3O.',
    'O2223OO',
    'O2223O9',
    'O2223OO',
    'O2223O.',
    '.OOOO..',
  ],
  ox: 3,
  oy: 9,
  pal: { '1': '#f4f1e8', '2': '#f08a2a', '3': '#c0601a', '9': '#2a2238' },
};

/** 长凳上搭着一条毛巾（旧版 bench()，凳子沿 +x 方向，即画面右下）。 */
const benchTowel: PixelArt = {
  rows: [
    '....OO...........',
    '..OO44OO.........',
    '.O444444OO.......',
    'O3444444WWOO.....',
    '.O3344WWWWWWOO...',
    '.O9O3WWWWW4444O..',
    '.O9OwwwW4444443O.',
    '.O9Owwww334433O..',
    '..O.OOwwOO33O9O..',
    '......OO.O9OO9O..',
    '.........O9OO9O..',
    '.........O9O.O...',
    '..........O......',
  ],
  ox: 8,
  oy: 9,
  pal: { '3': '#7a5232', '4': '#9a6b42', '9': '#3a3a36' },
};

/** 颁奖桌：白台布盖顶，四周垂下 M 色的裙边，底边一道 A。 */
const prizeTable: PixelArt = {
  rows: [
    '......OO..............',
    '....OOWWOO............',
    '..OOWWWWWWOO..........',
    '.OWWWWWWWWWWOO........',
    'OMWWWWWWWWWWWWOO......',
    'OMMMWWWWWWWWWWWWOO....',
    'OMMMMMWWWWWWWWWWWWOO..',
    'OMMMMMMMWWWWWWWWWWWWO.',
    'OMMMMMMMMMWWWWWWWWWWmO',
    'OAMMMMMMMMMMWWWWWWmmmO',
    '.OAAMMMMMMMMMMWWmmmmmO',
    '..OOAAMMMMMMMMMmmmmmmO',
    '....OOAAMMMMMMMmmmmmmO',
    '......OOAAMMMMMmmmmmaO',
    '........OOAAMMMmmmaaO.',
    '..........OOAAMmaaOO..',
    '............OOAaOO....',
    '..............OO......',
  ],
  ox: 11,
  oy: 12,
};

/** 烤炉：黑炉身，烤架上有红炭（不带烟，烟交给粒子）。 */
const grill: PixelArt = {
  rows: [
    '......OO........',
    '....OO16OO......',
    '..OO617161OO....',
    '.O1676161716OO..',
    'O2716167616171O.',
    'O22217161676163O',
    'O22222617161333O',
    '.O2222221633333O',
    '.O1O2222233333O.',
    '.O1OOO222333O1O.',
    '.O1O..OO23OOO1O.',
    '..O....O11O.O1O.',
    '.......O11O..O..',
    '.......O11O.....',
    '........OO......',
  ],
  ox: 8,
  oy: 11,
  pal: { '1': '#3a3a40', '2': '#5a5a62', '3': '#2a2a30', '6': '#6a6a70', '7': '#ff7a2a' },
};

/** 汉堡（盘子外单独放着的）。 */
const burger: PixelArt = {
  rows: ['.OOO.', 'O999O', 'O888O', 'O666O', 'O999O', '.OOO.'],
  ox: 2,
  oy: 5,
  pal: { '9': '#e8b04a', '8': '#8a4f2a', '6': '#6aa84a' },
};

/** 一串气球（集市）：三个气球 M / A / N，底下一个小坠子。 */
const balloons: PixelArt = {
  rows: [
    '.OOO.....',
    'OWMMOOOO.',
    'OMMMOWAAO',
    'OMMmOAAAO',
    '.OOOOAAaO',
    '.OWNNOaO.',
    '.ONNNOO..',
    '.ONNnO...',
    '..OOO....',
    '...1..1..',
    '...1.1...',
    '....1....',
    '....1....',
    '....1....',
    '...O9O...',
    '...OOO...',
  ],
  ox: 4,
  oy: 15,
  pal: { '1': '#e8e2d0', '9': '#5a5f63' },
};

/** A 字立牌：木框，牌面 M，白色是写字的地方。 */
const signBoard: PixelArt = {
  rows: [
    '..OOOO..',
    '.ODDDDO.',
    '.OMWWMO.',
    '.OMMMMO.',
    '.OWWMMO.',
    'ODMMMMDO',
    'ODWWWMDO',
    'ODMMMmdO',
    'OOOOOOOO',
    'OdO..OdO',
    'OOO..OOO',
  ],
  ox: 4,
  oy: 10,
};

/** 插在地上的指示牌：牌面 M，木桩。 */
const signPost: PixelArt = {
  rows: [
    'OOOOOOOOO',
    'OMMMMMMMO',
    'OMWWMWWMO',
    'OMMMMMMMO',
    'OmmmmmmmO',
    'OOOODOOOO',
    '...ODO...',
    '...ODO...',
    '...ODO...',
    '...OdO...',
    '...OOO...',
  ],
  ox: 4,
  oy: 10,
};

/** 平放在地上的夹板。 */
const clipboard: PixelArt = {
  rows: [
    '...OOOO.....',
    '.OODGWDOO...',
    'ODDWWWWWDOO.',
    '.OdDWWWWWDDO',
    '..OOdDWDDdO.',
    '....OOddOO..',
    '......OO....',
  ],
  ox: 6,
  oy: 4,
};

/** 垃圾：一团纸和一个易拉罐。 */
const litter: PixelArt = {
  rows: ['.OO.....', 'O11O.OO.', 'O12OO33O', '.OO.O34O', '.....OO.'],
  ox: 4,
  oy: 3,
  pal: { '1': '#f4f1e8', '2': '#b8b4a8', '3': '#c4462b', '4': '#cfd3d6' },
};

/** 散落的落叶。 */
const leaves: PixelArt = {
  rows: ['.OO.......', 'O12O...OO.', '.OO...O34O', '..OO...OO.', '.O15O.....', '..OO......'],
  ox: 5,
  oy: 3,
  pal: { '1': '#e09a3a', '2': '#c4462b', '3': '#e5b33b', '4': '#d8832e', '5': '#8a5a1a' },
};

/** 折断的树枝（清理活动的 branch）。 */
const branch: PixelArt = {
  rows: [
    'OO..........',
    'O4O....OOO..',
    '.O44O.O666O.',
    '..OO44O676O.',
    '....O444OOO.',
    '.....OOO44O.',
    '........OO..',
  ],
  ox: 6,
  oy: 4,
  pal: { '4': '#6a4a32', '6': '#6aa84a', '7': '#4a7a32' },
};

/** 一丛杂草（清理活动的 weeds）。 */
const weeds: PixelArt = {
  rows: ['.O...O.', 'O6O.O6O', 'O6OO7O.', '.O67O6O', 'O6776O.', '.OOOOO.'],
  ox: 3,
  oy: 5,
  pal: { '6': '#7ab84a', '7': '#4a7a32' },
};

/** 一袋垃圾（清理活动的 trash）。 */
const trash: PixelArt = {
  rows: ['.O...O.', '..O.O..', '.OO8OO.', 'O88889O', 'O87889O', 'O88899O', '.OOOOO.'],
  ox: 3,
  oy: 5,
  pal: { '7': '#6a7a6a', '8': '#3a4a3a', '9': '#24302a' },
};

/** 滚草：两帧交替就是在滚（第二帧是第一帧转 90 度）。 */
const TW = { '1': '#b89a5a', '2': '#7a6038' };
const tumbleweed0: PixelArt = {
  rows: ['..OOOO..', '.O12.1O.', 'O1.2.12O', 'O.21.2.O', 'O2.12.1O', 'O1.2.21O', '.O2.1.O.', '..OOOO..'],
  ox: 4,
  oy: 7,
  pal: TW,
};
const tumbleweed1: PixelArt = {
  rows: ['..OOOO..', '.O12.1O.', 'O2..2.1O', 'O.21122O', 'O1.2...O', 'O.2.211O', '.O11.2O.', '..OOOO..'],
  ox: 4,
  oy: 7,
  pal: TW,
};

/** 手持道具放在地上（锚点改成底边中间）。 */
function onGround(a: PixelArt | undefined): PixelArt {
  if (!a) throw new Error('missing held art');
  return { ...a, ox: Math.floor((a.rows[0]?.length ?? 0) / 2), oy: a.rows.length - 1 };
}

export const GROUND_PROPS: Readonly<Record<string, PixelArt>> = {
  basket,
  hopper,
  cone,
  cooler,
  benchTowel,
  prizeTable,
  grill,
  patty: onGround(HELD.patty),
  burger,
  balloons,
  signBoard,
  signPost,
  whistle: onGround(HELD.whistle),
  stopwatch: onGround(HELD.stopwatch),
  clipboard,
  litter,
  leaves,
  branch,
  weeds,
  trash,
  tumbleweed0,
  tumbleweed1,
};

/** 有动画的地上道具。 */
export const GROUND_ANIMS: Readonly<Record<string, ArtAnim>> = {
  tumbleweed: { frames: [tumbleweed0, tumbleweed1], dt: 0.14 },
};

/** 默认换色。 */
export const GROUND_SLOTS: Readonly<Record<string, SlotColors>> = {
  basket: { metal: '#3a3a40' },
  hopper: { metal: '#3a3a40' },
  benchTowel: { white: '#f4f1e8' },
  prizeTable: { main: '#2f6fb8', accent: '#f2c84a' },
  balloons: { main: '#e8463d', accent: '#ffd23a', second: '#3aa0d8' },
  signBoard: { main: '#2f5a3a', wood: '#8a6a45' },
  signPost: { main: '#e9c999', wood: '#7a5a3a' },
  clipboard: { wood: '#8a6a45', metal: '#cfd3d6' },
  whistle: { metal: '#cfd3d6' },
  stopwatch: { metal: '#cfd3d6' },
};
