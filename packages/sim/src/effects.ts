import { type Effect, type Ending, minutes, type Person, WORKER } from '@td/content';
import { clamp, type Value } from '@td/shared';
import type { SimEvent } from './events';
import { capWorkerGain } from './potential';
import { rand } from './rng';
import {
  at,
  type CausalEntry,
  type Cause,
  dayOf,
  type EffectRecord,
  type GameState,
  type ScoreItem,
  type Settlement,
} from './state';
import { num, test } from './vars';
import { sendErrand } from './walk';
import type { World } from './world';

/**
 * 效果是白名单操作：改状态量、设标记、改设施、安排后续事件、开始活动、招人开人、
 * 改人的属性、改设施状况、写一行日志、结束这一局、派人办事。
 * 每次执行都写进因果日志，带着原因和引出它的上一条。
 */

export interface Ctx {
  readonly s: GameState;
  readonly w: World;
  readonly events: SimEvent[];
  /** 表达式里额外能读的变量（岗位效果里的 worker.skill） */
  readonly vars?: Record<string, Value>;
  /** 岗位和工单的效果里 person: worker 指的人 */
  readonly worker?: string;
}

/** 招来以后当主教练的人：作用是教练（旧写法 role: coach、hire_as: coach） */
export const isCoach = (d: Person | undefined): boolean =>
  !!d && (d.kind === 'coach' || d.role === 'coach' || d.hire_as === 'coach');

/** 写一条因果日志；没有任何效果的条目也记（"你选了 C，什么都没发生"也是故事的一部分）。 */
export function logEntry(ctx: Ctx, cause: Cause, parent: number | null, effects: EffectRecord[]): CausalEntry {
  const { s } = ctx;
  const entry: CausalEntry = { id: (s.log[s.log.length - 1]?.id ?? -1) + 1, t: s.t, cause, parent, effects };
  s.log.push(entry);
  ctx.events.push({ type: 'log', entry });
  return entry;
}

export function setStat(ctx: Ctx, stat: string, value: number): number {
  const { s, w } = ctx;
  const def = w.stats.get(stat);
  const before = s.stats[stat] ?? 0;
  const v = def ? clamp(value, def.min, def.max) : value;
  s.stats[stat] = v;
  return v - before;
}

const PERSON_ATTRS = ['skill', 'upkeep', 'service', 'play', 'morale', 'fatigue'] as const;

