// clubbuild：思想实验 —— 如果《网球总监》是开罗式建造经营游戏（网格空地、摆设施、相邻组合加成、小人进出、每天收盘、星级解锁）。
// 不守玩法准则 1（建造托盘就是菜单），只放在 sandbox，不合并进游戏。
//
// 这个文件是各子代理之间的约定：设施表（尺寸、价钱、解锁星级、收益）、组合加成表、网格常数。
// 改这里要同时看 sim.ts（规则）、main.ts（摆放）和 assets/（模型的占地）。
//
// 坐标：网格 (col, row)，col 往 +x（东），row 往 +z（南，朝镜头）。格子边长 TILE 米。
// 地块左上角 (0,0) 的世界坐标是 (-LOT_W*TILE/2, -LOT_D*TILE/2)，地块中心是世界原点。
// 设施朝向 rot ∈ {0,1,2,3}（×90°，绕 +y 逆时针看俯视 = three.js 的 rotation.y = rot·π/2）。rot 1、3 时占地 w、d 对调。
//
// 模型约定（assets/<id>.ts，export function build(ctx: AssetCtx): THREE.Object3D）：
//   本地原点 = 占地矩形中心，y = 0 是地面；rot 0 时宽 w·TILE 沿 x、深 d·TILE 沿 z；+z 是"正面"（入口朝镜头）。
//   模型不要超出占地（顶多 0.2 米的出檐），不画地块的地面（地面由 main 画），自己的场面/铺地要画（球场面、泳池边）。
//   人从"门格" door 进出：占地里相对左上角的格子 (dc, dr)，rot 0 时；main 负责转。

export const TILE = 3; // 米
export const LOT_W = 18; // 格（东西）
export const LOT_D = 26; // 格（南北）

export type Category = 'court' | 'facility' | 'deco' | 'road';

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
  /** 吸引力：每天额外带来的客人数 */
  appeal: number;
  /** 偏好的客群 */
  guests: Guest[];
  /** 门格（rot 0，相对占地左上角） */
  door: [number, number];
  /** 组合加成用的标签 */
  tags: string[];
}

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
    spend: 40,
    cap: 4,
    upkeep: 30,
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
    star: 2,
    spend: 60,
    cap: 4,
    upkeep: 60,
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
    spend: 20,
    cap: 4,
    upkeep: 10,
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
    spend: 10,
    cap: 2,
    upkeep: 5,
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
    star: 1,
    spend: 30,
    cap: 10,
    upkeep: 50,
    appeal: 10,
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
    star: 0,
    spend: 35,
    cap: 3,
    upkeep: 15,
    appeal: 3,
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
    cap: 4,
    upkeep: 8,
    appeal: 3,
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
    upkeep: 12,
    appeal: 4,
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
    star: 3,
    spend: 45,
    cap: 8,
    upkeep: 70,
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
    upkeep: 10,
    appeal: 5,
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
    upkeep: 4,
    appeal: 6,
    guests: [],
    door: [2, 4],
    tags: ['parking'],
  },
  // —— 装饰 ——
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
    upkeep: 1,
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
    upkeep: 6,
    appeal: 5,
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

export const BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/**
 * 组合加成（开罗式）：两种标签的设施"相邻"（占地矩形的切比雪夫距离 ≤ range 格，range 默认 1 = 贴着或隔一格）时生效，
 * 第一次凑成时飘字 + 记进日志；效果是 a 那边的设施 spend 和 appeal 加成。一对设施只算一次。
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
  { id: 'shade-court', name: '场边树荫', a: 'court', b: 'shade', spend: 1.15, appeal: 2 },
  { id: 'cafe-court', name: '打完来一杯', a: 'food', b: 'court', range: 2, spend: 1.3, appeal: 1 },
  { id: 'shop-house', name: '会员专柜', a: 'shop', b: 'house', range: 2, spend: 1.4, appeal: 2 },
  { id: 'stand-clay', name: '红土看台', a: 'stand', b: 'clay', spend: 1.5, appeal: 4 },
  { id: 'palm-pool', name: '棕榈泳池', a: 'pool', b: 'plant', spend: 1.25, appeal: 3 },
  { id: 'wall-court', name: '青训角', a: 'training', b: 'court', spend: 1.2, appeal: 2 },
  { id: 'fountain-house', name: '会所前庭', a: 'house', b: 'water', range: 2, spend: 1.2, appeal: 4 },
  { id: 'food-food', name: '美食街', a: 'food', b: 'food', spend: 1.2, appeal: 2 },
];

/** 星级门槛（开罗式复合清单）：到这几样就升星，升星解锁 BUILDINGS 里 star 等于新星级的设施 */
export interface StarGoal {
  star: number;
  visitors: number; // 累计客人
  buildings: number; // 设施数（不算步道）
  combos: number; // 凑成的组合数
  money: number; // 手上的钱
}

export const STAR_GOALS: StarGoal[] = [
  { star: 1, visitors: 40, buildings: 4, combos: 1, money: 0 },
  { star: 2, visitors: 150, buildings: 9, combos: 3, money: 5000 },
  { star: 3, visitors: 400, buildings: 15, combos: 5, money: 12000 },
];

export const START_MONEY = 10000;
/** 一天多少秒（演出时间，1× 速度） */
export const DAY_SECONDS = 60;
