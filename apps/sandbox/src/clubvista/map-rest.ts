// ════════════════════════════════════════════════════════════════════════════════════════
// C · 歇脚（泳池）。id 还叫 oasis，URL 不变。
// 第三轮第 2 版（world 评判：歇脚和喷泉广场的上半屏是同一面会所立面 + 各一辆餐车 + 白伞，走过去像原地打转）：
//   会所正面只留在广场；这里北边换成泳池的更衣棚（一排矮木屋 + 木平台 + 两张遮阳帆），咖啡车拿掉，泳池放大 1.5 倍放到画面中间。
//   竖屏一屏（拉远 1.15，≈ 20 米宽）从上到下：
//   更衣棚（2.6 米高的木板墙、平的木屋顶，中间一扇绿漆的双开玻璃门 → 会所大堂）= 画面上沿的框；屋后一排树冠；
//   木平台：西头两张蓝白伞的小桌（打完球的人喝东西，一个服务员端托盘），门东边毛巾车，两张遮阳帆的影子落在平台上；
//   泳池（12 × 9 米，下沉 0.9，这张图的焦点）：南沿一个孩子坐着泡脚、水里一个、西沿一个要往下跳；
//     东边三张蓝垫躺椅 + 一把粉伞（这一屏唯一的暖色焦点），家长躺着看；救生员站在东南角；
//   下半屏：左边树荫长椅（打完球的两个人坐着喝水）；右边一簇棕榈 + 两张白躺椅，一个人在晒太阳。
//   路：西南角进来（← 中心球场东口），土路沿长椅前面往北、贴着泳池西边上到木平台和门。
//   边框：西东两边 1.2 米的棕榈台（三种尺寸成簇），南边一排灌木 + 棕榈。
//   层：池水 −0.9 / 地面 0 / 池边石、木平台 0.02～0.15 / 西东棕榈台 1.2 / 更衣棚 2.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, trail, type V2 } from './mapdef';

const PI = Math.PI;
const WALL_Z = 5;
const DECK_Z = 9.6;
/** 泳池（圆角长方形，12 × 9，下沉 0.9） */
const POOL: V2[] = [
  [9.2, 17.6],
  [18.8, 17.6],
  [20, 18.8],
  [20, 25.4],
  [18.8, 26.6],
  [9.2, 26.6],
  [8, 25.4],
  [8, 18.8],
];
const POOL_H = -0.9;

const cabana: Prop[] = [
  // 更衣棚中间的门（绿漆双开玻璃门）→ 会所大堂
  { a: 'arch-window', x: 14, z: WALL_Z, y: 0.15, v: 1, block: false },
  // 两张遮阳帆（影子落在平台上）
  { a: 'shade-sail', x: 6.4, z: 7.4, block: false },
  { a: 'shade-sail', x: 21.8, z: 7.2, r: 0.2, block: false },
  // 门东边：毛巾车 + 陶罐
  { a: 'towel-cart', x: 17, z: 6.4, r: -0.2 },
  ...cluster('pot', 11.6, WALL_Z + 0.8, [
    [0, 0, 1],
    [0.8, 0.3, 0.7],
  ]),
  // 西头两张小桌（蓝白伞，和广场的米白伞分开）
  { a: 'patio-table', x: 4.4, z: 7.8, block: 'box' },
  { a: 'patio-umbrella', x: 4.4, z: 7.8, block: false },
  { a: 'player', x: 3.7, z: 7.9, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 3 },
  { a: 'player', x: 5.1, z: 7.9, r: -PI / 2, pose: 'sit', seat: [0.47, 0], v: 1 },
  { a: 'patio-table', x: 8.4, z: 8.2, block: 'box' },
  { a: 'coach', x: 9.1, z: 8.3, r: -PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0] },
  // 服务员：白衬衫，端着托盘从门里出来往桌子走
  { a: 'umpire', x: 11.6, z: 8.4, r: -1.2, pose: 'idle', v: 0 },
  { a: 'food-tray', x: 11.2, z: 8.55, y: 1.12, r: -1.2, v: 2, block: false },
];

