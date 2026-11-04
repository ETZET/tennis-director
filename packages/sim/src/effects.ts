import { type Effect, minutes, type Person, WORKER } from '@td/content';
import { clamp, type Value } from '@td/shared';
import type { SimEvent } from './events';
import { rand } from './rng';
import type { CausalEntry, Cause, EffectRecord, GameState } from './state';
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
      if (isCoach(def)) s.headCoach = e.hire;
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
      p.walk = null;
      p.errand = null;
      // 走的是主教练：还在的教练里接一个（Dale 开局不开除，一直都在）
      if (s.headCoach === e.fire) {
        const next = Object.values(s.people).find((q) => q.hired && isCoach(w.people.get(q.id)));
        s.headCoach = next?.id ?? null;
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
        p[attr] = clamp(before + num(s, w, v, ctx.vars), 0, 100);
        const delta = p[attr] - before;
        if (delta !== 0) out.push({ kind: 'person', person: who, attr, delta });
      }
    } else if ('condition' in e) {
      const before = s.condition[e.condition] ?? 100;
      const v = clamp(before + num(s, w, e.add, ctx.vars), 0, 100);
      s.condition[e.condition] = v;
      if (v !== before) out.push({ kind: 'condition', facility: e.condition, delta: v - before });
    } else if ('log' in e) {
      out.push({ kind: 'text', key: e.log });
    } else if ('endAct' in e) {
      if (s.outcome) continue;
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
    } else if ('task' in e) {
      // 把一张工单记给某人（ADR 0014 的 resume）：他手上的班或活结束、闲下来时，习惯系统让他自己走过去开工
      const p = s.people[e.who];
      if (!p?.hired || p.job === e.task) continue;
      p.resume = e.task;
      out.push({ kind: 'task', person: e.who, order: e.task });
    }
  }
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
    run(ctx, { kind: 'star', stars: s.stars, opens: [...lv.opens] }, null, []);
    ctx.events.push({ type: 'star_up', stars: s.stars, opens: [...lv.opens] });
  }
}
