// valley：俱乐部所在的小镇和山谷（地图扩张 demo，2026-11-15）。这里只有数 —— 平面图（plan.ts）和以后的 3D 白模读同一份。
//
// 坐标同 clubsite/world.ts（米，y 朝上，北 = −z，东 = +x；俱乐部在原点附近不动）。
// 地理照真实的棕榈泉排（地名照实，demo 阶段先这样，进游戏前再定要不要改）：
// - 西边是圣哈辛托山一整面山墙，小镇贴着山脚长；北边的山口出去是 111 号公路和 I-10、风车田；南边是圣罗莎山的山脚；东边谷地敞开（机场、大教堂城）。
// - 俱乐部在西南角一个山湾里（西、北、南三面山，原来 clubsite/mountains.ts 那圈），湾口朝东，车道出湾口接上南棕榈谷大道。
// - 棕榈谷大道一路往北进市中心（和印第安峡谷路一对单行道），北出口变成 111 号公路。
// - 塔奎兹溪的干河床从山里的峡谷（尽头是瀑布）出来，斜着往东南穿过整个山谷。
//
// 尺度（用户 2026-11-15 选的"走路、球车加汽车"）：山谷大约是俱乐部的十倍。俱乐部到市中心沿路约 1 公里：
// 走路 ≈ 5 分钟，球车 ≈ 2 分半，汽车 ≈ 1 分钟（SPEED）。
//
// 不规整（研究结论，见 docs/lab/2026-11-07-3d-pixel/valley.md）：主路可以直，小区的路是弯的、有尽头；
// 地形（山湾、峡谷、干河床）把平地切开；远处看得见的地标（风车、山顶观景台、市政厅钟楼）勾着人走。

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

// 整体缩放（说明见文件末尾）：S 要在用到它的常量之前定义
export const SCALE = 0.7;
export const ANCHOR: V2 = [140, 0];
const CLUB_BOX_L = { x0: -80, x1: 140, z0: -60, z1: 100 };
/** 原尺寸的世界坐标 → 缩放后的（俱乐部那块原样） */
export function S(x: number, z: number): [number, number] {
  if (x >= CLUB_BOX_L.x0 && x <= CLUB_BOX_L.x1 && z >= CLUB_BOX_L.z0 && z <= CLUB_BOX_L.z1) return [x, z];
  return [ANCHOR[0] + (x - ANCHOR[0]) * SCALE, ANCHOR[1] + (z - ANCHOR[1]) * SCALE];
}
/**
 * S 的逆：缩完的世界坐标 → 原尺寸。2026-11-16 起按缩完的画面重新摆的东西（市中心三家办事的楼）直接写最终坐标，
 * 过一次 SI，文件末尾统一过 S 以后正好回到写的数（俱乐部那块以外才用）。
 */
export function SI(x: number, z: number): [number, number] {
  return [ANCHOR[0] + (x - ANCHOR[0]) / SCALE, ANCHOR[1] + (z - ANCHOR[1]) / SCALE];
}
const SIxz = (x: number, z: number) => {
  const [a, c] = SI(x, z);
  return { x: a, z: c };
};

/** 平面图 / 3D 白模画的整个范围（含四周的山） */
export const VIEW: Rect = { x0: -200, x1: 1600, z0: -1480, z1: 360 };

/**
 * 山谷的平地（能走能开的地都在这圈里面；外面是山）。顺时针，从俱乐部的西北角起。
 * 俱乐部那段就是 clubsite/world.ts 的 DESERT（x −80…101，z −58…90），湾口往东张开。
 */
export const FLOOR: V2[] = [
  [-80, -58],
  [101, -58],
  // 北边的山嘴（把俱乐部的山湾和塔奎兹那片隔开）：往东伸到 x 165，再沿山嘴北坡退回山脚
  [150, -62],
  [168, -84],
  [150, -118],
  [112, -150],
  [96, -230],
  [108, -330],
  [122, -470],
  // 塔奎兹峡谷：山脚的一道口子往西进山，尽头是瀑布
  [128, -560],
  [70, -578],
  [22, -590],
  [8, -610],
  [26, -628],
  [74, -626],
  [132, -650],
  [150, -780],
  // 市中心背后：美术馆和登山步道的山脚
  [176, -880],
  [182, -1010],
  // 拉斯帕尔马斯景区：贴着山脚的老街区
  [196, -1150],
  [236, -1260],
  // 北边的山口（111 号公路出去，远处是风车田）
  [330, -1350],
  [420, -1400],
  [700, -1400],
  [860, -1340],
  [1100, -1300],
  [1560, -1280],
  // 东边谷地敞开（地图边上远远一道小圣贝纳迪诺山）
  [1560, 230],
  // 南边圣罗莎山的山脚，印第安峡谷的口子
  [1100, 250],
  [760, 236],
  [520, 214],
  [380, 196],
  [336, 214],
  [312, 290],
  [282, 296],
  [270, 210],
  [210, 150],
  [150, 112],
  [101, 90],
  [-80, 90],
];

