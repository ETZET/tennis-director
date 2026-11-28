// ════════════════════════════════════════════════════════════════════════════════════════
// E · 喷泉广场（棕榈喷泉 + 会所正面 + 餐车集市角）：整个俱乐部的中枢，四个口
//   竖屏一屏（拉远 1.15，≈ 20 米宽）从上到下：
//   会所正面（白灰泥墙、陶土褐瓦檐，正中拱顶正门 → 大堂，两边各两扇拱窗、三角梅；屋后一排树冠）= 画面上沿的框；
//   墙脚：树池 + 小棕榈、陶罐成对；门前一小块石板前庭；
//   喷泉（焦点，冷色）：两层碗的棕榈喷泉落在一块浅米石的圆广场正中，池沿南边坐着两个人歇脚，一个孩子在池边伸手玩水、
//     另一个孩子绕着池子跑，家长站在西边看；西边一棵大烟树下一条长椅，东边总监的保洁车停在棕榈荫里；
//   东南：餐车集市角（沙色铺地上）—— 一辆薄荷色的圆头咖啡车（不抢喷泉）窗口排着两个人，
//     东头一辆奶茶三轮；中间两张野餐桌 + 米白伞，有人坐着吃；西沿两根灯柱拉一串灯（夜里亮）。
//   路：西口（← 到达）进来的灰沙路斜着弯上喷泉广场；广场往东分出去到东口（→ 球场街），往南弯下去到南口（→ 果岭）；
//     北边石板前庭直通会所正门（→ 大堂）。
//   边框：西、东两边 1.1 米的棕榈台（三种尺寸成簇，朝镜头的崖是冷暗带），两边各留一个豁口给路；南边一排灌木 + 棕榈，留南口。
//   层：地面（草）0 / 广场石板、集市铺地 0.02 / 西东棕榈台 1.1 / 会所 3.3。
// ════════════════════════════════════════════════════════════════════════════════════════
import { blob, cluster, type MapDef, type Prop, rect, stones, trail, type V2 } from './mapdef';

const PI = Math.PI;
const WALL_Z = 5;
/** 喷泉中心（池壁外半径 4.6，压顶高 0.6） */
const FX = 14;
const FZ = 19;
const RIM = 4.3;
/** 池沿上一点（角度：0 = 东，90 = 南 = 朝镜头） */
const rim = (deg: number, r = RIM): V2 => [FX + Math.cos((deg * PI) / 180) * r, FZ + Math.sin((deg * PI) / 180) * r];

const house: Prop[] = [
  { a: 'back-door', x: FX, z: WALL_Z, block: false },
  { a: 'arch-window', x: 3.6, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 8.2, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 19.8, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 24.4, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: -1, z: WALL_Z, y: 0.9, block: false },
  { a: 'arch-window', x: 29, z: WALL_Z, y: 0.9, block: false },
  { a: 'bougainvillea', x: 11.9, z: WALL_Z + 0.15, block: false },
  { a: 'bougainvillea', x: 16.1, z: WALL_Z + 0.15, block: false },
  // 会所招牌：门西边两扇窗之间的墙上（不写字：会徽）
  { a: 'plaza:sign', x: 5.9, z: WALL_Z + 0.3, y: 1.9, block: false },
  // 墙脚：树池 + 小棕榈、陶罐成对
  { a: 'tree-planter', x: 1.2, z: WALL_Z + 1.7 },
  { a: 'fan-palm', x: 1.2, z: WALL_Z + 1.7, y: 0.6, s: 0.6, v: 1, block: false },
  { a: 'tree-planter', x: 22, z: WALL_Z + 1.7 },
  { a: 'fan-palm', x: 22, z: WALL_Z + 1.7, y: 0.6, s: 0.55, v: 2, block: false },
  ...cluster('pot', 10.4, WALL_Z + 1.1, [
    [0, 0, 1],
    [0.8, 0.4, 0.7],
  ]),
  ...cluster('pot', 17.2, WALL_Z + 1.1, [
    [0, 0, 0.8],
    [0.8, -0.1, 1],
  ]),
  // 门东边一个会员推门出来（往广场走）
  { a: 'player', x: 15.4, z: 7.6, r: 0.3, pose: 'walk', v: 3, block: false, prop: 'racket' },
];

