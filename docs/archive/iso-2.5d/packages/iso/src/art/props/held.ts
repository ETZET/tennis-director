import type { PixelArt, SlotColors } from '../format';

/**
 * 手里拿的道具（旧版 `activities/props.ts` 的 mk* 和 `people/person.ts` 的手持开关）。
 *
 * 约定：
 * - 画法按"人脸朝镜头、右手拿着"画；朝左时整张水平翻转。
 * - 锚点 ox/oy 是握点：这个像素对准人物的 hand_r / hand_l 挂点（帽子对准 head_top，毛巾盖在头顶）。
 * - 人约 8×14 像素，所以手持道具 3–8 像素，长杆（耙子、旗、伞）可以比人高一点。
 * - 描边用 'O' 槽位；能换色的部分用槽位 M（主色）/ A（点缀）/ N（副色）/ Q（球拍）/ C（帽子），
 *   默认颜色见 HELD_SLOTS（取代旧版 mkFlag(col) 这类参数）。
 */

/* 共用的固定色 */
const WOOD = '#8a5f3a';
const WOOD_D = '#5a3b2a';
const STEEL = '#c9cccd';
const STEEL_D = '#8a9094';
const GOLD_L = '#fff2a8';
const GOLD = '#f2c84a';
const GOLD_D = '#c9962a';
const CREAM = '#f2efe6';

/** 水瓶（饮料瓶）：瓶身是 M，瓶盖白色。 */
const bottle: PixelArt = {
  rows: ['.OO.', 'O11O', 'OOOO', 'OWMO', 'OWmO', 'OMmO', 'OMmO', '.OO.'],
  ox: 1,
  oy: 5,
  pal: { '1': CREAM },
};

/** 奖杯：两只耳朵的金杯，木底座。握点在杯脚。 */
const trophy: PixelArt = {
  rows: [
    '.OOOOOOO.',
    'O3O1222O3',
    'O.O1223O.',
    '.OO1223OO',
    '..O1223O.',
    '...O23O..',
    '...O23O..',
    '..O4445O.',
    '..OOOOOO.',
  ],
  ox: 4,
  oy: 6,
  pal: { '1': GOLD_L, '2': GOLD, '3': GOLD_D, '4': '#7a5232', '5': '#4a321c' },
};

/** 烤肉铲：铲面朝上。 */
const spatula: PixelArt = {
  rows: ['OOOO', 'O11O', 'O12O', 'OOOO', '.3O.', '.3O.', '.3O.', '.OO.'],
  ox: 1,
  oy: 6,
  pal: { '1': STEEL, '2': STEEL_D, '3': WOOD_D },
};

/** 喇叭：喇叭口朝前（右），喇叭口是 M。 */
const megaphone: PixelArt = {
  rows: ['.....OO', '...OOMO', 'OOOMMMO', 'O11MMMO', 'OOOmmmO', '.O9OOmO', '.OOO.OO'],
  ox: 2,
  oy: 5,
  pal: { '1': '#e8e2d0', '9': '#3a3a44' },
};

/** 相机：黑机身，镜头朝前。 */
const camera: PixelArt = {
  rows: ['.OO....', 'O55OOOO', 'O22222O', 'O2OOO2O', 'O2O43OO', 'O2OOO2O', 'OOOOOOO'],
  ox: 1,
  oy: 5,
  pal: { '2': '#3a3a44', '3': '#2a5a7a', '4': '#9fe3ff', '5': '#e8e2d0' },
};

/** 托着的盘子，上面一个汉堡。握点在盘底中间。 */
const plate: PixelArt = {
  rows: ['..OOO..', '.O999O.', '.O666O.', '.O888O.', 'OWWWWWO', '.OOOOO.'],
  ox: 3,
  oy: 5,
  pal: { '9': '#e8b04a', '6': '#6aa84a', '8': '#8a4f2a' },
};

/** 旗子：白杆，旗面 M，中间一道 A。 */
const flag: PixelArt = {
  rows: [
    '.O.....',
    'O1OOOOO',
    'O1MMMMO',
    'O1AAAAO',
    'O1MMMmO',
    'O1OOOOO',
    'O1O....',
    'O1O....',
    'O1O....',
    'O1O....',
    '.O.....',
  ],
  ox: 1,
  oy: 8,
  pal: { '1': '#e8e2d0' },
};

