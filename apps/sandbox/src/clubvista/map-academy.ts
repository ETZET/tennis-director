// ════════════════════════════════════════════════════════════════════════════════════════
// H · 青训场（上课的地方：教练带一群孩子 + 会员约球；死胡同图，只有南口 ← 球场街）
//   竖屏一屏（拉远 1.2，≈ 21 米宽）从上到下：
//   北崖（2.8 米，冷暗的崖面）顶上一排假紫荆 / 烟树 = 画面上沿的框；
//   青训场（沙地上一块绿漆硬地）：西半一块迷你场（11 × 5.6 米，蓝心 + 白线 + 一道矮网）——
//     教练站在网西边从捡球篮里喂球，网东边一个孩子在打，后面三个孩子站在地标点上排队，一个孩子在场里捡球；
//     场西头三个橙色标志桶（一屏唯一的暖色焦点）是孩子往回打的落点；
//     东半是训练区：一串之字形的锥、两个呼啦圈、一个孩子在绕桩，球车停在角上；
//   家长区（歇脚）：青训场和会员场之间一块遮阳帆，帆下两条长椅（朝北看孩子），饮水桶、球拍包；
//   会员场（真尺寸，南北向，下沉 0.6）：两个会员在对打，东沿球员席 + 球车；东沿一段台阶下去；
//   东边路旁：约了下一场的两个会员坐在树荫长椅上等（拍包靠脚边）。
//   路：南口进来，主路贴着东边、沿会员场东沿斜着往北弯，上到青训场东南角；踏脚石往西接到家长区。
//   边框：西东两边 1.2 米的种植台（假紫荆、灌木、龙舌兰成簇，不用围网），北崖顶一排树，南边一条灌木带（入口那边空着）。
//   层：会员场 −0.6 / 沙地 0 / 种植台 1.2 / 北崖 2.8。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, type Strip, stones, trail, type V2 } from './mapdef';

const PI = Math.PI;

/** 会员场：外场（含缓冲区）18.3 × 36.6，南北向 */
const C = { x0: 1, x1: 19.3, z0: 23.8, z1: 60.4 };
const CX = (C.x0 + C.x1) / 2;
const NET = (C.z0 + C.z1) / 2;
const COURT_H = -0.6;
/** 迷你场（孩子的小场，东西向）：11 × 5.6 */
const M = { x0: 3, x1: 14, z0: 7.4, z1: 13 };
const MNET = (M.x0 + M.x1) / 2;
const MZ = (M.z0 + M.z1) / 2;
/** 家长区（帆下长椅那一排） */
const PZ = 20.4;
/** 南口 */
const D = 66;

/** 白线（贴着场面的细带子） */
const line = (id: string, pts: V2[]): Strip => ({ id, pts, w: 0.1, mat: 'line', el: 'none', lift: 0.045 });