// ── 区域和解锁 ─────────────────────────────────────────────────────────
/**
 * 一片区域：开局开着的（open）或者锁着的。锁着的 = 画面压暗、路口有路障；解锁靠事件和人（用户 2026-11-15 选的），
 * demo 里先用调试开关切（who 写的是以后的解锁事件，平面图上标出来）。
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
    poly: [
      [-200, -200],
      [240, -200],
      [240, 360],
      [-200, 360],
    ],
    open: true,
    who: '开局',
    color: '#c0563f',
  },
  {
    id: 'south',
    name: '南棕榈谷',
    // 棕榈谷大道两边一条走廊（x 290…360）一直通到市中心南沿：开局就能开车进城的路，只解锁市中心也到得了。
    // 走廊压在塔奎兹溪那片上面；regionAt 按 REGIONS 的顺序取第一个，所以这片要排在 wash 前面
    poly: [
      [240, -260],
      [290, -258],
      [290, -720],
      [360, -720],
      [360, -242],
      [440, -230],
      [700, -150],
      [1600, -150],
      [1600, 360],
      [240, 360],
    ],
    open: true,
    who: '开局（俱乐部门口的路）',
    color: '#d08a3a',
  },
  {
    id: 'town',
    name: '市中心',
    poly: [
      [100, -720],
      [660, -720],
      [660, -1300],
      [100, -1300],
    ],
    open: false,
    who: '《沙漠太阳报》的记者来俱乐部采访 → 请你去报社 / 体育用品店老板来订球',
    color: '#3f6fb0',
  },
  {
    id: 'school',
    name: '学校和日出公园',
    poly: [
      [660, -1000],
      [1300, -1000],
      [1300, -420],
      [660, -420],
    ],
    open: false,
    who: '青训缺人 → 高中教练推荐苗子，去学校看球挑人；公园的公共球场要人管',
    color: '#5a9a52',
  },
  {
    id: 'wash',
    name: '塔奎兹溪和峡谷',
    poly: [
      [-40, -720],
      [660, -720],
      [660, -420],
      [1600, -420],
      [1600, -150],
      [1000, -150],
      [700, -150],
      [440, -230],
      [240, -260],
      [240, -200],
      [-40, -200],
    ],
    open: false,
    who: '暴雨后河床冲出一只旧球拍 / 部落的巡护员来说峡谷开放了',
    color: '#b59a4a',
  },
  {
    id: 'mountain',
    name: '山上步道',
    poly: [
      [-200, -1300],
      [100, -1300],
      [100, -720],
      [-200, -720],
    ],
    open: false,
    who: '美术馆馆长请你给步道上的观景台办一场日出球会',
    color: '#8a5aa0',
  },
  {
    id: 'highway',
    name: '111 号公路和风车',
    poly: [
      [100, -1300],
      [1000, -1300],
      [1000, -1480],
      [100, -1480],
    ],
    open: false,
    who: '赞助商（风电公司）的车停在门口：去他们公路边的办公室谈',
    color: '#4a8a96',
  },
  {
    id: 'east',
    name: '东谷和机场',
    poly: [
      [1000, -1480],
      [1600, -1480],
      [1600, -420],
      [1300, -420],
      [1300, -1000],
      [660, -1000],
      [660, -1300],
      [1000, -1300],
    ],
    open: false,
    who: '以后：机场、球拍俱乐部老街区（这次只留路和体块）',
    color: '#777777',
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

export const ROADS: Road[] = [
  // 俱乐部车道（world.ts 的 DRIVE 接着往东，出湾口）
  road('drive', '俱乐部车道', 'road', [
    [60, 0],
    [118, 0],
    [190, 4],
    [250, -2],
    [306, -12],
  ]),
  // 南北主路：南头是印第安峡谷的口子，北头出山口变成 111 号公路
  road('palm_canyon', '棕榈谷大道', 'avenue', [
    [298, 200],
    [304, 90],
    [306, -12],
    [298, -120],
    [290, -190],
    [298, -330],
    [314, -470],
    [324, -560],
    [330, -680],
    [332, -780],
    [332, -1060],
    [346, -1150],
    [380, -1240],
  ]),
  road('hwy111', '111 号公路', 'highway', [
    [380, -1240],
    [430, -1320],
    // 原来画到 [500, −1480]（山口外，山脚的地面比路高，整段路埋在地下）：停在平地的北沿，平切（不画圆头）
    [470, -1400],
  ]),
  // 市中心的另一条单行道（真实的棕榈泉：棕榈谷往南、印第安峡谷往北）
  road('indian_canyon', '印第安峡谷路', 'road', [
    // 从棕榈谷大道的中线分出去（原来 [324, −700] 在大道西沿外，路口那块圆伸出大道 4 米）
    [330, -700],
    [372, -730],
    [412, -780],
    [414, -1080],
    [396, -1160],
    [380, -1240],
  ]),
  // 东西向
  road('tahquitz', '塔奎兹峡谷路', 'avenue', [
    // 西头停在美术馆东墙外 1 米（原来 [266, −906] 的路头圆伸进美术馆 5 米）
    [272, -906],
    [332, -904],
    [414, -902],
    [560, -904],
    [820, -896],
    [1000, -892],
    [1300, -882],
  ]),
  road('ramon', '拉蒙路', 'road', [
    [330, -650],
    [520, -648],
    [760, -640],
    [1000, -636],
    // 东头停在平地边上（原来画到 x 1600，出了平地 40 米埋进东边的山脚）
    [1556, -630],
  ]),
  road('e_palm_canyon', '东棕榈谷大道', 'avenue', [
    [290, -190],
    [380, -200],
    [520, -186],
    [700, -150],
    [880, -118],
    [1100, -84],
    // 东头停在平地边上（原来画到 x 1600，埋进东边的山脚）
    [1556, -44],
  ]),
  road('sunrise', '日出大道', 'road', [
    [1000, -1300],
    [1000, -892],
    [1000, -636],
    [1004, -480],
    [1008, -340],
    [1006, -200],
    // 停在东棕榈谷大道的中线（原来 [1004, −90] 冲过大道 9 米，南边多出一截路头）
    [1004, -99],
  ]),
  road('alejo', '阿莱霍路', 'street', [
    [332, -1000],
    [414, -1000],
    [520, -1004],
    [640, -1010],
  ]),
  // 弯弯的小区路（不是方格；有尽头的环和死胡同）
  road('las_palmas', '拉斯帕尔马斯路', 'street', [
    [332, -1100],
    [290, -1112],
    [248, -1140],
    [230, -1190],
    [262, -1226],
    [310, -1214],
    [346, -1150],
  ]),
  road('las_palmas_spur', '贝利诺路', 'lane', [
    [248, -1140],
    [214, -1104],
    [196, -1060],
  ]),
  road('movie_colony', '电影人街区', 'street', [
    [414, -1040],
    [470, -1060],
    [540, -1100],
    [600, -1080],
    [612, -1030],
    // 接到阿莱霍路中线（原来 [560, −1004] 冲过去 2 米，路头伸出阿莱霍路北沿）
    [564, -1006],
  ]),
  road('deepwell', '深井路', 'street', [
    [520, -186],
    [540, -260],
    [600, -300],
    [690, -296],
    [720, -250],
    [700, -150],
  ]),
  road('deepwell_cul', '深井路尽头', 'lane', [
    [600, -300],
    [612, -350],
    [640, -372],
  ]),
  road('twin_palms', '双棕榈路', 'street', [
    [304, 60],
    [380, 40],
    [450, 70],
    [520, 40],
    [560, -40],
    [520, -186],
  ]),
  road('twin_palms_loop', '双棕榈小环', 'lane', [
    [450, 70],
    [470, 130],
    [420, 150],
    [384, 120],
    [380, 40],
  ]),
  // 绕到操场西边、停在操场和教学楼之间（原来穿过跑道西头、贴着教学楼南面走）
  road('school_lane', '学校车道', 'street', [
    [760, -640],
    [728, -671],
    [728, -750],
    [756, -754],
  ]),
  road('park_lane', '公园路', 'street', [
    [1004, -480],
    [1060, -486],
    [1120, -520],
  ]),
  // 五金大超市的停车场：从印第安峡谷路往东进来，走停车场北边那条通道，到东头拐北去卸货台（缩完的世界坐标，见 SITES）
  road('hardware_lot', '五金大超市停车场', 'lane', [SI(330.5, -557.25), SI(428, -557.25), SI(428, -590)]),
  // 沙漠银行的 drive-up（2026-11-18）：棕榈谷大道进来，沿停车排北边往东，拐角斜切（直角会压掉 indian_canyon_17），贴着东墙的取款窗往北接塔奎兹路
  road('bank_drive', '沙漠银行 drive-up', 'lane', [SI(274.4, -583.5), SI(301, -583.5), SI(304, -586.5), SI(304, -628)]),
  // 加油站：从公路拐进去，停在店西墙外的前场（原来 [470, −1300] 正好是店的西墙，路头的圆伸进墙里 2.5 米）
  road('gas_spur', '加油站', 'lane', [
    [430, -1320],
    [466, -1302],
  ]),
  road('hotel_lane', '酒店地块', 'lane', [
    [190, 4],
    [160, 24],
    [128, 40],
  ]),
  // 山脚的梅萨小区（棕榈谷大道西边，贴着山，路顺着山脚拐）
  road('mesa', '梅萨路', 'street', [
    [298, -330],
    [250, -340],
    [214, -310],
    [190, -260],
    [214, -220],
    [262, -230],
  ]),
  road('mesa_cul', '梅萨尽头', 'lane', [
    [214, -310],
    [170, -380],
    [150, -420],
  ]),
  // 球拍俱乐部老街区（市中心东北；真实的棕榈泉网球史）
  road('racquet', '球拍俱乐部路', 'street', [
    [414, -1080],
    [470, -1150],
    [560, -1180],
    [640, -1160],
    [700, -1210],
    [780, -1200],
  ]),
  road('racquet_loop', '球拍俱乐部小环', 'lane', [
    [560, -1180],
    [580, -1240],
    [640, -1250],
    [640, -1160],
  ]),
  // 日出大道东边的小区（拉蒙路和塔奎兹路之间）
  road('sunrise_park_east', '向日葵小区', 'street', [
    [1000, -800],
    [1070, -820],
    [1150, -780],
    [1240, -800],
    [1280, -730],
    [1220, -680],
    [1120, -700],
    [1060, -660],
    [1000, -636],
  ]),
  road('sunrise_cul', '向日葵尽头', 'lane', [
    [1150, -780],
    [1160, -850],
    [1200, -870],
  ]),
  // 机场
  road('airport', '机场路', 'road', [
    [1300, -880],
    [1330, -830],
    [1370, -826],
  ]),
  // 南边高尔夫的路
  road('canyon_golf', '峡谷高尔夫路', 'street', [
    [560, -40],
    [620, 40],
    [700, 70],
    [800, 60],
  ]),
  // 土路 / 步道
  road('museum_trail', '美术馆步道', 'trail', [
    [232, -934],
    [190, -950],
    [150, -940],
    [120, -968],
    [80, -950],
    [60, -980],
    [30, -992],
  ]),
  road('tahquitz_trail', '塔奎兹峡谷步道', 'trail', [
    [200, -560],
    [128, -598],
    [90, -604],
    [50, -606],
    [24, -610],
  ]),
  road('wash_trail', '河床步道', 'trail', [
    [200, -560],
    [330, -530],
    [480, -470],
    [650, -410],
    [850, -352],
    [1008, -330],
    [1200, -316],
  ]),
  road('indian_trail', '印第安峡谷步道', 'trail', [
    [298, 200],
    [296, 240],
    [300, 284],
  ]),
  road('spur_trail', '山嘴小路', 'trail', [
    [140, -20],
    [160, -50],
    [178, -72],
    [180, -100],
    [160, -132],
    [130, -170],
    [122, -210],
    [160, -240],
    [230, -250],
  ]),
];

// ── 地形：干河床（塔奎兹溪） ──────────────────────────────────────────
/** 河床中线和每个点的半宽（米）。平时干的，暴雨后有水（以后接 daylight 的天气） */
export const WASH: { pts: V2[]; half: number[] } = {
  pts: [
    [130, -604],
    [210, -580],
    [330, -548],
    [460, -500],
    [620, -440],
    [800, -390],
    [1000, -350],
    [1200, -330],
    [1400, -320],
    [1560, -312],
  ],
  half: [8, 16, 22, 28, 34, 30, 36, 40, 38, 40],
};
/** 过河的桥（路和河床的交点附近，沿路方向） */
export const BRIDGES: { road: string; x: number; z: number }[] = [
  { road: 'palm_canyon', x: 327, z: -550 },
  { road: 'sunrise', x: 1007, z: -350 },
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
}
const b = (id: string, kind: BldgKind, x: number, z: number, w: number, d: number, h: number, name?: string, rot = 0) =>
  ({ id, kind, x, z, w, d, h, name, rot }) satisfies Bldg;

