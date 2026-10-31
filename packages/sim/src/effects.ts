import { type Effect, minutes } from '@td/content';
import { clamp } from '@td/shared';
import type { SimEvent } from './events';
import { rand } from './rng';
import type { CausalEntry, Cause, EffectRecord, GameState } from './state';
import { num, test } from './vars';
import type { World } from './world';

/**
 * 效果是白名单操作：改状态量、设标记、改设施、安排后续事件、开始活动、招人开人、
 * 改人的属性、写一行日志、结束本幕、「谁跟我走」。
 * 每次执行都写进因果日志，带着原因和引出它的上一条。
 */

export interface Ctx {
  readonly s: GameState;
  readonly w: World;
  readonly events: SimEvent[];
}

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

const PERSON_ATTRS = ['skill', 'morale', 'fatigue'] as const;

/** 执行一串效果，把结果追加到 out。entryId 是这次执行对应的日志条目（后续事件带着它当原因）。 */
export function applyEffects(ctx: Ctx, effects: readonly Effect[], entryId: number, out: EffectRecord[]): void {
  const { s, w } = ctx;
  for (const e of effects) {
    if (e.if && !test(s, w, e.if)) continue;
    if (e.chance !== undefined && !(rand(s) < num(s, w, e.chance))) continue;
    if ('stat' in e) {
      const before = s.stats[e.stat] ?? 0;
      const target = 'add' in e ? before + num(s, w, e.add) : num(s, w, e.set);
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
      const p = s.people[e.hire];
      if (!p || p.hired) continue;
      const def = w.people.get(e.hire);
      // 招来的教练接替现任主教练；现任还在的话先让他走
      if (def && (def.role === 'coach' || def.role === 'candidate')) {
        if (s.headCoach && s.headCoach !== e.hire) {
          const prev = s.people[s.headCoach];
          if (prev) prev.hired = false;
          out.push({ kind: 'fire', person: s.headCoach });
        }
        s.headCoach = e.hire;
        p.at = w.act.people.find((x) => x.head_coach)?.at ?? p.at;
      }
      p.hired = true;
      out.push({ kind: 'hire', person: e.hire });
    } else if ('fire' in e) {
      const p = s.people[e.fire];
      if (!p?.hired) continue;
      p.hired = false;
      if (s.headCoach === e.fire) s.headCoach = null;
      out.push({ kind: 'fire', person: e.fire });
    } else if ('person' in e) {
      const p = s.people[e.person];
      if (!p) continue;
      for (const attr of PERSON_ATTRS) {
        const v = e.add[attr];
        if (v === undefined) continue;
        const before = p[attr];
        p[attr] = clamp(before + num(s, w, v), 0, 100);
        const delta = p[attr] - before;
        if (delta !== 0) out.push({ kind: 'person', person: e.person, attr, delta });
      }
    } else if ('log' in e) {
      out.push({ kind: 'text', key: e.log });
    } else if ('endAct' in e) {
      if (s.outcome) continue;
      s.outcome = { result: e.endAct, ending: e.ending, t: s.t };
      out.push({ kind: 'end', result: e.endAct, ending: e.ending });
      ctx.events.push({ type: 'actEnded', result: e.endAct, ending: e.ending });
    } else if ('follow' in e) {
      if (!s.legacy.includes(e.follow)) s.legacy.push(e.follow);
      out.push({ kind: 'follow', person: e.follow });
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
