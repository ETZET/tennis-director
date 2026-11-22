// valley：俱乐部所在的小镇（地图扩张 demo，2026-11-15；2026-11-21 压紧成 Sasquatch 式的小镇）。这里只有数 —— 平面图（plan.ts）和 3D 白模读同一份。
//
// 坐标同 clubsite/world.ts（米，y 朝上，北 = −z，东 = +x；俱乐部在原点附近不动）。
//
// 2026-11-21 压紧（用户："车开到小镇之后，步行小镇的其他地方完全不可能，像 Sasquatch 一样搞紧凑一点"；
// 只留做好了的地方，只有白模的机场、公路、高尔夫、河床峡谷、山上步道、老街区……都删了，风车只当山口外的远景）：
// - 俱乐部门口往东约 100 米就是小镇：主街（z 0）北边一排店（报社 · 横街 · 银行 · 餐馆 · 市政厅），后街一排（体育店、五金大超市），
//   主街东头是街尾：北边高中、南边日出公园。只有外景的住宅围在外面一圈（弯的小街、有尽头）。
// - 八个做好的模块（六家店、高中、公园）的细节代码照**旧坐标**写（整体缩到 0.7 以后、压紧以前的世界坐标）：
//   这里的楼、院子、POI、绿地、模块自己的小路照旧坐标写，文件末尾按 relocate.ts 的 MOVE 整块平移到新位置。
// - 新的路、平地、区域、住宅的路直接写世界坐标。
//
// 尺度：走路 3.4 米/秒（SPEED）。主街从报社走到市政厅约 110 米（半分钟）。

import { MOD_OLD_BOX, type ModuleId, mv, mvPts, mvRect } from './relocate';
import { FRAMES, FRONT_PAD, fmap, fmapRect, frameAt, HOUSE_K, keepScale, TOWN_K } from './townscale';

export type V2 = readonly [number, number];
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 移动方式和速度（米/秒）：走路同 clubsite/play 的 SPEED */
export const SPEED = { walk: 3.4, cart: 7, car: 16 } as const;
export type Mode = keyof typeof SPEED;

// 旧坐标的来历：2026-11-16 整个山谷往俱乐部门口缩到 SCALE（"原尺寸"→ 缩完）；模块的数据有的照原尺寸写（过 S），
// 有的照缩完写（过 SI 再过 S = 原样）。压紧以后只有模块的旧数据还用这两个
export const SCALE = 0.7;
export const ANCHOR: V2 = [140, 0];
const CLUB_BOX_L = { x0: -80, x1: 140, z0: -60, z1: 100 };
/** 原尺寸的世界坐标 → 旧坐标（俱乐部那块原样） */
export function S(x: number, z: number): [number, number] {
  if (x >= CLUB_BOX_L.x0 && x <= CLUB_BOX_L.x1 && z >= CLUB_BOX_L.z0 && z <= CLUB_BOX_L.z1) return [x, z];
  return [ANCHOR[0] + (x - ANCHOR[0]) * SCALE, ANCHOR[1] + (z - ANCHOR[1]) * SCALE];
}
/** S 的逆：旧坐标 → 原尺寸（照缩完的画面写的模块数据过一次 SI，统一过 S 以后正好回到写的数） */
export function SI(x: number, z: number): [number, number] {
  return [ANCHOR[0] + (x - ANCHOR[0]) / SCALE, ANCHOR[1] + (z - ANCHOR[1]) / SCALE];
}
const SIxz = (x: number, z: number) => {
  const [a, c] = SI(x, z);
  return { x: a, z: c };
};

/** 平面图 / 小地图画的整个范围（含四周的山脚） */
export const VIEW: Rect = { x0: -200, x1: 760, z0: -560, z1: 300 };

/**
 * 平地（能走能开的地都在这圈里面；外面是山）。顺时针，从俱乐部的西北角起。
 * 俱乐部那段就是 clubsite/world.ts 的 DESERT（x −80…101，z −58…90）；北边的山嘴把俱乐部的山湾和小镇北边的住宅隔开，
 * 北沿正中一道山口（风车在山口外，远景），东、南两边是山脚。
 */
export const FLOOR: V2[] = [
  [-80, -58],
  [101, -58],
  [147, -43],
  [160, -59],
  [170, -95],
  [182, -135],
  [215, -165],
  [270, -180],
  [330, -190],
  // 北边的山口（风车田在外面，PASS）
  [350, -208],
  [455, -208],
  [472, -188],
  [540, -182],
  [600, -162],
  [648, -122],
  [668, -60],
  [672, 20],
  [655, 95],
  [610, 150],
  [530, 168],
  [440, 172],
  [360, 164],
  [300, 152],
  [255, 126],
  [236, 102],
  [147, 92],
  [101, 90],
  [-80, 90],
];

// ── 区域和解锁 ─────────────────────────────────────────────────────────
/**
 * 一片区域：开局开着的（open）或者锁着的。锁着的 = 画面压暗、路口有路障；解锁靠事件和人（用户 2026-11-15 选的），
 * demo 里先用调试开关切（who 写的是以后的解锁事件，平面图上标出来）。regionAt 按顺序取第一个包含它的。
 */