/** 有名字的楼（办事、找人的地方）；小区的房子在 houses() 里按路撒 */
export const BUILDINGS: Bldg[] = [
  // 市中心：棕榈谷大道两边（x 332），塔奎兹路口北
  // 超市：2026-11-16 和五金店对调（五金店长成市中心东南边上的大超市，见下），占原来五金店那块
  b('market', 'shop', 306, -830, 22, 18, 5, '超市'),
  b('bank', 'civic', 358, -860, 20, 24, 8, '沙漠银行'),
  // ── 三家办事的楼（2026-11-16 美术关卡 1，docs/lab/2026-11-07-3d-pixel/valley-town.md）：按缩完的画面摆，写最终坐标（SI）──
  // 入口一律朝南（朝镜头：yaw 0、俯 45° 下只有朝南的立面看得见），门前留一块院子（SITES），旗子立在门口。
  // kind 只管白模的墙和屋顶材质（office = 灰泥墙 + 平顶、没有自动的遮阳篷），门面、招牌都在 detail/town.ts 按资产清单摆。
  // 报社：棕榈谷大道 × 塔奎兹路西北角（市中心最显眼的路口），门脸（两层办公 + 拱廊 + 角塔）朝塔奎兹路，后面是锯齿顶的印刷车间
  b('paper', 'office', ...SI(249, -659), 24, 16, 8, '沙漠太阳报'),
  b('paper_press', 'office', ...SI(249, -676), 22, 20, 6),
  b('cafe', 'shop', 358, -940, 14, 14, 4, '咖啡馆'),
  // 体育用品店：棕榈谷大道西边、报社北面；门前院子里一块试拍的小场 + 对墙
  b('sports', 'office', ...SI(252, -724), 22, 18, 5.5, '体育用品店'),
  // 南墙离阿莱霍路边原来只有 1.5 米（人行道铺到楼底下）：浅 4 米、往北挪 2 米 → 留 5.5 米
  b('theater', 'civic', 360, -1022, 22, 26, 10, '广场剧院'),
  // 餐馆（2026-11-18 第二批，sites/diner.ts）：Googie 咖啡店，门朝南（门 x 318.6、南墙 z −556），门前一小块停车场（SITES diner_lot）。
  // 这一行只是底座（h 0.2 + 屋顶板 = 地坪）：墙、整面玻璃、斜屋顶、卡座和吧台都在 sites/diner.ts，跟着缩放框（townscale FRAMES 'diner'）走。
  // office：不要 build.ts 自动挂在朝路那面（东）的遮阳篷
  b('diner', 'office', ...SI(313.115, -561.24), 16.13, 10.48, 0.2, '餐馆'),
  // 五金大超市：印第安峡谷路东边、塔奎兹路的铺面背后（原来超市和它的停车场那块，往南长到市中心的南沿）；
  // 东头一个园艺棚院子、再往东是卸货台，南边一大片停车场（SITES 的 hardware_*）
  b('hardware', 'office', ...SI(376, -586), 48, 28, 8, '五金大超市'),
  // 市政厅（2026-11-18 第二批办事楼，sites/cityhall.ts）：中世纪现代的一层平顶长楼（office = 平顶），门朝南对塔奎兹路的尽头；
  // 深 28 → 18（中心不动，南墙从 −644 退到 −649）：门前留出一块前庭（公告栏、排队、听证会台阶、钟塔）；高 9 → 7.5（一层高的长楼，缩完 4.65）
  b('cityhall', 'office', 560, -940, 40, 18, 7.5, '市政厅（钟楼）'),
  b('museum', 'museum', 244, -900, 40, 34, 9, '美术馆'),
  b('hotel_old', 'hotel', 440, -960, 34, 30, 12, '老酒店'),
  // 学校、公园
  // 高中（2026-11-18 青训选拔，detail/east.ts 的 school()）：写缩完的世界坐标（SI）。两栋都以南墙为轴缩（最近的路在南边），
  // 教学楼缩完 580…624 × −563…−538（南面 = 前门广场），体育馆 657…679 × −517…−498.5（南面 = 选拔日、排名榜，对着校队球场）
  b('school_main', 'school', ...SI(602, -558), 70, 40, 9, '棕榈泉高中'),
  b('school_gym', 'school', ...SI(668, -513.5), 36, 30, 10, '体育馆'),
  b('swim_center', 'civic', 1150, -560, 30, 20, 6, '游泳中心'),
  // 公路
  b('gas', 'gas', 480, -1300, 20, 14, 5, '加油站'),
  b('wind_office', 'office', 520, -1340, 26, 18, 6, '风电公司'),
  // 南边
  // 峡谷口整体缩小以后只剩 20～45 米宽：收费亭、贸易站挪进口子里（原 (288, 214)、(318, 236) 缩完压出了山脚）
  b('toll', 'misc', 284.3, 228.6, 8, 6, 4, '印第安峡谷收费亭'),
  b('trading', 'shop', 316.4, 228.6, 16, 12, 5, '贸易站'),
  b('motel', 'hotel', 340, -320, 40, 18, 6, '路边汽车旅馆'),
  // 东谷
  b('terminal', 'civic', 1370, -800, 60, 24, 8, '机场航站楼'),
  b('racquet_club', 'misc', 610, -1214, 30, 20, 5, '老球拍俱乐部（废弃）'),
];

