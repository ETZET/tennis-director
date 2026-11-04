import { minutes, type Order, type Post, type SkillKind } from '@td/content';
import { clamp } from '@td/shared';
import { applyEffects, type Ctx, checkPlotOpen, run, setStat } from './effects';
import { growStaff, noteRecords, noteSkill } from './growth';
import { plotAllows, plotOrderPaused } from './plots';
import { rand } from './rng';
import {
  DIRECTOR,
  dayOf,
  type EffectRecord,
  type GameState,
  minuteOfDay,
  type PersonState,
  type PlaqueRow,
  weekdayOf,
} from './state';
import { eventPostOpen, tournamentOrder, tournamentOrderDone, trackEventMinute } from './tournaments';
import { isRestored, isStaff, num, prepProgress, remodeling, stateDef, test } from './vars';
import { haltWalk, leaveJob, walkTo } from './walk';
import type { World } from './world';

/**
 * 招人和排人（ADR 0012）：玩家把人拖到岗位或工单上。
 *
 * - 持续岗位：有人坐着、在它的时段里、条件满足时一圈一圈地转，每圈结算一次效果。有时段的岗位是"需求"，
 *   时段里每分钟都计入本周服务率的分母，有人在岗才计入分子。被拉走：这一圈作废，已算的服务分钟退回去。
 * - 一次性工单：拖人上去开工（第一个人到场时扣材料费），可以多人一起；被拉走进度保留；做满就结算。
 * - 设施状况：收盘时按 decay_day × 季节倍数衰减（今天有人守着再乘 rules.staffed_decay）；岗位每圈的 wear 额外磨损；维护岗位和工单修复。
 */

/** 人在某项能力上的值（底子，不算特质） */
export const skillOf = (p: PersonState, k: SkillKind): number => (k === 'teach' ? p.skill : (p[k] ?? 0));

/**
 * 干活时的能力：底子加上特质的加成（例如"沙漠长大"大风天维护 +15、"夜猫子"下午四点以后 +12），截在 0..100。
 * 速度、维护的修复量、每圈收入（worker.skill）都按它算。
 */
export function workSkill(s: GameState, w: World, id: string, k: SkillKind): number {
  const p = s.people[id];
  if (!p) return 0;
  let v = skillOf(p, k);
  for (const t of w.people.get(id)?.traits ?? []) {
    const tr = w.traits.get(t);
    const b = tr?.bonus[k];
    if (b && test(s, w, tr.when)) v += b;
  }
  return clamp(v, 0, 100);
}

/** 这个人能不能干这个岗位或工单：没写 only 谁都行；写了要作用或特质命中一个 */
export function eligible(w: World, id: string, t: Post | Order): boolean {
  if (!t.only) return true;
  const d = w.people.get(id);
  return !!d && ((!!d.kind && t.only.includes(d.kind)) || d.traits.some((x) => t.only?.includes(x)));
}

/** 工单（LG-14）和岗位（W3）的能力门槛 worker：底子（不算特质）每一项都够才行 */
export function meetsWorker(s: GameState, id: string, o: Post | Order): boolean {
  if (!o.worker) return true;
  const p = s.people[id];
  if (!p) return false;
  for (const [k, v] of Object.entries(o.worker)) if (v !== undefined && skillOf(p, k as SkillKind) < v) return false;
  return true;
}

/* ---------------- 修复变体、升级、改造（LG-14） ---------------- */

/** 工单落在哪处设施上（这个地点的设施） */
export const orderFacility = (w: World, o: Order): string | undefined => w.facilityAt.get(o.at);

/** 工单可选的变体（没有变体是空表；第一个是默认） */
export const orderVariants = (o: Order): string[] => Object.keys(o.variants ?? {});

/** 此刻能选的变体（W2：变体可以写 when，例如按选的路先开）；给了 w 才看条件 */
export function openVariants(s: GameState, w: World, o: Order): string[] {
  return orderVariants(o).filter((v) => test(s, w, o.variants?.[v]?.when));
}

/**
 * 这张变体工单现在算哪个变体：开了工就是锁定的那个；还没开工是玩家最后拖向的那个；都没有就是第一个
 * （给了 w 时是第一个此刻能选的）。没有变体的工单是 null。
 */
export function orderVariant(s: GameState, o: Order, w?: World): string | null {
  if (!o.variants) return null;
  const first = (w ? openVariants(s, w, o)[0] : undefined) ?? orderVariants(o)[0] ?? null;
  return s.orders[o.id]?.variant ?? s.picks?.[o.id] ?? first;
}

/** 某个变体（不写就按 orderVariant）的材料费和工作量；赛事的报名工单按赛事的报名费（LG-11） */
export function orderCost(s: GameState, o: Order, variant?: string | null, w?: World): number {
  const fee = w?.tournamentOf.get(o.id)?.fee;
  if (fee) return fee;
  const v = variant === undefined ? orderVariant(s, o) : variant;
  return (v ? o.variants?.[v]?.cost : undefined) ?? o.cost;
}

/** 至少几个人到场才开工（W2 的 min_crew；不写是 1） */
export function minCrew(s: GameState, w: World, o: Order): number {
  if (o.min_crew === undefined) return 1;
  const saved = s.rng;
  const v = Math.max(1, Math.round(num(s, w, o.min_crew)));
  s.rng = saved;
  return v;
}
export function orderWork(s: GameState, o: Order, variant?: string | null): number {
  const v = variant === undefined ? orderVariant(s, o) : variant;
  return minutes((v ? o.variants?.[v]?.work : undefined) ?? o.work);
}

/** 改造停用多久（游戏分钟）：不写是一周 */
export const remodelMinutes = (o: Order): number => minutes(o.closed_for ?? '7d');

/** 能力换算成速度：能力 50 的人是 1 倍 */
export const speedOf = (skill: number): number => 0.5 + skill / 100;

const hourNow = (s: GameState): number => minuteOfDay(s.t) / 60;