export interface Region {
  id: string;
  name: string;
  /** 区域范围（多边形；和 FLOOR 求交就是这片的地） */
  poly: V2[];
  open: boolean;
  /** 以后由谁 / 什么事打开（事件和人） */
  who: string;
  /** 平面图上的颜色 */
  color: string;
}
export const REGIONS: Region[] = [
  {
    id: 'club',
    name: '俱乐部和山湾',
    // 俱乐部、酒店扩张地、门外那段车道（镇子从 x 214 起）
    poly: [
      [-200, -300],
      [214, -300],
      [214, 7.5],
      [242, 7.5],
      [242, 400],
      [-200, 400],
    ],
    open: true,
    who: '开局',
    color: '#c0563f',
  },
  {
    id: 'school',
    name: '学校',
    // 主街北边、餐馆以东到五金进口以西（主街的车道不算进来：锁着也能开车去五金）；
    // 北沿收到校园北边（school 模块旧框 z −585 + 448 = −137，再让 3 米）：再往北的住宅归小镇
    poly: [
      [331, -140],
      [517, -140],
      [517, -5.2],
      [331, -5.2],
    ],
    open: false,
    who: '青训缺人 → 高中教练推荐苗子，去学校看球挑人',
    color: '#5a9a52',
  },
  {
    id: 'park',
    name: '日出公园',
    // 主街南边，公园西路以东到公园东沿
    poly: [
      [336, 5.2],
      [478, 5.2],
      [478, 400],
      [336, 400],
    ],
    open: false,
    who: '傍晚公园对墙打球的孩子 / 周末公开课',
    color: '#7aaa3a',
  },
  {
    id: 'town',
    name: '小镇',
    // 剩下的都是：主街、后街、横街的六家店，外面一圈住宅
    poly: [
      [-200, -700],
      [900, -700],
      [900, 600],
      [-200, 600],
    ],
    open: false,
    who: '《沙漠太阳报》的记者来俱乐部采访 → 请你去报社 / 体育用品店老板来订球',
    color: '#3f6fb0',
  },
];

// ── 路 ─────────────────────────────────────────────────────────────────
export type RoadKind = 'avenue' | 'road' | 'street' | 'lane' | 'trail' | 'highway';
export interface Road {
  id: string;
  name: string;
  kind: RoadKind;
  /** 路宽（米，含路肩）；步道是土路 */
  w: number;
  pts: V2[];
}
/** 路宽按种类 */
export const ROAD_W: Record<RoadKind, number> = { highway: 16, avenue: 14, road: 10, street: 7, lane: 5, trail: 2 };
const road = (id: string, name: string, kind: RoadKind, pts: V2[]): Road => ({ id, name, kind, w: ROAD_W[kind], pts });

/**
 * 模块自己的小路（旧坐标，模块代码里按 id 找：east.ts 的 road()、银行的 drive-up 预览）。世界里的同名路 = 这里 + MOVE（见 ROADS）。
 * 写法照原来的：原尺寸的过 S，照缩完写的过 SI 再过 S。
 */
const O = (pts: V2[]): V2[] => pts.map(([x, z]) => S(x, z) as V2);
export const ROADS_SRC: Road[] = [
  // 沙漠银行的 drive-up（2026-11-18）：横街（原来的棕榈谷大道）进来，沿停车排北边往东，拐角斜切，贴着东墙的取款窗往北接后街（原来接塔奎兹路）
  road(
    'bank_drive',
    '沙漠银行 drive-up',
    'lane',
    O([SI(274.4, -583.5), SI(301, -583.5), SI(304, -586.5), SI(304, -628)]),
  ),
  // 五金大超市的停车场：从西边的路（原来印第安峡谷路，现在横街）往东进来，走停车场北边那条通道，到东头拐北去卸货台
  road('hardware_lot', '五金大超市停车场', 'lane', O([SI(330.5, -557.25), SI(428, -557.25), SI(428, -590)])),
  // 学校车道：从门前的路（原来拉蒙路，现在主街）拐进去，绕到操场西边、停在操场和教学楼之间
  road(
    'school_lane',
    '学校车道',
    'street',
    O([
      [760, -640],
      [728, -671],
      [728, -750],
      [756, -754],
    ]),
  ),
  // 公园路：从西边的日出大道斜进来到游泳中心门前
  road(
    'park_lane',
    '公园路',
    'street',
    O([
      [1004, -480],
      [1060, -486],
      [1120, -520],
    ]),
  ),
  // 日出大道公园那一段（公园西边；park() 在它边上放公交站）
  road(
    'sunrise',
    '公园西路',
    'road',
    O([
      [1000, -636],
      [1004, -480],
      [1008, -400],
    ]),
  ),
];
/** 模块小路归哪个模块 */
const ROAD_MOD: Record<string, ModuleId> = {
  bank_drive: 'bank',
  hardware_lot: 'hardware',
  school_lane: 'school',
  park_lane: 'park',
  sunrise: 'park',
};
const moved = (id: string, cut?: (pts: V2[]) => V2[]): Road => {
  const r = ROADS_SRC.find((q) => q.id === id) as Road;
  const pts = mvPts(ROAD_MOD[id], r.pts) as V2[];
  return { ...r, pts: cut ? cut(pts) : pts };
};

