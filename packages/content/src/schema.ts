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

/** 员工的能力：教学、维护、服务，加上球员的球技 */
export const SKILLS = ['teach', 'upkeep', 'service', 'play'] as const;
export type SkillKind = (typeof SKILLS)[number];

/** 天气（court-care-contract.md：加了酷热 heat） */
export const WEATHERS = ['sun', 'cloud', 'rain', 'wind', 'heat'] as const;
export type Weather = (typeof WEATHERS)[number];

/**
 * 场地可用度（court-care-contract.md，ADR 0022）：场面上的五种脏乱，各 0..1。
 * sand 积沙、water 积水（红土是泥）、litter 球和垃圾、lines 线褪色、cracks 裂缝（红土是干裂）。
 */
export const MESS_KINDS = ['sand', 'water', 'litter', 'lines', 'cracks'] as const;
export type MessKind = (typeof MESS_KINDS)[number];
/** 场地的面：硬地、红土、匹克球 */
export const SURFACES = ['hard', 'clay', 'pickleball'] as const;
export type Surface = (typeof SURFACES)[number];

/* ---------------- 条件 ---------------- */

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { stat: string; lt?: number; lte?: number; gt?: number; gte?: number; eq?: number }
  | { flag: string; is?: boolean | number | string }
  | { facility: string; is: string }
  | { variant: string; is: string }
  | { upgrade: string; has: string }
  | { route: string; is: string }
  | { plot: string; is: string }
  | { prep: string; done?: boolean }
  | { skilled: SkillKind; gte: number; who?: string }
  | { unlocked: string }
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
    /** 设施修成了哪个变体（LG-14）；is: none 表示还没选（没修、或者修的工单没有变体） */
    z.strictObject({ variant: id, is: id }),
    /** 设施装上了这个升级（LG-14） */
    z.strictObject({ upgrade: id, has: id }),
    /** 这一处选路（LG-11 / W2：s2、s3、s4）选了哪条路；is: none = 还没选 */
    z.strictObject({ route: id, is: id }),
    /**
     * 地块（W5，LG-15）：is 是 locked / building / open，或者变体 id（= 按这个变体在施工或者已经开了）
     */
    z.strictObject({ plot: id, is: id }),
    /** 一组分期筹备工单（order 的 prep）是不是都做完了；done: false = 还没都做完 */
    z.strictObject({ prep: id, done: z.boolean().optional() }),
    /**
     * 员工成长（W3）：在职、能指派的人里（含总监）有没有一个这项能力（底子，不算特质）≥ gte 的；
     * who 写了就只看作用（kind）或特质是它的人，例如 { skilled: upkeep, gte: 75, who: crew }
     */
    z.strictObject({ skilled: z.enum(SKILLS), gte: z.number().min(0).max(100), who: id.optional() }),
    /** 成长解锁（W3）：act 的 growth.unlocks 里这一项开出来了没有 */
    z.strictObject({ unlocked: id }),
    /** 这个人正在干活（站在岗位或工单上）；带 at 时还要求在那个地点 */
    z.strictObject({ assigned: id, at: id.optional() }),
    z.strictObject({ day: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ hour: z.strictObject({ gte: z.number().optional(), lte: z.number().optional() }) }),
    z.strictObject({ seen: id }),
    z.strictObject({ open: id }),
    /** 现任主教练是谁；'none' 表示空缺 */
    z.strictObject({ coach: id }),
    z.strictObject({ activity: id, running: z.boolean().optional() }),
    /** 今天的天气：sun / cloud / rain / wind / heat */
    z.strictObject({ weather: z.enum(WEATHERS) }),
    /** 当前季节（幕里 seasons 的 id） */
    z.strictObject({ season: id }),
    z.strictObject({ expr: z.string() }),
  ]),
);

/* ---------------- 效果（白名单操作） ---------------- */

