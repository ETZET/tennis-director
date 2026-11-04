import { type Card, CONTENT, type ContentBundle, compileContent, type Order, type Post } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, humanBot, humanProfile, runGame } from './bots';
import type { Ctx } from './effects';
import type { SimEvent } from './events';
import { advance, newGame, replay, stateHash } from './game';
import { fromSave, toSave } from './save';
import { canAssign, dayDecay, orderStatus, postStatus, prepStatus, staffedToday } from './staff';
import { at, dayOf, type GameState, minuteOfDay, SAVE_VERSION } from './state';
import { rainCheck, tournamentStatus } from './tournaments';
import { num, test } from './vars';
import { worldFor } from './world';

/**
 * W2：赛事日历（LG-11）、选路、人-13 之外的放人（掉档放下来）、表演赛分期筹备。
 * 内容还没写（GM-10、GM-14 之后才有），这里给 Indian Wells 补一份小示例：
 * - 主办赛事 cup：会员场，第 1、2 周的周六 9–17；报名工单 cup_signup（报名费 $60）；临时岗位签到、裁判；
 *   当天会员场看场不开；奖励奖杯 + 声望；附加目标服务率 ≥ 80%、两个临时岗位都有人；第二次起减半、目标换成"全程有人"。
 * - 外出赛事 open：大门，第 2 周周三；只收球员，★3 起要两个人（双打）；赢了 +$800、奖杯。
 * - 选路 s2（youth / resort），★1 升星时来选路卡，一天倒计时，默认 A；红土场的 hard 变体要选了 resort 才开。
 * - 分期筹备 show：两期工单。
 */
const quiet = (s: GameState): GameState => {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};