/**
 * 三家办事的楼的院子（门前、停车场、货场、园艺棚……；缩完的世界坐标，文件末尾不再缩）：
 * houses() 撒的铺面不压进来；detail/town.ts 在里面摆这家的东西（占地 claim：街边家具、build.ts 的灌木和棕榈不进来）。
 */
export interface Site extends Rect {
  id: string;
  /** 归哪栋楼（BUILDINGS 的 id） */
  of: string;
}
export const SITES: Site[] = [
  // 报社门前：拱廊 + 门前一条铺地，接塔奎兹路北边的人行道（人行道 z −644.6 起归 town.ts 的街）
  { id: 'paper_front', of: 'paper', x0: 233.5, x1: 263.4, z0: -651, z1: -644.6 },
  // 报社西边的货场：印刷车间的卸货门、送报车、新闻纸卷
  { id: 'paper_yard', of: 'paper', x0: 222, x1: 236.5, z0: -688, z1: -662 },
  // 体育用品店门前的院子：门廊 + 试拍小场 + 对墙
  { id: 'sports_yard', of: 'sports', x0: 240, x1: 263.4, z0: -714.8, z1: -687 },
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
// 整体缩小以后南边的山脚往北收到 z ≈ 80～100（FLOOR 的 [150,112] → (147,78)）：地块南沿 104 → 84，客房翼往北挪
export const HOTEL_PLOT: Rect = { x0: 112, x1: 236, z0: 18, z1: 84 };
export const HOTEL_BLDGS: Bldg[] = [
  b('hotel_main', 'hotel', 196, 52, 52, 22, 16, '俱乐部酒店'),
  b('hotel_wing', 'hotel', 150, 56, 22, 30, 10, '酒店客房'),
];

// ── 山谷里的事（四种跑图的理由：办事、找人、活动、发现） ─────────────
export type PoiKind = 'errand' | 'person' | 'event' | 'find' | 'view';
export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  x: number;
  z: number;
  /** 一句话：在这儿干什么 */
  note: string;
}
export const POIS: Poi[] = [
  // 办事
  // 三家办事的楼：x z 是正门的门槛（朝南的立面上，缩完的坐标过 SI）；build.ts 把旗子立在它南边 3 米 = 总监办事站的地方
  { id: 'p_hardware', kind: 'errand', name: '五金大超市', ...SIxz(365, -569.5), note: '买喷头、网柱零件、场地线漆' },
  // 银行：门在南墙正中（townscale FRAMES 'bank' 的轴），旗子在门前人行台上
  { id: 'p_bank', kind: 'errand', name: '银行', ...SIxz(292.6, -589.5), note: '贷款扩场、存当天的营业款' },
  { id: 'p_paper', kind: 'errand', name: '报社', ...SIxz(249, -649), note: '登广告、接受采访' },
  { id: 'p_sports', kind: 'errand', name: '体育用品店', ...SIxz(258, -714.5), note: '订球、穿线、谈寄卖' },
  // 市政厅：门槛 = 正门 (434, −649)（缩完的坐标过 SI），旗子在台阶前
  {
    id: 'p_cityhall',
    kind: 'errand',
    name: '市政厅',
    ...SIxz(434, -649),
    note: '申请办赛许可、扩建审批、夜灯投诉的听证会',
  },
  { id: 'p_gas', kind: 'errand', name: '加油站', x: 480, z: -1300, note: '给车加油（以后）' },
  // 找人
  { id: 'p_coach', kind: 'person', name: '退役教练', x: 262, z: -1226, note: '住在拉斯帕尔马斯，要上门三顾才肯来' },
  // 高中教练：校队三号场（看台那片）的北场门外，拿着夹板；旗子在南边 3 米 = 场门口（缩完的坐标过 SI）
  {
    id: 'p_school_coach',
    kind: 'person',
    name: '高中教练',
    ...SIxz(690.5, -495.5),
    note: '校队教练拿着夹板：问他哪几个孩子值得去俱乐部练',
  },
  // 日出公园的三处（2026-11-18 公园关卡 1；缩完的坐标过 SI，旗子在南边 3 米 = detail/east.ts 的 PARK_SPOTS 里总监站的地方）
  { id: 'p_kid', kind: 'person', name: '天才少年', ...SIxz(825.6, -421.5), note: '每天傍晚在公园公共场对墙打' },
  { id: 'p_sponsor', kind: 'person', name: '风电公司经理', x: 520, z: -1340, note: '赞助的钱和条件' },
  { id: 'p_retiree', kind: 'person', name: '退休明星', x: 600, z: -1080, note: '电影人街区的老会员候选' },
  { id: 'p_ranger', kind: 'person', name: '部落巡护员', x: 284.3, z: 228.6, note: '峡谷步道的事找他' },
  // 餐馆：门槛（南门 x 318.6、门面线 z −556，缩完的坐标过 SI）；旗子在门前 3 米
  {
    id: 'p_diner',
    kind: 'person',
    name: '餐馆',
    ...SIxz(318.6, -556),
    note: '镇上人吃饭聊天：招场地工、教练，听别处的线索',
  },
  // 活动
  // 青训选拔日：一号场的报名桌前（体育馆门口的排名榜正对着）；旗子在南边 3 米 = 桌前（缩完的坐标过 SI）
  {
    id: 'p_school_event',
    kind: 'event',
    name: '青训选拔日',
    ...SIxz(665, -490),
    note: '号码布、锥桶、排队的孩子：挑几个进俱乐部的青训队',
  },
  { id: 'p_park_clinic', kind: 'event', name: '公园公开课', ...SIxz(770, -377), note: '周末免费教学，拉新会员' },
  {
    id: 'p_park_pickup',
    kind: 'event',
    name: '公园野球局',
    ...SIxz(781.1, -396.9),
    note: '公共场上的野球局：挂拍排队、胜者留场，看谁打得好，或者被叫下场',
  },
  { id: 'p_hotel_exh', kind: 'event', name: '老酒店表演赛', x: 440, z: -960, note: '酒店草坪上的表演赛' },
  { id: 'p_sunrise', kind: 'event', name: '日出球会', x: 30, z: -992, note: '山上观景台的日出慢跑 + 早餐' },
  // 发现
  { id: 'p_falls', kind: 'find', name: '塔奎兹瀑布', x: 14, z: -610, note: '峡谷尽头，藏着一块老俱乐部的铭牌' },
  { id: 'p_racket', kind: 'find', name: '河床里的木拍', x: 620, z: -444, note: '暴雨后才冲出来' },
  { id: 'p_oasis', kind: 'find', name: '棕榈绿洲', x: 300, z: 284, note: '印第安峡谷里，野生的扇叶棕榈' },
  { id: 'p_photo', kind: 'find', name: '老照片', x: 196, z: -1060, note: '贝利诺路尽头的老房子里，俱乐部 1960 年开张' },
  {
    id: 'p_racquet',
    kind: 'find',
    name: '废弃的球拍俱乐部',
    x: 610,
    z: -1214,
    note: '1930 年代的老场子，荒着；墙上的老海报',
  },
  {
    id: 'p_spur',
    kind: 'find',
    name: '山嘴尖上的石堆',
    x: 178,
    z: -88,
    note: '俱乐部车道往北绕过山嘴，石堆底下压着一张老比赛的签表',
  },
  // 地标 / 观景
  { id: 'p_lookout', kind: 'view', name: '观景台', x: 30, z: -992, note: '看得见整个山谷' },
  // 远眺风车田：公路边、平地北沿的路肩上（原来在山口外 (560, −1460)，旗子埋在低地里、人也去不了）
  { id: 'p_windmills', kind: 'view', name: '风车田', x: 530, z: -1388, note: '山口外，一路都看得见' },
  // 钟塔：前庭西头的两片立板夹着钟（sites/cityhall.ts），旗子在塔南边
  { id: 'p_clock', kind: 'view', name: '市政厅钟塔', ...SIxz(428, -645.6), note: '市中心的地标' },
];

