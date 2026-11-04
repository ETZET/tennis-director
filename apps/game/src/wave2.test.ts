import {
  advance,
  at,
  type Card,
  CONTENT,
  type ContentBundle,
  dayOf,
  type GameState,
  type Order,
  type Post,
  type SimEvent,
} from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText, type Lang } from './text';

/**
 * Wave 2 的界面投影：季节栏的节拍（UI-9）、赛事在地点清单和快讯里、选路卡、放人和回岗的快讯。
 * 内容还在写，这里给 Indian Wells 补一份小示例（和 sim 的 wave2.test.ts 同一套）：
 * 主办赛事 cup（会员场，第 1、2 周周六）、外出赛事 open（大门，第 2 周周三）、选路 s2、分期筹备 show（中心球场两期）。
 */
function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-ui-w2`;
  const rental = c.posts.find((x) => x.id === 'o1_rental') as Post;
  const temp = (id: string, skill: Post['skill']): Post => ({
    ...rental,
    id,
    skill,
    hours: [9, 17],
    effects: [{ stat: 'cash', add: 1 }],
    wear: 0,
  });
  // 内容里已经有临时岗位的就用内容里的
  for (const [id, k] of [
    ['t_checkin', 'service'],
    ['t_umpire', 'teach'],
  ] as const)
    if (!c.posts.some((x) => x.id === id)) c.posts.push(temp(id, k));
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
    { ...base, id: 'open_go', at: 'entrance', skill: 'play', work: '2h', only: ['player'] },
    { ...base, id: 'prep_a', at: 'stadium_1', cost: 100, prep: 'show' },
    { ...base, id: 'prep_b', at: 'stadium_1', cost: 200, prep: 'show' },
  );
  const repair = c.orders.find((x) => x.id === 'o23_repair') as Order;
  const f = c.facilities.find((x) => x.id === 'outer_23');
  if (!f) throw new Error('no outer_23');
  f.variants = { clay: {}, hard: {} };
  repair.variants = { clay: { when: { route: 's2', is: 'youth' } }, hard: { when: { route: 's2', is: 'resort' } } };
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
      reward: [{ trophy: 1 }, { stat: 'reputation', add: 4 }],
      goals: [
        { id: 'service', if: 'event.service_rate >= 0.8', reward: [{ stat: 'members', add: 2 }] },
        { id: 'staffed', if: 'event.staffed >= 0.9', reward: [{ stat: 'cash', add: 100 }] },
      ],
      repeat: { scale: 0.5 },
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
      goals: [{ id: 'win', chance: '0.5', reward: [{ trophy: 1 }] }],
      repeat: { scale: 0.5 },
    },
  ];
  return c;
}
const FIX = fixture();

function setup(lang: Lang = 'en') {
  const session = Session.fresh(FIX, 3);
  const s = session.s;
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 90;
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
  const text = createText(FIX, lang);
  const projector = new Projector(FIX, text);
  /** 推进 mins 分钟，事件交给投影攒快讯 */
  const step = (mins: number, cmds: Parameters<typeof advance>[2] = []) => {
    const ev = advance(s, FIX, cmds, mins).events;
    projector.onEvents(s, ev);
    return ev;
  };
  const until = (f: (s: GameState) => boolean, max = 20000) => {
    const ev: SimEvent[] = [];
    for (let i = 0; i < max && !f(s); i++) ev.push(...step(1));
    return ev;
  };
  return { session, s, text, projector, step, until };
}
const assign = (person: string, target: string | null) => ({ type: 'assign', person, target }) as const;
const raw = /\b(ui|tournaments|routes)\.[\w.]+/;

describe('season beats (UI-9)', () => {
  it('shows the next two beats with day and time, and where they happen', () => {
    for (const lang of ['en', 'zh'] as const) {
      const { session, projector } = setup(lang);
      const beats = projector.snapshot(session).season?.beats ?? [];
      expect(beats.length).toBe(2);
      // 第一期 cup（第 6 天周六 9 点）、外出赛 open（第 10 天周三）
      expect(beats[0]?.place).toBe('outer_1');
      expect(beats[0]?.when).toMatch(lang === 'en' ? /Sat 9/ : /周六 9:00/);
      for (const b of beats) expect(`${b.label} ${b.when}`).not.toMatch(raw);
    }
  });

  it('includes hiring days and the calendar (investor, deadline) in time order', () => {
    const { session, s, projector } = setup();
    s.cards.scheduled = [{ card: 'iw_hiring_day_2', at: at(3, 9), cause: null }];
    const beats = projector.snapshot(session).season?.beats ?? [];
    expect(beats[0]?.label).toBe('Hiring day');
    expect(beats[0]?.when).toMatch(/Tmrw|Day|Wed|Thu/);
    // 投资方（第 85 天）在节拍里，赛事都过了以后
    s.t = at(80, 9);
    const late = projector.snapshot(session).season?.beats ?? [];
    expect(late.map((b) => b.label)).toContain('Investor visit');
  });
});

describe('tournaments in the place list', () => {
  it('sign-up order shows date and fee; away orders say when they can leave', () => {
    const { session, projector } = setup();
    session.place = 'outer_1';
    const row = projector.snapshot(session).place?.rows.find((r) => r.id === 'cup_signup');
    expect(row?.badge).toBe('Event');
    expect(row?.line).toMatch(/Sat 9.*\$60/);
    session.place = 'entrance';
    session.s.t = at(4, 9);
    const away = projector.snapshot(session).place?.rows.find((r) => r.id === 'open_go');
    // 第 10 天（周三）开赛，提前一周挂出来
    expect(away?.line).toMatch(/Leaves Wed 9.*\$200/);
    expect(away?.chips?.some((c) => c.text.startsWith('−$200'))).toBe(true);
  });

  it('after sign-up: goals on the sheet, temp posts tagged on the day, results in the news', () => {
    const { session, s, projector, step, until } = setup();
    step(0, [assign('director', 'cup_signup'), assign('dale', 'cup_signup')]);
    until((x) => !!x.events.cup, 3 * 60);
    expect(projector.snapshot(session).wire[0]?.text).toMatch(/Signed up for the cup · starts/);
    session.place = 'outer_1';
    const before = projector.snapshot(session).place?.event;
    expect(before?.line).toMatch(/Signed up · starts/);
    expect(before?.goals.map((g) => g.id)).toEqual(['service', 'staffed']);
    until((x) => dayOf(x.t) === 6 && x.t >= at(6, 9) + 5, 8 * 1440);
    s.weather = 'sun';
    step(0, [assign('director', 't_checkin'), assign('dale', 't_umpire')]);
    step(30);
    session.place = 'outer_1';
    const sheet = projector.snapshot(session).place;
    expect(sheet?.event?.line).toMatch(/Playing · ends/);
    expect(sheet?.event?.goals[1]?.value).toMatch(/%\/90%$/);
    expect(sheet?.rows.find((r) => r.id === 't_checkin')?.badge).toBe('Today');
    // 比赛日占了场：看场留一行说明
    expect(sheet?.rows.find((r) => r.id === 'o1_rental')?.locked).toBe(true);
    until((x) => !x.events.cup, 12 * 60);
    const news = projector.snapshot(session).wire.map((x) => x.text);
    expect(news.some((t) => /cup done · [✓✗] service ✓ staffed · Troph.* \+1/.test(t))).toBe(true);
    expect(news.some((t) => /Tournament over, Check-in desk packed up · Director is free now/.test(t))).toBe(true);
    for (const t of news) expect(t).not.toMatch(raw);
  });

  it('rain: the news says the fee is lost', () => {
    const { session, s, projector } = setup('zh');
    projector.onEvents(s, [
      {
        type: 'log',
        entry: {
          id: 1,
          t: s.t,
          parent: null,
          effects: [],
          cause: { kind: 'tournament', tournament: 'cup', result: 'spoiled', goals: {}, repeat: 0, scale: 1 },
        },
      },
    ]);
    expect(projector.snapshot(session).wire[0]?.text).toMatch(/报名费 \$60 白花了/);
  });
});

describe('exhibition prep on the place sheet', () => {
  it('lists the phases with costs and done marks', () => {
    const { session, s, projector } = setup();
    session.place = 'stadium_1';
    s.orderLog.done.prep_a = 1;
    const prep = projector.snapshot(session).place?.prep;
    expect(prep?.phases.map((x) => [x.id, x.done, x.cost])).toEqual([
      ['prep_a', true, '$100'],
      ['prep_b', false, '$200'],
    ]);
    expect(prep?.foot).toMatch(/1 to go · \$200/);
  });
});

describe('route card', () => {
  const open = (s: GameState) => {
    s.cards.open = [{ uid: 99, card: 'route_s2', opened: s.t, expires: s.t + 1440, cause: null }];
  };
  it('each option says what it opens and what it costs; Dale decides when time runs out', () => {
    for (const lang of ['en', 'zh'] as const) {
      const { session, s, projector } = setup(lang);
      open(s);
      const card = projector.snapshot(session).card;
      expect(card?.answers?.length).toBe(2);
      const [a, b] = card?.answers ?? [];
      expect(a?.opens).toBeTruthy();
      expect(a?.costs).toBeTruthy();
      expect(b?.opens).not.toBe(a?.opens);
      expect(card?.note).toMatch(/Dale/);
      expect(card?.countdown).toBeDefined();
      for (const x of [a?.text, a?.opens, a?.costs, a?.hint, card?.note]) expect(x ?? '').not.toMatch(raw);
    }
  });

  it('a first tap previews and pans: routeFocus points at the first variant the route opens', () => {
    const { session, s, projector } = setup();
    open(s);
    session.routePick = { uid: 99, option: 'B' };
    const f = projector.routeFocus(session);
    const opens = projector.routeVariants(s, 's2', 'resort');
    expect(opens.map(([, v]) => v)).toContain('hard');
    expect(opens[0]).toEqual([f?.facility, f?.variant]);
    expect(f?.anchor).toBeTruthy();
    const b = projector.snapshot(session).card?.answers?.[1];
    expect(b?.previewing).toBe(true);
    expect(b?.hint).toBe('Tap again to decide');
  });
});

describe('releases and returns in the news', () => {
  it('says why a person is free, and where they went back', () => {
    const { session, s, projector } = setup();
    projector.onEvents(s, [
      { type: 'released', person: 'dale', post: 'o1_rental', facility: 'outer_1', reason: 'closed' },
      { type: 'returned', person: 'dale', post: 'o1_rental', order: 'cup_signup' },
    ]);
    const [ret, rel] = projector.snapshot(session).wire;
    expect(rel?.text).toMatch(/closed · .* is free now/);
    expect(ret?.text).toMatch(/finished .* went back to/);
  });
});
