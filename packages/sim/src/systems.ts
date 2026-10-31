import { minutes } from '@td/content';
import { directorDraw, expireCards, openScheduled } from './cards';
import { speedFactor, taskSystem } from './director';
import { type Ctx, run, setStat } from './effects';
import { weightedPick } from './rng';
import { at, dayOf, minuteOfDay, weekdayOf } from './state';
import { coachAttention, facilityTotals, makeEnv, num, test, wagesWeek } from './vars';
import type { World } from './world';

/**
 * 每个 tick 按固定顺序执行的系统，每个只负责一件事（技术文档「每个 tick 的系统顺序」）：
 * 日历 → 总监走位 → 活动 → 人员 → 经济 → 事件 → 导演。
 * 人员和经济按天结算，放在收盘时（closeDay）。
 */

/* ---------------- 总监走位 ---------------- */

/** 导航图上的最短路（分钟）。返回经过的锚点（不含起点）。 */
export function shortestRoute(w: World, from: string, to: string): { route: string[]; minutes: number } | null {
  if (from === to) return { route: [], minutes: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const todo = new Set<string>([from]);
  while (todo.size) {
    let cur = '';
    let best = Number.POSITIVE_INFINITY;
    // 按名字排序再比较，距离相同时结果也确定
    for (const n of [...todo].sort()) {
      const d = dist.get(n) ?? Number.POSITIVE_INFINITY;
      if (d < best) {
        best = d;
        cur = n;
      }
    }
    todo.delete(cur);
    if (cur === to) break;
    for (const [nb, m] of w.nav.get(cur) ?? []) {
      const nd = best + m;
      if (nd < (dist.get(nb) ?? Number.POSITIVE_INFINITY)) {
        dist.set(nb, nd);
        prev.set(nb, cur);
        todo.add(nb);
      }
    }
  }
  if (!dist.has(to)) return null;
  const route: string[] = [];
  for (let n: string | undefined = to; n && n !== from; n = prev.get(n)) route.unshift(n);
  return { route, minutes: dist.get(to) ?? 0 };
}

const baseEdge = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;
/** 这一段要走几分钟：精力满时跑着去，累了慢慢走 */
const edgeMinutes = (ctx: Ctx, a: string, b: string): number =>
  Math.max(1, Math.round(baseEdge(ctx.w, a, b) / speedFactor(ctx.s, ctx.w)));

/** 命令：让总监走到某个锚点。走在路上时从下一个锚点改道。 */
export function moveDirector(ctx: Ctx, to: string): boolean {
  const { s, w } = ctx;
  if (!w.act.anchors.includes(to)) return false;
  const d = s.director;
  // 正在现场忙的时候走不开
  if (d.task?.phase === 'working') return false;
  const origin = d.at ?? d.leg?.to;
  if (!origin) return false;
  const r = shortestRoute(w, origin, to);
  if (!r) return false;
  if (d.leg) {
    // 先走完脚下这一段，再按新路线走
    d.route = r.route;
    return true;
  }
  if (!r.route.length) return true;
  const [next, ...rest] = r.route as [string, ...string[]];
  d.leg = { from: origin, to: next, start: s.t, end: s.t + edgeMinutes(ctx, origin, next) };
  d.route = rest;
  d.at = null;
  ctx.events.push({ type: 'directorDeparted', from: origin, to, route: r.route, arrive: s.t + r.minutes });
  return true;
}

function directorSystem(ctx: Ctx): void {
  const { s } = ctx;
  const d = s.director;
  while (d.leg && d.leg.end <= s.t) {
    const here = d.leg.to;
    const [next, ...rest] = d.route;
    if (next) {
      d.leg = { from: here, to: next, start: d.leg.end, end: d.leg.end + edgeMinutes(ctx, here, next) };
      d.route = rest;
    } else {
      d.leg = null;
      d.at = here;
      ctx.events.push({ type: 'directorArrived', at: here });
    }
  }
}

/* ---------------- 活动 ---------------- */

function activitySystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const a of s.activities) {
    if (!a.started && a.start <= s.t) {
      a.started = true;
      // 排在夜里（关门后）的活动推到开门时才开始，时长不变
      if (a.start < s.t - 1) {
        a.end = s.t + (a.end - a.start);
        a.start = s.t;
      }
      const def = w.activities.get(a.id);
      ctx.events.push({
        type: 'activityStarted',
        uid: a.uid,
        activity: a.id,
        anchor: a.anchor,
        performance: def?.performance ?? a.id,
        end: a.end,
      });
    }
  }
  const done = s.activities.filter((a) => a.started && a.end <= s.t);
  if (!done.length) return;
  s.activities = s.activities.filter((a) => !(a.started && a.end <= s.t));
  for (const a of done) {
    const def = w.activities.get(a.id);
    // 活动结算：结果由模拟算出，演出只负责演
    run(ctx, { kind: 'activity', activity: a.id }, a.cause, def?.effects ?? []);
    ctx.events.push({ type: 'activityFinished', uid: a.uid, activity: a.id });
  }
}

