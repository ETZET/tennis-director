import type { Effect, Order, Tournament, TournamentGoal } from '@td/content';
import { evalBool, type Value } from '@td/shared';
import { applyEffects, type Ctx, logEntry } from './effects';
import type { SimEvent } from './events';
import { rand } from './rng';
import { type Cause, dayOf, type EffectRecord, type EventRun, type GameState, minuteOfDay } from './state';
import { makeEnv, num, test } from './vars';
import type { Edition, World } from './world';

/**
 * 赛事日历（LG-11，设计文档"赛事阶梯"）。赛事不是卡：
 *
 * - 主办（host）：报名工单提前 lead（默认一周）出现在地点牌上；做完就算接下（报名费 = 工单的材料费，开工时扣）。
 *   到日子开出临时岗位（posts），closes 里的岗位当天整天不开（月度内赛占两块场）。当天下雨办不成，报名费白花。
 *   最后一天收赛时结算：奖励，再逐个判定附加目标。
 * - 外出（away）：工单提前 lead 出现，但要到比赛那天才能开工（canAssign 给 'early'）；做完当场结算。
 * - 第二次起：奖励按 repeat.scale 打折（默认减半），附加目标换成 repeat.goals。
 * - 不参加没有惩罚，只是拿不到奖励。
 */

/** 这项赛事此刻算的那一期：还没收赛的第一期（没有了是 null） */
export function currentEdition(w: World, id: string, t: number): Edition | null {
  for (const e of w.editions.get(id) ?? []) if (t < e.end) return e;
  return null;
}

/** 接下的这一期此刻在不在比赛（开赛那几天、赛事时段里） */
export function eventLive(s: GameState, w: World, t: Tournament): boolean {
  const run = s.events?.[t.id];
  if (!run || s.t < run.start || s.t >= run.end) return false;
  const e = currentEdition(w, t.id, s.t);
  if (!e?.days.includes(dayOf(s.t))) return false;
  const h = minuteOfDay(s.t) / 60;
  return h >= t.hours[0] && h < t.hours[1];
}

/** 今天是不是接下的那一期的比赛日（整天：closes 里的岗位当天不开） */
function eventDay(s: GameState, w: World, t: Tournament): boolean {
  const run = s.events?.[t.id];
  if (!run || s.t >= run.end) return false;
  return !!currentEdition(w, t.id, s.t)?.days.includes(dayOf(s.t));
}

/**
 * 赛事对岗位的影响：临时岗位只在接下的赛事比赛日存在（时段照岗位自己的 hours）；
 * closes 里的岗位在比赛日整天不开。返回 null = 这个岗位和赛事无关。
 */
export function eventPostOpen(s: GameState, w: World, post: string): boolean | null {
  const closers = w.closedBy.get(post);
  if (closers?.some((t) => eventDay(s, w, t))) return false;
  const ts = w.eventPosts.get(post);
  if (!ts) return null;
  return ts.some((t) => eventDay(s, w, t));
}

export type TournamentOrderState = { visible: boolean; early: boolean };

/**
 * 报名工单出不出现：在报名窗口里（主办：开赛之前；外出：收赛之前）、这一期还没接下、参赛条件和工单条件都满足。
 * 外出赛事开赛之前出现但不能开工（early）。
 */
export function tournamentOrder(s: GameState, w: World, t: Tournament, o: Order): TournamentOrderState {
  const e = currentEdition(w, t.id, s.t);
  if (!e || s.t < e.signup) return { visible: false, early: false };
  if (t.kind === 'host' && s.t >= e.start) return { visible: false, early: false };
  if (s.events?.[t.id]?.start === e.start) return { visible: false, early: false };
  // 外出赛事这一期已经打完（在比赛那几天里结算过）
  const last = s.tournaments?.[t.id]?.last;
  if (last !== undefined && last >= e.start && last < e.end) return { visible: false, early: false };
  if (!test(s, w, t.when) || !test(s, w, o.when)) return { visible: false, early: false };
  return { visible: true, early: t.kind === 'away' && s.t < e.start };
}

/** 这一期第几次参加（第一次是 0） */
export const repeatOf = (s: GameState, id: string): number => s.tournaments?.[id]?.entries ?? 0;