const youth: Prop[] = [
  { a: 'academy:mini-net', x: MNET, z: MZ, r: 0 },
  // 教练（网西边）从捡球篮里喂球；孩子往回打，落点是西底线前的三个橙色标志桶
  { a: 'coach', x: MNET - 1.4, z: MZ + 0.2, r: PI / 2, pose: 'feed', prop: 'racket' },
  { a: 'academy:hopper', x: MNET - 2.2, z: MZ + 1.1, v: 1 },
  { a: 'academy:drill-kit', x: M.x0 + 1.2, z: MZ, r: PI / 2, v: 0 },
  // 网东边打球的孩子 + 地标点上排队的三个
  { a: 'kid', x: MNET + 3.6, z: MZ - 0.2, r: -PI / 2, pose: 'ready', prop: 'racket', v: 0 },
  { a: 'academy:drill-kit', x: M.x1 + 2.4, z: MZ + 0.6, v: 2 },
  { a: 'kid', x: M.x1 + 1.05, z: MZ + 0.6, r: -PI / 2, pose: 'idle', v: 1 },
  { a: 'kid', x: M.x1 + 1.95, z: MZ + 0.6, r: -PI / 2 + 0.3, pose: 'idle', v: 2 },
  { a: 'kid', x: M.x1 + 2.85, z: MZ + 0.7, r: -PI / 2, pose: 'idle', v: 3 },
  // 网东边散一地的球（孩子打回来没捡的）、教练脚边漏出来的几个
  { a: 'academy:balls', x: MNET + 2.4, z: MZ + 1.4, v: 1, s: 0.8 },
  { a: 'academy:balls', x: M.x0 + 2, z: MZ - 1.2, r: 1.2, v: 1, s: 0.6 },
  // 场里捡球的孩子
  { a: 'kid', x: M.x0 + 2.4, z: M.z0 + 1, r: 0.6, pose: 'pickup', v: 4 },
  // 东半的训练区：之字形的锥、两个呼啦圈、绕桩的孩子、球车
  { a: 'academy:drill-kit', x: 18.6, z: 8.2, v: 3 },
  { a: 'academy:drill-kit', x: 20.2, z: 9.8, v: 3 },
  { a: 'academy:drill-kit', x: 21.8, z: 8.2, v: 3 },
  { a: 'academy:drill-kit', x: 23.4, z: 9.8, v: 3 },
  { a: 'kid', x: 21, z: 8.9, r: PI / 2, pose: 'walk', v: 5 },
  { a: 'academy:drill-kit', x: 19.8, z: 14, v: 1 },
  { a: 'academy:drill-kit', x: 21.6, z: 14.6, v: 1 },
  { a: 'ball-cart', x: 25, z: 15.2, r: -0.4 },
  // 北边场沿：孩子们的球拍包一排靠着崖脚
  { a: 'kit-bag', x: 4.4, z: 5.4, r: 0.1, v: 0 },
  { a: 'kit-bag', x: 5.3, z: 5.3, r: -0.15, v: 1 },
  { a: 'kit-bag', x: 6.2, z: 5.45, r: 0.05, v: 0 },
];

const parents: Prop[] = [
  // 家长区：一块遮阳帆，帆下两条长椅朝北看孩子
  { a: 'academy:sail', x: 6.2, z: PZ - 0.2 },
  { a: 'bench', x: 5, z: PZ, r: PI },
  { a: 'bench', x: 7.6, z: PZ + 0.2, r: PI },
  { a: 'player', x: 4.6, z: PZ + 0.1, r: PI, pose: 'sit', seat: [0.47, 0], v: 2, block: false },
  { a: 'player', x: 5.4, z: PZ + 0.1, r: PI, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 3, block: false },
  { a: 'player', x: 7.9, z: PZ + 0.3, r: PI, pose: 'clap', seat: [0.47, 0], v: 1, block: false },
  { a: 'water-station', x: 10.4, z: PZ - 0.4, s: 0.85 },
  { a: 'kit-bag', x: 3.2, z: PZ + 0.5, r: PI / 2 - 0.2, v: 1 },
];

