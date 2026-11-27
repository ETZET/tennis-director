// ════════════════════════════════════════════════════════════════════════════════════════
// D · 练习场（第三轮换主题："练习墙 + 发球机 + 一筐筐球" —— 一个人来练球的地方；不再放一整块真尺寸的场）
//   竖屏一屏（拉远 1.1）从上到下：
//   北崖（4.6）= 画面上沿的框；北石台（1.5）上一座凉棚 = 歇脚 + 练球的后勤（长椅、饮水站、成堆的球车 / 球筐 / 捡球器）；
//   石台下面一个下沉 0.8 的绿土坑：两面练习墙（9 米一段，一条网高的白线 + 靶框）靠着石台的崖脚，墙前两格半片场
//   （只有一侧的发球线和底线），每格一个人对墙打、脚边一筐球 —— 焦点；
//   中段（第 3 轮）：东边（竖屏右下）一条下沉 0.4 的发球机道（6.4 × 22.8 米，浅青铺面 + 白线，中间一张矮网；
//   北头一台放大的发球机 + 四个大小不一的球筐扎成一簇，南头一个人接、脚前一片散球，教练站在道边）；
//   西边是沙地上成簇的石头、灌木、假紫荆（左边的框往里收）。再往东是主路和干河床。
//   路：南口进来（← 中心球场），主路沿沙地东沿、干河床西岸往上弯，经过练习墙坑的东台阶，上北石台的台阶到凉棚。
//   边框：西边乱石台（石头、假紫荆）、东边干河床 + 仙人掌丛、北崖顶的树和石头、南边一排灌木。
//   层：墙坑 −0.8 / 发球机道 −0.4 / 干河床 −1.3 / 地面 0 / 西石台 1.3 / 北石台 1.5 / 北崖 4.6。
// ════════════════════════════════════════════════════════════════════════════════════════
import {
  band,
  cluster,
  type ElKey,
  type MapDef,
  type Prop,
  rect,
  type Strip,
  stones,
  trail,
  type V2,
  VIEW,
} from './mapdef';

const PI = Math.PI;

const WASH_D: V2[] = [
  [33.8, 8],
  [35.2, 18],
  [33.4, 30],
  [34.8, 42],
  [33.8, 54],
  [35.4, 76],
];

/** 练习墙坑：下沉 0.8；两格半片场的中线 x、墙脚 z、发球线 z、底线 z */
const PIT_H = -0.8;
const CELLS = [5.8, 15.7];
const WALL_Z = 10.8;
const SERVE_Z = 17.3;
const BASE_Z = 22.9;
/** 发球机道：下沉 0.4（竖屏右下）；浅米色胶面、灰石外圈；南头一张挡网 */
const LANE_H = -0.4;
const LANE = { x0: 13, x1: 19.4, z0: 30.6, z1: 53.4, base: 50.4, serve: 46 };

/**
 * 场面用旧了的刷漆斑（palette 的 EL.courtWear，球场 look: 'practice' 用的同一个）：台面的 el 只列了地形的几种，
 * 这里借 courtWear 的键 —— 平涂的绿土大面会让平静纹素冲到 85%。
 */
const WEAR: ElKey = 'courtWear';

/** 一条白线（地上的细带子） */
const line = (id: string, pts: V2[]): Strip => ({ id, pts, w: 0.1, mat: 'line', el: 'none', lift: 0.02 });

const cellLines: Strip[] = CELLS.flatMap((cx, i) => [
  line(`cell${i}-l`, [
    [cx - 4.1, WALL_Z + 0.95],
    [cx - 4.1, BASE_Z],
  ]),
  line(`cell${i}-r`, [
    [cx + 4.1, WALL_Z + 0.95],
    [cx + 4.1, BASE_Z],
  ]),
  line(`cell${i}-base`, [
    [cx - 4.1, BASE_Z],
    [cx + 4.1, BASE_Z],
  ]),
  line(`cell${i}-serve`, [
    [cx - 4.1, SERVE_Z],
    [cx + 4.1, SERVE_Z],
  ]),
  line(`cell${i}-mid`, [
    [cx, WALL_Z + 0.95],
    [cx, SERVE_Z],
  ]),
]);