/** 伞：举在头顶，伞面 M 带白条，握点在伞柄。 */
const umbrella: PixelArt = {
  rows: [
    '.....OOO.....',
    '...OOWMWOO...',
    '..OMWWMWWMO..',
    '.OMMWWMWWMMO.',
    'OMMWWWMWWWMMO',
    'OmmWWwmwWWmmO',
    '.OO.OO1OO.OO.',
    '......1......',
    '......1......',
    '......1......',
    '......1......',
    '.....O1......',
    '.....OO......',
  ],
  ox: 6,
  oy: 10,
  pal: { '1': '#4a4450' },
};

/** 耙子：长木柄，耙头在下面（D 木头、G 金属）。 */
const rake: PixelArt = {
  rows: [
    '.OOO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    '.ODO.',
    'OOOOO',
    'OGGGO',
    'OGOGO',
    '.O.O.',
  ],
  ox: 2,
  oy: 5,
};

/** 抱在胸前的一捆树枝（清理活动）。握点在中间，两只手都对着它。 */
const bundle: PixelArt = {
  rows: ['.OOOOOO66.', 'O44544O766', 'O54445444O', '.OOOOOOOO.'],
  ox: 4,
  oy: 2,
  pal: { '4': '#6a4a32', '5': '#4a3020', '6': '#6aa84a', '7': '#4a7a32' },
};

/** 抱着的纸箱（PersonOptions.box）：箱口露出一个灰色的东西。 */
const box: PixelArt = {
  rows: ['...OO..', '.OO99O.', 'O11111O', 'O22322O', 'O22222O', 'O22222O', 'OOOOOOO'],
  ox: 3,
  oy: 4,
  pal: { '9': '#cfd3d6', '1': '#c9b083', '2': '#a9824f', '3': '#8a6a3a' },
};

/** 帽子（mkCap）：戴在头上，锚点是帽子底边中间，对准 head_top；帽檐朝前（右）。 */
const cap: PixelArt = {
  rows: ['.OOOO...', 'OCWCCO..', 'OCCCCOO.', 'OccccccO', '.OOOOOO.'],
  ox: 3,
  oy: 4,
};

/** 手机（PersonOptions.phone）。 */
const phone: PixelArt = {
  rows: ['OOO', 'O7O', 'O7O', 'OOO'],
  ox: 1,
  oy: 3,
  pal: { '7': '#8fc8ee' },
};

/** 夹板（PersonOptions.clipboard）：木板、白纸、金属夹。 */
const clipboard: PixelArt = {
  rows: ['.OGO.', 'ODGDO', 'OWWWO', 'OW8WO', 'OWW8O', 'OW8WO', 'OOOOO'],
  ox: 1,
  oy: 4,
  pal: { '8': '#9a9488' },
};

/** 解雇信（Person.slip）：粉色的纸。 */
const slip: PixelArt = {
  rows: ['OOOO', 'O11O', 'O22O', 'O11O', 'O21O', 'OOOO'],
  ox: 1,
  oy: 4,
  pal: { '1': '#ef9cc0', '2': '#c46a90' },
};

/** 匹克球拍（PersonOptions.paddle）：拍面 M。 */
const paddle: PixelArt = {
  rows: ['.OO.', 'OMMO', 'OMMO', 'OMmO', 'OmmO', '.OO.', '.9O.', '.9O.', '.OO.'],
  ox: 1,
  oy: 6,
  pal: { '9': '#2a2a2e' },
};

/** 网球拍：框是 Q，拍线浅色。人物精灵自己画拍子时不用它，备演出里单独拿着拍子的场合。 */
const racket: PixelArt = {
  rows: ['..OOO..', '.OQQQO.', 'OQ111QO', 'OQ111QO', 'OQ111QO', '.OQQQO.', '..OQO..', '..O9O..', '..O9O..', '...O...'],
  ox: 3,
  oy: 8,
  pal: { '1': '#f4f1e4', '9': '#2a2a2e' },
};