const member: Prop[] = [
  { a: 'net', x: CX, z: NET, r: PI / 2 },
  { a: 'player', x: CX - 2.4, z: C.z0 + 4.6, r: 0.1, pose: 'ready', prop: 'racket', v: 1 },
  { a: 'player', x: CX + 2.2, z: C.z1 - 3.6, r: PI, pose: 'serve', prop: 'racket', v: 4 },
  { a: 'player-bench', x: C.x1 - 1.3, z: NET - 2.6, r: -PI / 2 },
  { a: 'kit-bag', x: C.x1 - 1.2, z: NET - 4.4, r: 0.2, v: 0 },
  { a: 'ball-cart', x: C.x1 - 1.2, z: NET + 2.4, r: 0.3 },
  { a: 'academy:balls', x: C.x1 - 2.6, z: C.z1 - 1.6, r: 0.4, v: 1, s: 0.6 },
  // 约了下一场的两个会员：东边路旁树荫下的长椅上等着
  { a: 'smoke-tree', x: 27.6, z: 45.4, s: 1 },
  { a: 'bench', x: 26.4, z: 47.6, r: -PI / 2 },
  { a: 'player', x: 26.5, z: 47.1, r: -PI / 2, pose: 'tapSit', seat: [0.47, 0], v: 0, block: false },
  { a: 'player', x: 26.5, z: 48.1, r: -PI / 2, pose: 'sit', prop: 'racket', seat: [0.47, 0], v: 3, block: false },
  { a: 'kit-bag', x: 26.6, z: 49.3, r: 0.3, v: 1 },
  // 夜里的场灯（东沿两根、西边种植台一根）
  { a: 'court-light', x: 21, z: C.z0 + 1.2, r: Math.atan2(CX - 21, NET - C.z0 - 1.2) },
  { a: 'court-light', x: 21, z: C.z1 - 1.2, r: Math.atan2(CX - 21, NET - C.z1 + 1.2) },
  { a: 'court-light', x: -1.6, z: NET, r: PI / 2 },
];

