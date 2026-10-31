import { z } from 'zod';

/**
 * 内容数据的 schema。一份 schema 既生成 TypeScript 类型，又在构建时和热更新时校验 YAML。
 * 设计文档的「事件卡规格」直接对应这里的 Card。
 */

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower_snake_case');
/** 游戏内时长："30m"、"2h"、"1d"（1d = 1440 分钟，跨夜也算） */
export const duration = z.string().regex(/^\d+(\.\d+)?[mhd]$/, 'durations look like 30m, 2h or 1d');
/** 数或表达式字符串（表达式在编译时检查） */
const amount = z.union([z.number(), z.string()]);

/* ---------------- 条件 ---------------- */

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { stat: string; lt?: number; lte?: number; gt?: number; gte?: number; eq?: number }
  | { flag: string; is?: boolean | number | string }
  | { facility: string; is: string }
  | { directorAt: string }
  | { day: { gte?: number; lte?: number } }
  | { hour: { gte?: number; lte?: number } }
  | { seen: string }
  | { open: string }
  | { coach: string }
  | { activity: string; running?: boolean }
  | { expr: string };

export const cond: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(cond).min(1) }),
    z.strictObject({ any: z.array(cond).min(1) }),
    z.strictObject({ not: cond }),
    z.strictObject({
      stat: id,
      lt: z.number().optional(),
      lte: z.number().optional(),
      gt: z.number().optional(),
      gte: z.number().optional(),
      eq: z.number().optional(),
    }),
    z.strictObject({ flag: id, is: z.union([z.boolean(), z.number(), z.string()]).optional() }),
    z.strictObject({ facility: id, is: id }),
    z.strictObject({ directorAt: id }),
    z.strictObject({ day: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ hour: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ seen: id }),
    z.strictObject({ open: id }),
    /** 现任主教练是谁；'none' 表示空缺 */
    z.strictObject({ coach: id }),
    z.strictObject({ activity: id, running: z.boolean().optional() }),
    z.strictObject({ expr: z.string() }),
  ]),
);

/* ---------------- 效果（白名单操作） ---------------- */

/** 每个效果都可以带条件和概率 */
const gate = { if: cond.optional(), chance: amount.optional() };

export const effect = z.union([
  z.strictObject({ ...gate, stat: id, add: amount }),
  z.strictObject({ ...gate, stat: id, set: amount }),
  z.strictObject({ ...gate, flag: id, set: z.union([z.boolean(), z.number(), z.string()]) }),
  z.strictObject({ ...gate, facility: id, set: id }),
  /** 安排后续事件：in 之后出现（带着原因链） */
  z.strictObject({ ...gate, schedule: id, in: duration }),
  /** 开始一个活动（结算时再执行活动自己的效果） */
  z.strictObject({ ...gate, activity: id, in: duration.optional() }),
  z.strictObject({ ...gate, hire: id }),
  z.strictObject({ ...gate, fire: id }),
  z.strictObject({
    ...gate,
    person: id,
    add: z.strictObject({ skill: amount.optional(), morale: amount.optional(), fatigue: amount.optional() }),
  }),
  /** 在因果日志里写一行文案 */
  z.strictObject({ ...gate, log: z.string() }),
  /** 结束本幕 */
  z.strictObject({ ...gate, endAct: z.enum(['won', 'lost']), ending: id }),
  /** 「谁跟我走」：这个人进入跨幕继承 */
  z.strictObject({ ...gate, follow: id }),
]);
export type Effect = z.infer<typeof effect>;

/* ---------------- 事件卡 ---------------- */

export const option = z.strictObject({
  /** 不满足时选项显示但不能选 */
  requires: cond.optional(),
  /** 总监要先走到这里 */
  requiresDirectorAt: id.optional(),
  /** 立即扣的钱（现金不够时不能选） */
  cost: z.number().min(0).optional(),
  effects: z.array(effect).default([]),
  /** 判定：成功率 = clamp(0.5 + (状态量 − vs) / 50, 5%, 95%)，或直接给表达式 */
  check: z.union([z.strictObject({ stat: id, vs: z.number() }), z.strictObject({ chance: z.string() })]).optional(),
  onSuccess: z.array(effect).default([]),
  onFail: z.array(effect).default([]),
});
export type CardOption = z.infer<typeof option>;