/** 每种脏乱一个数（都可以不写）：效果 mess 的增量、rules.care 的各种速率和权重 */
export const messAmounts = z.strictObject({
  sand: z.number().optional(),
  water: z.number().optional(),
  litter: z.number().optional(),
  lines: z.number().optional(),
  cracks: z.number().optional(),
});
export type MessAmounts = z.infer<typeof messAmounts>;

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
  /**
   * 一段时间内衰减打折（W3）：这处设施收盘衰减 × factor，持续 days 天（从现在起算 days × 24 小时）。
   * 同一处再来一次就换成新的（倍数和到期都换）。岗位每圈的 wear 不打折。例如夜间养护：{ facility: outer_23, factor: 0.7, days: 7 }
   */
  z.strictObject({
    ...gate,
    decay_mult: z.strictObject({ facility: id, factor: z.number().min(0).max(2), days: z.number().positive() }),
  }),
  /** 在因果日志里写一行文案 */
  z.strictObject({ ...gate, log: z.string() }),
  /** 结束本幕 */
  z.strictObject({ ...gate, endAct: z.enum(['won', 'lost']), ending: id }),
  /** 把某人从手上的岗位叫走，到 at 去办一件事，办 for 这么久（拉走持续岗位照样丢掉这一圈） */
  z.strictObject({ ...gate, errand: id, at: id, for: duration }),
  /** 把一张工单记给某人：他闲下来（手上的班结束、工单做完）就自己走过去开工，材料费照常在开工时扣 */
  z.strictObject({ ...gate, task: id, who: id }),
  /** 奖杯 +n（LG-10：办成一次主办赛事、或者在外出赛事里赢下来）；变量 trophies */
  z.strictObject({ ...gate, trophy: z.number().int().min(1) }),
  /** 选路（W2）：记下这一处（s2 / s3 / s4）选了哪条路；已经选过就不再改。变量 route.<处>，条件 { route, is } */
  z.strictObject({ ...gate, route: id, set: id }),
  /**
   * 结局（W4，LG-13）：现在就结算打分（结局卡的"马上结算"）。只在地图写了 ending（mode: score）、第一季还没结算时生效，
   * 别处什么都不做。
   */
  z.strictObject({ ...gate, settle: z.literal(true) }),
  /**
   * 地块（W5，LG-15）：按这个变体开始施工（地块还是 locked 时才生效；冒出它的清理工单）。
   * 选路（route）会自动让对应的地块开工，这个效果给第二季和特别的卡用
   */
  z.strictObject({ ...gate, plot: id, build: id }),
  /**
   * 场地可用度（court-care-contract.md）：给这块场的脏乱各项加多少（0..1，可以是负数 = 清掉），结果截在 0..1。
   * 例如沙尘暴不管：{ mess: outer_1, add: { sand: 0.6 } }。不是 rules.care.courts 里的设施什么都不做
   */
  z.strictObject({ ...gate, mess: id, add: messAmounts }),
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
  /** 抽卡权重：数或表达式（例如按选的路调招聘日的权重：route.s2 == "youth" ? 2 : 1） */
  weight: amount.default(1),
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
  /**
   * 掉档（准则 6）：周日收盘时状况低于幕规则 grade_drop_below，就掉到这个状态（同一设施里的另一个状态）。
   * 掉到的状态通常是"停用"：没有场地、岗位不开，要做一张修复工单才回得来。不写就不会掉档（废墟、已经是最低档）。
   */
  drops_to: id.optional(),
});
export type FacilityState = z.infer<typeof facilityState>;
/** 变体对某个状态的覆盖（LG-14）：写了的字段替换基础状态里的值 */
export const facilityStateOverride = z.strictObject({
  courts: z.number().optional(),
  rain_ok: z.boolean().optional(),
  quality: z.number().optional(),
  income_week: z.number().optional(),
  upkeep_week: z.number().optional(),
  decay_day: z.number().min(0).optional(),
  drops_to: id.optional(),
});
export type FacilityStateOverride = z.infer<typeof facilityStateOverride>;
/** 升级对某个状态的加成（LG-14）：数值字段加在（变体覆盖过的）状态上 */
export const facilityStateAdd = z.strictObject({
  courts: z.number().optional(),
  quality: z.number().optional(),
  income_week: z.number().optional(),
  upkeep_week: z.number().optional(),
  decay_day: z.number().optional(),
});
export type FacilityStateAdd = z.infer<typeof facilityStateAdd>;
export const facility = z.strictObject({
  id,
  anchor: id,
  states: z.record(id, facilityState),
  /**
   * 修复分叉（LG-14）：变体 id → 对各状态的覆盖。第一个是默认变体（机器人、没指明变体的指派用它）。
   * 不写变体的设施照旧"修回原样"。
   */
  variants: z.record(id, z.strictObject({ states: z.record(id, facilityStateOverride).optional() })).optional(),
  /** 升级（LG-14）：升级 id → 只给哪个变体（不写 = 都行）、对各状态的加成 */
  upgrades: z
    .record(id, z.strictObject({ variant: id.optional(), states: z.record(id, facilityStateAdd).optional() }))
    .optional(),
});
export type Facility = z.infer<typeof facility>;