/** 绿地：高尔夫（棕榈泉到处是）、公园、学校操场、机场跑道（不是绿的，也放这儿） */
export type GreenKind = 'golf' | 'park' | 'field' | 'runway' | 'grove';
export const GREENS: { id: string; name: string; kind: GreenKind; poly: V2[] }[] = [
  {
    id: 'tahquitz_golf',
    name: '塔奎兹溪高尔夫',
    kind: 'golf',
    poly: [
      [1050, -440],
      [1200, -430],
      [1420, -420],
      [1470, -340],
      [1440, -220],
      [1300, -190],
      [1120, -210],
      [1060, -270],
    ],
  },
  {
    id: 'canyon_golf',
    name: '印第安峡谷高尔夫',
    kind: 'golf',
    poly: [
      [600, 70],
      [700, 90],
      [860, 80],
      [980, 120],
      [1000, 200],
      [860, 220],
      [700, 200],
      [610, 160],
    ],
  },
  {
    id: 'sunrise_park',
    name: '日出公园',
    kind: 'park',
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
    poly: [
      [740, -740],
      [840, -740],
      [840, -660],
      [740, -660],
    ],
  },
  {
    // 科切拉谷的椰枣园：一格一格的棕榈，路过的时候一排排闪过去
    id: 'date_grove',
    name: '椰枣园',
    kind: 'grove',
    poly: [
      [770, -1250],
      [960, -1250],
      [960, -950],
      [770, -950],
    ],
  },
  {
    id: 'date_grove_s',
    name: '椰枣园（南）',
    kind: 'grove',
    poly: [
      [1120, -10],
      [1480, 20],
      [1480, 180],
      [1120, 180],
    ],
  },
  {
    id: 'runway',
    name: '机场跑道',
    kind: 'runway',
    poly: [
      [1400, -1240],
      [1440, -1240],
      [1500, -700],
      [1460, -700],
    ],
  },
];

