// ════════════════════════════════════════════════════════════════════════════════════════
// A · 到达（下车 / 停车 → 过桥 → 上台阶 → 前台；歇脚在前台西边的树荫长椅）
//   竖屏（拉远 1.15，≈ 20 米宽、x 7…27）从上到下：
//   北崖山口（→ 球场）+ 崖顶蒲葵 = 上沿的框；露天前台（台地上一块石板小广场，前台东边一串踏脚石 → 喷泉广场）；
//   石阶下到小木桥，桥过干河床（冷色带，从左上崖口斜着流到右边，过了桥往东拐平）；
//   河床南岸一条沙地（石头、仙人掌簇 = 过渡）；
//   停车场（下半屏的安静大面：冷灰柏油，一排 7 个车位 5 辆车、两个空位；东头一段车棚罩着两辆，红车半遮在棚下；
//     西南角代客亭，通道里一辆落客的车开着门：代客员接钥匙、后备箱边有人拿球拍包、行李车等着装包）；
//   左下公交站（候车亭里坐着等车的人，刚下车拖箱子的人往路上走）+ 接驳车停在马路上；
//   马路（最下沿，自然边界）。公交站和停车场的人汇到同一条土路上，土路斜着弯上去过桥。
//   层：干河床 −1.3 / 沙地、停车场 0 / 西边棕榈台 1.2、前台台地 1.8 / 北崖 4.2。
//   第三轮（round-1）：下半屏原来是一大片空沙（平静 79%），旧内场的停车场（clubpark）并进来。
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
const D = 55;

const WASH_A: V2[] = [
  [4.4, -14],
  [4.6, 4],
  [7, 12],
  [12, 21],
  [18.5, 27],
  [25, 30.6],
  [32, 32.2],
  [42, 32.8],
  [60, 33.4],
];

// ── 停车场：柏油 x 15.6…36.4、z 36.8…47.5；北边一排车位（车头朝北），南边是通道，东头开口接马路 ──
const LOT = { x0: 15, x1: 36.4, z0: 36.8, z1: 47.5 };
const STALL = { x0: 16.2, w: 2.7, n: 7, z0: 37.2, z1: 42.4 };
const stallX = (i: number) => STALL.x0 + STALL.w * (i + 0.5);
const STALL_Z = (STALL.z0 + STALL.z1) / 2;

/** 车位线：每个车位之间一条南北走的奶油白线 + 车位南头一条横线 */
const stallLines: Strip[] = [
  ...Array.from({ length: STALL.n + 1 }, (_, i): Strip => {
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
  }),
];

const lot: Prop[] = [
  // 车棚罩着东头四个车位（4 号、5 号有车：红车半遮在棚下）
  { a: 'arrive:carport', x: STALL.x0 + STALL.w * 5, z: STALL_Z, block: false },
  // 一排车（车头朝北），两个空位
  // 四种颜色：深蓝、奶油、红（只一辆，在棚下）、薄荷（落客的那辆）
  { a: 'arrive:car', x: stallX(0), z: STALL_Z + 0.2, v: 3 },
  { a: 'arrive:suv', x: stallX(2), z: STALL_Z + 0.1, v: 4 },
  { a: 'arrive:car', x: stallX(4), z: STALL_Z - 0.2, v: 2 },
  { a: 'arrive:car', x: stallX(5), z: STALL_Z, v: 0 },
  { a: 'arrive:suv', x: stallX(6), z: STALL_Z + 0.1, v: 3 },
  // 落客：通道里一辆薄荷绿的车车头朝西、门开着；代客员站在车门边接钥匙，车尾一个会员从后备箱拿球拍包，行李车等着装包
  { a: 'arrive:car', x: 21.6, z: 44.9, r: PI / 2, v: 8 },
  { a: 'arrive:valet', x: 20.4, z: 46.2, r: 0, pose: 'handoff', v: 0 },
  { a: 'player', x: 20.5, z: 47.1, r: PI, pose: 'idle', v: 1 },
  { a: 'player', x: 24.5, z: 45.2, r: -PI / 2, pose: 'idle', prop: 'racket', v: 2 },
  { a: 'kit-bag', x: 24.4, z: 46.1, r: 0.3, v: 0 },
  { a: 'arrive:bag-trolley', x: 25.8, z: 46.3, r: -0.3 },
  // 代客亭（西南角，窗口朝镜头）
  { a: 'arrive:valet-booth', x: 16.8, z: 45.6 },
  // 入口：俱乐部石碑（开口西边，朝马路）+ 代客牌
  { a: 'arrive:monument', x: 26.9, z: 48.25 },
  { a: 'arrive:valet-sign', x: 35.6, z: 48.2 },
];

