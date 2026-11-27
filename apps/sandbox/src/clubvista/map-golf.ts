// ════════════════════════════════════════════════════════════════════════════════════════
// I · 果岭（高尔夫：推杆果岭 + 练习打位）。死胡同图：只有北口（← 喷泉广场）。
//   竖屏一屏（拉远 1.2，≈ 21 米宽）从上到下：
//   北边两块沙丘台地（1.5 米，棕榈 + 灌木成簇）夹着一道口子 = 进来的门；口子东边一块碎石停车坪，两辆奶白条纹篷的球车，一个教练在车边装球包；
//   土路从口子出来往东南斜着弯下去，沿果岭东边走、最后拐到练习打位的凉棚；
//   中间 = 推杆果岭（比草高 0.3 的缓台，冷一档的果岭绿，这张图最大的一块安静面）：三根旗（红旗 = 这一屏唯一的暖色焦点），
//   一个人弯腰推杆、教练在旁边看、一个人拄着球包等；果岭西南、东北各一个下沉的白沙坑；
//   右下 = 练习打位：四块打位垫排成一列、朝东打向图外的练习球道（低 0.6 的条纹草坡，远处码数牌 + 靶旗），
//   垫子后面一座凉棚（长椅上两个人歇着、球包靠着、饮水桶）= 歇脚；
//   左下 = 水塘（下沉 0.5）靠着西边的沙丘，岸边石头和灌木，东岸一条长椅一个人看水；
//   南边一条矮沙丘 + 一排树 = 下沿的框。
//   层：练习球道 −0.6、水面 −0.5、沙坑 −0.3 / 草 0 / 果岭 0.3 / 沙丘台地 1.2～1.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import { blob, cluster, type MapDef, type Prop, rect, type Strip, stones, trail, type V2 } from './mapdef';

const PI = Math.PI;
const GREEN_H = 0.3;
/** 推杆果岭：不规则的圆润一块（东西 ≈ 15、南北 ≈ 10） */
const GREEN: V2[] = blob(
  9.6,
  19.2,
  7,
  5,
  16,
  [0.04, -0.05, 0.08, 0.02, -0.06, 0.05, 0.1, -0.02, 0, 0.06, -0.08, 0.03, 0.07, -0.04, 0.02, 0.05],
);
/** 水塘（西南角，贴着西边的沙丘） */
const POND: V2[] = blob(
  7.6,
  41,
  4.6,
  3.8,
  14,
  [0.05, 0.12, -0.04, 0.08, 0, -0.06, 0.1, 0.04, -0.08, 0.06, 0.02, -0.05, 0.08, 0],
);
/** 练习打位：四块垫子的中心（x 一样，朝东打） */
const MATS: V2[] = [
  [20.3, 30.6],
  [20.3, 33.9],
  [20.3, 37.2],
  [20.3, 40.5],
];
/** 练习球道（打位东边低 0.6 的草坡）的西沿 */
const RANGE_X = 22.1;
/** 领草（fringe）：果岭外一圈 0.8 米、比果岭低 0.05（第 2 轮：果岭是一块没有边框的平涂） */
const FRINGE: V2[] = blob(
  9.6,
  19.2,
  7.8,
  5.8,
  16,
  [0.04, -0.05, 0.08, 0.02, -0.06, 0.05, 0.1, -0.02, 0, 0.06, -0.08, 0.03, 0.07, -0.04, 0.02, 0.05],
);
/** 果岭面上很淡的割草条纹（顺 x，三条；只在果岭里面，两头收进果岭边） */
const MOW: Strip[] = [16.4, 18.8, 21.2].map((z, i) => {
  const hw = 5.8 * Math.sqrt(1 - ((z - 19.2) / 4) ** 2);
  return {
    id: `mow${i}`,
    pts: [
      [9.6 - hw, z],
      [9.6 + hw, z],
    ],
    w: 1.2,
    mat: 'puttStripe',
    el: 'none',
    lift: 0.008,
  };
});

