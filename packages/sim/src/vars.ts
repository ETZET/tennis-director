import type { Cond, FacilityState } from '@td/content';
import { type ExprEnv, evalBool, evalNumber, type Value } from '@td/shared';
import { rand } from './rng';
import { DIRECTOR, dayOf, type GameState, minuteOfDay, type PersonAttr, weekdayOf } from './state';
import type { World } from './world';

/**
 * 表达式和条件能读到的变量。名字和 @td/content 的 COMPUTED_VARS 一一对应，
 * 内容编译时按那张表检查，这里按同一张表提供。
 */

/** 总监是不是和主教练在同一个地点（两人都没在路上） */
export function coachPresent(s: GameState): boolean {
  const c = s.headCoach ? s.people[s.headCoach] : undefined;
  const d = s.people[DIRECTOR];
  return !!c && !!d && !c.walk && !d.walk && c.at === d.at;
}

/** 主教练的专注度：特质里最低的那个倍数；总监和他在同一个地点时是 1（"总监在场，教练不玩手机"） */
export function coachAttention(s: GameState, w: World): number {
  const id = s.headCoach;
  if (!id) return 0;
  if (!s.people[id]) return 0;
  if (coachPresent(s)) return 1;
  const traits = w.people.get(id)?.traits ?? [];
  return traits.reduce((m, t) => Math.min(m, w.traits.get(t)?.attention ?? 1), 1);
}

/** 状况对设施质量贡献的倍数：30 以上全额，低于 30 减半，到 0 归零（只打折正的贡献） */
export function conditionFactor(c: number): number {
  return c <= 0 ? 0 : c < 30 ? 0.5 : 1;
}

/**
 * 本周到现在的服务率；本周还没有需求时用上周的。
 * 上周也没有需求（开局、或者还没有一个开放的岗位）时是 0，不是凭空的 50%（GM-1）：
 * 这时 hasDemand 为假，周结算不算服务项，界面显示"还没有客人"。
 */
export function serviceRate(s: GameState): number {
  if (s.week.demand > 0) return s.week.served / s.week.demand;
  return s.week.lastDemand > 0 ? s.week.last : 0;
}

/** 本周（或者上周）有没有需求：服务率有没有意义 */
export function hasDemand(s: GameState): boolean {
  return s.week.demand > 0 || s.week.lastDemand > 0;
}

/** 声望服务项的及格线 */
export const servicePass = (w: World): number => w.act.rules.week?.service_pass ?? 0.5;

/** 质量的目标和各项（没拆开写的目标只有一项 total） */
export function qualityTarget(s: GameState, w: World): { total: number; terms: Record<string, number> } {
  const src = w.act.rules.quality_target;
  if (typeof src === 'string') {
    const total = num(s, w, src);
    return { total, terms: { total } };
  }
  const terms: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(src)) {
    const x = num(s, w, v);
    terms[k] = x;
    total += x;
  }
  return { total, terms };
}

/** 能指派的人：在职的总监、教练和员工（青少年球员、家长不算） */
export function isStaff(s: GameState, w: World, id: string): boolean {
  const p = s.people[id];
  const role = w.people.get(id)?.role;
  return !!p?.hired && (role === 'director' || role === 'coach' || role === 'staff' || role === 'candidate');
}

/** 在职的人里作用是 tag、或者带着 tag 这个特质的有几个（变量 hired.<tag>） */
export function hiredWith(s: GameState, w: World, tag: string): number {
  let n = 0;
  for (const id in s.people) {
    if (!s.people[id]?.hired) continue;
    const d = w.people.get(id);
    if (d && (d.kind === tag || d.traits.includes(tag))) n++;
  }
  return n;
}

/**
 * 设施此刻这一档的数值（LG-14）：基础状态，换上变体的覆盖，再加上装上的升级。
 * 没有变体和升级的设施直接返回内容里的那一档（不新建对象）。
 */
export function stateDef(s: GameState, w: World, id: string): FacilityState | undefined {
  const f = w.facilities.get(id);
  const st = s.facilities[id] ?? '';
  const base = f?.states[st];
  if (!f || !base) return undefined;
  const v = s.variants?.[id];
  const over = v ? f.variants?.[v]?.states?.[st] : undefined;
  const ups = s.upgrades?.[id];
  if (!over && !ups?.length) return base;
  const d: FacilityState = over ? { ...base, ...over } : { ...base };
  for (const u of ups ?? []) {
    const add = f.upgrades?.[u]?.states?.[st];
    if (!add) continue;
    for (const k of ['courts', 'quality', 'income_week', 'upkeep_week', 'decay_day'] as const) d[k] += add[k] ?? 0;
  }
  d.decay_day = Math.max(0, d.decay_day);
  return d;
}

/** 这处设施在改造、停用着（LG-14）：没有场地、岗位和工单不开、质量和收入不算，维护费照付 */
export const remodeling = (s: GameState, id: string): boolean => !!s.remodels?.[id];

