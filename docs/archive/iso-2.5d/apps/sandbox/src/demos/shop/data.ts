/**
 * 球具店 demo 的数值和文案（第二轮）。演出只读这些；数值逻辑在 game.ts。
 * 一次性原型：中文直接写在这里。
 */

export type GoodId = 'water' | 'balls' | 'energy' | 'sunscreen' | 'hat' | 'grip' | 'racket';
export type CustType = 'retiree' | 'mom' | 'fan' | 'tourist';
export type DayKind = 'sunny' | 'heat' | 'wind' | 'match';

export interface Good {
  n: string;
  /** 量词 */
  u: string;
  cost: number;
  fair: number;
  /** 一箱几件 */
  cs: number;
  drink?: boolean;
}

export const GOODS: Record<GoodId, Good> = {
  water: { n: '矿泉水', u: '瓶', cost: 0.5, fair: 2, cs: 12, drink: true },
  balls: { n: '罐装球', u: '罐', cost: 3, fair: 6, cs: 6 },
  energy: { n: '能量饮料', u: '罐', cost: 1.5, fair: 4, cs: 8, drink: true },
  sunscreen: { n: '防晒霜', u: '支', cost: 4, fair: 10, cs: 5 },
  hat: { n: '遮阳帽', u: '顶', cost: 6, fair: 15, cs: 4 },
  grip: { n: '握把胶', u: '卷', cost: 2, fair: 5, cs: 8 },
  racket: { n: '球拍', u: '把', cost: 60, fair: 140, cs: 1 },
};
export const ORDER: readonly GoodId[] = ['water', 'balls', 'energy', 'sunscreen', 'hat', 'grip', 'racket'];
export const PRO = new Set<GoodId>(['balls', 'grip', 'racket']);

export interface TypeDef {
  n: string;
  tol: number;
  tolPro?: number;
  /** 走路速度（米/秒） */
  sp: number;
  buys: number;
  look: number;
  pref: Record<GoodId, number>;
  rage: readonly string[];
}

export const TYPES: Record<CustType, TypeDef> = {
  retiree: {
    n: '老人',
    tol: 1.15,
    sp: 0.95,
    buys: 1,
    look: 1.5,
    pref: { water: 3, hat: 2, sunscreen: 2, balls: 1, energy: 0.3, grip: 0.5, racket: 0.05 },
    rage: ['抢钱啊!', '黑店!', '想当年一块钱'],
  },
  mom: {
    n: '妈妈',
    tol: 1.45,
    sp: 1.45,
    buys: 3,
    look: 1.0,
    pref: { water: 3, energy: 2.5, sunscreen: 2.2, balls: 2, hat: 1, grip: 0.5, racket: 0.2 },
    rage: ['抢钱啊!', '发家长群!', '$P?疯了'],
  },
  fan: {
    n: '球迷',
    tol: 1.2,
    tolPro: 1.9,
    sp: 1.6,
    buys: 2,
    look: 1.1,
    pref: { balls: 3, grip: 3, racket: 1.4, energy: 2, water: 1, sunscreen: 0.4, hat: 0.3 },
    rage: ['$P?当我傻', '网上才一半', '抢钱啊!'],
  },
  tourist: {
    n: '游客',
    tol: 2.1,
    sp: 1.2,
    buys: 2,
    look: 1.2,
    pref: { hat: 3, sunscreen: 2.5, water: 2, energy: 1, balls: 0.5, racket: 0.3, grip: 0.1 },
    rage: ['比赌城还黑!', '抢钱啊!', '差评!'],
  },
};
export const TYPE_ORDER: readonly CustType[] = ['retiree', 'mom', 'fan', 'tourist'];

export const LINES = {
  wow: ['划算!', '全要了!', '捡到宝!'],
  ok: ['就它了', '不错', '刚好'],
  hes: ['嗯……', '有点贵', '想想'],
  hesYes: ['好吧…', '买了'],
  hesNo: ['算了', '再看看'],
  frown: ['太贵了', '啧', '超市一半价'],
  gouge: ['算你狠', '被宰了…', '下次不来'],
  empty: ['没货?', '空的…'],
  wind: ['风大戴不住'],
  fake: ['根本不限量!', '又是套路!'],
  cold: ['冰的!', '凉快!'],
};

