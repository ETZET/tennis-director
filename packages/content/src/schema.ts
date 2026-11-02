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
  | { assigned: string; at?: string }
  | { day: { gte?: number; lte?: number } }
  | { hour: { gte?: number; lte?: number } }
  | { seen: string }
  | { open: string }
  | { coach: string }
  | { activity: string; running?: boolean }
  | { weather: string }
  | { season: string }
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
    /** 这个人正在干活（站在岗位或工单上）；带 at 时还要求在那个地点 */
    z.strictObject({ assigned: id, at: id.optional() }),
    z.strictObject({ day: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ hour: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ seen: id }),
    z.strictObject({ open: id }),
    /** 现任主教练是谁；'none' 表示空缺 */
    z.strictObject({ coach: id }),
    z.strictObject({ activity: id, running: z.boolean().optional() }),
    /** 今天的天气：sun / cloud / rain / wind */
    z.strictObject({ weather: z.enum(['sun', 'cloud', 'rain', 'wind']) }),
    /** 当前季节（幕里 seasons 的 id） */
    z.strictObject({ season: id }),
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
  /** 改某人的属性。岗位和工单的效果里 person 可以写 worker：在岗（干完这一圈、做完这张工单）的那个人 */
  z.strictObject({
    ...gate,
    person: id,
    add: z.strictObject({
      skill: amount.optional(),
      upkeep: amount.optional(),
      service: amount.optional(),
      play: amount.optional(),
      morale: amount.optional(),
      fatigue: amount.optional(),
    }),
  }),
  /** 改设施状况 0..100（例如大风把沙吹进场地） */
  z.strictObject({ ...gate, condition: id, add: amount }),
  /** 在因果日志里写一行文案 */
  z.strictObject({ ...gate, log: z.string() }),
  /** 结束本幕 */
  z.strictObject({ ...gate, endAct: z.enum(['won', 'lost']), ending: id }),
  /** 把某人从手上的岗位叫走，到 at 去办一件事，办 for 这么久（拉走持续岗位照样丢掉这一圈） */
  z.strictObject({ ...gate, errand: id, at: id, for: duration }),
]);
export type Effect = z.infer<typeof effect>;

/* ---------------- 事件卡 ---------------- */

export const option = z.strictObject({
  /** 不满足时选项显示但不能选 */
  requires: cond.optional(),
  /** 总监要亲自去办：选了以后总监离开手上的岗位，去 at 待 for 这么久（ADR 0012：代价是总监的工时） */
  errand: z.strictObject({ at: id, for: duration }).optional(),
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
  /** 一幕里最多出现几次（阈值和随机卡不写时是 2：第二轮试玩 S5，同一张卡来了 4 次） */
  max_shown: z.number().int().min(1).optional(),
  /** 不处理就过期，执行默认后果 */
  countdown: duration.optional(),
  /** 出现时请求自动暂停 */
  pause: z.boolean().default(false),
  /** 事件发生在哪个锚点（界面上的地点标签、相机焦点） */
  location: id,
  /** 谁来找你：人物 id，或者一个群体（文案在 who.<id>.name / who.<id>.role） */
  who: id.optional(),
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
  /** 活动结束时结算的效果 */
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
  /** 下雨天也能用（气膜、室内）；默认下雨天不能用 */
  rain_ok: z.boolean().default(false),
  /** 对项目质量目标值的贡献 */
  quality: z.number().default(0),
  /** 每周收入 / 支出（美元） */
  income_week: z.number().default(0),
  upkeep_week: z.number().default(0),
  /** 没人维护时每天掉多少状况（0..100）；岗位每圈的 wear 另算 */
  decay_day: z.number().min(0).default(0),
});
export const facility = z.strictObject({ id, anchor: id, states: z.record(id, facilityState) });
export type Facility = z.infer<typeof facility>;

/**
 * 人物的作用（docs/design/people.md）：coach 教练（上课、学院，招来接任主教练）、crew 维护工（修和维护设施）、
 * special 特殊作用人物（穿线师、体能师、球童、前台……靠特质解锁自己的岗位）、
 * player 球员（训练、出去打比赛、赢了带来名气）。
 */