/** 执行一串效果，把结果追加到 out。entryId 是这次执行对应的日志条目（后续事件带着它当原因）。 */
export function applyEffects(ctx: Ctx, effects: readonly Effect[], entryId: number, out: EffectRecord[]): void {
  const { s, w } = ctx;
  for (const e of effects) {
    if (e.if && !test(s, w, e.if)) continue;
    if (e.chance !== undefined && !(rand(s) < num(s, w, e.chance, ctx.vars))) continue;
    if ('stat' in e) {
      const before = s.stats[e.stat] ?? 0;
      const target = 'add' in e ? before + num(s, w, e.add, ctx.vars) : num(s, w, e.set, ctx.vars);
      const delta = setStat(ctx, e.stat, target);
      if (delta !== 0) out.push({ kind: 'stat', stat: e.stat, delta });
    } else if ('flag' in e) {
      s.flags[e.flag] = e.set;
      out.push({ kind: 'flag', flag: e.flag, value: e.set });
    } else if ('facility' in e) {
      if (s.facilities[e.facility] !== e.set) {
        s.facilities[e.facility] = e.set;
        out.push({ kind: 'facility', facility: e.facility, state: e.set });
      }
    } else if ('schedule' in e) {
      const at = s.t + minutes(e.in);
      s.cards.scheduled.push({ card: e.schedule, at, cause: entryId });
      out.push({ kind: 'schedule', card: e.schedule, at });
    } else if ('activity' in e) {
      const a = w.activities.get(e.activity);
      if (!a) continue;
      const start = s.t + (e.in ? minutes(e.in) : 0);
      s.activities.push({
        uid: s.nextUid++,
        id: a.id,
        anchor: a.anchor,
        start,
        end: start + minutes(a.duration),
        started: false,
        cause: entryId,
      });
      out.push({ kind: 'activity', activity: a.id, at: start });
    } else if ('hire' in e) {
      const def = w.people.get(e.hire);
      // 内容里后来加的候选人不在旧存档里：招的时候按内容补上
      if (!s.people[e.hire] && def)
        s.people[e.hire] = {
          id: def.id,
          hired: false,
          at: '',
          skill: def.skill,
          upkeep: def.upkeep,
          service: def.service,
          play: def.play,
          morale: def.morale,
          fatigue: def.fatigue,
          job: null,
          walk: null,
          errand: null,
          routine: [],
        };
      const p = s.people[e.hire];
      if (!p || p.hired) continue;
      // 招来的教练接任主教练；原来的主教练留下当员工（核心玩法决定：Dale 开局不开除）
      if (isCoach(def) && s.headCoach !== e.hire) {
        const from = s.headCoach;
        s.headCoach = e.hire;
        ctx.events.push({ type: 'head_coach', person: e.hire, from, reason: 'hired' });
      }
      // 新人从总监开局的地方（Indian Wells 是大门）进来，等你把他拖到岗位上
      p.at = w.act.people.find((x) => w.people.get(x.id)?.role === 'director')?.at ?? p.at;
      p.job = null;
      p.walk = null;
      p.errand = null;
      p.hired = true;
      out.push({ kind: 'hire', person: e.hire });
    } else if ('fire' in e) {
      const p = s.people[e.fire];
      if (!p?.hired) continue;
      p.hired = false;
      p.job = null;
      p.pin = null;
      p.walk = null;
      p.errand = null;
      // 走的是主教练：还在的教练里接一个（Dale 开局不开除，一直都在）
      if (s.headCoach === e.fire) {
        const next = Object.values(s.people).find((q) => q.hired && isCoach(w.people.get(q.id)));
        s.headCoach = next?.id ?? null;
        ctx.events.push({ type: 'head_coach', person: s.headCoach, from: e.fire, reason: 'left' });
      }
      out.push({ kind: 'fire', person: e.fire });
    } else if ('person' in e) {
      const who = e.person === WORKER ? ctx.worker : e.person;
      const p = who ? s.people[who] : undefined;
      if (!p || !who) continue;
      for (const attr of PERSON_ATTRS) {
        const v = e.add[attr];
        if (v === undefined) continue;
        const before = p[attr];
        let after = clamp(before + num(s, w, v, ctx.vars), 0, 100);
        // W3：干活涨的能力（person: worker，例如球员的训练）截在潜力上；成长关着时不截。跨门槛的 skill_up 由 staff.ts 补发
        const k = attr === 'skill' ? 'teach' : attr === 'morale' || attr === 'fatigue' ? null : attr;
        if (k && e.person === WORKER) after = capWorkerGain(w, who, k, before, after);
        p[attr] = after;
        const delta = p[attr] - before;
        if (delta !== 0) out.push({ kind: 'person', person: who, attr, delta });
      }
    } else if ('condition' in e) {
      const before = s.condition[e.condition] ?? 100;
      const v = clamp(before + num(s, w, e.add, ctx.vars), 0, 100);
      s.condition[e.condition] = v;
      if (v !== before) out.push({ kind: 'condition', facility: e.condition, delta: v - before });
    } else if ('decay_mult' in e) {
      const { facility, factor, days } = e.decay_mult;
      const until = s.t + Math.round(days * 1440);
      (s.decayMult ??= {})[facility] = { factor, until };
      out.push({ kind: 'decay_mult', facility, factor, until });
    } else if ('log' in e) {
      out.push({ kind: 'text', key: e.log });
    } else if ('endAct' in e) {
      if (s.outcome) continue;
      // 结局方案 A（W4）：表演赛不再通关、旧的期限改成结算（破产照旧），见 ending.ts
      if (interceptEndAct(ctx, e.endAct, e.ending, entryId)) continue;
      // 先看一眼星级再结束：表演赛那张工单前面的效果刚设了 exhibition_done，★5 要在这一局结束前升上来
      checkStars(ctx);
      s.outcome = { result: e.endAct, ending: e.ending, t: s.t };
      out.push({ kind: 'end', result: e.endAct, ending: e.ending });
      ctx.events.push({ type: 'actEnded', result: e.endAct, ending: e.ending });
    } else if ('errand' in e) {
      const m = minutes(e.for);
      if (sendErrand(ctx, e.errand, e.at, m)) out.push({ kind: 'errand', person: e.errand, at: e.at, minutes: m });
    } else if ('trophy' in e) {
      s.trophies = (s.trophies ?? 0) + e.trophy;
      out.push({ kind: 'trophy', delta: e.trophy });
    } else if ('route' in e) {
      // 选路（W2）：一处只选一次
      if (s.routes?.[e.route]) continue;
      (s.routes ??= {})[e.route] = e.set;
      out.push({ kind: 'route', slot: e.route, route: e.set });
      ctx.events.push({ type: 'route_chosen', slot: e.route, route: e.set });
      // 地块（W5）：这一处的路决定的第一季地块，按同名的变体开工
      for (const p of w.plots.values())
        if (p.route === e.route && p.season === 1 && p.variants[e.set]) startPlot(ctx, p.id, e.set, entryId, out);
    } else if ('build' in e) {
      startPlot(ctx, e.plot, e.build, entryId, out);
    } else if ('settle' in e) {
      // 结局卡的"马上结算"（W4）：结局没打开、或者已经结算过时什么都不做
      settle(ctx, 'early', entryId);
    } else if ('mess' in e) {
      // 场地可用度（court-care-contract.md）：Wave 0 桩，代理 A 实现（加到 s.care[e.mess].mess、截在 0..1、记 mess 记录）
    } else if ('task' in e) {
      // 把一张工单记给某人（ADR 0014 的 resume）：他手上的班或活结束、闲下来时，习惯系统让他自己走过去开工
      const p = s.people[e.who];
      if (!p?.hired || p.job === e.task) continue;
      p.resume = e.task;
      out.push({ kind: 'task', person: e.who, order: e.task });
    }
  }
}