/** 世界的路（新坐标） */
export const ROADS: Road[] = [
  // 俱乐部车道（world.ts 的 DRIVE 接着往东，出湾口就进镇）
  road('drive', '俱乐部车道', 'road', [
    [60, 0],
    [118, 0],
    [205, 0],
  ]),
  // 主街：东西向，北边一排店的门前；东头是街尾（学校、公园）。10 米宽（不是大道）：小镇的街，两边人行道上一排棕榈
  road('main', '主街', 'road', [
    [205, 0],
    [612, 0],
  ]),
  // 横街：主街往北到后街就到头，尽头正对着市政厅（原来的棕榈谷大道的位置：报社、银行都对着它摆的）
  road('cross', '横街', 'road', [
    [274.4, 0],
    [274.4, -51.7],
  ]),
  // 后街：报社、银行、餐馆的背后；北边是体育店、市政厅；东头到校队球场的西北场门跟前（尽头掉头）
  road('back', '后街', 'street', [
    [204, -51.7],
    [326, -51.7],
  ]),
  // 五金大超市停车场的进口：从主街往北拐进来，接停车场北边那条车道（原来接印第安峡谷路）
  road('hardware_in', '五金进口', 'lane', [
    [520.5, 0],
    [520.5, -44.95],
  ]),
  // 模块的小路（旧坐标平移）
  moved('bank_drive', (p) => [...p.slice(0, 3), [304, -51.7]]),
  moved('hardware_lot'),
  moved('school_lane'),
  moved('sunrise', (p) => [p[0], p[1]]),
  moved('park_lane'),
  // ── 住宅（只有外景）：镇子外面一圈弯的小街，有尽头 ──
  // 西边：主街 → 后街西头 → 绕过体育店背后接横街北头
  road('res_w', '棕榈巷', 'street', [
    [214, -5],
    [207, -28],
    [204, -51.7],
    [208, -92],
    [230, -122],
    [274.4, -130],
  ]),
  // 北边：横街北头往东，贴着北边的山脚，到东头接东边那圈
  road('res_n', '山脚路', 'street', [
    [274.4, -130],
    [318, -152],
    [372, -163],
    [425, -167],
    [478, -170],
    [540, -168],
    [610, -150],
  ]),
  // 东边：主街东头往北绕回山脚路
  road('res_e', '东环', 'street', [
    [612, 0],
    [640, -36],
    [648, -84],
    [636, -122],
    [610, -150],
  ]),
  // 东南：主街东头往南，绕到公园背后，尽头掉头
  road('res_se', '日落巷', 'street', [
    [612, 0],
    [622, 48],
    [606, 104],
    [552, 140],
    [492, 150],
  ]),
  // 南边：公园西路往西一条（主街南边、和主街平行）：北边一排房子的后院对着主街（车位后面）
  road('res_s', '仙人掌巷', 'street', [
    [337.4, 45],
    [246, 45],
  ]),
  // 东南：日落巷往西一条（主街南边、公园东边）：同上，北边一排房子的后院对着主街
  road('res_se2', '日落巷西段', 'street', [
    [621, 45],
    [482, 45],
  ]),
  // 南边再一排（2026-11-21 住宅代理，composition C10）：公园西路往西一条短巷，两边一排房子 —— 南边那排的后墙朝南（暗带），
  // 北边那排和仙人掌巷南排背靠背；西头到头掉头
  road('res_s3', '仙人掌巷南', 'street', [
    [338.6, 98],
    [258, 98],
  ]),
  // 酒店地块（俱乐部的扩张地，不动）
  road('hotel_lane', '酒店地块', 'lane', [S(190, 4) as V2, S(160, 24) as V2, [128, 40]]),
];

// ── 建筑（白模的体块） ────────────────────────────────────────────────
export type BldgKind = 'shop' | 'civic' | 'school' | 'house' | 'hotel' | 'gas' | 'office' | 'museum' | 'misc';
export interface Bldg {
  id: string;
  name?: string;
  kind: BldgKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** 绕 y 转（弧度） */
  rot?: number;
  /** 归哪个模块（relocate.ts：旧坐标写、整块平移）；这些楼一律以南墙为轴缩（门朝南） */
  mod?: ModuleId;
}
const b = (
  mod: ModuleId,
  id: string,
  kind: BldgKind,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  name?: string,
  rot = 0,
) => ({ id, kind, x, z, w, d, h, name, rot, mod }) satisfies Bldg;

/**
 * 有名字的楼（办事、找人的地方）；小区的房子在 houses() 里按路撒。
 * 这里写**旧坐标**（照原尺寸写的过 S、照缩完写的过 SI；文件末尾统一过 S，再按 MOVE 平移）。
 * kind 只管白模的墙和屋顶材质（office = 灰泥墙 + 平顶、没有自动的遮阳篷），门面、招牌都在 detail/sites/*.ts 按资产清单摆。
 */
export const BUILDINGS: Bldg[] = [
  // 报社（2026-11-16 美术关卡 1，docs/lab/2026-11-07-3d-pixel/valley-town.md）：门脸（两层办公 + 拱廊 + 角塔）朝南，后面是锯齿顶的印刷车间
  b('paper', 'paper', 'office', ...SI(249, -659), 24, 16, 8, '沙漠太阳报'),
  b('paper', 'paper_press', 'office', ...SI(249, -676), 22, 20, 6),
  // 体育用品店：门前院子里一块试拍的小场 + 对墙
  b('sports', 'sports', 'office', ...SI(252, -724), 22, 18, 5.5, '体育用品店'),
  // 餐馆（2026-11-18，sites/diner.ts）：这一行只是底座（h 0.2 + 屋顶板 = 地坪），墙、玻璃、斜屋顶都在 sites/diner.ts
  b('diner', 'diner', 'office', ...SI(313.115, -561.24), 16.13, 10.48, 0.2, '餐馆'),
  // 五金大超市：东头一个园艺棚院子、再往东是卸货台，南边一大片停车场（SITES 的 hardware_*）
  b('hardware', 'hardware', 'office', ...SI(376, -586), 48, 28, 8, '五金大超市'),
  // 银行：门在南墙正中（townscale FRAMES 'bank' 的轴）
  b('bank', 'bank', 'civic', 358, -860, 20, 24, 8, '沙漠银行'),
  // 市政厅（sites/cityhall.ts）：中世纪现代的一层平顶长楼，门朝南
  b('cityhall', 'cityhall', 'office', 560, -940, 40, 18, 7.5, '市政厅（钟楼）'),
  // 高中（detail/east.ts 的 school()）：两栋都以南墙为轴缩；教学楼的南面 = 前门广场，体育馆的南面 = 选拔日、排名榜，对着校队球场
  b('school', 'school_main', 'school', ...SI(602, -558), 70, 40, 9, '棕榈泉高中'),
  // 体育馆跟着校队球场走（relocate.ts 的 schoolCourts）
  b('schoolCourts', 'school_gym', 'school', ...SI(668, -513.5), 36, 30, 10, '体育馆'),
  // 日出公园东头的游泳中心（公园路的尽头）
  b('park', 'swim_center', 'civic', 1150, -560, 30, 20, 6, '游泳中心'),
];

/**
 * 三家办事的楼的院子（门前、停车场、货场、园艺棚……；缩完的世界坐标，文件末尾不再缩）：
 * houses() 撒的铺面不压进来；detail/town.ts 在里面摆这家的东西（占地 claim：街边家具、build.ts 的灌木和棕榈不进来）。
 */