const laneLines: Strip[] = [
  line('lane-serve', [
    [LANE.x0 + 0.2, LANE.serve],
    [LANE.x1 - 0.2, LANE.serve],
  ]),
];

/** 焦点：两面练习墙，每格一个人对墙打，脚边一筐球 */
const walls: Prop[] = [
  { a: 'practice-wall', x: CELLS[0], z: WALL_Z, block: 'box' },
  { a: 'practice-wall', x: CELLS[1], z: WALL_Z, block: 'box' },
  // 西格：正手，满筐在右后方
  { a: 'player', x: 6.6, z: 20.8, r: PI, pose: 'forehand', prop: 'racket', v: 2 },
  { a: 'practice:hopper', x: 8.8, z: 22.4, v: 1 },
  { a: 'practice:balls', x: 5.2, z: 14.2, v: 1, s: 0.8, block: false },
  // 东格：反手；筐翻了，球滚出一串；地上一撮
  { a: 'player', x: 15, z: 19.8, r: PI, pose: 'backhand', prop: 'racket', v: 4 },
  { a: 'practice:hopper', x: 18.2, z: 23.2, r: -0.5, v: 0 },
  { a: 'practice:balls', x: 17.6, z: 15.4, v: 1, s: 0.7, block: false },
];

/** 发球机道：北头发球机 + 球筐，南头一个人接；地上散着球；教练在道边看、记数 */
const lane: Prop[] = [
  // 北头：放大的发球机（朝南喂球），四个大小不一的球筐扎成一簇，机脚一撮球
  { a: 'ball-machine', x: 16.2, z: 33.4, s: 1.9 },
  ...cluster(
    'practice:hopper',
    18.3,
    32.4,
    [
      [0, 0, 1.3],
      [0.1, 1.2, 1],
      [-0.9, 0.7, 0.8],
      [-0.2, 2.2, 1.1],
    ],
    { v0: 1, nv: 1 },
  ),
  { a: 'practice:balls', x: 15.4, z: 35.6, v: 1, s: 0.7, block: false },
  // 网挪到道的南头当挡网（横在中间读成一块场）；落点区一扇形的散球
  { a: 'practice:net', x: 16.2, z: LANE.z1 - 0.5, r: PI / 2 },
  { a: 'practice:balls', x: 17.4, z: 44.2, v: 1, s: 1.2, block: false },
  { a: 'practice:balls', x: 15, z: 45.4, v: 1, s: 1, block: false },
  { a: 'practice:balls', x: 18.2, z: 47.4, v: 1, s: 0.9, block: false },
  // 南头一个人接；脚前一大片散球；教练站在道边看、记数
  { a: 'player', x: 15.6, z: 51.2, r: PI, pose: 'forehand', prop: 'racket', v: 3 },
  { a: 'practice:balls', x: 16.4, z: 47.6, v: 1, s: 1.4, block: false },
  { a: 'practice:balls', x: 14.2, z: 49.6, v: 1, s: 0.8, block: false },
  { a: 'coach', x: 19.6, z: 48.2, r: -PI / 2, pose: 'idle', prop: 'racket' },
];

/** 歇脚 + 后勤：北石台上的凉棚（长椅、饮水站），旁边成堆的球车、球筐、捡球器 */
const ramada: Prop[] = [
  { a: 'ramada', x: 15.4, z: 5.2 },
  { a: 'bench', x: 15.4, z: 5.8 },
  { a: 'player', x: 14.8, z: 5.9, r: 0, pose: 'sip', prop: 'cup', seat: [0.45, 0], v: 1 },
  { a: 'water-station', x: 19, z: 4.8, r: -0.5 },
  { a: 'towel-cart', x: 19.6, z: 6.8, r: -0.3 },
  // 后勤堆（凉棚西边）：一辆球车、两个满筐、一支捡球器靠着
  { a: 'ball-cart', x: 11, z: 5.4, r: 0.3 },
  { a: 'practice:hopper', x: 9.2, z: 5, v: 1, s: 1.15 },
  { a: 'practice:hopper', x: 9.6, z: 6.2, v: 1, s: 0.85 },
  { a: 'practice:picker', x: 12.6, z: 7.4, r: 0.6 },
  { a: 'coach', x: 9.6, z: 7.6, r: PI * 0.8, pose: 'idle' },
];

