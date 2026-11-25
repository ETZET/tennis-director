// 俱乐部的一天 · 引擎的测试：不变式、确定性、不改输入、JSON 往返、节奏、named 会员按 week 来、关门走光、员工守岗、性能。
// club-sim.md 第六点五节。
import { describe, expect, it } from 'vitest';
import { CAST } from '../cast';
import { isFixedRole } from '../cast/slots';
import { personOf, startDay, step, stepMany, VALET_PER_HOUR, view } from './engine';
import { PLACE_BY_ID, PLACES, POST_OF_SLOT } from './places';
import {
  CLOSE,
  calendar,
  DAY_END,
  defaultWeather,
  H,
  isWater,
  OPEN,
  picklesAnyway,
  rainedOn,
  travelMin,
  WALK_M_PER_MIN,
} from './plan';
import { buildReport, checkState, findLoops, runDay } from './report';
import type { Intent, SimConfig, SimState, Weather, Where } from './types';

const cfg: SimConfig = { seed: 1, places: PLACES, cast: CAST, posts: POST_OF_SLOT };
const FAIR: Weather = { high: 24, rain: false, wind: false };
const DESK = { director: 'desk.counter' };

const hmOf = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

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

  // 第 3 轮：老伤的不上网球场；喜欢匹克球的老伤（Curtis："网球跑不动了，匹克球刚好"，people.md 的匹克球迷）打匹克球
  it('老伤的人不上网球场（喜欢匹克球的打匹克球）；孩子不自己来、不开车；Tommy 平日跟着 Verónica 来', () => {
    let curtis = 0;
    for (const run of WEEK) {
      const s = run.final;
      const played = new Set(s.log.filter((e) => e.kind === 'start' && e.doing === 'tennis').map((e) => e.agent));
      const pickled = new Set(s.log.filter((e) => e.kind === 'start' && e.doing === 'pickle').map((e) => e.agent));
      if (pickled.has('curtis')) curtis++;
      for (const a of Object.values(s.agents)) {
        const p = personOf(cfg, s, a.id);
        if (p?.traits.includes('oldinjury') && !isFixedRole(a.role)) {
          expect(played.has(a.id), a.id).toBe(false);
          expect(pickled.has(a.id) && !picklesAnyway(p), a.id).toBe(false);
        }
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
    // Curtis 一周来六天（周一到周六早上），匹克球场是他的地方：至少有几天打上了
    expect(curtis).toBeGreaterThanOrEqual(3);
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

describe('第 2 轮 critique 的几条', () => {
  const SUMMER = runDay(cfg, 200, { weather: { high: 42, rain: false, wind: false } });
  const RAIN = runDay(cfg, 9, { weather: { high: 21, rain: true, wind: false } });
  const WIND = runDay(cfg, 10, { weather: { high: 30, rain: false, wind: true } });

  it('人不打转：同一处两小时最多两回（更衣室四小时），零食窗口一小时一回；Amara、Diego 下午不在果昔窗口排十趟', () => {
    for (const run of [...WEEK, SUMMER, RAIN, WIND]) {
      const l = findLoops(cfg, run.final);
      expect([...l.places, ...l.counters], `第 ${run.final.dayNo} 天`).toEqual([]);
    }
    for (const run of WEEK)
      for (const pro of ['amara', 'diego']) {
        const ts = run.final.log
          .filter((e) => e.agent === pro && e.kind === 'served' && e.at === 'house.nutri')
          .map((e) => e.t);
        expect(ts.length, `${pro} 第 ${run.final.dayNo} 天`).toBeLessThanOrEqual(3);
        for (let i = 1; i < ts.length; i++) expect(ts[i] - ts[i - 1]).toBeGreaterThanOrEqual(60);
      }
  });

  it('看球只看有人在打的场（对着空场的看球分钟 < 3%）；没有 faces 的地方不"看球"', () => {
    for (const run of [...WEEK, SUMMER, WIND]) {
      const rep = buildReport(run);
      expect(rep.watch.empty / Math.max(1, rep.watch.total), `第 ${run.final.dayNo} 天`).toBeLessThan(0.03);
    }
    const s = WEEK[0].final;
    for (const e of s.log)
      if (e.kind === 'start' && e.doing === 'watch' && e.at) expect(PLACE_BY_ID[e.at].faces, e.at).toBeDefined();
  });

  it('家长看自己孩子上课：Sofía 上课的时候 Verónica 坐在看得到青训场的长椅上', () => {
    const run = WEEK.find(
      (r) => r.final.agents.sofia && r.final.log.some((e) => e.agent === 'sofia' && e.doing === 'lesson'),
    );
    expect(run).toBeDefined();
    const s = (run as (typeof WEEK)[number]).final;
    const lesson = s.log.find((e) => e.agent === 'sofia' && e.kind === 'start' && e.doing === 'lesson');
    const watch = s.log.filter(
      (e) => e.agent === 'veronica' && e.kind === 'start' && e.doing === 'watch' && e.t <= (lesson?.t ?? 0) + 5,
    );
    expect(watch.length).toBeGreaterThan(0);
    const at = PLACE_BY_ID[watch[watch.length - 1].at as string];
    expect(at.faces).toContain(lesson?.at);
  });

  it('饮水点有人用：打完一局、一节课渴了在场边接一杯水（1–2 分钟），七处都有人接', () => {
    for (const run of WEEK) {
      const rep = buildReport(run);
      const total = rep.water.reduce((n, x) => n + x.sips, 0);
      expect(total, `第 ${run.final.dayNo} 天`).toBeGreaterThan(40);
      expect(rep.water.filter((x) => x.sips > 0).length).toBeGreaterThanOrEqual(5);
      // 接水很快
      const s = run.final;
      for (const e of s.log) {
        if (e.kind !== 'start' || e.doing !== 'drink' || !e.at || !isWater(PLACE_BY_ID[e.at])) continue;
        const end = s.log.find((x) => x.agent === e.agent && x.t > e.t && (x.kind === 'start' || x.kind === 'end'));
        if (end) expect(end.t - e.t, e.agent).toBeLessThanOrEqual(3);
      }
    }
  });

  it('报告的检查说实话：夏天中午员工可以过半但有上限，雨天、风沙天也按写明的要求判', () => {
    for (const run of [SUMMER, RAIN, WIND]) {
      const rep = buildReport(run);
      const c = rep.checks.find((x) => x.name === '员工占比');
      expect(c?.na).toBeFalsy();
      expect(c?.detail).toMatch(/要求/);
      const bad = rep.checks.filter((x) => !x.ok).map((x) => `${x.name}：${x.detail}`);
      expect(bad, `第 ${run.final.dayNo} 天`).toEqual([]);
    }
    // 不适用的检查打"—"不打 ✓
    expect(buildReport(RAIN).checks.some((x) => x.na)).toBe(true);
  });

  it('夏天中午：外面的班 11 点前下、店和二楼中午关、只开傍晚的餐车 16:45 才来；泳池、会所有人，员工不超过五成五', () => {
    const { rec } = SUMMER;
    const hour = (h: number) => {
      const is = rec.minutes.map((t, i) => [t, i] as const).filter(([t]) => t >= h * 60 && t < h * 60 + 60);
      const avg = (xs: number[]) => is.reduce((n, [, i]) => n + xs[i], 0) / is.length;
      return { all: avg(rec.present), staff: avg(rec.staff), pool: avg(rec.byScene.clubpool) };
    };
    for (let h = 11; h < 18; h++) expect(hour(h).staff / hour(h).all, `${h} 点`).toBeLessThanOrEqual(0.55);
    for (const h of [8, 9, 19, 20]) expect(hour(h).staff / hour(h).all, `${h} 点`).toBeLessThanOrEqual(0.35);
    for (const h of [13, 14]) {
      expect(hour(h).all - hour(h).staff, `${h} 点的客人`).toBeGreaterThan(15);
      expect(hour(h).pool, `${h} 点泳池`).toBeGreaterThan(5);
    }
    const spans = rec.shifts;
    const at14 = (post: string) => (spans.get(post) ?? []).some(([a, b]) => a <= H(14) && b > H(14));
    expect(at14('post.house.proshop')).toBe(false);
    expect(at14('post.house.bartender')).toBe(false);
    expect(at14('post.pool.lifeguard')).toBe(true);
  });

  it('下雨：伞下、帆下的长椅不算有顶（没人坐），会所、凉亭、凉棚下有人', () => {
    const s0 = startDay(cfg, 9, { high: 21, rain: true, wind: false });
    let s = s0;
    let inside = 0;
    while (s.minute < H(20)) {
      s = step(cfg, s, DESK).state;
      for (const pid of Object.keys(s.occupants)) {
        const p = PLACE_BY_ID[pid];
        if (p.kind === 'entry' || p.kind === 'post') continue;
        const guests = s.occupants[pid].filter((id) => !isFixedRole(s.agents[id].role));
        if (rainedOn(p)) expect(guests, `${hmOf(s.minute)} ${pid}`).toEqual([]);
        else inside += guests.length;
      }
    }
    expect(inside).toBeGreaterThan(1000);
  });

  it('代客台一个钟头最多接十来辆车（VIP 另算），再多的停在外面路边走进来', () => {
    for (const run of WEEK) {
      const s = run.final;
      const byHour = new Map<number, number>();
      const seen = new Set<string>();
      for (const e of s.log) {
        if (e.kind !== 'arrive') continue;
        const a = s.agents[e.agent];
        const key = a.party ?? a.id;
        if (seen.has(key) || a.car !== 'valet') continue;
        seen.add(key);
        if (personOf(cfg, s, a.id)?.traits.includes('vip')) continue;
        const h = Math.floor(e.t / 60);
        byHour.set(h, (byHour.get(h) ?? 0) + 1);
      }
      for (const [h, n] of byHour) expect(n, `第 ${s.dayNo} 天 ${h} 点`).toBeLessThanOrEqual(VALET_PER_HOUR + 1);
    }
    const sat = WEEK[5].final;
    expect(sat.log.some((e) => /路边走进来/.test(e.note ?? ''))).toBe(true);
  });

  it('球员：练完去理疗床、吃午饭，表演赛准时开打（不因为吃饭迟到）', () => {
    for (const run of WEEK) {
      const s = run.final;
      if (!calendar(s.dayNo).exhibition) continue;
      for (const pro of ['amara', 'diego']) {
        if (!s.agents[pro]) continue;
        const start = s.log.find((e) => e.agent === pro && e.kind === 'start' && e.doing === 'tennis' && e.t >= H(18));
        expect(start?.t, `${pro} 第 ${s.dayNo} 天`).toBeLessThanOrEqual(H(18, 35));
      }
    }
    const physio = WEEK.reduce((n, r) => n + (r.rec.placeMin.get('house.physio') ?? 0), 0);
    expect(physio).toBeGreaterThan(200);
  });

  it('换衣服只在运动、游泳前后（看球、坐着之前不换）；Mateo 坐公交从车道东头走进来；Dale 一早扫中心球场的看台', () => {
    for (const run of WEEK) {
      const s = run.final;
      if (s.agents.mateo && s.log.some((e) => e.agent === 'mateo' && e.kind === 'arrive'))
        expect(s.agents.mateo.entry).toBe('park.walkin');
      if (s.log.some((e) => e.agent === 'dale' && e.kind === 'arrive')) {
        const sweep = s.log.filter(
          (e) => e.agent === 'dale' && e.doing === 'work' && e.at?.startsWith('stadium.stand') && e.t < H(9),
        );
        expect(sweep.length, `第 ${s.dayNo} 天`).toBeGreaterThanOrEqual(3);
      }
    }
    // 坐着歇完、下一件是看球：不去更衣室；下一件是打球：去换
    // 10 点以后头一个更衣室宽裕的分钟（里面的 + 正往那走的至少空四个：同一分钟别人也会去；满了引擎就不换了，测不到换不换），
    // 挑一个还要待一个多钟头的（快走的人"换衣服 + 打球"来不及，引擎会都不做）
    const lockerRoom = (x: SimState) =>
      PLACE_BY_ID['house.locker'].cap -
      (x.occupants['house.locker'] ?? []).length -
      Object.values(x.agents).filter((a) => a.where.kind === 'travel' && a.where.to === 'house.locker').length;
    let s0 = runTo(startDay(cfg, 1, FAIR), H(10));
    while (lockerRoom(s0) < 4 && s0.minute < H(12)) s0 = runTo(s0, s0.minute + 1);
    const id = Object.keys(s0.agents).find((k) => {
      const a = s0.agents[k];
      return (
        !a.party &&
        a.where.kind === 'at' &&
        !isFixedRole(a.role) &&
        (a.doing === 'rest' || a.doing === 'drink') &&
        a.leaveBy - s0.minute > 90
      );
    }) as string;
    const goes = (next: Intent): string | undefined => {
      const a = s0.agents[id];
      const w = a.where as Extract<Where, { kind: 'at' }>;
      const s1: SimState = {
        ...s0,
        agents: {
          ...s0.agents,
          [id]: {
            ...a,
            where: { ...w, until: s0.minute + 1 },
            plan: [
              a.plan[0] ?? { doing: 'rest', minutes: 5 },
              { doing: 'change', minutes: 6, kinds: ['locker'] },
              next,
            ],
          },
        },
      };
      const w2 = step(cfg, s1, DESK).state.agents[id].where;
      return w2.kind === 'travel' ? w2.to : w2.kind === 'at' || w2.kind === 'queue' ? w2.at : undefined;
    };
    expect(goes({ doing: 'watch', minutes: 30, kinds: ['stand'] })).not.toBe('house.locker');
    expect(goes({ doing: 'tennis', minutes: 60, kinds: ['court'] })).toBe('house.locker');
  });
});

describe('第 3 轮 critique 的几条', () => {
  const SUMMER = runDay(cfg, 200, { weather: { high: 42, rain: false, wind: false } });

  it('拍架边只在两块场都有人打的时候排：排拍架时有空场的分钟 < 5%', () => {
    for (const run of [...WEEK, SUMMER]) {
      const r = buildReport(run).rack;
      if (r.min < 30) continue;
      expect(r.idle / r.min, `第 ${run.final.dayNo} 天：${r.idle}/${r.min}`).toBeLessThan(0.05);
    }
  });

  it('关着的窗口：走到了发现关着就换一家、半小时里不再去；不对着关着的窗口干排', () => {
    for (const run of [...WEEK, SUMMER]) {
      const s = run.final;
      const seen = new Map<string, number>();
      for (const e of s.log) {
        if (e.kind === 'gaveUp') expect(e.note ?? '', `${e.agent} 第 ${s.dayNo} 天`).not.toMatch(/一直没开/);
        if (e.kind !== 'full' || !/关着|关门了/.test(e.note ?? '')) continue;
        const k = `${e.agent}@${e.at}`;
        const t = seen.get(k);
        if (t !== undefined) expect(e.t - t, `${k} 第 ${s.dayNo} 天`).toBeGreaterThan(30);
        seen.set(k, e.t);
      }
    }
  });

  it('孩子的课不被家长拉走：排了课的孩子都上了，上满 45 分钟以上；端着饭不坐看台、场边长椅', () => {
    for (const run of WEEK) {
      const s = run.final;
      const s0 = startDay(cfg, s.dayNo, FAIR);
      for (const [id, a] of Object.entries(s0.agents)) {
        const L = a.plan.find((x) => x.doing === 'lesson' && x.must);
        if (!L) continue;
        const st = s.log.find((e) => e.agent === id && e.kind === 'start' && e.doing === 'lesson');
        expect(st, `${id} 第 ${s.dayNo} 天`).toBeDefined();
        const en = s.log.find(
          (e) =>
            e.agent === id && e.t > (st?.t ?? 0) && (e.kind === 'start' || e.kind === 'end') && e.doing !== 'lesson',
        );
        if (en) expect(en.t - (L.after ?? 0), `${id} 第 ${s.dayNo} 天`).toBeGreaterThanOrEqual(45);
      }
      for (const e of s.log)
        if (e.kind === 'start' && e.doing === 'eat' && e.at)
          expect(PLACE_BY_ID[e.at].kind, `${e.agent} ${e.at}`).not.toBe('stand');
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
      if (isFixedRole(a.role)) expect(['staff', 'drop', 'walk']).toContain(a.car);
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
