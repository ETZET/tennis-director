import type { Ctx } from './effects';
import type { DayReport, DayState, GameState, WeekReview } from './state';
import type { World } from './world';

/**
 * 每日结算（daily-settlement-contract.md，ADR 0024）：钱、声望、会员每天收盘按今天结算，写一条 daily 因果日志，
 * 出一份 DayReport（领域事件 daySettled），周日再把这一周的报告加起来讲（本周回顾，不改数）。
 *
 * Wave 0：只有 freshDay 是实现了的（newGame、读档迁移用）；其余是冻结的签名，代理 A 实现并接进 systems.ts 的 closeDay / openDay。
 */

/** 第 day 天开门时的空账：记下开门那一刻的现金、声望、会员、质量和每个在职的人的士气；昨天的服务率从 prev 带过来 */
export function freshDay(s: GameState, day: number, prev?: { last: number; lastDemand: number }): DayState {
  // 读旧档迁移时也用它：字段可能缺，按空的算
  const morale0: Record<string, number> = {};
  for (const [id, p] of Object.entries(s.people ?? {})) if (p.hired) morale0[id] = p.morale;
  const log = s.log ?? [];
  const stats = s.stats ?? {};
  return {
    day,
    log0: (log[log.length - 1]?.id ?? -1) + 1,
    demand: 0,
    served: 0,
    missed: {},
    unplayable: {},
    walkouts: {},
    last: prev?.last ?? 0,
    lastDemand: prev?.lastDemand ?? 0,
    traitRep: 0,
    materials: {},
    cash0: stats.cash ?? 0,
    reputation0: stats.reputation ?? 0,
    members0: stats.members ?? 0,
    quality0: stats.quality ?? 0,
    morale0,
    work: {},
    idle: {},
  };
}

/** 今天的服务率：今天有需求用今天的，没有用昨天的，昨天也没有是 0（变量 service_rate） */
export function todayRate(s: GameState): number {
  const d = s.today;
  if (d.demand > 0) return d.served / d.demand;
  return d.lastDemand > 0 ? d.last : 0;
}

/** 今天（或者昨天）有没有需求（变量 service_demand） */
export const todayHasDemand = (s: GameState): boolean => s.today.demand > 0 || s.today.lastDemand > 0;

/** 今天走掉的会员一共几个（变量 care.walkouts） */
export const todayWalkouts = (s: GameState): number => Object.values(s.today.walkouts).reduce((a, b) => a + b, 0);

/**
 * 收盘结算今天（代理 A 实现）：声望、会员按 rules.day 结算（今天没有需求就都不动），会员按零头 memberCarry 取整，
 * 写一条 daily 因果日志；然后把今天卷进本周的账。在 closeDay 里特质之后、周日的 settleWeek 之前调。
 */
export function settleDay(_ctx: Ctx, _day: number): void {
  // Wave 0 桩：还是周结算（week.ts）在改数
}

/**
 * 收盘时抽明天的天气（代理 A 实现）：用 weightedPick，季节按明天算；存进 s.forecast = { day: day + 1, weather }。
 * 要在 closeDay 的最后（lose_if 之后）调，这样随机数消耗的顺序和以前在 openDay 里抽一样。
 */
export function forecastWeather(_ctx: Ctx, _day: number): void {
  // Wave 0 桩：天气照旧在 openDay 里抽
}

/** 收盘以后出今天的报告（代理 A 实现；不消耗随机数、不改状态，只读）。周日带上 weekReview */
export function buildDayReport(s: GameState, _w: World, day: number): DayReport {
  // Wave 0 桩：结构对、数是空的，给界面造假数据时参考
  const t = s.today;
  const cash = Math.round(s.stats.cash ?? 0);
  return {
    day,
    week: Math.ceil(day / 7),
    weekday: (day - 1) % 7,
    season: s.season,
    weather: s.weather,
    money: { lines: [], total: Math.round((s.stats.cash ?? 0) - t.cash0), cash, vsYesterday: null },
    service: {
      demand: t.demand,
      served: t.served,
      rate: t.demand > 0 ? t.served / t.demand : null,
      pass: 0.5,
      vsYesterday: null,
      missed: null,
      unplayable: null,
      walkouts: todayWalkouts(s),
      walkoutsBy: {},
    },
    reputation: {
      before: t.reputation0,
      after: s.stats.reputation ?? 0,
      delta: (s.stats.reputation ?? 0) - t.reputation0,
      terms: {},
      skipped: t.demand === 0,
    },
    members: {
      before: t.members0,
      after: s.stats.members ?? 0,
      delta: (s.stats.members ?? 0) - t.members0,
      gain: 0,
      terms: {},
      carry: s.memberCarry,
      cap: null,
      capped: false,
      lossMax: null,
      limited: false,
      skipped: t.demand === 0,
    },
    quality: { before: t.quality0, after: s.stats.quality ?? 0, target: s.stats.quality ?? 0 },
    people: { top: [], idle: [], morale: [] },
    tomorrow: {
      day: day + 1,
      weekday: day % 7,
      season: s.season,
      seasonStarts: false,
      weather: s.forecast?.weather ?? s.weather,
      dirty: [],
      calendar: [],
      daysLeft: null,
    },
    review: (day - 1) % 7 === 6 ? weekReview(s, Math.ceil(day / 7)) : null,
  };
}

/** 本周回顾（代理 A 实现）：把 s.days 里第 week 周的报告加起来；一天都没有是 null */
export function weekReview(_s: GameState, _week: number): WeekReview | null {
  return null;
}