/* ---------------- 地块（W5，LG-15；只读的查询在 plots.ts） ---------------- */

/**
 * 地块按 variant 开工：还没开工（locked）才生效。写一条挂在 parent 下的日志（执行变体的 start 效果），
 * 在 out（引出它的那一条）里记一笔；清理工单从这一刻起出现。清理工单碰巧都做过了（第二季）就直接开地。
 */
export function startPlot(
  ctx: Ctx,
  plot: string,
  variant: string,
  parent: number | null,
  out?: EffectRecord[],
): boolean {
  const { s, w } = ctx;
  const p = w.plots.get(plot);
  const v = p?.variants[variant];
  if (!p || !v || s.plots?.[plot]) return false;
  const entry = logEntry(ctx, { kind: 'plot', plot, variant, state: 'building' }, parent, []);
  (s.plots ??= {})[plot] = { state: 'building', variant, since: s.t, opened: null, cause: entry.id };
  const rec: EffectRecord = { kind: 'plot', plot, variant, state: 'building' };
  out?.push(rec);
  entry.effects.push(rec);
  ctx.events.push({ type: 'plot_building', plot, variant, anchor: v.anchor, orders: [...v.orders] });
  applyEffects(ctx, v.start, entry.id, entry.effects);
  checkPlotOpen(ctx, plot);
  return true;
}

/** 施工中的地块：这个变体的清理工单都做完了就开地（执行 opens.effects，发 plot_open） */
export function checkPlotOpen(ctx: Ctx, plot: string): boolean {
  const { s, w } = ctx;
  const st = s.plots?.[plot];
  const v = st ? w.plots.get(plot)?.variants[st.variant] : undefined;
  if (!st || !v || st.state !== 'building') return false;
  if (!v.orders.every((o) => (s.orderLog.done[o] ?? 0) > 0)) return false;
  st.state = 'open';
  st.opened = s.t;
  const entry = logEntry(ctx, { kind: 'plot', plot, variant: st.variant, state: 'open' }, st.cause, []);
  entry.effects.push({ kind: 'plot', plot, variant: st.variant, state: 'open' });
  ctx.events.push({ type: 'plot_open', plot, variant: st.variant, anchor: v.anchor });
  applyEffects(ctx, v.opens.effects, entry.id, entry.effects);
  return true;
}

/** 执行效果并写一条日志；返回日志条目。 */
export function run(ctx: Ctx, cause: Cause, parent: number | null, effects: readonly Effect[]): CausalEntry {
  const out: EffectRecord[] = [];
  const entry = logEntry(ctx, cause, parent, out);
  applyEffects(ctx, effects, entry.id, out);
  return entry;
}

/**
 * 星级（LG-10）：看一眼下一星的清单，满足就升（一次可以连升几星，每一星各写一条日志）。
 * 每 10 分钟、每天收盘、以及结束这一局之前（endAct）各看一次。
 */
export function checkStars(ctx: Ctx): void {
  const { s, w } = ctx;
  const levels = w.act.stars;
  if (!levels?.length) return;
  for (;;) {
    const stars = s.stars ?? 0;
    const lv = levels[stars];
    if (!lv || !Object.values(lv.requires).every((c) => test(s, w, c))) return;
    s.stars = stars + 1;
    const entry = run(ctx, { kind: 'star', stars: s.stars, opens: [...lv.opens] }, null, []);
    ctx.events.push({ type: 'star_up', stars: s.stars, opens: [...lv.opens] });
    // 升星带一张卡（W2 的选路卡）：下一分钟打开，因果链指向这次升星
    if (lv.card) s.cards.scheduled.push({ card: lv.card, at: s.t, cause: entry.id });
  }
}

/* ---------------- 结局方案 A（W4，LG-13；第二季和 HUD 的查询在 ending.ts） ---------------- */