export interface Site extends Rect {
  id: string;
  /** 归哪栋楼（BUILDINGS 的 id = 模块 id） */
  of: ModuleId;
}
export const SITES: Site[] = [
  // 报社门前：拱廊 + 门前一条铺地，接塔奎兹路北边的人行道（人行道 z −644.6 起归 town.ts 的街）
  { id: 'paper_front', of: 'paper', x0: 233.5, x1: 263.4, z0: -651, z1: -644.6 },
  // 报社西边的货场：印刷车间的卸货门、送报车、新闻纸卷
  { id: 'paper_yard', of: 'paper', x0: 222, x1: 236.5, z0: -688, z1: -662 },
  // 体育用品店门前的院子：门廊 + 试拍小场 + 对墙
  // 2026-11-21：只留门前的陶砖前场（到 −708.4；再往南原来是一块空院子，压紧以后那里是后街）
  { id: 'sports_yard', of: 'sports', x0: 240, x1: 263.4, z0: -714.8, z1: -708.4 },
  // 五金大超市：门前的人行台 + 停车场（印第安峡谷路人行道以东到东头卸货道）
  { id: 'hardware_lot', of: 'hardware', x0: 339, x1: 436, z0: -572, z1: -524 },
  // 西边朝印第安峡谷路的一条：丙烷笼、购物车回收、货板（不撒铺面，楼的西墙露出来）
  { id: 'hardware_side', of: 'hardware', x0: 339, x1: 352, z0: -602, z1: -572 },
  // 园艺棚院子（东头，矮花砖墙围着，南边开门对停车场）
  { id: 'hardware_garden', of: 'hardware', x0: 400, x1: 420, z0: -600, z1: -572 },
  // 卸货台（园艺棚再往东，停车场东头的车道拐上来）
  { id: 'hardware_dock', of: 'hardware', x0: 420, x1: 436, z0: -602, z1: -572 },
  // 餐馆门前（门面线 z −556 以南）：一条陶砖人行 + 一排车位的小停车场，不压印第安峡谷路的弯道（sites/diner.ts）
  { id: 'diner_lot', of: 'diner', x0: 305, x1: 322, z0: -556, z1: -543.5 },
  // 银行门前（门面线 z −590 以南，不缩）：人行台 + drive-up 车道（ROADS 'bank_drive'）的东西向那段 + 一排车位、时间温度招牌的花岛
  //（sites/bank.ts）。原来压在这里的铺面 palm_canyon_112 不撒了
  { id: 'bank_lot', of: 'bank', x0: 283.5, x1: 301.4, z0: -590, z1: -574.5 },
];
const siteBox = (s: Site): Bldg => ({
  id: s.id,
  kind: 'misc',
  x: (s.x0 + s.x1) / 2,
  z: (s.z0 + s.z1) / 2,
  w: s.x1 - s.x0,
  d: s.z1 - s.z0,
  h: 0,
  rot: 0,
});

/** 俱乐部的扩张地：将来的酒店（用户 2026-11-15：酒店是俱乐部长大的方向）。调试开关能切成酒店白模 */
export const HOTEL_PLOT: Rect = { x0: 112, x1: 236, z0: 18, z1: 84 };
export const HOTEL_BLDGS: Bldg[] = [
  { id: 'hotel_main', kind: 'hotel', x: 196, z: 52, w: 52, d: 22, h: 16, name: '俱乐部酒店', rot: 0 },
  { id: 'hotel_wing', kind: 'hotel', x: 150, z: 56, w: 22, d: 30, h: 10, name: '酒店客房', rot: 0 },
];

// ── 小镇里的事（跑图的理由：办事、找人、活动） ─────────────
export type PoiKind = 'errand' | 'person' | 'event' | 'find' | 'view';
export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  x: number;
  z: number;
  /** 一句话：在这儿干什么 */
  note: string;
  /** 归哪个模块（旧坐标写、整块平移） */
  mod: ModuleId;
}
/**
 * 旧坐标写（照缩完的画面摆的过 SI）：x z 是门槛 / 总监站的地方；build.ts 把旗子立在它南边 3 米。
 * 文件末尾过 S、按 MOVE 平移、再按缩放框（FRAMES）跟着楼缩。
 */