const pool: Prop[] = [
  // 东边三张蓝垫躺椅（头朝北）+ 粉伞（这一屏唯一的暖色焦点），家长坐着看
  { a: 'deck-lounger', x: 21.8, z: 21.4, block: 'box' },
  { a: 'deck-lounger', x: 23.2, z: 21.4, block: 'box' },
  { a: 'deck-lounger', x: 24.6, z: 21.6, block: 'box' },
  { a: 'player', x: 23.2, z: 22, r: 0, pose: 'sit', seat: [0.46, 0], v: 1 },
  { a: 'umbrella-hot', x: 22.5, z: 18.4 },
  // 孩子：南沿坐着泡脚、水里一个、西沿站着要往下跳
  { a: 'kid', x: 11.4, z: 27.1, r: PI, pose: 'sit', seat: [0.06, POOL_H + 0.4], v: 0 },
  { a: 'kid', x: 14.6, z: 21.6, y: POOL_H + 0.15, r: 0.5, pose: 'idle', v: 2, block: false },
  { a: 'kid', x: 7.5, z: 21.4, r: PI / 2, pose: 'idle', v: 1 },
  // 救生员：东南角站着（白衬衫），旁边一只饮水桶
  { a: 'umpire', x: 21, z: 27.6, r: PI + 0.6, pose: 'idle', v: 1 },
  { a: 'water-station', x: 22.4, z: 28.2, s: 0.85 },
];

const lawn: Prop[] = [
  // 左下：树荫长椅 —— 打完球的两个人坐着喝水，球拍包斜靠在长椅西头，饮水桶贴着东头的椅脚
  { a: 'smoke-tree', x: 9, z: 34.4, s: 1.15 },
  { a: 'bench', x: 8.2, z: 38.6 },
  { a: 'player', x: 7.6, z: 38.7, pose: 'sip', prop: 'cup', v: 2, block: false },
  { a: 'player', x: 8.8, z: 38.7, pose: 'sit', prop: 'racket', v: 0, block: false },
  { a: 'kit-bag', x: 6.55, z: 38.75, r: PI / 2 - 0.25, v: 0 },
  // 右下：一簇棕榈（大中小）+ 两张白躺椅，一个人在晒太阳
  ...cluster(
    'fan-palm',
    22.6,
    34.2,
    [
      [0, 0, 1.15],
      [2.4, 1.6, 0.75],
      [-1.6, 2.6, 0.6],
    ],
    { v0: 1 },
  ),
  { a: 'lounger', x: 17.6, z: 38.8, block: 'box' },
  { a: 'lounger', x: 19.2, z: 39, block: 'box' },
  { a: 'player', x: 19.2, z: 39.4, r: 0, pose: 'sit', seat: [0.45, 0], v: 4 },
  { a: 'towel-cart', x: 21.4, z: 39.6, r: 0.5 },
];

