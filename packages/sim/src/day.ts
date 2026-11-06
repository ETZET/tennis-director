import { MESS_KINDS, type MessKind, type Weather } from '@td/content';
import { applyEffects, type Ctx, logEntry } from './effects';
import { careCourts, levelFrom, messOf, surfaceOf, usabilityFrom } from './mess';
import { weightedPick } from './rng';
import {
  at,
  type CareLevel,
  type CausalEntry,
  type DayCalendarItem,
  type DayMoneyKind,
  type DayMoneyLine,
  type DayPerson,
  type DayReport,
  type DaySettlement,
  type DayState,
  type DayTomorrow,
  DIRECTOR,
  dayOf,
  type EffectRecord,
  type GameState,
  type WeekReview,
} from './state';
import { tournamentStatus } from './tournaments';
import { careActive, hasDemand, isStaff, num, qualityTarget, servicePass, serviceRate, walkoutsToday } from './vars';
import type { World } from './world';

/**
 * 每日结算（daily-settlement-contract.md，ADR 0024）：钱、声望、会员每天收盘按今天结算，写一条 daily 因果日志，
 * 出一份 DayReport（领域事件 daySettled），周日再把这一周的报告加起来讲（本周回顾，不改数）。
 * systems.ts 的 closeDay 依次调 settleDay、（周日）settleWeek、forecastWeather、buildDayReport；openDay 开头 freshDay。
 */

const round2 = (x: number) => Math.round(x * 100) / 100 || 0; // -0 统一成 0

/** 第 day 天属于哪个季节（幕里的 seasons；没有季节时返回 ''） */
export function seasonOn(w: World, day: number): string {
  let id = '';
  for (const x of w.act.seasons) if (day >= x.from_day) id = x.id;
  return id;
}

/** 天气抽签的权重表（heat 排在最后、默认权重 0：没写酷热的季节抽出来的天气和以前一样） */
export function weatherWeights(weights: Partial<Record<Weather, number>>): { item: Weather; weight: number }[] {
  return (['sun', 'cloud', 'rain', 'wind', 'heat'] as const).map((k) => ({ item: k, weight: weights[k] ?? 0 }));
}

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

/** 今天的服务率：今天有需求用今天的，没有用昨天的，昨天也没有是 0（变量 service_rate；同 vars.ts 的 serviceRate） */
export function todayRate(s: GameState): number {
  return serviceRate(s);
}

/** 今天（或者昨天）有没有需求（变量 service_demand） */
export const todayHasDemand = (s: GameState): boolean => hasDemand(s);

/** 今天走掉的会员一共几个（变量 care.walkouts） */
export const todayWalkouts = (s: GameState): number => walkoutsToday(s);

/** 缺人最多的岗位（同分取 id 小的；没有是 null） */
function topMissed(missed: Record<string, number>): { post: string; minutes: number } | null {
  let top: { post: string; minutes: number } | null = null;
  for (const [post, minutes] of Object.entries(missed))
    if (minutes > 0 && (!top || minutes > top.minutes || (minutes === top.minutes && post < top.post)))
      top = { post, minutes };
  return top;
}

/** 不能打挡掉分钟最多的那块场（按岗位所在的设施合计；同分取 id 小的；没有是 null） */
function topUnplayable(w: World, unplayable: Record<string, number>): { court: string; minutes: number } | null {
  const byCourt: Record<string, number> = {};
  for (const [post, m] of Object.entries(unplayable)) {
    const f = w.facilityAt.get(w.posts.get(post)?.at ?? '');
    if (f && m > 0) byCourt[f] = (byCourt[f] ?? 0) + m;
  }
  let top: { court: string; minutes: number } | null = null;
  for (const [court, minutes] of Object.entries(byCourt))
    if (!top || minutes > top.minutes || (minutes === top.minutes && court < top.court)) top = { court, minutes };
  return top;
}

const addTo = (into: Record<string, number>, from: Record<string, number>) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
};

/**
 * 收盘结算今天：声望、会员按 rules.day 结算（今天没有需求就都不动），会员按零头 memberCarry 取整，
 * 写一条 daily 因果日志；然后把今天卷进本周的账。在 closeDay 里特质之后、周日的 settleWeek 之前调。
 */
