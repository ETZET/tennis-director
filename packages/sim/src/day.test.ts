import { CONTENT } from '@td/content';
import { describe, expect, it } from 'vitest';
import { buildDayReport } from './day';
import { type Ctx, run } from './effects';
import type { SimEvent } from './events';
import { advance, newGame } from './game';
import { fromSave, toSave } from './save';
import { at, type CausalEntry, type DayReport, dayOf, type GameState, minuteOfDay, SAVE_VERSION } from './state';
import { settleWeek } from './week';
import { worldFor } from './world';

/** 每日结算（daily-settlement-contract.md，ADR 0024） */
const W = () => worldFor(CONTENT, 'indian_wells');
function quiet(s: GameState): GameState {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
}
/** 外场 1 已经能打，总监和 Dale 都站在外场 1；场地一直干净 */
function court1(seed = 9): GameState {
  const s = quiet(newGame(CONTENT, { seed }));
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 60;
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
  return s;
}
const tidy = (s: GameState) => {
  for (const c of Object.values(s.care)) c.mess = { sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 };
};
type Daily = CausalEntry & { cause: { kind: 'daily' } };
/** 走到今天收盘（跳到明早开门），返回今天的 daily 日志、报告和这一路的事件 */
function closeToday(
  s: GameState,
  before?: (s: GameState) => void,
): { daily: Daily; report: DayReport; ev: SimEvent[] } {
  const d = dayOf(s.t);
  const ev: SimEvent[] = [];
  while (dayOf(s.t) === d && minuteOfDay(s.t) < 20 * 60 - 1) {
    tidy(s);
    ev.push(...advance(s, CONTENT, [], 1).events);
  }
  before?.(s);
  while (dayOf(s.t) === d) ev.push(...advance(s, CONTENT, [], 1).events);
  const daily = s.log.find((e) => e.cause.kind === 'daily' && e.cause.day === d) as Daily;
  const settled = ev.find((e) => e.type === 'daySettled');
  if (!daily || settled?.type !== 'daySettled') throw new Error('no daily settlement');
  return { daily, report: settled.report, ev };
}
const statDelta = (e: CausalEntry, stat: string) =>
  (e.effects.find((x) => x.kind === 'stat' && x.stat === stat) as { delta: number } | undefined)?.delta ?? 0;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const assign = (person: string, target: string | null) => ({ type: 'assign', person, target }) as const;

