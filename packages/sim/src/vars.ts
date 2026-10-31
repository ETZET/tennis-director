import type { Cond } from '@td/content';
import { type ExprEnv, evalBool, evalNumber, type Value } from '@td/shared';
import { rand } from './rng';
import { dayOf, type GameState, minuteOfDay } from './state';
import type { World } from './world';

/**
 * 表达式和条件能读到的变量。名字和 @td/content 的 COMPUTED_VARS 一一对应，
 * 内容编译时按那张表检查，这里按同一张表提供。
 */

/** 主教练的专注度：特质里最低的那个倍数；总监站在他身边时是 1（"总监在场，教练不玩手机"） */
export function coachAttention(s: GameState, w: World): number {
  const id = s.headCoach;
  if (!id) return 0;
  const p = s.people[id];
  if (!p) return 0;
  if (s.director.at && s.director.at === p.at) return 1;
  const traits = w.people.get(id)?.traits ?? [];
  return traits.reduce((m, t) => Math.min(m, w.traits.get(t)?.attention ?? 1), 1);
}

export function facilityTotals(s: GameState, w: World) {
  let courts = 0;
  let quality = 0;
  let income = 0;
  let upkeep = 0;
  for (const [id, state] of Object.entries(s.facilities)) {
    const f = w.facilities.get(id)?.states[state];
    if (!f) continue;
    courts += f.courts;
    quality += f.quality;
    income += f.income_week;
    upkeep += f.upkeep_week;
  }
  return { courts, quality, income, upkeep };
}

export function wagesWeek(s: GameState, w: World): number {
  let total = 0;
  for (const p of Object.values(s.people)) if (p.hired) total += w.people.get(p.id)?.wage_week ?? 0;
  return total;
}

export function makeEnv(s: GameState, w: World, extra: Record<string, Value> = {}): ExprEnv {
  let fac: ReturnType<typeof facilityTotals> | null = null;
  const facs = () => (fac ??= facilityTotals(s, w));
  return {
    rand: () => rand(s),
    get(path) {
      if (path in extra) return extra[path];
      const dot = path.indexOf('.');
      const head = dot < 0 ? path : path.slice(0, dot);
      const rest = dot < 0 ? '' : path.slice(dot + 1);
      switch (head) {
        case 'stat':
          return s.stats[rest] ?? 0;
        case 'flag':
          return s.flags[rest] ?? false;
        case 'facility':
          return s.facilities[rest] ?? '';
        case 'person': {
          const [pid = '', attr = ''] = rest.split('.');
          const p = s.people[pid];
          if (attr === 'hired') return p?.hired ?? false;
          if (attr === 'talent') return w.people.get(pid)?.talent ?? 0;
          return p ? (p[attr as 'skill' | 'morale' | 'fatigue'] ?? 0) : 0;
        }
        case 'coach': {
          const p = s.headCoach ? s.people[s.headCoach] : undefined;
          if (rest === 'skill') return p?.skill ?? 0;
          if (rest === 'morale') return p?.morale ?? 0;
          if (rest === 'attention') return coachAttention(s, w);
          if (rest === 'hired') return !!p;
          if (rest === 'present') return !!p && s.director.at === p.at;
          return undefined;
        }
        case 'director':
          return rest === 'at' ? (s.director.at ?? '') : undefined;
        case 'courts_open':
          return facs().courts;
        case 'facility_quality':
          return facs().quality;
        case 'facility_income_week':
          return facs().income;
        case 'facility_upkeep_week':
          return facs().upkeep;
        case 'wages_week':
          return wagesWeek(s, w);
        case 'open_cards':
          return s.cards.open.length;
        case 'day':
          return dayOf(s.t);
        case 'hour':
          return minuteOfDay(s.t) / 60;
        default:
          return undefined;
      }
    },
  };
}

export const num = (s: GameState, w: World, v: number | string, extra?: Record<string, Value>): number =>
  typeof v === 'number' ? v : evalNumber(w.expr(v), makeEnv(s, w, extra));

/** 条件求值。条件是数据，不是代码。 */
export function test(s: GameState, w: World, c: Cond | undefined): boolean {
  if (!c) return true;
  if ('all' in c) return c.all.every((x) => test(s, w, x));
  if ('any' in c) return c.any.some((x) => test(s, w, x));
  if ('not' in c) return !test(s, w, c.not);
  if ('stat' in c) {
    const v = s.stats[c.stat] ?? 0;
    return (
      (c.lt === undefined || v < c.lt) &&
      (c.lte === undefined || v <= c.lte) &&
      (c.gt === undefined || v > c.gt) &&
      (c.gte === undefined || v >= c.gte) &&
      (c.eq === undefined || v === c.eq)
    );
  }
  if ('flag' in c) return (s.flags[c.flag] ?? false) === (c.is ?? true);
  if ('facility' in c) return s.facilities[c.facility] === c.is;
  if ('directorAt' in c) return s.director.at === c.directorAt;
  if ('day' in c) {
    const d = dayOf(s.t);
    return (c.day.gte === undefined || d >= c.day.gte) && (c.day.lte === undefined || d <= c.day.lte);
  }
  if ('hour' in c) {
    const h = minuteOfDay(s.t) / 60;
    return (c.hour.gte === undefined || h >= c.hour.gte) && (c.hour.lte === undefined || h <= c.hour.lte);
  }
  if ('seen' in c) return (s.cards.seen[c.seen] ?? 0) > 0;
  if ('open' in c) return s.cards.open.some((o) => o.card === c.open);
  if ('coach' in c) return c.coach === 'none' ? s.headCoach === null : s.headCoach === c.coach;
  if ('activity' in c) {
    const running = s.activities.some((a) => a.id === c.activity && a.started);
    return (c.running ?? true) === running;
  }
  return evalBool(w.expr(c.expr), makeEnv(s, w));
}