/**
 * 岗位现在存不存在（条件满足；所在的设施在改造时不开）。赛事（LG-11）：临时岗位只在接下的赛事比赛日存在，
 * 赛事 closes 的岗位比赛日整天不开。
 */
export const postExists = (s: GameState, w: World, p: Post): boolean =>
  !remodeling(s, w.facilityAt.get(p.at) ?? '') &&
  eventPostOpen(s, w, p.id) !== false &&
  plotAllows(s, w, p.id, p.at) &&
  test(s, w, p.when);

/** 岗位现在在不在它的时段里（没有时段的岗位营业时间都算） */
export function postInHours(s: GameState, p: Post): boolean {
  if (p.days && !p.days.includes(weekdayOf(s.t))) return false;
  if (!p.hours) return true;
  const h = hourNow(s);
  return h >= p.hours[0] && h < p.hours[1];
}

/** 有需求的岗位此刻有没有客人在等 */
export const postDemand = (s: GameState, w: World, p: Post): boolean =>
  !!p.hours && postInHours(s, p) && postExists(s, w, p);

/** 这个人此刻是不是在 job 上干活（到场了、没在路上、没在办别的事） */
export function working(s: GameState, w: World, id: string): boolean {
  const p = s.people[id];
  if (!p?.job || p.walk || p.errand) return false;
  const at = w.posts.get(p.job)?.at ?? w.orders.get(p.job)?.at;
  return at === p.at;
}

/** 谁坐在这个岗位上（包括还在路上的） */
export const occupant = (s: GameState, post: string): string | null =>
  Object.values(s.people).find((p) => p.hired && p.job === post)?.id ?? null;

/** 谁被派到这张工单上 */
export const crewOf = (s: GameState, order: string): string[] =>
  Object.values(s.people)
    .filter((p) => p.hired && p.job === order)
    .map((p) => p.id);

/* ---------------- 工单什么时候出现 ---------------- */

/** early：外出赛事的工单出现了、要到比赛那天才能开工（LG-11） */
export type OrderBlock = 'cooldown' | 'done' | 'cost' | 'crew' | 'early' | null;

export function orderVisible(s: GameState, w: World, o: Order): boolean {
  // 赛事的报名工单由日历决定什么时候出现（冷却、once 不管）
  const t = w.tournamentOf.get(o.id);
  if (t) return tournamentOrder(s, w, t, o).visible && plotAllows(s, w, o.id, o.at);
  // 地块（W5）：清理工单只在施工时有、只做一次；地块上的工单要开了才有
  if (!plotAllows(s, w, o.id, o.at)) return false;
  if (w.plotOrders.has(o.id) && (s.orderLog.done[o.id] ?? 0) > 0) return false;
  // 分期筹备的每一期只做一次
  if ((o.once || o.prep) && (s.orderLog.done[o.id] ?? 0) > 0) return false;
  if ((s.orderLog.cooldowns[o.id] ?? -1) > s.t) return false;
  const f = orderFacility(w, o);
  if (f && remodeling(s, f)) return false;
  if (f && o.upgrade) {
    if (s.upgrades?.[f]?.includes(o.upgrade)) return false;
    const only = w.facilities.get(f)?.upgrades?.[o.upgrade]?.variant;
    if (only && s.variants?.[f] !== only) return false;
  }
  if (f && o.remodel) {
    const v = s.variants?.[f];
    if (!v || v === o.remodel) return false;
  }
  return test(s, w, o.when);
}

/* ---------------- 给界面和机器人的状态 ---------------- */

export interface PostStatus {
  id: string;
  at: string;
  skill: SkillKind;
  /** 岗位此刻存在（条件满足）；不存在的岗位界面不画 */
  exists: boolean;
  /** 有需求的岗位（有时段） */
  demand: boolean;
  /** 现在是它的时段 */
  inHours: boolean;
  person: string | null;
  /** 在岗的人正在转圈 */
  active: boolean;
  /** 这一圈的进度 0..1 */
  progress: number;
  cycle: number;
}

export function postStatus(s: GameState, w: World, p: Post): PostStatus {
  const person = occupant(s, p.id);
  const exists = postExists(s, w, p);
  const inHours = postInHours(s, p);
  const cycle = minutes(p.cycle);
  return {
    id: p.id,
    at: p.at,
    skill: p.skill,
    exists,
    demand: !!p.hours,
    inHours,
    person,
    active: !!person && exists && inHours && working(s, w, person),
    progress: (s.posts[p.id]?.progress ?? 0) / cycle,
    cycle,
  };
}

export interface OrderStatus {
  id: string;
  at: string;
  skill: SkillKind;
  visible: boolean;
  blocked: OrderBlock;
  crew: string[];
  maxCrew: number;
  cost: number;
  started: boolean;
  /** 进度 0..1 */
  progress: number;
  /** 工作量（能力 50 的人·分钟） */
  work: number;
  /** 有判定的工单：成功率 */
  chance: number | null;
  /** 修复变体（LG-14）：可选的变体（没有是 null）、现在算哪个（锁定的、拖向的或默认的）、锁定了没有 */
  variants: string[] | null;
  variant: string | null;
  locked: boolean;
  /** 能力门槛（worker）：要哪项能力、至少多少；没有是 null */
  worker: Partial<Record<SkillKind, number>> | null;
  /** 升级工单装哪个升级、改造工单换成哪个变体 */
  upgrade: string | null;
  remodel: string | null;
  /** W2：此刻能选的变体（变体的 when）；至少几个人到场才开工；赛事的报名工单是哪项赛事；分期筹备是哪一组 */
  openVariants: string[] | null;
  minCrew: number;
  tournament: string | null;
  prep: string | null;
  /** W5：清理工单是哪块地的；工地停工（主办赛事的比赛日）时不走进度 */
  plot: string | null;
  paused: boolean;
}

/**
 * 工单表达式里的 worker.skill：在干的人里那项能力最高的；还没人干时，按能来干的在职的人里最高的估
 * （卡和清单上的成功率因此跟着"谁去"变）。
 */