/**
 * 人物的作用（docs/design/people.md）：coach 教练（上课、学院，招来接任主教练）、crew 维护工（修和维护设施）、
 * special 特殊作用人物（穿线师、体能师、球童、前台……靠特质解锁自己的岗位）、
 * player 球员（训练、出去打比赛、赢了带来名气）。
 */
export const PERSON_KINDS = ['coach', 'crew', 'special', 'player'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

/** 每项能力一个数（0..100），都可以不写 */
const skillCaps = z.strictObject({
  teach: z.number().min(0).max(100).optional(),
  upkeep: z.number().min(0).max(100).optional(),
  service: z.number().min(0).max(100).optional(),
  play: z.number().min(0).max(100).optional(),
});

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
  /**
   * 潜力（W3 员工成长）：每项能力干活能涨到多少。不写的项 = 起始值 + growth.headroom（默认 15），
   * 带 growth.traits 里的特质再加（"大器晚成" late_bloomer 默认 +10，即起始值 +25）；都截在 100。总监不看潜力（director_skill_cap）。
   */
  potential: skillCaps.optional(),
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
  /**
   * 场地可用度（court-care-contract.md）：每圈把这块场每种脏乱清掉 care × (0.5 + worker.skill / 100)（绝对量，0..1）。
   * 写了 care 的岗位在"不能打"的场上照样转圈；没写的（看场、上课）停转
   */
  care: z.number().min(0).max(1).optional(),
  /** 只收这些人：作用（kind）或特质 id，命中一个就行；不写谁都能干 */
  only: z.array(id).min(1).optional(),
  /** 能力门槛（W3，和工单的 worker 一样）：只有这项能力（底子，不算特质）≥ N 的人能坐，例如 { teach: 60 }。canAssign 给 'skill' */
  worker: skillCaps.optional(),
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
  /**
   * 能力门槛（LG-14）：只有这项能力（底子，不算特质）≥ N 的人能干，例如 { upkeep: 75 }。canAssign 给 'skill'。
   */
  worker: z
    .strictObject({
      teach: z.number().optional(),
      upkeep: z.number().optional(),
      service: z.number().optional(),
      play: z.number().optional(),
    })
    .optional(),
  /**
   * 修复变体（LG-14）：这张工单修这个地点的设施，可以修成哪几个变体（设施 variants 里的 id）。
   * 每个变体可以另写材料费、工作量和追加的效果（加在 effects 后面）。第一个人到场、扣材料费时锁定变体。
   */
  variants: z
    .record(
      id,
      z.strictObject({
        cost: z.number().min(0).optional(),
        work: duration.optional(),
        effects: z.array(effect).optional(),
        /** 这个变体什么时候能选（例如按选的路先开）；不满足时这一行不能拖（canAssign 给 'variant'） */
        when: cond.optional(),
      }),
    )
    .optional(),
  /** 升级工单（LG-14）：做完给这个地点的设施装上这个升级（设施 upgrades 里的 id）；装过了就不再出现 */
  upgrade: id.optional(),
  /**
   * 改造工单（LG-14）：做完以后这个地点的设施停用 closed_for 这么久，然后换成这个变体。
   * 已经是这个变体、还没选过变体、或者正在改造时不出现。
   */
  remodel: id.optional(),
  closed_for: duration.optional(),
  /**
   * 至少几个人到场才开工（W2：★3 起地区赛的双打要两名球员）：数或表达式。人不够时不扣材料费、不走进度。
   */
  min_crew: amount.optional(),
  /**
   * 分期筹备（W2：表演赛四期）：这张工单是哪一组的一期。同一组的工单各做一次；
   * 变量 prep.<组> = 做完的比例 0..1，条件 { prep: <组> } = 都做完了。
   */
  prep: id.optional(),
  /**
   * 打扫工单（court-care-contract.md）：这个地点的场地（rules.care.courts 里的设施）可用度低于 rules.care.order_below
   * 时冒出来（开了工就一直在，做完为止；不用写 when）。按进度一点点清：做满 work 时每种脏乱清掉开工那一刻的 clean 成
   */
  care: z.strictObject({ clean: z.number().min(0).max(1) }).optional(),
});
export type Order = z.infer<typeof order>;

