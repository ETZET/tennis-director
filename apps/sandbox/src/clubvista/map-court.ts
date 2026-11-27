// ════════════════════════════════════════════════════════════════════════════════════════
// B · 中心球场（第二轮重做：比赛的地方，和练习场拉开）
//   真尺寸的场（连外圈 18.3 × 36.6 米，南北向）落在一座小球场里：
//   北边 = 看台正对镜头（6 级，两半中间是球员通道的门楼），看台嵌进北边的台地，台地上立着记分牌和两面旗 —— 竖屏上沿的招牌轮廓；
//   东西两边 = 顺着边线的 3 级看台（踏面朝天：一条条竖着的座椅带 + 人头），顶上一排遮阳帆；
//   南边 = 2 级小看台背对镜头（白灰泥后墙 = 画面下沿的暗框），正中 4.4 米的进场口。
//   场边：西边网柱外的裁判椅、两条球员长椅 + 伞 + 球拍包；四个角的司线员；网柱和底线角的球童；四根灯杆。
//   观众两种状态：坐满 / 空场（?crowd=empty 或右上角的按钮；空场 = 一排排深青绿的空座，整座球场安静下来）。
//   路：南边广场进场口进来（← 到达）；东边看台背后的廊道往北弯到东口（→ 歇脚）；西北角一道石阶上台地（→ 练习场）。
//   层：球场 / 廊道 0 / 看台 0.45…2.7 / 北台地 2.7 / 西东两边的棕榈台 1.2。
//   竖屏镜头拉远到 1.4（一屏 ≈ 24.5 米宽：场 + 两边各一截看台），见 clubvista.md「第二轮」。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, stones, trail } from './mapdef';

const PI = Math.PI;
/** 场（外圈）和网 */
const C = { x0: 4.85, x1: 23.15, z0: 15, z1: 51.6 };
const CX = (C.x0 + C.x1) / 2;
const NET = (C.z0 + C.z1) / 2;
const BASE_N = NET - 11.885;
const BASE_S = NET + 11.885;
/** 看台前沿（广告板外皮落在场的外圈线上） */
const FRONT_N = C.z0 - 0.35;
const FRONT_W = C.x0 - 0.35;
const FRONT_E = C.x1 + 0.35;
const FRONT_S = C.z1 + 0.35;
const TOP = 2.7;

const stands: Prop[] = [
  // 北看台两半 + 球员通道
  { a: 'stand-north', x: CX - 6.5, z: FRONT_N, v: 0, block: 'box' },
  { a: 'stand-north', x: CX + 6.5, z: FRONT_N, v: 1, block: 'box' },
  { a: 'tunnel', x: CX, z: FRONT_N, block: 'box' },
  // 东西两边（转过去人朝场地）
  { a: 'stand-side', x: FRONT_W, z: NET, r: PI / 2, v: 0, block: 'box' },
  { a: 'stand-side', x: FRONT_E, z: NET, r: -PI / 2, v: 1, block: 'box' },
  // 南边两小段（人朝北）
  { a: 'stand-south', x: CX - 5.9, z: FRONT_S, r: PI, v: 0, block: 'box' },
  { a: 'stand-south', x: CX + 5.9, z: FRONT_S, r: PI, v: 1, block: 'box' },
];