const fountain: Prop[] = [
  { a: 'plaza:fountain', x: FX, z: FZ, block: 4.75 },
  { a: 'plaza:spray', x: FX, z: FZ, block: false },
  // 池沿南边坐着两个人（背对池子、朝镜头），一个喝水
  { a: 'player', x: rim(112)[0], z: rim(112)[1], r: 0.35, pose: 'sit', seat: [0.6, 0], v: 1, block: false },
  {
    a: 'player',
    x: rim(124)[0],
    z: rim(124)[1],
    r: 0.6,
    pose: 'sip',
    prop: 'cup',
    seat: [0.6, 0],
    v: 2,
    block: false,
  },
  // 孩子：东南池沿边伸手玩水（朝池子）；另一个绕着池子跑；家长站在西南看
  { a: 'kid', x: rim(55, 5.05)[0], z: rim(55, 5.05)[1], r: PI + 0.95, pose: 'idle', v: 0 },
  { a: 'kid', x: 20.6, z: 24.4, r: -0.9, pose: 'walk', v: 2 },
  { a: 'coach', x: 7.4, z: 23.4, r: 1.1, pose: 'idle', v: 0, look: [19.4, 1, 23] },
  // 西边：大烟树下一条长椅（树在长椅东北，影子落在椅子上）
  { a: 'smoke-tree', x: 5.6, z: 13.6, s: 1.1 },
  { a: 'bench', x: 4.4, z: 16.6, r: PI / 2 },
  { a: 'player', x: 4.5, z: 16.2, r: PI / 2, pose: 'sit', v: 0, block: false, prop: 'racket' },
  { a: 'plaza:drink-fountain', x: 3.4, z: 19.6, r: PI / 2 },
  // 东边：总监的保洁车（捞网、扫帚）停在棕榈荫里
  { a: 'fan-palm', x: 24.4, z: 13.2, s: 1.05, v: 1 },
  { a: 'fan-palm', x: 25.8, z: 15.6, s: 0.7, v: 2 },
  { a: 'plaza:leaf-cart', x: 22.4, z: 17, r: -PI / 2 },
  // 广场边两根灯柱（西口、东北角，不对称；夜里亮），广场边上陶罐成对
  { a: 'plaza-lamp', x: 5.6, z: 26.2 },
  { a: 'plaza-lamp', x: 18.4, z: 11.4 },
  ...cluster('pot', 21.4, 13.4, [
    [0, 0, 1],
    [0.8, 0.5, 0.7],
  ]),
  ...cluster('pot', 6.6, 22.4, [
    [0, 0, 0.9],
    [-0.7, 0.6, 0.7],
  ]),
  // 广场西北角一簇棕榈（大中小），叶冠不压水面
  { a: 'fan-palm', x: 6.4, z: 10.6, s: 0.8, v: 0 },
  // 广场西南：一圈陶罐 + 龙舌兰的小花坛（池子和西口之间的一个记号）
  ...cluster('agave', 4.2, 24.6, [
    [0, 0, 0.7],
    [1, 0.6, 0.5],
  ]),
  // 西南草地：一棵烟树、树荫里一条长椅，一个老会员坐着看报（看着广场）
  { a: 'smoke-tree', x: 5.4, z: 33.2, s: 1 },
  { a: 'bench', x: 4.6, z: 36.6 },
  { a: 'player', x: 4.6, z: 36.7, pose: 'sit', v: 4, block: false },
];

