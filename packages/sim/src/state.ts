import type { OptionKey } from '@td/content';

/**
 * 游戏状态：一个可以直接 JSON.stringify 的普通对象，按 id 归一化。
 * 不放类实例、函数或 three.js 对象；存档就是把它写下来。
 */

/** 存档格式版本；改了格式就加一个迁移函数（见 save.ts） */
export const SAVE_VERSION = 7;

export interface PersonState {
  id: string;
  hired: boolean;
  /** 站在哪个锚点；走在路上时是走之前的锚点（walk 不为 null） */
  at: string;
  /** 教学能力 */
  skill: number;
  /** 维护能力 */
  upkeep: number;
  /** 服务能力 */
  service: number;
  /** 球技（球员训练和比赛用；docs/design/people.md） */
  play: number;
  morale: number;
  fatigue: number;
  /** 指派到哪个岗位或工单（id）；null = 闲着 */
  job: string | null;
  /** 走在路上：经过的锚点（含终点）、出发和到达时间 */
  walk: Walk | null;
  /** 被事件叫去办事：到了以后待 minutes 分钟（until 在到达时才定下来） */
  errand: { at: string; minutes: number; until: number | null } | null;
  /**
   * 习惯（ADR 0014）：玩家把这个人放上过的岗位（最多 ROUTINE_MAX 个，时段不重叠，"随时"的岗位最多一个）。
   * 手上的岗位过了时段、工单做完、或者闲着时，自己走去其中此刻开着、空着的那个。
   */
  routine: string[];
  /** 为了上班暂停的工单（ADR 0014）：下了班回去接着干；玩家亲手派活或叫停时清掉 */
  resume?: string | null;
}

export interface Walk {
  from: string;
  to: string;
  route: string[];
  start: number;
  end: number;
}

/** 持续岗位这一圈转了多少分钟 */
export interface PostState {
  progress: number;
}

/** 一次性工单：做了多少工作量（能力 50 的人一分钟做 1）、开工没有（开工时扣材料费） */
export interface OrderState {
  progress: number;
  started: boolean;
}

/** 因果日志里的一条：什么原因、产生了哪些效果、由哪一条引出 */
export interface CausalEntry {
  id: number;
  t: number;
  cause: Cause;
  /** 引出这条的上一条（例如安排了这张卡的那次选择） */
  parent: number | null;
  effects: EffectRecord[];
}

export type Cause =
  | { kind: 'start' }
  | { kind: 'option'; card: string; option: OptionKey; success?: boolean }
  | { kind: 'default'; card: string; option: OptionKey | null; success?: boolean }
  | { kind: 'activity'; activity: string }
  | { kind: 'day'; day: number }
  /** 周日收盘的周结算：服务率、缺人最多的岗位、这一周的钱，以及声望、会员、质量为什么这样变 */
  | ({ kind: 'week' } & WeekSettlement)
  | { kind: 'post'; post: string; person: string; cycles: number }
  | { kind: 'order'; order: string; people: string[]; success?: boolean }
  | { kind: 'debug'; what: string };

/** 一周的钱（每天收盘按天折算记进现金，周日收盘合成一条讲给玩家） */
export interface WeekMoney {
  dues: number;
  income: number;
  upkeep: number;
  wages: number;
}

export interface WeekState {
  /** 有需求的岗位分钟，和其中有人在岗的分钟 */
  demand: number;
  served: number;
  /** 上周的服务率和上周的需求分钟（上周没有需求时服务率无从谈起） */
  last: number;
  lastDemand: number;
  /** 每个有需求的岗位这周没人的分钟（周结算讲"缺人最多的岗位"） */
  missed: Record<string, number>;
  money: WeekMoney;
  /** 在职人员特质带来的声望（每天收盘记进声望，周日一起讲） */
  traitRep: number;
  /** 这一周开始时的质量 */
  q0: number;
}

export interface WeekSettlement {
  week: number;
  demand: number;
  served: number;
  /** 声望服务项的及格线（服务率高于它声望涨，低于它掉） */
  pass: number;
  missed: { post: string; minutes: number } | null;
  money: WeekMoney;
  /** 声望各项（规则 week.reputation 的项，加上特质 traits） */
  rep: Record<string, number>;
  /** 会员：按公式该来多少人、场地撑得起多少人（null = 没上限） */
  members: { gain: number; cap: number | null };
  /** 质量这周在向哪个目标靠近，目标的各项 */
  quality: { target: number; terms: Record<string, number> };
}