const green: Prop[] = [
  // 三根旗：红的在果岭中间偏北（焦点），白、蓝两根在两头
  { a: 'golf-pin', x: 8.6, z: 17.4, v: 0, noCast: true, block: false },
  { a: 'golf-pin', x: 14.2, z: 21, v: 1, noCast: true, block: false },
  { a: 'golf-pin', x: 4.4, z: 20.8, v: 2, noCast: true, block: false },
  // 推杆的人（弯腰 ready，朝着红旗）+ 教练在后面看 + 一个人在西头拄着球包等
  { a: 'player', x: 10.6, z: 19, r: -PI * 0.65, pose: 'ready', v: 1, block: false, look: [8.6, 0.3, 17.4] },
  { a: 'coach', x: 12, z: 20.4, r: -PI * 0.7, pose: 'idle', block: false, look: [9.6, 0.3, 18.4] },
  { a: 'player', x: 6.2, z: 22.2, r: PI * 0.75, pose: 'idle', v: 3, block: false, look: [8.6, 0.3, 17.4] },
  { a: 'golf-bag', x: 5.4, z: 22.5, r: 0.4, v: 0, block: 0.3 },
  // 果岭南沿一条长椅（背对镜头、朝果岭）：一个人坐着等、球包靠在椅子东头
  { a: 'bench', x: 10.6, z: 25.4, r: PI },
  { a: 'player', x: 10.3, z: 25.4, r: PI, pose: 'sit', v: 0, block: false, look: [10, 1, 19] },
  { a: 'golf-bag', x: 11.9, z: 25.6, r: 0.2, v: 2, block: 0.3 },
];

const range: Prop[] = [
  // 四块打位垫：1、4 带球筐，2、3 只有球托
  ...MATS.map(([x, z], i): Prop => ({ a: 'golf-mat', x, z, v: i === 0 || i === 3 ? 0 : 1, block: false })),
  // 打球的人站在球的北边、脸朝镜头（打向东）
  { a: 'player', x: MATS[0][0] + 0.1, z: MATS[0][1] - 0.35, r: 0, pose: 'ready', v: 2, block: false },
  { a: 'player', x: MATS[1][0] + 0.1, z: MATS[1][1] - 0.35, r: 0, pose: 'ready', v: 0, block: false },
  { a: 'golf-bag', x: MATS[0][0] - 1.1, z: MATS[0][1] - 0.5, r: 0.3, v: 2, block: 0.3 },
  { a: 'golf-bag', x: MATS[1][0] - 1, z: MATS[1][1] - 0.6, r: -0.2, v: 1, block: 0.3 },
  { a: 'golf-bag', x: MATS[3][0] - 1, z: MATS[3][1] - 0.6, r: 0.2, v: 0, block: 0.3 },
  // 第 4 块垫子的人打完了，站着喝水看球飞
  { a: 'player', x: MATS[3][0] - 0.3, z: MATS[3][1] - 0.5, r: PI / 2, pose: 'sip', prop: 'cup', v: 3, block: false },
  // 凉棚（垫子西边）：长椅上两个人歇着，饮水桶靠着西南角，一只球包靠着东北柱
  { a: 'ramada', x: 15.1, z: 36, block: false },
  { a: 'bench', x: 14.7, z: 36.6 },
  { a: 'player', x: 14.1, z: 36.7, pose: 'sit', v: 0, block: false },
  { a: 'player', x: 15.3, z: 36.7, pose: 'sip', prop: 'cup', v: 1, block: false },
  { a: 'water-station', x: 12.9, z: 37.4, s: 0.85 },
  // 夜里的灯（第 2 轮：夜里一盏灯都没有）：凉棚东北角一盏、打位南头一盏
  { a: 'plaza-lamp', x: 17.8, z: 33.6, block: 0.3 },
  { a: 'plaza-lamp', x: 18.8, z: 42.4, block: 0.3 },
  { a: 'golf-bag', x: 16.9, z: 34.8, r: -0.3, v: 2, block: 0.3 },
  // 第三辆球车：开下来停在凉棚北边的路边
  { a: 'golf-cart', x: 19.8, z: 26.4, r: -PI / 2 + 0.25, block: 'box' },
];