/* ---------------- 赛事日历（LG-11） ---------------- */

/** 附加目标：赛事结束时判定。if 和 chance 是表达式，可以用 event.* 变量（这一场的服务率、临时岗位到岗率……） */
export const tournamentGoal = z.strictObject({
  id,
  if: z.string().optional(),
  chance: amount.optional(),
  reward: z.array(effect).default([]),
});
export type TournamentGoal = z.infer<typeof tournamentGoal>;

export const WEEKDAY = z.number().int().min(0).max(6);

/**
 * 地图日历上的一项赛事（LG-11）。日期 = 第几周（weeks，或 every 每隔几周）的星期几（days，0 = 周一），时段 hours。
 * - 主办（host）：报名工单 order 提前 lead 出现在 at 的地点牌上，做完就算接下；到日子开出临时岗位 posts，
 *   closes 里的岗位当天整天不开；当天下雨（rain_spoils，主办默认是）报名费白花、什么都没有。
 * - 外出（away）：工单 order 提前 lead 出现，但要到比赛那天才能开工；做完就判定。
 * 结束时给 reward，再逐个判定附加目标 goals。第二次起奖励按 repeat.scale 打折、目标换成 repeat.goals。
 */
export const tournament = z.strictObject({
  id,
  kind: z.enum(['host', 'away']),
  at: id,
  weeks: z.array(z.number().int().min(1)).optional(),
  every: z
    .strictObject({ weeks: z.number().int().min(1), from: z.number().int().min(1), until: z.number().int().optional() })
    .optional(),
  days: z.array(WEEKDAY).min(1).default([5]),
  hours: z.tuple([z.number().min(0).max(24), z.number().min(0).max(24)]).default([9, 17]),
  /** 参赛条件（星级、设施……）：报名工单出现、开工都要满足 */
  when: cond.optional(),
  /** 报名费：就是报名工单的材料费（开工时扣） */
  fee: z.number().min(0).default(0),
  order: id,
  /** 报名工单提前多久出现 */
  lead: duration.default('7d'),
  posts: z.array(id).default([]),
  closes: z.array(id).default([]),
  rain_spoils: z.boolean().optional(),
  /** 认场地：这场赛事按这处设施的变体叫不同的名字（文案 tournaments.<id>.variants.<变体>），奖励在效果的 if 里分 */
  variant_of: id.optional(),
  reward: z.array(effect).default([]),
  goals: z.array(tournamentGoal).default([]),
  repeat: z
    .strictObject({ scale: z.number().min(0).max(1).default(0.5), goals: z.array(tournamentGoal).optional() })
    .default({ scale: 0.5 }),
});
export type Tournament = z.infer<typeof tournament>;

/* ---------------- 员工成长（W3，LG-12） ---------------- */

/** 成长解锁的一条要求：一个在职的人（who 写了就只看这个作用或特质的人）这项能力的底子 ≥ gte */
export const growthNeed = z.strictObject({
  skill: z.enum(SKILLS),
  gte: z.number().min(0).max(100),
  who: id.optional(),
});

/**
 * 成长解锁：need 的每一条由不同的人满足（"教练 + 体能师都 ≥ 60"写两条），when 也满足时开出来——
 * 一局只开一次，发 unlock {person, key}，写一条因果日志，执行 effects（person: worker = 开出它的那个人）。
 * 内容用条件 { unlocked: key }、变量 unlocked.<key> 去开工单、岗位、变体。文案 unlocks.<key>。
 */
export const growthUnlock = z.strictObject({
  key: id,
  need: z.array(growthNeed).min(1),
  when: cond.optional(),
  effects: z.array(effect).default([]),
});
export type GrowthUnlock = z.infer<typeof growthUnlock>;

