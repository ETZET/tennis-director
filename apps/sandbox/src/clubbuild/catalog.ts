// clubbuild：思想实验 —— 如果《网球总监》是开罗式建造经营游戏（网格空地、摆设施、相邻组合加成、小人进出、每天收盘、星级解锁）。
// 不守玩法准则 1（建造托盘就是菜单），只放在 sandbox，不合并进游戏。
//
// 这个文件是各子代理之间的约定：设施表（尺寸、价钱、解锁星级、收益）、地形表、组合加成表、星级目标、网格常数、经济常数。
// 改这里要同时看 sim.ts（规则）、game.ts（摆放）和 assets/（模型的占地）。
//
// 坐标：网格 (col, row)，col 往 +x（东），row 往 +z（南，朝镜头）。格子边长 TILE 米。
// 地块左上角 (0,0) 的世界坐标是 (-LOT_W*TILE/2, -LOT_D*TILE/2)，地块中心是世界原点。
// 设施朝向 rot ∈ {0,1,2,3}（×90°，绕 +y 逆时针看俯视 = three.js 的 rotation.y = rot·π/2）。rot 1、3 时占地 w、d 对调。
//
// 模型约定（assets/<id>.ts，export function build(ctx: AssetCtx): THREE.Object3D）：
//   本地原点 = 占地矩形中心，y = 0 是地面；rot 0 时宽 w·TILE 沿 x、深 d·TILE 沿 z；+z 是"正面"（入口朝镜头）。
//   模型不要超出占地（顶多 0.2 米的出檐），不画地块的地面（地面由 main 画），自己的场面/铺地要画（球场面、泳池边）。
//   人从"门格" door 进出：占地里相对左上角的格子 (dc, dr)，rot 0 时；main 负责转。
//
// 地块按星级一片一片开放（LOT_ROWS_BY_STAR）：开放的是南边的 lotRows 行（大门在南边），北边先锁着。
// 地形（TERRAIN：绿洲水塘、大石头、老棕榈）是开局就在地上的特殊设施（state.placed 里，cat 'terrain'，不在托盘里），
// 带标签，现成的组合系统直接用；大石头花钱能清掉，别的拆不掉。

export const TILE = 3; // 米
export const LOT_W = 18; // 格（东西）
export const LOT_D = 26; // 格（南北）

/** 托盘的分类（地形不在托盘里，见 DefCategory） */
export type Category = 'court' | 'facility' | 'deco' | 'road';
/** 所有定义的分类：托盘的四类 + 地形 */
export type DefCategory = Category | 'terrain';

/** 客群：开罗式"客人类型"，设施吸引哪些人 */
export type Guest = 'member' | 'junior' | 'family' | 'fan';

export interface BuildingDef {
  id: string;
  /** 托盘上显示的名字（sandbox 调试文字，不走 i18n） */
  name: string;
  cat: Category;
  /** 占地（格），rot 0 时 */
  w: number;
  d: number;
  cost: number;
  /** 第几星解锁（0 = 开局就有） */
  star: number;
  /** 每位客人在这里花的钱（0 = 不收钱的装饰/步道） */
  spend: number;
  /** 同时能接几位客人 */
  cap: number;
  /** 每天维护费 */
  upkeep: number;
  /**
   * 吸引力：每天额外带来的客人数。
   * 装饰（deco）和地形的吸引力是"光环"：自己不带客，给 2 格内能接客的设施加（每座最多 +AURA_CAP）。
   */
  appeal: number;
  /** 偏好的客群 */
  guests: Guest[];
  /** 门格（rot 0，相对占地左上角） */
  door: [number, number];
  /** 组合加成用的标签 */
  tags: string[];
  /** false = 不能从托盘建（地形）；不写 = 能建 */
  buildable?: false;
}

/** 地形：开局就在地上，玩家建不了（cat 'terrain'、buildable false、cost 0） */
export interface TerrainDef extends Omit<BuildingDef, 'cat'> {
  cat: 'terrain';
  buildable: false;
  /** 清掉要花多少钱（不写 = 拆不掉） */
  clearCost?: number;
}

export type AnyDef = BuildingDef | TerrainDef;

