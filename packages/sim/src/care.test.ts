import { CONTENT, type ContentBundle } from '@td/content';
import { describe, expect, it } from 'vitest';
import { canCare, careEstimate, careMinutes } from './care';
import type { Ctx } from './effects';
import { run as runEffects } from './effects';
import type { SimEvent } from './events';
import { advance, newGame } from './game';
import { surfaceOf, usabilityFrom } from './mess';
import { fromSave, MIGRATIONS, toSave } from './save';
import { canAssign, orderStatus, speedOf, workSkill } from './staff';
import { type CausalEntry, type CourtMess, dayOf, type GameState, minuteOfDay, type Weather, weekdayOf } from './state';
import { careBlocksPost, careLevelOf, makeEnv, usabilityOf } from './vars';
import { worldFor } from './world';

/** 场地可用度（court-care-contract.md，ADR 0022） */
const W = () => worldFor(CONTENT, 'indian_wells');
const quiet = (s: GameState): GameState => {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};
/** 会员场修好、状况 90；总监和 Dale 站在会员场上 */
function club(seed = 3): GameState {
  const s = quiet(newGame(CONTENT, { seed }));
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 90;
  (s.people.dale as { at: string }).at = 'outer_1';
  (s.people.director as { at: string }).at = 'outer_1';
  return s;
}
const set = (s: GameState, f: string, m: Partial<CourtMess>) => {
  const c = s.care[f];
  if (c) c.mess = { sand: 0, water: 0, litter: 0, lines: 0, cracks: 0, ...m };
};
const assign = (person: string, target: string | null) => ({ type: 'assign' as const, person, target });
/** 走一分钟，收集事件 */
const tick = (s: GameState, n = 1, cmds: Parameters<typeof advance>[2] = []): SimEvent[] =>
  advance(s, CONTENT, cmds, n).events;
/** 按某种天气走完今天（收盘、跳到明早开门）；返回事件 */
function day(s: GameState, weather: Weather): SimEvent[] {
  const d = dayOf(s.t);
  s.weather = weather;
  const ev: SimEvent[] = [];
  while (dayOf(s.t) === d) ev.push(...tick(s));
  s.weather = weather;
  return ev;
}
const logs = (s: GameState, kind: string): CausalEntry[] => s.log.filter((e) => e.cause.kind === kind);

describe('可用度和三档', () => {
  it('公式：100 − 100 × Σ 权重 × 脏乱；≥ 70 能打，< 40 不能打', () => {
    const s = club();
    const w = W();
    expect(surfaceOf(s, w, 'outer_1')).toBe('hard');
    expect(usabilityOf(s, w, 'outer_1')).toBe(100);
    set(s, 'outer_1', { sand: 0.5 });
    expect(usabilityOf(s, w, 'outer_1')).toBeCloseTo(70);
    expect(careLevelOf(s, w, 'outer_1')).toBe('ok');
    set(s, 'outer_1', { sand: 0.5, litter: 0.1 });
    expect(careLevelOf(s, w, 'outer_1')).toBe('meh');
    set(s, 'outer_1', { water: 1 });
    expect(usabilityOf(s, w, 'outer_1')).toBeCloseTo(20);
    expect(careLevelOf(s, w, 'outer_1')).toBe('no');
    expect(usabilityFrom(w, 'clay', { sand: 0, water: 0, litter: 0, lines: 1, cracks: 0 })).toBeCloseTo(60);
    // 没开的场（废墟）当 100；变量 usability.* 和 care.worst 一致
    expect(usabilityOf(s, w, 'outer_23')).toBe(100);
    const env = makeEnv(s, w);
    expect(env.get('usability.outer_1')).toBeCloseTo(20);
    expect(env.get('care.worst')).toBeCloseTo(20);
    expect(env.get('care.waiting')).toBe(0);
    expect(env.get('care.walkouts')).toBe(0);
  });

  it('一个大风天没人扫 → 勉强；连着两天 → 不能打（换档发 careLevel）', () => {
    const s = club();
    const ev1 = day(s, 'wind');
    expect(careLevelOf(s, W(), 'outer_1')).toBe('meh');
    expect(s.care.outer_1?.level).toBe('meh');
    expect(ev1.filter((e) => e.type === 'careLevel')).toEqual([
      expect.objectContaining({ type: 'careLevel', court: 'outer_1', from: 'ok', to: 'meh' }),
    ]);
    expect(s.care.outer_1?.mess.sand).toBeCloseTo(12 * W().act.rules.care!.weather.wind!.sand!, 2);
    const ev2 = day(s, 'wind');
    expect(careLevelOf(s, W(), 'outer_1')).toBe('no');
    expect(ev2.some((e) => e.type === 'careLevel' && e.to === 'no')).toBe(true);
    // 没开的场冻住：废墟的红土场一粒沙也没有
    expect(s.care.outer_23?.mess.sand).toBe(0);
  });

  it('下一整天雨积水勉强、连着两天不能打；晴天晒干', () => {
    const s = club();
    day(s, 'rain');
    expect(s.care.outer_1?.mess.water).toBeCloseTo(0.6, 2);
    expect(careLevelOf(s, W(), 'outer_1')).toBe('meh');
    day(s, 'rain');
    expect(careLevelOf(s, W(), 'outer_1')).toBe('no');
    day(s, 'sun');
    day(s, 'sun');
    expect(s.care.outer_1?.mess.water).toBe(0);
    expect(careLevelOf(s, W(), 'outer_1')).toBe('ok');
  });

  it('酷热：红土一天就勉强（开裂 × 2.5），硬地还能打', () => {
    const s = club();
    s.facilities.outer_23 = 'playable';
    s.variants.outer_23 = 'clay';
    day(s, 'heat');
    const w = W();
    expect(surfaceOf(s, w, 'outer_23')).toBe('clay');
    expect(careLevelOf(s, w, 'outer_23')).toBe('meh');
    expect(careLevelOf(s, w, 'outer_1')).toBe('ok');
    expect(s.care.outer_23?.mess.cracks).toBeCloseTo(0.36, 2);
    expect(s.care.outer_1?.mess.cracks).toBeCloseTo(0.144, 2);
    // 修成硬地的红土场按硬地算
    s.variants.outer_23 = 'hard';
    expect(surfaceOf(s, w, 'outer_23')).toBe('hard');
  });

  it('有人打球就有球和垃圾（使用）', () => {
    const s = club();
    s.weather = 'cloud';
    tick(s, 0, [assign('dale', 'o1_rental')]);
    tick(s, 7 * 60);
    // 看场一个人在打 7 小时：use.litter × 7
    expect(s.care.outer_1?.mess.litter).toBeCloseTo(7 * W().act.rules.care!.use.litter!, 2);
  });
});