/* ---------------- 质量（每分钟向目标靠近） ---------------- */

const OPEN_MINUTES = (w: World) => (w.act.hours.close - w.act.hours.open) * 60;

/** 每 10 分钟算一次目标、一次走 10 分钟的量（目标是表达式，每分钟都算太慢） */
const QUALITY_STEP = 10;
function qualitySystem(ctx: Ctx): void {
  const { s, w } = ctx;
  if (minuteOfDay(s.t) % QUALITY_STEP !== 0) return;
  const target = num(s, w, w.act.rules.quality_target);
  const q = s.stats.quality ?? 0;
  const k = 1 - (1 - w.act.rules.quality_rate / OPEN_MINUTES(w)) ** QUALITY_STEP;
  setStat(ctx, 'quality', q + (target - q) * k);
}

/* ---------------- 收盘：人员、经济、会员、声望、派生量、失败条件 ---------------- */

export function recomputeDerived(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const [stat, src] of Object.entries(w.act.rules.derived)) setStat(ctx, stat, num(s, w, src));
}

function closeDay(ctx: Ctx): void {
  const { s, w } = ctx;
  const day = dayOf(s.t);
  const env = makeEnv(s, w);
  const fac = facilityTotals(s, w);
  const income = Math.round(
    ((s.stats.members ?? 0) * w.act.rules.dues_week + fac.income - fac.upkeep - wagesWeek(s, w)) / 7,
  );
  const members = Math.round(Number(w.expr(w.act.rules.member_drift).eval(env)));
  let rep = Number(w.expr(w.act.rules.reputation_drift).eval(env));
  // 在职人员的特质：士气漂移、声望漂移
  for (const p of Object.values(s.people)) {
    if (!p.hired) continue;
    for (const t of w.people.get(p.id)?.traits ?? []) {
      const tr = w.traits.get(t);
      if (!tr) continue;
      p.morale = Math.max(0, Math.min(100, p.morale + tr.morale_drift));
      rep += tr.reputation_drift;
    }
    p.fatigue = Math.max(0, p.fatigue - 10);
  }
  const effects = [
    { stat: 'cash', add: income },
    { stat: 'members', add: members },
    { stat: 'reputation', add: Math.round(rep * 10) / 10 },
  ];
  run(ctx, { kind: 'day', day }, null, effects);
  // 一夜过去，总监恢复一点精力（不会回满：一季里能亲自做的事是有限的）
  s.director.energy = Math.min(100, s.director.energy + w.act.energy.overnight);
  recomputeDerived(ctx);
  ctx.events.push({ type: 'dayEnded', day });
  const lose = w.act.rules.lose_if;
  if (lose && !s.outcome && test(s, w, lose.when))
    run(ctx, { kind: 'day', day }, null, [{ endAct: 'lost', ending: lose.ending }]);
}

/** 今天属于哪个季节（幕里的 seasons；没有季节时返回 ''） */
export function seasonOn(w: World, day: number): string {
  let id = '';
  for (const x of w.act.seasons) if (day >= x.from_day) id = x.id;
  return id;
}