export const POIS: Poi[] = [
  // 办事
  { id: 'p_paper', mod: 'paper', kind: 'errand', name: '报社', ...SIxz(249, -649), note: '登广告、接受采访' },
  {
    id: 'p_sports',
    mod: 'sports',
    kind: 'errand',
    name: '体育用品店',
    ...SIxz(258, -714.5),
    note: '订球、穿线、谈寄卖',
  },
  // 银行：门在南墙正中（townscale FRAMES 'bank' 的轴），旗子在门前人行台上
  { id: 'p_bank', mod: 'bank', kind: 'errand', name: '银行', ...SIxz(292.6, -589.5), note: '贷款扩场、存当天的营业款' },
  {
    id: 'p_hardware',
    mod: 'hardware',
    kind: 'errand',
    name: '五金大超市',
    ...SIxz(365, -569.5),
    note: '买喷头、网柱零件、场地线漆',
  },
  // 市政厅：门槛 = 正门 (434, −649)，旗子在台阶前
  {
    id: 'p_cityhall',
    mod: 'cityhall',
    kind: 'errand',
    name: '市政厅',
    ...SIxz(434, -649),
    note: '申请办赛许可、扩建审批、夜灯投诉的听证会',
  },
  // 找人
  // 餐馆：门槛（南门 x 318.6、门面线 z −556）；旗子在门前 3 米
  {
    id: 'p_diner',
    mod: 'diner',
    kind: 'person',
    name: '餐馆',
    ...SIxz(318.6, -556),
    note: '镇上人吃饭聊天：招场地工、教练，听别处的线索',
  },
  // 高中教练：校队三号场（看台那片）的北场门外，拿着夹板；旗子在南边 3 米 = 场门口
  {
    id: 'p_school_coach',
    mod: 'schoolCourts',
    kind: 'person',
    name: '高中教练',
    ...SIxz(690.5, -495.5),
    note: '校队教练拿着夹板：问他哪几个孩子值得去俱乐部练',
  },
  // 日出公园的三处（旗子在南边 3 米 = detail/east.ts 的 PARK_SPOTS 里总监站的地方）
  {
    id: 'p_kid',
    mod: 'park',
    kind: 'person',
    name: '天才少年',
    ...SIxz(825.6, -421.5),
    note: '每天傍晚在公园公共场对墙打',
  },
  // 活动
  // 青训选拔日：一号场的报名桌前（体育馆门口的排名榜正对着）；旗子在南边 3 米 = 桌前
  {
    id: 'p_school_event',
    mod: 'schoolCourts',
    kind: 'event',
    name: '青训选拔日',
    ...SIxz(665, -490),
    note: '号码布、锥桶、排队的孩子：挑几个进俱乐部的青训队',
  },
  {
    id: 'p_park_clinic',
    mod: 'park',
    kind: 'event',
    name: '公园公开课',
    ...SIxz(770, -377),
    note: '周末免费教学，拉新会员',
  },
  {
    id: 'p_park_pickup',
    mod: 'park',
    kind: 'event',
    name: '公园野球局',
    ...SIxz(781.1, -396.9),
    note: '公共场上的野球局：挂拍排队、胜者留场，看谁打得好，或者被叫下场',
  },
  // 地标：钟塔（前庭西头的两片立板夹着钟，sites/cityhall.ts），旗子在塔南边
  { id: 'p_clock', mod: 'cityhall', kind: 'view', name: '市政厅钟塔', ...SIxz(428, -645.6), note: '主街东头的地标' },
];

/** 绿地：公园的草地、学校的操场（旧坐标，原尺寸写、过 S，再按 MOVE 平移） */
export type GreenKind = 'park' | 'field';
export const GREENS: { id: string; name: string; kind: GreenKind; poly: V2[]; mod: ModuleId }[] = [
  {
    id: 'sunrise_park',
    name: '日出公园',
    kind: 'park',
    mod: 'park',
    poly: [
      [1020, -620],
      [1200, -620],
      [1200, -450],
      [1020, -450],
    ],
  },
  {
    id: 'school_field',
    name: '学校操场',
    kind: 'field',
    mod: 'school',
    poly: [
      [740, -740],
      [840, -740],
      [840, -660],
      [740, -660],
    ],
  },
];
/** 学校跑道的中心（旧坐标原尺寸 (795, −700) 过 S 再平移；build.ts 画跑道，school() 照旧坐标画分道线） */
export const TRACK: V2 = mv('school', ...S(795, -700));

/**
 * 北边山口外的低地（风车田；不能去，只看）：从平地北沿的山口往北张开。terrain.ts 在这里把山压平、build.ts 把风车撒在里面
 */
export const PASS: V2[] = [
  [350, -205],
  [455, -205],
  [540, -330],
  [580, -560],
  [240, -560],
  [280, -330],
];
/** 风车（山口外一大片，远景地标；在 FLOOR 外面，不能去）：一排排斜着往山口外退，每台抖开、缺几台（不是方格） */
function windmillsRaw(): V2[] {
  const out: V2[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 6; i++) {
      const n = j * 6 + i;
      if (hash('windmill', n) < 0.2) continue;
      const x = 300 + i * 46 + (j % 2) * 23 - j * 6 + (hash('windmill', n + 50) - 0.5) * 18;
      const z = -270 - j * 62 - i * 3 + (hash('windmill', n + 100) - 0.5) * 20;
      if (!inPoly(PASS, x, z)) continue;
      out.push([Math.round(x), Math.round(z)] as const);
    }
  return out;
}