/** 奖励打折：数值的 stat add 乘上 k（四舍五入），表达式套一层；奖杯、标记这些不打折 */
function scaled(effs: readonly Effect[], k: number): Effect[] {
  if (k === 1) return [...effs];
  return effs.map((e) =>
    'stat' in e && 'add' in e
      ? { ...e, add: typeof e.add === 'number' ? Math.round(e.add * k) : `(${e.add}) * ${k}` }
      : e,
  );
}

/** 这一期用哪套附加目标：第一次用 goals，第二次起用 repeat.goals（没写就照旧） */
export const goalsFor = (t: Tournament, repeat: number): readonly TournamentGoal[] =>
  repeat > 0 && t.repeat.goals ? t.repeat.goals : t.goals;

function runVars(s: GameState, t: Tournament, run: EventRun): Record<string, Value> {
  return {
    'event.service_rate': run.demand > 0 ? run.served / run.demand : 0,
    'event.staffed': run.need > 0 ? run.staffed / run.need : t.posts.length ? 0 : 1,
    'event.skill': run.skill,
    'event.crew': run.crew.length,
    'event.repeat': repeatOf(s, t.id),
  };
}

/** 结算一期：奖励（第二次起打折），逐个判定附加目标；写一条因果日志，发 tournament_done */
function resolve(ctx: Ctx, t: Tournament, run: EventRun): void {
  const { s, w } = ctx;
  const repeat = repeatOf(s, t.id);
  const scale = repeat > 0 ? t.repeat.scale : 1;
  const vars = runVars(s, t, run);
  const out: EffectRecord[] = [];
  const goals: Record<string, boolean> = {};
  const missed: SimEvent[] = [];
  const cause: Extract<Cause, { kind: 'tournament' }> = {
    kind: 'tournament',
    tournament: t.id,
    result: 'done',
    goals,
    repeat,
    scale,
  };
  const entry = logEntry(ctx, cause, null, out);
  const c: Ctx = { ...ctx, vars };
  applyEffects(c, scaled(t.reward, scale), entry.id, out);
  for (const g of goalsFor(t, repeat)) {
    let met = !g.if || evalBool(w.expr(g.if), makeEnv(s, w, vars));
    if (met && g.chance !== undefined) met = rand(s) < num(s, w, g.chance, vars);
    goals[g.id] = met;
    if (met) applyEffects(c, scaled(g.reward, scale), entry.id, out);
    // 看到岗率的目标没达成、又确实有临时岗位空过：讲清楚是哪几个岗位（不悄悄失败）
    else if (g.if && STAFFED_VAR.test(g.if) && run.need > run.staffed) {
      const posts = Object.entries(run.short ?? {})
        .filter(([, m]) => m > 0)
        .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
        .map(([post, minutes]) => ({ post, minutes }));
      (cause.unstaffed ??= []).push({ goal: g.id, posts });
      missed.push({
        type: 'tournament_goal_missed',
        tournament: t.id,
        at: t.at,
        goal: g.id,
        staffed: Math.round((run.staffed / run.need) * 100) / 100,
        posts,
      });
    }
  }
  s.tournaments[t.id] = { entries: repeat + 1, last: s.t };
  ctx.events.push({
    type: 'tournament_done',
    tournament: t.id,
    at: t.at,
    goals: Object.entries(goals).map(([id, met]) => ({ id, met })),
    repeat,
    scale,
  });
  ctx.events.push(...missed);
}

/** 目标的条件里用到临时岗位到岗率 */
const STAFFED_VAR = /\bevent\.staffed\b/;

/**
 * 报名工单做完（staff.ts 的 finishOrder 调）：主办 = 接下这一期（到日子开临时岗位，收赛时结算）；外出 = 当场结算。
 */
export function tournamentOrderDone(ctx: Ctx, o: Order, lead: { skill: number }, crew: string[]): void {
  const { s, w } = ctx;
  const t = w.tournamentOf.get(o.id);
  const e = t && currentEdition(w, t.id, s.t);
  if (!t || !e) return;
  const run: EventRun = {
    start: e.start,
    end: e.end,
    demand: 0,
    served: 0,
    need: 0,
    staffed: 0,
    skill: lead.skill,
    crew,
  };
  if (t.kind === 'away') {
    resolve(ctx, t, run);
    return;
  }
  s.events[t.id] = run;
  ctx.events.push({ type: 'tournament_entered', tournament: t.id, at: t.at, start: e.start, end: e.end });
}