export function orderLead(s: GameState, w: World, o: Order): { id: string | null; skill: number } {
  const crew = crewOf(s, o.id);
  const pool = crew.length ? crew : staffIds(s, w).filter((id) => eligible(w, id, o) && meetsWorker(s, id, o));
  let best: { id: string | null; skill: number } = { id: null, skill: 0 };
  for (const id of pool) {
    const v = workSkill(s, w, id, o.skill);
    if (best.id === null || v > best.skill) best = { id, skill: v };
  }
  return best;
}

function checkChance(s: GameState, w: World, o: Order): number | null {
  if (!o.check) return null;
  if ('stat' in o.check) return clamp(0.5 + ((s.stats[o.check.stat] ?? 0) - o.check.vs) / 50, 0.05, 0.95);
  const saved = s.rng;
  // 只有用到 worker.skill 的判定才去找"谁去"（表演赛不看人，省一次人员表扫描）
  const vars = o.check.chance.includes('worker.') ? { 'worker.skill': orderLead(s, w, o).skill } : undefined;
  const v = clamp(num(s, w, o.check.chance, vars), 0, 1);
  s.rng = saved;
  return v;
}

export function orderStatus(s: GameState, w: World, o: Order): OrderStatus {
  const st = s.orders[o.id];
  const crew = crewOf(s, o.id);
  const work = orderWork(s, o);
  const cost = orderCost(s, o, undefined, w);
  const visible = orderVisible(s, w, o);
  const tour = w.tournamentOf.get(o.id);
  const early = !!tour && visible && tournamentOrder(s, w, tour, o).early;
  const blocked: OrderBlock = !visible
    ? (s.orderLog.cooldowns[o.id] ?? -1) > s.t
      ? 'cooldown'
      : 'done'
    : early
      ? 'early'
      : !st?.started && cost > 0 && cost > (s.stats.cash ?? 0)
        ? 'cost'
        : crew.length >= o.crew
          ? 'crew'
          : null;
  return {
    id: o.id,
    at: o.at,
    skill: o.skill,
    visible,
    blocked,
    crew,
    maxCrew: o.crew,
    cost,
    started: !!st?.started,
    progress: (st?.progress ?? 0) / work,
    work,
    chance: checkChance(s, w, o),
    variants: o.variants ? orderVariants(o) : null,
    variant: orderVariant(s, o, w),
    locked: !!st?.variant,
    worker: o.worker ?? null,
    upgrade: o.upgrade ?? null,
    remodel: o.remodel ?? null,
    openVariants: o.variants ? openVariants(s, w, o) : null,
    minCrew: minCrew(s, w, o),
    tournament: tour?.id ?? null,
    prep: o.prep ?? null,
    plot: w.plotOrders.get(o.id)?.plot ?? null,
    paused: plotOrderPaused(s, w, o.id),
  };
}

/** 能指派的人 */
export const staffIds = (s: GameState, w: World): string[] => Object.keys(s.people).filter((id) => isStaff(s, w, id));

/* ---------------- 命令：指派 ---------------- */

/**
 * 指派不了的原因。skill：能力不到工单的 worker 门槛；variant：变体不是这张工单的，或者工单已经锁定了另一个变体。
 */
export type AssignBlock =
  | 'person'
  | 'busy'
  | 'target'
  | 'only'
  | 'skill'
  | 'variant'
  | 'gone'
  | 'early'
  | 'cost'
  | 'crew'
  | 'same'
  | null;

/**
 * 能不能把 person 派到 target（null 表示叫他停下来）。variant：把人拖到变体工单的哪一行上（不写就按
 * 已经锁定的、上次拖向的、或者第一个变体）。
 */
export function canAssign(
  s: GameState,
  w: World,
  person: string,
  target: string | null,
  variant?: string,
): AssignBlock {
  const p = s.people[person];
  if (!p || !isStaff(s, w, person)) return 'person';
  // 事件派去办的事还没办完，叫不回来（选项的代价就是总监的这段时间）
  if (p.errand) return 'busy';
  if (target === null) return p.job ? null : 'same';
  const order0 = w.orders.get(target);
  if (variant !== undefined) {
    if (!order0?.variants || !(variant in order0.variants)) return 'variant';
    const locked = s.orders[target]?.variant;
    if (locked && locked !== variant) return 'variant';
    if (!locked && !test(s, w, order0.variants[variant]?.when)) return 'variant';
  }
  // 已经在这张变体工单上、只是换一行（还没开工）：算改选变体
  if (p.job === target && !(variant !== undefined && !s.orders[target] && s.picks?.[target] !== variant)) return 'same';
  const post = w.posts.get(target);
  if (post)
    return !eligible(w, person, post)
      ? 'only'
      : !meetsWorker(s, person, post)
        ? 'skill'
        : postExists(s, w, post)
          ? null
          : 'gone';
  const order = w.orders.get(target);
  if (!order) return 'target';
  if (!eligible(w, person, order)) return 'only';
  if (!meetsWorker(s, person, order)) return 'skill';
  if (!orderVisible(s, w, order)) return 'gone';
  const tour = w.tournamentOf.get(target);
  if (tour && tournamentOrder(s, w, tour, order).early) return 'early';
  const started = !!s.orders[target]?.started;
  const cost = orderCost(s, order, variant ?? orderVariant(s, order, w), w);
  if (!started && cost > 0 && cost > (s.stats.cash ?? 0)) return 'cost';
  if (p.job !== target && crewOf(s, target).length >= order.crew) return 'crew';
  return null;
}

/**
 * 把一个人派到岗位或工单上：放下手上的事（持续岗位这一圈作废），走过去，到了就开始干。
 * 拖到有人的岗位上：原来的人让出来、原地闲着（这一圈同样作废）。
 */