const carts: Prop[] = [
  // 北口东边的碎石坪：两辆球车斜着停，教练在车尾往车上放球包
  { a: 'golf-cart', x: 19.4, z: 5, r: -0.35, block: 'box' },
  { a: 'golf-cart', x: 22, z: 7.6, r: -0.35, block: 'box' },
  { a: 'golf-bag', x: 17.6, z: 6.4, r: 0.5, v: 1, block: 0.3 },
  { a: 'coach', x: 18.2, z: 7.3, r: -PI * 0.7, pose: 'idle', block: false },
];

const pond: Prop[] = [
  // 东岸一条长椅，一个人坐着看水；长椅西北一棵树（树冠不挡长椅）
  { a: 'bench', x: 13.6, z: 41.2, r: -PI / 2 },
  { a: 'player', x: 13.6, z: 41.2, r: -PI / 2, pose: 'sit', v: 2, block: false },
  { a: 'smoke-tree', x: 9.4, z: 35.4, s: 1.05 },
  // 岸边：石头、灌木、一丛龙舌兰（成簇，留出看水的口子）
  ...cluster('rocks', 2.4, 37.6, [
    [0, 0, 1.1],
    [1.3, -0.6, 0.7],
    [-0.8, 1.2, 0.8],
  ]),
  ...cluster('rocks', 10.6, 45.4, [
    [0, 0, 0.9],
    [1.2, 0.3, 0.6],
  ]),
  ...cluster('brittlebush', 13.4, 44.2, [
    [0, 0, 0.7],
    [1.1, 0.7, 0.5],
  ]),
  ...cluster('agave', 3.6, 45.8, [
    [0, 0, 0.8],
    [1.3, 0.4, 0.6],
  ]),
];

const rangeFar: Prop[] = [
  // 练习球道（图外）：码数牌三档 + 两面靶旗 —— 远远的几点颜色
  { a: 'golf-yardage', x: 28, z: 33, v: 0 },
  { a: 'golf-yardage', x: 32.4, z: 37.6, v: 1 },
  { a: 'golf-yardage', x: 37, z: 31.6, v: 2 },
  { a: 'golf-pin', x: 30.6, z: 40.4, v: 1, noCast: true, block: false },
  { a: 'golf-pin', x: 35.4, z: 36, v: 2, noCast: true, block: false },
];