const match: Prop[] = [
  { a: 'net', x: CX, z: NET, r: PI / 2 },
  // 裁判椅（西边网柱外）+ 裁判
  { a: 'umpire-chair', x: C.x0 + 2.6, z: NET, r: PI / 2 },
  { a: 'umpire', x: C.x0 + 2.6, z: NET, r: PI / 2, pose: 'sit', seat: [1.77, 1.54], look: [CX, 0.6, BASE_N + 4] },
  // 球员长椅（裁判两边）+ 伞 + 球拍包
  { a: 'player-bench', x: C.x0 + 1.1, z: NET - 2.8, r: PI / 2 },
  { a: 'player-bench', x: C.x0 + 1.1, z: NET + 2.8, r: PI / 2 },
  // 第三轮：只留北边一把（两把一样的白伞并排读成一对小圆点）。球员伞用本地的米白伞 + 蓝下摆（第 4 轮：main 上共用的场边伞换成了珊瑚红白条，两把并排成了整屏最艳的暖色）
  { a: 'parasol', x: C.x0 + 1.0, z: NET - 4.4, v: 1, block: 0.2 },
  { a: 'kit-bag', x: C.x0 + 1.2, z: NET - 1.6, r: PI / 2, v: 0 },
  { a: 'kit-bag', x: C.x0 + 1.2, z: NET + 1.6, r: PI / 2, v: 1 },
  // 两个球员：北边发球、南边准备接
  { a: 'player', x: CX + 1.4, z: BASE_N - 0.5, r: 0, pose: 'serve', prop: 'racket', v: 0 },
  { a: 'player', x: CX - 2.2, z: BASE_S + 0.8, r: PI, pose: 'ready', prop: 'racket', v: 2 },
  // 司线员（四个角 + 两条底线中间）
  { a: 'line-chair', x: C.x0 + 0.7, z: C.z0 + 1.0, r: PI / 2 },
  { a: 'umpire', x: C.x0 + 0.7, z: C.z0 + 1.0, r: PI / 2, pose: 'sit', seat: [0.49, 0], v: 1 },
  { a: 'line-chair', x: C.x1 - 0.7, z: C.z0 + 1.0, r: -PI / 2 },
  { a: 'umpire', x: C.x1 - 0.7, z: C.z0 + 1.0, r: -PI / 2, pose: 'sit', seat: [0.49, 0], v: 1 },
  { a: 'line-chair', x: C.x0 + 0.7, z: C.z1 - 1.0, r: PI / 2 },
  { a: 'umpire', x: C.x0 + 0.7, z: C.z1 - 1.0, r: PI / 2, pose: 'sit', seat: [0.49, 0], v: 1 },
  { a: 'line-chair', x: C.x1 - 0.7, z: C.z1 - 1.0, r: -PI / 2 },
  { a: 'umpire', x: C.x1 - 0.7, z: C.z1 - 1.0, r: -PI / 2, pose: 'sit', seat: [0.49, 0], v: 1 },
  { a: 'line-chair', x: CX + 3.8, z: C.z0 + 0.6, r: 0 },
  { a: 'umpire', x: CX + 3.8, z: C.z0 + 0.6, r: 0, pose: 'sit', seat: [0.49, 0], v: 1 },
  { a: 'line-chair', x: CX - 3.8, z: C.z1 - 0.6, r: PI },
  { a: 'umpire', x: CX - 3.8, z: C.z1 - 0.6, r: PI, pose: 'sit', seat: [0.49, 0], v: 1 },
  // 球童：东边网柱蹲着、两个底线角站着
  { a: 'ball-kid', x: CX + 7.2, z: NET + 0.9, r: -PI / 2, pose: 'bkCrouch', v: 0 },
  { a: 'ball-kid', x: CX - 7.6, z: C.z0 + 1.1, r: PI / 2, pose: 'bkStand', v: 1 },
  { a: 'ball-kid', x: CX + 7.6, z: C.z1 - 1.2, r: -PI / 2, pose: 'bkStand', v: 2 },
  // 四根灯杆（看台四个角外，灯对着场心）
  { a: 'court-light', x: C.x0 - 3.2, z: C.z0 - 0.4, r: Math.atan2(CX - (C.x0 - 3.2), NET - (C.z0 - 0.4)), block: 0.3 },
  { a: 'court-light', x: C.x1 + 3.2, z: C.z0 - 0.4, r: Math.atan2(CX - (C.x1 + 3.2), NET - (C.z0 - 0.4)), block: 0.3 },
  { a: 'court-light', x: C.x0 - 3.2, z: C.z1 + 0.8, r: Math.atan2(CX - (C.x0 - 3.2), NET - (C.z1 + 0.8)), block: 0.3 },
  { a: 'court-light', x: C.x1 + 3.2, z: C.z1 + 0.8, r: Math.atan2(CX - (C.x1 + 3.2), NET - (C.z1 + 0.8)), block: 0.3 },
  // 北台地：记分牌（腿埋进台地，牌底离台地 2.4 米）+ 两面旗
  { a: 'scoreboard', x: CX, z: FRONT_N - 6.2, y: TOP - 4.7, block: false, noCast: true },
  { a: 'flag', x: CX - 5, z: FRONT_N - 5.8, y: TOP, v: 0, noCast: true },
  { a: 'flag', x: CX + 5, z: FRONT_N - 5.8, y: TOP, v: 1, noCast: true },
];