export function settleDay(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const t = s.today;
  const rules = w.act.rules.day;
  const skipped = t.demand <= 0;
  const extra = { service_rate: skipped ? 0 : t.served / t.demand, service_demand: 1 };
  const rep: Record<string, number> = {};
  const terms: Record<string, number> = {};
  let repTotal = 0;
  let gain = 0;
  let cap: number | null = null;
  let lossMax: number | null = null;
  let capped = false;
  let limited = false;
  let dm = 0;
  let carry = s.memberCarry ?? 0;
  if (!skipped) {
    // 先把各项都算完再改数：会员的 growth 读的是结算前的声望
    if (rules) {
      for (const [k, src] of Object.entries(rules.reputation)) {
        const v = num(s, w, src, extra);
        rep[k] = v;
        repTotal += v;
      }
      const members = typeof rules.members === 'string' ? { total: rules.members } : rules.members;
      for (const [k, src] of Object.entries(members)) {
        const v = num(s, w, src, extra);
        terms[k] = v;
        gain += v;
      }
      if (rules.member_cap !== undefined) cap = Math.round(num(s, w, rules.member_cap, extra));
      lossMax = Math.max(0, num(s, w, rules.member_loss_max, extra));
    }
    if (t.traitRep) {
      rep.traits = t.traitRep;
      repTotal += t.traitRep;
    }
    const members = s.stats.members ?? 0;
    let acc = carry + gain;
    // 超出上限的会员不续了（可以是负数；到了上限不攒零头）；一天最多走掉 member_loss_max 个（不一次崩掉）
    if (cap !== null && acc > cap - members) {
      acc = cap - members;
      capped = true;
    }
    if (lossMax !== null && acc < -lossMax) {
      acc = -lossMax;
      limited = true;
    }
    dm = Math.trunc(acc) || 0;
    carry = acc - dm;
  }
  const book = t.book ?? { dues: 0, wages: 0, facilities: {} };
  let income = 0;
  let upkeep = 0;
  for (const f of Object.values(book.facilities)) {
    income += f.income;
    upkeep += f.upkeep;
  }
  const careOn = !!w.act.rules.care;
  const round = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round2(v)]));
  const settlement: DaySettlement = {
    day,
    demand: t.demand,
    served: t.served,
    pass: servicePass(w),
    missed: topMissed(t.missed),
    money: {
      dues: Math.round(book.dues),
      income: Math.round(income),
      upkeep: Math.round(upkeep),
      wages: Math.round(book.wages),
    },
    rep: round(rep),
    members: {
      gain: round2(gain),
      cap,
      carry: round2(carry),
      ...(limited && lossMax !== null ? { loss_max: round2(lossMax) } : {}),
      terms: round(terms),
      capped,
      delta: dm,
    },
    ...(skipped ? { skipped: true } : {}),
    ...(careOn ? { walkouts: walkoutsToday(s), unplayable: topUnplayable(w, t.unplayable) } : {}),
  };
  const out: EffectRecord[] = [];
  const entry = logEntry(ctx, { kind: 'daily', ...settlement }, null, out);
  // 现金收盘时已经记过了（bookDay），这里只把今天的流水讲出来
  const cash = Math.round(book.dues + income - upkeep - book.wages);
  if (cash) out.push({ kind: 'stat', stat: 'cash', delta: cash });
  if (!skipped) {
    const before = s.stats.members ?? 0;
    applyEffects(
      ctx,
      [
        { stat: 'members', add: dm },
        { stat: 'reputation', add: repTotal },
      ],
      entry.id,
      out,
    );
    // 被会员的范围截住了（0..500）：零头不留
    const real = (s.stats.members ?? 0) - before;
    if (real !== dm) {
      carry = 0;
      dm = real;
      const m = (entry.cause as { members: DaySettlement['members'] }).members;
      m.carry = 0;
      m.delta = real;
    }
    s.memberCarry = carry;
  }
  // 卷进本周的账（周日的本周回顾只是把它讲出来）
  const wk = s.week;
  wk.demand += t.demand;
  wk.served += t.served;
  addTo(wk.missed, t.missed);
  addTo((wk.unplayable ??= {}), t.unplayable);
  wk.walkouts = (wk.walkouts ?? 0) + walkoutsToday(s);
  wk.money.dues += book.dues;
  wk.money.income += income;
  wk.money.upkeep += upkeep;
  wk.money.wages += book.wages;
  if (!skipped) {
    wk.traitRep += t.traitRep;
    addTo((wk.rep ??= {}), rep);
    wk.members = (wk.members ?? 0) + dm;
  }
}

/**
 * 收盘时抽明天的天气：用 weightedPick，季节按明天算；存进 s.forecast = { day: day + 1, weather }。
 * 在 closeDay 的最后（lose_if 之后）调，这样随机数消耗的顺序和以前在 openDay 里抽一样。
 */
export function forecastWeather(ctx: Ctx, day: number): void {
  const { s, w } = ctx;
  const weights = w.act.weather[seasonOn(w, day + 1)];
  if (!weights) {
    s.forecast = null;
    return;
  }
  s.forecast = { day: day + 1, weather: weightedPick(s, weatherWeights(weights)) ?? s.weather };
}