export const OPTION_KEYS = ['A', 'B', 'C'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const card = z.strictObject({
  id,
  act: id,
  /** 里程碑、阈值、日历、活动后果、随机（喜剧事件） */
  source: z.enum(['milestone', 'threshold', 'calendar', 'consequence', 'random']),
  /** 导演用来调权重的语气 */
  tone: z.enum(['crisis', 'relief', 'comedy', 'neutral']).default('neutral'),
  /** 抽卡的前置条件（阈值和随机卡） */
  when: cond.optional(),
  weight: z.number().min(0).default(1),
  cooldown: duration.optional(),
  /** 只出现一次（里程碑、日历、后果卡默认只出现一次） */
  once: z.boolean().optional(),
  /** 不处理就过期，执行默认后果 */
  countdown: duration.optional(),
  /** 出现时请求自动暂停 */
  pause: z.boolean().default(false),
  /** 事件发生在哪个锚点（界面上的地点标签、相机焦点） */
  location: id,
  /** 演出：在哪个锚点播哪个动画 */
  stage: z.strictObject({ anchor: id, performance: id }).optional(),
  options: z.partialRecord(z.enum(OPTION_KEYS), option),
  /** 不处理时发生什么：执行哪个选项（then），外加额外后果。字段名沿用设计文档的写法 */
  default: z
    // biome-ignore lint/suspicious/noThenProperty: 'then' is the field name in the card spec; this is plain data, never awaited
    .strictObject({ then: z.enum(OPTION_KEYS).nullable(), extra: z.array(effect).default([]) })
    .optional(),
});
export type Card = z.infer<typeof card>;

/* ---------------- 活动、状态量、设施、人物、特质、导演 ---------------- */

export const activity = z.strictObject({
  id,
  duration,
  anchor: id,
  /** 渲染层的演出名（render/choreo 注册表里的键） */
  performance: id,
  /** 进行中每天的开销（例如外包施工） */
  effects: z.array(effect).default([]),
});
export type Activity = z.infer<typeof activity>;

export const stat = z.strictObject({
  id,
  min: z.number(),
  max: z.number(),
  display: z.enum(['number', 'money', 'grade', 'days']),
  /** 'all' 或某一幕 */
  act: z.string(),
});
export type Stat = z.infer<typeof stat>;

export const facilityState = z.strictObject({
  /** 这个状态下能打网球的场地数 */
  courts: z.number().default(0),
  /** 对项目质量目标值的贡献 */
  quality: z.number().default(0),
  /** 每周收入 / 支出（美元） */
  income_week: z.number().default(0),
  upkeep_week: z.number().default(0),
});
export const facility = z.strictObject({ id, anchor: id, states: z.record(id, facilityState) });
export type Facility = z.infer<typeof facility>;

export const person = z.strictObject({
  id,
  name: z.string(),
  role: z.enum(['coach', 'junior', 'staff', 'parent', 'candidate', 'rival']),
  skill: z.number().min(0).max(100),
  morale: z.number().min(0).max(100).default(60),
  fatigue: z.number().min(0).max(100).default(0),
  wage_week: z.number().min(0).default(0),
  talent: z.number().min(0).max(100).optional(),
  traits: z.array(id).default([]),
});
export type Person = z.infer<typeof person>;

export const trait = z.strictObject({
  id,
  /** 教练在总监不在场时的专注度倍数（1 = 正常） */
  attention: z.number().default(1),
  /** 每天士气漂移 */
  morale_drift: z.number().default(0),
  /** 对声望的每日影响 */
  reputation_drift: z.number().default(0),
});
export type Trait = z.infer<typeof trait>;

export const director = z.strictObject({
  id,
  /** 两次抽卡之间的最短时间 */
  interval: duration,
  /** 同时开着的卡最多几张（超过就不再发阈值卡） */
  max_open: z.number().int().min(1),
  /** 压力值 0..1 的表达式 */
  pressure: z.string(),
  /** 各语气的权重倍数（表达式，可以用 pressure） */
  weights: z.strictObject({ crisis: amount, relief: amount, comedy: amount, neutral: amount }),
});
export type DirectorConfig = z.infer<typeof director>;

/* ---------------- 幕 ---------------- */

export const act = z.strictObject({
  id,
  start: z.strictObject({ day: z.number().int().min(1), hour: z.number().min(0).max(24) }),
  hours: z.strictObject({ open: z.number(), close: z.number() }),
  stats: z.record(id, z.number()),
  facilities: z.record(id, id),
  /** 开局在场的人；hired 表示在职（主教练用 head_coach） */
  people: z.array(z.strictObject({ id, at: id, head_coach: z.boolean().default(false) })),
  director: z.strictObject({ at: id }),
  anchors: z.array(id).min(1),
  /** 导航图：两个锚点、步行分钟数 */
  nav: z.array(z.tuple([id, id, z.number().positive()])),
  start_cards: z.array(id).default([]),
  calendar: z.array(z.strictObject({ day: z.number().int(), hour: z.number(), card: id })).default([]),
  director_config: id,
  /** 每天收盘时结算的规则（表达式） */
  rules: z.strictObject({
    quality_target: z.string(),
    /** 每天向目标靠近的比例 0..1 */
    quality_rate: z.number().min(0).max(1),
    /** 每天会员变化（可以用 rand） */
    member_drift: z.string(),
    reputation_drift: z.string(),
    /** 每个会员每周的会费 */
    dues_week: z.number(),
    /** 每天收盘和开局时重算的派生状态量，例如董事会信心 */
    derived: z.record(id, z.string()).default({}),
    /** 输掉本幕的条件（每天收盘时检查）和对应的结局 */
    lose_if: z.strictObject({ when: cond, ending: id }).optional(),
  }),
  /** 每天固定开的活动（例如下午的青少年课） */
  daily: z.array(z.strictObject({ hour: z.number(), activity: id, if: cond.optional() })).default([]),
});
export type Act = z.infer<typeof act>;

/* ---------------- 整个内容包 ---------------- */

export interface ContentBundle {
  /** 内容的哈希，存档里记下来，用于判断存档对应哪一版内容 */
  version: string;
  stats: Stat[];
  facilities: Facility[];
  people: Person[];
  traits: Trait[];
  directors: DirectorConfig[];
  activities: Activity[];
  acts: Act[];
  cards: Card[];
  /** 语言 → 扁平的文案键值表 */
  i18n: Record<string, Record<string, string>>;
}

export const DURATION_UNITS = { m: 1, h: 60, d: 1440 } as const;
/** "2h" → 120（游戏分钟） */
export function minutes(d: string): number {
  const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(d);
  if (!m) throw new Error(`bad duration ${d}`);
  return Math.round(Number(m[1]) * DURATION_UNITS[m[2] as keyof typeof DURATION_UNITS]);
}
