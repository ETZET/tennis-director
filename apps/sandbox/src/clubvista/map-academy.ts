// ════════════════════════════════════════════════════════════════════════════════════════
// H · 青训场（上课的地方：教练带一群孩子 + 会员约球；死胡同图，只有南口 ← 球场街）
//   竖屏一屏（拉远 1.4，≈ 24.5 米宽）从上到下：
//   北崖（2.8 米）的崖沿弯弯曲曲、有两处凹进去的豁口，顶上成簇的假紫荆 / 烟树 = 画面上沿的框；
//   左上：青训场（灰沙上一块绿漆硬地）—— 迷你场（11 × 5.6 米，蓝心 + 白线 + 一道矮网）：
//     教练站在网西边从捡球篮里喂球，网东边一个孩子在打，三个孩子站在地标点上排队，一个孩子在场里捡球；
//     西底线前三个橙色标志桶（一屏唯一的暖色焦点）是孩子往回打的落点；
//   右上：训练区（草地上）—— 一串之字形的锥、两个呼啦圈、一个孩子在绕桩，一摞备用的锥 + 球车；
//   右中（和青训场错开一截）：家长区（歇脚）—— 遮阳帆下两条长椅斜着朝西北看孩子，饮水桶、球拍包；
//   下半：会员场（真尺寸，南北向，下沉 0.35，四周一圈草坡，不是墙）—— 两个会员在对打，东沿球员席、球车；
//     东沿台阶口停着发球机、一筐球、两个拍包（下一节课的东西）；
//   路：西南的南口进来，主路斜着往东北穿过会员场南边的草地，沿会员场东沿弯两下往北，
//     到家长区前面再往西北折进青训场东南角；踏脚石接会员场的台阶。
//   边框：西东两边 1.2 米的种植台（假紫荆、灌木、龙舌兰成簇，不用围网），南边一条灌木带（入口那段空着）。
//   层：会员场 −0.35 / 地面 0 / 种植台 1.2 / 北崖 2.8。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, type Strip, stones, trail, type V2 } from './mapdef';

const PI = Math.PI;

/** 会员场：外场（含缓冲区）18.3 × 36.6，南北向 */
const C = { x0: 1, x1: 19.3, z0: 19.6, z1: 56.2 };
const CX = (C.x0 + C.x1) / 2;
const NET = (C.z0 + C.z1) / 2;
const COURT_H = -0.35;
/** 迷你场（孩子的小场，东西向）：11 × 5.6 */
const M = { x0: 2.6, x1: 13.6, z0: 7.2, z1: 12.8 };
const MNET = (M.x0 + M.x1) / 2;
const MZ = (M.z0 + M.z1) / 2;
/** 家长区（帆的中心） */
const P: V2 = [23.4, 14.8];
/** 家长朝西北看孩子 */
const PR = Math.atan2(MNET + 3 - P[0], MZ - P[1]);
const D = 66;
/** 南口（西南角） */
const GATE_X = 5.4;

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
  // 散一地的球（孩子打回来没捡的）、教练脚边漏出来的几个
  { a: 'academy:balls', x: MNET + 2.4, z: MZ + 1.4, v: 1, s: 0.8 },
  { a: 'academy:balls', x: M.x0 + 2, z: MZ - 1.2, r: 1.2, v: 1, s: 0.6 },
  // 场里捡球的孩子
  { a: 'kid', x: M.x0 + 2.4, z: M.z0 + 1, r: 0.6, pose: 'pickup', v: 4 },
  // 北边场沿：孩子们的球拍包一堆靠着崖脚 + 一个饮水桶
  { a: 'kit-bag', x: 3.6, z: 5.6, r: 0.1, v: 0 },
  { a: 'kit-bag', x: 4.5, z: 5.5, r: -0.15, v: 1 },
  { a: 'kit-bag', x: 4, z: 6.1, r: PI / 2 + 0.2, v: 0 },
  { a: 'water-station', x: 5.8, z: 5.6, s: 0.75 },
  // 青训场西南角：教练的一车球 + 一摞备用的锥
  { a: 'ball-cart', x: 2.4, z: 14.8, r: 0.5 },
  { a: 'academy:drill-kit', x: 3.8, z: 15, v: 3 },
  { a: 'academy:drill-kit', x: 4.3, z: 15.4, v: 3 },
];