describe('每日结算：声望、会员按今天算', () => {
  it('有客人的一天：声望按今天的服务率、质量、修复各项结算，会员按今天的 growth 和零头取整', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    const rep0 = s.stats.reputation ?? 0;
    const m0 = s.stats.members ?? 0;
    const { daily, report } = closeToday(s);
    const c = daily.cause;
    expect(c.demand).toBeGreaterThan(0);
    expect(c.skipped).toBeUndefined();
    const rate = c.served / c.demand;
    expect(c.rep.service).toBeCloseTo(((rate - 0.5) * 2) / 7, 2);
    expect(c.rep.restored).toBeCloseTo((1 * 0.15) / 7, 2);
    // 声望一天的变化 = 各项之和（没有卡）；会员 = 零头 + growth 朝 0 取整
    expect((s.stats.reputation ?? 0) - rep0).toBeCloseTo(sum(c.rep), 1);
    expect(statDelta(daily, 'reputation')).toBeCloseTo(sum(c.rep), 1);
    expect((s.stats.members ?? 0) - m0).toBe(Math.trunc(c.members.gain + 1e-9));
    expect(s.memberCarry).toBeCloseTo(c.members.gain - Math.trunc(c.members.gain + 1e-9), 1);
    expect(report.reputation).toMatchObject({ before: rep0, skipped: false });
    expect(report.reputation.delta).toBeCloseTo(sum(c.rep), 1);
    expect(report.members.terms).toEqual(c.members.terms);
    expect(report.service.rate).toBeCloseTo(rate, 6);
  });

  it('没有需求的一天（开局没有一个开着的岗位）：声望、会员、零头都不动，报告写 skipped', () => {
    const s = quiet(newGame(CONTENT, { seed: 37 }));
    s.memberCarry = 0.5;
    const rep0 = s.stats.reputation ?? 0;
    const m0 = s.stats.members ?? 0;
    const { daily, report } = closeToday(s);
    expect(daily.cause).toMatchObject({ demand: 0, rep: {}, skipped: true });
    expect(daily.cause.members.gain).toBe(0);
    expect(s.stats.reputation).toBe(rep0);
    expect(s.stats.members).toBe(m0);
    expect(s.memberCarry).toBe(0.5);
    expect(report.reputation).toMatchObject({ delta: 0, terms: {}, skipped: true });
    expect(report.members).toMatchObject({ delta: 0, terms: {}, skipped: true });
    expect(report.service.rate).toBeNull();
  });

  it('走掉的会员当天就罚：每个 −0.5 声望、−1/3 会员', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    const rep0 = s.stats.reputation ?? 0;
    const { daily, report } = closeToday(s, (x) => {
      x.today.walkouts = { outer_1: 3 };
    });
    expect(daily.cause.walkouts).toBe(3);
    expect(daily.cause.rep.walkouts).toBe(-1.5);
    expect(daily.cause.members.terms?.walkouts).toBe(-1);
    expect((s.stats.reputation ?? 0) - rep0).toBeCloseTo(sum(daily.cause.rep), 1);
    expect(report.service).toMatchObject({ walkouts: 3, walkoutsBy: { outer_1: 3 } });
  });

  it('会员的零头攒到明天：今天的小数加上昨天的零头，够一个才多一个', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    s.memberCarry = 0.9;
    const m0 = s.stats.members ?? 0;
    // 中期的质量和声望：今天的 growth 是个小数
    const mid = (x: GameState) => {
      x.stats.quality = 60;
      x.stats.reputation = 40;
    };
    const { daily } = closeToday(s, mid);
    const gain = daily.cause.members.gain;
    expect(gain).toBeGreaterThan(0.1);
    expect(daily.cause.members.capped).toBe(false);
    expect((s.stats.members ?? 0) - m0 + s.memberCarry).toBeCloseTo(0.9 + gain, 1);
    expect(s.stats.members).toBe(m0 + Math.trunc(0.9 + gain));
    // 第二天接着攒
    const carry = s.memberCarry;
    const m1 = s.stats.members ?? 0;
    const next = closeToday(s, mid);
    expect((s.stats.members ?? 0) - m1 + s.memberCarry).toBeCloseTo(carry + next.daily.cause.members.gain, 1);
  });

  it('到了上限：不再收人、不攒零头', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    s.stats.members = 12; // 上限 1 块场 × 12
    s.today.members0 = 12;
    s.memberCarry = 0.9;
    const { daily, report } = closeToday(s);
    expect(daily.cause.members).toMatchObject({ cap: 12, capped: true, carry: 0, delta: 0 });
    expect(s.stats.members).toBe(12);
    expect(s.memberCarry).toBe(0);
    expect(report.members).toMatchObject({ cap: 12, capped: true, delta: 0, carry: 0 });
  });
});