export function assign(ctx: Ctx, person: string, target: string | null, learn = false, variant?: string): boolean {
  const { s, w } = ctx;
  const block = canAssign(s, w, person, target, variant);
  // 玩家把人拖到他已经在的岗位上（例如习惯带他来的）：算"就守这儿"，守着的岗位换成它
  if (block === 'same' && learn && target) {
    const tp = w.posts.get(target);
    const p = s.people[person];
    if (tp && p) p.pin = pinnable(w, tp) ? target : null;
  }
  if (block !== null) return false;
  // 变体工单还没开工：记下玩家拖向的变体（第一个人到场时锁定）
  const vo = target ? w.orders.get(target) : undefined;
  if (vo?.variants && !s.orders[vo.id]) {
    s.picks ??= {};
    s.picks[vo.id] = variant ?? s.picks[vo.id] ?? (orderVariant(s, vo, w) as string);
    if (s.people[person]?.job === target) {
      ctx.events.push({ type: 'assigned', person, target });
      return true; // 只是换了一行
    }
  }
  // 玩家亲手派的才记进习惯；叫停就把手上那个岗位从习惯里拿掉
  if (learn) learnRoutine(s, w, person, target);
  const p = s.people[person] as PersonState;
  // 人-13：从岗位上派去工单，记下原来的岗位（工单做完回去）；从工单派去另一张工单，原来的岗位照旧记着
  const prevJob = p.job;
  if (target && w.orders.has(target)) p.back = prevJob && w.posts.has(prevJob) ? prevJob : (p.back ?? null);
  else p.back = null;
  // 守着的岗位（pin，W2 试玩）：玩家亲手派到"随时"岗位或赛事临时岗位上就守着它；玩家派去别处、叫停就不守了。
  // 习惯、做完工单回去（不是玩家亲手派的）不动它；派去工单时原来守着的岗位就是 back，做完回去接着守
  if (target === null) p.pin = null;
  else if (learn) {
    const tp = w.posts.get(target);
    if (tp) p.pin = pinnable(w, tp) ? target : null;
    else if (p.pin && p.pin !== p.back) p.pin = null;
  }
  leaveJob(ctx, person);
  if (target === null) {
    // 叫停：走在路上的人不再去原来的地方，走到脚下这段路近的那头站住（walk.ts haltWalk）
    haltWalk(ctx, person);
    ctx.events.push({ type: 'assigned', person, target: null });
    return true;
  }
  const post = w.posts.get(target);
  if (post) {
    const prev = occupant(s, target);
    if (prev) {
      const pp = s.people[prev] as PersonState;
      if (pp.pin === target) pp.pin = null;
      leaveJob(ctx, prev);
      ctx.events.push({ type: 'assigned', person: prev, target: null });
    }
  }
  const at = (post?.at ?? w.orders.get(target)?.at) as string;
  if (walkTo(ctx, person, at) === null) return false;
  p.job = target;
  ctx.events.push({ type: 'assigned', person, target });
  return true;
}

/* ---------------- 习惯（ADR 0014） ---------------- */

/** 玩家亲手派上去就一直守着的岗位：没有时段的"随时"岗位（维护），赛事的临时岗位（这一期的每个比赛日） */
export const pinnable = (w: World, p: Post): boolean => !p.hours || w.eventPosts.has(p.id);

/** 一个人最多记住几个岗位 */
export const ROUTINE_MAX = 4;
/** 离时段结束不到这么多分钟就不再按习惯赶过去 */
const ROUTINE_MIN_LEFT = 45;

const overlaps = (a: Post, b: Post): boolean => {
  if (!a.hours || !b.hours) return !a.hours && !b.hours; // "随时"的岗位只记一个
  const days = !a.days || !b.days || a.days.some((d) => b.days?.includes(d));
  return days && a.hours[0] < b.hours[1] && b.hours[0] < a.hours[1];
};

/** 玩家把 person 派到 target：岗位记进他的习惯（顶掉和它时段重叠的），并从别人的习惯里拿掉 */
export function learnRoutine(s: GameState, w: World, person: string, target: string | null): void {
  const p = s.people[person];
  if (!p) return;
  p.routine ??= [];
  p.resume = null;
  if (target === null) {
    if (p.job) p.routine = p.routine.filter((x) => x !== p.job);
    return;
  }
  const post = w.posts.get(target);
  if (!post) return; // 工单是一次性的，不进习惯
  if (w.eventPosts.has(target)) return; // 赛事的临时岗位只开那几天，也不进习惯
  for (const q of Object.values(s.people)) if (q.routine) q.routine = q.routine.filter((x) => x !== target);
  p.routine = [
    target,
    ...p.routine.filter((x) => {
      const o = w.posts.get(x);
      return o && !overlaps(o, post);
    }),
  ].slice(0, ROUTINE_MAX);
}

/**
 * 现在这个人按习惯该去哪儿（null = 留在原地）：
 * 0. 在做工单（人-13）：不动，做完以前不被习惯拉走（做完回到原来的岗位，见 finishOrder）。
 * 0'. 守着的岗位（pin）：在上面而且它开着（"随时"岗位一直算开着）就不动；不在上面（被事件叫走办完了、
 *    临时岗位第二天开门）而它此刻开着、空着、离结束还有 45 分钟以上 → 回去。临时岗位过了时段照下面的习惯走，
 *    下一个比赛日到点再回来。
 * 1. 在开着的班上：不动。
 * 2. 有个记住的班此刻开着、空着、离结束还有 45 分钟以上 → 去上班。
 * 3. 手上没活（班关了、闲着）：去记给他的工单（效果 task）；再不然去记住的"随时"岗位（维护）。
 */