/** 风车（山口外一大片，地图上的远景地标；在 FLOOR 外面，不能去） */
function windmillsRaw(): V2[] {
  // 不等距：一排排斜着往山口外退，每台抖开 ±15 米、缺几台（原来 9×3 的方格，一眼看完）
  const out: V2[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 11; i++) {
      const n = j * 11 + i;
      if (hash('windmill', n) < 0.2) continue;
      const x = 210 + i * 74 + (j % 2) * 37 + (hash('windmill', n + 50) - 0.5) * 30;
      const z = -1488 - j * 62 - i * 3 + (hash('windmill', n + 100) - 0.5) * 30;
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
const DOWNTOWN: Rect = (() => {
  // 原尺寸写的市中心范围，按 S 压（见文件末尾）
  const [x0, z0] = S(280, -1095);
  const [x1, z1] = S(720, -785);
  return { x0, x1, z0, z1 };
})();
// 间距按整体缩放收了（原来 17～28 米，路短了三成，房子少了一半）
const HOUSE_ROADS: Strew[] = [
  // 市中心的铺面：一间挨一间
  { road: 'palm_canyon', gap: 13, setback: 15, kind: 'shop', within: DOWNTOWN },
  { road: 'indian_canyon', gap: 13, setback: 13, kind: 'shop', within: DOWNTOWN },
  { road: 'tahquitz', gap: 15, setback: 16, kind: 'shop', within: DOWNTOWN },
  { road: 'alejo', gap: 15, setback: 14, kind: 'shop', within: DOWNTOWN },
  // 小区
  { road: 'las_palmas', gap: 15, setback: 16 },
  { road: 'las_palmas_spur', gap: 15, setback: 14 },
  { road: 'movie_colony', gap: 16, setback: 18 },
  { road: 'deepwell', gap: 15, setback: 16 },
  { road: 'deepwell_cul', gap: 15, setback: 14 },
  { road: 'twin_palms', gap: 15, setback: 16 },
  { road: 'twin_palms_loop', gap: 15, setback: 14 },
  { road: 'mesa', gap: 15, setback: 16 },
  { road: 'mesa_cul', gap: 15, setback: 14 },
  { road: 'racquet', gap: 16, setback: 17 },
  { road: 'racquet_loop', gap: 15, setback: 14 },
  { road: 'sunrise_park_east', gap: 15, setback: 16 },
  { road: 'sunrise_cul', gap: 15, setback: 14 },
  { road: 'canyon_golf', gap: 17, setback: 18 },
];
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
        if (washDist(x, z) < 8) continue;
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
/** 离河床边的距离（< 0 = 在河床里） */
export function washDist(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  const { pts, half } = WASH;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    const h = half[i - 1] + (half[i] - half[i - 1]) * t;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t) - h);
  }
  return best;
}
/** 这一点归哪片区域：按 REGIONS 的顺序取第一个包含它的（区域的多边形可以压在别的上面，前面的优先） */
export const regionAt = (x: number, z: number): Region | null => REGIONS.find((r) => inPoly(r.poly, x, z)) ?? null;

