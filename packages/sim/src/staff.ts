import { minutes, type Order, type Post, type SkillKind } from '@td/content';
import { clamp } from '@td/shared';
import { applyEffects, type Ctx, run, setStat } from './effects';
import { rand } from './rng';
import { DIRECTOR, type EffectRecord, type GameState, minuteOfDay, type PersonState, weekdayOf } from './state';
import { isStaff, num, test } from './vars';
import { leaveJob, walkTo } from './walk';
import type { World } from './world';

/**
 * 招人和排人（ADR 0012）：玩家把人拖到岗位或工单上。
 *
 * - 持续岗位：有人坐着、在它的时段里、条件满足时一圈一圈地转，每圈结算一次效果。有时段的岗位是"需求"，
 *   时段里每分钟都计入本周服务率的分母，有人在岗才计入分子。被拉走：这一圈作废，已算的服务分钟退回去。
 * - 一次性工单：拖人上去开工（第一个人到场时扣材料费），可以多人一起；被拉走进度保留；做满就结算。
 * - 设施状况：收盘时按 decay_day × 季节倍数衰减；岗位每圈的 wear 额外磨损；维护岗位和工单修复。
 */

/** 人在某项能力上的值 */
export const skillOf = (p: PersonState, k: SkillKind): number => (k === 'teach' ? p.skill : p[k]);

/** 能力换算成速度：能力 50 的人是 1 倍 */
export const speedOf = (skill: number): number => 0.5 + skill / 100;

const hourNow = (s: GameState): number => minuteOfDay(s.t) / 60;

/** 岗位现在存不存在（条件满足） */
export const postExists = (s: GameState, w: World, p: Post): boolean => test(s, w, p.when);

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

export type OrderBlock = 'cooldown' | 'done' | 'cost' | 'crew' | null;

export function orderVisible(s: GameState, w: World, o: Order): boolean {
  if (o.once && (s.orderLog.done[o.id] ?? 0) > 0) return false;
  if ((s.orderLog.cooldowns[o.id] ?? -1) > s.t) return false;
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
}

function checkChance(s: GameState, w: World, o: Order): number | null {
  if (!o.check) return null;
  if ('stat' in o.check) return clamp(0.5 + ((s.stats[o.check.stat] ?? 0) - o.check.vs) / 50, 0.05, 0.95);
  const saved = s.rng;
  const v = clamp(num(s, w, o.check.chance), 0, 1);
  s.rng = saved;
  return v;
}

export function orderStatus(s: GameState, w: World, o: Order): OrderStatus {
  const st = s.orders[o.id];
  const crew = crewOf(s, o.id);
  const work = minutes(o.work);
  const visible = orderVisible(s, w, o);
  const blocked: OrderBlock = !visible
    ? (s.orderLog.cooldowns[o.id] ?? -1) > s.t
      ? 'cooldown'
      : 'done'
    : !st?.started && o.cost > (s.stats.cash ?? 0)
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
    cost: o.cost,
    started: !!st?.started,
    progress: (st?.progress ?? 0) / work,
    work,
    chance: checkChance(s, w, o),
  };
}

/** 能指派的人 */
export const staffIds = (s: GameState, w: World): string[] => Object.keys(s.people).filter((id) => isStaff(s, w, id));

/* ---------------- 命令：指派 ---------------- */

export type AssignBlock = 'person' | 'busy' | 'target' | 'gone' | 'cost' | 'crew' | 'same' | null;

/** 能不能把 person 派到 target（null 表示叫他停下来） */
export function canAssign(s: GameState, w: World, person: string, target: string | null): AssignBlock {
  const p = s.people[person];
  if (!p || !isStaff(s, w, person)) return 'person';
  // 事件派去办的事还没办完，叫不回来（选项的代价就是总监的这段时间）
  if (p.errand) return 'busy';
  if (target === null) return p.job ? null : 'same';
  if (p.job === target) return 'same';
  const post = w.posts.get(target);
  if (post) return postExists(s, w, post) ? null : 'gone';
  const order = w.orders.get(target);
  if (!order) return 'target';
  const st = orderStatus(s, w, order);
  if (!st.visible) return 'gone';
  if (st.blocked === 'cost') return 'cost';
  if (st.crew.length >= order.crew) return 'crew';
  return null;
}

/**
 * 把一个人派到岗位或工单上：放下手上的事（持续岗位这一圈作废），走过去，到了就开始干。
 * 拖到有人的岗位上：原来的人让出来、原地闲着（这一圈同样作废）。
 */