export const growth = z.strictObject({
  /** 总开关；关着时能力不涨（总监照旧）、不发 skill_up、不开解锁 */
  enabled: z.boolean().default(false),
  /** 每干完一圈岗位或一张工单，那项能力涨多少（不超过潜力） */
  rate: z.number().min(0).default(0.2),
  /** 分项涨幅：写了的能力用它，不写的用 rate（例如 { upkeep: 0.3, teach: 0.15 }） */
  rates: z
    .strictObject({
      teach: z.number().min(0).optional(),
      upkeep: z.number().min(0).optional(),
      service: z.number().min(0).optional(),
      play: z.number().min(0).optional(),
    })
    .optional(),
  /** 默认潜力 = 起始值 + headroom */
  headroom: z.number().min(0).default(15),
  /** 带这些特质的人潜力再加多少（默认大器晚成 +10） */
  traits: z.record(id, z.number()).default({ late_bloomer: 10 }),
  /**
   * 哪些能力按干活涨。默认不含球技：球员的球技靠训练岗位的效果涨（person: worker add play），
   * 打开成长后那份涨幅也截在潜力上，不再另加 rate（不重复算）
   */
  skills: z.array(z.enum(SKILLS)).default(['teach', 'upkeep', 'service']),
  /** 跨过 step 的整数倍、或者某条解锁的 gte 时发 skill_up */
  step: z.number().positive().default(5),
  unlocks: z.array(growthUnlock).default([]),
});
export type Growth = z.infer<typeof growth>;

/* ---------------- 结局（W4，LG-13） ---------------- */

/** 评语档：S/A/B/C/D（文案 ending.grades.<档>） */
export const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
export type Grade = (typeof GRADES)[number];

/** 分项的初值（wave2-5-contract.md W4）：分 = floor(of × per)；文案 ending.items.<项> */
export const DEFAULT_SCORE: Record<string, { of: string; per: number }> = {
  stars: { of: 'stars', per: 1000 },
  trophies: { of: 'trophies', per: 300 },
  members: { of: 'stat.members', per: 10 },
  reputation: { of: 'stat.reputation', per: 10 },
  exhibition: { of: 'ending.exhibition', per: 2000 },
  early: { of: 'ending.exhibition * ending.days_early', per: 50 },
  cash: { of: 'stat.cash', per: 0.1 },
};

/** 评语档的初值（机器人校准，见 docs/balance）：从上往下第一个 total ≥ gte 的档；都不够是最后一档 */
export const DEFAULT_GRADES: { grade: Grade; gte: number }[] = [
  { grade: 'S', gte: 12500 },
  { grade: 'A', gte: 10000 },
  { grade: 'B', gte: 7000 },
  { grade: 'C', gte: 4000 },
  { grade: 'D', gte: 0 },
];

/**
 * 结局方案 A（W4）：地图写了 ending 才打开，不写 = 以前的行为（表演赛通关、第 112 天输）。
 * - 第 day 天 hour 点结算打分（settlement），不判输；破产（rules.lose_if）照旧结束。
 * - exhibition 第一次满足（表演赛办成，★5）而且还没到 day：记下来，打开 card（结局卡：马上结算 { settle: true }，
 *   或者接着经营到 day）。这时效果 endAct: won 不再结束这一局。
 * - score：分项（文案 ending.items.<项>），分 = floor(of × per)；grades：评语档（文案 ending.grades.<档>）。
 * - season2：结算以后命令 startSeason2 开第二季：会所照旧，时钟回到 start，目标 goal（文案 ending.goals.<目标>，占位）。
 */
export const ending = z.strictObject({
  mode: z.literal('score'),
  day: z.number().int().min(1).default(112),
  hour: z.number().min(0).max(24).default(18),
  exhibition: cond.default({ flag: 'exhibition_done' }),
  card: id.optional(),
  score: z.record(id, z.strictObject({ of: z.string(), per: z.number() })).default(DEFAULT_SCORE),
  grades: z
    .array(z.strictObject({ grade: z.enum(GRADES), gte: z.number() }))
    .min(1)
    .default(DEFAULT_GRADES),
  season2: z
    .strictObject({
      goal: id.default('official_tournament'),
      /** 第二季从哪一天几点开始（不写 = 第 1 天、地图的开门时间） */
      start: z.strictObject({ day: z.number().int().min(1), hour: z.number().min(0).max(24) }).optional(),
      /** 第二季一开始打开的卡 */
      start_cards: z.array(id).default([]),
    })
    .default({ goal: 'official_tournament', start_cards: [] }),
});
export type Ending = z.infer<typeof ending>;

/* ---------------- 地块（W5，LG-15，ADR 0021） ---------------- */

export const PLOT_STATES = ['locked', 'building', 'open'] as const;
export type PlotPhase = (typeof PLOT_STATES)[number];

/**
 * 地块的一个变体（= 一条路）：新锚点、3–5 张清理工单（做完最后一张就开地）、开工时和开地时的效果、
 * 开地以后才有的岗位和工单（不用再写 when）。
 */