describe('打扫岗位和打扫工单', () => {
  it('维护岗位每圈每项清掉 care × 速度', () => {
    const s = club();
    s.weather = 'cloud';
    set(s, 'outer_1', { sand: 0.5, lines: 0.3 });
    tick(s, 0, [assign('dale', 'o1_upkeep')]);
    tick(s, 60);
    const v = (W().posts.get('o1_upkeep')?.care ?? 0) * speedOf(workSkill(s, W(), 'dale', 'upkeep'));
    expect(v).toBeGreaterThan(0);
    // 阴天每小时沙 + weather.cloud.sand
    expect(s.care.outer_1?.mess.sand).toBeCloseTo(0.5 + W().act.rules.care!.weather.cloud!.sand! - v, 3);
    expect(s.care.outer_1?.mess.lines).toBeCloseTo(0.3 - v, 3);
  });

  it('可用度低于 85 才冒出来；开了工就做完为止；做满清掉开工时的七成', () => {
    const s = club();
    const w = W();
    const o = w.orders.get('care_outer_1');
    if (!o) throw new Error('care_outer_1');
    expect(orderStatus(s, w, o).visible).toBe(false);
    set(s, 'outer_1', { sand: 0.5, litter: 0.2 });
    expect(orderStatus(s, w, o).visible).toBe(true);
    s.weather = 'cloud';
    tick(s, 0, [assign('dale', 'care_outer_1'), assign('director', 'care_outer_1')]);
    tick(s, 30);
    expect(s.orders.care_outer_1?.started).toBe(true);
    expect(s.orders.care_outer_1?.care0).toMatchObject({ sand: 0.5, litter: 0.2 });
    // 扫到一半可用度回到 85 以上也不作废
    set(s, 'outer_1', { sand: 0.05 });
    tick(s, 5);
    expect(orderStatus(s, w, o).visible).toBe(true);
    set(s, 'outer_1', { sand: 0.5, litter: 0.2 });
    const before = s.log.length;
    for (let i = 0; i < 600 && s.orders.care_outer_1; i++) tick(s);
    expect(s.orders.care_outer_1).toBeUndefined();
    const done = s.log.slice(before).find((e) => e.cause.kind === 'order');
    const m = done?.effects.find((x) => x.kind === 'mess');
    expect(m).toBeDefined();
    if (m?.kind !== 'mess') throw new Error('mess');
    // 整张单清掉 0.7 × 开工时的量（中途改过的量和这里无关：只看总数在七成左右）
    const total = (m.delta.sand ?? 0) + (m.delta.litter ?? 0);
    expect(total).toBeLessThan(-0.4);
    expect(total).toBeGreaterThan(-0.5);
    // 干净了就不再冒出来
    set(s, 'outer_1', {});
    expect(orderStatus(s, w, o).visible).toBe(false);
  });

  it('一张单从头扫到尾：每项正好清掉开工那一刻的 70%', () => {
    const s = club();
    s.weather = 'cloud';
    set(s, 'outer_1', { litter: 0.6, lines: 0.4 });
    tick(s, 0, [assign('dale', 'care_outer_1'), assign('director', 'care_outer_1')]);
    for (let i = 0; i < 600 && (s.orderLog.done.care_outer_1 ?? 0) === 0; i++) tick(s);
    expect(s.orderLog.done.care_outer_1).toBe(1);
    const e = logs(s, 'order').at(-1);
    const m = e?.effects.find((x) => x.kind === 'mess');
    if (m?.kind !== 'mess') throw new Error('mess');
    expect(m.delta.litter).toBeCloseTo(-0.42, 2);
    expect(m.delta.lines).toBeCloseTo(-0.28, 2);
  });
});

