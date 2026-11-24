// 俱乐部的一天 · 引擎的测试：不变式、确定性、不改输入、JSON 往返、节奏、named 会员按 week 来、关门走光、员工守岗、性能。
// club-sim.md 第六点五节。
import { describe, expect, it } from 'vitest';
import { CAST } from '../cast';
import { isFixedRole } from '../cast/slots';
import { personOf, startDay, step, stepMany, view } from './engine';
import { PLACE_BY_ID, PLACES, POST_OF_SLOT } from './places';
import { CLOSE, calendar, DAY_END, defaultWeather, H, OPEN, travelMin, WALK_M_PER_MIN } from './plan';
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
        // 窗口边等餐的站在 cap 之后的位置（cap + k）
        const p = byId.get(v.where.at);
        expect(v.spot).toBeLessThan((p?.cap ?? 0) + (p?.pickup ?? 0));
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

describe('第 1 轮 critique 的几条', () => {
  it('走路 12 米 / 游戏分钟（画面用同一个数）：停车场走到餐车院子十来分钟', () => {
    expect(WALK_M_PER_MIN).toBe(12);
    const m = travelMin(PLACE_BY_ID['park.lotN'], PLACE_BY_ID['food.taco']);
    expect(m).toBeGreaterThanOrEqual(10);
    expect(m).toBeLessThanOrEqual(20);
  });

  it('平日午饭：吃饭的人多、集中，三家以上的餐车前排着 ≥ 4 个人；平日只开四五家餐车', () => {
    for (const run of WEEK) {
      const cal = calendar(run.final.dayNo);
      const trucks = new Set(
        PLACES.filter((p) => p.scene === 'clubfood' && p.kind === 'stall' && p.needs).map((p) => p.needs),
      );
      const open = [...trucks].filter((post) =>
        run.final.log.some((e) => e.kind === 'shift' && e.at === post && e.doing === 'work'),
      ).length;
      if (cal.weekend) expect(open, `第 ${run.final.dayNo} 天`).toBe(trucks.size);
      else {
        expect(open, `第 ${run.final.dayNo} 天`).toBeGreaterThanOrEqual(4);
        expect(open, `第 ${run.final.dayNo} 天`).toBeLessThanOrEqual(5);
        expect([...run.rec.lunchQueue.values()].filter((n) => n >= 4).length).toBeGreaterThanOrEqual(3);
      }
      const at = (t: number) => run.rec.eating[run.rec.minutes.indexOf(t)];
      expect(Math.max(at(H(12)), at(H(12, 15)), at(H(12, 30)))).toBeGreaterThanOrEqual(30);
    }
  });

  it('窗口：点单 2–4 分钟，点完站到窗口边等餐（还在这个地点里，spot ≥ cap），等完才去找座', () => {
    const s = WEEK[1].final;
    const waits = s.log.filter((e) => e.kind === 'start' && e.doing === 'order' && /窗口边等/.test(e.note ?? ''));
    expect(waits.length).toBeGreaterThan(40);
  });

  it('平日人多：8–10 点、12 点九十人以上的客人；8–20 点员工不超过在场的 35%；20 点以后还有人', () => {
    for (const run of WEEK) {
      const { rec } = run;
      const hour = (h: number) => {
        const is = rec.minutes.map((t, i) => [t, i] as const).filter(([t]) => t >= h * 60 && t < h * 60 + 60);
        const avg = (xs: number[]) => is.reduce((s, [, i]) => s + xs[i], 0) / is.length;
        return { all: avg(rec.present), staff: avg(rec.staff) };
      };
      expect(Math.max(hour(9).all - hour(9).staff, hour(10).all - hour(10).staff)).toBeGreaterThan(80);
      expect(hour(12).all - hour(12).staff).toBeGreaterThan(90);
      for (let h = 8; h <= 20; h++) expect(hour(h).staff / hour(h).all, `${h} 点`).toBeLessThanOrEqual(0.35);
      expect(hour(20).all - hour(20).staff, `第 ${run.final.dayNo} 天 20 点`).toBeGreaterThan(30);
    }
  });

  it('老伤的人不上场；孩子不自己来、不开车；Tommy 平日跟着 Verónica 来', () => {
    for (const run of WEEK) {
      const s = run.final;
      const played = new Set(
        s.log.filter((e) => e.kind === 'start' && (e.doing === 'tennis' || e.doing === 'pickle')).map((e) => e.agent),
      );
      for (const a of Object.values(s.agents)) {
        const p = personOf(cfg, s, a.id);
        if (p?.traits.includes('oldinjury') && !isFixedRole(a.role)) expect(played.has(a.id), a.id).toBe(false);
        if (
          p &&
          (p.role === 'kid' || p.look.body === 'kid') &&
          !s.log.some((e) => e.agent === a.id && e.kind === 'shift')
        ) {
          if (!s.log.some((e) => e.agent === a.id && e.kind === 'arrive')) continue;
          const party = a.party ? s.parties[a.party] : undefined;
          expect(party && party.lead !== a.id, `${a.id} 第 ${s.dayNo} 天`).toBe(true);
        }
      }
      const wd = calendar(s.dayNo).weekday;
      if (wd < 5 && s.agents.tommy && s.agents.veronica)
        expect(s.agents.tommy.party, `第 ${s.dayNo} 天`).toBe(s.agents.veronica.party);
    }
  });

  it('一天里不撞名：生成的人英文全名不重，也不和有名有姓的人同名', () => {
    const named = new Set(
      CAST.roster()
        .filter((p) => p.tier === 'named')
        .map((p) => p.nameZh),
    );
    for (const run of WEEK) {
      const s = run.final;
      const seen = new Set<string>();
      for (const id of Object.keys(s.agents)) {
        const p = personOf(cfg, s, id);
        if (!p) continue;
        expect(seen.has(p.name), `${p.name} 第 ${s.dayNo} 天`).toBe(false);
        seen.add(p.name);
        if (id.startsWith('guest:sim:') || id.startsWith('staff:sim:'))
          expect(named.has(p.nameZh), p.nameZh).toBe(false);
      }
    }
  });

  it('没人在开门前到、没人来了半小时就走；风沙天不冲着泳池来；"没干成"同一件事只记一次', () => {
    const wind = runDay(cfg, 10, { weather: { high: 30, rain: false, wind: true }, check: false });
    const summer = runDay(cfg, 200, { weather: { high: 42, rain: false, wind: false }, check: false });
    for (const run of [...WEEK, wind, summer]) {
      const s = run.final;
      const first = new Map<string, number>();
      for (const e of s.log) {
        const a = s.agents[e.agent];
        if (isFixedRole(a.role)) continue;
        if (e.kind === 'arrive') {
          expect(e.t, `${e.agent} 第 ${s.dayNo} 天`).toBeGreaterThanOrEqual(OPEN);
          first.set(e.agent, e.t);
        }
        if (e.kind === 'start' && e.doing === 'leave' && !/关门/.test(e.note ?? ''))
          expect(e.t - (first.get(e.agent) ?? 0), `${e.agent} 第 ${s.dayNo} 天：${e.note}`).toBeGreaterThanOrEqual(30);
      }
      const misses = s.log.filter((e) => e.kind === 'full').map((e) => `${e.agent}|${e.note}`);
      expect(new Set(misses).size, `第 ${s.dayNo} 天`).toBe(misses.length);
    }
    expect(wind.final.log.filter((e) => /想游泳|想晒太阳/.test(e.note ?? '')).length).toBe(0);
  });

  it('泳池：救生员歇班有人顶，营业时间里不关；暂停了游泳的人在池边等，不回家', () => {
    for (const run of WEEK) {
      const [on, all] = run.rec.staffedMin.get('pool.water') ?? [0, 1];
      expect(on / all, `第 ${run.final.dayNo} 天`).toBe(1);
    }
    for (const run of WEEK)
      for (const e of run.final.log)
        if (e.kind === 'start' && e.doing === 'leave') expect(e.note ?? '').not.toMatch(/救生员|池子/);
  });

  it('表演赛：观众 17:25–18:25 陆续到，散场分几拨走（不是一下子全走）', () => {
    const run = WEEK[2];
    expect(calendar(run.final.dayNo).exhibition).toBe(true);
    const s = run.final;
    const spect = Object.keys(s.agents).filter(
      (id) => personOf(cfg, s, id)?.homes[0]?.scene === 'clubstadium' && id.startsWith('guest:sim:'),
    );
    const arr = s.log.filter((e) => e.kind === 'arrive' && spect.includes(e.agent)).map((e) => e.t);
    expect(Math.max(...arr) - Math.min(...arr)).toBeGreaterThanOrEqual(45);
    const left = s.log.filter((e) => e.kind === 'leave' && spect.includes(e.agent)).map((e) => e.t);
    const inWin = (a: number, b: number) => left.filter((t) => t >= a && t < b).length;
    // 最挤的二十分钟走的不到一半
    let worst = 0;
    for (let t = H(19); t < H(21, 30); t += 5) worst = Math.max(worst, inWin(t, t + 20));
    expect(worst).toBeLessThan(left.length * 0.5);
  });

  it('教练：第一节课前半小时左右到，最后一节课完了就走，中间有歇（不在空场上站十一个钟头）', () => {
    for (const run of WEEK) {
      const s = run.final;
      const jess = s.log.filter((e) => e.agent === 'jess');
      if (!jess.length) continue;
      const coach = jess.filter((e) => e.kind === 'start' && e.doing === 'coach').map((e) => e.t);
      // 周日她在中心球场当陪练（演员表），不带课
      if (calendar(s.dayNo).weekday === 6) continue;
      const arrive = jess.find((e) => e.kind === 'arrive')?.t ?? 0;
      const leave = jess.find((e) => e.kind === 'leave')?.t ?? 0;
      expect(coach.length, `第 ${s.dayNo} 天`).toBeGreaterThanOrEqual(2);
      expect(Math.min(...coach) - arrive).toBeLessThanOrEqual(60);
      expect(leave - Math.max(...coach)).toBeLessThanOrEqual(60 + 60);
      // 歇过（歇班、坐下吃饭、场边坐着歇）
      expect(
        jess.some((e) => e.doing === 'break' || e.doing === 'eat' || e.doing === 'rest' || e.doing === 'watch'),
      ).toBe(true);
    }
  });
});