export function routineTarget(s: GameState, w: World, id: string): string | null {
  const p = s.people[id];
  if (!p?.hired || p.errand || p.walk) return null;
  const cur = p.job ? w.posts.get(p.job) : undefined;
  if (p.job && !cur) return null;
  const open = (x: Post) => postInHours(s, x) && postExists(s, w, x);
  const free = (x: Post) => {
    const who = occupant(s, x.id);
    return who === null || who === id;
  };
  const now = minuteOfDay(s.t);
  const left = (x: Post) => (x.hours ? x.hours[1] * 60 - now : Number.POSITIVE_INFINITY);
  const pin = p.pin ? w.posts.get(p.pin) : undefined;
  if (pin && open(pin)) {
    if (pin.id === p.job) return null;
    if (free(pin) && left(pin) >= ROUTINE_MIN_LEFT) return pin.id;
  }
  if (cur?.hours && open(cur)) return null;
  for (const x of p.routine ?? []) {
    const post = w.posts.get(x);
    if (!post?.hours || post.id === p.job || !open(post) || !free(post) || left(post) < ROUTINE_MIN_LEFT) continue;
    return post.id;
  }
  if (cur && !cur.hours && open(cur)) return null;
  const back = p.resume ? w.orders.get(p.resume) : undefined;
  if (back && canAssign(s, w, id, back.id) === null) return back.id;
  for (const x of p.routine ?? []) {
    const post = w.posts.get(x);
    if (!post || post.hours || post.id === p.job || !open(post) || !free(post)) continue;
    return post.id;
  }
  return null;
}

/**
 * 每 10 分钟：按习惯换班。这是玩家布置好的安排，不是被叫走：
 * 关了门的岗位上没转完的一圈直接清掉，不记"白干了"（只有玩家或事件中途拉人才算）。
 */
function routineSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  if (minuteOfDay(s.t) % 10 !== 0) return;
  for (const id of staffIds(s, w)) {
    const p = s.people[id] as PersonState;
    // 守着的岗位没了（设施掉档、赛事收了）：不再守，回到习惯（准则：岗位关了就回习惯）
    if (p.pin) {
      const pp = w.posts.get(p.pin);
      if (!pp || !postExists(s, w, pp)) p.pin = null;
    }
    const t = routineTarget(s, w, id);
    if (!t) continue;
    const job = p.job;
    if (job && w.posts.has(job)) delete s.posts[job];
    if (t === p.resume) p.resume = null;
    if (assign(ctx, id, t)) ctx.events.push({ type: 'routine', person: id, target: t });
  }
}

/* ---------------- 每分钟：岗位、工单、办事 ---------------- */

function condAdd(ctx: Ctx, anchor: string, delta: number, out?: EffectRecord[]): void {
  const { s, w } = ctx;
  const f = w.facilityAt.get(anchor);
  if (!f || !delta) return;
  const before = s.condition[f] ?? 100;
  const v = clamp(before + delta, 0, 100);
  s.condition[f] = v;
  if (out && v !== before) out.push({ kind: 'condition', facility: f, delta: v - before });
}

/**
 * 干完一圈或一张工单，那项能力涨一点（有上限）。总监：director_growth、上限 director_skill_cap，一直开着
 * （总监没有情绪，能力随游戏慢慢成长）。员工：W3 的成长（growth.ts，growth.enabled 才涨，上限是潜力）。
 */
function grow(ctx: Ctx, person: string, k: SkillKind): void {
  const { s, w } = ctx;
  if (person !== DIRECTOR) {
    growStaff(ctx, person, k);
    return;
  }
  const p = s.people[person];
  if (!p) return;
  const cap = w.act.rules.director_skill_cap;
  const before = skillOf(p, k);
  if (before >= cap) return;
  const v = Math.min(cap, before + w.act.rules.director_growth);
  if (k === 'teach') p.skill = v;
  else p[k] = v;
  if (Math.floor(v / 10) > Math.floor(before / 10))
    ctx.events.push({ type: 'directorGrew', skill: k, value: Math.floor(v / 10) * 10 });
  // W3：成长打开时总监也发 skill_up、也能开出解锁（涨的规则照旧，不另加 growth.rate）
  noteSkill(ctx, person, k, before);
}

function finishCycle(ctx: Ctx, post: Post, person: string): void {
  const { s, w } = ctx;
  const skill = workSkill(s, w, person, post.skill);
  const entry = (s.ledger[post.id] ??= { person, cycles: 0, effects: [] });
  entry.person = person;
  entry.cycles += 1;
  const wk = (s.week.cycles ??= {});
  wk[post.id] = (wk[post.id] ?? 0) + 1;
  const out: EffectRecord[] = [];
  applyEffects({ ...ctx, vars: { 'worker.skill': skill }, worker: person }, post.effects, -1, out);
  noteRecords(ctx, out);
  if (post.wear) condAdd(ctx, post.at, -post.wear);
  if (post.restore) condAdd(ctx, post.at, post.restore * speedOf(skill), out);
  // 同一种效果合并成一条，收盘时写进日志
  for (const r of out) {
    const same = entry.effects.find(
      (x) =>
        (x.kind === 'stat' && r.kind === 'stat' && x.stat === r.stat) ||
        (x.kind === 'condition' && r.kind === 'condition' && x.facility === r.facility) ||
        (x.kind === 'person' && r.kind === 'person' && x.person === r.person && x.attr === r.attr),
    );
    if (same && 'delta' in same && 'delta' in r) same.delta = Math.round((same.delta + r.delta) * 100) / 100;
    else entry.effects.push(r);
  }
  grow(ctx, person, post.skill);
  ctx.events.push({ type: 'postCycle', post: post.id, person });
}

/** 这一分钟谁在哪个岗位或工单上（每个 tick 建一次，省得每个岗位都扫一遍人员表） */
function jobIndex(s: GameState): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const id in s.people) {
    const p = s.people[id] as PersonState;
    if (!p.hired || !p.job) continue;
    const xs = m.get(p.job);
    if (xs) xs.push(id);
    else m.set(p.job, [id]);
  }
  return m;
}

