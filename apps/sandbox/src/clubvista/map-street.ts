// ════════════════════════════════════════════════════════════════════════════════════════
// G · 球场街（第三轮新图：红土场 + 匹克球场，一条街串起来；并进旧的 clubclay、clubpickle）
//   竖屏一屏（拉远 1.3，≈ 23 米宽）从上到下：
//   北台地（2.8 米，顶上一排棕榈和烟树）= 画面上沿的框，正中一道石阶上去（→ 青训场）；台地脚下一条横街：工具架、水管卷盘；
//   红土场（真尺寸 18.3 × 36.6，南北向，下沉 0.8，四面一圈石坡 = 冷暗带）：北半场一个工作人员拖着拖垫整场、扫线刷躺在底线上；
//     南底线一个人和网前一个人对打；东边场边伞下的球员长椅 + 球拍包，西边网柱外一把空的裁判椅；记分牌在东北角。这一屏唯一的大块暖色。
//   西边一条街（浅灰沙路）贴着场的西沿往南，场边站着两个看拖场的人；
//   街在两种场之间放宽成一块小歇脚处：伞下长椅（一个人坐着换鞋、一个喝水）、饮水站、球拍包；
//   匹克球场（两块并排，南北向，冷蓝的场面 + 深蓝的厨房，0.15 米的矮台）：西块四个人双打、东块两个人；
//     拍架（等着上场的人排队）、翻牌记分牌、器材箱；西边伞下长椅坐着看热闹的人。
//   路：西南口进来（← 喷泉广场），街斜着往东北弯、沿红土场西沿上去，到北边横街往东，正中石阶上北台地（→ 青训场）。
//   边框：树篱 + 棕榈（不用围网）：西东两边 1.2 米的种植台（台沿一条树篱），北边 2.8 米的台地，南边一条树篱 + 棕榈。
//   层：红土场 −0.8 / 街、匹克球台 0…0.15 / 西东种植台 1.2 / 北台地 2.8。
// ════════════════════════════════════════════════════════════════════════════════════════
import { cluster, type MapDef, type Prop, rect, trail, type V2 } from './mapdef';

const PI = Math.PI;
const D = 70;
/** 红土场（外圈 18.3 × 36.6）和网 */
const C = { x0: 7.5, x1: 25.8, z0: 11.5, z1: 48.1 };
const CX = (C.x0 + C.x1) / 2;
const NET = (C.z0 + C.z1) / 2;
const BASE_N = NET - 11.885;
const BASE_S = NET + 11.885;
const CLAY_H = -1.1;
/** 匹克球场：两块并排（南北向，每块外圈 9.2 × 16.5），落在 0.15 的矮台上 */
const PK_H = 0.15;
const PZ0 = 51.6;
const PZ1 = 68.1;
const PA = { x0: 8.6, x1: 17.8 };
const PB = { x0: 17.8, x1: 27 };
const PNET = (PZ0 + PZ1) / 2;
const PAX = (PA.x0 + PA.x1) / 2;
const PBX = (PB.x0 + PB.x1) / 2;
/** 北台地的南沿，石阶缺口 */
const TERR_Z = 6;
const GAP = { x0: 12.3, x1: 15.7, z: 3.4 };
const TERR_H = 2.8;
/** 西口的走廊（西种植台在这里断开） */
const WEST_GAP = { z0: 56.4, z1: 63.6 };
const EXIT_Z = 60;