export function assign(ctx: Ctx, person: string, target: string | null, learn = false): boolean {
  const { s, w } = ctx;
  if (canAssign(s, w, person, target) !== null) return false;
  // 玩家亲手派的才记进习惯；叫停就把手上那个岗位从习惯里拿掉
  if (learn) learnRoutine(s, w, person, target);
  leaveJob(ctx, person);
  const p = s.people[person] as PersonState;
  if (target === null) {
    ctx.events.push({ type: 'assigned', person, target: null });
    return true;
  }
  const post = w.posts.get(target);
  if (post) {
    const prev = occupant(s, target);
    if (prev) {
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
  for (const q of Object.values(s.people)) if (q.routine) q.routine = q.routine.filter((x) => x !== target);
  p.routine = [
    target,
    ...p.routine.filter((x) => {
      const o = w.posts.get(x);
      return o && !overlaps(o, post);
    }),
  ].slice(0, ROUTINE_MAX);
}

/** 班开始后这么多分钟内，在做工单的人会放下工单去上班（工单进度留着，下了班回来接着干） */
const ROUTINE_SHIFT_START = 30;

/**
 * 现在这个人按习惯该去哪儿（null = 留在原地）：
 * 1. 在开着的班上：不动。
 * 2. 有个记住的班此刻开着、空着、离结束还有 45 分钟以上 → 去上班。在做工单的人只在班刚开始时去（记下工单，下班回来）。
 * 3. 手上没活（工单做完、班关了、闲着）：回到为上班暂停的工单；再不然去记住的"随时"岗位（维护）。
 */
export function routineTarget(s: GameState, w: World, id: string): string | null {
  const p = s.people[id];
  if (!p?.hired || p.errand || p.walk) return null;
  const cur = p.job ? w.posts.get(p.job) : undefined;
  const onOrder = !!p.job && !cur;
  const open = (x: Post) => postInHours(s, x) && postExists(s, w, x);
  if (cur?.hours && open(cur)) return null;
  const free = (x: Post) => {
    const who = occupant(s, x.id);
    return who === null || who === id;
  };
  const now = minuteOfDay(s.t);
  const left = (x: Post) => (x.hours ? x.hours[1] * 60 - now : Number.POSITIVE_INFINITY);
  for (const x of p.routine ?? []) {
    const post = w.posts.get(x);
    if (!post?.hours || post.id === p.job || !open(post) || !free(post) || left(post) < ROUTINE_MIN_LEFT) continue;
    if (onOrder && now - post.hours[0] * 60 >= ROUTINE_SHIFT_START) continue;
    return post.id;
  }
  if (onOrder) return null;
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
    const t = routineTarget(s, w, id);
    if (!t) continue;
    const p = s.people[id] as PersonState;
    const job = p.job;
    if (job && w.orders.has(job)) p.resume = job;
    else if (job && w.posts.has(job)) delete s.posts[job];
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

/** 总监干完一圈或一张工单，那项能力涨一点（有上限）：总监没有情绪，能力随游戏慢慢成长 */
function grow(ctx: Ctx, person: string, k: SkillKind): void {
  const { s, w } = ctx;
  if (person !== DIRECTOR) return;
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
}

function finishCycle(ctx: Ctx, post: Post, person: string): void {
  const { s } = ctx;
  const p = s.people[person] as PersonState;
  const skill = skillOf(p, post.skill);
  const entry = (s.ledger[post.id] ??= { person, cycles: 0, effects: [] });
  entry.person = person;
  entry.cycles += 1;
  const out: EffectRecord[] = [];
  applyEffects({ ...ctx, vars: { 'worker.skill': skill } }, post.effects, -1, out);
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
  delete s.orders[o.id];
  let success: boolean | undefined;
  if (o.check) success = rand(s) < (checkChance(s, w, o) ?? 1);
  const effects = [...o.effects, ...(success === undefined ? [] : success ? o.onSuccess : o.onFail)];
  const entry = run(
    ctx,
    { kind: 'order', order: o.id, people: crew, ...(success === undefined ? {} : { success }) },
    null,
    effects,
  );
  if (o.restore) condAdd(ctx, o.at, o.restore, entry.effects);
  s.orderLog.done[o.id] = (s.orderLog.done[o.id] ?? 0) + 1;
  if (o.cooldown) s.orderLog.cooldowns[o.id] = s.t + minutes(o.cooldown);
  for (const id of crew) {
    const p = s.people[id];
    if (p) p.job = null;
    grow(ctx, id, o.skill);
  }
  ctx.events.push({ type: 'orderFinished', order: o.id, people: crew, ...(success === undefined ? {} : { success }) });
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
        for (const id of crew) {
          const p = s.people[id];
          if (p) p.job = null;
        }
        if (st) ctx.events.push({ type: 'orderCancelled', order: o.id });
      }
      continue;
    }
    const here = crew.filter((id) => working(s, w, id));
    if (!here.length) continue;
    let state = st;
    if (!state) {
      // 第一个人到场：扣材料费开工；钱不够就开不了，人闲下来
      if (o.cost > (s.stats.cash ?? 0)) {
        for (const id of crew) {
          const p = s.people[id];
          if (p) p.job = null;
        }
        continue;
      }
      if (o.cost) setStat(ctx, 'cash', (s.stats.cash ?? 0) - o.cost);
      state = s.orders[o.id] = { progress: 0, started: true };
      ctx.events.push({ type: 'orderStarted', order: o.id, at: o.at, performance: o.performance ?? null });
    }
    for (const id of here) state.progress += speedOf(skillOf(s.people[id] as PersonState, o.skill));
    if (state.progress >= minutes(o.work)) finishOrder(ctx, o);
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

export function staffSystem(ctx: Ctx): void {
  errandSystem(ctx);
  routineSystem(ctx);
  const jobs = jobIndex(ctx.s);
  postSystem(ctx, jobs);
  orderSystem(ctx, jobs);
}

/* ---------------- 收盘：衰减、今天的岗位账、夜里 ---------------- */

/** 设施按天衰减（准则 6：没人管的地方慢慢变旧；季节倍数：初秋落叶多） */
export function decayDay(ctx: Ctx, seasonDecay: number): void {
  const { s, w } = ctx;
  for (const [id, state] of Object.entries(s.facilities)) {
    const d = w.facilities.get(id)?.states[state]?.decay_day ?? 0;
    if (!d) continue;
    s.condition[id] = clamp((s.condition[id] ?? 100) - d * seasonDecay, 0, 100);
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