export const practice: MapDef = {
  id: 'practice',
  name: '练习场',
  W: 28,
  D: 58,
  view: VIEW(58),
  portraitZoom: 1.1,
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
    // 练习墙坑（外圈中一档的青）+ 两格半片场（浅青；北头留 1.2 米的外圈 = 墙影落在这里，不压场地）
    { id: 'pit', pts: rect(0.4, 10.4, 21.8, 26.6), h: PIT_H, top: 'drillOut', el: WEAR, wall: 'bluff', smooth: 0 },
    ...CELLS.map((cx, i) => ({
      id: `cell${i}`,
      pts: rect(cx - 4.6, 11.6, cx + 4.6, 24.2),
      h: PIT_H - 0.02,
      base: PIT_H,
      top: 'drillIn' as const,
      el: WEAR,
      wall: 'none' as const,
      smooth: 0,
    })),
    // 发球机道
    {
      id: 'lane-pit',
      pts: rect(12, 29.8, 20.4, 54.2),
      h: LANE_H,
      // 第 4 版（评判：发球机道和上面两格同一种青绿 + 白边线 + 横网，读成第三块球场）：道换整块平涂的浅灰沙胶面（gravel，不带石板缝）、外圈中青，只留一条发球线
      top: 'drillOut',
      el: 'none',
      wall: 'bluff',
      smooth: 0,
    },
    {
      id: 'lane',
      pts: rect(LANE.x0, LANE.z0, LANE.x1, LANE.z1),
      h: LANE_H - 0.02,
      base: LANE_H,
      top: 'gravel',
      el: 'none',
      wall: 'none',
      smooth: 0,
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
        [22, 9.4],
        [8, 9.4],
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
        [16, 1.6],
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
      [23.8, 55],
      [25.6, 48],
      [24.6, 40],
      [26.2, 32],
      [27.6, 26],
      [26.8, 19],
      [24.8, 13.6],
    ]),
    stones('shelf', [
      [24.8, 8.4],
      [22, 6.8],
      [18.4, 7],
    ]),
    stones('to-pit', [
      [26.4, 28.4],
      [23.4, 27.8],
      [20.4, 27.4],
    ]),
    stones('to-lane', [
      [24.8, 37.8],
      [22.2, 37.2],
    ]),
    stones('to-lane-s', [
      [25.4, 45.8],
      [22.2, 45.4],
    ]),
    ...cellLines,
    ...laneLines,
  ],
  stairs: [
    { id: 'shelf-steps', x0: 23.3, x1: 26.3, z0: 7.6, z1: 13, axis: 'z', h0: 1.5, h1: 0, kind: 'stairs' },
    {
      id: 'pit-steps',
      x0: 19.2,
      x1: 21.6,
      z0: 24.4,
      z1: 26.6,
      axis: 'z',
      h0: PIT_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
    {
      id: 'lane-steps',
      x0: 19.4,
      x1: 21,
      z0: 36,
      z1: 38.4,
      axis: 'x',
      h0: LANE_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
    {
      id: 'lane-steps-s',
      x0: 19.4,
      x1: 21,
      z0: 44.2,
      z1: 46.6,
      axis: 'x',
      h0: LANE_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
  ],
  courts: [],
  props: [
    ...walls,
    ...lane,
    ...ramada,
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
    { a: 'ocotillo', x: 30.6, z: 20.4 },

    // 两根场灯（夜里练习墙和发球机道还亮着）：两格之间的缝里一根、发球机道东沿一根
    { a: 'court-light', x: 10.75, z: 25.2, r: PI },
    { a: 'court-light', x: 21, z: 31.4, r: -PI / 2 },
    // 西边沙地（左边的框往里收）：成簇的石头、灌木、假紫荆，簇和簇之间空着
    ...cluster(
      'rocks',
      3.4,
      33.2,
      [
        [0, 0, 1.3],
        [1.6, 0.8, 0.8],
        [0.4, 2, 0.6],
      ],
      { v0: 0 },
    ),
    ...cluster(
      'creosote',
      7.4,
      37.6,
      [
        [0, 0],
        [1.8, 1, 0.8],
        [0.4, 2.2, 0.9],
      ],
      { v0: 1 },
    ),
    { a: 'palo-verde', x: 3.6, z: 43.4, v: 2, s: 1 },
    ...cluster('brittlebush', 8.8, 45.4, [
      [0, 0],
      [1.4, 1.4, 0.8],
    ]),
    ...cluster('agave', 1.6, 48.4, [
      [0, 0, 0.9],
      [1.2, 0.8, 0.7],
    ]),
    ...cluster(
      'rocks',
      6.8,
      51.4,
      [
        [0, 0, 1],
        [1.4, 0.6, 0.6],
      ],
      { v0: 2 },
    ),
    { a: 'palo-verde', x: 10.2, z: 53.2, v: 0, s: 0.9 },
    ...cluster('brittlebush', 21.6, 40.8, [
      [0, 0],
      [-0.6, 2, 0.8],
    ]),
    ...cluster(
      'brittlebush',
      21.4,
      31.6,
      [
        [0, 0],
        [0.6, 1.8, 0.8],
      ],
      { v0: 0 },
    ),
    ...cluster('creosote', 21.8, 50.2, [
      [0, 0],
      [0.4, 2, 0.8],
    ]),
    // 两个坑中间的沙带：一团石头、一丛灌木
    ...cluster(
      'rocks',
      12.4,
      27.9,
      [
        [0, 0, 0.8],
        [1.2, 0.6, 0.5],
      ],
      { v0: 1 },
    ),
    ...cluster('brittlebush', 2.2, 27.9, [
      [0, 0],
      [1.8, 0.2, 0.8],
    ]),
    // 西石台边一棵假紫荆（树影落进发球机道的北头）
    { a: 'palo-verde', x: -1.6, z: 30.4, v: 0, s: 1.1 },
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
  shot: { port: [13, 26], land: [14, 28] },
  walks: [
    { name: '南口 → 练习墙（东格）', from: [23.4, 55.4], to: [15.7, 21] },
    { name: '南口 → 发球机道（接球的一头）', from: [23.4, 55.4], to: [16.6, 49.4] },
    { name: '南口 → 发球机（北台阶下去）', from: [23.4, 55.4], to: [16.2, 35.4] },
    { name: '南口 → 凉棚', from: [23.4, 55.4], to: [16, 7.2] },
    { name: '凉棚 → 南口（→ 中心球场）', from: [16, 7.2], to: [21.4, 59.4], expect: 'court' },
  ],
  spots: [
    { id: 'door-south', kind: 'door', at: [21.8, 57.6], yaw: PI, note: '南口（← 中心球场）' },
    { id: 'wall-west', kind: 'play', at: [6.6, 20.8], yaw: PI, note: '西格：对墙打的站位' },
    { id: 'wall-east', kind: 'play', at: [15, 19.8], yaw: PI, note: '东格：对墙打的站位' },
    { id: 'hopper-west', kind: 'work', at: [9.6, 21.6], yaw: PI / 2, note: '西格脚边的球筐（补球）' },
    { id: 'pit-steps', kind: 'watch', at: [20.4, 27.4], yaw: PI, note: '墙坑南台阶口：站着看两格打墙' },
    { id: 'shelf-edge', kind: 'watch', at: [5.4, 7.8], yaw: 0, note: '北石台边上往下看练习墙' },
    { id: 'lane-hitter', kind: 'play', at: [15.6, 51.2], yaw: PI, note: '发球机道南头接球的人' },
    { id: 'lane-machine', kind: 'work', at: [16.2, 35], yaw: PI, note: '发球机（装球、调角度）' },
    { id: 'lane-coach', kind: 'watch', at: [19.6, 48.2], yaw: -PI / 2, note: '教练在道边看、记数' },
    { id: 'lane-steps', kind: 'watch', at: [21.6, 37.2], yaw: -PI / 2, note: '发球机道东台阶口：站着看接球' },
    { id: 'ramada-bench', kind: 'rest', at: [15.8, 6.1], yaw: 0, seat: 0.45, note: '凉棚下的长椅' },
    { id: 'water', kind: 'queue', at: [19, 6], yaw: PI, note: '饮水站（排队的队头）' },
    { id: 'ball-store', kind: 'work', at: [10, 7.6], yaw: PI, note: '球车、球筐、捡球器的后勤堆' },
  ],
};