export const plotVariant = z.strictObject({
  /** 新锚点：一直在内容的 anchors 和 nav 里（导航只加不挪），地块没开时这里的岗位不开、工单不出现 */
  anchor: id,
  /** 清理工单：开工时一起冒出来（隐含 once），都做完就开地 */
  orders: z.array(id).min(1),
  /** 开工时执行一次 */
  start: z.array(effect).default([]),
  opens: z
    .strictObject({
      /** 开地以后才存在的岗位和工单（隐含"这块地按这个变体开了"） */
      posts: z.array(id).default([]),
      orders: z.array(id).default([]),
      /** 开地时执行一次 */
      effects: z.array(effect).default([]),
    })
    .default({ posts: [], orders: [], effects: [] }),
});
export type PlotVariant = z.infer<typeof plotVariant>;

export const plot = z.strictObject({
  id,
  /** 哪一处选路决定它（s3 / s4）：选了哪条路就按同名的变体开工 */
  route: id,
  /**
   * 第几季开：1 = 第一季选路时开工；2 = 开第二季时，按第一季没选的路（ending.land）里第一个有变体的开工
   */
  season: z.union([z.literal(1), z.literal(2)]).default(1),
  /** 接下的主办赛事的比赛日，工地停工（清理工单不走进度） */
  pause_on_events: z.boolean().default(true),
  variants: z.record(id, plotVariant),
});
export type Plot = z.infer<typeof plot>;

/* ---------------- 场地可用度（court-care-contract.md，ADR 0022） ---------------- */

/**
 * 场地可用度的规则（act.rules.care）：不写 = 没有这个机制（和以前一样）。数值的初值和意义见 court-care-contract.md。
 * - courts：哪些设施是球场、什么面（variants：修成某个变体以后换成什么面）。
 * - 可用度 = clamp(100 − 100 × Σ weights[面][k] × mess[k], 0, 100)；≥ ok_at 能打，< no_below 不能打，中间勉强。
 * - weather：营业时间里每小时各项的增减（负数 = 自己变干净，例如晒干积水），再乘 surface[面][k]（不写是 1）。
 * - use：每有一个"在用这块场"的岗位在干活（不是打扫岗位），每小时各项加多少。
 */
