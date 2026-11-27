// ════════════════════════════════════════════════════════════════════════════════════════
// D · 练习场（真尺寸的一片场，南北向，下沉 0.9 米；北边一级石台：练习墙 + 凉棚；东边干河床 + 仙人掌丛是边界）
//   从下面上来（B 的北崖石阶），主路沿场的东沿、干河床西岸往上弯，上台阶到石台：练习墙（打墙的人）+ 凉棚（歇脚：水、球车）。
//   东沿一段台阶下到场里。层：干河床 −0.7、球场 −0.9 / 沙地 0 / 北石台 1.5 / 北崖 4.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import { band, cluster, type MapDef, rect, stones, trail, type V2, VIEW } from './mapdef';

const PI = Math.PI;

const WASH_D: V2[] = [
  [33.8, 8],
  [35.2, 18],
  [33.4, 30],
  [34.8, 42],
  [33.8, 54],
  [35.4, 76],
];
export const practice: MapDef = {
  id: 'practice',
  name: '练习场',
  W: 28,
  D: 58,
  view: VIEW(58),
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, 78), h: 0, top: 'floor', el: 'floor', wall: 'none', smooth: 0 },
    {
      id: 'wash',
      pts: band(WASH_D, [4.6, 5, 5.4, 5, 4.6, 4.6]),
      h: -1.3,
      top: 'washBed',
      el: 'wash',
      wall: 'bluff',
      smooth: 1,
      walk: false,
    },
    {
      id: 'pit',
      pts: rect(0.4, 12, 23.6, 52.8),
      h: -1.6,
      top: 'practiceOut',
      el: 'none',
      wall: 'bluff',
      smooth: 0,
      slope: 1,
    },
    // 西边乱石台（左边的框：石头、假紫荆，这张图不用棕榈）
    {
      id: 'west-rocks',
      pts: [
        [-30, 9],
        [-3, 9.4],
        [-1.4, 16],
        [-2.6, 28],
        [-1.4, 40],
        [-3.4, 54],
        [-30, 54],
      ],
      h: 1.3,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.2,
    },
    {
      id: 'shelf',
      pts: [
        [-30, -16],
        [60, -16],
        [60, 8],
        [36, 9.4],
        [28, 8.6],
        [18, 9.6],
        [8, 8.8],
        [-4, 9.6],
        [-30, 9],
      ],
      h: 1.5,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'ridge',
      pts: [
        [-30, -16],
        [60, -16],
        [60, 1.4],
        [40, 2.4],
        [28, 1.2],
        [16, 2.6],
        [4, 1.4],
        [-8, 2.4],
        [-30, 2],
      ],
      h: 4.6,
      base: 1.5,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
  ],
  strips: [
    trail('main', [
      [18, 66],
      [20, 60.6],
      [24.6, 56],
      [28.4, 50],
      [26, 43],
      [27.6, 34],
      [29.4, 27],
      [27.2, 19.6],
      [24.8, 13.6],
    ]),
    stones('shelf', [
      [24.8, 8.4],
      [22, 6.4],
      [14, 5.8],
      [6, 6.2],
    ]),
  ],
  stairs: [
    { id: 'shelf-steps', x0: 23.3, x1: 26.3, z0: 7.6, z1: 13, axis: 'z', h0: 1.5, h1: 0, kind: 'stairs' },
    {
      id: 'court-steps',
      x0: 21.2,
      x1: 25.4,
      z0: 40,
      z1: 42.8,
      axis: 'x',
      h0: -1.6,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
  ],
  courts: [{ id: 'p1', x0: 2.85, x1: 21.15, z0: 14.2, z1: 50.8, h: -1.6, axis: 'z', look: 'practice' }],
  props: [
    { a: 'net', x: 12, z: 32.5, r: PI / 2 },
    // 目的地：练习场（发球机 + 教练 + 两个学员）
    { a: 'ball-machine', x: 12, z: 18.4 },
    { a: 'coach', x: 15.4, z: 19.6, pose: 'idle', prop: 'racket' },
    { a: 'player', x: 10, z: 46.4, r: PI, pose: 'ready', prop: 'racket', v: 2 },
    { a: 'player', x: 15.6, z: 47, r: PI, pose: 'ready', prop: 'racket', v: 3 },
    { a: 'ball-cart', x: 20.4, z: 49.6 },
    // 歇脚：石台上的凉棚（水、球车）；西边一面练习墙 + 打墙的人
    { a: 'ramada', x: 16, z: 5.2 },
    { a: 'bench', x: 16, z: 5.8 },
    { a: 'water-station', x: 19.8, z: 4.8, r: -0.5 },
    { a: 'ball-cart', x: 12.4, z: 6.4, r: 0.4 },
    { a: 'hit-wall', x: 4, z: 3.6 },
    { a: 'player', x: 4.6, z: 7.4, r: PI, pose: 'ready', prop: 'racket', v: 4 },
    // 主路两个弯的内侧：一团石头 + 龙舌兰、一棵墨西哥刺木（竖屏走在路上时两边都有东西）
    ...cluster(
      'rocks',
      31,
      46.4,
      [
        [0, 0, 1.1],
        [0.6, 2.2, 0.7],
      ],
      { v0: 2 },
    ),
    ...cluster('agave', 29.8, 48.6, [[0, 0, 0.8]]),
    ...cluster('rocks', 24.8, 30.4, [[0, 0, 0.9]], { v0: 1 }),
    { a: 'ocotillo', x: 30.6, z: 20.4 },
    { a: 'brittlebush', x: 25.2, z: 24.6, v: 1 },
    // 北崖顶：假紫荆、石头、墨西哥刺木（沙漠的山）
    ...cluster(
      'palo-verde',
      -6,
      -3,
      [
        [0, 0],
        [3.4, 1.6, 0.85],
      ],
      { v0: 0 },
    ),
    { a: 'palo-verde', x: 12, z: -2.4, v: 1 },
    ...cluster(
      'palo-verde',
      30,
      -3,
      [
        [0, 0],
        [3, 1.6, 0.85],
      ],
      { v0: 1 },
    ),
    ...cluster(
      'rocks',
      6,
      -1,
      [
        [0, 0],
        [16, -0.4],
        [34, 0],
      ],
      { v0: 0 },
    ),
    { a: 'ocotillo', x: 18, z: -3 },
    { a: 'ocotillo', x: 36, z: -4 },
    // 西边（左边的框）
    ...cluster(
      'rocks',
      -4.4,
      14,
      [
        [0, 0, 1.6],
        [-2.4, 3, 1.2],
        [0.4, 6, 0.9],
      ],
      { v0: 0 },
    ),
    ...cluster(
      'palo-verde',
      -7,
      22,
      [
        [0, 0],
        [-3, 2.4, 0.8],
      ],
      { v0: 1 },
    ),
    ...cluster(
      'rocks',
      -4.6,
      32,
      [
        [0, 0, 1.4],
        [-2, 3.4, 1],
      ],
      { v0: 2 },
    ),
    { a: 'ocotillo', x: -5.6, z: 38 },
    ...cluster(
      'palo-verde',
      -6.6,
      44,
      [
        [0, 0, 0.9],
        [-2.6, 3, 1.1],
      ],
      { v0: 0 },
    ),
    { a: 'rocks', x: -1, z: 52, v: 2, s: 1.2 },
    ...cluster('creosote', -8, 50, [
      [0, 0],
      [2.6, 2, 0.8],
    ]),
    // 干河床里两块石头；河东仙人掌丛（右边的框）
    { a: 'rocks', x: 34.8, z: 20.4, v: 2, s: 0.7, y: -1.3 },
    { a: 'rocks', x: 33.8, z: 37, v: 0, s: 0.6, y: -1.3 },
    { a: 'smoke-tree', x: 38.6, z: 26.4 },
    ...cluster('cholla', 38.8, 15, [
      [0, 0],
      [2.2, 2.4, 0.8],
      [-0.6, 5, 0.7],
    ]),
    ...cluster('barrel-cactus', 41.8, 31, [
      [0, 0],
      [2, -2.4],
    ]),
    ...cluster('agave', 38.8, 40, [
      [0, 0],
      [2, 2.6, 0.8],
    ]),
    { a: 'ocotillo', x: 44, z: 36 },
    ...cluster(
      'rocks',
      45,
      20,
      [
        [0, 0],
        [-1, 26],
      ],
      { v0: 1 },
    ),
    ...cluster('creosote', 40, 52, [
      [0, 0],
      [3, 1.6, 0.8],
    ]),
    ...cluster(
      'palo-verde',
      43,
      11,
      [
        [0, 0],
        [3, 2.4, 0.85],
      ],
      { v0: 0 },
    ),
    { a: 'palo-verde', x: 41.4, z: 23, v: 1, s: 0.9 },
    { a: 'smoke-tree', x: 43, z: 46 },
    ...cluster('cholla', 40, 49.6, [
      [0, 0],
      [2, 1.4, 0.8],
    ]),
    // 南边（近处）
    ...cluster('creosote', 4, 58, [
      [0, 0],
      [3, 2, 0.8],
    ]),
    ...cluster(
      'brittlebush',
      10.4,
      57.6,
      [
        [0, 0],
        [2.6, 1.6],
        [5.6, 0.4],
      ],
      { v0: 1 },
    ),
    ...cluster('agave', 38.6, 57, [
      [0, 0],
      [2, 1.4, 0.8],
    ]),
  ],
  noWalk: [
    rect(37, -16, 60, 78),
    rect(-30, 54, -0.4, 78),
    [
      [-0.4, 56],
      [16.6, 56],
      [18.4, 78],
      [-0.4, 78],
    ],
    [
      [26.8, 56],
      [34.4, 56],
      [34.4, 78],
      [25, 78],
    ],
  ],
  exits: [{ to: 'court', entry: 'fromPractice', at: [21.4, 59.4], r: 2 }],
  entries: { fromCourt: { at: [23.4, 55.4], yaw: PI } },
  start: { at: [23.4, 55.4], yaw: PI },
  clouds: [[-8, 26, 5, 3]],
};