/** 今天（log0 起）的因果日志 */
function todayLog(s: GameState): CausalEntry[] {
  const out: CausalEntry[] = [];
  const log0 = s.today.log0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i] as CausalEntry;
    if (e.id < log0) break;
    out.push(e);
  }
  return out.reverse();
}

const cashOf = (e: CausalEntry): number => {
  let v = 0;
  for (const r of e.effects) {
    if (r.kind === 'stat' && r.stat === 'cash') v += r.delta;
    else if (r.kind === 'cost') v -= r.amount;
  }
  return v;
};

/** 钱的行排序：收入从大到小，花销从小到大（绝对值大的在前），other 最后 */
function sortLines(lines: DayMoneyLine[]): DayMoneyLine[] {
  const rank = (l: DayMoneyLine) => (l.kind === 'other' ? 2 : l.amount > 0 ? 0 : 1);
  return lines.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? b.amount - a.amount : a.amount - b.amount) ||
      a.kind.localeCompare(b.kind) ||
      (a.id ?? '').localeCompare(b.id ?? ''),
  );
}

function moneyLines(s: GameState, total: number): DayMoneyLine[] {
  const t = s.today;
  const raw: { kind: DayMoneyKind; id: string | null; amount: number }[] = [];
  const push = (kind: DayMoneyKind, id: string | null, amount: number) => {
    const x = raw.find((l) => l.kind === kind && l.id === id);
    if (x) x.amount += amount;
    else raw.push({ kind, id, amount });
  };
  const book = t.book;
  if (book) {
    push('dues', null, book.dues);
    for (const [f, m] of Object.entries(book.facilities)) {
      if (m.income) push('facility', f, m.income);
      if (m.upkeep) push('upkeep', f, -m.upkeep);
    }
    push('wages', null, -book.wages);
  }
  for (const [o, c] of Object.entries(t.materials)) push('materials', o, -c);
  for (const e of todayLog(s)) {
    const c = e.cause;
    const v = cashOf(e);
    if (!v) continue;
    if (c.kind === 'post') push('post', c.post, v);
    else if (c.kind === 'option' || c.kind === 'default') push('card', c.card, v);
    else if (c.kind === 'tournament') push('event', c.tournament, v);
  }
  const lines: DayMoneyLine[] = [];
  let sum = 0;
  for (const l of raw) {
    const amount = Math.round(l.amount) || 0;
    if (!amount) continue;
    lines.push({ kind: l.kind, id: l.id, amount });
    sum += amount;
  }
  const other = total - sum;
  if (Math.abs(other) >= 2) lines.push({ kind: 'other', id: null, amount: other });
  return sortLines(lines);
}

/** 今天的人（结算卡）：干得最多、一直闲着、士气在掉 */
function dayPeople(s: GameState, w: World): DayReport['people'] {
  const t = s.today;
  const all: DayPerson[] = [];
  for (const id of Object.keys(s.people)) {
    if (!isStaff(s, w, id)) continue;
    const p = s.people[id];
    if (!p) continue;
    all.push({
      id,
      work: t.work[id] ?? 0,
      idle: t.idle[id] ?? 0,
      morale: p.morale,
      morale0: t.morale0[id] ?? p.morale,
    });
  }
  const byId = (a: DayPerson, b: DayPerson) => a.id.localeCompare(b.id);
  return {
    top: all
      .filter((p) => p.work >= 120)
      .sort((a, b) => b.work - a.work || byId(a, b))
      .slice(0, 3),
    idle: all
      .filter((p) => p.idle >= 240)
      .sort((a, b) => b.idle - a.idle || byId(a, b))
      .slice(0, 3),
    morale: all
      .filter((p) => p.id !== DIRECTOR && t.morale0[p.id] !== undefined && p.morale <= p.morale0 - 1)
      .sort((a, b) => a.morale - a.morale0 - (b.morale - b.morale0) || byId(a, b))
      .slice(0, 3),
  };
}

const LEVEL_RANK: Record<CareLevel, number> = { ok: 0, meh: 1, no: 2 };