function pushActivity(ctx: Ctx, id: string, start: number, cause: number | null): void {
  const { s, w } = ctx;
  const a = w.activities.get(id);
  if (!a) return;
  s.activities.push({
    uid: s.nextUid++,
    id: a.id,
    anchor: a.anchor,
    start,
    end: start + minutes(a.duration),
    started: false,
    cause,
  });
}

/** 按公告板排上这一天还没过去的活动 */
export function schedulePlan(ctx: Ctx, day: number, fromMinute = 0): void {
  const { s, w } = ctx;
  const wd = weekdayOf(at(day, 12));
  for (const [part, hour] of Object.entries(w.act.schedule.parts)) {
    const id = s.plan[part]?.[wd];
    if (!id) continue;
    const start = at(day, hour);
    if (start < s.t || minuteOfDay(start) < fromMinute) continue;
    const a = w.activities.get(id);
    if (!a?.program || (a.program.requires && !test(s, w, a.program.requires))) continue;
    pushActivity(ctx, id, start, null);
  }
}

/** 公告板改了：今天还没开始的日程活动按新的重排 */
export function reschedulePlanToday(ctx: Ctx): void {
  const { s, w } = ctx;
  const day = dayOf(s.t);
  s.activities = s.activities.filter(
    (a) => a.started || a.cause !== null || !w.activities.get(a.id)?.program || dayOf(a.start) !== day,
  );
  schedulePlan(ctx, day);
}

/**
 * 新的一天开门：换季（精力回满、打开公告板排日程）、今天的天气、
 * 按公告板排上今天的活动，再加上每天固定的活动。
 */
export function openDay(ctx: Ctx, day: number, fromMinute = 0): void {
  const { s, w } = ctx;
  const season = seasonOn(w, day);
  if (season !== s.season) {
    s.season = season;
    s.director.energy = 100;
    s.planning = true;
    ctx.events.push({ type: 'seasonStarted', season });
    ctx.events.push({ type: 'planOpened', season });
    ctx.events.push({ type: 'requestPause', reason: 'plan' });
  }
  const weights = w.act.weather[season];
  if (weights) {
    const pick = weightedPick(
      s,
      (['sun', 'cloud', 'rain', 'wind'] as const).map((k) => ({ item: k, weight: weights[k] })),
    );
    if (pick) s.weather = pick;
    ctx.events.push({ type: 'weather', weather: s.weather });
  }
  schedulePlan(ctx, day, fromMinute);
  for (const d of w.act.daily) {
    const start = at(day, d.hour);
    if (start < s.t || minuteOfDay(start) < fromMinute) continue;
    if (d.if && !test(s, w, d.if)) continue;
    const a = w.activities.get(d.activity);
    if (!a) continue;
    s.activities.push({
      uid: s.nextUid++,
      id: a.id,
      anchor: a.anchor,
      start,
      end: start + minutes(a.duration),
      started: false,
      cause: null,
    });
  }
}

/* ---------------- 一个 tick ---------------- */

/** 推进一分钟。到了收盘时间就结算这一天，直接跳到第二天开门（夜里不模拟）。 */
export function tick(ctx: Ctx): void {
  const { s, w } = ctx;
  if (s.outcome) return;
  openScheduled(ctx); // 日历和后续事件
  activitySystem(ctx); // 活动开始、结算
  qualitySystem(ctx); // 人员和项目质量
  expireCards(ctx); // 事件：倒计时到了执行默认后果
  directorDraw(ctx); // 导演：要不要发新卡
  s.t += 1;
  directorSystem(ctx); // 总监走位：这一分钟走完，到没到
  taskSystem(ctx); // 总监手上的事：到了就开始忙，忙完结算

  if (minuteOfDay(s.t) >= w.act.hours.close * 60 && !s.outcome) {
    closeDay(ctx);
    const next = dayOf(s.t) + 1;
    const open = at(next, w.act.hours.open);
    // 夜里跳过：总监留在原地，走到一半的直接到
    const d = s.director;
    if (d.leg) {
      d.at = d.route[d.route.length - 1] ?? d.leg.to;
      d.leg = null;
      d.route = [];
      ctx.events.push({ type: 'directorArrived', at: d.at });
    }
    s.t = open;
    openDay(ctx, next);
  }
}

export { coachAttention };