function postSystem(ctx: Ctx, jobs: Map<string, string[]>): void {
  const { s, w } = ctx;
  const anyEvent = Object.keys(s.events ?? {}).length > 0;
  for (const post of w.posts.values()) {
    const person = jobs.get(post.id)?.[0] ?? null;
    // 先看便宜的（时段、有没有人），再求条件
    const inHours = postInHours(s, post);
    if (!inHours || (!person && !post.hours)) {
      if (s.posts[post.id]) delete s.posts[post.id];
      continue;
    }
    const exists = postExists(s, w, post);
    const demand = exists && !!post.hours;
    const busy = !!person && exists && working(s, w, person);
    if (demand) {
      s.week.demand += 1;
      if (busy) s.week.served += 1;
      else s.week.missed[post.id] = (s.week.missed[post.id] ?? 0) + 1;
      // 赛事那几天（LG-11）：附加目标看这一场的服务率、临时岗位的到岗率
      if (anyEvent) trackEventMinute(s, w, post.id, demand, busy);
    }
    if (!busy) {
      // 时段过了、条件没了、人走了：这一圈作废（被拉走的情况已经在 leaveJob 里结算过）
      if (s.posts[post.id]) delete s.posts[post.id];
      continue;
    }
    const st = (s.posts[post.id] ??= { progress: 0 });
    st.progress += 1;
    if (st.progress >= minutes(post.cycle)) {
      st.progress = 0;
      finishCycle(ctx, post, person as string);
    }
  }
}

function finishOrder(ctx: Ctx, o: Order): void {
  const { s, w } = ctx;
  const crew = crewOf(s, o.id);
  const lead = orderLead(s, w, o);
  const st = s.orders[o.id];
  const f = orderFacility(w, o);
  const wasRestored = !!f && isRestored(s, w, f);
  const variant = st?.variant ?? null;
  delete s.orders[o.id];
  let success: boolean | undefined;
  if (o.check) success = rand(s) < (checkChance(s, w, o) ?? 1);
  const effects = [
    ...o.effects,
    ...((variant && o.variants?.[variant]?.effects) || []),
    ...(success === undefined ? [] : success ? o.onSuccess : o.onFail),
  ];
  const entry = run(
    { ...ctx, vars: { 'worker.skill': lead.skill }, ...(lead.id ? { worker: lead.id } : {}) },
    { kind: 'order', order: o.id, people: crew, ...(success === undefined ? {} : { success }) },
    null,
    effects,
  );
  noteRecords(ctx, entry.effects);
  if (o.restore) condAdd(ctx, o.at, o.restore, entry.effects);
  if (f && variant) entry.effects.push({ kind: 'variant', facility: f, variant });
  if (f && o.upgrade && !s.upgrades[f]?.includes(o.upgrade)) {
    (s.upgrades[f] ??= []).push(o.upgrade);
    entry.effects.push({ kind: 'upgrade', facility: f, upgrade: o.upgrade });
    ctx.events.push({ type: 'upgrade_done', facility: f, upgrade: o.upgrade, order: o.id });
  }
  if (f && o.remodel) {
    const until = s.t + remodelMinutes(o);
    s.remodels[f] = { variant: o.remodel, until };
    entry.effects.push({ kind: 'remodel', facility: f, variant: o.remodel, until });
    ctx.events.push({ type: 'remodel_started', facility: f, variant: o.remodel, until });
  }
  // 牌匾（LG-14）：一处设施第一次修好，大门的牌匾自动记一行——谁带队（做得最多的人）、第几天
  // 带队和一起干的人按这处设施第一次修好之前所有工单上的工作量算（s.repairs：挖沙、铺场这样分几张工单修的，
  // 中途停工、换人接着干的，都一起记）；没有累计的旧存档退回这张工单的 by
  if (f && !wasRestored && isRestored(s, w, f) && !s.plaque.some((r) => r.facility === f)) {
    const credit = s.repairs?.[f];
    const by = credit?.by ?? st?.by ?? {};
    const people = [...new Set([...Object.keys(by), ...crew])].sort(
      (a, b) => (by[b] ?? 0) - (by[a] ?? 0) || a.localeCompare(b),
    );
    const leader = people[0] ?? lead.id;
    if (leader) {
      const row: PlaqueRow = {
        facility: f,
        ...(s.variants[f] ? { variant: s.variants[f] } : {}),
        leader,
        crew: people,
        day: dayOf(s.t),
        minutes: credit?.mins ?? st?.mins ?? 0,
        work: (credit?.work ?? 0) + orderWork(s, o, variant),
        order: o.id,
      };
      s.plaque.push(row);
      entry.effects.push({ kind: 'plaque', facility: f, leader });
      ctx.events.push({ type: 'plaque_added', ...row });
    }
  }
  if (f && s.repairs?.[f]) {
    // 记过牌匾了，累计用完；还没修好（中间那一步，例如挖完沙）就把这张工单的名义工作量记上，接着累计
    if (s.plaque.some((r) => r.facility === f)) delete s.repairs[f];
    else s.repairs[f].work += orderWork(s, o, variant);
  }
  s.orderLog.done[o.id] = (s.orderLog.done[o.id] ?? 0) + 1;
  if (o.cooldown && !w.tournamentOf.has(o.id)) s.orderLog.cooldowns[o.id] = s.t + minutes(o.cooldown);
  // 分期筹备（W2）：一期做完，画面把这一期立起来
  if (o.prep) {
    const total = w.prep.get(o.prep)?.length ?? 1;
    ctx.events.push({
      type: 'prep_done',
      group: o.prep,
      order: o.id,
      done: Math.round(prepProgress(s, w, o.prep) * total),
      total,
    });
  }
  for (const id of crew) {
    const p = s.people[id];
    if (p) p.job = null;
    grow(ctx, id, o.skill);
  }
  ctx.events.push({ type: 'orderFinished', order: o.id, people: crew, ...(success === undefined ? {} : { success }) });
  // 赛事（LG-11）：主办赛事的报名做完 = 接下这一期；外出赛事做完当场结算
  if (w.tournamentOf.has(o.id)) tournamentOrderDone(ctx, o, lead, crew);
  // 人-13：做完回到派去之前的岗位（还开着、空着的话），不然闲着
  for (const id of crew) backToPost(ctx, id, o.id);
  // 地块（W5）：最后一张清理工单做完就开地
  const plot = w.plotOrders.get(o.id);
  if (plot) checkPlotOpen(ctx, plot.plot);
}