/** 效果能改的人物属性 */
export type PersonAttr = 'skill' | 'upkeep' | 'service' | 'play' | 'morale' | 'fatigue';

export type EffectRecord =
  | { kind: 'stat'; stat: string; delta: number }
  | { kind: 'cost'; amount: number }
  | { kind: 'flag'; flag: string; value: boolean | number | string }
  | { kind: 'facility'; facility: string; state: string }
  | { kind: 'schedule'; card: string; at: number }
  | { kind: 'activity'; activity: string; at: number }
  | { kind: 'hire'; person: string }
  | { kind: 'fire'; person: string }
  | { kind: 'person'; person: string; attr: PersonAttr; delta: number }
  | { kind: 'text'; key: string }
  | { kind: 'errand'; person: string; at: string; minutes: number }
  | { kind: 'condition'; facility: string; delta: number }
  | { kind: 'end'; result: 'won' | 'lost'; ending: string };

export interface OpenCard {
  /** 这一次出现的唯一编号（同一张卡可以出现多次） */
  uid: number;
  card: string;
  opened: number;
  /** 过期时间（绝对游戏分钟）；null 表示不会过期 */
  expires: number | null;
  /** 因果日志里引出它的那一条 */
  cause: number | null;
}

export interface ScheduledCard {
  card: string;
  at: number;
  cause: number | null;
}

export interface RunningActivity {
  uid: number;
  id: string;
  anchor: string;
  start: number;
  end: number;
  started: boolean;
  cause: number | null;
}

export interface GameState {
  version: number;
  contentVersion: string;
  seed: number;
  act: string;
  /** 导演配置（稳健型 / 戏剧型 / 随机型） */
  directorConfig: string;
  /** 绝对游戏分钟：第 1 天 0 点起算。夜里俱乐部关门的时间直接跳过 */
  t: number;
  /** mulberry32 的内部状态：随机数也是状态的一部分 */
  rng: number;
  stats: Record<string, number>;
  facilities: Record<string, string>;
  people: Record<string, PersonState>;
  headCoach: string | null;
  /** 持续岗位的进度（只记有进度的） */
  posts: Record<string, PostState>;
  /** 开了工的工单 */
  orders: Record<string, OrderState>;
  /** 工单：冷却到什么时候、做完过几次 */
  orderLog: { cooldowns: Record<string, number>; done: Record<string, number> };
  /** 设施状况 0..100 */
  condition: Record<string, number>;
  /** 本周的账（周日收盘结算、写成一条因果日志，然后清零） */
  week: WeekState;
  /**
   * 拆成几项的派生量（例如董事会信心）每一项现在的值，和上个周日收盘时的值（第二轮试玩 S2）。
   * 每天收盘重算；没有的老存档在下一次重算时补上。
   */
  terms?: Record<string, Record<string, number>>;
  termsWeek?: Record<string, Record<string, number>>;
  /** 今天每个岗位转了几圈、带来了什么（收盘时合成一条因果日志） */
  ledger: Record<string, { person: string; cycles: number; effects: EffectRecord[] }>;
  cards: {
    open: OpenCard[];
    scheduled: ScheduledCard[];
    /** 卡 → 冷却到什么时候 */
    cooldowns: Record<string, number>;
    /** 卡 → 处理过几次 */
    seen: Record<string, number>;
    /** 卡 → 出现过几次（机器人跑局统计用） */
    shown: Record<string, number>;
    nextDraw: number;
  };
  activities: RunningActivity[];
  /** 当前季节 id 和今天的天气 */
  season: string;
  weather: 'sun' | 'cloud' | 'rain' | 'wind';
  flags: Record<string, boolean | number | string>;
  log: CausalEntry[];
  outcome: { result: 'won' | 'lost'; ending: string; t: number } | null;
  nextUid: number;
}

/** 绝对分钟 → 第几天（从 1 开始） */
export const dayOf = (t: number): number => Math.floor(t / 1440) + 1;
/** 绝对分钟 → 当天的分钟 */
export const minuteOfDay = (t: number): number => t % 1440;
export const at = (day: number, hour: number): number => (day - 1) * 1440 + Math.round(hour * 60);
/** 总监在人员表里的 id */
export const DIRECTOR = 'director';

/** 第 1 天是周一：0 = 周一 … 6 = 周日 */
export const weekdayOf = (t: number): number => (dayOf(t) - 1) % 7;