const frame: Prop[] = [
  // 北崖顶一排树（画面上沿的框）
  ...cluster('palo-verde', -4, 0, [
    [0, 0, 1.1],
    [3.4, 1, 0.85],
  ]),
  ...cluster('smoke-tree', 8, 0.4, [
    [0, 0, 1.05],
    [3.8, -0.8, 0.8],
  ]),
  ...cluster(
    'palo-verde',
    18,
    0.6,
    [
      [0, 0, 1],
      [3.2, -0.6, 0.8],
      [6.6, 0.4, 1.1],
    ],
    { v0: 1 },
  ),
  ...cluster('smoke-tree', 31, 0, [
    [0, 0, 1.1],
    [3.6, 1, 0.8],
  ]),
  ...cluster('brittlebush', 13, 2, [
    [0, 0, 0.7],
    [1.2, 0.3, 0.5],
  ]),
  // 崖顶往北再一排（竖屏上沿不留空草地）
  ...cluster(
    'smoke-tree',
    -1,
    -6,
    [
      [0, 0, 1.15],
      [6, 1, 0.9],
      [13, -0.6, 1.1],
    ],
    { v0: 1 },
  ),
  ...cluster('palo-verde', 20, -6.4, [
    [0, 0, 1.2],
    [5.4, 1.2, 0.95],
    [10, -0.4, 1.05],
  ]),
  ...cluster('agave', 4.6, -2.2, [
    [0, 0, 0.9],
    [1.2, 0.8, 0.6],
  ]),
  ...cluster('brittlebush', 25.4, -2, [
    [0, 0, 0.8],
    [1.4, 0.6, 0.6],
    [-1, 1, 0.5],
  ]),
  ...cluster('rocks', 1.6, -3, [
    [0, 0, 1.1],
    [12, -1, 0.8],
    [26, 0.4, 1],
  ]),
  // 西种植台
  ...cluster('palo-verde', -4.4, 10, [
    [0, 0, 1.1],
    [-2.4, 3.2, 0.8],
  ]),
  ...cluster('brittlebush', -2.4, 17, [
    [0, 0, 0.9],
    [-1.2, 1, 0.7],
    [0.2, 2, 0.6],
  ]),
  ...cluster(
    'palo-verde',
    -5,
    28,
    [
      [0, 0, 1.15],
      [-2.6, 3.6, 0.8],
    ],
    { v0: 1 },
  ),
  ...cluster('agave', -2.4, 35, [
    [0, 0, 0.9],
    [1, 1.2, 0.6],
  ]),
  ...cluster('creosote', -3, 48, [
    [0, 0, 1],
    [-1.6, 2, 0.8],
    [0.2, 3.4, 0.7],
  ]),
  ...cluster('palo-verde', -5.4, 56, [
    [0, 0, 1.1],
    [-2.4, 3.4, 0.85],
  ]),
  ...cluster('smoke-tree', -11, 40, [
    [0, 0, 1.1],
    [-1.4, 6, 0.9],
  ]),
  ...cluster('smoke-tree', -10, 18, [[0, 0, 1]]),
  ...cluster('brittlebush', -1.8, 23, [
    [0, 0, 0.6],
    [-0.6, 1.2, 0.45],
  ]),
  ...cluster('agave', -1.9, 52, [[0, 0, 0.6]]),
  ...cluster('rocks', -2.2, 41, [
    [0, 0, 0.7],
    [-0.4, 1.4, 0.5],
  ]),
  // 东种植台
  ...cluster(
    'palo-verde',
    31.4,
    11,
    [
      [0, 0, 1.1],
      [2.6, 3, 0.8],
    ],
    { v0: 2 },
  ),
  ...cluster('brittlebush', 29.6, 21, [
    [0, 0, 0.9],
    [1.4, 1, 0.7],
  ]),
  ...cluster('agave', 30, 31, [
    [0, 0, 1],
    [1.4, 1.2, 0.7],
    [-0.2, 2.2, 0.55],
  ]),
  ...cluster(
    'palo-verde',
    32,
    40,
    [
      [0, 0, 1.15],
      [2.4, 3.6, 0.8],
    ],
    { v0: 1 },
  ),
  ...cluster('creosote', 30, 53, [
    [0, 0, 1],
    [1.6, 1.8, 0.8],
  ]),
  ...cluster('rocks', 29.4, 45, [
    [0, 0, 0.8],
    [0.6, 1.4, 0.55],
  ]),
  ...cluster('brittlebush', 29.2, 60, [
    [0, 0, 0.7],
    [0.8, -1, 0.5],
  ]),
  ...cluster('smoke-tree', 38, 25, [
    [0, 0, 1.1],
    [1.4, 7, 0.9],
  ]),
  // 南边灌木带（入口那段空着）
  ...cluster('brittlebush', 3, D - 1.6, [
    [0, 0, 1],
    [2.2, 1, 0.8],
    [-1.8, 1.4, 0.7],
    [4.4, 0.2, 0.9],
  ]),
  ...cluster('palo-verde', 12, D - 0.6, [
    [0, 0, 1],
    [3.4, 1.2, 0.75],
  ]),
  ...cluster('agave', 18.2, D - 1.8, [
    [0, 0, 1],
    [1.2, 1, 0.7],
  ]),
  ...cluster('creosote', 28.6, D - 1, [
    [0, 0, 1],
    [2.4, 1, 0.8],
  ]),
  // 沙地上的几簇（主路两边、坑沿；竖屏走在路上两边都有东西）
  ...cluster('brittlebush', 26.8, 32, [
    [0, 0, 0.7],
    [0.8, 0.9, 0.5],
  ]),
  ...cluster('creosote', 21.8, 50, [
    [0, 0, 0.6],
    [0.4, 1.2, 0.45],
  ]),
  ...cluster('agave', 27, 57, [
    [0, 0, 0.8],
    [-0.8, 1, 0.5],
  ]),
  ...cluster('brittlebush', 21.6, 61.8, [[0, 0, 0.6]]),
  // 东边草地（路和种植台之间）：一棵假紫荆罩着青训场东南角，几簇矮灌木
  { a: 'palo-verde', x: 27.2, z: 21.4, s: 0.95, v: 2 },
  ...cluster('brittlebush', 26.6, 25.6, [
    [0, 0, 0.6],
    [0.9, 0.7, 0.45],
  ]),
  ...cluster('creosote', 27.2, 37.4, [
    [0, 0, 0.6],
    [-0.4, 1.2, 0.45],
  ]),
  ...cluster('agave', 21.6, 41.4, [[0, 0, 0.55]]),
  ...cluster('brittlebush', 21.4, 27.6, [
    [0, 0, 0.5],
    [0.5, 0.9, 0.4],
  ]),
  ...cluster('creosote', 14.6, 21.6, [
    [0, 0, 0.55],
    [1.2, 0.3, 0.4],
  ]),
];