const busStop: Prop[] = [
  // 公交站：候车亭里一个人坐着等车；刚下车的人拖着箱子往土路走；接驳车停在站前
  { a: 'bus-shelter', x: 5.8, z: 45.4 },
  { a: 'stop-pole', x: 8.8, z: 47.9 },
  { a: 'player', x: 5.2, z: 45.2, pose: 'sit', v: 3 },
  { a: 'player', x: 6.6, z: 45.2, pose: 'sip', prop: 'cup', v: 0 },
  { a: 'player', x: 11.2, z: 44.6, r: PI * 0.85, pose: 'walk', v: 1 },
  { a: 'suitcase', x: 11.7, z: 45.2, r: 0.3 },
  { a: 'shuttle', x: 3.6, z: 52.2 },
];

export const arrive: MapDef = {
  id: 'arrive',
  name: '到达',
  W: 28,
  D,
  view: VIEW(D),
  portraitZoom: 1.15,
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, 80), h: 0, top: 'floor', el: 'floor', wall: 'none', smooth: 0 },
    {
      id: 'west-ledge',
      pts: [
        [-30, 4],
        [1.6, 4],
        [4.4, 10],
        [5, 20],
        [3.8, 30],
        [5, 39],
        [3.4, 42],
        [-30, 42.4],
      ],
      h: 1.2,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.2,
    },
    {
      id: 'wash',
      pts: band(WASH_A, [4, 4, 4.4, 4.8, 4.8, 4.4, 4.2, 4, 4]),
      h: -1.3,
      top: 'washBed',
      el: 'wash',
      wall: 'bluff',
      smooth: 1,
      walk: false,
    },
    {
      id: 'desk-mesa',
      pts: [
        [10, -16],
        [60, -16],
        [60, 27.6],
        [42, 27.2],
        [31, 25.2],
        [24, 22.5],
        [17, 18],
        [12.4, 13],
        [10.4, 6],
      ],
      h: 1.8,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.2,
    },
    {
      id: 'bluff-w',
      pts: [
        [-30, -16],
        [20, -16],
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
        [27, -16],
        [60, -16],
        [60, 5],
        [44, 6],
        [34, 4.6],
        [29.4, 3],
        [27.2, 0],
      ],
      h: 4,
      base: 1.8,
      top: 'mesa',
      el: 'mesa',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'plaza',
      pts: blob(20, 11.6, 5.4, 4.2, 16),
      h: 1.82,
      base: 1.8,
      top: 'flagstone',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    // 停车场：冷灰柏油（下半屏的安静大面），东头开口接马路
    {
      id: 'lot',
      pts: rect(LOT.x0, LOT.z0, LOT.x1, LOT.z1),
      h: 0.03,
      top: 'road',
      el: 'none',
      wall: 'none',
      smooth: 0,
    },
    { id: 'drive', pts: rect(29.6, 47, 34.4, 49.2), h: 0.03, top: 'road', el: 'none', wall: 'none', smooth: 0 },
    { id: 'sidewalk-w', pts: rect(-30, 47.5, 29.6, 49), h: 0.12, top: 'curb', el: 'none', wall: 'curb', smooth: 0 },
    { id: 'sidewalk-e', pts: rect(34.4, 47.5, 60, 49), h: 0.12, top: 'curb', el: 'none', wall: 'curb', smooth: 0 },
    { id: 'road', pts: rect(-30, 49, 60, 55.6), h: 0.02, top: 'road', el: 'none', wall: 'none', smooth: 0 },
  ],
  strips: [
    // 主路：公交站 → 斜着往右上弯 → 桥
    trail('main1', [
      [9.8, 47.4],
      [10.2, 43.4],
      [11.8, 38.8],
      [13.8, 34.2],
      [13.4, 29.6],
      [13.1, 27.6],
    ]),
    // 停车场的人从代客亭北边出来，汇到主路上
    trail(
      'lot',
      [
        [19.4, 43.6],
        [16, 43.2],
        [13.4, 42],
        [11, 41.2],
      ],
      1.6,
    ),
    trail('main3', [
      [13.1, 13.4],
      [14.4, 12.4],
      [15.8, 11.8],
    ]),
    trail('exit', [
      [22.4, 7.6],
      [23.4, 4],
      [23.6, -2],
      [23.4, -16],
    ]),
    stones('rest', [
      [15.6, 10.8],
      [13.6, 9.6],
      [12.6, 8.8],
    ]),
    // 去喷泉广场：前台东边一串踏脚石穿过草坪，走到东沿出图
    stones('club', [
      [25.6, 12.6],
      [28, 13.8],
      [30.4, 15],
      [33.4, 15.6],
    ]),
    ...stallLines,
    ...dashes('dash', -30, 60, 52.3, 2.4, 5),
  ],
  stairs: [
    { id: 'bridge', x0: 12, x1: 14.2, z0: 17.4, z1: 27.6, axis: 'z', h0: 0.15, h1: 0.15, kind: 'bridge' },
    { id: 'steps', x0: 11.6, x1: 14.6, z0: 13, z1: 17.4, axis: 'z', h0: 1.8, h1: 0.15, kind: 'stairs' },
  ],
  courts: [],
  props: [
    ...busStop,
    ...lot,
    // 目的地：露天前台（台地上一块石板小广场）
    { a: 'front-desk', x: 20, z: 10.2 },
    { a: 'water-station', x: 24.8, z: 9.6, r: -0.4 },
    { a: 'pot', x: 16, z: 14.4 },
    { a: 'pot', x: 24.4, z: 14.2, v: 1 },
    { a: 'coach', x: 19.6, z: 9.1, pose: 'idle' },
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
        [2.6, 2.4, 0.75],
        [-3, 3.4, 0.9],
        [0.6, 6.2, 0.65],
      ],
      { v0: 2 },
    ),
    ...cluster(
      'fan-palm',
      1.6,
      26,
      [
        [0, 0, 0.8],
        [-3.2, 2.6],
        [1.4, 4.2, 0.65],
      ],
      { v0: 0 },
    ),
    ...cluster(
      'fan-palm',
      1,
      36.4,
      [
        [0, 0, 0.9],
        [2.6, 2.6, 0.7],
        [-2.6, 4.6],
        [0.4, 6.8, 0.6],
      ],
      { v0: 1 },
    ),
    { a: 'smoke-tree', x: -7, z: 18, s: 1.1 },
    { a: 'smoke-tree', x: -8, z: 31 },
    ...cluster(
      'brittlebush',
      1.6,
      16.6,
      [
        [0, 0],
        [-1.2, 1.8, 0.8],
      ],
      { v0: 1 },
    ),
    { a: 'rocks', x: 3, z: 7.6, v: 0 },
    { a: 'rocks', x: 2.6, z: 39.6, v: 2 },
    // 主路西边的沙地（棕榈台脚下）：一棵烟树 + 石头 + 脆灌木，一簇
    ...cluster(
      'fan-palm',
      7.6,
      30.8,
      [
        [0, 0, 0.9],
        [1.8, 1.6, 0.65],
      ],
      { v0: 2 },
    ),
    ...cluster('rocks', 6.6, 34.4, [
      [0, 0, 1.1],
      [1.4, 0.9, 0.7],
    ]),
    ...cluster('brittlebush', 9.2, 36.4, [
      [0, 0, 0.8],
      [-1, 0.9, 0.6],
    ]),
    // 西南角：候车亭西边、棕榈台脚下一簇矮灌木
    ...cluster('creosote', 1.6, 45, [
      [0, 0],
      [-2.2, 0.8, 0.8],
    ]),
    // 干河床：床里两块石头
    { a: 'rocks', x: 6.6, z: 14.4, v: 2, s: 0.7, y: -1.3 },
    { a: 'rocks', x: 30.4, z: 32, v: 0, s: 0.7, y: -1.3 },
    // 东边台地（右上的框）：烟树、假紫荆、石炭酸灌木
    { a: 'smoke-tree', x: 31, z: 12.4 },
    { a: 'palo-verde', x: 36.4, z: 18, s: 1.1 },
    { a: 'smoke-tree', x: 40.4, z: 9.4, s: 1.1 },
    ...cluster('creosote', 30, 20.4, [
      [0, 0],
      [2.4, 1.6, 0.85],
      [-1, 3.4, 0.75],
    ]),
    ...cluster(
      'fan-palm',
      38.6,
      23.4,
      [
        [0, 0],
        [3, 1.6, 0.85],
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
    { a: 'smoke-tree', x: 29.4, z: 24.6, s: 0.9 },
    // 河床北岸：龙舌兰、一块石头
    ...cluster('agave', 26, 25.6, [
      [0, 0],
      [1.6, 0.8, 0.8],
      [3.4, -0.2, 0.7],
    ]),
    { a: 'rocks', x: 34.6, z: 27.4, v: 1 },
    // 桥南头：一棵假紫荆罩着一条长椅（等人来接的、等车的坐这儿），桥西头一簇龙舌兰
    { a: 'palo-verde', x: 17.6, z: 30.6, s: 1.1, v: 0 },
    { a: 'bench', x: 16.6, z: 32.4, r: -0.3 },
    { a: 'player', x: 16.3, z: 32.5, r: -0.3, pose: 'sit', prop: 'racket', v: 3, block: false },
    ...cluster('agave', 10.4, 29.6, [
      [0, 0, 0.9],
      [-1.3, 0.9, 0.65],
    ]),
    // 河床南岸到停车场：石头、仙人掌成簇（过渡带，不撒开）
    ...cluster('rocks', 19.8, 33.4, [
      [0, 0, 1.3],
      [1.7, 1.4, 0.8],
      [-1.2, 1.9, 0.6],
    ]),
    ...cluster('cholla', 23.6, 34.6, [
      [0, 0],
      [1.5, -0.7, 0.8],
      [2.4, 0.8, 0.65],
    ]),
    ...cluster('barrel-cactus', 30.6, 35.4, [
      [0, 0, 1.1],
      [1.6, 0.4, 0.75],
    ]),
    ...cluster('brittlebush', 17, 36.4, [
      [0, 0, 0.8],
      [1.2, 0.4, 0.55],
    ]),
    // 停车场西南角（代客亭和主路之间）、北沿：几丛矮的脆灌木和龙舌兰（车位旁边一点绿）
    ...cluster('brittlebush', 13.4, 45.6, [
      [0, 0, 0.85],
      [0.9, 1, 0.6],
      [-0.8, 0.9, 0.55],
    ]),
    ...cluster('agave', 26.8, 35.4, [
      [0, 0, 0.8],
      [1.2, 0.5, 0.6],
    ]),
    // 停车场东边（右下的框）：烟树、豹木、仙人掌、灌木成簇
    { a: 'ocotillo', x: 37.8, z: 36.2 },
    { a: 'palo-verde', x: 39.6, z: 39.4, s: 1.05, v: 1 },
    ...cluster('rocks', 37.4, 46.2, [
      [0, 0, 0.9],
      [1.2, 0.6, 0.6],
    ]),
    ...cluster('creosote', 38.6, 43.6, [
      [0, 0],
      [2.6, 1.2, 0.85],
      [0.6, 2.6, 0.7],
    ]),
    ...cluster(
      'fan-palm',
      43,
      37,
      [
        [0, 0],
        [2.4, 3, 0.8],
      ],
      { v0: 1 },
    ),
    // 马路对面：矮的石炭酸灌木、脆灌木（画面下沿）
    ...cluster('creosote', -4, 58, [
      [0, 0],
      [3, 1.2, 0.8],
    ]),
    ...cluster('brittlebush', 14, 57.8, [
      [0, 0],
      [2.2, 1.2],
    ]),
    ...cluster('creosote', 28, 58.6, [
      [0, 0],
      [3, 1.5, 0.85],
      [6, 0.4, 0.7],
    ]),
  ],
  noWalk: [
    rect(-30, 49, 60, 80),
    // 停车场东边的植物框
    rect(37.4, 34.6, 60, 49),
    // 东边的草坪不能走，只留去广场的那串踏脚石一条 4 米宽的走廊（z 13.4…17.4，走到 x 36）
    rect(28.6, 4, 60, 13.4),
    rect(28.6, 17.4, 60, 27.2),
    rect(36, 13.4, 60, 17.4),
  ],
  exits: [
    { to: 'court', entry: 'fromArrive', at: [23.5, -3.6], r: 2 },
    // 前台东边的踏脚石 → 喷泉广场（原来通旧内场：clubgame ?inner=1 时把这个出口改回 'club'）
    { to: 'plaza', entry: 'fromArrive', at: [33.6, 15.6], r: 2 },
  ],
  entries: {
    start: { at: [9.6, 46.4], yaw: PI },
    fromCourt: { at: [23, 2.4], yaw: 0.1 },
    fromPlaza: { at: [28.4, 14], yaw: -PI / 2 },
    fromClub: { at: [28.4, 14], yaw: -PI / 2 },
  },
  start: { at: [9.6, 46.4], yaw: PI },
  clouds: [[38, 14, 5, 3]],
  shot: { port: [19, 30], land: [16, 28] },
  walks: [
    { name: '下车 → 前台', from: [9.6, 46.4], to: [20.4, 14.6] },
    { name: '下车 → 歇脚长椅', from: [9.6, 46.4], to: [13.4, 9.2] },
    { name: '停车场 → 前台', from: [24, 43.6], to: [20.4, 14.6] },
    { name: '下车 → 山口（→ 球场）', from: [9.6, 46.4], to: [23.5, -3.6], expect: 'court' },
    { name: '前台 → 东口（→ 喷泉广场）', from: [20.4, 14.6], to: [33.6, 15.6], expect: 'plaza' },
  ],
  // 兴趣点（给"人和活"那条线；画面不读）
  spots: [
    { id: 'door-bus', kind: 'door', at: [9.6, 46.4], yaw: PI, note: '公交站下车（开局）' },
    { id: 'door-court', kind: 'door', at: [23.4, -1.2], yaw: PI, note: '北山口（→ 中心球场）' },
    { id: 'door-plaza', kind: 'door', at: [31.4, 15], yaw: -PI / 2, note: '东边踏脚石（→ 喷泉广场）' },
    { id: 'door-road', kind: 'door', at: [32, 48.4], yaw: PI, note: '停车场开口（车从马路进来）' },
    { id: 'desk', kind: 'work', at: [19.6, 9.0], yaw: 0, note: '前台后面（总监 / 前台员工）' },
    { id: 'desk-queue', kind: 'queue', at: [20.2, 12.2], yaw: PI, note: '前台前面排队的队头，往南排' },
    { id: 'water', kind: 'work', at: [24.4, 10.8], yaw: PI * 0.85, note: '水站（补水、换杯子）' },
    { id: 'bench-shade', kind: 'rest', at: [12.8, 8.5], yaw: 0, seat: 0.47, note: '树荫长椅' },
    { id: 'steps-top', kind: 'watch', at: [14.8, 12.6], yaw: PI * 0.8, note: '石阶顶上往下看桥和停车场' },
    { id: 'bridge', kind: 'watch', at: [13.1, 22.4], yaw: -PI / 2, note: '桥上靠着栏杆看河床' },
    { id: 'bench-bridge', kind: 'rest', at: [17.2, 33.1], yaw: -0.3, seat: 0.47, note: '桥南头树下的长椅（等人来接）' },
    { id: 'shelter', kind: 'rest', at: [6, 45.6], yaw: 0, seat: 0.47, note: '候车亭长椅' },
    { id: 'bus-queue', kind: 'queue', at: [8.4, 46.9], yaw: 0, note: '等车的队头（站牌边），往北排' },
    { id: 'valet-booth', kind: 'work', at: [16.8, 47.2], yaw: PI, note: '代客亭窗口（拿钥匙、挂钥匙）' },
    { id: 'valet', kind: 'work', at: [20.4, 46.2], yaw: 0, note: '落客的车门边（代客员接钥匙）' },
    { id: 'trunk', kind: 'work', at: [24.5, 45.2], yaw: -PI / 2, note: '后备箱（拿包、装行李车）' },
  ],
};