/** 边框：东西两边的棕榈台（三种尺寸成簇）、北台地的树、南边广场两侧的龙舌兰和石头 */
const frame: Prop[] = [
  // 西边棕榈台（x −15…0）
  ...cluster('fan-palm', -4, 14, [
    [0, 0, 1.15],
    [2.4, 2.2, 0.8],
    [-2.6, 3.4, 0.6],
    [0.6, 5.6, 0.95],
  ]),
  ...cluster(
    'fan-palm',
    -5,
    30,
    [
      [0, 0, 1.2],
      [2.6, -1.8, 0.7],
      [-2.2, 2.4, 0.9],
    ],
    { v0: 1 },
  ),
  ...cluster(
    'fan-palm',
    -3.6,
    45,
    [
      [0, 0, 0.85],
      [-2.6, 1.6, 1.15],
      [1.8, 3.4, 0.6],
      [-1, 5.4, 0.75],
    ],
    { v0: 2 },
  ),
  ...cluster('smoke-tree', -10, 22, [
    [0, 0, 1.1],
    [-2, 3, 0.8],
  ]),
  ...cluster('rocks', -9, 38, [
    [0, 0, 1.4],
    [1.6, 1.4, 0.9],
    [-1.4, 2.2, 1.1],
  ]),
  ...cluster('creosote', -11, 50, [
    [0, 0],
    [2.2, 1.6, 0.8],
    [-1.6, 2.4, 0.7],
  ]),
  // 东边棕榈台（x 28…43；东口在 z 34～40 的缺口）
  ...cluster(
    'fan-palm',
    31.6,
    14,
    [
      [0, 0, 1.1],
      [2.6, 2.6, 0.7],
      [-0.4, 5, 0.9],
    ],
    { v0: 1 },
  ),
  ...cluster(
    'fan-palm',
    32,
    26,
    [
      [0, 0, 0.9],
      [2.4, -1.6, 1.2],
      [1.2, 3, 0.6],
    ],
    { v0: 0 },
  ),
  ...cluster(
    'fan-palm',
    31.4,
    47,
    [
      [0, 0, 1.2],
      [2.6, 1.8, 0.75],
      [-0.6, 4.2, 0.9],
      [3.2, 5.4, 0.6],
    ],
    { v0: 2 },
  ),
  ...cluster('palo-verde', 38, 20, [
    [0, 0, 1.1],
    [2.6, 2.6, 0.8],
  ]),
  ...cluster('rocks', 38.4, 52, [
    [0, 0, 1.3],
    [1.4, 1.2, 0.8],
  ]),
  // 北台地（看台背后）：两簇棕榈夹着记分牌
  ...cluster(
    'fan-palm',
    2,
    4,
    [
      [0, 0, 1.15],
      [-2.6, 1.6, 0.75],
      [1.8, 2.8, 0.6],
    ],
    { v0: 0 },
  ),
  ...cluster(
    'fan-palm',
    26.4,
    4.4,
    [
      [0, 0, 1.05],
      [2.6, 1.2, 0.7],
      [-1.6, 2.6, 0.85],
    ],
    { v0: 2 },
  ),
  ...cluster('palo-verde', -8, 2, [
    [0, 0, 1],
    [3, 2, 0.75],
  ]),
  ...cluster('smoke-tree', 36, 2, [
    [0, 0, 1.1],
    [2.6, 2.4, 0.8],
  ]),
  // 进场口两侧：西边 3 个桶仙人掌、东边 5 棵龙舌兰（3 + 5 两簇，大小不一，中间留空：第 3 轮评判"一排等距的龙舌兰"）
  ...cluster('barrel-cactus', 8.8, 56.6, [
    [0, 0, 1.3],
    [1.1, 0.9, 0.85],
    [-0.8, 1.2, 0.6],
  ]),
  ...cluster('agave', 19.8, 56.4, [
    [0, 0, 1.25],
    [1.5, 0.6, 0.9],
    [-1.2, 1.1, 0.7],
    [0.6, 1.7, 0.6],
    [2.4, 1.8, 1],
  ]),
  ...cluster(
    'fan-palm',
    -1,
    60,
    [
      [0, 0, 1.1],
      [2.4, 1.8, 0.7],
    ],
    { v0: 1 },
  ),
  ...cluster(
    'fan-palm',
    29,
    60.6,
    [
      [0, 0, 1.15],
      [-2.2, 1.6, 0.8],
      [2, 2.4, 0.6],
    ],
    { v0: 0 },
  ),
  // 南边广场：观众沿中轴排成一列进场（伸进进场口）—— 比赛日的样子（第 3 轮：南边一片空米色；
  // 第 4 轮：冰棍车的粉伞是整屏最艳的暖色、和球场抢焦点，删了；队伍排成一列）
  { a: 'player', x: 14.1, z: 53.6, r: PI, pose: 'walk', v: 1, block: false },
  { a: 'player', x: 14, z: 54.7, r: PI, pose: 'idle', v: 2, block: false },
  { a: 'kid', x: 14.2, z: 55.6, r: PI, pose: 'idle', v: 0, block: false },
  { a: 'coach', x: 14, z: 56.5, r: PI, pose: 'idle', prop: 'none', block: false },
  { a: 'player', x: 14.1, z: 57.5, r: PI, pose: 'walk', v: 3, block: false },
  // 东边廊道上的歇脚：长椅 + 水站（看台背后、出东口之前）
  { a: 'bench', x: 29.2, z: 41.6, r: -PI / 2 },
  { a: 'water-station', x: 29.4, z: 43.6, r: -PI / 2 },
];