// ── 红土场 ──
const clay: Prop[] = [
  { a: 'net', x: CX, z: NET, r: PI / 2 },
  // 北半场：工作人员往西拖着拖垫（拖垫在身后东边），拖过的一条条刷痕在场面上；扫线刷平放在北底线外
  { a: 'coach', x: 12.6, z: 19.4, r: -PI / 2, pose: 'walk', v: 1 },
  { a: 'street:drag-mat', x: 14.3, z: 19.4, v: 0, block: false },
  { a: 'street:line-brush', x: 20.6, z: BASE_N - 1.4, r: 0.35, block: false },
  // 南边对打：南底线正手、网前北边一个准备接
  { a: 'player', x: 18.4, z: BASE_S + 0.6, r: PI, pose: 'forehand', prop: 'racket', v: 2 },
  { a: 'player', x: 14.6, z: NET - 4.2, r: 0.1, pose: 'ready', prop: 'racket', v: 0 },
  // 西边网柱外：空着的裁判椅（练球没有裁判）
  { a: 'street:umpire-chair', x: C.x0 + 1.4, z: NET, r: PI / 2 },
  // 东边场边：球员长椅 + 伞 + 球拍包，一个人坐着喝水等换人
  { a: 'player-bench', x: C.x1 - 1.3, z: NET + 3.2, r: -PI / 2 },
  { a: 'parasol', x: C.x1 - 1.4, z: NET + 5.6, v: 1, block: 0.2 },
  { a: 'player', x: C.x1 - 1.35, z: NET + 3.6, r: -PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], v: 3 },
  { a: 'kit-bag', x: C.x1 - 1.2, z: NET + 1.6, r: PI / 2, v: 0 },
  // 东北角的记分牌（朝镜头）+ 一篮球
  { a: 'street:clay-board', x: C.x1 - 2.2, z: C.z0 + 1.2, noCast: true },
  { a: 'street:ball-hopper', x: C.x0 + 2.4, z: BASE_S + 1.6, v: 1 },
];

// ── 灯杆：红土场四角（街这边、东种植台脚下），匹克球场两块中间的南北两头（夜里自动开） ──
const aim = (x: number, z: number, cx: number, cz: number) => Math.atan2(cx - x, cz - z);
const lights: Prop[] = [
  { a: 'court-light', x: C.x0 - 1.5, z: C.z0 + 2.4, r: aim(C.x0 - 1.5, C.z0 + 2.4, CX, NET), block: 0.3 },
  { a: 'court-light', x: C.x0 - 1.5, z: C.z1 - 2.4, r: aim(C.x0 - 1.5, C.z1 - 2.4, CX, NET), block: 0.3 },
  { a: 'court-light', x: C.x1 + 1.2, z: C.z0 + 2.4, r: aim(C.x1 + 1.2, C.z0 + 2.4, CX, NET), block: 0.3 },
  { a: 'court-light', x: C.x1 + 1.2, z: C.z1 - 2.4, r: aim(C.x1 + 1.2, C.z1 - 2.4, CX, NET), block: 0.3 },
  { a: 'court-light', x: PA.x0 - 0.9, z: PNET + 3, r: PI / 2, block: 0.3 },
  { a: 'court-light', x: PB.x1 + 0.5, z: PNET - 3, r: -PI / 2, block: 0.3 },
];

// ── 北边横街：拖场的家什 ──
const yard: Prop[] = [
  { a: 'street:tool-rack', x: 21.2, z: TERR_Z + 1.0 },
  { a: 'street:hose-reel', x: 25.4, z: TERR_Z + 1.6, v: 1 },
  { a: 'street:gear-box', x: 9.4, z: TERR_Z + 1.0, r: 0.2 },
];

// ── 西边的街：看拖场的两个人 ──
const lane: Prop[] = [
  // 第 2 轮评判：左边小路上的人挤成一团 → 散成三组、隔开：
  // 场边一大一小看拖场（中段）；一个人拿着拍子独自往北走（南段）；横街长椅上坐着一个看场的（北头，见下）
  { a: 'player', x: 6.0, z: 26.6, r: PI / 2 - 0.2, pose: 'idle', v: 1, look: [13, 0.5, 19.4] },
  { a: 'kid', x: 6.1, z: 27.8, r: PI / 2, pose: 'idle', v: 0, look: [13, 0.5, 19.4] },
  { a: 'player', x: 3.3, z: 38.6, r: PI + 0.1, pose: 'walk', prop: 'racket', v: 3 },
  // 横街西头：一条长椅背靠台地，对着红土场
  { a: 'bench', x: 4.6, z: TERR_Z + 0.9 },
  { a: 'coach', x: 5.1, z: TERR_Z + 1.0, pose: 'sip', prop: 'cup', seat: [0.47, 0], block: false },
  { a: 'pot', x: 2.9, z: TERR_Z + 0.8, s: 1 },
  { a: 'pot', x: 6.3, z: TERR_Z + 0.9, s: 0.8, v: 1 },
  // 街边、场边的几簇（边上密一点）
  ...cluster('brittlebush', 0.6, 41.6, [
    [0, 0, 0.75],
    [0.9, 1.1, 0.55],
    [-0.4, 1.9, 0.5],
  ]),
  ...cluster('agave', 6.2, 44.2, [
    [0, 0, 0.6],
    [-0.8, 0.7, 0.45],
  ]),
  ...cluster('creosote', 1.0, 21.4, [
    [0, 0, 0.6],
    [0.6, 1.2, 0.45],
  ]),
];

