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
      if (post?.hours) s.week.served = Math.max(0, s.week.served - st.progress);
      ctx.events.push({ type: 'postInterrupted', post: job, person: id, lost: st.progress });
    }
    delete s.posts[job];
  }
}

const edge = (w: World, a: string, b: string): number => w.nav.get(a)?.find(([n]) => n === b)?.[1] ?? 1;

/** 走在路上的人下一个会到的锚点、什么时候到，以及到那儿为止走过的锚点 */
function nextStop(w: World, walk: Walk, t: number): { at: string; time: number; walked: string[] } {
  let time = walk.start;
  let prev = walk.from;
  const walked: string[] = [];
  for (const n of walk.route) {
    time += edge(w, prev, n);
    walked.push(n);
    if (time >= t) return { at: n, time, walked };
    prev = n;
  }
  return { at: walk.to, time: walk.end, walked };
}

/**
 * 让一个人走到 to。走在路上的人先走到下一个锚点再改道（路线接在已经走过的那段后面，画面不跳）。
 * 返回还要走多少分钟；已经在那儿返回 0；走不到返回 null。
 */
export function walkTo(ctx: WalkCtx, id: string, to: string): number | null {
  const { s, w } = ctx;
  const p = s.people[id];
  if (!p) return null;
  const ns = p.walk ? nextStop(w, p.walk, s.t) : { at: p.at, time: s.t, walked: [] as string[] };
  const r = shortestRoute(w, ns.at, to);
  if (!r) return null;
  if (!p.walk && !r.route.length) return 0;
  p.walk = {
    from: p.walk?.from ?? p.at,
    to,
    route: [...ns.walked, ...r.route],
    start: p.walk?.start ?? s.t,
    end: ns.time + r.minutes,
  };
  ctx.events.push({
    type: 'personDeparted',
    person: id,
    from: p.walk.from,
    to,
    route: p.walk.route,
    arrive: p.walk.end,
  });
  return p.walk.end - s.t;
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
