// ════════════════════════════════════════════════════════════════════════════════════════
// C · 歇脚（第二轮：原来的"绿洲泳池"改成"入口 → 球场 → 歇脚"的终点；id 还叫 oasis，URL 不变）
//   竖屏一屏（拉远 1.15，≈ 20 米宽、x 3…23）从上到下：
//   会所后墙（白灰泥、陶土褐瓦檐，一扇拱顶后门 + 四扇拱窗 + 三角梅；屋后一排树冠）= 画面上沿的框，也是"往哪走"的终点；
//   墙脚一条花池（会所的影子落在这里）；
//   咖啡露台：西头一辆咖啡车（有人在窗口排队）、桌子 2 + 1、两种尺寸的米白伞；一个白衬衫的服务员端着托盘从后门出来；露台两边各一棵大树；
//   小泳池（8 × 6 米，下沉 0.9）：一个孩子坐在池边泡脚、一个在水里、一个站在池沿要往下跳，家长坐在躺椅上，一把粉伞（这一屏唯一的暖色焦点）；
//   左下树荫长椅：打完球的两个人坐着喝水，球拍包靠在脚边、旁边一个饮水桶 —— 从球场走过来第一眼看到的歇脚处；右下一条长椅一个人。
//   路：西南角进来（← 中心球场东口），土路沿长椅前面往东、绕过泳池东边，往北上到露台和后门。
//   边框：西东两边 1.2 米的棕榈台（三种尺寸成簇），南边一排灌木 + 棕榈。瀑布拿掉了（1× 下读成白格子）。
//   层：池水 −0.9 / 地面 0 / 露台 0.15 / 西东棕榈台 1.2 / 会所 3.4。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, trail, type V2 } from './mapdef';

const PI = Math.PI;
const WALL_Z = 5;
const PATIO_Z = 8.4;
/** 泳池（圆角长方形，8 × 6，下沉 0.9） */
const POOL: V2[] = [
  [4.8, 21.4],
  [11.4, 21.4],
  [12.2, 22.2],
  [12.2, 26.8],
  [11.4, 27.6],
  [4.8, 27.6],
  [4, 26.8],
  [4, 22.2],
];
const POOL_H = -0.9;

const house: Prop[] = [
  { a: 'back-door', x: 15.4, z: WALL_Z, block: false },
  { a: 'arch-window', x: 5.4, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 10, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 20.8, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 25.4, z: WALL_Z, y: 0.9, block: false },
  { a: 'bougainvillea', x: 13.1, z: WALL_Z + 0.15, block: false },
  { a: 'bougainvillea', x: 17.7, z: WALL_Z + 0.15, block: false },
  // 墙脚花池：树池 + 小棕榈、陶罐成对
  { a: 'tree-planter', x: 7.6, z: WALL_Z + 1.6 },
  { a: 'fan-palm', x: 7.6, z: WALL_Z + 1.6, y: 0.6, s: 0.6, v: 1, block: false },
  { a: 'tree-planter', x: 23, z: WALL_Z + 1.6 },
  { a: 'fan-palm', x: 23, z: WALL_Z + 1.6, y: 0.6, s: 0.55, v: 2, block: false },
  ...cluster('pot', 11.4, WALL_Z + 1.2, [
    [0, 0, 1],
    [0.9, 0.4, 0.75],
  ]),
  ...cluster('pot', 19.2, WALL_Z + 1.2, [
    [0, 0, 0.8],
    [0.9, -0.2, 1],
  ]),
];

const cafe: Prop[] = [
  // 咖啡车（露台西头，服务窗朝镜头）+ 窗口排队的人
  { a: 'kiosk', x: 6.4, z: 11.4, block: 'box' },
  { a: 'player', x: 6.1, z: 13.6, r: PI, pose: 'idle', v: 2 },
  { a: 'player', x: 7, z: 14.8, r: PI * 0.9, pose: 'idle', v: 1, prop: 'racket' },
  // 两张一组（大伞 + 小伞）
  { a: 'patio-table', x: 11.6, z: 11, block: 'box' },
  { a: 'parasol', x: 11.6, z: 11, v: 0, block: false },
  { a: 'player', x: 10.9, z: 11.1, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 3 },
  { a: 'player', x: 12.3, z: 11.1, r: -PI / 2, pose: 'sit', seat: [0.47, 0], v: 1 },
  { a: 'patio-table', x: 14.4, z: 14, block: 'box' },
  { a: 'parasol', x: 14.4, z: 14, v: 1, block: false },
  { a: 'coach', x: 15.1, z: 14.1, r: -PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0] },
  // 单独一张（东头）
  { a: 'patio-table', x: 21, z: 12, block: 'box' },
  { a: 'parasol', x: 21, z: 12, v: 0, block: false },
  { a: 'player', x: 20.3, z: 12.1, r: PI / 2, pose: 'sit', seat: [0.47, 0], v: 2 },
  { a: 'player', x: 21.7, z: 12.1, r: -PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 0 },
  // 服务员：白衬衫、深色长裤，端着托盘从后门出来往桌子走
  // （托盘直接摆在胸前 1.15 米高：人物的 hold 是给工具的握法，托盘端不平）
  { a: 'umpire', x: 17.8, z: 15.2, r: 0.25, pose: 'idle', v: 0 },
  { a: 'food-tray', x: 17.9, z: 15.62, y: 1.12, r: 0.25, v: 2, block: false },
  // 露台北边两个角各一棵大树（太阳在北边偏东：树影往南落在露台上，盖住约四分之一的铺地）
  { a: 'smoke-tree', x: 2.6, z: 9.6, s: 1.25 },
  { a: 'smoke-tree', x: 24, z: 9.4, s: 1.15 },
];