const drill: Prop[] = [
  // 训练区（草地上，青训场东边）：之字形的锥、绕桩的孩子、两个呼啦圈、一摞备用的锥 + 球车
  { a: 'academy:drill-kit', x: 18.8, z: 6.8, v: 3 },
  { a: 'academy:drill-kit', x: 20.4, z: 8.4, v: 3 },
  { a: 'academy:drill-kit', x: 22, z: 6.8, v: 3 },
  { a: 'academy:drill-kit', x: 23.6, z: 8.4, v: 3 },
  { a: 'academy:drill-kit', x: 25.2, z: 6.8, v: 3 },
  { a: 'kid', x: 21.2, z: 7.5, r: PI / 2, pose: 'walk', v: 5 },
  { a: 'academy:drill-kit', x: 19.6, z: 10.8, v: 1 },
  { a: 'academy:drill-kit', x: 21.4, z: 11.3, v: 1 },
  { a: 'ball-cart', x: 26.2, z: 10.2, r: -0.4 },
  { a: 'academy:drill-kit', x: 25.4, z: 11, v: 3 },
  { a: 'academy:drill-kit', x: 25.9, z: 11.4, v: 3 },
];

const parents: Prop[] = [
  // 家长区：一块遮阳帆，帆下两条长椅斜着朝西北看孩子
  { a: 'academy:sail', x: P[0], z: P[1], r: PR },
  { a: 'bench', x: P[0] - 1, z: P[1] - 0.4, r: PR },
  { a: 'bench', x: P[0] + 0.9, z: P[1] + 0.8, r: PR },
  { a: 'player', x: P[0] - 1.3, z: P[1] - 0.6, r: PR, pose: 'sit', seat: [0.47, 0], v: 2, block: false },
  { a: 'player', x: P[0] - 0.65, z: P[1] - 0.2, r: PR, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 3, block: false },
  { a: 'player', x: P[0] + 1.1, z: P[1] + 0.9, r: PR, pose: 'clap', seat: [0.47, 0], v: 1, block: false },
  { a: 'water-station', x: P[0] + 2.8, z: P[1] - 0.6, s: 0.85 },
  { a: 'kit-bag', x: P[0] - 2.4, z: P[1] + 0.4, r: 0.4, v: 1 },
  { a: 'kit-bag', x: P[0] + 2.4, z: P[1] + 1.6, r: -0.3, v: 0 },
];

const member: Prop[] = [
  { a: 'net', x: CX, z: NET, r: PI / 2 },
  { a: 'player', x: CX - 2.4, z: C.z0 + 4.6, r: 0.1, pose: 'ready', prop: 'racket', v: 1 },
  { a: 'player', x: CX + 2.2, z: C.z1 - 3.6, r: PI, pose: 'serve', prop: 'racket', v: 4 },
  { a: 'player-bench', x: C.x1 - 1.3, z: NET - 2.6, r: -PI / 2 },
  { a: 'kit-bag', x: C.x1 - 1.2, z: NET - 4.4, r: 0.2, v: 0 },
  { a: 'ball-cart', x: C.x1 - 1.2, z: NET + 2.4, r: 0.3 },
  { a: 'academy:balls', x: C.x1 - 2.6, z: C.z1 - 1.6, r: 0.4, v: 1, s: 0.6 },
  // 台阶口：停着的发球机、一筐球、两个拍包（下一节课的东西，成一堆）
  { a: 'ball-machine', x: 22.4, z: 27.6, r: -PI / 2, v: 0 },
  { a: 'academy:hopper', x: 22.2, z: 26.4, v: 1 },
  { a: 'kit-bag', x: 21.6, z: 28.6, r: 0.3, v: 1 },
  { a: 'kit-bag', x: 22.5, z: 28.9, r: -0.2, v: 0 },
  // 约了下一场的两个会员：东边路旁树荫下的长椅上等着
  { a: 'smoke-tree', x: 27.6, z: 41.4, s: 1 },
  { a: 'bench', x: 26.6, z: 43.6, r: -PI / 2 },
  { a: 'player', x: 26.7, z: 43.1, r: -PI / 2, pose: 'tapSit', seat: [0.47, 0], v: 0, block: false },
  { a: 'player', x: 26.7, z: 44.1, r: -PI / 2, pose: 'sit', prop: 'racket', seat: [0.47, 0], v: 3, block: false },
  { a: 'kit-bag', x: 26.8, z: 45.3, r: 0.3, v: 1 },
  // 夜里的场灯（东沿两根、西边种植台一根），灯头对着场心
  { a: 'court-light', x: 21, z: C.z0 + 1.2, r: Math.atan2(CX - 21, NET - C.z0 - 1.2) },
  { a: 'court-light', x: 21, z: C.z1 - 1.2, r: Math.atan2(CX - 21, NET - C.z1 + 1.2) },
  { a: 'court-light', x: -1.6, z: NET, r: PI / 2 },
];