// ── 小区的房子：沿弯路两边撒（确定性，按路的 id 做种子） ──────────────
function hash(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** 撒房子 / 铺面的路：间距、离路中线多远、种类、只在哪个范围里撒 */
interface Strew {
  road: string;
  gap: number;
  setback: number;
  kind?: 'house' | 'shop';
  within?: Rect;
}
const HOUSE_ROADS: Strew[] = [
  { road: 'res_w', gap: 15, setback: 15 },
  { road: 'res_n', gap: 15, setback: 15 },
  { road: 'res_e', gap: 15, setback: 15 },
  { road: 'res_se', gap: 15, setback: 15 },
  { road: 'res_s', gap: 15, setback: 15 },
  { road: 'res_se2', gap: 15, setback: 15 },
  { road: 'res_s3', gap: 15, setback: 14 },
];
/**
 * 手摆的房子（世界坐标；fx fz = 朝街的方向；尺寸是缩之前的，houses() 照样按 HOUSE_K 以门面为轴缩）：
 * - 体育店西边两栋（composition G3），朝棕榈巷（西）
 * - 公园西路西边两栋（C16），朝公园西路（东）
 * 门面中心 (fx0, fz0) 固定，中心 = 门面往里退半个进深
 */
const HOUSE_EXTRA: { id: string; x: number; z: number; f: [number, number]; w: number; d: number; h: number }[] = [
  { id: 'extra_g3_1', x: 213, z: -66, f: [-1, 0], w: 12, d: 10, h: 4.2 },
  { id: 'extra_g3_2', x: 213, z: -80.5, f: [-1, 0], w: 11.5, d: 10, h: 3.8 },
  { id: 'extra_pw_1', x: 329, z: 22, f: [1, 0], w: 12, d: 10, h: 4 },
  { id: 'extra_pw_2', x: 330, z: 72, f: [1, 0], w: 12, d: 10.5, h: 4.4 },
  // 仙人掌巷南撒剩下的空当（按种子空着的地块，一整排只剩 4 栋）
  { id: 'res_s3_x1', x: 301, z: 88.7, f: [0, 1], w: 11.5, d: 10, h: 3.9 },
  { id: 'res_s3_x2', x: 286, z: 88.7, f: [0, 1], w: 12, d: 9.5, h: 4.3 },
  { id: 'res_s3_x3', x: 286, z: 105.6, f: [0, -1], w: 12, d: 11, h: 3.7 },
  { id: 'res_s3_x4', x: 271, z: 105.6, f: [0, -1], w: 11, d: 10.5, h: 4.1 },
  // 第 3 轮（批判 2 的"第二圈沙"）：市政厅公共停车场（G2）北边三栋，门朝北、后院墙朝南对着停车场（一条暗带）
  { id: 'extra_g2_1', x: 314, z: -110, f: [0, -1], w: 12, d: 10, h: 4.0 },
  { id: 'extra_g2_2', x: 328.5, z: -110, f: [0, -1], w: 11.5, d: 10, h: 4.4 },
  { id: 'extra_g2_3', x: 343, z: -110, f: [0, -1], w: 12, d: 10, h: 3.8 },
  // 进镇北侧（俱乐部车道北边）两栋，门朝路
  { id: 'extra_in_1', x: 170, z: -9, f: [0, 1], w: 12, d: 10, h: 4.2 },
  { id: 'extra_in_2', x: 183.5, z: -9, f: [0, 1], w: 11.5, d: 10, h: 3.9 },
  // 日落巷西段北排东头那块空地（主街南沿墙后面露一块沙）
  { id: 'res_se2_x1', x: 599, z: 35.5, f: [0, 1], w: 11.5, d: 10, h: 4.0 },
];
/** 住宅不撒进模块那几块（旧坐标框平移到世界，外扩 4 米）：院子、球场、停车场这些不在 BUILDINGS 里的也躲开 */
const MOD_KEEP: Rect[] = (Object.keys(MOD_OLD_BOX) as ModuleId[]).map((id) => {
  const r = mvRect(id, MOD_OLD_BOX[id]);
  return { x0: r.x0 - 4, x1: r.x1 + 4, z0: r.z0 - 4, z1: r.z1 + 4 };
});
const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
/** 小区房子朝街的方向（世界，单位向量；房子的本地 +z 轴） */
const HOUSE_FRONT = new Map<string, [number, number]>();
/** 按路撒房子（缩之前的尺寸；和 2026-11-18 以前撒出来的一模一样） */
function housesPlace(): Bldg[] {
  const out: Bldg[] = [];
  const all = [...BUILDINGS_RAW, ...HOTEL_BLDGS];
  for (const { road: id, gap, setback, kind = 'house', within } of HOUSE_ROADS) {
    const r = ROADS.find((q) => q.id === id);
    if (!r) continue;
    const shop = kind === 'shop';
    let n = 0;
    for (const [, p, t] of along(r.pts, gap)) {
      for (const side of [-1, 1]) {
        n++;
        if (hash(id, n) < (shop ? 0.08 : 0.18)) continue; // 空地
        // 房子 10～16 米宽（整体缩小以后路短了三成，间距跟着收，房子也窄一点才排得下、不挤）
        const w0 = shop ? gap - 1.5 : Math.min(gap - 3, 10 + hash(id, n + 100) * 6);
        const d0 = shop ? 12 + hash(id, n + 200) * 6 : 9 + hash(id, n + 200) * 4;
        // 铺面：店门口离路面边留一条 3.5 米的人行道（按这栋店的深度往后退；固定退线时深的店压到路沿上，招牌、停的车伸进车道）
        const sb = shop ? Math.max(setback, r.w / 2 + 3.5 + d0 / 2) : setback;
        const x = p[0] - t[1] * side * sb;
        const z = p[1] + t[0] * side * sb;
        if (within && !inRect(within, x, z)) continue;
        if (!inPoly(FLOOR, x, z)) continue;
        const pad = shop ? 4 : 9;
        if (ROADS.some((q) => q !== r && q.kind !== 'trail' && distToLine(q.pts, x, z) < q.w / 2 + pad)) continue;
        // 脚印的一圈也不能压到路上（只查中心的话，转角处的铺面会伸进别的路）。按这栋楼真实的宽深查
        //（原来一律按 20 × 14 / 18 深查，比退线还深，棕榈谷大道、印第安峡谷路、塔奎兹路边的铺面全被拒了）
        // 连屋檐（房子出挑 0.7 米、店 0.25 米）一起查：屋檐也不能伸到路面上方
        const eave = shop ? 0.25 : 0.7;
        const rot0 = -Math.atan2(t[1], t[0]);
        const c0 = Math.cos(rot0);
        const s0 = Math.sin(rot0);
        // 四个角 + 四条边的中点（急弯的小环会从两个角中间切过去）
        const hw = w0 / 2 + eave;
        const hd = d0 / 2 + eave;
        const corners = [
          [-hw, -hd],
          [0, -hd],
          [hw, -hd],
          [hw, 0],
          [hw, hd],
          [0, hd],
          [-hw, hd],
          [-hw, 0],
        ].map(([a, b]) => [x + a * c0 + b * s0, z - a * s0 + b * c0] as const);
        if (
          // 别的路：路面外再让 0.6 米；自己这条路：退线是设计好的，只要不压进路面
          corners.some(([cx, cz]) =>
            ROADS.some((q) => q.kind !== 'trail' && distToLine(q.pts, cx, cz) < q.w / 2 + (q === r ? 0.3 : 0.6)),
          )
        )
          continue;
        if (all.some((o) => Math.abs(o.x - x) < o.w / 2 + pad && Math.abs(o.z - z) < o.d / 2 + pad)) continue;
        if (GREENS.some((q) => inPoly(q.poly, x, z))) continue;
        if (MOD_KEEP.some((q) => inRect(q, x, z))) continue;
        HOUSE_FRONT.set(`${id}_${n}`, [t[1] * side, -t[0] * side]);
        out.push({
          id: `${id}_${n}`,
          kind: shop ? 'shop' : 'house',
          x,
          z,
          w: w0,
          d: d0,
          h: shop ? 4 + hash(id, n + 300) * 4 : 3.4 + hash(id, n + 300) * 1.2,
          rot: -Math.atan2(t[1], t[0]),
        });
      }
    }
  }
  // 互相压着的去掉：按转过的矩形（连屋檐 + 1.5 米）真算，先来的留下（原来按中心距估，弯路上有 7 处叠在一起）
  // 三家办事的楼的院子（SITES）里不撒（连屋檐 + 1 米）
  const sites = SITES_RAW.map(siteBox);
  const kept: Bldg[] = [];
  for (const h of out)
    if (!kept.some((o) => rectsOverlap(o, h, 1.5)) && !sites.some((s) => rectsOverlap(s, h, 2))) kept.push(h);
  // 手摆的不过上面的去重（那个按缩之前的脚印算，偏保守；这几栋按缩完的位置手量过）
  for (const e of HOUSE_EXTRA) {
    HOUSE_FRONT.set(e.id, e.f);
    kept.push({
      id: e.id,
      kind: 'house',
      x: e.x - (e.f[0] * e.d) / 2,
      z: e.z - (e.f[1] * e.d) / 2,
      w: e.w,
      d: e.d,
      h: e.h,
      rot: Math.atan2(e.f[0], e.f[1]),
    });
  }
  return kept;
}
/** 两个转过的矩形（楼的脚印，各往外扩 pad/2）有没有压着：分离轴 */
function rectsOverlap(a: Bldg, b: Bldg, pad: number): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) > (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2 + pad) return false;
  const axes = (o: Bldg): V2[] => {
    const c = Math.cos(o.rot ?? 0);
    const s = Math.sin(o.rot ?? 0);
    return [
      [c, -s],
      [s, c],
    ];
  };
  const half = (o: Bldg, [ux, uz]: V2) => {
    const [[ax, az], [bx, bz]] = axes(o);
    return (Math.abs(ax * ux + az * uz) * (o.w + pad)) / 2 + (Math.abs(bx * ux + bz * uz) * (o.d + pad)) / 2;
  };
  for (const u of [...axes(a), ...axes(b)]) {
    const d = Math.abs((b.x - a.x) * u[0] + (b.z - a.z) * u[1]);
    if (d > half(a, u) + half(b, u)) return false;
  }
  return true;
}