/** 托盘里能建的（顺序 = 托盘顺序） */
export const BUILDINGS: BuildingDef[] = [
  // —— 球场 ——
  {
    id: 'court-hard',
    name: '硬地球场',
    cat: 'court',
    w: 6,
    d: 12,
    cost: 3000,
    star: 0,
    spend: 50,
    cap: 4,
    upkeep: 70,
    appeal: 6,
    guests: ['member', 'junior'],
    door: [3, 11],
    tags: ['court'],
  },
  {
    id: 'court-clay',
    name: '红土球场',
    cat: 'court',
    w: 6,
    d: 12,
    cost: 4500,
    star: 3,
    spend: 70,
    cap: 4,
    upkeep: 140,
    appeal: 9,
    guests: ['member', 'fan'],
    door: [3, 11],
    tags: ['court', 'clay'],
  },
  {
    id: 'pickle',
    name: '匹克球场',
    cat: 'court',
    w: 3,
    d: 7,
    cost: 1200,
    star: 1,
    spend: 25,
    cap: 4,
    upkeep: 25,
    appeal: 4,
    guests: ['family', 'member'],
    door: [1, 6],
    tags: ['court', 'pickle'],
  },
  {
    id: 'practice-wall',
    name: '练习墙',
    cat: 'court',
    w: 4,
    d: 3,
    cost: 600,
    star: 0,
    spend: 12,
    cap: 2,
    upkeep: 8,
    appeal: 2,
    guests: ['junior'],
    door: [2, 2],
    tags: ['court', 'training'],
  },
  // —— 设施 ——
  {
    id: 'clubhouse',
    name: '会所',
    cat: 'facility',
    w: 5,
    d: 4,
    cost: 5000,
    star: 2,
    spend: 35,
    cap: 8,
    upkeep: 120,
    appeal: 6,
    guests: ['member', 'family', 'fan', 'junior'],
    door: [2, 3],
    tags: ['house'],
  },
  {
    id: 'pro-shop',
    name: '球具店',
    cat: 'facility',
    w: 2,
    d: 2,
    cost: 1500,
    star: 1,
    spend: 35,
    cap: 3,
    upkeep: 30,
    appeal: 1,
    guests: ['member', 'junior'],
    door: [1, 1],
    tags: ['shop'],
  },
  {
    id: 'cafe',
    name: '咖啡车',
    cat: 'facility',
    w: 2,
    d: 2,
    cost: 900,
    star: 0,
    spend: 15,
    cap: 3,
    upkeep: 20,
    appeal: 1,
    guests: ['family', 'fan', 'member'],
    door: [1, 1],
    tags: ['food'],
  },
  {
    id: 'taco',
    name: '塔可餐车',
    cat: 'facility',
    w: 2,
    d: 3,
    cost: 1400,
    star: 2,
    spend: 22,
    cap: 5,
    upkeep: 30,
    appeal: 1,
    guests: ['family', 'fan'],
    door: [1, 2],
    tags: ['food'],
  },
  {
    id: 'pool',
    name: '泳池',
    cat: 'facility',
    w: 5,
    d: 7,
    cost: 6000,
    star: 4,
    spend: 45,
    cap: 8,
    upkeep: 180,
    appeal: 12,
    guests: ['family', 'member'],
    door: [2, 6],
    tags: ['pool'],
  },
  {
    id: 'bleachers',
    name: '看台',
    cat: 'facility',
    w: 2,
    d: 6,
    cost: 2000,
    star: 2,
    spend: 12,
    cap: 12,
    upkeep: 25,
    appeal: 3,
    guests: ['fan'],
    door: [1, 5],
    tags: ['stand'],
  },
  {
    id: 'parking',
    name: '停车场',
    cat: 'facility',
    w: 4,
    d: 5,
    cost: 800,
    star: 1,
    spend: 0,
    cap: 0,
    upkeep: 10,
    // 停车场不自己带客：每个让当天客人 ×(1+PARKING_MUL)，最多 PARKING_MAX 个（放大已有的吸引力）
    appeal: 0,
    guests: [],
    door: [2, 4],
    tags: ['parking'],
  },
  // —— 装饰（光环：给 2 格内能接客的设施加吸引力）——
  {
    id: 'shade',
    name: '遮阳休息区',
    cat: 'deco',
    w: 2,
    d: 2,
    cost: 300,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 2,
    appeal: 1,
    guests: [],
    door: [1, 1],
    tags: ['shade', 'deco'],
  },
  {
    id: 'palm',
    name: '棕榈树',
    cat: 'deco',
    w: 1,
    d: 1,
    cost: 120,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 1,
    guests: [],
    door: [0, 0],
    tags: ['plant', 'deco'],
  },
  {
    id: 'cactus-bed',
    name: '仙人掌花坛',
    cat: 'deco',
    w: 2,
    d: 1,
    cost: 150,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 1,
    guests: [],
    door: [0, 0],
    tags: ['plant', 'deco'],
  },
  {
    id: 'fountain',
    name: '喷泉',
    cat: 'deco',
    w: 3,
    d: 3,
    cost: 1800,
    star: 3,
    spend: 0,
    cap: 0,
    upkeep: 10,
    appeal: 3,
    guests: [],
    door: [1, 2],
    tags: ['water', 'deco'],
  },
  // —— 步道（1×1，可以连刷）——
  {
    id: 'path',
    name: '步道',
    cat: 'road',
    w: 1,
    d: 1,
    cost: 20,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 0,
    guests: [],
    door: [0, 0],
    tags: ['path'],
  },
];