const pool: Prop[] = [
  // 躺椅两张（池东边，头朝北）+ 家长坐着看 + 粉伞（这一屏唯一的暖色焦点）
  { a: 'deck-lounger', x: 14, z: 24.2, block: 'box' },
  { a: 'deck-lounger', x: 15.6, z: 24.2, block: 'box' },
  { a: 'player', x: 14, z: 24.8, r: 0, pose: 'sit', seat: [0.46, 0], v: 1 },
  { a: 'umbrella-hot', x: 14.8, z: 22 },
  // 孩子：南边池沿坐着泡脚（脚伸进水里）、水里一个、站在南沿要往下跳
  { a: 'kid', x: 6.2, z: 28.1, r: PI, pose: 'sit', seat: [0.06, POOL_H + 0.4], v: 0 },
  { a: 'kid', x: 8.6, z: 24.4, y: POOL_H + 0.15, r: 0.5, pose: 'idle', v: 2, block: false },
  { a: 'kid', x: 10.6, z: 28.3, r: PI, pose: 'idle', v: 1 },
  { a: 'towel-cart', x: 2.4, z: 29.2, r: 0.4 },
];

const shade: Prop[] = [
  // 左下：树荫长椅 —— 打完球的两个人坐着喝水，球拍包斜靠在长椅西头，饮水桶贴着东头的椅脚；树在长椅东北（影子落在长椅上，树冠不挡人）
  { a: 'smoke-tree', x: 8.4, z: 34.6, s: 1.1 },
  { a: 'bench', x: 5.4, z: 37.6 },
  { a: 'player', x: 4.8, z: 37.7, pose: 'sip', prop: 'cup', v: 2, block: false },
  { a: 'player', x: 6, z: 37.7, pose: 'sit', prop: 'racket', v: 0, block: false },
  { a: 'kit-bag', x: 3.75, z: 37.75, r: PI / 2 - 0.25, v: 1 },
  { a: 'water-station', x: 7.25, z: 37.45, s: 0.85 },
];

const frame: Prop[] = [
  // 会所后面一排树（屋顶后面冒出来的树冠 = 画面上沿的框）
  ...cluster(
    'fan-palm',
    3,
    -4,
    [
      [0, 0, 1.2],
      [3, -1, 0.85],
      [-3.4, 0.4, 1],
    ],
    { v0: 0 },
  ),
  ...cluster('smoke-tree', 12.6, -5, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.85],
  ]),
  ...cluster(
    'fan-palm',
    22.6,
    -4,
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
    11,
    47.6,
    [
      [0, 0, 1.15],
      [2.6, 1.6, 0.7],
      [-2.4, 1.8, 0.85],
    ],
    { v0: 1 },
  ),
  ...cluster('agave', 17.4, 46.2, [
    [0, 0, 1.1],
    [1.6, 1.4, 0.8],
    [-1.4, 1.6, 0.6],
  ]),
  ...cluster(
    'fan-palm',
    23.4,
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
    // 池边铺地（只围着池子一圈）
    {
      id: 'pool-deck',
      pts: [
        [2.6, 20],
        [16.6, 20],
        [16.6, 26.4],
        [14.2, 29.2],
        [2.6, 29.2],
      ],
      h: 0.02,
      top: 'paving',
      el: 'none',
      wall: 'none',
      smooth: 0.6,
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
    // 咖啡露台：高 0.15 的石板台（一圈压顶的矮边）
    {
      id: 'patio',
      pts: [
        [1.8, PATIO_Z],
        [24.6, PATIO_Z],
        [24.6, 16.6],
        [19, 17.8],
        [8, 17.6],
        [1.8, 16.4],
      ],
      h: 0.15,
      top: 'paving',
      el: 'none',
      wall: 'cap',
      smooth: 0.8,
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
    // 会所（北边的框）：3.4 米高的白灰泥墙，顶上陶土褐瓦
    {
      id: 'clubhouse',
      pts: rect(-30, 1.6, 60, WALL_Z),
      h: 3.4,
      top: 'roofClay',
      el: 'none',
      wall: 'stucco',
      smooth: 0,
    },
  ],
  strips: [
    trail('main', [
      [-16, 41.8],
      [-4, 42],
      [6, 40.8],
      [14, 39.6],
      [18.6, 35.6],
      [18.8, 30],
      [18.2, 22],
      [16.2, 18.8],
    ]),
  ],
  stairs: [],
  courts: [],
  props: [...house, ...cafe, ...pool, ...shade, ...frame],
  noWalk: [rect(-30, 45, 60, 72), rect(-30, 44, -2.4, 45), rect(28, -20, 60, 72)],
  exits: [{ to: 'court', entry: 'fromOasis', at: [-12, 41.8], r: 2 }],
  entries: { fromCourt: { at: [-8, 42], yaw: PI / 2 } },
  start: { at: [-8, 42], yaw: PI / 2 },
  clouds: [],
};