const frame: Prop[] = [
  // ── 北边两块沙丘台地（口子两边）：棕榈三种尺寸成簇、灌木沿崖沿 ──
  ...cluster('fan-palm', 6.4, -3.4, [
    [0, 0, 1.2],
    [2.6, 1.6, 0.75],
    [-2.8, 0.8, 0.95],
  ]),
  ...cluster('palo-verde', -4, -3, [
    [0, 0, 1.1],
    [-3.6, 0.8, 0.8],
  ]),
  ...cluster('creosote', 9.4, -0.4, [
    [0, 0, 0.7],
    [-1.6, 0.3, 0.55],
  ]),
  ...cluster(
    'fan-palm',
    19.6,
    -6,
    [
      [0, 0, 1.1],
      [2.8, 1, 0.7],
    ],
    { v0: 1 },
  ),
  ...cluster('smoke-tree', 27.4, -7, [
    [0, 0, 1.1],
    [3.4, 1.6, 0.85],
  ]),
  ...cluster('brittlebush', 17.6, 0, [
    [0, 0, 0.65],
    [1.2, -0.4, 0.5],
  ]),
  // ── 东边沙丘（停车坪东、果岭东北）──
  ...cluster('creosote', 28.6, 5, [
    [0, 0, 1],
    [1.8, 1.4, 0.8],
    [-0.6, 2.6, 0.7],
  ]),
  ...cluster('rocks', 27.4, 11.4, [
    [0, 0, 1.2],
    [1.4, 0.8, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    31.6,
    13.6,
    [
      [0, 0, 1.2],
      [2.4, 2.6, 0.8],
      [-1.6, 3.6, 0.65],
    ],
    { v0: 2 },
  ),
  ...cluster('palo-verde', 37.6, 6, [
    [0, 0, 1.1],
    [2.6, 4, 0.8],
  ]),
  ...cluster('ocotillo', 29.4, 19, [
    [0, 0, 0.9],
    [1.2, 0.4, 0.7],
  ]),
  // ── 西边沙丘 ──
  ...cluster('fan-palm', -5, 7.6, [
    [0, 0, 1.15],
    [2, 2.6, 0.7],
    [-2.6, 3, 0.9],
  ]),
  ...cluster('rocks', -3.2, 15, [
    [0, 0, 1.3],
    [1.4, 1.2, 0.8],
    [-1.2, 1.8, 1],
  ]),
  ...cluster('smoke-tree', -9, 19, [
    [0, 0, 1.1],
    [-1.6, 4, 0.8],
  ]),
  ...cluster('creosote', -4.2, 26, [
    [0, 0, 1],
    [1.4, 1.6, 0.7],
  ]),
  ...cluster(
    'fan-palm',
    -5.4,
    34,
    [
      [0, 0, 1.2],
      [2.2, 2.2, 0.75],
      [-2.4, 3.8, 0.9],
    ],
    { v0: 1 },
  ),
  ...cluster('brittlebush', -4, 43, [
    [0, 0, 0.9],
    [1.6, 1, 0.7],
    [-1.2, 1.6, 0.6],
  ]),
  // ── 草地上稀疏的几簇（大面别太空）──
  ...cluster('brittlebush', 2, 9.4, [
    [0, 0, 0.7],
    [1.1, 0.7, 0.5],
  ]),
  ...cluster('agave', 21.8, 22.6, [
    [0, 0, 0.8],
    [1.1, 0.8, 0.55],
  ]),
  ...cluster('creosote', 8.6, 30.6, [
    [0, 0, 0.6],
    [1.2, 0.5, 0.45],
  ]),
  ...cluster('creosote', 16.4, 25.8, [
    [0, 0, 0.65],
    [1, 0.6, 0.5],
  ]),
  ...cluster('barrel-cactus', 1.8, 30.2, [
    [0, 0, 1],
    [0.8, 0.5, 0.7],
  ]),
  // ── 练习球道两边（低处）：一棵 palo verde、一簇棕榈，压住球道的边 ──
  ...cluster('palo-verde', 41.6, 25, [
    [0, 0, 1.1],
    [-2, 3, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    41.4,
    43,
    [
      [0, 0, 1.1],
      [-2.4, 1.6, 0.75],
    ],
    { v0: 2 },
  ),
  // ── 南边矮沙丘 + 一排树（下沿的框）──
  ...cluster('smoke-tree', 4, 49.6, [
    [0, 0, 1.1],
    [-4, 1, 0.85],
  ]),
  ...cluster('fan-palm', 12.6, 50, [
    [0, 0, 1.15],
    [2.6, 1.2, 0.75],
    [-2.2, 1.6, 0.9],
  ]),
  ...cluster('palo-verde', 21, 49.6, [
    [0, 0, 1.1],
    [3.4, 1, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    29.4,
    49.2,
    [
      [0, 0, 1.2],
      [2.4, 1.6, 0.8],
    ],
    { v0: 1 },
  ),
  ...cluster('creosote', 16.8, 46.4, [
    [0, 0, 0.8],
    [1.6, 0.4, 0.6],
    [-1.4, 0.6, 0.55],
  ]),
  ...cluster('brittlebush', 20.4, 45.4, [
    [0, 0, 0.8],
    [1.2, 0.6, 0.6],
  ]),
];

export const golf: MapDef = {
  id: 'golf',
  name: '果岭',
  W: 28,
  D: 52,
  view: { x0: -15, x1: 43, z0: -2, z1: 52 },
  portraitZoom: 1.2,
  plates: [
    { id: 'ground', pts: rect(-30, -20, 60, 72), h: 0, top: 'turf', el: 'turf', wall: 'none', smooth: 0 },
    // 北口东边的碎石停车坪
    {
      id: 'cart-pad',
      pts: [
        [16.6, 2.4],
        [22.8, 3],
        [24.2, 8.6],
        [22.6, 10.2],
        [17.4, 9.6],
        [16.4, 6],
      ],
      h: 0.02,
      top: 'gravel',
      el: 'path',
      wall: 'none',
      smooth: 0.8,
    },
    // 推杆果岭：比草高 0.3 的缓台，朝镜头的一圈草坎是冷暗带
    { id: 'fringe', pts: FRINGE, h: GREEN_H - 0.05, top: 'puttFringe', el: 'none', wall: 'lawn', smooth: 0.6 },
    {
      id: 'green',
      pts: GREEN,
      h: GREEN_H,
      base: GREEN_H - 0.05,
      top: 'puttGreen',
      el: 'none',
      wall: 'lawn',
      smooth: 0.6,
    },
    // 两个沙坑（下沉 0.3，斜壁）
    {
      id: 'bunker-sw',
      pts: blob(2, 25.6, 2.1, 1.25, 12, [0.05, -0.04, 0.08, 0, -0.06, 0.04]),
      h: -0.3,
      top: 'bunker',
      el: 'floor',
      wall: 'bunker',
      smooth: 0.5,
      slope: 1,
    },
    {
      id: 'bunker-ne',
      pts: blob(15.4, 12.8, 1.8, 1.1, 12, [0.04, 0.06, -0.05, 0.02, 0.07, -0.03]),
      h: -0.3,
      top: 'bunker',
      el: 'floor',
      wall: 'bunker',
      smooth: 0.5,
      slope: 1,
    },
    // 水塘（下沉 0.5）
    { id: 'pond', pts: POND, h: -0.5, top: 'lagoon', el: 'water', wall: 'bluff', smooth: 0.8, walk: false },
    // 练习球道（打位东边，低 0.6 的草坡；图外）
    {
      id: 'range',
      pts: [
        [RANGE_X, 20.4],
        [60, 20.4],
        [60, 47.6],
        [RANGE_X + 0.4, 47.2],
        [RANGE_X - 0.2, 34],
      ],
      h: -0.6,
      top: 'lawn',
      el: 'turf',
      wall: 'lawn',
      smooth: 0.8,
    },
    // 北边两块沙丘台地（口子 x 11.4…16.6）+ 西边、东边的沙丘
    {
      id: 'dune-nw',
      pts: [
        [-30, -20],
        [11.4, -20],
        [11.4, -0.6],
        [8, 1],
        [2.4, 1.6],
        [-1, 3.6],
        [-2, 10],
        [-1.4, 20],
        [-2.6, 30],
        [-3.2, 38],
        [-2.4, 47],
        [-30, 48],
      ],
      h: 1.6,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'dune-ne',
      pts: [
        [16.6, -20],
        [60, -20],
        [60, 20.4],
        [24.8, 20.4],
        [24.6, 14],
        [25.2, 8],
        [24.4, 1.8],
        [20.4, 0.6],
        [16.6, -0.6],
      ],
      h: 1.5,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 南边矮沙丘（下沿）
    {
      id: 'dune-s',
      pts: [
        [-30, 47.6],
        [-2, 47.4],
        [6, 48.4],
        [14, 47.8],
        [22, 48.6],
        [30, 47.8],
        [60, 47.8],
        [60, 72],
        [-30, 72],
      ],
      h: 1.2,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
  ],
  strips: [
    // 主路：北口 → 斜着往东南弯 → 沿果岭东边 → 凉棚
    trail(
      'main',
      [
        [14, -4],
        [14.2, 2.6],
        [15.6, 7.4],
        [18.2, 11.8],
        [19.4, 17.4],
        [18.8, 23.6],
        [17, 28.6],
        [15.4, 33],
      ],
      1.8,
    ),
    // 支路（踏脚石）：主路 → 果岭东沿；主路 → 打位；主路 → 水塘长椅
    stones('to-green', [
      [19, 19.4],
      [16.8, 20],
    ]),
    stones('to-mats', [
      [17.4, 30],
      [18.9, 31.2],
    ]),
    stones('to-pond', [
      [16.4, 29.8],
      [13.6, 31.8],
      [11.8, 34.6],
      [12.4, 38.2],
    ]),
    ...MOW,
    // 练习球道的修剪条纹（浅一档）
    ...[23.6, 29.2, 34.8, 40.4, 46].map(
      (z, i): Strip => ({
        id: `stripe${i}`,
        pts: [
          [RANGE_X + 1, z],
          [60, z],
        ],
        w: 2.8,
        mat: 'lawnStripe',
        el: 'none',
      }),
    ),
  ],
  stairs: [],
  courts: [],
  props: [...green, ...range, ...carts, ...pond, ...rangeFar, ...frame],
  noWalk: [rect(RANGE_X - 0.6, 20, 60, 48)],
  exits: [{ to: 'plaza', entry: 'fromGolf', at: [14, -3], r: 2 }],
  entries: {
    fromPlaza: { at: [14, 1.5], yaw: 0 },
  },
  start: { at: [14, 1.5], yaw: 0 },
  clouds: [],
  shot: { port: [13.5, 24], land: [14, 24] },
  walks: [
    { name: '北口 → 果岭（推杆的人旁边）', from: [14, 1.5], to: [12.6, 22.2] },
    { name: '北口 → 打位（第 3 块垫子）', from: [14, 1.5], to: [19.5, 36.6] },
    { name: '北口 → 凉棚', from: [14, 1.5], to: [16.3, 38.4] },
    { name: '北口 → 水塘长椅', from: [14, 1.5], to: [12.8, 40.2] },
    { name: '回广场', from: [14, 4], to: [14, -3], expect: 'plaza' },
  ],
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-north', kind: 'door', at: [14, -1], yaw: 0, note: '北口（← 喷泉广场）' },
    { id: 'cart-load', kind: 'work', at: [18.6, 8.1], yaw: -PI * 0.7, note: '停车坪：往球车上装球包、开车' },
    { id: 'cart-wait', kind: 'queue', at: [16.8, 10.4], yaw: PI / 2, note: '等球车的人站这儿，往西排' },
    { id: 'green-putt', kind: 'play', at: [10.6, 19], yaw: -PI * 0.65, note: '果岭：推杆（朝红旗）' },
    { id: 'green-putt-w', kind: 'play', at: [5.6, 19.8], yaw: PI * 0.6, note: '果岭西头：推蓝旗' },
    { id: 'green-watch', kind: 'watch', at: [12.6, 22.2], yaw: -PI * 0.8, note: '果岭边站着看推杆' },
    {
      id: 'green-bench',
      kind: 'rest',
      at: [11.2, 24.7],
      yaw: PI,
      seat: 0.47,
      note: '果岭南沿长椅（朝果岭坐，前面站一步）',
    },
    { id: 'bunker-rake', kind: 'work', at: [15.4, 14.6], yaw: PI, note: '东北沙坑南沿：耙沙' },
    { id: 'mat-1', kind: 'play', at: [20.4, 30.25], yaw: 0, note: '打位 1（朝东打）' },
    { id: 'mat-2', kind: 'play', at: [20.4, 33.55], yaw: 0, note: '打位 2' },
    { id: 'mat-3', kind: 'play', at: [20.4, 36.85], yaw: 0, note: '打位 3（空着）' },
    { id: 'mat-4', kind: 'play', at: [20.4, 40.15], yaw: 0, note: '打位 4' },
    { id: 'mats-queue', kind: 'queue', at: [18.3, 31.8], yaw: PI / 2, note: '等打位的人，往西排' },
    { id: 'ramada-bench', kind: 'rest', at: [14.7, 37.3], yaw: 0, seat: 0.47, note: '凉棚长椅（前面站一步）' },
    { id: 'water', kind: 'work', at: [12.9, 38.4], yaw: PI, note: '凉棚的饮水桶（换水）' },
    { id: 'pond-bench', kind: 'rest', at: [12.9, 41.2], yaw: -PI / 2, seat: 0.47, note: '水塘东岸长椅（看水）' },
    { id: 'pond-watch', kind: 'watch', at: [11.8, 45.6], yaw: -PI * 0.75, note: '水塘东南岸站着看水' },
  ],
};