export const endingOf = (w: World): Ending | null => w.act.ending ?? null;

/** 第一季的期限（绝对分钟） */
export const deadlineOf = (e: Ending): number => at(e.day, e.hour);

/** 旧存档或者测试手搓的状态可能没有 ending：补上初始值 */
export function endingState(s: GameState): GameState['ending'] {
  return (s.ending ??= { season: 1, exhibition: null, settlement: null, goal: null, land: {} });
}

/** 按 ending.score 算分项和总分，按 ending.grades 定评语（现在就结算的话会是多少；HUD 的预估也用它） */
export function scoreOf(s: GameState, w: World): { items: ScoreItem[]; total: number; grade: string } {
  const e = endingOf(w);
  if (!e) return { items: [], total: 0, grade: '' };
  const saved = s.rng;
  const items: ScoreItem[] = [];
  for (const [id, it] of Object.entries(e.score)) {
    const value = num(s, w, it.of);
    // 浮点误差：0.1 × 4560 = 455.99999…，向下取整前先补一点
    items.push({ id, value, per: it.per, points: Math.floor(value * it.per + 1e-9) });
  }
  s.rng = saved;
  const total = items.reduce((a, x) => a + x.points, 0);
  return { items, total, grade: gradeOf(e, total) };
}

/** 从上往下第一个 total ≥ gte 的档；都不够是最后一档 */
export function gradeOf(e: Ending, total: number): string {
  for (const g of e.grades) if (total >= g.gte) return g.grade;
  return e.grades[e.grades.length - 1]?.grade ?? '';
}

/** 第一季还没结算、结局打开着 */
const live = (s: GameState, w: World): Ending | null => {
  const e = endingOf(w);
  if (!e || s.outcome) return null;
  const st = endingState(s);
  return st.season === 1 && !st.settlement ? e : null;
};

/** 结算打分：写一条因果日志，发 settlement 和 actEnded（result: settled），这一季停下来 */
export function settle(ctx: Ctx, reason: Settlement['reason'], parent: number | null = null): boolean {
  const { s, w } = ctx;
  if (!live(s, w)) return false;
  // 先看一眼星级再结算：表演赛那张工单刚设了 exhibition_done，★5 要算进分里
  checkStars(ctx);
  const day = dayOf(s.t);
  const st = endingState(s);
  const sc = scoreOf(s, w);
  const settlement: Settlement = { t: s.t, day, reason, ...sc };
  st.settlement = settlement;
  s.outcome = { result: 'settled', ending: 'score', t: s.t };
  run(ctx, { kind: 'settlement', ...structuredClone(settlement) }, parent, []).effects.push({
    kind: 'end',
    result: 'settled',
    ending: 'score',
  });
  ctx.events.push({ type: 'settlement', ...structuredClone(settlement) });
  ctx.events.push({ type: 'actEnded', result: 'settled', ending: 'score' });
  return true;
}

/**
 * 每分钟（tick 开头）、每 10 分钟随星级、以及 endAct: won 时看一眼：
 * 到了期限就结算；表演赛刚办成就记下来、打开结局卡。
 */
export function checkEnding(ctx: Ctx, parent: number | null = null): void {
  const { s, w } = ctx;
  const e = live(s, w);
  if (!e) return;
  if (s.t >= deadlineOf(e)) {
    settle(ctx, 'deadline', parent);
    return;
  }
  const st = endingState(s);
  if (st.exhibition !== null || !test(s, w, e.exhibition)) return;
  st.exhibition = s.t;
  ctx.events.push({ type: 'ending_offered', day: dayOf(s.t), card: e.card ?? null });
  if (e.card) s.cards.scheduled.push({ card: e.card, at: s.t, cause: parent });
}

/**
 * 效果 endAct 在结局打开时怎么办：won（表演赛）不再结束这一局，改成看一眼结局（记下表演赛、来结局卡）；
 * lost 是破产（rules.lose_if 的结局）照旧结束；别的 lost（旧的期限卡）改成结算。
 * 返回 true 表示已经接管，effects.ts 不再按老办法结束。
 */
export function interceptEndAct(ctx: Ctx, result: 'won' | 'lost', ending: string, parent: number): boolean {
  const { s, w } = ctx;
  const e = endingOf(w);
  if (!e) return false;
  if (result === 'lost' && ending === w.act.rules.lose_if?.ending) return false;
  // 第二季：还没有结局，旧的通关和期限都不结束（第二季的目标是占位）
  if (endingState(s).season !== 1) return true;
  checkStars(ctx);
  if (result === 'won') checkEnding(ctx, parent);
  else settle(ctx, 'deadline', parent);
  return true;
}