/**
 * "修好了"的唯一说法（变量 restored、HUD 的复原 stat.restoration、星级的"修好 N 处"、牌匾都用它）：
 * 状态和开局不一样、这一档给园区加分（quality > 0），而且没在改造。扫完沙、挖完沙这些中间状态不算；
 * 掉档停用（worn，质量 0）不算，重开以后又算；改造停用期间不算，期满又算。
 */
export const isRestored = (s: GameState, w: World, id: string): boolean =>
  s.facilities[id] !== w.act.facilities[id] && !remodeling(s, id) && (stateDef(s, w, id)?.quality ?? 0) > 0;

/** 修好了几处（变量 restored） */
export function restoredCount(s: GameState, w: World): number {
  let n = 0;
  for (const id of Object.keys(s.facilities)) if (isRestored(s, w, id)) n++;
  return n;
}

/** 设施合计。下雨天只有能挡雨的（rain_ok）场地算开放、有场地收入。 */
export function facilityTotals(s: GameState, w: World) {
  let courts = 0;
  let built = 0;
  let quality = 0;
  let income = 0;
  let upkeep = 0;
  const rain = s.weather === 'rain';
  for (const id of Object.keys(s.facilities)) {
    const f = stateDef(s, w, id);
    if (!f) continue;
    if (remodeling(s, id)) {
      upkeep += f.upkeep_week;
      continue;
    }
    const usable = !rain || f.rain_ok;
    courts += usable ? f.courts : 0;
    built += f.courts;
    quality += f.quality > 0 ? f.quality * conditionFactor(s.condition[id] ?? 100) : f.quality;
    income += usable ? f.income_week : 0;
    upkeep += f.upkeep_week;
  }
  return { courts, built, quality, income, upkeep };
}

export function wagesWeek(s: GameState, w: World): number {
  let total = 0;
  for (const p of Object.values(s.people)) if (isStaff(s, w, p.id)) total += w.people.get(p.id)?.wage_week ?? 0;
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
          return p ? (p[attr as PersonAttr] ?? 0) : 0;
        }
        case 'coach': {
          const p = s.headCoach ? s.people[s.headCoach] : undefined;
          if (rest === 'skill') return p?.skill ?? 0;
          if (rest === 'morale') return p?.morale ?? 0;
          if (rest === 'attention') return coachAttention(s, w);
          if (rest === 'hired') return !!p;
          if (rest === 'present') return coachPresent(s);
          return undefined;
        }
        case 'director':
          return rest === 'at' ? (s.people[DIRECTOR]?.at ?? '') : undefined;
        case 'condition':
          return s.condition[rest] ?? 100;
        case 'service_rate':
          return serviceRate(s);
        case 'service_demand':
          return hasDemand(s) ? 1 : 0;
        case 'service_pass':
          return servicePass(w);
        case 'courts_built':
          return facs().built;
        case 'hired':
          return hiredWith(s, w, rest);
        case 'staff': {
          let n = 0;
          for (const id of Object.keys(s.people)) if (isStaff(s, w, id)) n++;
          return n;
        }
        case 'weather':
          return s.weather;
        case 'season':
          return s.season;
        case 'weekday':
          return weekdayOf(s.t);
        case 'courts_open':
          return facs().courts;
        case 'facility_quality':
          return facs().quality;
        case 'facility_income_week':
          return facs().income;
        case 'facility_upkeep_week':
          return facs().upkeep;
        case 'restored':
          return restoredCount(s, w);
        case 'idle_days': {
          // 在职的人里闲得最久的那个，连续闲了几个营业日（720 营业分钟算一天）
          let m = 0;
          for (const id of Object.keys(s.people)) if (isStaff(s, w, id)) m = Math.max(m, s.people[id]?.idleMin ?? 0);
          return m / 720;
        }
        case 'stars':
          return s.stars ?? 0;
        case 'trophies':
          return s.trophies ?? 0;
        case 'variant':
          return s.variants?.[rest] ?? '';
        case 'quiet_days':
          return (s.t - (s.cards.lastOpened ?? 0)) / 1440;
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
  if ('variant' in c) return (s.variants?.[c.variant] ?? 'none') === c.is;
  if ('upgrade' in c) return !!s.upgrades?.[c.upgrade]?.includes(c.has);
  if ('assigned' in c) {
    const p = s.people[c.assigned];
    return !!p?.job && !p.walk && (c.at === undefined || p.at === c.at);
  }
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
  if ('weather' in c) return s.weather === c.weather;
  if ('season' in c) return s.season === c.season;
  if ('activity' in c) {
    const running = s.activities.some((a) => a.id === c.activity && a.started);
    return (c.running ?? true) === running;
  }
  return evalBool(w.expr(c.expr), makeEnv(s, w));
}