describe('亲手扫（careFinish）', () => {
  it('canCare 按顺序判：不是球场、没开、下雨、没什么可扫', () => {
    const s = club();
    const w = W();
    expect(canCare(s, w, 'clubhouse')).toBe('court');
    expect(canCare(s, w, 'outer_23')).toBe('inactive');
    expect(canCare(s, w, 'outer_1')).toBe('clean');
    set(s, 'outer_1', { sand: 0.5 });
    expect(canCare(s, w, 'outer_1')).toBeNull();
    s.weather = 'rain';
    expect(canCare(s, w, 'outer_1')).toBe('rain');
  });

  it('清掉脏乱、总监离岗 work 分钟（期间拖不动）、写 care 日志、发 careDone', () => {
    const s = club();
    const w = W();
    s.weather = 'wind';
    set(s, 'outer_1', { sand: 0.5, litter: 0.2 });
    const r = { cleared: { sand: 1, litter: 1 } };
    const est = careMinutes(s, w, 'outer_1', r);
    const speed = speedOf(workSkill(s, w, 'director', 'upkeep'));
    expect(est.work).toBe(Math.round((15 + 90 * 0.5 + 45 * 0.2) / speed));
    expect(est.walk).toBe(0);
    expect(careEstimate(s, w, 'outer_1').work).toBe(est.work);
    const up0 = s.people.director?.upkeep ?? 0;
    const ev = tick(s, 0, [{ type: 'careFinish', court: 'outer_1', result: r }]);
    expect(s.care.outer_1?.mess.sand).toBe(0);
    expect(s.care.outer_1?.mess.litter).toBe(0);
    expect(ev.find((e) => e.type === 'careDone')).toMatchObject({ court: 'outer_1', after: 100, minutes: est.total });
    const e = logs(s, 'care').at(-1);
    expect(e?.cause).toMatchObject({ kind: 'care', court: 'outer_1', minutes: est.total, after: 100 });
    expect(e?.effects).toContainEqual({ kind: 'errand', person: 'director', at: 'outer_1', minutes: est.work });
    expect(s.people.director?.upkeep).toBeGreaterThan(up0);
    // 离岗期间：派不动、也不能再扫一次
    expect(canAssign(s, w, 'director', 'o1_rental')).toBe('busy');
    set(s, 'outer_1', { sand: 0.5 });
    expect(canCare(s, w, 'outer_1')).toBe('busy');
    expect(tick(s, 0, [{ type: 'careFinish', court: 'outer_1', result: r }]).some((x) => x.type === 'careDone')).toBe(
      false,
    );
    tick(s, est.work + 1);
    expect(s.people.director?.errand).toBeNull();
    expect(canAssign(s, w, 'director', 'o1_rental')).toBeNull();
  });

  it('只清了一部分：按清掉的比例算工时；不能打 → 能打时门口的人进场', () => {
    const s = club();
    const w = W();
    s.weather = 'sun';
    set(s, 'outer_1', { water: 1 });
    tick(s, 0, [assign('dale', 'o1_rental')]);
    tick(s, 3);
    expect(s.care.outer_1?.waiting).not.toBeNull();
    const half = careMinutes(s, w, 'outer_1', { cleared: { water: 0.5, sand: Number.NaN } });
    const full = careMinutes(s, w, 'outer_1', { cleared: { water: 1 } });
    expect(half.work).toBeLessThan(full.work);
    const ev = tick(s, 0, [{ type: 'careFinish', court: 'outer_1', result: { cleared: { water: 0.9 } } }]);
    expect(s.care.outer_1?.mess.water).toBeCloseTo(0.1);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'waitingEnded', court: 'outer_1', reason: 'playable' }));
    expect(s.care.outer_1?.waiting).toBeNull();
  });
});