/** 地形（开局按 seed 选一套摆好，见 sim.ts TERRAIN_VARIANTS）。吸引力也是光环 */
export const TERRAIN: TerrainDef[] = [
  {
    id: 'oasis',
    name: '绿洲水塘',
    cat: 'terrain',
    buildable: false,
    w: 3,
    d: 3,
    cost: 0,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 2,
    guests: [],
    door: [1, 2],
    tags: ['water', 'oasis'],
  },
  {
    id: 'boulder',
    name: '大石头',
    cat: 'terrain',
    buildable: false,
    clearCost: 400,
    w: 2,
    d: 2,
    cost: 0,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 0,
    guests: [],
    door: [1, 1],
    tags: ['rock'],
  },
  {
    id: 'old-palm',
    name: '老棕榈',
    cat: 'terrain',
    buildable: false,
    w: 1,
    d: 1,
    cost: 0,
    star: 0,
    spend: 0,
    cap: 0,
    upkeep: 0,
    appeal: 1,
    guests: [],
    door: [0, 0],
    // 带 shade：挨着的球场直接成"场边树荫"
    tags: ['plant', 'shade'],
  },
];

/** 所有定义（托盘的 + 地形），类型老实 */
export const DEFS: Record<string, AnyDef> = Object.fromEntries([...BUILDINGS, ...TERRAIN].map((b) => [b.id, b]));
/**
 * 兼容旧代码：同一张表（也含地形），类型按 BuildingDef 读。地形的 cat 实际是 'terrain'，
 * 新代码用 DEFS（AnyDef）或 isTerrain(id) 判断。
 */
export const BY_ID = DEFS as Record<string, BuildingDef>;
export const isTerrain = (id: string): boolean => DEFS[id]?.cat === 'terrain';

/**
 * 组合加成（开罗式）：两种标签的设施"相邻"（占地矩形的切比雪夫距离 ≤ range 格，range 默认 1 = 贴着或隔一格）时生效，
 * 第一次凑成时飘字 + 记进日志；效果是 a 那边的设施 spend 和 appeal 加成。一对设施只算一次。
 * 没发现过的组合在摆放预览里显示"？？？"，建好那一刻揭晓。
 */
export interface Combo {
  id: string;
  name: string;
  a: string;
  b: string;
  range?: number;
  /** a 的 spend 乘数 */
  spend: number;
  /** a 的 appeal 加数 */
  appeal: number;
}