// ── 两种场之间的歇脚处 ──
const rest: Prop[] = [
  { a: 'bench', x: 1.4, z: 48.6 },
  { a: 'parasol', x: 0.6, z: 47.4, v: 0, block: 0.2 },
  { a: 'player', x: 0.9, z: 48.7, pose: 'sit', prop: 'racket', v: 2, block: false },
  { a: 'player', x: 2.0, z: 48.7, pose: 'sip', prop: 'cup', v: 1, block: false },
  { a: 'kit-bag', x: -0.1, z: 49.2, r: PI / 2 - 0.3, v: 1 },
  { a: 'water-station', x: 6.0, z: 49.6, s: 0.85 },
];

// ── 匹克球场 ──
const pickle: Prop[] = [
  { a: 'street:pickle-net', x: PAX, z: PNET, r: PI / 2 },
  { a: 'street:pickle-net', x: PBX, z: PNET, r: PI / 2 },
  // 西块：双打，四个人都压在厨房线上
  { a: 'player', x: PAX - 1.5, z: PNET - 2.5, r: 0, pose: 'ready', prop: 'racket', v: 0 },
  { a: 'player', x: PAX + 1.5, z: PNET - 2.7, r: 0.1, pose: 'forehand', prop: 'racket', v: 3 },
  { a: 'player', x: PAX - 1.4, z: PNET + 2.6, r: PI, pose: 'ready', prop: 'racket', v: 1 },
  { a: 'player', x: PAX + 1.6, z: PNET + 2.5, r: PI - 0.1, pose: 'ready', prop: 'racket', v: 2 },
  // 东块：两个人，北边发球、南边等着
  { a: 'coach', x: PBX + 1.4, z: PZ0 + 1.6, r: 0, pose: 'serve', prop: 'racket', v: 0 },
  { a: 'player', x: PBX - 1.2, z: PZ1 - 2.2, r: PI, pose: 'ready', prop: 'racket', v: 3 },
  // 场的北沿：拍架（排队的人）+ 翻牌记分牌 + 器材箱
  { a: 'street:paddle-rack', x: 5.2, z: 52.4 },
  { a: 'player', x: 5.0, z: 53.6, r: PI, pose: 'idle', prop: 'racket', v: 2 },
  { a: 'kid', x: 5.7, z: 54.6, r: PI * 0.9, pose: 'idle', v: 1 },
  { a: 'street:flip-board', x: PA.x1, z: PZ0 + 0.2, noCast: true },
  // 东块南边的场外：翻倒的捡球篮（球滚出来一串）、两只球拍包
  { a: 'street:ball-hopper', x: PBX + 2.6, z: PZ1 - 0.9, r: 0.4, v: 0 },
  { a: 'kit-bag', x: PB.x0 + 1.0, z: PZ0 + 0.9, r: 0.2, v: 1 },
  { a: 'kit-bag', x: PB.x0 + 1.6, z: PZ0 + 0.7, r: -0.3, v: 0 },
  ...cluster('agave', 22.6, 50.1, [
    [0, 0, 0.6],
    [1.2, 0.3, 0.45],
  ]),
  ...cluster('brittlebush', 13.2, 50.2, [
    [0, 0, 0.55],
    [-1, 0.2, 0.45],
  ]),
  // 西边伞下长椅：看热闹的
  { a: 'bench', x: 6.9, z: 59.4, r: PI / 2 },
  { a: 'parasol', x: 6.9, z: 61.6, v: 1, block: 0.2 },
  { a: 'player', x: 6.85, z: 59, r: PI / 2, pose: 'sit', seat: [0.47, 0], v: 0, block: false },
  { a: 'coach', x: 6.85, z: 60.1, r: PI / 2, pose: 'sip', prop: 'cup', seat: [0.47, 0], block: false },
  { a: 'player', x: 7.2, z: 64.2, r: PI / 2 + 0.3, pose: 'idle', v: 3 },
];