/** 每分钟（postSystem 里）：接下的赛事在比赛时，记全园的服务分钟和临时岗位的到岗分钟 */
export function trackEventMinute(s: GameState, w: World, post: string, demand: boolean, busy: boolean): void {
  for (const id in s.events) {
    const t = w.tournaments.get(id);
    const run = s.events[id];
    if (!t || !run || !eventLive(s, w, t)) continue;
    if (demand) {
      run.demand += 1;
      if (busy) run.served += 1;
    }
    if (t.posts.includes(post)) {
      run.need += 1;
      if (busy) run.staffed += 1;
      else (run.short ??= {})[post] = (run.short[post] ?? 0) + 1;
    }
  }
}

/** 每分钟：比赛日开赛时发一次 tournament_live（画面布置横幅、签到桌）；收赛了就结算 */
export function tournamentSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const id of Object.keys(s.events ?? {})) {
    const t = w.tournaments.get(id);
    const run = s.events[id] as EventRun;
    if (!t) {
      delete s.events[id];
      continue;
    }
    if (s.t >= run.end) {
      delete s.events[id];
      resolve(ctx, t, run);
      continue;
    }
    const day = dayOf(s.t);
    if (run.live !== day && eventLive(s, w, t)) {
      run.live = day;
      ctx.events.push({ type: 'tournament_live', tournament: t.id, at: t.at, posts: [...t.posts] });
    }
  }
}

/** 开门、天气定下来以后（systems.ts 的 openDay 调）：接下的主办赛事今天是比赛日又下雨，就办不成，报名费白花 */
export function rainCheck(ctx: Ctx): void {
  const { s, w } = ctx;
  if (s.weather !== 'rain') return;
  for (const id of Object.keys(s.events ?? {})) {
    const t = w.tournaments.get(id);
    const run = s.events[id] as EventRun;
    if (!t || !(t.rain_spoils ?? t.kind === 'host')) continue;
    if (!currentEdition(w, id, s.t)?.days.includes(dayOf(s.t)) || s.t >= run.end) continue;
    delete s.events[id];
    logEntry(
      ctx,
      { kind: 'tournament', tournament: id, result: 'spoiled', goals: {}, repeat: repeatOf(s, id), scale: 0 },
      null,
      [],
    );
    ctx.events.push({ type: 'tournament_spoiled', tournament: id, at: t.at, reason: 'rain' });
  }
}

/* ---------------- 给界面和机器人 ---------------- */

export interface TournamentStatus {
  id: string;
  kind: 'host' | 'away';
  at: string;
  /** 下一期（或正在办的这一期）：报名从什么时候起、开赛、收赛（绝对分钟）、比赛日（第几天） */
  signup: number;
  start: number;
  end: number;
  days: number[];
  /** 参赛条件此刻满不满足 */
  eligible: boolean;
  /** 接下了（主办：报名工单做完了） */
  entered: boolean;
  /** 正在比赛 */
  live: boolean;
  /** 第几次参加（0 = 第一次）、这一期的奖励折扣、这一期的附加目标 */
  repeat: number;
  scale: number;
  goals: string[];
  /** 认场地的赛事：这一期按哪个变体叫（没有是 null） */
  variant: string | null;
  order: string;
  posts: string[];
  fee: number;
}

/** 每项赛事的下一期，按开赛时间排（季节栏的"接下来两个节拍"取前两个） */
export function tournamentStatus(s: GameState, w: World): TournamentStatus[] {
  const out: TournamentStatus[] = [];
  for (const t of w.tournaments.values()) {
    const e = currentEdition(w, t.id, s.t);
    if (!e) continue;
    const repeat = repeatOf(s, t.id);
    const saved = s.rng;
    const eligible = test(s, w, t.when);
    s.rng = saved;
    out.push({
      id: t.id,
      kind: t.kind,
      at: t.at,
      signup: e.signup,
      start: e.start,
      end: e.end,
      days: [...e.days],
      eligible,
      entered: s.events?.[t.id]?.start === e.start,
      live: eventLive(s, w, t),
      repeat,
      scale: repeat > 0 ? t.repeat.scale : 1,
      goals: goalsFor(t, repeat).map((g) => g.id),
      variant: t.variant_of ? (s.variants?.[t.variant_of] ?? null) : null,
      order: t.order,
      posts: [...t.posts],
      fee: t.fee,
    });
  }
  return out.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