describe('不能打：没服务到、门口等人、走人', () => {
  it('有需求的岗位算需求不算服务到、不转圈；90 分钟走一个，一天最多 3 个，收盘回家', () => {
    const s = club();
    const w = W();
    set(s, 'outer_1', { sand: 1 });
    s.weather = 'sun';
    tick(s, 0, [assign('dale', 'o1_rental')]);
    const d0 = s.week.demand;
    const s0 = s.week.served;
    const cash0 = s.stats.cash ?? 0;
    const ev: SimEvent[] = [];
    const d = dayOf(s.t);
    while (dayOf(s.t) === d) ev.push(...tick(s));
    expect(careBlocksPost(s, w, 'o1_rental')).toBe(true);
    expect(careBlocksPost(s, w, 'o1_upkeep')).toBe(false);
    // 8–15 点 7 小时：头一分钟还没换档
    expect(s.week.demand - d0).toBeGreaterThanOrEqual(7 * 60 - 1);
    expect(s.week.served - s0).toBeLessThanOrEqual(1);
    expect(s.week.unplayable?.o1_rental).toBeGreaterThanOrEqual(7 * 60 - 2);
    expect(s.week.missed.o1_rental ?? 0).toBeLessThanOrEqual(1);
    expect(ev.some((e) => e.type === 'postCycle' && e.post === 'o1_rental')).toBe(false);
    // 没有收入（看场岗位一圈都没转）；现金只少了一天的工资和维护
    expect(s.stats.cash ?? 0).toBeLessThan(cash0);
    const waiting = ev.filter((e) => e.type === 'membersWaiting');
    expect(waiting[0]).toMatchObject({ court: 'outer_1', n: 2 });
    const outs = ev.filter((e) => e.type === 'memberWalkedOut');
    expect(outs.length).toBe(3);
    expect(outs.map((e) => (e.type === 'memberWalkedOut' ? e.waited : 0))).toEqual([90, 90, 90]);
    expect(logs(s, 'walkout').length).toBe(3);
    expect(s.week.walkouts).toBe(3);
    // 15 点看场关了：门口没人等了；收盘时计数清零
    expect(ev.some((e) => e.type === 'waitingEnded')).toBe(true);
    expect(s.care.outer_1?.walkoutsToday).toBe(0);
    expect(s.care.outer_1?.waiting).toBeNull();
  });

  it('收盘时门口还有人：回家（closed），不算走掉', () => {
    const s = club();
    s.facilities.outer_23 = 'playable';
    s.variants.outer_23 = 'clay';
    set(s, 'outer_23', { sand: 1, water: 1 });
    // 红土场看场 8–17、周一到周四的诊所 17–20：一直有需求，门口一直有人；走满 3 个以后等到收盘
    while (weekdayOf(s.t) > 3) day(s, 'rain');
    const ev = day(s, 'rain');
    expect(ev.filter((e) => e.type === 'memberWalkedOut' && e.court === 'outer_23').length).toBe(3);
    const ended = ev.filter((e) => e.type === 'waitingEnded' && e.court === 'outer_23');
    expect(ended.at(-1)).toMatchObject({ reason: 'closed' });
    expect(s.care.outer_23?.waiting).toBeNull();
  });

  it('勉强能打：有人在岗一分钟只算 meh_service 个服务到，偶尔有人抱怨', () => {
    const s = club();
    s.weather = 'cloud';
    set(s, 'outer_1', { sand: 0.5, litter: 0.2 });
    tick(s, 0, [assign('dale', 'o1_rental')]);
    tick(s, 2);
    const s0 = s.week.served;
    const ev = tick(s, 60);
    expect(s.care.outer_1?.level).toBe('meh');
    expect(s.week.served - s0).toBeCloseTo(60 * W().act.rules.care!.meh_service, 0);
    expect(ev.filter((e) => e.type === 'careGrumble').length).toBeLessThanOrEqual(1);
  });

  it('周日收盘：走掉的会员扣声望（−0.5 / 个）和会员（每 3 个少来 1 个），讲出最不能打的场；本周清零', () => {
    const s = club();
    while (!(weekdayOf(s.t) === 6 && minuteOfDay(s.t) >= 19 * 60)) tick(s, 30);
    s.week.walkouts = 4;
    s.week.unplayable = { o1_rental: 100, o1_lesson: 30, pr_academy: 50 };
    const env = makeEnv(s, W());
    expect(env.get('care.walkouts')).toBe(4);
    const d = dayOf(s.t);
    while (dayOf(s.t) === d) tick(s);
    const e = logs(s, 'week').at(-1);
    if (e?.cause.kind !== 'week') throw new Error('week');
    expect(e.cause.rep.walkouts).toBe(-2);
    expect(e.cause.walkouts).toBe(4);
    expect(e.cause.unplayable).toEqual({ court: 'outer_1', minutes: 130 });
    expect(s.week.walkouts).toBe(0);
    expect(s.week.unplayable).toEqual({});
  });
});

