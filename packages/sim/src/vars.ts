import type { Cond, FacilityState, SkillKind } from '@td/content';
import { type ExprEnv, evalBool, evalNumber, type Value } from '@td/shared';
import { levelFrom, surfaceOf, usabilityFrom } from './mess';
import { ACCESS } from './potential';
import { rand } from './rng';
import {
  type CareLevel,
  DIRECTOR,
  dayOf,
  type GameState,
  minuteOfDay,
  type PersonAttr,
  type PersonState,
  weekdayOf,
} from './state';
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

/**
 * 整季的服务率 0..1（W4 结局打分）：所有周结算（因果日志里的 week）加上这一周到现在，有人在岗的分钟 / 有需求的分钟。
 * 一直没有需求时是 0。只在结算打分时读（要扫一遍日志），别在每个 tick 的条件里用。
 */
export function serviceSeason(s: GameState): number {
  let demand = s.week.demand;
  let served = s.week.served;
  for (const e of s.log) {
    if (e.cause.kind !== 'week') continue;
    demand += e.cause.demand;
    served += e.cause.served;
  }
  return demand > 0 ? served / demand : 0;
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

export const tagged = (w: World, id: string, tag: string | undefined): boolean => {
  if (!tag) return true;
  const d = w.people.get(id);
  return !!d && (d.kind === tag || d.traits.includes(tag));
};

/** 在职、能指派的人里有没有一个 who 的这项能力（底子）≥ gte（条件 skilled） */
export function anySkilled(s: GameState, w: World, k: SkillKind, gte: number, who?: string): boolean {
  for (const id in s.people) {
    const p = s.people[id] as PersonState;
    if (isStaff(s, w, id) && tagged(w, id, who) && p[ACCESS[k]] >= gte) return true;
  }
  return false;
}

/** 在职、能指派的人里这项能力底子最高的值（变量 best.<能力>） */
export function bestSkill(s: GameState, w: World, k: SkillKind): number {
  let m = 0;
  for (const id in s.people) if (isStaff(s, w, id)) m = Math.max(m, (s.people[id] as PersonState)[ACCESS[k]]);
  return m;
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

/* ---------------- 场地可用度（court-care-contract.md）：读"场地开没开"的查询 ---------------- */

/** 这块场此刻开着、算可用度：是 rules.care.courts 里的设施，这一档有场地（courts > 0），没在改造 */
export function careActive(s: GameState, w: World, f: string): boolean {
  if (!w.act.rules.care?.courts[f]) return false;
  return !remodeling(s, f) && (stateDef(s, w, f)?.courts ?? 0) > 0;
}

/** 可用度 0..100（不取整）；不是球场、或者场地没开时是 100（变量 usability.<设施>） */
export function usabilityOf(s: GameState, w: World, f: string): number {
  if (!careActive(s, w, f)) return 100;
  const surface = surfaceOf(s, w, f);
  return surface
    ? usabilityFrom(w, surface, s.care?.[f]?.mess ?? { sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 })
    : 100;
}

/** 能打 / 勉强 / 不能打（不是球场、没开的场地算能打） */
export const careLevelOf = (s: GameState, w: World, f: string): CareLevel => levelFrom(w, usabilityOf(s, w, f));

/** 开着的球场里可用度最低的（变量 care.worst；没有开着的球场是 100） */
export function careWorst(s: GameState, w: World): number {
  let m = 100;
  for (const f of Object.keys(w.act.rules.care?.courts ?? {}))
    if (careActive(s, w, f)) m = Math.min(m, usabilityOf(s, w, f));
  return m;
}

/** 此刻在门口等的会员一共几个（变量 care.waiting） */
export function careWaiting(s: GameState): number {
  let n = 0;
  for (const c of Object.values(s.care ?? {})) n += c.waiting?.n ?? 0;
  return n;
}

/**
 * 这个岗位此刻因为它所在的球场"不能打"而停着：有需求的岗位这一分钟算需求、不算服务到；不转圈、没收入、没磨损。
 * 写了 care 的打扫岗位不受影响；不在球场上的岗位不受影响。
 */
export function careBlocksPost(s: GameState, w: World, post: string): boolean {
  return careLevelAtPost(s, w, post) === 'no';
}

/**
 * 岗位所在球场上一分钟的档（careSystem 存下的 s.care[f].level）：写了 care 的打扫岗位、不在球场上的岗位、
 * 场地没开的一律算能打。staff.ts 按它决定这一分钟算不算服务到（勉强只算 meh_service）、停不停转。
 */
export function careLevelAtPost(s: GameState, w: World, post: string): CareLevel {
  const p = w.posts.get(post);
  if (!p || p.care !== undefined) return 'ok';
  const f = w.facilityAt.get(p.at);
  if (!f || !w.act.rules.care?.courts[f]) return 'ok';
  const lvl = s.care?.[f]?.level ?? 'ok';
  return lvl === 'ok' || !careActive(s, w, f) ? 'ok' : lvl;
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

/** 分期筹备（W2）：这一组工单做完了几成 0..1（没有这一组是 0） */
export function prepProgress(s: GameState, w: World, group: string): number {
  const ids = w.prep.get(group);
  if (!ids?.length) return 0;
  let n = 0;
  for (const id of ids) if ((s.orderLog.done[id] ?? 0) > 0) n++;
  return n / ids.length;
}

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
        case 'usability':
          return usabilityOf(s, w, rest);
        case 'care':
          // 场地可用度（court-care-contract.md）
          if (rest === 'waiting') return careWaiting(s);
          if (rest === 'walkouts') return s.week.walkouts ?? 0;
          if (rest === 'worst') return careWorst(s, w);
          return undefined;
        case 'service_rate':
          return serviceRate(s);
        case 'service_season':
          return serviceSeason(s);
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
        case 'route':
          return s.routes?.[rest] ?? '';
        case 'plot':
          return s.plots?.[rest]?.state ?? 'locked';
        case 'prep':
          return prepProgress(s, w, rest);
        case 'best':
          return rest === 'teach' || rest === 'upkeep' || rest === 'service' || rest === 'play'
            ? bestSkill(s, w, rest)
            : undefined;
        case 'unlocked':
          return s.unlocks?.[rest] ? 1 : 0;
        case 'cycles':
          return s.week.cycles?.[rest] ?? 0;
        case 'event':
          // 赛事结算以外读到 0（结算时由 extra 提供，tournaments.ts）
          return 0;
        case 'ending':
          return endingVar(s, w, rest);
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
  if ('route' in c) return (s.routes?.[c.route] ?? 'none') === c.is;
  if ('plot' in c) {
    // 地块（W5）：is 是阶段（locked / building / open），或者变体（按它开了工、或者开了）
    const st = s.plots?.[c.plot];
    return c.is === 'locked' || c.is === 'building' || c.is === 'open'
      ? (st?.state ?? 'locked') === c.is
      : st?.variant === c.is;
  }
  if ('prep' in c) return prepProgress(s, w, c.prep) >= 1 === (c.done ?? true);
  if ('skilled' in c) return anySkilled(s, w, c.skilled, c.gte, c.who);
  if ('unlocked' in c) return !!s.unlocks?.[c.unlocked];
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

/** 变量 ending.*（W4 结局；地图没写 ending 时 days_early 是 0） */
export function endingVar(s: GameState, w: World, rest: string): Value | undefined {
  const st = s.ending;
  const e = w.act.ending;
  switch (rest) {
    case 'exhibition':
      return st?.exhibition !== null && st?.exhibition !== undefined ? 1 : 0;
    case 'days_early': {
      if (!e) return 0;
      const day = st?.settlement ? st.settlement.day : dayOf(s.t);
      return Math.max(0, e.day - day);
    }
    case 'exhibition_early': {
      if (!e || st?.exhibition === null || st?.exhibition === undefined) return 0;
      return Math.max(0, e.day - dayOf(st.exhibition));
    }
    case 'season':
      return st?.season ?? 1;
    case 'settled':
      return st?.settlement ? 1 : 0;
    default:
      return undefined;
  }
}
