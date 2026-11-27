import { describe, expect, it } from 'vitest';
import { absMinute, alignClock, reconcileClock, setClock } from './clock';
import { CAST } from './index';
import {
  declareMap,
  earn,
  expireSeeks,
  headcount,
  matchScore,
  matchWindows,
  presenceOf,
  resolveSeek,
  seekersNow,
  seeksOfDay,
  visitWindows,
} from './presence';
import { initState } from './state';

const s0 = () => initState(CAST, CAST.seed);

describe('一个时钟', () => {
  it('平时演员表抄天光', () => {
    const r = reconcileClock(s0(), 9.5);
    expect(r.state.day).toBe(1);
    expect(r.state.minute).toBe(570);
    expect(r.total).toBe(9.5);
  });
  it('演员表自己往前跳（互动花了时间）：天光跟过去', () => {
    const s = setClock(s0(), 1, 600);
    const r = reconcileClock(s, 9.5);
    expect(r.total).toBeCloseTo(10);
    expect(r.state).toBe(s);
  });
  it('过夜：今天说话的次数清零', () => {
    const s = {
      ...s0(),
      people: { a: { favor: 5, mood: 90, met: true, talksToday: 3, giftDay: 0, rallies: 0, memory: [] } },
    };
    const r = reconcileClock(s, 24 + 7);
    expect(r.state.day).toBe(2);
    expect(r.state.people.a.talksToday).toBe(0);
    expect(r.state.people.a.mood).toBeLessThan(90);
  });
  it('开局：给了 ?hour= 听天光的，没给听存档的', () => {
    expect(alignClock(s0(), 15, true).total).toBe(15);
    expect(alignClock(s0(), 12, false).total).toBe(8);
    expect(absMinute({ day: 2, minute: 60 })).toBe(1500);
  });
});

describe('在场时段', () => {
  it('同样的输入同样的结果，按时间排好、不重叠', () => {
    for (const slot of ['bus-1', 'member-q1', 'desk-clerk', 'sun-1']) {
      const a = visitWindows(CAST.seed, 'clubdesk', slot, 3);
      expect(visitWindows(CAST.seed, 'clubdesk', slot, 3)).toEqual(a);
      for (let i = 1; i < a.length; i++) expect(a[i][0]).toBeGreaterThanOrEqual(a[i - 1][1]);
      for (const w of a) expect(w[1]).toBeGreaterThan(w[0]);
    }
  });
  it('员工一整天；路过的一天来很多趟', () => {
    const staff = visitWindows(CAST.seed, 'clubdesk', 'desk-clerk', 1);
    expect(staff).toHaveLength(1);
    expect(staff[0][1] - staff[0][0]).toBeGreaterThan(14 * 60);
    expect(visitWindows(CAST.seed, 'clubdesk', 'member-q1', 1, { flow: true }).length).toBeGreaterThan(8);
  });
  it('中心球场：当班的每场比赛都在', () => {
    const ms = matchWindows(CAST.seed, 1);
    expect(ms.length).toBeGreaterThanOrEqual(3);
    const ump = visitWindows(CAST.seed, 'clubstadium', 'umpire', 1);
    expect(ump).toHaveLength(ms.length);
    ump.forEach((w, i) => {
      expect(w[0]).toBeLessThan(ms[i][0]);
      expect(w[1]).toBeGreaterThan(ms[i][1]);
    });
  });
});

describe('在哪张图、找总监', () => {
  declareMap('arrive', 'clubdesk', [
    { slot: 'desk-clerk', kind: 'coach', flow: false },
    { slot: 'bus-1', kind: 'player', flow: false },
    { slot: 'bus-2', kind: 'player', flow: false },
    { slot: 'member-q1', kind: 'player', flow: true },
  ]);
  declareMap('oasis', 'clubpool', [
    { slot: 'sun-1', kind: 'player', flow: false },
    { slot: 'sun-2', kind: 'player', flow: false },
    { slot: 'edge-sit', kind: 'player', flow: false },
  ]);
  it('前台接待今天在到达图', () => {
    const id = CAST.who('clubdesk', 'desk-clerk', 'coach', 1).id;
    const p = presenceOf(CAST, { ...s0(), minute: 12 * 60 }, id);
    expect(p?.map).toBe('arrive');
    expect(p?.status).toBe('here');
    expect(headcount(CAST, { day: 1, minute: 12 * 60 }, 'arrive')).toBeGreaterThanOrEqual(1);
  });
  it('一天几个人找总监，各不相同、时间错开', () => {
    const ks = seeksOfDay(CAST, 1);
    expect(ks.length).toBeGreaterThan(0);
    expect(ks.length).toBeLessThanOrEqual(5);
    expect(new Set(ks.map((k) => k.id)).size).toBe(ks.length);
  });
  it('接上了：好感、钱、记一笔；过点没接上：好感掉', () => {
    const k = seeksOfDay(CAST, 1)[0];
    const s = { ...s0(), minute: k.from + 1 };
    expect(seekersNow(CAST, s).some((x) => x.id === k.id)).toBe(true);
    const r = resolveSeek(CAST, s, k.id);
    expect(r).not.toBeNull();
    expect(r?.state.people[k.id].favor).toBeGreaterThan(s.people[k.id]?.favor ?? 0);
    expect(seekersNow(CAST, r?.state ?? s).some((x) => x.id === k.id)).toBe(false);
    const late = { ...s0(), minute: k.until + 1 };
    const ex = expireSeeks(CAST, late, k.from);
    expect(ex.missed.some((x) => x.id === k.id)).toBe(true);
    // 开局就在过点以后：不算在总监头上
    expect(expireSeeks(CAST, late, k.until + 1).missed.some((x) => x.id === k.id)).toBe(false);
  });
  it('干活：钱进账、记今天几件', () => {
    const s = earn(earn(s0(), 5), 2);
    expect(s.money).toBe(127);
    expect(s.chores).toEqual({ day: 1, n: 2, money: 7 });
  });
});

describe('记分牌的比分', () => {
  it('开场 0:0，越打局数越多，盘数不超过 3', () => {
    expect(matchScore(CAST.seed, 1, 0, 0).sets).toEqual([[0, 0]]);
    const late = matchScore(CAST.seed, 1, 0, 0.95);
    expect(late.sets.length).toBeLessThanOrEqual(3);
    const games = (x: { sets: [number, number][] }) => x.sets.reduce((n, [a, b]) => n + a + b, 0);
    expect(games(late)).toBeGreaterThan(games(matchScore(CAST.seed, 1, 0, 0.3)));
    for (const [a, b] of late.sets) expect(Math.max(a, b)).toBeLessThanOrEqual(7);
  });
});