const market: Prop[] = [
  // 薄荷色的圆头咖啡车（第 2 轮：橙色塔可车比喷泉还艳、抢焦点 → 换成冷一点的这辆），服务窗朝镜头；
  // 窗口一个大人一个孩子排队，车里一个摊主
  { a: 'kiosk', x: 20, z: 31.6, block: 'box' },
  { a: 'player', x: 19.7, z: 32.25, y: 0.85, r: 0, pose: 'idle', v: 4, block: false },
  { a: 'player', x: 19.7, z: 33.7, r: PI, pose: 'idle', v: 1 },
  { a: 'kid', x: 20.2, z: 34.8, r: PI - 0.3, pose: 'idle', v: 1 },
  // 刚买好的一个人端着吃的往桌子走
  { a: 'player', x: 17.6, z: 35.6, r: -0.7, pose: 'walk', v: 2, prop: 'none' },
  // 奶茶三轮（东头，朝西南）+ 一个人在台面前
  { a: 'plaza:boba', x: 24.4, z: 38.2, r: -0.5, block: 'box' },
  { a: 'player', x: 23.4, z: 39.8, r: PI - 0.5, pose: 'idle', v: 3 },
  // 野餐桌两张 + 米白伞（大 / 小）；有人坐着吃
  { a: 'cafe-table', x: 16.4, z: 38.8, block: 'box' },
  { a: 'parasol', x: 16.4, z: 38.8, v: 0, block: false },
  { a: 'player', x: 16.2, z: 38.18, r: PI, pose: 'sit', seat: [0.46, 0], v: 2, block: false },
  { a: 'player', x: 16.7, z: 39.42, r: 0, pose: 'sip', prop: 'cup', seat: [0.46, 0], v: 0, block: false },
  { a: 'cafe-table', x: 20.4, z: 41.8, block: 'box' },
  { a: 'parasol', x: 20.4, z: 41.8, v: 1, block: false },
  { a: 'coach', x: 20.6, z: 42.42, r: 0, pose: 'sip', prop: 'cup', seat: [0.46, 0], block: false },
  // 西沿两根灯柱 + 一串灯（灯柱 2.6 米处的短臂拴灯）
  { a: 'plaza-lamp', x: 13.9, z: 42.4 },
  { a: 'plaza-lamp', x: 13.9, z: 37.4 },
  { a: 'plaza:festoon', x: 14.3, z: 42.4, y: 0.1, block: false },
  // 车后一摞货箱
  { a: 'supply-stack', x: 24.6, z: 33.2, r: -0.4, block: 'box' },
];

