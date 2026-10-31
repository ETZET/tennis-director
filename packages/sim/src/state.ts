import type { OptionKey } from '@td/content';

/**
 * 游戏状态：一个可以直接 JSON.stringify 的普通对象，按 id 归一化。
 * 不放类实例、函数或 three.js 对象；存档就是把它写下来。
 */

/** 存档格式版本；改了格式就加一个迁移函数（见 save.ts） */
export const SAVE_VERSION = 2;

export interface PersonState {
  id: string;
  hired: boolean;
  at: string;
  skill: number;
  morale: number;
  fatigue: number;
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
  | { kind: 'action'; action: string; success?: boolean }
  | { kind: 'plan'; season: string }
  | { kind: 'debug'; what: string };

export type EffectRecord =
  | { kind: 'stat'; stat: string; delta: number }
  | { kind: 'cost'; amount: number }
  | { kind: 'flag'; flag: string; value: boolean | number | string }
  | { kind: 'facility'; facility: string; state: string }
  | { kind: 'schedule'; card: string; at: number }
  | { kind: 'activity'; activity: string; at: number }
  | { kind: 'hire'; person: string }
  | { kind: 'fire'; person: string }
  | { kind: 'person'; person: string; attr: 'skill' | 'morale' | 'fatigue'; delta: number }
  | { kind: 'text'; key: string }
  | { kind: 'follow'; person: string }
  | { kind: 'energy'; delta: number }
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

export interface DirectorState {
  /** 站在哪个锚点；走在路上时是 null */
  at: string | null;
  /** 正在走的这一段：从哪到哪、什么时候出发、什么时候到 */
  leg: { from: string; to: string; start: number; end: number } | null;
  /** 这一段之后还要经过的锚点 */
  route: string[];
  /** 精力 0..100：季初满格，做事花掉，夜里恢复一点 */
  energy: number;
  /** 手上的事：先走过去（going），再在那儿忙（working，到 end 为止） */
  task: DirectorTask | null;
}

export interface DirectorTask {
  action: string;
  at: string;
  phase: 'going' | 'working';
  start: number;
  end: number;
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
  director: DirectorState;
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
  /** 主动经营的动作：冷却到什么时候、做过几次 */
  actions: { cooldowns: Record<string, number>; done: Record<string, number> };
  /** 季度日程（会所公告板）：时段 → 周一到周日每天钉的活动（null 表示空着） */
  plan: Record<string, (string | null)[]>;
  /** 正在排日程（换季时打开，玩家确认后关上；排日程时游戏暂停） */
  planning: boolean;
  /** 当前季节 id 和今天的天气 */
  season: string;
  weather: 'sun' | 'cloud' | 'rain' | 'wind';
  flags: Record<string, boolean | number | string>;
  log: CausalEntry[];
  /** 「谁跟我走」选中的人 */
  legacy: string[];
  outcome: { result: 'won' | 'lost'; ending: string; t: number } | null;
  nextUid: number;
}

/** 绝对分钟 → 第几天（从 1 开始） */
export const dayOf = (t: number): number => Math.floor(t / 1440) + 1;
/** 绝对分钟 → 当天的分钟 */
export const minuteOfDay = (t: number): number => t % 1440;
export const at = (day: number, hour: number): number => (day - 1) * 1440 + Math.round(hour * 60);
/** 第 1 天是周一：0 = 周一 … 6 = 周日 */
export const weekdayOf = (t: number): number => (dayOf(t) - 1) % 7;