// ── 边框：树篱 + 棕榈 ──
const hedgeRow = (x0: number, x1: number, z: number, r = 0, v0 = 0): Prop[] => {
  const out: Prop[] = [];
  const lens = [4, 2.6, 1.6];
  let x = x0;
  let i = v0;
  while (x < x1 - 0.8) {
    const v = i % 3;
    const L = Math.min(lens[v], x1 - x);
    const vv = L >= 3.5 ? 0 : L >= 2.2 ? 1 : 2;
    const l = lens[vv];
    if (r === 0) out.push({ a: 'street-hedge', x: x + l / 2, z, v: vv, block: 'box' });
    else out.push({ a: 'street-hedge', x: z, z: x + l / 2, r, v: vv, block: 'box' });
    x += l + 0.05;
    i++;
  }
  return out;
};

/**
 * 西东两边的台沿：竖着的一整条树篱在 45° 俯视下读成一根"柱子"（v4 自评），改成一段段的短篱（2.6 / 1.6 米）
 * 和成团的灌木交替，段和段之间空着。
 */
const sideHedge = (x: number, z0: number, z1: number, k0 = 0): Prop[] => {
  const out: Prop[] = [];
  let z = z0;
  let i = k0;
  while (z < z1 - 1) {
    if (i % 2 === 0) {
      const v = i % 4 === 0 ? 1 : 2;
      const l = v === 1 ? 2.6 : 1.6;
      out.push({ a: 'street-hedge', x, z: z + l / 2, r: PI / 2, v, block: 'box' });
      z += l + 1.4;
    } else {
      out.push(
        ...cluster(
          i % 3 ? 'creosote' : 'brittlebush',
          x + 0.2,
          z + 0.8,
          [
            [0, 0, 0.75],
            [-0.5, 1.1, 0.55],
          ],
          { v0: i },
        ),
      );
      z += 3.2;
    }
    i++;
  }
  return out;
};

