// ════════════════════════════════════════════════════════════════════════════════════════
// A · 到达（下车 / 停车 → 过桥 → 上台阶 → 前台；歇脚在前台西边的树荫长椅）
//   竖屏（拉远 1.2，≈ 21 米宽；前台落在屏高一半上下）从上到下：
//   北崖山口（→ 球场）+ 崖顶蒲葵 = 上沿的框；露天前台（台地上一块石板小广场，前台东边一串踏脚石 → 喷泉广场）= 画面中间；
//   台地南沿只有一道崖：干河床（窄的冷色带）贴着崖脚流，河床北半边藏在台地下面（不再是"崖 + 河床北壁"两道墙）；
//   宽石阶从台地下到崖脚的一小块平台，一段短木桥（4 米）跨过河床；
//   河床南岸：桥头一棵假紫荆罩着长椅，石头、仙人掌成簇；
//   右下：小停车场（三个车位停一辆奶白车，落客的深蓝车停在通道里，代客亭、代客员、行李车和它并成一簇；四周围着矮灌木和棕榈）；
//   左下：公交站（候车亭里等车的人、刚下车拖箱子的人）；最下沿露一条马路（接驳车停在站前）。
//   公交站和停车场的人汇到同一条土路，斜着弯上去过桥。
//   层：干河床 −0.9（南岸是缓坡）/ 沙地、停车场 0 / 西边棕榈台、前台台地 1.2 / 北崖 4.2。
//   第 3 轮：两道斜墙合成一道、桥从 10 米缩到 4 米、停车场缩一半、整个下半屏往北收 9 米（D 55 → 42），前台进画面中间。
// ════════════════════════════════════════════════════════════════════════════════════════
import {
  band,
  blob,
  cluster,
  dashes,
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
const D = 42;

/** 干河床中心线：左上崖口 → 贴着台地崖脚 → 往东拐平出图 */
const WASH_A: V2[] = [
  [4.4, -14],
  [4.8, 4],
  [6.6, 11],
  [9.4, 15.8],
  [13, 17.6],
  [18, 19.8],
  [24, 22.2],
  [31, 24.2],
  [42, 25.4],
  [60, 26],
];

// ── 停车场：柏油 x 17.4…29.4、z 28.6…38；北边三个车位（车头朝北），南边是通道，东南角开口接马路 ──
const LOT = { x0: 17.4, x1: 29.4, z0: 28.6, z1: 38 };
const STALL = { x0: 21.3, w: 2.7, n: 3, z0: 29, z1: 34 };
const stallX = (i: number) => STALL.x0 + STALL.w * (i + 0.5);
const STALL_Z = (STALL.z0 + STALL.z1) / 2;
const ROAD_Z = 39.5;

/** 车位线：每个车位之间一条南北走的奶油白线 */
const stallLines: Strip[] = Array.from({ length: STALL.n + 1 }, (_, i): Strip => {
  const x = STALL.x0 + STALL.w * i;
  return {
    id: `stall${i}`,
    pts: [
      [x, STALL.z0 + 0.3],
      [x, STALL.z1],
    ],
    w: 0.14,
    mat: 'lotPaint',
    lift: 0.04,
  };
});

const lot: Prop[] = [
  // 停着的一辆奶白车（两个空位）
  { a: 'arrive:car', x: stallX(0), z: STALL_Z + 0.1, v: 0 },
  // 一簇 = 落客：深蓝的车停在通道里车头朝西（朝着代客亭）；代客员在车门边接钥匙，司机站在旁边；
  // 车尾一个会员从后备箱拿球拍包，行李车等着装包
  { a: 'arrive:valet-booth', x: 19, z: 35.2 },
  { a: 'arrive:car', x: 23.6, z: 35.7, r: PI / 2, v: 3 },
  { a: 'arrive:valet', x: 22.2, z: 37.2, r: 0, pose: 'handoff', v: 0 },
  { a: 'player', x: 22.3, z: 37.9, r: PI, pose: 'idle', v: 1 },
  { a: 'player', x: 26.5, z: 35.8, r: -PI / 2, pose: 'idle', prop: 'racket', v: 2 },
  { a: 'kit-bag', x: 26.4, z: 36.8, r: 0.3, v: 0 },
  { a: 'arrive:bag-trolley', x: 27.6, z: 37.2, r: -0.3 },
  // 俱乐部石碑：主路口的人行道上（下车第一眼看到）；代客牌在马路开口东边
  { a: 'arrive:monument', x: 15.4, z: 38.75 },
  { a: 'arrive:valet-sign', x: 30.6, z: 38.7 },
  // 停车场四周：矮灌木、棕榈成簇（北沿、东沿、西沿）
  ...cluster('creosote', 19.2, 27.6, [
    [0, 0, 0.8],
    [1.6, 0.3, 0.6],
  ]),
  ...cluster(
    'fan-palm',
    30.8,
    29.4,
    [
      [0, 0, 0.85],
      [1.2, 2.4, 0.6],
    ],
    { v0: 1 },
  ),
  ...cluster('brittlebush', 30.6, 34.2, [
    [0, 0, 0.8],
    [0.8, 1, 0.6],
    [-0.4, 1.8, 0.5],
  ]),
  ...cluster('brittlebush', 16.4, 31.4, [
    [0, 0, 0.75],
    [-0.3, 1.1, 0.55],
  ]),
];

const busStop: Prop[] = [
  // 公交站：候车亭里一个人坐着等车；刚下车的人拖着箱子往土路走；接驳车停在站前
  { a: 'bus-shelter', x: 7.6, z: 36.6 },
  { a: 'stop-pole', x: 9.9, z: 38.7 },
  { a: 'player', x: 7, z: 36.4, pose: 'sit', v: 3 },
  { a: 'player', x: 8.4, z: 36.4, pose: 'sip', prop: 'cup', v: 0 },
  { a: 'player', x: 12.4, z: 35.4, r: PI * 0.85, pose: 'walk', v: 1 },
  { a: 'suitcase', x: 12.9, z: 36, r: 0.3 },
  { a: 'shuttle', x: 4.6, z: 42.8 },
];

export const arrive: MapDef = {
  id: 'arrive',
  name: '到达',
  W: 28,
  D,
  view: VIEW(D),
  portraitZoom: 1.2,
  plates: [
    { id: 'ground', pts: rect(-30, -34, 60, 80), h: 0, top: 'floor', el: 'floor', wall: 'none', smooth: 0 },
    {
      id: 'west-ledge',
      pts: [
        [-30, 4],
        [1.6, 4],
        [4, 10],
        [4.6, 18],
        [3.6, 26],
        [4.4, 31],
        [3, 33.6],
        [-30, 34],
      ],
      h: 1.2,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.2,
    },
    {
      id: 'wash',
      pts: band(WASH_A, [4, 3.6, 3.4, 3.2, 3.2, 3.2, 3.4, 3.4, 3.4, 3.4]),
      h: -0.9,
      top: 'washBed',
      el: 'wash',
      wall: 'bluff',
      smooth: 1,
      walk: false,
      slope: 0.7,
    },
    {
      // 前台台地：南沿压在河床北半边上（壁一直下到河床底 −0.9）→ 画面里只有一道崖
      id: 'desk-mesa',
      pts: [
        [10, -34],
        [60, -34],
        [60, 25.2],
        [42, 24.6],
        [31, 23.4],
        [24, 21.4],
        [18.6, 19.2],
        [16.4, 14.4],
        [11, 13],
        [9.6, 6],
      ],
      h: 1.2,
      base: -0.9,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.2,
    },
    {
      id: 'bluff-w',
      pts: [
        [-30, -34],
        [20, -34],
        [20, 0],
        [17, 3.4],
        [12, 4.6],
        [8.2, 4.4],
        [7, 0.6],
        [2, 0.6],
        [0.6, 4.6],
        [-6, 5.6],
        [-30, 5],
      ],
      h: 4.2,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'bluff-e',
      pts: [
        [27, -34],
        [60, -34],
        [60, 5],
        [44, 6],
        [34, 4.6],
        [29.4, 3],
        [27.2, 0],
      ],
      h: 4,
      base: 1.2,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'plaza',
      pts: blob(20, 11.2, 5.2, 4, 16),
      h: 1.22,
      base: 1.2,
      top: 'flagstone',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    // 停车场：冷灰柏油（小一块），东南角开口接马路
    { id: 'lot', pts: rect(LOT.x0, LOT.z0, LOT.x1, LOT.z1), h: 0.03, top: 'road', el: 'none', wall: 'none', smooth: 0 },
    { id: 'drive', pts: rect(25, 37.8, 29.4, ROAD_Z + 0.2), h: 0.03, top: 'road', el: 'none', wall: 'none', smooth: 0 },
    { id: 'sidewalk-w', pts: rect(-30, 38, 25, ROAD_Z), h: 0.12, top: 'curb', el: 'none', wall: 'curb', smooth: 0 },
    { id: 'sidewalk-e', pts: rect(29.4, 38, 60, ROAD_Z), h: 0.12, top: 'curb', el: 'none', wall: 'curb', smooth: 0 },
    { id: 'road', pts: rect(-30, ROAD_Z, 60, 47), h: 0.02, top: 'road', el: 'none', wall: 'none', smooth: 0 },
  ],
  strips: [
    // 主路：公交站 → 斜着往右上弯 → 桥
    trail('main1', [
      [11.2, 38.6],
      [11.2, 35],
      [11.6, 30.6],
      [13.6, 26.2],
      [13.4, 22.2],
      [13.1, 19.8],
    ]),
    // 停车场的人从代客亭西边出来，汇到主路上
    trail(
      'lot',
      [
        [17.6, 33.4],
        [14.8, 32.4],
        [11.4, 31.4],
      ],
      1.6,
    ),
    trail('main3', [
      [13.1, 12.6],
      [14.4, 11.8],
      [15.8, 11.4],
    ]),
    trail('exit', [
      [22.4, 7.6],
      [23.4, 4],
      [23.6, -2],
      [23.4, -34],
    ]),
    stones('rest', [
      [15.6, 10.6],
      [13.6, 9.4],
      [12.6, 8.8],
    ]),
    // 去喷泉广场：前台东边一串踏脚石穿过草坪，走到东沿出图
    stones('club', [
      [25.4, 12.4],
      [28, 13.8],
      [30.4, 15],
      [33.4, 15.6],
    ]),
    ...stallLines,
    ...dashes('dash', -30, 60, 43.2, 2.4, 5),
  ],
  stairs: [
    // 宽石阶贴着崖下到崖脚，一段 4 米的短木桥跨过河床
    { id: 'steps', x0: 11.4, x1: 14.8, z0: 12.6, z1: 15.6, axis: 'z', h0: 1.2, h1: 0.25, kind: 'stairs' },
    { id: 'bridge', x0: 12, x1: 14.2, z0: 15.6, z1: 19.8, axis: 'z', h0: 0.25, h1: 0.15, kind: 'bridge' },
  ],
  courts: [],
  props: [
    ...busStop,
    ...lot,
    // 目的地：露天前台（台地上一块石板小广场）
    { a: 'front-desk', x: 20, z: 10 },
    { a: 'water-station', x: 24.6, z: 9.4, r: -0.4 },
    { a: 'pot', x: 16.6, z: 13.4 },
    { a: 'pot', x: 24, z: 14, v: 1 },
    { a: 'coach', x: 19.6, z: 8.9, pose: 'idle' },
    // 歇脚：前台西边、北崖脚下的树荫（崖的影子落在这里）+ 长椅
    { a: 'palo-verde', x: 12.2, z: 6, s: 1.15, v: 1 },
    { a: 'bench', x: 12.8, z: 7.9 },
    // 北崖顶：蒲葵（画面上沿的框），三四簇、大小不一
    ...cluster('fan-palm', -8, -2, [
      [0, 0],
      [3, 1.6],
      [-3, 2.2],
      [6.2, 0.4, 0.85],
    ]),
    ...cluster(
      'fan-palm',
      12,
      -3,
      [
        [0, 0],
        [3.4, 1.2, 0.9],
        [-2.2, 2.4, 0.8],
      ],
      { v0: 1 },
    ),
    ...cluster(
      'fan-palm',
      31,
      -1,
      [
        [0, 0],
        [3, 1.8, 0.85],
      ],
      { v0: 2 },
    ),
    ...cluster(
      'fan-palm',
      40,
      -2.4,
      [
        [0, 0],
        [3.4, 1.4],
        [-2.6, 2.2, 0.85],
      ],
      { v0: 0 },
    ),
    ...cluster('rocks', 16.4, 3.6, [[0, 0, 0.8]], { v0: 0 }),
    // 西边：棕榈台地（左边的框，最密）
    ...cluster(
      'fan-palm',
      1,
      10,
      [
        [0, 0],
        [2.4, 2.4, 0.75],
        [-3, 3.4, 0.9],
        [0.6, 6.2, 0.65],
      ],
      { v0: 2 },
    ),
    ...cluster(
      'fan-palm',
      1,
      22,
      [
        [0, 0, 0.8],
        [-3.2, 2.6],
        [1.2, 4.2, 0.65],
      ],
      { v0: 0 },
    ),
    ...cluster(
      'fan-palm',
      0.6,
      29.4,
      [
        [0, 0, 0.9],
        [-2.6, 1.8],
        [1.6, 2.6, 0.6],
      ],
      { v0: 1 },
    ),
    { a: 'smoke-tree', x: -7, z: 16, s: 1.1 },
    { a: 'smoke-tree', x: -8, z: 27 },
    ...cluster(
      'brittlebush',
      1.6,
      16,
      [
        [0, 0],
        [-1.2, 1.8, 0.8],
      ],
      { v0: 1 },
    ),
    { a: 'rocks', x: 3, z: 7.6, v: 0 },
    // 主路西边的沙地（棕榈台脚下）：棕榈 + 石头 + 脆灌木，一簇
    ...cluster(
      'fan-palm',
      7.4,
      24.6,
      [
        [0, 0, 0.85],
        [1.8, 1.6, 0.6],
      ],
      { v0: 2 },
    ),
    ...cluster('rocks', 6.4, 28.6, [
      [0, 0, 1.1],
      [1.4, 0.9, 0.7],
    ]),
    ...cluster('brittlebush', 9, 31.6, [
      [0, 0, 0.8],
      [-1, 0.9, 0.6],
    ]),
    // 西南角：候车亭西边、棕榈台脚下一簇矮灌木
    ...cluster('creosote', 1.4, 36.6, [
      [0, 0],
      [-2.2, 0.8, 0.8],
    ]),
    // 干河床：床里两块石头
    { a: 'rocks', x: 6.6, z: 12.4, v: 2, s: 0.7, y: -0.9 },
    { a: 'rocks', x: 33, z: 24.9, v: 0, s: 0.7, y: -0.9 },
    // 东边台地（右上的框）：烟树、假紫荆、石炭酸灌木
    { a: 'smoke-tree', x: 31, z: 12.4 },
    { a: 'palo-verde', x: 36.4, z: 18, s: 1.1 },
    { a: 'smoke-tree', x: 40.4, z: 9.4, s: 1.1 },
    ...cluster('creosote', 30, 18.6, [
      [0, 0],
      [2.4, 1.2, 0.85],
      [-1, 2.4, 0.75],
    ]),
    ...cluster(
      'fan-palm',
      38.6,
      20.6,
      [
        [0, 0],
        [3, 1, 0.85],
      ],
      { v0: 1 },
    ),
    ...cluster(
      'fan-palm',
      33.4,
      6.6,
      [
        [0, 0],
        [3.2, 1.2, 0.85],
        [6.4, 2.4, 0.9],
      ],
      { v0: 2 },
    ),
    // 桥南头：一棵假紫荆罩着一条长椅（等人来接的坐这儿），桥西头一簇龙舌兰
    { a: 'palo-verde', x: 17.8, z: 23, s: 1.05, v: 0 },
    { a: 'bench', x: 16.6, z: 24.8, r: -0.3 },
    { a: 'player', x: 16.3, z: 24.9, r: -0.3, pose: 'sit', prop: 'racket', v: 3, block: false },
    ...cluster('agave', 10.2, 21.8, [
      [0, 0, 0.9],
      [-1.3, 0.9, 0.65],
    ]),
    // 河床南岸：石头、仙人掌成簇（过渡带，不撒开）
    ...cluster('rocks', 21.6, 25.4, [
      [0, 0, 1.2],
      [1.6, 1.2, 0.75],
      [-1.2, 1.6, 0.6],
    ]),
    ...cluster('cholla', 25.8, 26.8, [
      [0, 0],
      [1.4, -0.4, 0.8],
      [2.2, 0.8, 0.65],
    ]),
    ...cluster('barrel-cactus', 34.4, 28.6, [
      [0, 0, 1.1],
      [1.6, 0.4, 0.75],
    ]),
    // 停车场东边（右下的框）
    { a: 'ocotillo', x: 33.2, z: 32.4 },
    { a: 'palo-verde', x: 35.6, z: 34.6, s: 1.05, v: 1 },
    ...cluster('creosote', 33, 36.2, [
      [0, 0],
      [2.6, 0.8, 0.85],
    ]),
    { a: 'smoke-tree', x: 40, z: 30.4 },
    // 马路对面（镜头跟着总监走到公交站时画面最下沿）：矮的石炭酸灌木、脆灌木
    ...cluster('creosote', -2, 48.6, [
      [0, 0],
      [3, 1, 0.8],
    ]),
    ...cluster('brittlebush', 14, 48.4, [
      [0, 0],
      [2.2, 1],
    ]),
    ...cluster('creosote', 27, 48.8, [
      [0, 0],
      [3, 1.2, 0.85],
      [6, 0.4, 0.7],
    ]),
  ],
  noWalk: [
    // 马路不能走；只留接驳车车门外一小块（下车的人站在马路上那一步：vistawalk 里写死的老路线从 [11, 42.2] 出发）
    rect(-30, ROAD_Z, 9.8, 80),
    rect(12.4, ROAD_Z, 60, 80),
    rect(9.8, 43.6, 12.4, 80),
    // 停车场东边的植物框
    rect(32, 27.6, 60, ROAD_Z),
    // 东边的草坪不能走，只留去广场的那串踏脚石一条 4 米宽的走廊（z 13.4…17.4，走到 x 36）
    rect(28.6, 4, 60, 13.4),
    rect(28.6, 17.4, 60, 23),
    rect(36, 13.4, 60, 17.4),
  ],
  exits: [
    { to: 'court', entry: 'fromArrive', at: [23.5, -3.6], r: 2 },
    // 前台东边的踏脚石 → 喷泉广场（原来通旧内场：clubgame ?inner=1 时把这个出口改回 'club'）
    { to: 'plaza', entry: 'fromArrive', at: [33.6, 15.6], r: 2 },
  ],
  entries: {
    start: { at: [10.8, 37.4], yaw: PI },
    fromCourt: { at: [23, 2.4], yaw: 0.1 },
    fromPlaza: { at: [28.4, 14], yaw: -PI / 2 },
    fromClub: { at: [28.4, 14], yaw: -PI / 2 },
  },
  start: { at: [10.8, 37.4], yaw: PI },
  clouds: [[38, 14, 5, 3]],
  shot: { port: [16.8, 10], land: [16, 20] },
  walks: [
    { name: '下车 → 前台', from: [10.8, 37.4], to: [20.4, 14] },
    { name: '下车 → 歇脚长椅', from: [10.8, 37.4], to: [13.4, 9.2] },
    { name: '停车场 → 前台', from: [21, 37.4], to: [20.4, 14] },
    { name: '下车 → 山口（→ 球场）', from: [10.8, 37.4], to: [23.5, -3.6], expect: 'court' },
    { name: '前台 → 东口（→ 喷泉广场）', from: [20.4, 14], to: [33.6, 15.6], expect: 'plaza' },
  ],
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-bus', kind: 'door', at: [10.8, 37.4], yaw: PI, note: '公交站下车（开局）' },
    { id: 'door-court', kind: 'door', at: [23.4, -1.2], yaw: PI, note: '北山口（→ 中心球场）' },
    { id: 'door-plaza', kind: 'door', at: [31.4, 15], yaw: -PI / 2, note: '东边踏脚石（→ 喷泉广场）' },
    { id: 'door-road', kind: 'door', at: [27.2, 39], yaw: PI, note: '停车场开口（车从马路进来）' },
    { id: 'desk', kind: 'work', at: [19.6, 8.8], yaw: 0, note: '前台后面（总监 / 前台员工）' },
    { id: 'desk-queue', kind: 'queue', at: [20.2, 12], yaw: PI, note: '前台前面排队的队头，往南排' },
    { id: 'water', kind: 'work', at: [24.2, 10.6], yaw: PI * 0.85, note: '水站（补水、换杯子）' },
    { id: 'bench-shade', kind: 'rest', at: [12.8, 8.5], yaw: 0, seat: 0.47, note: '树荫长椅' },
    { id: 'steps-top', kind: 'watch', at: [15.4, 12.2], yaw: PI * 0.8, note: '石阶顶上往下看桥和停车场' },
    { id: 'bridge', kind: 'watch', at: [13.1, 17.8], yaw: -PI / 2, note: '桥上靠着栏杆看河床' },
    { id: 'bench-bridge', kind: 'rest', at: [17.2, 25.5], yaw: -0.3, seat: 0.47, note: '桥南头树下的长椅（等人来接）' },
    { id: 'shelter', kind: 'rest', at: [7.8, 36.8], yaw: 0, seat: 0.47, note: '候车亭长椅' },
    { id: 'bus-queue', kind: 'queue', at: [9.6, 38.4], yaw: 0, note: '等车的队头（站牌边），往北排' },
    { id: 'valet-booth', kind: 'work', at: [19, 36.8], yaw: PI, note: '代客亭窗口（拿钥匙、挂钥匙）' },
    { id: 'valet', kind: 'work', at: [22.2, 37.2], yaw: 0, note: '落客的车门边（代客员接钥匙）' },
    { id: 'trunk', kind: 'work', at: [26.5, 35.8], yaw: -PI / 2, note: '后备箱（拿包、装行李车）' },
  ],
};