const frame: Prop[] = [
  // 北崖顶：成簇的树（崖沿凹进去的豁口前后各一簇，豁口里露出崖面）
  ...cluster('palo-verde', -4, 0, [
    [0, 0, 1.1],
    [3.4, 1, 0.85],
  ]),
  ...cluster('smoke-tree', 8.4, -0.2, [
    [0, 0, 1.05],
    [3.6, -0.6, 0.8],
  ]),
  ...cluster(
    'palo-verde',
    21,
    0.2,
    [
      [0, 0, 1],
      [3.2, -0.6, 0.8],
      [6.4, 0.6, 1.1],
    ],
    { v0: 1 },
  ),
  ...cluster('smoke-tree', 33, 0.4, [
    [0, 0, 1.1],
    [3.6, 1, 0.8],
  ]),
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
  ...cluster('agave', 3.6, -1.6, [
    [0, 0, 0.9],
    [1.2, 0.8, 0.6],
  ]),
  ...cluster('brittlebush', 15.2, 0.6, [
    [0, 0, 0.8],
    [1.4, 0.6, 0.6],
    [-1, 1, 0.5],
  ]),
  ...cluster('rocks', 13, -3, [
    [0, 0, 1.1],
    [14, 0.4, 0.8],
  ]),
  // 崖脚的豁口里：落下来的石头 + 一丛灌木
  ...cluster('rocks', 17.6, 3.6, [
    [0, 0, 0.8],
    [1, 0.5, 0.55],
  ]),
  ...cluster('brittlebush', 29.6, 4.4, [
    [0, 0, 0.7],
    [-0.8, 0.6, 0.5],
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
    27,
    [
      [0, 0, 1.15],
      [-2.6, 3.6, 0.8],
    ],
    { v0: 1 },
  ),
  ...cluster('agave', -2.4, 33, [
    [0, 0, 0.9],
    [1, 1.2, 0.6],
  ]),
  ...cluster('rocks', -2.2, 41, [
    [0, 0, 0.7],
    [-0.4, 1.4, 0.5],
  ]),
  ...cluster('creosote', -3, 47, [
    [0, 0, 1],
    [-1.6, 2, 0.8],
    [0.2, 3.4, 0.7],
  ]),
  ...cluster('palo-verde', -5.4, 55, [
    [0, 0, 1.1],
    [-2.4, 3.4, 0.85],
  ]),
  ...cluster('smoke-tree', -11, 38, [
    [0, 0, 1.1],
    [-1.4, 6, 0.9],
  ]),
  ...cluster('smoke-tree', -10, 18, [[0, 0, 1]]),
  ...cluster('brittlebush', -1.8, 23, [
    [0, 0, 0.6],
    [-0.6, 1.2, 0.45],
  ]),
  // 东种植台
  ...cluster(
    'palo-verde',
    31.6,
    12,
    [
      [0, 0, 1.1],
      [2.6, 3, 0.8],
    ],
    { v0: 2 },
  ),
  ...cluster('brittlebush', 29.6, 20, [
    [0, 0, 0.9],
    [1.4, 1, 0.7],
  ]),
  ...cluster('agave', 30, 30, [
    [0, 0, 1],
    [1.4, 1.2, 0.7],
    [-0.2, 2.2, 0.55],
  ]),
  ...cluster(
    'palo-verde',
    32,
    38,
    [
      [0, 0, 1.15],
      [2.4, 3.6, 0.8],
    ],
    { v0: 1 },
  ),
  ...cluster('rocks', 29.4, 46, [
    [0, 0, 0.8],
    [0.6, 1.4, 0.55],
  ]),
  ...cluster('creosote', 30, 53, [
    [0, 0, 1],
    [1.6, 1.8, 0.8],
  ]),
  ...cluster('smoke-tree', 38, 25, [
    [0, 0, 1.1],
    [1.4, 7, 0.9],
  ]),
  // 南边灌木带（西南的入口那段空着）
  ...cluster('brittlebush', -1, D - 1.2, [
    [0, 0, 0.9],
    [1.6, 1, 0.7],
  ]),
  ...cluster('palo-verde', 12.6, D - 0.6, [
    [0, 0, 1],
    [3.4, 1.2, 0.75],
  ]),
  ...cluster('agave', 18.6, D - 1.6, [
    [0, 0, 1],
    [1.2, 1, 0.7],
  ]),
  ...cluster('creosote', 22, D - 0.6, [
    [0, 0, 1],
    [2.4, 1, 0.8],
    [5.4, 0.2, 0.9],
  ]),
  ...cluster('brittlebush', 9.4, D - 2, [
    [0, 0, 0.8],
    [1.2, 0.8, 0.6],
  ]),
  // 草地上的几簇（主路两边；竖屏走在路上两边都有东西）
  ...cluster('brittlebush', 26.8, 31, [
    [0, 0, 0.7],
    [0.8, 0.9, 0.5],
  ]),
  ...cluster('creosote', 21.8, 47, [
    [0, 0, 0.6],
    [0.4, 1.2, 0.45],
  ]),
  ...cluster('agave', 26.6, 55, [
    [0, 0, 0.8],
    [-0.8, 1, 0.5],
  ]),
  { a: 'palo-verde', x: 27.4, z: 22.6, s: 0.9, v: 2 },
  ...cluster('creosote', 27.2, 35.4, [
    [0, 0, 0.6],
    [-0.4, 1.2, 0.45],
  ]),
  // 会员场南边的草地（主路斜着穿过）：路两边各一簇
  ...cluster('brittlebush', 16, 62.4, [
    [0, 0, 0.7],
    [1, 0.6, 0.5],
  ]),
  ...cluster('agave', 4.4, 58.8, [
    [0, 0, 0.7],
    [1, 0.6, 0.5],
  ]),
  ...cluster('rocks', 24.4, 60.6, [
    [0, 0, 0.8],
    [0.9, 0.6, 0.5],
  ]),
];

export const academy: MapDef = {
  id: 'academy',
  name: '青训场',
  W: 28,
  D,
  view: { x0: -15, x1: 43, z0: -5, z1: D + 2 },
  portraitZoom: 1.4,
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, 84), h: 0, top: 'turf', el: 'turf', wall: 'none', smooth: 0 },
    // 青训场外一圈灰沙（绿漆场和草地分开）
    {
      id: 'youth-apron',
      pts: [
        [0.2, 4.2],
        [17.6, 4.2],
        [18.4, 10],
        [17.8, 17.2],
        [0.2, 17.4],
      ],
      h: 0.01,
      top: 'gravel',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    // 青训场：一块绿漆硬地 + 迷你场的蓝心
    { id: 'youth-pad', pts: rect(1.2, 5, 17.4, 16.4), h: 0.02, top: 'surround', el: 'none', wall: 'none', smooth: 0 },
    { id: 'mini-court', pts: rect(M.x0, M.z0, M.x1, M.z1), h: 0.03, top: 'court', el: 'none', wall: 'none', smooth: 0 },
    // 家长区脚下一块灰沙
    {
      id: 'parents-pad',
      pts: [
        [19.6, 12.6],
        [26.8, 11.8],
        [27.4, 17.4],
        [20.6, 18.2],
      ],
      h: 0.01,
      top: 'gravel',
      el: 'none',
      wall: 'none',
      smooth: 1,
    },
    // 会员场的坑（下沉 0.35，四周一圈缓的草坡）
    {
      id: 'court-pit',
      pts: rect(0.1, C.z0 - 1, 20.2, C.z1 + 1),
      h: COURT_H,
      top: 'surround',
      el: 'none',
      wall: 'turf',
      smooth: 0,
      slope: 2,
    },
    // 西东种植台
    {
      id: 'west-terrace',
      pts: [
        [-30, 2],
        [-0.8, 3],
        [-0.6, 14],
        [-1.4, 27],
        [-0.8, 40],
        [-1.6, 54],
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
    // 北崖：崖沿弯来弯去，两处凹进去的豁口（x 17 和 x 29 一带），不是一条直的长墙
    {
      id: 'north-cliff',
      pts: [
        [-30, -16],
        [60, -16],
        [60, 3],
        [38, 3.8],
        [32, 2.6],
        [29.4, 0.4],
        [27, 2.8],
        [22.6, 3.6],
        [19.4, 2.8],
        [17.6, 0.6],
        [15.6, 2.4],
        [11, 3.8],
        [6, 2.6],
        [2, 3.6],
        [-4, 2.4],
        [-30, 3.2],
      ],
      h: 2.8,
      top: 'turf',
      el: 'turf',
      wall: 'bluff',
      smooth: 1.4,
    },
  ],
  strips: [
    // 主路：西南的南口进来，斜着往东北穿过草地，沿会员场东沿弯两下，到家长区前面往西北折进青训场
    trail('main', [
      [GATE_X - 0.6, D + 4],
      [GATE_X + 0.4, D - 2],
      [10.6, 59.8],
      [18.4, 58.4],
      [23.4, 54],
      [24.8, 45],
      [23.2, 36],
      [24.2, 27],
      [23, 20.6],
      [19.4, 17.8],
      [16.6, 16.2],
    ]),
    stones('parents', [
      [21.6, 19.2],
      [22.6, 17.4],
    ]),
    stones('steps', [
      [23.6, 31.6],
      [21.6, 31.4],
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
      x0: 19.2,
      x1: 20.8,
      z0: 30.2,
      z1: 32.6,
      axis: 'x',
      h0: COURT_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
  ],
  courts: [{ id: 'member', ...C, h: COURT_H, axis: 'z', outMat: 'surround', inMat: 'court', wear: true }],
  props: [...youth, ...drill, ...parents, ...member, ...frame],
  noWalk: [
    rect(-30, -20, 60, 0.4),
    rect(-30, -20, -0.6, D + 18),
    rect(28.4, -20, 60, D + 18),
    rect(-30, D + 0.6, GATE_X - 2.6, D + 18),
    rect(GATE_X + 3, D + 0.6, 60, D + 18),
  ],
  exits: [{ to: 'street', entry: 'fromAcademy', at: [GATE_X - 0.4, D + 3], r: 2 }],
  entries: {
    fromStreet: { at: [GATE_X + 0.4, D - 1], yaw: PI },
  },
  start: { at: [GATE_X + 0.4, D - 1], yaw: PI },
  clouds: [],
  shot: { port: [13, 29], land: [14, 26] },
  walks: [
    { name: '南口 → 青训场（教练）', from: [GATE_X + 0.4, D - 1], to: [8, 14.4] },
    { name: '南口 → 家长区', from: [GATE_X + 0.4, D - 1], to: [21.4, 15.6] },
    { name: '南口 → 会员场（东沿台阶下去）', from: [GATE_X + 0.4, D - 1], to: [14, 31] },
    { name: '青训场 → 南口（→ 球场街）', from: [16, 14], to: [GATE_X - 0.4, D + 3], expect: 'street' },
  ],
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-south', kind: 'door', at: [GATE_X, D + 1], yaw: PI, note: '南口（← 球场街）' },
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
    { id: 'drill-cones', kind: 'work', at: [22, 9.8], yaw: PI, note: '训练区：摆锥、摆呼啦圈' },
    { id: 'youth-cart', kind: 'work', at: [2.4, 16], yaw: 0, note: '青训场西南角的球车和备用锥' },
    {
      id: 'parents-bench',
      kind: 'rest',
      at: [P[0] - 1.5, P[1] - 1.1],
      yaw: PR,
      seat: 0.47,
      note: '帆下长椅（朝西北看孩子）',
    },
    { id: 'parents-bench-2', kind: 'rest', at: [P[0] + 0.4, P[1] + 0.1], yaw: PR, seat: 0.47, note: '帆下第二条长椅' },
    { id: 'parents-water', kind: 'work', at: [P[0] + 2.8, P[1] + 0.4], yaw: PI, note: '饮水桶（换水）' },
    { id: 'parents-watch', kind: 'watch', at: [19, 13.4], yaw: -PI / 2, note: '家长区西头站着看孩子' },
    { id: 'member-n', kind: 'play', at: [CX - 2.4, C.z0 + 4.6], yaw: 0, note: '会员场北底线' },
    { id: 'member-s', kind: 'play', at: [CX + 2.2, C.z1 - 3.6], yaw: PI, note: '会员场南底线' },
    { id: 'court-cart', kind: 'work', at: [C.x1 - 2.2, NET + 3], yaw: PI / 2, note: '会员场东沿的球车' },
    { id: 'ball-machine', kind: 'work', at: [23.4, 29.4], yaw: -PI / 2, note: '台阶口的发球机（加球、推下场）' },
    {
      id: 'wait-bench',
      kind: 'rest',
      at: [25.8, 43.6],
      yaw: -PI / 2,
      seat: 0.47,
      note: '约了下一场的会员在树荫长椅上等',
    },
  ],
};