/**
 * 货架格。位置是世界米（店内 8×8，北墙在 z=-4，门在北墙正中偏右 x≈0.33）。
 * 画面是 3/4 俯视（scene.ts）：每米 16 个逻辑像素；x0..x1、z0..z1 是占地，fh 是正面高（逻辑像素）。
 */
export interface SlotDef {
  n: string;
  x: number;
  z: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 正面高（逻辑像素）和顶面深（逻辑像素） */
  fh: number;
  /** 画面高度（米，= 像素 / 12，给飘字、粒子定位） */
  h: number;
  vis: number;
  gold?: boolean;
  cooler?: boolean;
  island?: boolean;
  /** 客人站的位置 */
  sx: number;
  sz: number;
  /** 从中转点到站位要经过的点 */
  via: readonly { x: number; z: number }[];
}

const slot = (o: Omit<SlotDef, 'x' | 'z' | 'h'>): SlotDef => ({
  ...o,
  x: (o.x0 + o.x1) / 2,
  z: (o.z0 + o.z1) / 2,
  h: (o.fh + 5) / 12,
});

export const SLOTS: readonly SlotDef[] = [
  slot({
    n: '门口',
    x0: -2.05,
    x1: -0.45,
    z0: -3.95,
    z1: -3.45,
    fh: 30,
    vis: 1.7,
    gold: true,
    sx: -0.95,
    sz: -2.4,
    via: [],
  }),
  slot({
    n: '门口',
    x0: 1.1,
    x1: 2.6,
    z0: -3.95,
    z1: -3.45,
    fh: 30,
    vis: 1.7,
    gold: true,
    sx: 2.05,
    sz: -2.4,
    via: [],
  }),
  slot({
    n: '中岛',
    x0: -1.3,
    x1: 1.3,
    z0: 0.05,
    z1: 0.6,
    fh: 30,
    vis: 1.0,
    island: true,
    sx: 0.45,
    sz: -0.5,
    via: [],
  }),
  slot({
    n: '冰柜',
    x0: 2.7,
    x1: 3.95,
    z0: -3.95,
    z1: -3.35,
    fh: 40,
    vis: 1.0,
    cooler: true,
    sx: 3.0,
    sz: -2.3,
    via: [],
  }),
  slot({
    n: '里角',
    x0: -3.95,
    x1: -2.45,
    z0: 2.3,
    z1: 2.85,
    fh: 30,
    vis: 0.5,
    sx: -1.9,
    sz: 2.95,
    via: [{ x: -1.9, z: -0.1 }],
  }),
  slot({
    n: '里角',
    x0: 2.45,
    x1: 3.95,
    z0: 2.3,
    z1: 2.85,
    fh: 30,
    vis: 0.5,
    sx: 1.9,
    sz: 2.95,
    via: [{ x: 1.9, z: -0.1 }],
  }),
];

/** 中转点、门口、柜台 */
export const HUB = { x: 0.33, z: -1.5 };
export const DOOR_IN = { x: 0.33, z: -3.5 };
export const DOOR_OUT = { x: 0.33, z: -4.25 };
export const DIRECTOR_AT = { x: -3.05, z: -3.78 };
export const COUNTER = { x0: -3.95, x1: -2.15, z0: -3.6, z1: -3.1 };
/** 来找你的人站在柜台前 */
export const VISIT_AT = { x: -2.5, z: -2.45 };
/** 冰水桶 */
export const ICE_AT = { x: 1.5, z: -1.15 };

export const DAY_SEC = 54;
export const DAYS = 4;
export const START_CASH = 120;

export const DAYNAME: Record<DayKind, string> = { sunny: '晴天', heat: '热浪', wind: '大风', match: '比赛日' };
export const DAYHINT: Record<DayKind, string> = {
  sunny: '中午有旅游大巴路过',
  heat: '下午 40°+，水会被抢',
  wind: '阵风帽子难卖；校队要来',
  match: '11 点、17 点散场人潮',
};

export interface Day {
  t: DayKind;
  hotBase: number;
  hotAmp: number;
  wind: boolean[];
  match: boolean;
  am: Record<GoodId, number>;
  pm: Record<GoodId, number>;
}