export const COMBOS: Combo[] = [
  // ★0 就凑得出来的
  { id: 'shade-court', name: '场边树荫', a: 'court', b: 'shade', spend: 1.15, appeal: 2 },
  { id: 'cafe-court', name: '打完来一杯', a: 'food', b: 'court', range: 2, spend: 1.3, appeal: 1 },
  { id: 'wall-court', name: '青训角', a: 'training', b: 'court', spend: 1.2, appeal: 2 },
  { id: 'court-court', name: '连片场地', a: 'court', b: 'court', spend: 1.1, appeal: 2 },
  { id: 'food-food', name: '美食街', a: 'food', b: 'food', spend: 1.2, appeal: 2 },
  { id: 'shade-food', name: '凉棚茶座', a: 'food', b: 'shade', spend: 1.15, appeal: 1 },
  { id: 'oasis-court', name: '绿洲', a: 'court', b: 'oasis', range: 1, spend: 1.25, appeal: 3 },
  // ★1
  { id: 'pickle-food', name: '匹克野餐', a: 'pickle', b: 'food', range: 2, spend: 1.25, appeal: 2 },
  // ★2
  { id: 'shop-house', name: '会员专柜', a: 'shop', b: 'house', range: 2, spend: 1.4, appeal: 2 },
  { id: 'stand-court', name: '场边看台', a: 'stand', b: 'court', spend: 1.2, appeal: 2 },
  { id: 'house-court', name: '会所景观位', a: 'house', b: 'court', range: 2, spend: 1.1, appeal: 2 },
  { id: 'parking-house', name: '代客泊车', a: 'house', b: 'parking', range: 2, spend: 1.15, appeal: 1 },
  // 水：喷泉（★3）或者绿洲水塘
  { id: 'fountain-house', name: '会所前庭', a: 'house', b: 'water', range: 2, spend: 1.2, appeal: 4 },
  // ★3
  { id: 'stand-clay', name: '红土看台', a: 'stand', b: 'clay', spend: 1.5, appeal: 4 },
  // ★4
  { id: 'palm-pool', name: '棕榈泳池', a: 'pool', b: 'plant', spend: 1.25, appeal: 3 },
];

/**
 * 星级门槛（开罗式复合清单）：到这几样就升星，升星解锁 BUILDINGS 里 star 等于新星级的设施、地块往北扩（LOT_ROWS_BY_STAR）。
 * 清单里没有"放着不动也会满足"的项：组合数 = 现在场上成立的组合种类（拆掉就掉），设施不算装饰，钱看"单日最好净收入"。
 */
export interface StarGoal {
  star: number;
  /** 累计客人 */
  visitors: number;
  /** 设施数（不算步道、装饰、地形） */
  buildings: number;
  /** 场上成立的组合种类 */
  combos: number;
  /** 单日净收入（历史最好的一天，state.bestNet） */
  net: number;
  /** 会员 */
  members: number;
}

export const STAR_GOALS: StarGoal[] = [
  { star: 1, visitors: 30, buildings: 3, combos: 1, net: 0, members: 0 },
  { star: 2, visitors: 100, buildings: 6, combos: 3, net: 800, members: 6 },
  { star: 3, visitors: 250, buildings: 8, combos: 5, net: 1700, members: 16 },
  { star: 4, visitors: 500, buildings: 11, combos: 7, net: 2800, members: 30 },
  { star: 5, visitors: 1000, buildings: 14, combos: 9, net: 4200, members: 60 },
];

/** 地块开放几行（南边起），下标 = 当前星级（超出用最后一项）。★2 开 4 行（刚好放会所、横放的匹克），★3 开 6 行（刚好横放一片红土） */
export const LOT_ROWS_BY_STAR = [16, 16, 20, 26, 26, 26];

/** 设施等级（下标 = 等级 − 1）：接够 LV_AT 位客人才能升到这一级；升级花 建造价 × LV_COST；收费 × LV_MUL */
export const LV_AT = [0, 60, 150];
export const LV_COST = [0, 0.6, 1.2];
export const LV_MUL = [1, 1.2, 1.45];
export const MAX_LV = 3;
/** 每升一级：容量 +LV_CAP、吸引力 +LV_APPEAL */
export const LV_CAP = 1;
export const LV_APPEAL = 2;

/** 一周（day 1 = 周一）：客群倍数，周三青训日、周末家庭日、周日俱乐部赛 */
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
export const WEEK_MIX: Partial<Record<Guest, number>>[] = [
  {},
  {},
  { junior: 2 },
  {},
  {},
  { family: 1.5 },
  { family: 1.5, fan: 2 },
];
export const WEEK_TAG: (string | null)[] = [null, null, '青训日', null, null, '家庭日', '俱乐部赛'];

export const START_MONEY = 4000;
/** 一天多少秒（演出时间，1× 速度） */
export const DAY_SECONDS = 60;