export const careRules = z.strictObject({
  courts: z.record(
    id,
    z.strictObject({ surface: z.enum(SURFACES), variants: z.record(id, z.enum(SURFACES)).default({}) }),
  ),
  ok_at: z.number().min(0).max(100).default(70),
  no_below: z.number().min(0).max(100).default(40),
  weights: z.partialRecord(z.enum(SURFACES), messAmounts).default({}),
  weather: z.partialRecord(z.enum(WEATHERS), messAmounts).default({}),
  surface: z.partialRecord(z.enum(SURFACES), messAmounts).default({}),
  use: messAmounts.default({}),
  /** 打扫工单在可用度低于它时冒出来 */
  order_below: z.number().min(0).max(100).default(85),
  /** 勉强能打时，有需求的岗位有人在岗的一分钟只算这么多"服务到" */
  meh_service: z.number().min(0).max(1).default(0.6),
  /** 不能打时会员在门口等多久就走一个（之后下一个接着等） */
  patience: duration.default('90m'),
  /** 一块场一天最多走掉几个 */
  walkout_max_day: z.number().int().min(0).default(3),
  /** 每个被挡住的有需求岗位有几个会员在门口等；门口最多几个 */
  waiting_per_post: z.number().int().min(0).default(2),
  waiting_max: z.number().int().min(0).default(6),
  /** 勉强能打、有人在打时，隔多久有人抱怨一次（只是画面和快讯） */
  grumble_every: duration.default('2h'),
  /**
   * 亲手扫（总监的小游戏）：总监离岗的分钟 = (base + Σ per[k] × 开始时的 mess[k] × 清掉的比例[k]) ÷ (0.5 + 总监维护 / 100)
   * × (1 + 0.5 × (场地数 − 1))，截在 [min, max]，再加上走过去的分钟
   */
  hand: z
    .strictObject({
      base: z.number().min(0).default(15),
      per: messAmounts.default({}),
      min: z.number().min(0).default(10),
      max: z.number().min(0).default(240),
    })
    .default({ base: 15, per: {}, min: 10, max: 240 }),
});
export type CareRules = z.infer<typeof careRules>;

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
    /**
     * 质量的目标：一个表达式，或者拆成几项（值 = 各项之和，文案在 ui.terms.<名字>）。
     * 拆开写，结算才能讲清楚质量为什么涨、为什么掉（GM-1）。
     */
    quality_target: z.union([z.string(), z.record(id, z.string())]),
    /** 每天向目标靠近的比例 0..1 */
    quality_rate: z.number().min(0).max(1),
    /** 每天收盘的会员、声望变化（老写法；Indian Wells 用下面的 day） */
    member_drift: z.string().default('0'),
    reputation_drift: z.string().default('0'),
    /**
     * 每天收盘的每日结算（daily-settlement-contract.md，ADR 0024；代替原来的周结算 week）。表达式里 service_rate 是今天的服务率，
     * care.walkouts 是今天走掉的会员。今天没有需求（没有一个开着的有需求岗位）时声望、会员都不动（准则 6：没人就是零、不倒扣）。
     * reputation：拆成几项（文案 ui.terms.<名字>）；members：今天该来多少人（小数，零头留到明天），一个表达式或拆成几项；
     * member_cap：场地撑得起多少人（超出的不续）；member_loss_max：今天最多走掉多少（不影响涨）；service_pass：声望服务项的及格线。
     */
    day: z
      .strictObject({
        reputation: z.record(id, z.string()),
        members: z.union([z.string(), z.record(id, z.string())]),
        member_cap: z.string().optional(),
        member_loss_max: z.string().default('max(8, stat.members * 0.25) / 7'),
        service_pass: z.number().min(0).max(1).default(0.5),
      })
      .optional(),
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
    /**
     * 掉档阈值（准则 6"先出画面信号，再掉档"）：周日收盘时，状况低于它、而且当前状态写了 drops_to 的设施掉一档。
     * 0 = 不掉档。
     */
    grade_drop_below: z.number().min(0).max(100).default(0),
    /**
     * 有人守的地方维持住（准则 6）：今天有人在这处设施的任何一个岗位上干完过至少一圈，收盘衰减（decay_day）乘这个数。
     * 1 = 有人没人一样掉；0 = 有人守就不掉。岗位每圈的 wear 是使用磨损，照算不打折（在岗位 YAML 里调）。
     */
    staffed_decay: z.number().min(0).max(1).default(0.5),
    /** 场地可用度（court-care-contract.md）：不写 = 没有这个机制 */
    care: careRules.optional(),
  }),
  /**
   * 星级（LG-10，ADR 0020）：第 i 项是升到 ★(i+1) 的清单。requires 的每一条是一个条件（文案在 stars.items.<条 id>），
   * 全部满足就升星（只往上，不往回掉）；opens 是升上来开出的机制（文案在 stars.opens.<键>，内容里用 stars >= N 去开）。
   */
  stars: z
    .array(
      z.strictObject({
        requires: z.record(id, cond),
        opens: z.array(id).default([]),
        /** 升上这一星时打开的卡（W2 的选路卡：一天倒计时，不选按默认） */
        card: id.optional(),
      }),
    )
    .max(5)
    .optional(),
  /** 选路（W2）：处 → 可选的路（第一条是路 A，也是机器人和默认的选择）；文案 routes.<处>.<路> */
  routes: z.record(id, z.array(id).min(2)).optional(),
  /** 赛事日历（LG-11） */
  tournaments: z.array(tournament).optional(),
  /** 员工成长（W3，LG-12）：不写 = 关（和以前一样） */
  growth: growth.optional(),
  /** 结局方案 A（W4，LG-13）：不写 = 以前的行为 */
  ending: ending.optional(),
  /** 地块（W5，LG-15）：不写 = 地图不长大（和以前一样） */
  plots: z.array(plot).optional(),
  /** 每天固定开的活动（例如下午的青少年课） */
  daily: z.array(z.strictObject({ hour: z.number(), activity: id, if: cond.optional() })).default([]),
  /** 季节：从第几天开始（第一个从第 1 天开始）；decay 是这一季设施衰减的倍数（初秋落叶多） */
  seasons: z
    .array(z.strictObject({ id, from_day: z.number().int().min(1), decay: z.number().min(0).default(1) }))
    .default([]),
  /** 每个季节的天气权重（heat 酷热不写是 0） */
  weather: z
    .record(
      id,
      z.strictObject({
        sun: z.number(),
        cloud: z.number(),
        rain: z.number(),
        wind: z.number(),
        heat: z.number().optional(),
      }),
    )
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