const frame: Prop[] = [
  // 草地上稀疏的几簇灌木
  ...cluster('brittlebush', 1.6, 31.4, [
    [0, 0, 0.7],
    [1.2, 0.8, 0.5],
    [-0.6, 1.2, 0.45],
  ]),
  ...cluster('agave', 25.4, 29.4, [
    [0, 0, 0.8],
    [1.1, 0.8, 0.55],
  ]),
  ...cluster('creosote', 13.4, 44, [
    [0, 0, 0.6],
    [1.4, 0.4, 0.45],
  ]),
  // 更衣棚后面一排树（屋顶后面冒出来的树冠）
  ...cluster('fan-palm', 3, -3.4, [
    [0, 0, 1.2],
    [3, -1, 0.85],
    [-3.4, 0.4, 1],
  ]),
  ...cluster('smoke-tree', 12.6, -4.4, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.85],
  ]),
  ...cluster(
    'fan-palm',
    22.6,
    -3.4,
    [
      [0, 0, 1.15],
      [3.2, -1, 0.75],
      [6, 0.2, 0.95],
    ],
    { v0: 1 },
  ),
  ...cluster('palo-verde', -9, -4, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.8],
  ]),
  ...cluster('palo-verde', 36, -4, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.8],
  ]),
  // 西边棕榈台
  ...cluster('fan-palm', -4, 10, [
    [0, 0, 1.2],
    [2.2, 2.6, 0.7],
    [-2.6, 3.2, 0.9],
  ]),
  ...cluster(
    'fan-palm',
    -4.4,
    24,
    [
      [0, 0, 0.9],
      [1.8, 2.6, 1.2],
      [-2.4, 4.4, 0.65],
    ],
    { v0: 1 },
  ),
  ...cluster('smoke-tree', -10, 17, [
    [0, 0, 1.1],
    [-1.6, 4, 0.8],
  ]),
  ...cluster('rocks', -3.4, 33, [
    [0, 0, 1.3],
    [1.6, 1.2, 0.8],
    [-1.4, 1.8, 1],
  ]),
  // 东边棕榈台
  ...cluster(
    'fan-palm',
    31.4,
    12,
    [
      [0, 0, 1.15],
      [2.6, 2.2, 0.75],
    ],
    { v0: 2 },
  ),
  ...cluster(
    'fan-palm',
    31.6,
    28,
    [
      [0, 0, 1.2],
      [-0.4, 3.8, 0.7],
      [2.6, 1.4, 0.9],
    ],
    { v0: 0 },
  ),
  ...cluster('palo-verde', 38, 20, [
    [0, 0, 1.1],
    [2.6, 3.4, 0.8],
  ]),
  ...cluster('creosote', 30.6, 38, [
    [0, 0, 1],
    [2, 1.6, 0.8],
    [-1.4, 2.6, 0.7],
  ]),
  // 南边（近处）：灌木 + 棕榈，连成一条带（入口那边空着）
  ...cluster('brittlebush', 3, 46.4, [
    [0, 0, 1],
    [2.2, 1, 0.8],
    [-1.8, 1.4, 0.7],
    [4.2, 0.2, 0.9],
  ]),
  ...cluster(
    'fan-palm',
    14.6,
    49.4,
    [
      [0, 0, 0.95],
      [2.6, 1.2, 0.65],
      [-2.2, 1.6, 0.75],
    ],
    { v0: 1 },
  ),
  ...cluster('agave', 18.4, 46.2, [
    [0, 0, 1.1],
    [1.6, 1.4, 0.8],
    [-1.4, 1.6, 0.6],
  ]),
  ...cluster(
    'fan-palm',
    24.4,
    47,
    [
      [0, 0, 1.2],
      [2.4, 2.4, 0.8],
      [-2.2, 2.6, 0.6],
    ],
    { v0: 2 },
  ),
  ...cluster('creosote', 7, 51, [
    [0, 0, 1],
    [3, 0.6, 0.8],
    [8, 0, 0.9],
    [12.6, 0.8, 0.8],
  ]),
];