const frame: Prop[] = [
  // 北台地顶：一排树（成簇，不均匀）
  ...cluster(
    'fan-palm',
    3,
    1.2,
    [
      [0, 0, 1.2],
      [3, -1.4, 0.85],
      [-3.4, -0.6, 1],
    ],
    { v0: 0 },
  ),
  ...cluster('smoke-tree', 9.2, 0.4, [
    [0, 0, 1.05],
    [-1, -3.4, 0.85],
  ]),
  ...cluster('smoke-tree', 19.6, 0.6, [
    [0, 0, 1.1],
    [3.4, -2.4, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    25.6,
    1.6,
    [
      [0, 0, 1.15],
      [3.2, -1.4, 0.8],
      [5.4, 0.8, 1],
    ],
    { v0: 1 },
  ),
  ...cluster('palo-verde', -8, -1, [
    [0, 0, 1.1],
    [-3.6, 2.4, 0.85],
  ]),
  ...cluster('palo-verde', 36, -1, [
    [0, 0, 1.1],
    [3.6, 2.4, 0.85],
  ]),
  ...hedgeRow(-14, GAP.x0 - 0.4, TERR_Z - 0.75, 0, 0),
  ...hedgeRow(GAP.x1 + 0.4, 42, TERR_Z - 0.75, 0, 1),
  // 西种植台：台沿一条树篱，后面棕榈成簇
  ...sideHedge(-2.5, TERR_Z + 0.6, WEST_GAP.z0 - 0.6, 0),
  ...sideHedge(-2.5, WEST_GAP.z1 + 0.8, D + 4, 1),
  ...cluster('fan-palm', -5.4, 12, [
    [0, 0, 1.2],
    [-2.2, 3, 0.75],
    [-4.6, 0.6, 0.95],
  ]),
  ...cluster('smoke-tree', -9.4, 24, [
    [0, 0, 1.1],
    [2.6, 3.6, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    -5.6,
    36,
    [
      [0, 0, 0.95],
      [-2.4, 2.8, 1.2],
      [0.6, 5.2, 0.7],
    ],
    { v0: 2 },
  ),
  ...cluster('rocks', -4.6, 47.4, [
    [0, 0, 1.2],
    [1.4, 1.2, 0.8],
  ]),
  ...cluster('palo-verde', -10, 50, [
    [0, 0, 1],
    [3, 3.6, 0.75],
  ]),
  ...cluster(
    'fan-palm',
    -5.2,
    67,
    [
      [0, 0, 1.15],
      [-3, 2.4, 0.8],
    ],
    { v0: 1 },
  ),
  // 东种植台
  ...sideHedge(28.6, TERR_Z + 0.6, D + 4, 1),
  ...cluster(
    'fan-palm',
    31.6,
    14,
    [
      [0, 0, 1.15],
      [2.6, 2.6, 0.75],
      [-0.2, 5.4, 0.95],
    ],
    { v0: 2 },
  ),
  ...cluster('palo-verde', 37, 26, [
    [0, 0, 1.1],
    [2.6, 3.6, 0.8],
  ]),
  ...cluster(
    'fan-palm',
    31.8,
    40,
    [
      [0, 0, 1.2],
      [2.4, 3.2, 0.8],
    ],
    { v0: 0 },
  ),
  ...cluster('creosote', 31.4, 52, [
    [0, 0, 1],
    [2, 1.6, 0.8],
    [-0.4, 3.4, 0.7],
  ]),
  ...cluster(
    'fan-palm',
    32,
    62,
    [
      [0, 0, 1.1],
      [2.8, 2.6, 0.85],
      [0.2, 5.6, 0.7],
    ],
    { v0: 1 },
  ),
  // 南边（近处）：一条树篱 + 棕榈
  ...hedgeRow(-1.4, 28.4, D + 0.6, 0, 2),
  ...cluster(
    'fan-palm',
    5,
    D + 2.6,
    [
      [0, 0, 1.1],
      [3, 1, 0.8],
    ],
    { v0: 2 },
  ),
  // 第 4 版：这簇原来在 x 22，树冠压在东边那块匹克球场上；挪到东南角
  ...cluster(
    'fan-palm',
    31,
    D + 2.4,
    [
      [0, 0, 1.15],
      [-3, 1.2, 0.75],
    ],
    { v0: 0 },
  ),
  // 街边草地上稀疏的几簇
  ...cluster('agave', 1.4, 30, [
    [0, 0, 0.75],
    [0.9, 1, 0.5],
  ]),
  ...cluster('brittlebush', 1.2, 14.4, [
    [0, 0, 0.7],
    [1, 0.8, 0.5],
  ]),
];

const WEST_TERR_N: V2[] = [
  [-30, TERR_Z],
  [-1.6, TERR_Z],
  [-1.2, 20],
  [-2, 34],
  [-1.4, 46],
  [-2, WEST_GAP.z0],
  [-30, WEST_GAP.z0],
];
const WEST_TERR_S: V2[] = [
  [-30, WEST_GAP.z1],
  [-2, WEST_GAP.z1],
  [-1.6, D + 1],
  [-1.8, D + 16],
  [-30, D + 16],
];
const EAST_TERR: V2[] = [
  [27.4, TERR_Z],
  [60, TERR_Z],
  [60, D + 16],
  [27.6, D + 16],
  [27.8, 40],
];
const NORTH_TERR: V2[] = [
  [-30, -16],
  [60, -16],
  [60, TERR_Z],
  [GAP.x1, TERR_Z],
  [GAP.x1, GAP.z],
  [GAP.x0, GAP.z],
  [GAP.x0, TERR_Z],
  [-30, TERR_Z],
];

export const street: MapDef = {
  id: 'street',
  name: '球场街',
  W: 28,
  D,
  view: { x0: -15, x1: 43, z0: -2, z1: D + 2 },
  portraitZoom: 1.3,
  plates: [
    { id: 'ground', pts: rect(-30, -16, 60, D + 16), h: 0, top: 'turf', el: 'none', wall: 'none', smooth: 0 },
    // 红土场：下沉 0.8，四面 45° 石坡（一圈冷暗带）
    {
      id: 'clay-pit',
      pts: rect(C.x0 + CLAY_H, C.z0 + CLAY_H, C.x1 - CLAY_H, C.z1 - CLAY_H),
      h: CLAY_H,
      top: 'clay',
      el: 'none',
      wall: 'bluff',
      smooth: 0,
      slope: 1,
    },
    // 匹克球场的矮台（0.15，一圈压顶）
    {
      id: 'pickle-pad',
      pts: rect(PA.x0 - 0.2, PZ0 - 0.2, PB.x1 + 0.2, PZ1 + 0.2),
      h: PK_H,
      top: 'paving',
      el: 'none',
      wall: 'cap',
      smooth: 0,
    },
    // 歇脚处的铺地（街在两种场之间放宽）
    {
      id: 'rest-pave',
      pts: [
        [-1, 45.6],
        [6.2, 45.8],
        [7.4, 50.8],
        [6.6, 55.6],
        [-1, 55],
      ],
      h: 0.02,
      top: 'paving',
      el: 'none',
      wall: 'none',
      smooth: 0.7,
    },
    { id: 'west-terr-n', pts: WEST_TERR_N, h: 1.2, top: 'turf', el: 'none', wall: 'bluff', smooth: 1.1 },
    { id: 'west-terr-s', pts: WEST_TERR_S, h: 1.2, top: 'turf', el: 'none', wall: 'bluff', smooth: 1.1 },
    { id: 'east-terr', pts: EAST_TERR, h: 1.2, top: 'turf', el: 'none', wall: 'bluff', smooth: 1.1 },
    { id: 'north-terr', pts: NORTH_TERR, h: TERR_H, top: 'turf', el: 'none', wall: 'bluff', smooth: 0 },
  ],
  strips: [
    {
      ...trail(
        'main',
        [
          [-16, EXIT_Z],
          [-4, EXIT_Z + 0.2],
          [1.6, 58.6],
          [3.6, 53.6],
          [3.6, 46],
          [3.2, 36],
          [4.2, 26],
          [3.6, 16.4],
          [5.4, 9.6],
          [9.6, 8.2],
          [14, 8.6],
          [14, 6.2],
        ],
        2,
      ),
      mat: 'gravel',
      el: 'none',
    },
  ],
  stairs: [
    {
      id: 'north-steps',
      x0: GAP.x0 + 0.1,
      x1: GAP.x1 - 0.1,
      z0: GAP.z,
      z1: TERR_Z + 2,
      axis: 'z',
      h0: TERR_H,
      h1: 0,
      kind: 'stairs',
      tread: 'stepStone',
    },
    // 西沿一段台阶下到红土场
    {
      id: 'clay-steps',
      x0: C.x0 - 1.5,
      x1: C.x0 + 0.4,
      z0: 32.6,
      z1: 35,
      axis: 'x',
      h0: 0,
      h1: CLAY_H,
      kind: 'stairs',
      tread: 'paving',
    },
  ],
  courts: [
    {
      id: 'clay',
      ...C,
      h: CLAY_H,
      axis: 'z',
      outMat: 'streetClayOut',
      inMat: 'streetClay',
      lineMat: 'tape',
      wear: true,
    },
    {
      id: 'pickle-a',
      ...PA,
      z0: PZ0,
      z1: PZ1,
      h: PK_H,
      axis: 'z',
      kind: 'pickle',
      outMat: 'practiceOut',
      inMat: 'pickle',
      kitchenMat: 'kitchen',
    },
    {
      id: 'pickle-b',
      ...PB,
      z0: PZ0,
      z1: PZ1,
      h: PK_H,
      axis: 'z',
      kind: 'pickle',
      outMat: 'practiceOut',
      inMat: 'pickle',
      kitchenMat: 'kitchen',
    },
  ],
  props: [...clay, ...lights, ...yard, ...lane, ...rest, ...pickle, ...frame],
  noWalk: [
    // 西东种植台、北台地（只留石阶上去的缺口和台顶出口那一截）
    WEST_TERR_N,
    WEST_TERR_S,
    EAST_TERR,
    rect(-30, -16, GAP.x0 - 0.2, TERR_Z),
    rect(GAP.x1 + 0.2, -16, 60, TERR_Z),
    rect(-30, D + 1.2, 60, D + 16),
  ],
  exits: [
    { to: 'plaza', entry: 'fromStreet', at: [-12, EXIT_Z], r: 2 },
    { to: 'academy', entry: 'fromStreet', at: [14, -3], r: 2 },
  ],
  entries: {
    // （第四轮：入口往图里挪 4 米 —— 竖屏站在 x = −8 时一屏全是图边的树，看不出到了哪）
    fromPlaza: { at: [-4, EXIT_Z], yaw: PI / 2 },
    fromAcademy: { at: [14, 1.2], yaw: 0 },
  },
  start: { at: [-4, EXIT_Z], yaw: PI / 2 },
  clouds: [
    [-6, 28, 6, 3.4],
    [30, 46, 5, 3],
  ],
  // 竖屏取景对准两种场的中线（x 17）：两块匹克球场都在画面里（第三轮评判：东边那块被切掉一半）
  shot: { port: [17, 41], land: [13, 38] },
  spots: [
    { id: 'door-plaza', kind: 'door', at: [-9, EXIT_Z], yaw: PI / 2, note: '西口（← 喷泉广场）' },
    { id: 'door-academy', kind: 'door', at: [14, 0.6], yaw: 0, note: '北台地石阶顶（→ 青训场）' },
    { id: 'clay-drag', kind: 'work', at: [12.6, 19.4], yaw: -PI / 2, note: '红土场拖垫整场' },
    { id: 'tool-rack', kind: 'work', at: [21.2, TERR_Z + 2.1], yaw: PI, note: '工具架（拿拖垫、扫线刷）' },
    { id: 'hose-reel', kind: 'work', at: [25.4, TERR_Z + 2.8], yaw: PI, note: '水管卷盘（浇场）' },
    { id: 'clay-play-n', kind: 'play', at: [14.6, NET - 4.2], yaw: 0, note: '红土场北边网前' },
    { id: 'clay-play-s', kind: 'play', at: [18.4, BASE_S + 0.6], yaw: PI, note: '红土场南底线' },
    {
      id: 'clay-bench',
      kind: 'rest',
      at: [C.x1 - 1.35, NET + 3.6],
      yaw: -PI / 2,
      seat: 0.47,
      note: '红土场东边球员长椅',
    },
    { id: 'watch-clay', kind: 'watch', at: [6.0, 26.6], yaw: PI / 2, note: '街边看拖场' },
    { id: 'rest-bench', kind: 'rest', at: [1.4, 49.1], yaw: 0, seat: 0.47, note: '两种场之间的伞下长椅' },
    { id: 'rest-water', kind: 'work', at: [6, 50.4], yaw: PI, note: '饮水站' },
    { id: 'paddle-queue', kind: 'queue', at: [5.2, 53.4], yaw: PI, note: '拍架前排队等上匹克球场' },
    { id: 'pickle-a-n', kind: 'play', at: [PAX - 1.5, PNET - 2.5], yaw: 0, note: '匹克球西块北边' },
    { id: 'pickle-a-s', kind: 'play', at: [PAX + 1.6, PNET + 2.5], yaw: PI, note: '匹克球西块南边' },
    { id: 'pickle-b-n', kind: 'play', at: [PBX + 1.4, PZ0 + 1.6], yaw: 0, note: '匹克球东块发球' },
    { id: 'pickle-bench', kind: 'rest', at: [6.85, 59], yaw: PI / 2, seat: 0.47, note: '匹克球场西边伞下长椅' },
  ],
  walks: [
    { name: '西口 → 红土场边', from: [-8, EXIT_Z], to: [5.4, 24] },
    { name: '西口 → 歇脚', from: [-8, EXIT_Z], to: [3, 51] },
    { name: '西口 → 匹克球场', from: [-8, EXIT_Z], to: [PAX, PZ0 + 1] },
    { name: '西口 → 北口', from: [-8, EXIT_Z], to: [14, -3], expect: 'academy' },
    { name: '北口 → 西口', from: [14, 1.2], to: [-12, EXIT_Z], expect: 'plaza' },
  ],
};