/** 明天没人扫就会变差的球场：按明天的天气和此刻的使用估一整天的营业时间 */
function dirtyTomorrow(s: GameState, w: World, weather: Weather): DayTomorrow['dirty'] {
  const rules = w.act.rules.care;
  if (!rules) return [];
  const hours = w.act.hours.close - w.act.hours.open;
  const wt = rules.weather[weather] ?? {};
  const out: DayTomorrow['dirty'] = [];
  for (const f of careCourts(w)) {
    if (!careActive(s, w, f)) continue;
    const surface = surfaceOf(s, w, f);
    if (!surface) continue;
    const anchor = w.facilities.get(f)?.anchor ?? f;
    const posts = w.postsAt.get(anchor) ?? [];
    const staffed = new Set<string>();
    for (const p of Object.values(s.people)) if (p.hired && p.job) staffed.add(p.job);
    if (posts.some((p) => p.care !== undefined && staffed.has(p.id))) continue;
    let units = 0;
    for (const p of posts) if (p.care === undefined && staffed.has(p.id)) units += 1;
    const mult = rules.surface[surface] ?? {};
    const mess = messOf(s, f);
    const next = { ...mess };
    for (const k of MESS_KINDS)
      next[k] = Math.max(
        0,
        Math.min(1, mess[k] + ((wt[k] ?? 0) * (mult[k] ?? 1) + (rules.use[k] ?? 0) * units) * hours),
      );
    const now = levelFrom(w, usabilityFrom(w, surface, mess));
    const level = levelFrom(w, usabilityFrom(w, surface, next));
    if (LEVEL_RANK[level] <= LEVEL_RANK[now]) continue;
    const weights = rules.weights[surface] ?? {};
    let why: MessKind = MESS_KINDS[0] as MessKind;
    let best = Number.NEGATIVE_INFINITY;
    for (const k of MESS_KINDS) {
      const v = (weights[k] ?? 0) * (next[k] - mess[k]);
      if (v > best) {
        best = v;
        why = k;
      }
    }
    out.push({ court: f, level, now, why });
  }
  return out.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.court.localeCompare(b.court));
}

/** 明天日历上的事（和季节栏的节拍同一套规则，只看明天） */
function calendarTomorrow(s: GameState, w: World, d: number): DayCalendarItem[] {
  const items: { t: number; item: DayCalendarItem }[] = [];
  const season = s.ending?.season ?? 1;
  for (const ts of tournamentStatus(s, w)) {
    // 这一期已经在日志里结算过（下雨白办、办完了）就不算
    let settled = false;
    for (let i = s.log.length - 1; i >= 0; i--) {
      const e = s.log[i] as CausalEntry;
      if (e.t < ts.signup) break;
      if (e.cause.kind === 'tournament' && e.cause.tournament === ts.id) {
        settled = true;
        break;
      }
    }
    if (settled) continue;
    const tour = w.tournaments.get(ts.id);
    if ((ts.eligible || ts.entered) && ts.days.includes(d)) {
      const first = ts.days[0] === d;
      const start = first ? ts.start : at(d, tour?.hours[0] ?? w.act.hours.open);
      items.push({
        t: start,
        item: { kind: 'tournament', id: ts.id, at: ts.at, start, entered: ts.entered, first, signup: false },
      });
    } else if (ts.eligible && !ts.entered && dayOf(ts.signup) === d)
      items.push({
        t: ts.signup,
        item: {
          kind: 'tournament',
          id: ts.id,
          at: ts.at,
          start: ts.signup,
          entered: false,
          first: false,
          signup: true,
        },
      });
  }
  for (const x of s.cards.scheduled) {
    if (dayOf(x.at) !== d || w.cards.get(x.card)?.who !== 'applicants') continue;
    items.push({ t: x.at, item: { kind: 'hiring', card: x.card, at: x.at } });
  }
  const ending = w.act.ending;
  const settleAt = ending ? at(ending.day, ending.hour) : Number.POSITIVE_INFINITY;
  if (season === 1) {
    for (const x of w.act.calendar) {
      if (x.day !== d) continue;
      const t = at(x.day, x.hour);
      if (t >= settleAt) continue;
      items.push({ t, item: { kind: 'card', card: x.card, at: t } });
    }
    if (ending && ending.day === d) items.push({ t: settleAt, item: { kind: 'settle', at: settleAt } });
  }
  return items.sort((a, b) => a.t - b.t).map((x) => x.item);
}