// ── 几何小工具 ─────────────────────────────────────────────────────────
export function inPoly(pts: readonly V2[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function polyLength(pts: readonly V2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
/** 沿折线每 step 米一个点：[离起点的距离, 点, 单位切向] */
export function along(pts: readonly V2[], step: number): [number, V2, V2][] {
  const out: [number, V2, V2][] = [];
  let acc = step / 2;
  let s0 = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    const t: V2 = [(bx - ax) / L, (bz - az) / L];
    while (acc <= s0 + L) {
      const k = (acc - s0) / L;
      out.push([acc, [ax + (bx - ax) * k, az + (bz - az) * k], t]);
      acc += step;
    }
    s0 += L;
  }
  return out;
}
export function distToLine(pts: readonly V2[], x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = L > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
/** 这一点归哪片区域：按 REGIONS 的顺序取第一个包含它的（区域的多边形可以压在别的上面，前面的优先） */
export const regionAt = (x: number, z: number): Region | null => REGIONS.find((r) => inPoly(r.poly, x, z)) ?? null;

/** 几趟典型的跑图（沿路的折线，平面图上算距离和时间）：从俱乐部门口（围墙的车道口）出发 */
const GATE: V2[] = [
  [116, 0],
  [205, 0],
];
export const TRIPS: { name: string; pts: V2[] }[] = [
  { name: '俱乐部 → 报社', pts: [...GATE, [249, 0], [249, -13]] },
  { name: '俱乐部 → 市政厅', pts: [...GATE, [274.4, 0], [274.4, -63]] },
  { name: '俱乐部 → 体育用品店', pts: [...GATE, [274.4, 0], [274.4, -51.7], [241, -51.7], [241, -61]] },
  { name: '俱乐部 → 五金大超市', pts: [...GATE, [555, 0], [555, -57]] },
  // 选拔日的报名桌在一号场北边：横街 → 后街东头 → 校队球场的西北场门
  {
    name: '俱乐部 → 学校（选拔日）',
    pts: [...GATE, [274.4, 0], [274.4, -51.7], [326, -51.7], [336, -45], [336, -42], [358, -39.5]],
  },
  { name: '俱乐部 → 日出公园', pts: [...GATE, [336, 0], [338.8, 55.5], [384, 55.5], [384, 51]] },
];

// ── 模块的数据：旧坐标（原尺寸写的过 S）→ 按 MOVE 平移到世界 ─────────────
// 楼、POI、绿地照原尺寸写（照缩完写的过了 SI），这里统一过 S 回到旧坐标，再按各自的模块整块平移；
// 院子（SITES）本来就写旧坐标，只平移。新的路、平地、区域直接写世界坐标，不过这里。
const sp = (pts: V2[]) => pts.map(([x, z]) => S(x, z) as V2);
{
  for (const o of BUILDINGS) {
    [o.x, o.z] = S(o.x, o.z);
    if (o.mod) [o.x, o.z] = mv(o.mod, o.x, o.z);
  }
  for (const p of POIS) [p.x, p.z] = mv(p.mod, ...S(p.x, p.z));
  for (const q of GREENS) q.poly = mvPts(q.mod, sp(q.poly)) as V2[];
  for (const r of SITES) Object.assign(r, mvRect(r.of, r));
}
// ── 小镇的比例（2026-11-18，townscale.ts）：俱乐部以外的楼按 TOWN_K 缩、小区的房子按 HOUSE_K 缩，门面线不动 ─────
// 每栋楼是一个相似变换：轴 = 朝街那一面的正中（门面线上），p' = 轴 + (p − 轴) × k（宽、深、高都乘 k）。
// 三栋办事楼（townscale 的 FRAMES）轴 = 门口，楼身、车间、POI、贴着楼的院子（门面线以北的 SITES）一起走。
// 细节文件（detail/*.ts、sites/*.ts）读缩之前的数据（BUILDINGS_RAW、SITES_RAW、housesRaw()）照原尺寸摆，
// build.ts 的 townWrap 用 bldgFrames() 把贴着每栋楼的东西（招牌、屋顶的空调、门廊）按这栋楼的变换搬过去。
/** 一栋楼的缩放：轴 (px, pz)、倍数 k；zone = 缩之前的脚印（中心 cx cz、半宽 hw、半深 hd、转角的 cos sin） */
export interface BFrame {
  id: string;
  px: number;
  pz: number;
  k: number;
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
}
/** 楼朝哪条路（同 build.ts 的 faceOf）：本地的面法线 → 世界方向；depth = 朝街那根轴上的进深 */
function frontOf(o: Bldg): { f: [number, number]; depth: number } {
  let best = Number.POSITIVE_INFINITY;
  let bx = o.x;
  let bz = o.z + 1;
  for (const q of ROADS) {
    if (q.kind === 'trail') continue;
    for (let i = 1; i < q.pts.length; i++) {
      const [ax, az] = q.pts[i - 1];
      const [cx, cz] = q.pts[i];
      const dx = cx - ax;
      const dz = cz - az;
      const L = dx * dx + dz * dz;
      const t = L > 0 ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / L)) : 0;
      const d = Math.hypot(o.x - (ax + dx * t), o.z - (az + dz * t));
      if (d < best) {
        best = d;
        bx = ax + dx * t;
        bz = az + dz * t;
      }
    }
  }
  const rot = o.rot ?? 0;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  const lx0 = (bx - o.x) * c - (bz - o.z) * sn;
  const lz0 = (bx - o.x) * sn + (bz - o.z) * c;
  const alongX = Math.abs(lx0) / o.w > Math.abs(lz0) / o.d;
  const [lx, lz] = alongX ? [Math.sign(lx0), 0] : [0, Math.sign(lz0) || 1];
  // 本地 → 世界（rotateY(rot)）
  return { f: [lx * c + lz * sn, -lx * sn + lz * c], depth: alongX ? o.w : o.d };
}
/** 绕轴 (px, pz) 缩 k：改 o，返回它的 BFrame（zone 是缩之前的脚印） */
function shrinkBldg(o: Bldg, px: number, pz: number, k: number): BFrame {
  const rot = o.rot ?? 0;
  const fr: BFrame = {
    id: o.id,
    px,
    pz,
    k,
    cx: o.x,
    cz: o.z,
    hw: o.w / 2,
    hd: o.d / 2,
    c: Math.cos(rot),
    s: Math.sin(rot),
  };
  o.x = px + (o.x - px) * k;
  o.z = pz + (o.z - pz) * k;
  o.w *= k;
  o.d *= k;
  o.h *= k;
  return fr;
}
/** 缩之前的楼（细节文件照这个摆） */
export const BUILDINGS_RAW: readonly Bldg[] = BUILDINGS.map((o) => ({ ...o }));
/** 缩之前的院子 */
export const SITES_RAW: readonly Site[] = SITES.map((r) => ({ ...r }));
const BLDG_FRAMES: BFrame[] = [];
{
  for (const o of BUILDINGS) {
    if (keepScale(o.x, o.z)) continue;
    const sf = frameAt(o.x, o.z);
    if (sf) {
      shrinkBldg(o, sf.px, sf.pz, TOWN_K);
      continue;
    }
    // 模块的楼（市政厅、高中两栋、游泳中心）门一律朝南：以南墙为轴（原来按最近的路算出来也是南墙；压紧以后最近的路可能换了一条）
    const { f, depth } = o.mod ? { f: [0, 1] as [number, number], depth: o.d } : frontOf(o);
    BLDG_FRAMES.push(shrinkBldg(o, o.x + (f[0] * depth) / 2, o.z + (f[1] * depth) / 2, TOWN_K));
  }
  for (const p of POIS) {
    const f = frameAt(p.x, p.z);
    if (f) [p.x, p.z] = fmap(f, p.x, p.z);
  }
  for (const r of SITES) {
    const f = FRAMES.find((q) => q.id === r.of);
    if (f && r.z1 <= f.pz + FRONT_PAD) Object.assign(r, fmapRect(f, r));
  }
}
let HOUSES_RAW: Bldg[] | null = null;
let HOUSES: Bldg[] | null = null;
let HOUSE_FRAMES: BFrame[] = [];
/** 缩之前的小区房子（细节文件照这个摆）；同一份，别改它 */
export function housesRaw(): Bldg[] {
  HOUSES_RAW ??= housesPlace();
  return HOUSES_RAW;
}
/** 小区的房子（缩完的：铺面乘 TOWN_K、住家乘 HOUSE_K，临街那一面不动）；同一份，别改它 */
export function houses(): Bldg[] {
  if (!HOUSES) {
    HOUSE_FRAMES = [];
    HOUSES = housesRaw().map((r) => {
      const o = { ...r };
      const k = o.kind === 'shop' ? TOWN_K : HOUSE_K;
      const f = HOUSE_FRONT.get(o.id) ?? [0, 1];
      HOUSE_FRAMES.push(shrinkBldg(o, o.x + (f[0] * o.d) / 2, o.z + (f[1] * o.d) / 2, k));
      return o;
    });
  }
  return HOUSES;
}
/** 每栋缩过的楼的变换（townWrap 用） */
export function bldgFrames(): BFrame[] {
  houses();
  return [...BLDG_FRAMES, ...HOUSE_FRAMES];
}
/** 风车（山口外一大片，地图上的远景地标；在 FLOOR 外面，不能去） */
export const windmills = (): V2[] => windmillsRaw();