export const rest: MapDef = {
  id: 'oasis',
  name: '歇脚',
  W: 28,
  D: 48,
  view: { x0: -15, x1: 43, z0: -1.5, z1: 50 },
  portraitZoom: 1.15,
  plates: [
    { id: 'ground', pts: rect(-30, -20, 60, 72), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 },
    // 池边一圈浅米石（东边宽出来放躺椅）
    {
      id: 'pool-deck',
      pts: [
        [5.8, 15.4],
        [25.6, 15.4],
        [25.6, 29.4],
        [5.8, 29.4],
      ],
      h: 0.02,
      top: 'poolStone',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    {
      id: 'pool',
      pts: POOL,
      h: POOL_H,
      base: 0.02,
      top: 'lagoon',
      el: 'water',
      wall: 'curb',
      smooth: 0.5,
      walk: false,
      rim: 0.4,
    },
    // 更衣棚前的木平台（高 0.15）
    {
      id: 'boardwalk',
      pts: rect(1.6, WALL_Z, 26.4, DECK_Z),
      h: 0.15,
      top: 'woodWeathered',
      el: 'none',
      wall: 'wood',
      smooth: 0,
    },
    // 西东两边的棕榈台
    {
      id: 'west-terrace',
      pts: [
        [-30, WALL_Z],
        [-1.6, WALL_Z],
        [-1.2, 16],
        [-2.2, 28],
        [-1.6, 37],
        [-30, 38],
      ],
      h: 1.2,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'east-terrace',
      pts: [
        [28, WALL_Z],
        [60, WALL_Z],
        [60, 60],
        [28.6, 44],
        [27.6, 28],
      ],
      h: 1.2,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 更衣棚（北边的框）：2.6 米高的木板墙，平的木屋顶
    {
      id: 'cabana',
      pts: rect(-30, 1.6, 60, WALL_Z),
      h: 2.6,
      top: 'timber',
      el: 'none',
      wall: 'timber',
      smooth: 0,
    },
  ],
  strips: [
    // 小路：浅一档的灰沙，贴着泳池西边上到木平台
    {
      ...trail(
        'main',
        [
          [-16, 41.8],
          [-4, 42],
          [3.4, 41],
          [4.4, 34],
          [3.6, 24],
          [4.4, 14],
          [9, 10.6],
          [13.4, 9.8],
        ],
        1.4,
      ),
      mat: 'gravel',
      el: 'none',
    },
  ],
  stairs: [],
  courts: [],
  props: [...cabana, ...pool, ...lawn, ...frame],
  noWalk: [rect(-30, 45, 60, 72), rect(-30, 44, -2.4, 45), rect(28, -20, 60, 72)],
  exits: [
    { to: 'court', entry: 'fromOasis', at: [-12, 41.8], r: 2 },
    // 更衣棚的门 → 会所大堂
    { to: 'lobby', entry: 'fromOasis', at: [14, 5.7], r: 0.9 },
  ],
  entries: { fromCourt: { at: [-8, 42], yaw: PI / 2 }, fromLobby: { at: [14, 8.2], yaw: 0 } },
  start: { at: [-8, 42], yaw: PI / 2 },
  clouds: [],
  shot: { port: [14, 24], land: [14, 22] },
  spots: [
    { id: 'door-west', kind: 'door', at: [-8, 42], yaw: PI / 2, note: '西口（← 中心球场）' },
    { id: 'door-north', kind: 'door', at: [14, 7.4], yaw: 0, note: '更衣棚的门（→ 会所大堂）' },
    { id: 'pool-rim-s', kind: 'rest', at: [13.4, 27.4], yaw: PI, seat: 0.06, note: '池南沿坐着泡脚' },
    { id: 'pool-watch', kind: 'watch', at: [6.8, 23.4], yaw: PI / 2, note: '池西边站着看' },
    { id: 'lifeguard', kind: 'work', at: [21, 27.6], yaw: PI + 0.6, note: '救生员' },
    { id: 'lounger-1', kind: 'rest', at: [21.8, 22], yaw: 0, seat: 0.46, note: '池边躺椅' },
    { id: 'lounger-3', kind: 'rest', at: [24.6, 22.2], yaw: 0, seat: 0.46, note: '池边躺椅' },
    { id: 'towel-cart', kind: 'work', at: [17, 7.6], yaw: PI, note: '毛巾车（总监补毛巾）' },
    { id: 'table-w', kind: 'rest', at: [3.7, 7.9], yaw: PI / 2, seat: 0.47, note: '平台西头的小桌' },
    { id: 'table-2', kind: 'rest', at: [7.7, 8.3], yaw: PI / 2, seat: 0.47, note: '平台的第二张小桌' },
    { id: 'bench-shade', kind: 'rest', at: [8.2, 38.9], yaw: 0, seat: 0.46, note: '树荫长椅' },
    { id: 'sun-lounger', kind: 'rest', at: [17.6, 39.2], yaw: 0, seat: 0.45, note: '草地上的白躺椅' },
  ],
  walks: [
    { name: '西口 → 池边', from: [-8, 42], to: [6.8, 23.4] },
    { name: '西口 → 树荫长椅', from: [-8, 42], to: [7.4, 40] },
    { name: '西口 → 池东躺椅', from: [-8, 42], to: [22.4, 23.6] },
    { name: '西口 → 后门（→ 大堂）', from: [-8, 42], to: [14, 5.9], expect: 'lobby' },
    { name: '后门 → 西口（→ 球场）', from: [14, 8.2], to: [-12.6, 41.8], expect: 'court' },
  ],
};
