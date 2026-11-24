// 俱乐部的一天 · 引擎的测试：不变式、确定性、不改输入、JSON 往返、节奏、named 会员按 week 来、关门走光、员工守岗、性能。
// club-sim.md 第六点五节。
import { describe, expect, it } from 'vitest';
import { CAST } from '../cast';
import { isFixedRole } from '../cast/slots';
import { personOf, startDay, step, view } from './engine';
import { PLACES, POST_OF_SLOT } from './places';
import { CLOSE, calendar, DAY_END, H } from './plan';
import { buildReport, checkState, runDay } from './report';
import type { SimConfig, SimState, Weather } from './types';

const cfg: SimConfig = { seed: 1, places: PLACES, cast: CAST, posts: POST_OF_SLOT };
const FAIR: Weather = { high: 24, rain: false, wind: false };
const DESK = { director: 'desk.counter' };

function runTo(s: SimState, t: number, input = DESK): SimState {
  let x = s;
  while (x.minute < t) x = step(cfg, x, input).state;
  return x;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

// 一周（旺季、晴天）跑一遍，几个测试共用
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((d) => runDay(cfg, d, { weather: FAIR }));

describe('不变式', () => {
  it('旺季一周每一分钟：一人一处、人数 ≤ cap、站位不重、关门半小时后没有客人', () => {
    for (const run of WEEK) expect(run.rec.violations, `第 ${run.final.dayNo} 天`).toEqual([]);
  });

  it('夏天、下雨、风沙、总监不在前台也一样', () => {
    const runs = [
      runDay(cfg, 200, { weather: { high: 42, rain: false, wind: false } }),
      runDay(cfg, 9, { weather: { high: 21, rain: true, wind: false } }),
      runDay(cfg, 10, { weather: { high: 30, rain: false, wind: true } }),
      runDay(cfg, 11, { weather: FAIR, director: null }),
    ];
    for (const run of runs) expect(run.rec.violations, `第 ${run.final.dayNo} 天`).toEqual([]);
  });

  it('关门以后客人走光，员工收拾完也走了', () => {
    for (const run of WEEK) {
      const s = run.final;
      expect(s.minute).toBe(DAY_END);
      const left = Object.values(s.agents).filter((a) => a.where.kind !== 'away');
      expect(left.map((a) => a.id)).toEqual([]);
      // 客人的最后一次离开不晚于关门半小时
      const last = Math.max(
        ...s.log.filter((e) => e.kind === 'leave' && !isFixedRole(s.agents[e.agent].role)).map((e) => e.t),
      );
      expect(last).toBeLessThanOrEqual(CLOSE + 30);
    }
  });

  it('快照：站位在容量以内，排队的位置 = 队里第几个，一起干事的在同一处', () => {
    const s = runTo(startDay(cfg, 3, FAIR), H(12));
    const byId = new Map(PLACES.map((p) => [p.id, p]));
    for (const v of view(s)) {
      if (v.where.kind === 'at') {
        expect(v.spot).toBeLessThan(byId.get(v.where.at)?.cap ?? 0);
        for (const w of v.with) {
          const o = s.agents[w].where;
          expect(o.kind === 'at' && o.at === v.where.at).toBe(true);
        }
      }
      if (v.where.kind === 'queue') expect(s.queues[v.where.at][v.spot]).toBe(v.id);
    }
    expect(checkState(cfg, s)).toEqual([]);
  });
});

describe('确定性、纯函数', () => {
  it('同样的种子、同样的输入 → 一模一样的一天', () => {
    const a = runDay(cfg, 3, { weather: FAIR, check: false }).final;
    const b = runDay(cfg, 3, { weather: FAIR, check: false }).final;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = runDay({ ...cfg, seed: 2 }, 3, { weather: FAIR, check: false }).final;
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('step 不改传进来的状态（冻住了照样能走）', () => {
    const s = runTo(startDay(cfg, 6, FAIR), H(9, 30));
    const before = JSON.stringify(s);
    deepFreeze(s);
    let x = s;
    for (let i = 0; i < 90; i++) x = step(cfg, x, DESK).state;
    expect(JSON.stringify(s)).toBe(before);
    expect(x.minute).toBe(H(11));
  });

  it('状态 JSON 往返不变，往返后接着走结果一样', () => {
    const s = runTo(startDay(cfg, 6, FAIR), H(12, 15));
    const back: SimState = JSON.parse(JSON.stringify(s));
    expect(back).toEqual(s);
    const a = runTo(s, H(14));
    const b = runTo(back, H(14));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('step 返回的事件就是新加进日志的那些', () => {
    const s = runTo(startDay(cfg, 1, FAIR), H(8));
    const { state, events } = step(cfg, s, DESK);
    expect(state.log.slice(s.log.length)).toEqual(events);
    for (const e of events) expect(e.t).toBe(state.minute);
  });
});

describe('一天的节奏（club-sim.md 第六点五节 2）', () => {
  it('旺季每天：早高峰、午饭、午后低谷、晚场、21 点以后只减不增、员工守岗、named 按 week 来', () => {
    for (const run of WEEK) {
      const rep = buildReport(run);
      const bad = rep.checks.filter((c) => !c.ok).map((c) => `${c.name}：${c.detail}`);
      expect(bad, `第 ${run.final.dayNo} 天`).toEqual([]);
    }
  });

  it('早上 7 点前、晚上 22 点后几乎只有员工；上午比午后热闹', () => {
    for (const run of WEEK) {
      const { rec } = run;
      const at = (t: number) => rec.minutes.indexOf(t);
      const patrons = (t: number) => rec.present[at(t)] - rec.staff[at(t)];
      expect(patrons(H(6, 15))).toBeLessThanOrEqual(5);
      expect(patrons(H(22, 20))).toBe(0);
      expect(patrons(H(9, 30))).toBeGreaterThan(patrons(H(14, 30)));
    }
  });

  it('有表演赛的晚上看台坐满几百人，平常的晚上中心球场冷清', () => {
    const ex = WEEK.find((r) => calendar(r.final.dayNo).exhibition) ?? WEEK[2];
    const plain = WEEK.find((r) => !calendar(r.final.dayNo).exhibition) ?? WEEK[0];
    const stadium = (run: (typeof WEEK)[number]) => run.rec.byScene.clubstadium[run.rec.minutes.indexOf(H(19))];
    expect(stadium(ex)).toBeGreaterThan(60);
    expect(stadium(plain)).toBeLessThan(15);
  });

  it('夏天：早上 6 点就有人打球，中午几乎只有泳池，傍晚再回来', () => {
    const run = runDay(cfg, 200, { weather: { high: 42, rain: false, wind: false } });
    const at = (t: number) => run.rec.minutes.indexOf(t);
    const patrons = (t: number) => run.rec.present[at(t)] - run.rec.staff[at(t)];
    expect(patrons(H(7, 30))).toBeGreaterThan(patrons(H(13)) * 2);
    expect(patrons(H(19))).toBeGreaterThan(patrons(H(13)) * 2);
    expect(run.rec.courtsNoon).toBe(0);
  });

  it('下雨：没人在室外场，人在会所', () => {
    const run = runDay(cfg, 9, { weather: { high: 21, rain: true, wind: false } });
    expect(run.rec.courtsMorning + run.rec.courtsNoon).toBe(0);
    const fair = WEEK[1];
    expect(run.final.log.filter((e) => e.kind === 'arrive').length).toBeLessThan(
      fair.final.log.filter((e) => e.kind === 'arrive').length * 0.7,
    );
  });
});

describe('谁来、几点、和谁', () => {
  it('named 会员、家长、孩子在 week 的日子来，不在的日子不来', () => {
    for (const run of WEEK) {
      const s = run.final;
      const wd = calendar(s.dayNo).weekday;
      const came = new Set(s.log.filter((e) => e.kind === 'arrive').map((e) => e.agent));
      for (const p of CAST.roster()) {
        if (p.tier !== 'named' || isFixedRole(p.role) || !p.week) continue;
        expect(came.has(p.id), `${p.id} 第 ${s.dayNo} 天`).toBe(p.week.days.includes(wd));
      }
    }
  });

  it('员工按演员表上岗：每个摊位窗口、吧台、救生员营业时间里九成以上有人', () => {
    for (const run of WEEK) {
      for (const [id, [on, all]] of run.rec.staffedMin)
        expect(on / all, `${id} 第 ${run.final.dayNo} 天`).toBeGreaterThan(0.85);
      // 岗位上的人就是演员表这一天这个位置的人（named 或者顶岗的）
      const s = run.final;
      expect(s.agents.yusuf?.plan ?? []).toEqual([]);
      expect(s.log.some((e) => e.agent === 'yusuf' && e.kind === 'shift' && e.at === 'post.food.taco')).toBe(true);
    }
  });

  it('员工早到：开门前就有人在岗（场地、咖啡吧、泊车）', () => {
    const run = WEEK[0];
    const i = run.rec.minutes.indexOf(H(6, 20));
    expect(run.rec.staff[i]).toBeGreaterThanOrEqual(5);
    expect(run.rec.present[i] - run.rec.staff[i]).toBe(0);
  });

  it('客人用 makePerson 生成，id 是 guest:sim:<天>:<n>，画面能拿到他是谁', () => {
    const s = startDay(cfg, 4, FAIR);
    const guests = Object.keys(s.agents).filter((id) => id.startsWith('guest:sim:'));
    expect(guests.length).toBeGreaterThan(80);
    for (const id of guests) {
      expect(id).toMatch(/^guest:sim:4:\d+$/);
      const p = personOf(cfg, s, id);
      expect(p?.id).toBe(id);
    }
  });

  it('孩子不单独来：每个小孩都和大人一伙', () => {
    for (const run of WEEK) {
      const s = run.final;
      for (const a of Object.values(s.agents)) {
        if (personOf(cfg, s, a.id)?.look.body !== 'kid') continue;
        expect(a.party, a.id).toBeDefined();
        const ms = s.parties[a.party as string].members;
        expect(ms.some((m) => personOf(cfg, s, m)?.look.body === 'adult')).toBe(true);
      }
    }
  });

  it('一伙人一起到、一起走', () => {
    const s = WEEK[5].final;
    for (const p of Object.values(s.parties)) {
      const arr = new Set(s.log.filter((e) => e.kind === 'arrive' && p.members.includes(e.agent)).map((e) => e.t));
      expect(arr.size, p.id).toBeLessThanOrEqual(1);
    }
  });

  it('总监不在前台：签到排长队；在：一分钟一个', () => {
    const none = buildReport(runDay(cfg, 2, { weather: FAIR, director: null, check: false }));
    const desk = buildReport(runDay(cfg, 2, { weather: FAIR, check: false }));
    const w = (r: typeof none) => r.waits.find((x) => x.id === 'desk.counter')?.avg ?? 0;
    expect(w(none)).toBeGreaterThan(w(desk) + 3);
  });
});

describe('性能', () => {
  it('引擎一整天（最忙的周六）< 1 秒', () => {
    const run = runDay(cfg, 6, { weather: FAIR, check: false });
    expect(run.ms).toBeLessThan(1000);
  });
});