function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-w2-fixture`;
  const rental = c.posts.find((x) => x.id === 'o1_rental') as Post;
  const temp = (id: string, skill: Post['skill']): Post => ({
    ...rental,
    id,
    skill,
    hours: [9, 17],
    effects: [{ stat: 'cash', add: 1 }],
    wear: 0,
  });
  c.posts.push(temp('t_checkin', 'service'), temp('t_umpire', 'teach'));
  const base: Omit<Order, 'id'> = {
    act: 'indian_wells',
    at: 'outer_1',
    skill: 'service',
    work: '1h',
    cost: 0,
    crew: 2,
    once: false,
    restore: 0,
    effects: [],
    onSuccess: [],
    onFail: [],
  };
  c.orders.push(
    { ...base, id: 'cup_signup' },
    {
      ...base,
      id: 'open_go',
      at: 'entrance',
      skill: 'play',
      work: '2h',
      only: ['player'],
      min_crew: 'stars >= 3 ? 2 : 1',
    },
    { ...base, id: 'prep_a', at: 'stadium_1', cost: 100, prep: 'show' },
    { ...base, id: 'prep_b', at: 'stadium_1', cost: 200, prep: 'show' },
  );
  const repair = c.orders.find((x) => x.id === 'o23_repair') as Order;
  const f = c.facilities.find((x) => x.id === 'outer_23');
  if (!f) throw new Error('no outer_23');
  f.variants = { clay: {}, hard: {} };
  repair.variants = { clay: {}, hard: { when: { route: 's2', is: 'resort' } } };
  const card: Card = {
    id: 'route_s2',
    act: 'indian_wells',
    source: 'milestone',
    tone: 'neutral',
    weight: 1,
    pause: false,
    location: 'entrance',
    who: 'dale',
    countdown: '1d',
    options: {
      A: { effects: [{ route: 's2', set: 'youth' }], onSuccess: [], onFail: [] },
      B: { effects: [{ route: 's2', set: 'resort' }], onSuccess: [], onFail: [] },
    },
    // biome-ignore lint/suspicious/noThenProperty: 'then' is the card spec's field name (plain data)
    default: { then: 'A', extra: [] },
  };
  c.cards.push(card);
  const act = c.acts.find((a) => a.id === 'indian_wells');
  if (!act) throw new Error('no act');
  act.stars = [{ requires: { members: { stat: 'members', gte: 5 } }, opens: [], card: 'route_s2' }];
  act.routes = { s2: ['youth', 'resort'] };
  act.tournaments = [
    {
      id: 'cup',
      kind: 'host',
      at: 'outer_1',
      weeks: [1, 2],
      days: [5],
      hours: [9, 17],
      fee: 60,
      order: 'cup_signup',
      lead: '7d',
      posts: ['t_checkin', 't_umpire'],
      closes: ['o1_rental'],
      reward: [{ trophy: 1 }, { stat: 'reputation', add: 4 }, { flag: 'hosted_cup', set: true }],
      goals: [
        { id: 'service', if: 'event.service_rate >= 0.8', reward: [{ stat: 'members', add: 2 }] },
        { id: 'staffed', if: 'event.staffed >= 0.9', reward: [{ stat: 'cash', add: 100 }] },
      ],
      repeat: { scale: 0.5, goals: [{ id: 'full', if: 'event.staffed >= 1', reward: [{ stat: 'cash', add: 50 }] }] },
    },
    {
      id: 'open',
      kind: 'away',
      at: 'entrance',
      weeks: [2],
      days: [2],
      hours: [9, 17],
      fee: 200,
      order: 'open_go',
      lead: '7d',
      posts: [],
      closes: [],
      reward: [{ stat: 'reputation', add: 1 }],
      goals: [{ id: 'win', chance: 'event.skill >= 30 ? 1 : 0', reward: [{ stat: 'cash', add: 800 }, { trophy: 1 }] }],
      repeat: { scale: 0.5 },
    },
  ];
  return c;
}
const FIX = fixture();
const W = worldFor(FIX, 'indian_wells');
const assign = (person: string, target: string | null, variant?: string) =>
  ({ type: 'assign', person, target, ...(variant ? { variant } : {}) }) as const;
/** 外场 1 能打，总监和 Dale 都在外场 1；卡全关掉 */
function club(seed = 1): GameState {
  const s = quiet(newGame(FIX, { seed }));
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 90;
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
  return s;
}
function run(s: GameState, mins: number): SimEvent[] {
  return advance(s, FIX, [], mins).events;
}
function until(s: GameState, f: (s: GameState) => boolean, max = 20000): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < max && !f(s); i++) ev.push(...run(s, 1));
  return ev;
}
const order = (id: string) => W.orders.get(id) as Order;

describe('赛事日历：主办（LG-11）', () => {
  it('日历排出每一期：第 1 周周六 9–17，报名不早于开局；报名工单在窗口里出现，按报名费算钱', () => {
    const e = W.editions.get('cup') ?? [];
    expect(e.map((x) => dayOf(x.start))).toEqual([6, 13]);
    expect(e[0]?.start).toBe(at(6, 9));
    expect(e[0]?.end).toBe(at(6, 17));
    expect(e[1]?.signup).toBe(at(6, 9)); // 第二期提前一周 = 第一期开赛那一刻
    const s = club();
    const os = orderStatus(s, W, order('cup_signup'));
    expect(os.visible).toBe(true);
    expect(os.cost).toBe(60);
    expect(os.tournament).toBe('cup');
    const ts = tournamentStatus(s, W);
    expect(ts.map((x) => x.id)).toEqual(['cup', 'open']);
    expect(ts[0]).toMatchObject({ entered: false, live: false, repeat: 0, goals: ['service', 'staffed'] });
  });

  it('做完报名就接下；比赛日开出临时岗位、会员场看场整天不开（坐着的人放下来）；收赛时结算奖励和附加目标', () => {
    const s = club();
    const cash0 = s.stats.cash ?? 0;
    run(s, 0);
    advance(s, FIX, [assign('director', 'cup_signup')], 0);
    const ev = until(s, (x) => !!x.events.cup, 3 * 60);
    expect(ev.some((e) => e.type === 'tournament_entered')).toBe(true);
    expect(s.stats.cash).toBe(cash0 - 60);
    expect(orderStatus(s, W, order('cup_signup')).visible).toBe(false);
    // 第 6 天之前临时岗位不存在；Dale 坐在看场上
    advance(s, FIX, [assign('dale', 'o1_rental')], 0);
    expect(postStatus(s, W, W.posts.get('t_checkin') as Post).exists).toBe(false);
    until(s, (x) => dayOf(x.t) === 6, 8 * 1440);
    s.weather = 'sun';
    // 比赛日：看场不开（Dale 被放下来），临时岗位存在
    const released = run(s, 1).filter((e) => e.type === 'released');
    expect(released).toEqual([
      { type: 'released', person: 'dale', post: 'o1_rental', facility: 'outer_1', reason: 'event' },
    ]);
    expect(postStatus(s, W, W.posts.get('o1_rental') as Post).exists).toBe(false);
    expect(postStatus(s, W, W.posts.get('t_checkin') as Post).exists).toBe(true);
    expect(canAssign(s, W, 'dale', 't_umpire')).toBeNull();
    // 两个人坐上临时岗位，全天有人（只有临时岗位有需求 → 服务率 100%）
    advance(s, FIX, [assign('director', 't_checkin'), assign('dale', 't_umpire')], 0);
    expect(s.people.dale?.routine).not.toContain('t_umpire'); // 临时岗位不进习惯
    const rep0 = s.stats.reputation ?? 0;
    const tr0 = s.trophies;
    const m0 = s.stats.members ?? 0;
    const ev2 = until(s, (x) => !x.events.cup, 12 * 60);
    expect(ev2.some((e) => e.type === 'tournament_live')).toBe(true);
    const done = ev2.find((e) => e.type === 'tournament_done');
    expect(done).toMatchObject({
      tournament: 'cup',
      repeat: 0,
      scale: 1,
      goals: [
        { id: 'service', met: true },
        { id: 'staffed', met: true },
      ],
    });
    expect(minuteOfDay(s.t)).toBeLessThanOrEqual(17 * 60 + 1);
    expect(s.trophies).toBe(tr0 + 1);
    expect(s.flags.hosted_cup).toBe(true);
    expect(s.stats.reputation).toBeCloseTo(rep0 + 4, 0);
    expect(s.stats.members).toBe(m0 + 2);
    expect(s.tournaments.cup).toMatchObject({ entries: 1 });
    const log = s.log.find((x) => x.cause.kind === 'tournament');
    expect(log?.cause).toMatchObject({ result: 'done', goals: { service: true, staffed: true } });
    // 收赛后临时岗位没了，坐着的人放下来
    run(s, 1);
    expect(s.people.director?.job).toBeNull();
  });

  it('第二次起奖励减半、附加目标换一个；没人坐临时岗位就拿不到目标的奖励', () => {
    const s = club();
    s.tournaments.cup = { entries: 1, last: 0 };
    s.t = at(6, 18);
    run(s, 0);
    // 下一期（第 13 天）的报名窗口
    until(s, (x) => dayOf(x.t) === 7, 3 * 1440);
    advance(s, FIX, [assign('director', 'cup_signup')], 0);
    until(s, (x) => !!x.events.cup, 3 * 60);
    expect(tournamentStatus(s, W).find((x) => x.id === 'cup')).toMatchObject({
      entered: true,
      scale: 0.5,
      goals: ['full'],
    });
    until(s, (x) => dayOf(x.t) === 13, 8 * 1440);
    s.weather = 'sun';
    const rep0 = s.stats.reputation ?? 0;
    const ev = until(s, (x) => !x.events.cup, 12 * 60);
    expect(ev.find((e) => e.type === 'tournament_done')).toMatchObject({
      repeat: 1,
      scale: 0.5,
      goals: [{ id: 'full', met: false }],
    });
    expect(s.stats.reputation).toBeCloseTo(rep0 + 2, 0);
  });

  it('接下了、当天下雨：办不成，报名费白花，没有奖励', () => {
    const s = club();
    advance(s, FIX, [assign('director', 'cup_signup')], 0);
    until(s, (x) => !!x.events.cup, 3 * 60);
    until(s, (x) => dayOf(x.t) === 6, 8 * 1440);
    s.weather = 'rain';
    const ctx: Ctx = { s, w: W, events: [] };
    rainCheck(ctx);
    expect(ctx.events.filter((e) => e.type !== 'log')).toEqual([
      { type: 'tournament_spoiled', tournament: 'cup', at: 'outer_1', reason: 'rain' },
    ]);
    expect(s.events.cup).toBeUndefined();
    expect(postStatus(s, W, W.posts.get('t_checkin') as Post).exists).toBe(false);
    expect(s.tournaments.cup).toBeUndefined();
    expect(s.log.at(-1)?.cause).toMatchObject({ kind: 'tournament', result: 'spoiled' });
  });

  it('不报名没有惩罚：开赛时报名窗口关了，临时岗位不开、看场照常', () => {
    const s = club();
    until(s, (x) => dayOf(x.t) === 6 && minuteOfDay(x.t) >= 10 * 60, 8 * 1440);
    expect(orderStatus(s, W, order('cup_signup')).visible).toBe(false);
    expect(postStatus(s, W, W.posts.get('t_checkin') as Post).exists).toBe(false);
    expect(postStatus(s, W, W.posts.get('o1_rental') as Post).exists).toBe(true);
  });
});

describe('赛事日历：外出（LG-11）', () => {
  /** 招两名球员（候选人里的 player） */
  function withPlayers(s: GameState, n: number): string[] {
    const ids = FIX.people.filter((p) => p.kind === 'player').map((p) => p.id);
    for (const id of ids.slice(0, n)) {
      const p = s.people[id];
      if (p) Object.assign(p, { hired: true, at: 'entrance' });
    }
    return ids.slice(0, n);
  }
  it('提前出现、开赛前不能开工（early）；比赛那天出发，做完当场结算（看去的人的球技）', () => {
    const s = club();
    const [pl] = withPlayers(s, 1);
    if (!pl) throw new Error('no player in content');
    expect(orderStatus(s, W, order('open_go')).visible).toBe(false); // 报名窗口第 3 天 9 点才开
    until(s, (x) => x.t >= at(3, 9), 3 * 1440);
    expect(orderStatus(s, W, order('open_go'))).toMatchObject({ visible: true, blocked: 'early', cost: 200 });
    expect(canAssign(s, W, pl, 'open_go')).toBe('early');
    until(s, (x) => dayOf(x.t) === 10 && minuteOfDay(x.t) >= 9 * 60, 12 * 1440);
    expect(canAssign(s, W, pl, 'open_go')).toBeNull();
    const cash0 = s.stats.cash ?? 0;
    advance(s, FIX, [assign(pl, 'open_go')], 0);
    const ev = until(s, (x) => (x.orderLog.done.open_go ?? 0) > 0, 6 * 60);
    expect(ev.find((e) => e.type === 'tournament_done')).toMatchObject({
      tournament: 'open',
      goals: [{ id: 'win', met: true }],
    });
    expect(s.stats.cash).toBeGreaterThanOrEqual(cash0 - 200 + 800 - 5);
    expect(orderStatus(s, W, order('open_go')).visible).toBe(false);
  });
  it('★3 起双打要两个人：一个人到了不开工、不扣报名费；第二个人到了才开工', () => {
    const s = club();
    s.stars = 3;
    const [a, b] = withPlayers(s, 2);
    if (!a || !b) throw new Error('need two players');
    expect(orderStatus(s, W, order('open_go')).minCrew).toBe(2);
    until(s, (x) => dayOf(x.t) === 10 && minuteOfDay(x.t) >= 9 * 60, 12 * 1440);
    const cash0 = s.stats.cash ?? 0;
    advance(s, FIX, [assign(a, 'open_go')], 30);
    expect(s.orders.open_go).toBeUndefined();
    expect(s.stats.cash).toBeCloseTo(cash0, 0);
    advance(s, FIX, [assign(b, 'open_go')], 2);
    expect(s.orders.open_go?.started).toBe(true);
  });
});

describe('选路（W2）', () => {
  it('升 ★1 时来选路卡（因果链指向升星）；一天不选，按默认 A：route.s2 = youth', () => {
    const s = club();
    s.stats.members = 5;
    const ev = run(s, 2);
    expect(ev.some((e) => e.type === 'star_up')).toBe(true);
    const open = s.cards.open.find((o) => o.card === 'route_s2');
    expect(open).toBeDefined();
    expect(s.log.find((e) => e.id === open?.cause)?.cause.kind).toBe('star');
    expect(test(s, W, { route: 's2', is: 'none' })).toBe(true);
    const ev2 = until(s, (x) => !!x.routes.s2, 2 * 1440);
    expect(ev2).toContainEqual({ type: 'route_chosen', slot: 's2', route: 'youth' });
    expect(s.log.find((e) => e.cause.kind === 'default' && e.cause.card === 'route_s2')).toBeDefined();
    expect(num(s, W, 'route.s2 == "youth" ? 1 : 0')).toBe(1);
    expect(test(s, W, { route: 's2', is: 'youth' })).toBe(true);
  });
  it('选了的路改不了；变体可以按路先开：选了 resort 红土场才能修成硬地', () => {
    const s = club();
    expect(canAssign(s, W, 'director', 'o23_repair', 'hard')).toBe('variant');
    expect(orderStatus(s, W, order('o23_repair')).openVariants).toEqual(['clay']);
    s.stats.members = 5;
    run(s, 2);
    const uid = s.cards.open.find((o) => o.card === 'route_s2')?.uid ?? -1;
    advance(s, FIX, [{ type: 'chooseOption', uid, option: 'B' }], 1);
    expect(s.routes.s2).toBe('resort');
    expect(canAssign(s, W, 'director', 'o23_repair', 'hard')).toBeNull();
    expect(orderStatus(s, W, order('o23_repair')).openVariants).toEqual(['clay', 'hard']);
  });
  it('卡的权重可以是表达式（按选的路调招聘日）', () => {
    const c = structuredClone(FIX);
    const card = c.cards.find((x) => x.source === 'random' || x.source === 'threshold') as Card;
    card.weight = 'route.s2 == "youth" ? 3 : 1';
    const w = worldFor(c, 'indian_wells');
    expect(w.cards.get(card.id)?.weight).toBe('route.s2 == "youth" ? 3 : 1');
  });
});

describe('表演赛分期筹备（W2）', () => {
  it('每一期做一次；prep.<组> 是做完的比例，{ prep } 条件是都做完；发 prep_done', () => {
    const s = club();
    expect(prepStatus(s, W, 'show')).toMatchObject({ done: 0, total: 2, costLeft: 300 });
    expect(num(s, W, 'prep.show')).toBe(0);
    advance(s, FIX, [assign('director', 'prep_a')], 0);
    const ev = until(s, (x) => (x.orderLog.done.prep_a ?? 0) > 0, 6 * 60);
    expect(ev).toContainEqual({ type: 'prep_done', group: 'show', order: 'prep_a', done: 1, total: 2 });
    expect(orderStatus(s, W, order('prep_a')).visible).toBe(false);
    expect(num(s, W, 'prep.show')).toBe(0.5);
    expect(test(s, W, { prep: 'show' })).toBe(false);
    expect(test(s, W, { prep: 'show', done: false })).toBe(true);
    s.orderLog.done.prep_b = 1;
    expect(test(s, W, { prep: 'show' })).toBe(true);
    expect(prepStatus(s, W, 'show').costLeft).toBe(0);
  });
});

describe('设施掉档放下岗位上的人（W2 跟进）', () => {
  it('看场的设施停用：坐着的人放下来闲着，发 released 讲为什么；不算"白干了"', () => {
    const s = club();
    advance(s, FIX, [assign('dale', 'o1_rental')], 90);
    expect(s.people.dale?.job).toBe('o1_rental');
    s.facilities.outer_1 = 'worn';
    const ev = run(s, 1);
    expect(ev.filter((e) => e.type === 'released')).toEqual([
      { type: 'released', person: 'dale', post: 'o1_rental', facility: 'outer_1', reason: 'closed' },
    ]);
    expect(ev.some((e) => e.type === 'postInterrupted')).toBe(false);
    expect(s.people.dale?.job).toBeNull();
    // 重开以后习惯带他回去
    s.facilities.outer_1 = 'playable';
    until(s, (x) => x.people.dale?.job === 'o1_rental', 60);
    expect(s.people.dale?.job).toBe('o1_rental');
  });
});

describe('存档和机器人（W2）', () => {
  it('v8 存档迁移到 v9：补上选路、赛事和参赛记录、每人派去工单之前的岗位', () => {
    const s = newGame(CONTENT, { seed: 3 });
    const old = JSON.parse(JSON.stringify({ ...toSave(s, []), version: 8 }));
    old.state.version = 8;
    for (const k of ['routes', 'events', 'tournaments']) delete old.state[k];
    const { save } = fromSave(old);
    expect(save.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(9);
    expect(save.state).toMatchObject({ routes: {}, events: {}, tournaments: {} });
    expect(save.state.people.director?.back).toBeNull();
    advance(save.state, CONTENT, [], 60);
  });
  it('机器人报名赛事、坐临时岗位；同一种子重放哈希一致，状态能 JSON 往返', () => {
    for (const bot of [greedyBot(), humanBot(4, humanProfile(0.5))]) {
      const r = runGame(FIX, bot, 4, { maxDays: 15 });
      expect(r.state.tournaments.cup?.entries ?? 0, bot.name).toBeGreaterThanOrEqual(1);
      const again = replay(FIX, { seed: 4 }, r.commands, r.state.t);
      expect(stateHash(again)).toBe(stateHash(r.state));
      expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    }
  });
});

describe('内容编译（W2 schema）', () => {
  const files = (extra: Record<string, string>) => ({ ...BASE, ...extra });
  const BASE: Record<string, string> = {};
  it('选路、分期筹备、赛事的引用和文案都检查', () => {
    // 用一份最小内容只验编译器的报错（完整内容的编译在 content 包的测试里）
    const r = compileContent(
      files({
        'stats.yaml': '- { id: cash, min: -99999, max: 99999, display: money, act: all }',
        'facilities.yaml': '- { id: court, anchor: a, states: { open: {} } }',
        'traits.yaml': '[]',
        'people/p.yaml': '- { id: director, name: D, role: director, skill: 50 }',
        'directors/d.yaml':
          'id: d\ninterval: 1h\nmax_open: 2\npressure: "0"\nweights: { crisis: 1, relief: 1, comedy: 1, neutral: 1 }',
        'orders/sign.yaml': 'id: sign\nact: x\nat: a\nskill: service\nwork: 1h\neffects: [{ route: s9, set: nope }]',
        'orders/ph.yaml': 'id: ph\nact: x\nat: a\nskill: service\nwork: 1h\nprep: show\nwhen: { prep: nothing }',
        'acts/x.yaml': [
          'id: x',
          'start: { day: 1, hour: 8 }',
          'hours: { open: 8, close: 20 }',
          'stats: {}',
          'facilities: { court: open }',
          'people: [{ id: director, at: a }]',
          'anchors: [a]',
          'nav: []',
          'director_config: d',
          'rules: { quality_target: "0", quality_rate: 0.1, dues_week: 0 }',
          'routes: { s2: [youth, resort] }',
          'tournaments:',
          '  - { id: cup, kind: host, at: a, weeks: [1], order: sign, posts: [nopost], goals: [{ id: g, if: "event.staffed >= 1" }] }',
        ].join('\n'),
        'i18n/en.yaml': 'x: 1',
      }),
    );
    const msgs = r.errors.map((e) => e.message).join('\n');
    expect(msgs).toContain("unknown route slot 's9'");
    expect(msgs).toContain("no order has prep 'nothing'");
    expect(msgs).toContain("unknown post 'nopost'");
    expect(msgs).toContain("missing text 'tournaments.cup.title'");
    expect(msgs).toContain("missing text 'tournaments.cup.goals.g'");
    expect(msgs).toContain("missing text 'routes.s2.youth'");
    expect(msgs).toContain("missing text 'prep.show'");
    expect(msgs).not.toContain('event.staffed');
  });
});

/* ---------------- W2 闸口试玩的修正：有人守的地方掉得慢、守着的岗位、两天的赛事 ---------------- */

describe('有人守的地方维持住（准则 6，W2 闸口 P1）', () => {
  const CW = worldFor(CONTENT, 'indian_wells');
  /** 会员场能打、状况 90，Dale 在会员场；第 1 天 8:00 */
  const court = (): GameState => {
    const s = quiet(newGame(CONTENT, { seed: 2 }));
    s.facilities.outer_1 = 'playable';
    s.condition.outer_1 = 90;
    (s.people.dale as { at: string }).at = 'outer_1';
    return s;
  };
  const closeOf = (s: GameState, content = CONTENT) => {
    const d = dayOf(s.t);
    while (dayOf(s.t) === d) advance(s, content, [], 1);
  };

  it('今天有人在这处设施的岗位上干完过一圈：收盘衰减乘 staffed_decay；没人：照 decay_day 掉', () => {
    const empty = court();
    closeOf(empty);
    expect(empty.condition.outer_1).toBeCloseTo(90 - 5, 5);
    const kept = court();
    advance(kept, CONTENT, [assign('dale', 'o1_rental')], 0);
    closeOf(kept);
    const cycles = kept.week.cycles?.o1_rental ?? 0;
    expect(cycles).toBeGreaterThan(0);
    // 看场每圈的使用磨损照算，日衰减乘 staffed_decay（内容里的数，W2 复验后是 0.1）
    const wear = CW.posts.get('o1_rental')?.wear ?? 0;
    const k = CW.act.rules.staffed_decay;
    expect(k).toBeLessThan(0.5);
    expect(kept.condition.outer_1).toBeCloseTo(90 - cycles * wear - 5 * k, 5);
  });

  it('dayDecay 讲得出今晚掉多少；倍数是内容里的 rules.staffed_decay', () => {
    const s = court();
    expect(dayDecay(s, CW, 'outer_1', 1)).toBe(5);
    s.ledger.o1_rental = { person: 'dale', cycles: 1, effects: [] };
    expect(staffedToday(s, CW).has('outer_1')).toBe(true);
    expect(dayDecay(s, CW, 'outer_1', 1.3)).toBeCloseTo(5 * 1.3 * CW.act.rules.staffed_decay, 5);
    const c = structuredClone(CONTENT) as ContentBundle;
    c.version = `${CONTENT.version}-staffed1`;
    const act = c.acts.find((a) => a.id === 'indian_wells');
    if (!act) throw new Error('no act');
    act.rules.staffed_decay = 1;
    expect(dayDecay(s, worldFor(c, 'indian_wells'), 'outer_1', 1)).toBe(5);
  });
});

describe('亲手派到"随时"岗位（维护）就守着（W2 闸口 P2，和人-13 一致）', () => {
  const court = (): GameState => {
    const s = quiet(newGame(CONTENT, { seed: 2 }));
    s.facilities.outer_1 = 'playable';
    s.condition.outer_1 = 70;
    (s.people.dale as { at: string }).at = 'outer_1';
    return s;
  };
  const toDay2 = (s: GameState, hour: number) => {
    while (!(dayOf(s.t) === 2 && minuteOfDay(s.t) >= hour * 60)) advance(s, CONTENT, [], 1);
  };

  it('白天的班在习惯里，玩家把他拖去维护：第二天早上不被习惯拉回看场', () => {
    const s = court();
    advance(s, CONTENT, [assign('dale', 'o1_rental')], 30);
    advance(s, CONTENT, [assign('dale', 'o1_upkeep')], 0);
    expect(s.people.dale).toMatchObject({ job: 'o1_upkeep', pin: 'o1_upkeep' });
    expect(s.people.dale?.routine).toEqual(['o1_upkeep', 'o1_rental']); // 习惯照记（ADR 0014）
    toDay2(s, 9);
    expect(s.people.dale?.job).toBe('o1_upkeep');
    // 叫停就不守了；再派去看场，过了时段照习惯去维护、第二天又回看场
    advance(s, CONTENT, [assign('dale', null)], 0);
    expect(s.people.dale?.pin).toBeNull();
  });

  it('习惯自己带去的维护不算守着：看场过了时段去维护，第二天 8 点回看场（ADR 0014 照旧）', () => {
    const s = court();
    advance(s, CONTENT, [assign('dale', 'o1_upkeep')], 10);
    advance(s, CONTENT, [assign('dale', 'o1_rental')], 0);
    expect(s.people.dale?.pin).toBeNull();
    while (minuteOfDay(s.t) < 15 * 60 + 30) advance(s, CONTENT, [], 1);
    expect(s.people.dale).toMatchObject({ job: 'o1_upkeep', pin: null });
    toDay2(s, 8.5);
    expect(s.people.dale?.job).toBe('o1_rental');
  });

  it('守着的岗位没了（设施掉档）：放下来，不再守', () => {
    const s = court();
    advance(s, CONTENT, [assign('dale', 'o1_upkeep')], 5);
    s.facilities.outer_1 = 'worn';
    advance(s, CONTENT, [], 11);
    expect(s.people.dale).toMatchObject({ job: null, pin: null });
  });
});

describe('两天的主办赛事：派上临时岗位的人两天都守着（W2 闸口 P2）', () => {
  const c2 = structuredClone(FIX) as ContentBundle;
  c2.version = `${FIX.version}-twoday`;
  const act = c2.acts.find((a) => a.id === 'indian_wells');
  if (!act) throw new Error('no act');
  const cup = act.tournaments?.find((t) => t.id === 'cup');
  if (!cup) throw new Error('no cup');
  cup.days = [5, 6];
  for (const k of Object.keys(act.weather)) act.weather[k] = { sun: 1, cloud: 0, rain: 0, wind: 0 };
  const W2 = worldFor(c2, 'indian_wells');
  const go = (s: GameState, mins: number) => advance(s, c2, [], mins).events;
  /** 会所开着、Dale 的习惯是前台（8–18）；总监报了名；推到第 6 天开门 */
  const entered = (): GameState => {
    const s = club(5);
    s.facilities.clubhouse = 'open';
    s.condition.clubhouse = 90;
    advance(s, c2, [assign('dale', 'ch_desk'), assign('director', 'cup_signup')], 0);
    for (let i = 0; i < 3 * 60 && !s.events.cup; i++) go(s, 1);
    expect(s.events.cup).toBeDefined();
    while (dayOf(s.t) < 6) go(s, 1);
    return s;
  };

  it('第二天开门他先按习惯去前台，临时岗位到点（9 点）自己回去；"全程有人"的目标达成', () => {
    const s = entered();
    expect(W2.editions.get('cup')?.[0]?.days).toEqual([6, 7]);
    advance(s, c2, [assign('director', 't_checkin'), assign('dale', 't_umpire')], 0);
    expect(s.people.dale?.pin).toBe('t_umpire');
    expect(s.people.dale?.routine).not.toContain('t_umpire');
    while (dayOf(s.t) < 7 || minuteOfDay(s.t) < 10 * 60) go(s, 1);
    expect(s.people.dale?.job).toBe('t_umpire');
    expect(s.people.director?.job).toBe('t_checkin');
    const ev: SimEvent[] = [];
    while (s.events.cup) ev.push(...go(s, 1));
    // 前台那一小时没人（服务率的目标看全园）；临时岗位两天都有人
    const done = ev.find((e) => e.type === 'tournament_done');
    expect(done && 'goals' in done ? done.goals.find((g) => g.id === 'staffed') : null).toEqual({
      id: 'staffed',
      met: true,
    });
    expect(ev.some((e) => e.type === 'tournament_goal_missed')).toBe(false);
    // 收赛后临时岗位没了：放下来、不再守，第二天照习惯回前台
    go(s, 11);
    expect(s.people.dale?.pin).toBeNull();
  });

  it('第二天没人守临时岗位：目标没达成，发 tournament_goal_missed 讲是哪几个岗位，日志里也记着', () => {
    const s = entered();
    advance(s, c2, [assign('director', 't_checkin'), assign('dale', 't_umpire')], 0);
    while (dayOf(s.t) < 7) go(s, 1);
    // 玩家第二天一早把两个人都派走（Dale 已经被习惯带去了前台：再拖到前台上也算"就守这儿"）
    advance(s, c2, [assign('dale', 'ch_desk'), assign('director', null)], 0);
    expect(s.people.dale?.pin ?? null).toBeNull();
    const ev: SimEvent[] = [];
    while (s.events.cup) ev.push(...go(s, 1));
    const done = ev.find((e) => e.type === 'tournament_done');
    expect(done).toMatchObject({ goals: [{ id: 'service' }, { id: 'staffed', met: false }] });
    const missed = ev.find((e) => e.type === 'tournament_goal_missed');
    expect(missed).toMatchObject({ tournament: 'cup', goal: 'staffed' });
    expect(missed && 'staffed' in missed ? missed.staffed : 1).toBeLessThanOrEqual(0.5);
    expect(missed && 'posts' in missed ? missed.posts.map((p) => p.post).sort() : []).toEqual([
      't_checkin',
      't_umpire',
    ]);
    const log = s.log.find((x) => x.cause.kind === 'tournament');
    expect(log?.cause).toMatchObject({ unstaffed: [{ goal: 'staffed' }] });
  });
});