/**
 * 人-13（W2）：工单做完或作废，这个人回到派去之前的岗位——它此刻存在、在时段里（或者是"随时"的岗位）、没人坐。
 * 回不去就闲着（之后照习惯走）。
 */
function backToPost(ctx: Ctx, id: string, order: string): void {
  const { s, w } = ctx;
  const p = s.people[id];
  if (!p) return;
  p.job = null;
  const back = p.back ? w.posts.get(p.back) : undefined;
  p.back = null;
  if (!back || !postExists(s, w, back) || (back.hours && !postInHours(s, back))) return;
  const who = occupant(s, back.id);
  if (who && who !== id) return;
  if (assign(ctx, id, back.id)) ctx.events.push({ type: 'returned', person: id, post: back.id, order });
}

/**
 * 每分钟（W2）：坐在已经不存在的岗位上的人放下来闲着，发 released 说明为什么（设施掉档、改造停用、赛事收了或占了场）。
 * 这一圈直接作废（岗位没了，不算"被拉走"）。之后照习惯走（岗位回来了，习惯会带他回去）。
 */
function releaseSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const id in s.people) {
    const p = s.people[id] as PersonState;
    if (!p.hired || !p.job) continue;
    const post = w.posts.get(p.job);
    if (!post || postExists(s, w, post)) continue;
    const f = w.facilityAt.get(post.at) ?? null;
    const reason = f && remodeling(s, f) ? 'remodel' : eventPostOpen(s, w, post.id) === false ? 'event' : 'closed';
    delete s.posts[post.id];
    if (p.pin === post.id) p.pin = null;
    leaveJob(ctx, id);
    ctx.events.push({ type: 'released', person: id, post: post.id, facility: f, reason });
  }
}

function orderSystem(ctx: Ctx, jobs: Map<string, string[]>): void {
  const { s, w } = ctx;
  for (const o of w.orders.values()) {
    const crew = jobs.get(o.id) ?? [];
    const st = s.orders[o.id];
    // 没人在干、也没开工的工单不用管（标记出不出现是界面的事）
    if (!crew.length && !st) continue;
    // 条件没了（例如卡里已经把屋顶修好了）：标记消失，人闲下来，进度作废
    if (!orderVisible(s, w, o)) {
      if (st || crew.length) {
        delete s.orders[o.id];
        for (const id of crew) backToPost(ctx, id, o.id);
        // 锁定了变体却没修成（设施还是开局的样子）：变体也作废
        const f = orderFacility(w, o);
        if (st?.variant && f && s.facilities[f] === w.act.facilities[f]) delete s.variants[f];
        if (st) ctx.events.push({ type: 'orderCancelled', order: o.id });
      }
      continue;
    }
    const here = crew.filter((id) => working(s, w, id));
    if (!here.length) continue;
    // 人不够（W2 的 min_crew，例如双打要两名球员）：等着，不开工、不走进度
    if (o.min_crew !== undefined && here.length < minCrew(s, w, o)) continue;
    // 工地停工（W5：接下的主办赛事的比赛日）：人在那儿等着，不开工、不走进度
    if (plotOrderPaused(s, w, o.id)) continue;
    const f = orderFacility(w, o);
    let state = st;
    if (!state) {
      // 第一个人到场：扣材料费开工；钱不够就开不了，人闲下来。变体工单在这一刻锁定变体（LG-14）
      const variant = orderVariant(s, o, w);
      const cost = orderCost(s, o, variant, w);
      if (cost > 0 && cost > (s.stats.cash ?? 0)) {
        for (const id of crew) backToPost(ctx, id, o.id);
        continue;
      }
      if (cost) setStat(ctx, 'cash', (s.stats.cash ?? 0) - cost);
      state = s.orders[o.id] = { progress: 0, started: true, by: {}, mins: 0 };
      if (variant && f) {
        state.variant = variant;
        delete s.picks[o.id];
        s.variants[f] = variant;
        ctx.events.push({ type: 'variant_locked', facility: f, variant, order: o.id });
      }
      ctx.events.push({ type: 'orderStarted', order: o.id, at: o.at, performance: o.performance ?? null });
    }
    // 这处设施还没上过牌匾：工作量也记到设施上（跨工单、跨停工累计，牌匾按它定带队）
    const credit =
      f && !s.plaque.some((r) => r.facility === f)
        ? ((s.repairs ??= {})[f] ??= { by: {}, mins: 0, work: 0 })
        : undefined;
    for (const id of here) {
      const v = speedOf(workSkill(s, w, id, o.skill));
      state.progress += v;
      const by = (state.by ??= {});
      by[id] = (by[id] ?? 0) + v;
      if (credit) credit.by[id] = (credit.by[id] ?? 0) + v;
    }
    state.mins = (state.mins ?? 0) + 1;
    if (credit) credit.mins += 1;
    if (state.progress >= orderWork(s, o)) finishOrder(ctx, o);
  }
}

/** 事件派去办的事：待满了就办完，人原地闲着 */
function errandSystem(ctx: Ctx): void {
  const { s } = ctx;
  for (const id in s.people) {
    const p = s.people[id] as PersonState;
    if (!p.errand || p.walk || p.errand.until === null || p.errand.until > s.t) continue;
    p.errand = null;
    ctx.events.push({ type: 'errandFinished', person: id });
  }
}

/** 每个营业分钟：在职的人手上没活（没岗位没工单、没在走路、没在办事）就记一分钟"闲着"，有活就清零 */
function idleSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const id of staffIds(s, w)) {
    const p = s.people[id] as PersonState;
    if (!p.job && !p.walk && !p.errand) p.idleMin = (p.idleMin ?? 0) + 1;
    else if (p.idleMin) p.idleMin = 0;
  }
}