describe('停车、出入口', () => {
  it('每个排了日程的人都到了（一伙人比出入口大也能下车）', () => {
    for (const run of [...WEEK, runDay(cfg, 3, { weather: defaultWeather(1, 3), check: false })]) {
      const s = run.final;
      const stuck = Object.values(s.agents).filter((a) => a.where.kind === 'away' && a.plan.length);
      expect(
        stuck.map((a) => a.id),
        `第 ${s.dayNo} 天`,
      ).toEqual([]);
      for (const p of Object.values(s.parties)) {
        const e = PLACE_BY_ID[s.agents[p.lead].entry];
        if (p.members.length > e.cap)
          for (const m of p.members)
            expect(
              s.log.some((x) => x.kind === 'arrive' && x.agent === m),
              m,
            ).toBe(true);
      }
    }
  });

  it('开车来的一伙人一个车位；两个停车场停满了交给代客泊车；一伙人坐一辆车；员工停员工区', () => {
    const run = WEEK[2];
    const s0 = startDay(cfg, run.final.dayNo, FAIR);
    let s = s0;
    let peak = 0;
    let valet = 0;
    while (s.minute < H(21)) {
      s = step(cfg, s, DESK).state;
      const parked = new Set<string>();
      for (const a of Object.values(s.agents))
        if (a.where.kind !== 'away' && (a.car === 'lotN' || a.car === 'lotS')) parked.add(`${a.car}#${a.stall}`);
      peak = Math.max(peak, parked.size);
    }
    for (const a of Object.values(s.agents)) {
      if (a.car === 'valet') valet++;
      if (isFixedRole(a.role) && a.role !== 'kid') expect(['staff', 'drop', 'walk']).toContain(a.car);
      if (a.party) expect(a.car, a.id).toBe(s.agents[s.parties[a.party].lead].car);
    }
    const stalls = PLACES.reduce((n, p) => n + (p.stalls ?? 0), 0);
    expect(peak).toBe(stalls);
    expect(valet).toBeGreaterThan(20);
    expect(s.log.some((e) => /停满了/.test(e.note ?? ''))).toBe(true);
  });
});

describe('性能', () => {
  it('引擎一整天（最忙的周六）< 1 秒；排一天的日程 < 80 毫秒（机器忙的时候量几次取最快的）', () => {
    let day = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3 && day >= 1000; i++) day = Math.min(day, runDay(cfg, 6, { weather: FAIR, check: false }).ms);
    expect(day).toBeLessThan(1000);
    let plan = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      startDay(cfg, 6, FAIR);
      plan = Math.min(plan, performance.now() - t0);
    }
    expect(plan).toBeLessThan(80);
  });

  it('快进（stepMany）和一步一步走结果一模一样，不改传进来的状态', () => {
    const s = runTo(startDay(cfg, 3, FAIR), H(9));
    const before = JSON.stringify(s);
    const a = stepMany(cfg, s, 240, DESK);
    let b = s;
    const ev: unknown[] = [];
    for (let i = 0; i < 240; i++) {
      const r = step(cfg, b, DESK);
      b = r.state;
      ev.push(...r.events);
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b));
    expect(a.events).toEqual(ev);
    expect(JSON.stringify(s)).toBe(before);
  });
});