/** 收盘以后出今天的报告（不消耗随机数、不改状态，只读）。周日带上本周回顾 */
export function buildDayReport(s: GameState, w: World, day: number): DayReport {
  const t = s.today;
  const cash = s.stats.cash ?? 0;
  const total = Math.round(cash - t.cash0) || 0;
  const yesterday = s.days?.find((r) => r.day === day - 1) ?? null;
  const entry = todayLog(s).find((e) => e.cause.kind === 'daily' && e.cause.day === day);
  const daily = entry?.cause.kind === 'daily' ? entry.cause : null;
  const skipped = daily ? !!daily.skipped : t.demand <= 0;
  const rate = t.demand > 0 ? t.served / t.demand : null;
  const walkoutsBy: Record<string, number> = {};
  for (const [f, n] of Object.entries(t.walkouts)) if (n > 0) walkoutsBy[f] = n;
  const reputation = s.stats.reputation ?? 0;
  const members = s.stats.members ?? 0;
  const tomorrowDay = day + 1;
  const season = seasonOn(w, tomorrowDay);
  const weather = s.forecast?.day === tomorrowDay ? s.forecast.weather : s.weather;
  const ending = w.act.ending;
  const season1 = (s.ending?.season ?? 1) === 1;
  const report: DayReport = {
    day,
    week: Math.ceil(day / 7),
    weekday: (day - 1) % 7,
    season: s.season,
    weather: s.weather,
    money: {
      lines: moneyLines(s, total),
      total,
      cash: Math.round(cash),
      vsYesterday: yesterday ? total - yesterday.money.total : null,
    },
    service: {
      demand: t.demand,
      served: t.served,
      rate,
      pass: servicePass(w),
      vsYesterday: rate !== null && yesterday?.service.rate != null ? rate - yesterday.service.rate : null,
      missed: topMissed(t.missed),
      unplayable: w.act.rules.care ? topUnplayable(w, t.unplayable) : null,
      walkouts: walkoutsToday(s),
      walkoutsBy,
    },
    reputation: {
      before: t.reputation0,
      after: reputation,
      delta: round2(reputation - t.reputation0),
      terms: skipped ? {} : { ...(daily?.rep ?? {}) },
      skipped,
    },
    members: {
      before: t.members0,
      after: members,
      delta: Math.round(members - t.members0) || 0,
      gain: daily?.members.gain ?? 0,
      terms: skipped ? {} : { ...(daily?.members.terms ?? {}) },
      carry: s.memberCarry ?? 0,
      cap: daily?.members.cap ?? null,
      capped: !!daily?.members.capped,
      lossMax: daily?.members.loss_max ?? null,
      limited: daily?.members.loss_max !== undefined,
      skipped,
    },
    quality: { before: t.quality0, after: s.stats.quality ?? 0, target: qualityTarget(s, w).total },
    people: dayPeople(s, w),
    tomorrow: {
      day: tomorrowDay,
      weekday: day % 7,
      season,
      seasonStarts: season !== s.season,
      weather,
      dirty: dirtyTomorrow(s, w, weather),
      calendar: calendarTomorrow(s, w, tomorrowDay),
      daysLeft: ending && season1 ? Math.max(0, ending.day - tomorrowDay) : null,
    },
    review: null,
  };
  if (report.weekday === 6)
    report.review = reviewOf([...(s.days ?? []).filter((r) => r.day !== day), report], report.week);
  return report;
}

/** 把这一周的几份报告加起来（只讲，不算任何数） */
function reviewOf(reports: readonly DayReport[], week: number): WeekReview | null {
  const xs = reports.filter((r) => r.week === week).sort((a, b) => a.day - b.day);
  const first = xs[0];
  const last = xs[xs.length - 1];
  if (!first || !last) return null;
  const merged: DayMoneyLine[] = [];
  let total = 0;
  let reputation = 0;
  let members = 0;
  let walkouts = 0;
  let demand = 0;
  let served = 0;
  let best: WeekReview['best'] = null;
  let worst: WeekReview['worst'] = null;
  for (const r of xs) {
    total += r.money.total;
    for (const l of r.money.lines) {
      const m = merged.find((x) => x.kind === l.kind && x.id === l.id);
      if (m) m.amount += l.amount;
      else merged.push({ ...l });
    }
    reputation += r.reputation.delta;
    members += r.members.delta;
    walkouts += r.service.walkouts;
    demand += r.service.demand;
    served += r.service.served;
    if (!best || r.money.total > best.money) best = { day: r.day, money: r.money.total };
    if (!worst || r.money.total < worst.money) worst = { day: r.day, money: r.money.total };
  }
  return {
    week,
    days: xs.map((r) => r.day),
    money: { total, lines: sortLines(merged.filter((l) => l.amount !== 0)) },
    reputation: round2(reputation),
    members,
    walkouts,
    service: { demand, served, rate: demand > 0 ? served / demand : null, trend: xs.map((r) => r.service.rate) },
    best,
    worst,
    quality: { before: first.quality.before, after: last.quality.after },
  };
}

/** 本周回顾：把 s.days 里第 week 周的报告加起来；一天都没有是 null */
export function weekReview(s: GameState, week: number): WeekReview | null {
  return reviewOf(s.days ?? [], week);
}