export const PERSON_KINDS = ['coach', 'crew', 'special', 'player'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const person = z.strictObject({
  id,
  name: z.string(),
  /** 作用；招聘日的候选人必须写（文案在 kinds.<作用>，一句话背景在 bios.<id>） */
  kind: z.enum(PERSON_KINDS).optional(),
  /** director：总监本人（可指派、没有士气）；coach / staff：员工；candidate：招聘日的候选人 */
  role: z.enum(['director', 'coach', 'junior', 'staff', 'parent', 'candidate', 'rival']),
  /** 教学能力（沿用 skill 这个名字） */
  skill: z.number().min(0).max(100),
  /** 维护能力：修场、除草、清扫 */
  upkeep: z.number().min(0).max(100).default(0),
  /** 服务能力：接待、陪打、办活动 */
  service: z.number().min(0).max(100).default(0),
  /** 球技：球员训练和打比赛用（其他人一般是 0） */
  play: z.number().min(0).max(100).default(0),
  morale: z.number().min(0).max(100).default(60),
  fatigue: z.number().min(0).max(100).default(0),
  wage_week: z.number().min(0).default(0),
  talent: z.number().min(0).max(100).optional(),
  /** 旧写法：应聘者招进来以后当什么（coach 会接任主教练）。新人物用 kind: coach */
  hire_as: z.enum(['coach', 'staff']).optional(),
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
  /** 干活时某项能力加（减）多少点：影响速度和每圈收入（docs/design/people.md「特质」） */
  bonus: z
    .strictObject({
      teach: z.number().optional(),
      upkeep: z.number().optional(),
      service: z.number().optional(),
      play: z.number().optional(),
    })
    .default({}),
  /** bonus 只在这个条件下生效（例如大风天、下午四点以后）；不写表示一直生效 */
  when: cond.optional(),
});
export type Trait = z.infer<typeof trait>;

export const director = z.strictObject({
  id,
  /** 两次抽卡之间的最短时间 */
  interval: duration,
  /** 同时开着的卡最多几张（超过就不再发阈值卡） */
  max_open: z.number().int().min(1),
  /** 任何一张卡（包括日历和后果卡）打开以后，至少隔这么久才抽下一张随机或阈值卡（S5：一小时里来三张） */
  gap: duration.default('4h'),
  /** 压力值 0..1 的表达式 */
  pressure: z.string(),
  /** 各语气的权重倍数（表达式，可以用 pressure） */
  weights: z.strictObject({ crisis: amount, relief: amount, comedy: amount, neutral: amount }),
});
export type DirectorConfig = z.infer<typeof director>;

/* ---------------- 岗位和工单（ADR 0012）：玩家把人拖上去 ---------------- */

/** 员工的能力：教学、维护、服务，加上球员的球技 */
export const SKILLS = ['teach', 'upkeep', 'service', 'play'] as const;
export type SkillKind = (typeof SKILLS)[number];

/**
 * 持续岗位：地点上的一个"位子"。有人坐着、在它的时段里、条件满足时，一圈一圈地转，每转完一圈结算一次 effects。
 * 有 hours 的岗位是"需求"：时段里每分钟都计入本周服务率（有人在岗才算服务到）。
 * effects 里的表达式可以用 worker.skill（这个岗位要的那项能力）。
 */
export const post = z.strictObject({
  id,
  act: id,
  at: id,
  skill: z.enum(SKILLS),
  /** 一圈多久 */
  cycle: duration,
  /** 有客人的时段 [开始, 结束)（小时）；不写表示随时可以干，不算需求 */
  hours: z.tuple([z.number().min(0).max(24), z.number().min(0).max(24)]).optional(),
  /** 星期几有客人（0 = 周一）；不写表示每天 */
  days: z.array(z.number().int().min(0).max(6)).optional(),
  /** 岗位什么时候存在（设施状态、天气、会员数……） */
  when: cond.optional(),
  /** 每圈结算 */
  effects: z.array(effect).default([]),
  /** 每圈磨损这个地点的设施状况；负数是修复（维护岗位） */
  wear: z.number().default(0),
  /** 维护岗位修复多少要乘能力：restore × (0.5 + worker.skill / 100) */
  restore: z.number().min(0).default(0),
  /** 只收这些人：作用（kind）或特质 id，命中一个就行；不写谁都能干 */
  only: z.array(id).min(1).optional(),
  performance: id.optional(),
});
export type Post = z.infer<typeof post>;

/**
 * 一次性工单：长在问题上的标记（杂草、裂缝、塌掉的气膜）。拖人上去开始干，可以多人一起，
 * 拉走进度保留。第一个人开工时扣材料费；做满 work（人·分钟，按能力加速）就结算 effects。
 * effects 和 check 的表达式可以用 worker.skill：干这张工单的人里那项能力最高的值（还没人时按能来干的人里最高的算）。
 */
export const order = z.strictObject({
  id,
  act: id,
  at: id,
  skill: z.enum(SKILLS),
  /** 工作量：一个能力 50 的人要干多久 */
  work: duration,
  /** 材料费（开工时扣；钱不够开不了工） */
  cost: z.number().min(0).default(0),
  /** 标记什么时候冒出来 */
  when: cond.optional(),
  /** 最多几个人一起干 */
  crew: z.number().int().min(1).default(3),
  /** 做完多久以后才会再冒出来；不写就只做一次（除非 when 又满足——例如状况又掉下来） */
  cooldown: duration.optional(),
  once: z.boolean().default(false),
  /** 完成时给这个地点的设施加多少状况 */
  restore: z.number().min(0).default(0),
  check: z.union([z.strictObject({ stat: id, vs: z.number() }), z.strictObject({ chance: z.string() })]).optional(),
  effects: z.array(effect).default([]),
  onSuccess: z.array(effect).default([]),
  onFail: z.array(effect).default([]),
  /** 只收这些人：作用（kind）或特质 id，命中一个就行；不写谁都能干 */
  only: z.array(id).min(1).optional(),
  performance: id.optional(),
});
export type Order = z.infer<typeof order>;

/* ---------------- 幕 ---------------- */

export const act = z.strictObject({
  id,
  start: z.strictObject({ day: z.number().int().min(1), hour: z.number().min(0).max(24) }),
  hours: z.strictObject({ open: z.number(), close: z.number() }),
  stats: z.record(id, z.number()),
  facilities: z.record(id, id),
  /** 开局在场的人（总监也在这里，role 是 director）；主教练用 head_coach */
  people: z.array(z.strictObject({ id, at: id, head_coach: z.boolean().default(false), job: id.optional() })),
  /** 开局时各设施的状况 0..100（不写的是 100） */
  condition: z.record(id, z.number().min(0).max(100)).default({}),
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
    /**
     * 拆成几项的派生量（第二轮试玩 S2：董事会信心不能是黑箱）：值 = 各项之和（按状态量的范围截断）。
     * 每项有名字（文案在 ui.terms.<名字>），界面据此说明它为什么变；周日收盘时记下每项这一周变了多少。
     */
    derived_terms: z.record(id, z.record(id, z.string())).default({}),
    /** 表决把握（0..1 的表达式），HUD 上显示；应和表决卡主选项的成功率一致 */
    vote_odds: z.string().optional(),
    /** 输掉本幕的条件（每天收盘时检查）和对应的结局 */
    lose_if: z.strictObject({ when: cond, ending: id }).optional(),
    /** 总监每干完一圈岗位或一张工单，那项能力涨多少（上限 director_skill_cap） */
    director_growth: z.number().min(0).default(0.3),
    director_skill_cap: z.number().min(0).max(100).default(80),
  }),
  /** 每天固定开的活动（例如下午的青少年课） */
  daily: z.array(z.strictObject({ hour: z.number(), activity: id, if: cond.optional() })).default([]),
  /** 季节：从第几天开始（第一个从第 1 天开始）；decay 是这一季设施衰减的倍数（初秋落叶多） */
  seasons: z
    .array(z.strictObject({ id, from_day: z.number().int().min(1), decay: z.number().min(0).default(1) }))
    .default([]),
  /** 每个季节的天气权重 */
  weather: z
    .record(id, z.strictObject({ sun: z.number(), cloud: z.number(), rain: z.number(), wind: z.number() }))
    .default({}),
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
  posts: Post[];
  orders: Order[];
  acts: Act[];
  cards: Card[];
  /** 语言 → 扁平的文案键值表 */
  i18n: Record<string, Record<string, string>>;
}

export const DURATION_UNITS = { m: 1, h: 60, d: 1440 } as const;
/** "2h" → 120（游戏分钟） */
const parsed = new Map<string, number>();
export function minutes(d: string): number {
  const hit = parsed.get(d);
  if (hit !== undefined) return hit;
  const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(d);
  if (!m) throw new Error(`bad duration ${d}`);
  const v = Math.round(Number(m[1]) * DURATION_UNITS[m[2] as keyof typeof DURATION_UNITS]);
  parsed.set(d, v);
  return v;
}