/** 毛巾（overlay 'towel'）：盖在头上，后面垂下来；锚点对准 head_top。 */
const towel: PixelArt = {
  rows: ['..OOOO..', '.OWWWWO.', 'OWWWWWwO', 'OWOOOOwO', 'OWO..OwO', 'OWO..OwO', 'OwO..OwO', '.O....O.'],
  ox: 4,
  oy: 1,
};

/** 哨子：挂在嘴边或握在手里。 */
const whistle: PixelArt = {
  rows: ['.OOOO', 'O11GO', 'O1GGO', '.OOO.'],
  ox: 1,
  oy: 2,
  pal: { '1': '#e05a3a' },
};

/** 秒表。 */
const stopwatch: PixelArt = {
  rows: ['..O..', '.OGO.', 'OWWWO', 'OW1WO', 'OWW2O', '.OOO.'],
  ox: 2,
  oy: 4,
  pal: { '1': '#2a2238', '2': '#e05a3a' },
};

/** 飞盘（烧烤活动）：M。 */
const frisbee: PixelArt = {
  rows: ['.OOOO.', 'OMWMMO', 'OmmmmO', '.OOOO.'],
  ox: 2,
  oy: 2,
};

/** 水球（热天的水球大战）：M 是气球颜色。 */
const waterBalloon: PixelArt = {
  rows: ['.OO.', 'OWMO', 'OMmO', '.OO.', '..O.'],
  ox: 2,
  oy: 4,
};

/** 气球（集市）：一根绳，握点在绳子底端。 */
const balloon: PixelArt = {
  rows: ['.OOO.', 'OWMMO', 'OMMmO', 'OMmmO', '.OOO.', '..O..', '..1..', '...1.', '..1..', '..1..'],
  ox: 2,
  oy: 9,
  pal: { '1': '#e8e2d0' },
};

/** 一瓶冰水 / 运动饮料（喂球、短跑后喝的）：和 bottle 同形，单独给一个键好换色。 */
const drink: PixelArt = { ...bottle };

/** 球（手里托着的一颗网球，抛球前）。 */
const ball: PixelArt = {
  rows: ['.O.', 'O1O', '.O.'],
  ox: 1,
  oy: 1,
  pal: { '1': '#d7e64a' },
};

/** 汉堡肉饼（铲子上的那块，或被乌鸦叼走的那块）。 */
const patty: PixelArt = {
  rows: ['.OOO.', 'O888O', 'O999O', '.OOO.'],
  ox: 2,
  oy: 2,
  pal: { '8': '#8a4f2a', '9': '#5a3018' },
};

export const HELD: Readonly<Record<string, PixelArt>> = {
  bottle,
  drink,
  trophy,
  spatula,
  megaphone,
  camera,
  plate,
  flag,
  umbrella,
  rake,
  bundle,
  box,
  cap,
  phone,
  clipboard,
  slip,
  paddle,
  racket,
  towel,
  whistle,
  stopwatch,
  frisbee,
  waterBalloon,
  balloon,
  ball,
  patty,
};

/** 各道具的默认换色（旧版 mk* 的默认颜色）；演出可以覆盖，比如 flag 的 main 换成队色。 */
export const HELD_SLOTS: Readonly<Record<string, SlotColors>> = {
  bottle: { main: '#3aa0d8' },
  drink: { main: '#e8603a' },
  megaphone: { main: '#e05a3a' },
  flag: { main: '#e05a3a', accent: '#f6f3ea' },
  umbrella: { main: '#e05a3a' },
  rake: { wood: '#8a6a45', metal: '#5a5f63' },
  cap: { cap: '#2f7fd8' },
  clipboard: { wood: WOOD, metal: '#cfd3d6' },
  paddle: { main: '#3fb37f' },
  racket: { racket: '#e05a3a' },
  whistle: { metal: '#cfd3d6' },
  stopwatch: { metal: '#cfd3d6' },
  frisbee: { main: '#ffd23a' },
  waterBalloon: { main: '#5ab8f0' },
  balloon: { main: '#e8463d' },
};