describe('效果 mess、没写 rules.care 的内容、存档', () => {
  it('效果 mess 加到场上、截在 0..1、记 mess 记录；不是球场什么都不做', () => {
    const s = club();
    const ctx: Ctx = { s, w: W(), events: [] };
    const e = runEffects(ctx, { kind: 'debug', what: 'test' }, null, [
      { mess: 'outer_1', add: { sand: 0.7 } },
      { mess: 'outer_1', add: { sand: 0.7, water: -0.2 } },
      { mess: 'clubhouse', add: { sand: 0.7 } },
    ]);
    expect(s.care.outer_1?.mess.sand).toBe(1);
    expect(s.care.outer_1?.mess.water).toBe(0);
    expect(e.effects.filter((x) => x.kind === 'mess')).toEqual([
      { kind: 'mess', facility: 'outer_1', delta: { sand: 0.7 } },
      { kind: 'mess', facility: 'outer_1', delta: { sand: expect.closeTo(0.3, 6) } },
    ]);
    expect(s.care.clubhouse).toBeUndefined();
  });

  it('调试命令 debugWeather：换今天的天气、发 weather 事件', () => {
    const s = club();
    const ev = tick(s, 0, [{ type: 'debugWeather', weather: 'heat' }]);
    expect(s.weather).toBe('heat');
    expect(ev).toContainEqual({ type: 'weather', weather: 'heat' });
  });

  it('沙尘暴卡不管：外场进沙', () => {
    const card = CONTENT.cards.find((c) => c.id === 'iw_sandstorm');
    expect(card?.options.B?.effects.some((e) => 'mess' in e && e.mess === 'outer_1')).toBe(true);
  });

  it('没写 rules.care 的地图：没有可用度，变量是 0 / 0 / 100，岗位照转', () => {
    const content: ContentBundle = {
      ...CONTENT,
      acts: CONTENT.acts.map((a) => ({ ...a, rules: { ...a.rules, care: undefined } })),
    };
    const s = quiet(newGame(content, { seed: 3 }));
    const w = worldFor(content, 'indian_wells');
    expect(s.care).toEqual({});
    s.facilities.outer_1 = 'playable';
    (s.people.dale as { at: string }).at = 'outer_1';
    s.weather = 'wind';
    advance(s, content, [assign('dale', 'o1_rental')], 120);
    expect(s.care).toEqual({});
    expect(s.week.served).toBeGreaterThan(100);
    const env = makeEnv(s, w);
    expect([env.get('care.waiting'), env.get('care.walkouts'), env.get('care.worst')]).toEqual([0, 0, 100]);
    expect(env.get('usability.outer_1')).toBe(100);
    expect(canCare(s, w, 'outer_1')).toBe('court');
  });

  it('读 13 版的旧存档：补上 care 和本周计数；模拟用到时补全，球场全干净、能打', () => {
    const s = club();
    tick(s, 30);
    const old = structuredClone(toSave(s, [])) as unknown as Record<string, unknown>;
    const st = old.state as Record<string, unknown>;
    delete st.care;
    const wk = st.week as Record<string, unknown>;
    delete wk.walkouts;
    delete wk.unplayable;
    st.version = 13;
    old.version = 13;
    expect(MIGRATIONS[13]).toBeDefined();
    const loaded = fromSave(JSON.parse(JSON.stringify(old))).save.state;
    expect(loaded.care).toEqual({});
    expect(loaded.week.walkouts).toBe(0);
    expect(loaded.week.unplayable).toEqual({});
    tick(loaded, 1);
    expect(Object.keys(loaded.care).sort()).toEqual(['outer_1', 'outer_23', 'practice', 'stadium_1', 'stadium_3']);
    expect(loaded.care.outer_1?.level).toBe('ok');
    expect(loaded.care.outer_23?.mess).toEqual({ sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 });
  });
});