const frame: Prop[] = [
  // 会所后面一排树（屋顶后面冒出来的树冠）
  ...cluster('fan-palm', 2, -3.6, [
    [0, 0, 1.2],
    [3, -1, 0.85],
    [-3.4, 0.4, 1],
  ]),
  ...cluster('smoke-tree', 13, -4.6, [
    [0, 0, 1.15],
    [3.8, 0.6, 0.85],
  ]),
  ...cluster(
    'fan-palm',
    23.6,
    -3.8,
    [
      [0, 0, 1.15],
      [3.2, -1, 0.75],
      [6, 0.2, 0.95],
    ],
    { v0: 1 },
  ),
  ...cluster('palo-verde', -10, -4, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.8],
  ]),
  ...cluster('palo-verde', 37, -4, [
    [0, 0, 1.1],
    [3.6, 0.6, 0.8],
  ]),
  // 西边棕榈台（北段、南段；中间留路口）
  ...cluster('fan-palm', -4.2, 9, [
    [0, 0, 1.2],
    [2.2, 2.8, 0.7],
    [-2.6, 3.4, 0.9],
  ]),
  ...cluster(
    'fan-palm',
    -4,
    20.4,
    [
      [0, 0, 0.9],
      [1.6, 2.4, 1.2],
      [-2.4, 3.8, 0.65],
    ],
    { v0: 1 },
  ),
  ...cluster('smoke-tree', -10, 14, [
    [0, 0, 1.1],
    [-1.6, 5, 0.8],
  ]),
  ...cluster('agave', -2.6, 25.4, [
    [0, 0, 0.8],
    [1.2, -0.6, 0.55],
  ]),
  ...cluster('rocks', -3, 36.4, [
    [0, 0, 1.3],
    [1.6, 1.2, 0.8],
    [-1.4, 1.8, 1],
  ]),
  ...cluster(
    'fan-palm',
    -4.6,
    40.6,
    [
      [0, 0, 1.15],
      [2.4, 2.4, 0.7],
      [-2.4, 2.8, 0.9],
    ],
    { v0: 2 },
  ),
  ...cluster('palo-verde', -11, 42, [
    [0, 0, 1.1],
    [2.6, 3.4, 0.8],
  ]),
  // 东边棕榈台（北段、南段；中间留路口）
  ...cluster(
    'fan-palm',
    31.6,
    9.4,
    [
      [0, 0, 1.15],
      [2.6, 2.2, 0.75],
      [-0.6, 4.2, 0.9],
    ],
    { v0: 2 },
  ),
  ...cluster('creosote', 30.4, 19.2, [
    [0, 0, 0.9],
    [1.8, -1, 0.7],
  ]),
  ...cluster('palo-verde', 38, 13, [
    [0, 0, 1.1],
    [2.6, 3.4, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    32,
    33.6,
    [
      [0, 0, 1.2],
      [-0.4, 3.8, 0.7],
      [2.6, 1.4, 0.9],
    ],
    { v0: 0 },
  ),
  ...cluster('brittlebush', 30.4, 43, [
    [0, 0, 1],
    [2, 1.6, 0.8],
    [-1.4, 2.6, 0.7],
  ]),
  ...cluster('smoke-tree', 38.6, 38, [
    [0, 0, 1.1],
    [-0.6, 5, 0.85],
  ]),
  // 草地上稀疏的几簇灌木（喷泉西南、广场东北各一簇）
  ...cluster('brittlebush', 1.2, 39.4, [
    [0, 0, 0.7],
    [1.2, 0.8, 0.5],
    [-0.6, 1.2, 0.45],
  ]),
  ...cluster(
    'agave',
    8.2,
    38.6,
    [
      [0, 0, 0.75],
      [1.1, 0.7, 0.5],
    ],
    { v0: 1 },
  ),
  // 南路西边的草地：一簇矮灌木 + 两块石头（走去果岭的路上一个记号）
  ...cluster('brittlebush', 7.4, 44.2, [
    [0, 0, 0.8],
    [1.3, 0.7, 0.6],
    [-1, 1, 0.5],
  ]),
  ...cluster('rocks', 9.4, 35.2, [
    [0, 0, 0.7],
    [0.9, 0.5, 0.45],
  ]),
  // 广场和集市之间：一小簇龙舌兰
  ...cluster('agave', 15.4, 28.4, [
    [0, 0, 0.6],
    [0.9, -0.3, 0.45],
  ]),
  // 南边（近处）：灌木 + 棕榈连成一条带，x 11…17 留南口
  ...cluster('brittlebush', 3, 46.2, [
    [0, 0, 1],
    [2.2, 1, 0.8],
    [-1.8, 1.4, 0.7],
    [4.4, 0.4, 0.9],
  ]),
  ...cluster(
    'fan-palm',
    7.6,
    48.4,
    [
      [0, 0, 1.05],
      [-2.6, 1.2, 0.7],
    ],
    { v0: 1 },
  ),
  ...cluster('agave', 19.2, 46.4, [
    [0, 0, 1.1],
    [1.6, 1.4, 0.8],
    [-1.2, 1.6, 0.6],
  ]),
  ...cluster(
    'fan-palm',
    26.4,
    48.6,
    [
      [0, 0, 1.2],
      [2.4, 2.4, 0.8],
      [-2.2, 2.6, 0.6],
    ],
    { v0: 2 },
  ),
  ...cluster('creosote', 1, 51, [
    [0, 0, 1],
    [5, 0.6, 0.8],
    [21, 0, 0.9],
    [26, 0.8, 0.8],
  ]),
];

export const plaza: MapDef = {
  id: 'plaza',
  name: '喷泉广场',
  W: 28,
  D: 48,
  view: { x0: -15, x1: 43, z0: -1.5, z1: 50 },
  portraitZoom: 1.15,
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, 68), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 },
    // 喷泉广场：浅米石的圆（偏冷，和集市的沙色铺地分开），北边一截前庭接到会所正门
    {
      id: 'plaza-disc',
      pts: blob(FX, FZ + 0.4, 9, 8.4, 18),
      h: 0.02,
      top: 'poolStone',
      el: 'none',
      wall: 'none',
      smooth: 0.8,
    },
    {
      id: 'forecourt',
      pts: [
        [10.4, WALL_Z],
        [17.6, WALL_Z],
        [18.4, 11.6],
        [9.6, 11.6],
      ],
      h: 0.02,
      top: 'poolStone',
      el: 'none',
      wall: 'none',
      smooth: 0,
    },
    // 餐车集市角：沙色铺地（陶土石板）
    {
      id: 'market',
      pts: [
        [13.6, 30.2],
        [25.6, 29.8],
        [26.6, 36],
        [26, 44],
        [19, 44.6],
        [13, 43.6],
        [12.8, 36],
      ],
      h: 0.02,
      top: 'paving',
      el: 'none',
      wall: 'none',
      smooth: 1,
    },
    // 西边棕榈台：北段、南段（中间 z 26…34 给西口的路）
    {
      id: 'west-n',
      pts: [
        [-30, WALL_Z],
        [-1.4, WALL_Z],
        [-1, 14],
        [-1.6, 24.6],
        [-6, 26.4],
        [-30, 26],
      ],
      h: 1.1,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'west-s',
      pts: [
        [-30, 34.4],
        [-6, 34],
        [-1.6, 35.6],
        [-1.2, 44],
        [-30, 46],
      ],
      h: 1.1,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 东边棕榈台：北段、南段（中间 z 22…30 给东口的路）
    {
      id: 'east-n',
      pts: [
        [28.6, WALL_Z],
        [60, WALL_Z],
        [60, 21.6],
        [33, 22],
        [29, 20.6],
      ],
      h: 1.1,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    {
      id: 'east-s',
      pts: [
        [30, 30.6],
        [34, 30],
        [60, 30],
        [60, 60],
        [29.6, 46],
      ],
      h: 1.1,
      top: 'turf',
      el: 'none',
      wall: 'bluff',
      smooth: 1.1,
    },
    // 会所正面（北边的框）：3.3 米高的白灰泥墙，顶上陶土褐瓦
    {
      id: 'clubhouse',
      pts: rect(-30, 1.2, 60, WALL_Z),
      h: 3.3,
      top: 'roofClay',
      el: 'none',
      wall: 'stucco',
      smooth: 0,
    },
  ],
  strips: [
    // 主路：西口进来，斜着弯上喷泉广场（灰沙）
    {
      ...trail(
        'west',
        [
          [-17, 30],
          [-8, 30.2],
          [-2, 29.6],
          [3, 27.6],
          [6.4, 24.6],
        ],
        1.6,
      ),
      mat: 'gravel',
      el: 'none',
    },
    // 往东：广场东沿 → 东口
    {
      ...trail(
        'east',
        [
          [22.4, 22],
          [26, 24.2],
          [30, 25.8],
          [36, 26.2],
          [45, 26],
        ],
        1.5,
      ),
      mat: 'gravel',
      el: 'none',
    },
    // 往南：广场南沿 → 集市西边 → 南口
    {
      ...trail(
        'south',
        [
          [11.6, 26.8],
          [10.4, 32],
          [10.6, 38],
          [12.2, 43.4],
          [14, 52],
        ],
        1.5,
      ),
      mat: 'gravel',
      el: 'none',
    },
    // 支路（踏脚石）：西口的路 → 西南草地上的树荫长椅；南路 → 南边草地上的灌木丛（绕一圈回来）
    stones('to-bench', [
      [2.6, 29.4],
      [3.2, 32],
      [4.4, 34.8],
    ]),
    stones('lawn-loop', [
      [10.8, 40.6],
      [7.6, 42.4],
      [4.6, 43.2],
    ]),
  ],
  stairs: [],
  courts: [],
  props: [...house, ...fountain, ...market, ...frame],
  noWalk: [rect(-30, 46, 11, 68), rect(17, 46, 60, 68), rect(-30, 44.5, -1, 46)],
  exits: [
    { to: 'arrive', entry: 'fromPlaza', at: [-12, 30], r: 2 },
    { to: 'lobby', entry: 'fromPlaza', at: [FX, WALL_Z + 0.7], r: 0.9 },
    { to: 'street', entry: 'fromPlaza', at: [40, 26], r: 2 },
    { to: 'golf', entry: 'fromPlaza', at: [14, 50.6], r: 2 },
  ],
  entries: {
    // （第四轮：入口往图里挪 8 米 —— 竖屏站在 x = −8 时一屏全是图边的树，看不出到了哪）
    fromArrive: { at: [0, 30], yaw: PI / 2 },
    fromLobby: { at: [FX, WALL_Z + 3.2], yaw: 0 },
    fromStreet: { at: [36, 26], yaw: -PI / 2 },
    fromGolf: { at: [14, 46.6], yaw: PI },
  },
  start: { at: [0, 30], yaw: PI / 2 },
  clouds: [],
  shot: { port: [14, 24], land: [14, 24] },
  spots: [
    { id: 'door-west', kind: 'door', at: [-8, 30], yaw: PI / 2, note: '西口（← 到达）' },
    { id: 'door-north', kind: 'door', at: [FX, WALL_Z + 2.4], yaw: 0, note: '会所正门（→ 大堂）' },
    { id: 'door-east', kind: 'door', at: [36, 26], yaw: -PI / 2, note: '东口（→ 球场街）' },
    { id: 'door-south', kind: 'door', at: [14, 46.4], yaw: PI, note: '南口（→ 果岭）' },
    { id: 'fountain-rim-s', kind: 'rest', at: rim(100, 4.9), yaw: 0.2, seat: 0.6, note: '池沿南边坐着歇脚' },
    { id: 'fountain-watch', kind: 'watch', at: [8.6, 24.6], yaw: 2.2, note: '站在西南看喷泉、看孩子' },
    { id: 'fountain-skim', kind: 'work', at: rim(20, 5.1), yaw: -PI / 2 - 0.35, note: '总监在池边捞叶子' },
    { id: 'leaf-cart', kind: 'work', at: [22.4, 18.6], yaw: PI, note: '保洁车（取捞网、扫帚）' },
    { id: 'bench-w', kind: 'rest', at: [5, 16.6], yaw: PI / 2, seat: 0.46, note: '烟树荫下的长椅' },
    { id: 'drink-fountain', kind: 'queue', at: [4.2, 19.6], yaw: -PI / 2, note: '饮水点' },
    { id: 'coffee-window', kind: 'queue', at: [19.7, 33.6], yaw: PI, note: '咖啡车窗口排队（往南排）' },
    { id: 'coffee-vendor', kind: 'work', at: [19.7, 32.25], yaw: 0, note: '咖啡车里的摊主（车地板 0.85）' },
    { id: 'boba', kind: 'queue', at: [23.2, 39.7], yaw: PI - 0.5, note: '奶茶三轮的台面前' },
    { id: 'table-1', kind: 'rest', at: [16.2, 38.18], yaw: PI, seat: 0.46, note: '野餐桌（大伞）' },
    { id: 'table-2', kind: 'rest', at: [20.6, 42.42], yaw: 0, seat: 0.46, note: '野餐桌（小伞）' },
    { id: 'bench-sw', kind: 'rest', at: [4.6, 36.2], yaw: 0, seat: 0.46, note: '西南草地上树荫里的长椅' },
  ],
  walks: [
    { name: '西口 → 喷泉', from: [-8, 30], to: [9, 24.4] },
    { name: '西口 → 咖啡车窗口', from: [-8, 30], to: [18.6, 35.4] },
    { name: '西口 → 会所正门（→ 大堂）', from: [-8, 30], to: [FX, WALL_Z + 0.6], expect: 'lobby' },
    { name: '西口 → 东口（→ 球场街）', from: [-8, 30], to: [40.6, 26], expect: 'street' },
    { name: '东口 → 南口（→ 果岭）', from: [36, 26], to: [14, 51.2], expect: 'golf' },
    { name: '南口 → 西口（→ 到达）', from: [14, 46.6], to: [-12.6, 30], expect: 'arrive' },
  ],
};