describe('周日：本周回顾只讲不改', () => {
  it('七天的报告加起来；周日收盘声望、会员只按周日这一天变', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    const reports: DayReport[] = [];
    let sunday: { daily: Daily; report: DayReport } | null = null;
    for (let i = 0; i < 7; i++) {
      const r = closeToday(s);
      reports.push(r.report);
      if (i === 6) sunday = r;
    }
    if (!sunday) throw new Error('no sunday');
    const review = sunday.report.review;
    expect(sunday.report.weekday).toBe(6);
    expect(reports.slice(0, 6).every((r) => r.review === null)).toBe(true);
    expect(review).not.toBeNull();
    if (!review) return;
    expect(review.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(review.money.total).toBe(reports.reduce((a, r) => a + r.money.total, 0));
    expect(review.reputation).toBeCloseTo(
      reports.reduce((a, r) => a + r.reputation.delta, 0),
      1,
    );
    expect(review.members).toBe(reports.reduce((a, r) => a + r.members.delta, 0));
    expect(review.service.trend).toHaveLength(7);
    expect(review.service.demand).toBe(reports.reduce((a, r) => a + r.service.demand, 0));
    const best = Math.max(...reports.map((r) => r.money.total));
    expect(review.best?.money).toBe(best);
    expect(review.quality.before).toBe(reports[0]?.quality.before);
    // 周日收盘的声望变化只有周日这一天的各项（周结算不再改数）
    expect(sunday.report.reputation.delta).toBeCloseTo(sum(sunday.daily.cause.rep), 1);
    expect(sunday.report.members.delta).toBe(sunday.daily.cause.members.delta);
    const week = [...s.log].reverse().find((e) => e.cause.kind === 'week');
    expect(week?.cause).toMatchObject({ kind: 'week', week: 1, review: true });
    expect(s.days.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('settleWeek 本身不改任何状态量', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    for (let i = 0; i < 3; i++) closeToday(s);
    const stats = structuredClone(s.stats);
    const carry = s.memberCarry;
    const ctx: Ctx = { s, w: W(), events: [] };
    settleWeek(ctx, 3);
    expect(s.stats).toEqual(stats);
    expect(s.memberCarry).toBe(carry);
  });

  it('s.days 只留最近 7 份', () => {
    const s = court1();
    for (let i = 0; i < 9; i++) closeToday(s);
    expect(s.days.map((r) => r.day)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('明天的天气收盘时就抽好', () => {
  it('预告就是第二天的天气；同一种子 30 天的天气和每日结算以前一样', () => {
    const s = quiet(newGame(CONTENT, { seed: 1 }));
    const seq: string[] = [s.weather];
    let forecast: string | null = null;
    let d = dayOf(s.t);
    while (seq.length < 30) {
      const ev = advance(s, CONTENT, [], 1).events;
      for (const e of ev) if (e.type === 'daySettled') forecast = e.report.tomorrow.weather;
      if (dayOf(s.t) !== d) {
        d = dayOf(s.t);
        expect(s.weather).toBe(forecast);
        expect(s.forecast).toBeNull();
        seq.push(s.weather);
      }
    }
    // 改之前（天气在开门时抽）跑出来的序列，seed 1、关掉卡
    expect(seq).toEqual([
      ...['cloud', 'sun', 'cloud', 'heat', 'heat', 'sun', 'cloud', 'wind', 'sun', 'heat'],
      ...['sun', 'sun', 'sun', 'sun', 'sun', 'sun', 'sun', 'sun', 'sun', 'wind'],
      ...['sun', 'sun', 'sun', 'sun', 'cloud', 'wind', 'sun', 'sun', 'cloud', 'cloud'],
    ]);
  });
});

describe('结算报告', () => {
  it('每一节都有：钱按来源拆开、加起来等于合计；今天的人；明天的天气、会变脏的场、日历、离季末几天', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    const w = W();
    const { report } = closeToday(s, (x) => {
      // 一张卡收了 $50、花了 $20；一张工单开工扣了材料费；Dale 的士气比开门时低
      const ctx: Ctx = { s: x, w, events: [] };
      const e = run(ctx, { kind: 'option', card: 'iw_arrival', option: 'A' }, null, [{ stat: 'cash', add: 50 }]);
      x.stats.cash = (x.stats.cash ?? 0) - 20;
      e.effects.push({ kind: 'cost', amount: 20 });
      x.today.materials.flyers = 40;
      x.stats.cash = (x.stats.cash ?? 0) - 40;
      x.today.morale0.dale = (x.people.dale?.morale ?? 0) + 5;
    });
    const m = report.money;
    const kinds = new Set(m.lines.map((l) => l.kind));
    for (const k of ['wages', 'upkeep', 'post', 'materials', 'card'] as const) expect(kinds.has(k)).toBe(true);
    expect(m.lines.find((l) => l.kind === 'card')).toEqual({ kind: 'card', id: 'iw_arrival', amount: 30 });
    expect(m.lines.find((l) => l.kind === 'materials')).toEqual({ kind: 'materials', id: 'flyers', amount: -40 });
    expect(m.lines.find((l) => l.kind === 'post')?.id).toBe('o1_rental');
    expect(Math.abs(m.lines.reduce((a, l) => a + l.amount, 0) - m.total)).toBeLessThan(2);
    expect(m.cash).toBe(Math.round(s.stats.cash ?? 0));
    expect(m.vsYesterday).toBeNull();
    // 收入在前、花销在后
    const signs = m.lines.filter((l) => l.kind !== 'other').map((l) => Math.sign(l.amount));
    expect([...signs].sort((a, b) => b - a)).toEqual(signs);
    // 今天的人：总监在岗位上干了一天，Dale 闲了一天、士气在掉
    expect(report.people.top[0]?.id).toBe('director');
    expect(report.people.idle.map((p) => p.id)).toContain('dale');
    expect(report.people.morale.map((p) => p.id)).toEqual(['dale']);
    expect(report.service.missed?.post).toBeDefined();
    expect(report.quality.target).toBeGreaterThan(0);
    // 明天
    expect(report.tomorrow).toMatchObject({ day: 2, weekday: 1, season: 'autumn', seasonStarts: false, daysLeft: 110 });
    expect(report.tomorrow.weather).toBe(s.weather);
    // 第二天的报告和昨天比
    const second = closeToday(s).report;
    expect(second.money.vsYesterday).toBe(second.money.total - m.total);
  });

  it('明天会变脏的球场：按明天的天气和此刻的使用估一整天（没人扫）', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    closeToday(s);
    const w = W();
    const d = dayOf(s.t) - 1;
    s.forecast = { day: d + 1, weather: 'wind' };
    const c = s.care.outer_1;
    if (!c) throw new Error('no care');
    c.mess = { sand: 0.3, water: 0, litter: 0, lines: 0, cracks: 0 };
    const r = buildDayReport(s, w, d);
    expect(r.tomorrow.weather).toBe('wind');
    expect(r.tomorrow.dirty).toEqual([{ court: 'outer_1', level: 'meh', now: 'ok', why: 'sand' }]);
    // 晴天：沙子长得慢，不会变差
    s.forecast = { day: d + 1, weather: 'sun' };
    expect(buildDayReport(s, w, d).tomorrow.dirty).toEqual([]);
    // 打扫岗位有人守着：不算
    s.forecast = { day: d + 1, weather: 'wind' };
    const care = [...w.posts.values()].find((p) => p.at === 'outer_1' && p.care !== undefined);
    if (care) {
      (s.people.dale as { job: string | null }).job = care.id;
      expect(buildDayReport(s, w, d).tomorrow.dirty).toEqual([]);
    }
  });

  it('明天的日历：地图日历上的卡、季末结算、离季末几天', () => {
    const s = court1();
    const w = W();
    const r = buildDayReport(s, w, 84);
    expect(r.tomorrow.calendar).toContainEqual({ kind: 'card', card: 'iw_investor_check', at: at(85, 10) });
    expect(r.tomorrow.daysLeft).toBe(112 - 85);
    const last = buildDayReport(s, w, 111);
    expect(last.tomorrow.calendar.at(-1)).toEqual({ kind: 'settle', at: at(112, w.act.ending?.hour ?? 18) });
    expect(last.tomorrow.calendar.some((x) => x.kind === 'card' && x.card === 'iw_deadline')).toBe(false);
    expect(last.tomorrow.daysLeft).toBe(0);
  });
});

describe('存档 14 → 15', () => {
  it('读 14 版的旧存档：今天的账从读档起记，零头从 0 起，没有预告和报告；接着跑能收盘结算', () => {
    const s = court1();
    advance(s, CONTENT, [assign('director', 'o1_rental')], 90);
    const old = structuredClone(toSave(s, [])) as unknown as Record<string, unknown>;
    const st = old.state as Record<string, unknown>;
    for (const k of ['today', 'memberCarry', 'forecast', 'days']) delete st[k];
    st.version = 14;
    old.version = 14;
    const { save } = fromSave(JSON.parse(JSON.stringify(old)));
    const loaded = save.state;
    expect(save.version).toBe(SAVE_VERSION);
    expect(loaded.today).toMatchObject({
      day: 1,
      demand: 0,
      served: 0,
      cash0: s.stats.cash,
      members0: s.stats.members,
    });
    expect(loaded.today.log0).toBe((s.log.at(-1)?.id ?? -1) + 1);
    expect(loaded).toMatchObject({ memberCarry: 0, forecast: null, days: [] });
    const { report } = closeToday(loaded);
    expect(report.day).toBe(1);
    expect(loaded.days).toHaveLength(1);
    expect(loaded.forecast).toBeNull();
    expect(dayOf(loaded.t)).toBe(2);
  });
});