/** 几趟典型的跑图（沿路的折线，平面图上算距离和时间） */
const CLUB_TO_J1: V2[] = [
  [60, 0],
  [118, 0],
  [190, 4],
  [250, -2],
  [306, -12],
];
export const TRIPS: { name: string; pts: V2[] }[] = [
  {
    name: '俱乐部 → 市中心（报社）',
    pts: [
      ...CLUB_TO_J1,
      [298, -120],
      [290, -190],
      [298, -330],
      [314, -470],
      [324, -560],
      [330, -680],
      [332, -780],
      [332, -960],
    ],
  },
  {
    name: '俱乐部 → 日出公园',
    pts: [
      ...CLUB_TO_J1,
      [298, -120],
      [290, -190],
      [380, -200],
      [520, -186],
      [700, -150],
      [880, -118],
      [1004, -100],
      [1006, -200],
      [1008, -340],
      [1004, -480],
      [1060, -486],
    ],
  },
  {
    name: '俱乐部 → 风电公司（111 号公路）',
    pts: [
      ...CLUB_TO_J1,
      [298, -330],
      [324, -560],
      [332, -1060],
      [346, -1150],
      [380, -1240],
      [430, -1320],
      [520, -1340],
    ],
  },
  {
    name: '俱乐部 → 印第安峡谷绿洲',
    pts: [...CLUB_TO_J1, [304, 90], [298, 200], [296, 240], [300, 284]],
  },
];