export const court: MapDef = {
  id: 'court',
  name: '中心球场',
  W: 28,
  D: 64,
  view: { x0: -15, x1: 43, z0: -6, z1: 66 },
  portraitZoom: 1.4,
  plates: [
    { id: 'ground', pts: rect(-30, -20, 60, 80), h: 0, top: 'floor', el: 'floor', wall: 'none', smooth: 0 },
    // 球场外的铺地：一圈廊道 + 南边广场（浅暖石板，安静）
    {
      id: 'concourse',
      pts: [
        [-1.4, 8],
        [29.4, 8],
        [29.6, 56],
        [24, 62.4],
        [4, 62.4],
        [-1.6, 56],
      ],
      h: 0.01,
      top: 'paving',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    // 西边、东边的棕榈台（左右的框，1.2 米高，朝镜头的崖是暗带）
    {
      id: 'west-terrace',
      pts: [
        [-30, 8],
        [-2.2, 8],
        [-2.6, 20],
        [-1.8, 34],
        [-2.8, 46],
        [-2.2, 55],
        [-30, 56],
      ],
      h: 1.2,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'east-terrace-n',
      pts: [
        [30.2, 8],
        [60, 8],
        [60, 33.4],
        [30.6, 33.6],
        [30.2, 22],
      ],
      h: 1.2,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'east-terrace-s',
      pts: [
        [30.6, 40.8],
        [60, 40.6],
        [60, 58],
        [30.4, 57],
        [30.8, 48],
      ],
      h: 1.2,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 北台地：看台嵌在它的南沿里；朝镜头的崖（看台两边露出来的一截）2.7 米厚
    {
      id: 'north-mesa',
      pts: [
        [-30, -20],
        [60, -20],
        [60, 8.6],
        [26.4, 8.6],
        [26.4, 9.4],
        [1.6, 9.4],
        [1.6, 8.6],
        [-30, 8.6],
      ],
      h: TOP,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 0,
    },
  ],
  strips: [
    // 南边进场：广场正中一条土路直上进场口
    // 第 2 轮：斜着弯进来（评判：直路）
    trail(
      'main',
      [
        [10.6, 72],
        [11.4, 65],
        [15.4, 59.4],
        [14.2, 54.8],
      ],
      2.2,
    ),
    // 去东口（→ 歇脚）：广场往东、绕过东南角的灯杆，顺东看台背后的廊道往北
    trail(
      'east',
      [
        [15.6, 59],
        [22, 58.6],
        [27.4, 55.4],
        [28.6, 48],
        [28.4, 40],
        [33, 37.2],
        [44, 37.2],
        [60, 37.2],
      ],
      1.8,
    ),
    // 去西北石阶（→ 练习场）：西看台背后的踏脚石
    stones('west', [
      [12.4, 59],
      [4, 58.6],
      [0.4, 54],
      [0.2, 40],
      [0.4, 26],
      [0.2, 17],
    ]),
    trail(
      'top',
      [
        [0, 9.4],
        [0, 2],
        [0, -20],
      ],
      1.6,
    ),
  ],
  stairs: [
    {
      id: 'nw-steps',
      x0: -1.2,
      x1: 1.4,
      z0: 7.6,
      z1: 15.2,
      axis: 'z',
      h0: TOP,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
  ],
  courts: [{ id: 'center', ...C, h: 0.02, axis: 'z', look: 'center' }],
  props: [...stands, ...match, ...frame],
  noWalk: [
    // 东西两边的台地（坐的人、树）不让走：只走廊道和场里
    rect(-30, 8.6, -2, 56),
    rect(30.4, 8.6, 60, 33.6),
    rect(30.4, 40.6, 60, 58),
    // 南边广场以外
    [
      [-30, 62],
      [8.8, 62],
      [8.8, 80],
      [-30, 80],
    ],
    [
      [14.2, 62],
      [60, 62],
      [60, 80],
      [14.2, 80],
    ],
  ],
  exits: [
    { to: 'arrive', entry: 'fromCourt', at: [11.2, 65.8], r: 2 },
    { to: 'practice', entry: 'fromCourt', at: [0, -3], r: 2 },
    { to: 'oasis', entry: 'fromCourt', at: [40, 37.2], r: 2.2 },
  ],
  entries: {
    fromArrive: { at: [13.2, 61.6], yaw: PI },
    fromPractice: { at: [0, 1.4], yaw: 0 },
    fromOasis: { at: [35.4, 37.2], yaw: -PI / 2 },
  },
  start: { at: [14, 56.4], yaw: PI },
  clouds: [[42, 16, 5, 3]],
  shot: { port: [14, 34], land: [14, 24] },
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-south', kind: 'door', at: [12.4, 63.6], yaw: PI, note: '南口（← 到达）' },
    { id: 'door-east', kind: 'door', at: [37.6, 37.2], yaw: -PI / 2, note: '东口（← 歇脚）' },
    { id: 'door-north', kind: 'door', at: [0, -0.4], yaw: 0, note: '西北石阶（← 练习场）' },
    { id: 'gate', kind: 'watch', at: [CX, FRONT_S + 2.4], yaw: PI, note: '进场口外，站着往场里看' },
    { id: 'gate-queue', kind: 'queue', at: [CX, FRONT_S + 4], yaw: PI, note: '进场排队的队头，往南排' },
    { id: 'base-n', kind: 'play', at: [CX, BASE_N - 0.6], yaw: 0, note: '北底线（发球）' },
    { id: 'base-s', kind: 'play', at: [CX, BASE_S + 0.8], yaw: PI, note: '南底线（接发）' },
    { id: 'net-post-e', kind: 'work', at: [C.x1 - 1.6, NET], yaw: -PI / 2, note: '东边网柱（总监：量网高、捡球）' },
    { id: 'bench-n', kind: 'rest', at: [C.x0 + 1.9, NET - 2.8], yaw: PI / 2, seat: 0.45, note: '球员席（北）前面' },
    { id: 'bench-s', kind: 'rest', at: [C.x0 + 1.9, NET + 2.8], yaw: PI / 2, seat: 0.45, note: '球员席（南）前面' },
    { id: 'tunnel', kind: 'door', at: [CX, C.z0 + 1.2], yaw: 0, note: '球员通道口（球员从这里出来）' },
    { id: 'baseline-sweep', kind: 'work', at: [CX + 4, BASE_S + 2.4], yaw: PI, note: '南底线后（总监：刷线、拖场）' },
    { id: 'east-walk', kind: 'watch', at: [28.6, 44], yaw: -PI / 2, note: '东廊（看台背后）' },
  ],
};