export const academy: MapDef = {
  id: 'academy',
  name: '青训场',
  W: 28,
  D,
  view: { x0: -15, x1: 43, z0: -5, z1: D + 2 },
  portraitZoom: 1.3,
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, 84), h: 0, top: 'turf', el: 'turf', wall: 'none', smooth: 0 },
    // 青训场外一圈灰沙（绿漆场和草地分开）
    { id: 'youth-apron', pts: rect(0.2, 3.6, 27.6, 18), h: 0.01, top: 'gravel', el: 'none', wall: 'none', smooth: 0.6 },
    // 青训场：一块绿漆硬地 + 迷你场的蓝心
    { id: 'youth-pad', pts: rect(1.2, 4.4, 26.6, 17), h: 0.02, top: 'surround', el: 'none', wall: 'none', smooth: 0 },
    { id: 'mini-court', pts: rect(M.x0, M.z0, M.x1, M.z1), h: 0.03, top: 'court', el: 'none', wall: 'none', smooth: 0 },
    // 会员场的坑（下沉 0.6，斜壁）
    {
      id: 'court-pit',
      pts: rect(0.2, C.z0 - 0.8, 20.1, C.z1 + 1.2),
      h: COURT_H,
      top: 'surround',
      el: 'none',
      wall: 'bluff',
      smooth: 0,
      slope: 1,
      rim: 0.4,
    },
    // 西东种植台
    {
      id: 'west-terrace',
      pts: [
        [-30, 2],
        [-0.8, 3],
        [-0.6, 14],
        [-1.4, 28],
        [-0.8, 42],
        [-1.6, 56],
        [-1.2, D + 4],
        [-30, D + 4],
      ],
      h: 1.2,
      top: 'turf',
      el: 'turf',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'east-terrace',
      pts: [
        [28.4, 2],
        [60, 2],
        [60, D + 4],
        [28.8, D + 4],
        [29.4, 54],
        [28.6, 38],
        [29.2, 24],
        [28.2, 12],
      ],
      h: 1.2,
      top: 'turf',
      el: 'turf',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 北崖
    {
      id: 'north-cliff',
      pts: [
        [-30, -16],
        [60, -16],
        [60, 2.8],
        [36, 3.4],
        [24, 2.6],
        [14, 3.6],
        [4, 2.8],
        [-8, 3.4],
        [-30, 2.6],
      ],
      h: 2.8,
      top: 'turf',
      el: 'turf',
      wall: 'bluff',
      smooth: 1.1,
    },
  ],
  strips: [
    trail('main', [
      [22.6, D + 4],
      [23.4, D - 2],
      [24.8, 56],
      [25.2, 48],
      [24.4, 39],
      [23.2, 30],
      [22, 23.6],
      [19.6, 19.2],
      [18, 17.4],
    ]),
    stones('parents', [
      [19.2, 19.8],
      [15.4, 20.2],
      [12, 20.4],
    ]),
    stones('steps', [
      [23.8, 35],
      [21.8, 34.8],
    ]),
    // 迷你场的白线：外框 + 中线
    line('m-n', [
      [M.x0, M.z0],
      [M.x1, M.z0],
    ]),
    line('m-s', [
      [M.x0, M.z1],
      [M.x1, M.z1],
    ]),
    line('m-w', [
      [M.x0, M.z0],
      [M.x0, M.z1],
    ]),
    line('m-e', [
      [M.x1, M.z0],
      [M.x1, M.z1],
    ]),
    line('m-c', [
      [M.x0 + 2, MZ],
      [M.x1 - 2, MZ],
    ]),
  ],
  stairs: [
    {
      id: 'court-steps',
      x0: 19.4,
      x1: 21,
      z0: 33.6,
      z1: 36,
      axis: 'x',
      h0: COURT_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
  ],
  courts: [{ id: 'member', ...C, h: COURT_H, axis: 'z', outMat: 'surround', inMat: 'court', wear: true }],
  props: [...youth, ...parents, ...member, ...frame],
  noWalk: [
    rect(-30, -20, 60, 3.6),
    rect(-30, -20, -0.6, D + 18),
    rect(28.4, -20, 60, D + 18),
    rect(-30, D + 0.6, 20.6, D + 18),
    rect(25.4, D + 0.6, 60, D + 18),
  ],
  exits: [{ to: 'street', entry: 'fromAcademy', at: [22.8, D + 3], r: 2 }],
  entries: {
    fromStreet: { at: [23.4, D - 1], yaw: PI },
  },
  start: { at: [23.4, D - 1], yaw: PI },
  clouds: [],
  shot: { port: [13, 17], land: [14, 26] },
  walks: [
    { name: '南口 → 青训场（教练）', from: [23.4, D - 1], to: [10, 14.2] },
    { name: '南口 → 家长区', from: [23.4, D - 1], to: [9, 19] },
    { name: '南口 → 会员场（东沿台阶下去）', from: [23.4, D - 1], to: [14, 35] },
    { name: '青训场 → 南口（→ 球场街）', from: [16, 15], to: [22.8, D + 3], expect: 'street' },
  ],
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-south', kind: 'door', at: [23, D + 1], yaw: PI, note: '南口（← 球场街）' },
    { id: 'coach-feed', kind: 'work', at: [MNET - 1.4, MZ + 0.2], yaw: PI / 2, note: '迷你场网西边：教练喂球' },
    { id: 'hopper', kind: 'work', at: [MNET - 2.6, MZ + 1.9], yaw: -PI / 4, note: '捡球篮（加球、收球）' },
    {
      id: 'mini-hit',
      kind: 'play',
      at: [MNET + 3.6, MZ - 0.2],
      yaw: -PI / 2,
      note: '迷你场网东边：轮到的孩子在这儿打',
    },
    {
      id: 'kid-queue',
      kind: 'queue',
      at: [M.x1 + 1.05, MZ + 0.6],
      yaw: -PI / 2,
      note: '孩子排队的队头（地标点），往东排',
    },
    { id: 'drill-cones', kind: 'work', at: [21, 11.4], yaw: PI, note: '训练区：摆锥、摆呼啦圈' },
    { id: 'youth-cart', kind: 'work', at: [24.4, 16.4], yaw: -PI / 4, note: '青训场东南角的球车' },
    { id: 'parents-bench', kind: 'rest', at: [5, PZ - 0.7], yaw: PI, seat: 0.47, note: '帆下长椅（朝北看孩子）' },
    { id: 'parents-bench-2', kind: 'rest', at: [7.6, PZ - 0.5], yaw: PI, seat: 0.47, note: '帆下第二条长椅' },
    { id: 'parents-water', kind: 'work', at: [10.4, PZ + 0.6], yaw: PI, note: '饮水桶（换水）' },
    { id: 'parents-watch', kind: 'watch', at: [12.6, 18.4], yaw: PI, note: '家长区东头站着看孩子' },
    { id: 'member-n', kind: 'play', at: [CX - 2.4, C.z0 + 4.6], yaw: 0, note: '会员场北底线' },
    { id: 'member-s', kind: 'play', at: [CX + 2.2, C.z1 - 3.6], yaw: PI, note: '会员场南底线' },
    { id: 'court-cart', kind: 'work', at: [C.x1 - 2.2, NET + 3], yaw: PI / 2, note: '会员场东沿的球车' },
    { id: 'court-steps', kind: 'watch', at: [22.6, 37.2], yaw: -PI / 2, note: '台阶口站着看会员打球' },
    {
      id: 'wait-bench',
      kind: 'rest',
      at: [25.6, 47.6],
      yaw: -PI / 2,
      seat: 0.47,
      note: '约了下一场的会员在树荫长椅上等',
    },
  ],
};