// ── 整体缩放（2026-11-16 用户："路有一点点太长，适当缩短"，选了整个山谷缩小）─────────────
// 上面的数据照原尺寸写（照真实棕榈泉的相对位置），这里统一把俱乐部以外的位置往俱乐部门口（ANCHOR）压到 SCALE。
// 只压位置（路的折线点、楼的中心、多边形的顶点），不压大小（路宽、楼的长宽高、河床宽照旧）。
// 俱乐部那块（CLUB_BOX，同 terrain.ts）不动；酒店扩张地挨着俱乐部，也不动。
// 别的文件里手写的世界坐标（detail/*.ts、terrain.ts、mountains.ts、build.ts）按原尺寸写的，都要过 S。
const sp = (pts: V2[]) => pts.map(([x, z]) => S(x, z) as V2);
{
  FLOOR.splice(0, FLOOR.length, ...sp(FLOOR));
  for (const r of REGIONS) r.poly = sp(r.poly);
  for (const r of ROADS) r.pts = sp(r.pts);
  WASH.pts = sp(WASH.pts);
  // 河床宽也按 SCALE 缩（原来 0.85：塔奎兹溪高尔夫那段宽到 66 米，占了半个球场）
  WASH.half = WASH.half.map((h) => Math.max(7, h * SCALE));
  for (const br of BRIDGES) [br.x, br.z] = S(br.x, br.z);
  for (const o of BUILDINGS) [o.x, o.z] = S(o.x, o.z);
  for (const p of POIS) [p.x, p.z] = S(p.x, p.z);
  for (const q of GREENS) q.poly = sp(q.poly);
  for (const t of TRIPS) t.pts = sp(t.pts);
  const [vx1, vz0] = S(VIEW.x1, VIEW.z0);
  VIEW.x1 = vx1;
  VIEW.z0 = vz0;
  VIEW.z1 = Math.max(CLUB_BOX_L.z1 + 40, S(0, VIEW.z1)[1]);
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
    const { f, depth } = frontOf(o);
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
export const windmills = (): V2[] => windmillsRaw().map(([x, z]) => S(x, z) as V2);
