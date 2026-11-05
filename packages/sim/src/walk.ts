import type { SimEvent } from './events';
import type { GameState, Walk } from './state';
import type { World } from './world';

/**
 * 人怎么走（ADR 0012）：按导航图走最短路，固定速度（不再有精力）。重派一个人就要走过去，这是拖动的主要代价。
 * 这个模块只依赖状态和内容索引，效果（effects.ts）和指派系统（staff.ts）都用它。
 */

export interface WalkCtx {
  readonly s: GameState;
  readonly w: World;
  readonly events: SimEvent[];
}

const routes = new WeakMap<World, Map<string, { route: string[]; minutes: number } | null>>();

/** 导航图上的最短路（分钟）。返回经过的锚点（不含起点）。同一份内容只算一次。 */
export function shortestRoute(w: World, from: string, to: string): { route: string[]; minutes: number } | null {
  let m = routes.get(w);
  if (!m) routes.set(w, (m = new Map()));
  const key = `${from}>${to}`;
  if (!m.has(key)) m.set(key, computeRoute(w, from, to));
  const r = m.get(key) ?? null;
  return r && { route: [...r.route], minutes: r.minutes };
}

function computeRoute(w: World, from: string, to: string): { route: string[]; minutes: number } | null {
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
    // 地块的锚点（W5）只当终点、不当中转站：新地不改旧地点之间的路（导航只加不挪）
    if (cur !== from && w.plotAt.has(cur)) continue;
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

/**
 * 从手上的事情抽身：持续岗位这一圈作废，这一圈已经算作"有人服务"的分钟退回成"没人服务"。
 * 工单的进度留着。
 */
export function leaveJob(ctx: WalkCtx, id: string): void {
  const { s, w } = ctx;
  const p = s.people[id];
  if (!p?.job) return;
  const job = p.job;
  p.job = null;
  if (w.posts.has(job)) {
    const st = s.posts[job];
    if (st && st.progress > 0) {
      const post = w.posts.get(job);
      // 有需求的岗位：这一圈已经计入的服务分钟退回去
      // （场地可用度：勉强能打时一分钟只算了 meh_service，退回的是实际记上的 credit）
      if (post?.hours) {
        s.week.served = Math.max(0, s.week.served - (st.credit ?? st.progress));
        s.week.missed[job] = (s.week.missed[job] ?? 0) + st.progress;
      }
      ctx.events.push({ type: 'postInterrupted', post: job, person: id, lost: st.progress });
    }
    delete s.posts[job];
  }
}

const edge = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

/** 走在路上的人此刻在哪一段路上：a → b，这一段走了 e 分钟、一共 m 分钟（画面 walkpath.ts 的 locate 同样按 start 和每段分钟数算） */
function onEdge(w: World, walk: Walk, t: number): { a: string; b: string; e: number; m: number } {
  let t0 = walk.start;
  let prev = walk.from;
  for (const n of walk.route) {
    const m = edge(w, prev, n);
    if (t0 + m >= t) return { a: prev, b: n, e: Math.max(0, t - t0), m };
    prev = n;
    t0 += m;
  }
  return { a: walk.to, b: walk.to, e: 0, m: 0 };
}

/**
 * 从此刻的位置走到 to 的新路线（不改状态）。走在一段路中间的人可以接着往前走到这一段的终点，也可以掉头回到起点，
 * 哪头近走哪头（一样近就接着往前）。新路线从这一段的某一头开始，出发时间往前推，让此刻正好在原来那一点上：
 * 往前走 = 这一段的起点 a、开始走这一段的时刻；掉头 = 从这一段的终点 b 出发、往 a 走（导航边两头分钟数一样）。
 * 返回 null = 走不到；walk 为 null = 此刻就站在 to（在节点上）。
 */
function plan(w: World, s: GameState, id: string, to: string): { walk: Walk | null; at: string } | null {
  const p = s.people[id];
  if (!p) return null;
  if (!p.walk) {
    const r = shortestRoute(w, p.at, to);
    if (!r) return null;
    if (!r.route.length) return { walk: null, at: p.at };
    return { walk: { from: p.at, to, route: r.route, start: s.t, end: s.t + r.minutes }, at: p.at };
  }
  const { a, b, e, m } = onEdge(w, p.walk, s.t);
  const fwd = shortestRoute(w, b, to);
  const back = shortestRoute(w, a, to);
  const fwdCost = fwd ? m - e + fwd.minutes : Number.POSITIVE_INFINITY;
  const backCost = back ? e + back.minutes : Number.POSITIVE_INFINITY;
  if (!fwd && !back) return null;
  if (fwdCost <= backCost && fwd) {
    if (a === b)
      return fwd.route.length
        ? { walk: { from: a, to, route: fwd.route, start: s.t, end: s.t + fwd.minutes }, at: a }
        : { walk: null, at: a };
    return { walk: { from: a, to, route: [b, ...fwd.route], start: s.t - e, end: s.t + fwdCost }, at: a };
  }
  if (!back) return null;
  // 在这一段的起点上（刚出发）：就当站在 a
  if (e === 0) {
    if (!back.route.length) return { walk: null, at: a };
    return { walk: { from: a, to, route: back.route, start: s.t, end: s.t + back.minutes }, at: a };
  }
  return { walk: { from: b, to, route: [a, ...back.route], start: s.t - (m - e), end: s.t + backCost }, at: a };
}

/** 某人走到 to 还要几分钟（和 walkTo 真走的一样：走在半路的人哪头近从哪头改道）；走不到返回 null */
export function walkEta(s: GameState, w: World, id: string, to: string): number | null {
  const r = plan(w, s, id, to);
  if (!r) return null;
  return r.walk ? r.walk.end - s.t : 0;
}

/**
 * 让一个人走到 to。走在路上的人当场改道：从这一段路上此刻的位置，往前或掉头，哪头近走哪头（不再先走完整段）。
 * 返回还要走多少分钟；已经在那儿返回 0；走不到返回 null。
 */
export function walkTo(ctx: WalkCtx, id: string, to: string): number | null {
  const { s, w } = ctx;
  const p = s.people[id];
  if (!p) return null;
  const r = plan(w, s, id, to);
  if (!r) return null;
  const wasWalking = !!p.walk;
  p.at = r.at;
  p.walk = r.walk;
  if (!r.walk) {
    if (wasWalking) ctx.events.push({ type: 'personArrived', person: id, at: p.at });
    return 0;
  }
  ctx.events.push({
    type: 'personDeparted',
    person: id,
    from: r.walk.from,
    to,
    route: r.walk.route,
    arrive: r.walk.end,
  });
  return r.walk.end - s.t;
}

/**
 * 叫停走在路上的人：走到脚下这一段路较近的那一头站住（一样近就往前），不再去原来的地方。
 * 模拟里人只能站在锚点上，所以不是"原地站住"；最多走半段路。不在路上什么也不做。
 */
export function haltWalk(ctx: WalkCtx, id: string): void {
  const { s, w } = ctx;
  const p = s.people[id];
  if (!p?.walk) return;
  const { a, b, e, m } = onEdge(w, p.walk, s.t);
  walkTo(ctx, id, e < m - e ? a : b);
}

/** 这一分钟走到了没有：到了就站在终点 */
export function walkSystem(ctx: WalkCtx): void {
  const { s } = ctx;
  for (const id in s.people) {
    const p = s.people[id];
    if (!p?.walk || p.walk.end > s.t) continue;
    p.at = p.walk.to;
    p.walk = null;
    ctx.events.push({ type: 'personArrived', person: id, at: p.at });
    if (p.errand && p.errand.at === p.at && p.errand.until === null) p.errand.until = s.t + p.errand.minutes;
  }
}

/** 把一个人派去办事（事件选项或效果）：放下手上的岗位，走到 at，待 minutes 分钟。 */
export function sendErrand(ctx: WalkCtx, id: string, at: string, minutes: number): boolean {
  const { s } = ctx;
  const p = s.people[id];
  if (!p?.hired) return false;
  leaveJob(ctx, id);
  if (walkTo(ctx, id, at) === null) return false;
  p.errand = { at, minutes, until: p.walk ? null : s.t + minutes };
  ctx.events.push({ type: 'errandStarted', person: id, at, minutes });
  return true;
}