/** 改造期满（LG-14）：换成新变体；只给旧变体的升级拆掉；写一条因果日志 */
function remodelSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const [f, r] of Object.entries(s.remodels)) {
    if (r.until > s.t) continue;
    delete s.remodels[f];
    s.variants[f] = r.variant;
    const ups = w.facilities.get(f)?.upgrades ?? {};
    if (s.upgrades[f]) s.upgrades[f] = s.upgrades[f].filter((u) => !ups[u]?.variant || ups[u]?.variant === r.variant);
    const entry = run(ctx, { kind: 'remodel', facility: f, variant: r.variant }, null, []);
    entry.effects.push({ kind: 'variant', facility: f, variant: r.variant });
    ctx.events.push({ type: 'remodel_done', facility: f, variant: r.variant });
  }
}

export function staffSystem(ctx: Ctx): void {
  remodelSystem(ctx);
  releaseSystem(ctx);
  errandSystem(ctx);
  routineSystem(ctx);
  idleSystem(ctx);
  const jobs = jobIndex(ctx.s);
  postSystem(ctx, jobs);
  orderSystem(ctx, jobs);
}

/* ---------------- 收盘：衰减、今天的岗位账、夜里 ---------------- */

/**
 * 今天有人守着的设施（准则 6"有人守的地方维持住"）：今天有人在它的任何一个岗位上干完过至少一圈
 * （今天的岗位账 s.ledger，收盘写日志之前读）。
 */
export function staffedToday(s: GameState, w: World): Set<string> {
  const out = new Set<string>();
  for (const [post, e] of Object.entries(s.ledger)) {
    const f = e.cycles > 0 ? w.facilityAt.get(w.posts.get(post)?.at ?? '') : undefined;
    if (f) out.add(f);
  }
  return out;
}

/**
 * 这处设施今晚收盘掉多少状况：decay_day × 季节倍数，今天有人守着再乘 rules.staffed_decay（默认 0.5）；
 * 改造停用期间不掉。staffed 不给就按今天的岗位账算（界面预告"明天会不会掉档"也用它）。
 */
export function dayDecay(s: GameState, w: World, id: string, seasonDecay: number, staffed?: Set<string>): number {
  if (remodeling(s, id)) return 0;
  const d = stateDef(s, w, id)?.decay_day ?? 0;
  if (!d) return 0;
  const on = (staffed ?? staffedToday(s, w)).has(id);
  return d * seasonDecay * (on ? w.act.rules.staffed_decay : 1);
}

/** 设施按天衰减（准则 6：没人管的地方慢慢变旧、有人守的掉得慢；季节倍数：初秋落叶多）。要在 closeLedger 之前调 */
export function decayDay(ctx: Ctx, seasonDecay: number): void {
  const { s, w } = ctx;
  const staffed = staffedToday(s, w);
  for (const id of Object.keys(s.facilities)) {
    const d = dayDecay(s, w, id, seasonDecay, staffed);
    if (!d) continue;
    s.condition[id] = clamp((s.condition[id] ?? 100) - d, 0, 100);
  }
}

/**
 * 周日收盘：掉档（准则 6"先出画面信号，再掉档"）。状况低于 grade_drop_below、当前状态写了 drops_to 的设施掉一档，
 * 一周最多掉一档。掉到的状态（停用）没有场地、岗位不开，要做重开工单才回来。
 * 放在会员和声望结算之后：掉档这一周先少了岗位收入，下一个周日才按少了的场地数结算会员。
 */
export function gradeDrop(ctx: Ctx): void {
  const { s, w } = ctx;
  const limit = w.act.rules.grade_drop_below;
  if (!limit) return;
  for (const [id, state] of Object.entries(s.facilities)) {
    const to = remodeling(s, id) ? undefined : stateDef(s, w, id)?.drops_to;
    const c = s.condition[id] ?? 100;
    if (!to || c >= limit) continue;
    run(ctx, { kind: 'wear', facility: id, condition: Math.round(c) }, null, [{ facility: id, set: to }]);
    ctx.events.push({ type: 'facilityWorn', facility: id, from: state, to, condition: c });
  }
}

/** 今天每个岗位的账合成一条因果日志："因为 Dale 在 1 号场上课 3 圈，所以 +$51" */
export function closeLedger(ctx: Ctx): void {
  const { s } = ctx;
  for (const [post, e] of Object.entries(s.ledger).sort(([a], [b]) => a.localeCompare(b))) {
    const entry = run(ctx, { kind: 'post', post, person: e.person, cycles: e.cycles }, null, []);
    entry.effects.push(...e.effects);
  }
  s.ledger = {};
}

/** 夜里：走到一半的直接到，事情办完，岗位的这一圈作废；人留在原地，明早接着干 */
export function overnight(ctx: Ctx): void {
  const { s } = ctx;
  for (const [id, p] of Object.entries(s.people)) {
    if (p.walk) {
      p.at = p.walk.to;
      p.walk = null;
      ctx.events.push({ type: 'personArrived', person: id, at: p.at });
    }
    if (p.errand) p.errand = null;
  }
  s.posts = {};
}

/* ---------------- 分期筹备（W2） ---------------- */

export interface PrepStatus {
  group: string;
  /** 每一期：哪张工单、做完没有、材料费 */
  phases: { order: string; done: boolean; cost: number }[];
  done: number;
  total: number;
  /** 还没做的几期加起来的材料费（地点牌上的"总价"） */
  costLeft: number;
}

/** 一组分期筹备（例如表演赛四期）的进度：地点牌从 ★3 起挂出四期和总价 */
export function prepStatus(s: GameState, w: World, group: string): PrepStatus {
  const phases = (w.prep.get(group) ?? []).flatMap((id) => {
    const o = w.orders.get(id);
    return o ? [{ order: id, done: (s.orderLog.done[id] ?? 0) > 0, cost: orderCost(s, o, undefined, w) }] : [];
  });
  return {
    group,
    phases,
    done: phases.filter((x) => x.done).length,
    total: phases.length,
    costLeft: phases.filter((x) => !x.done).reduce((a, x) => a + x.cost, 0),
  };
}
