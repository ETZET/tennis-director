import { minutes, type PlotPhase } from '@td/content';
import { dayOf, type GameState } from './state';
import type { World } from './world';

/**
 * 地块（W5，LG-15，ADR 0021）：地图跟着选路长出去。这里只放只读的查询（开工、开地在 effects.ts）。
 *
 * - 地块 locked → building（选路，或者效果 { plot, build }；清理工单一起冒出来）→ open（清理工单都做完）。
 * - 新锚点一直在内容的 anchors 和 nav 里（导航只加不挪）。地块的锚点只当终点、不当中转站（walk.ts），
 *   所以旧地点之间的路一条也不变。
 * - 地块的锚点上：施工时只有它的清理工单；开了以后才有那里的岗位和别的工单。opens 里列的岗位和工单
 *   （放在哪儿都行）也要这块地按那个变体开了才有。
 */

/** 地块现在的阶段（没开工是 locked） */
export const plotPhase = (s: GameState, plot: string): PlotPhase => s.plots?.[plot]?.state ?? 'locked';

/**
 * 这个地点现在在不在地图上（界面画不画地点牌、能不能往那儿拖人）：不在地块上的地点一直在；
 * 地块上的地点在这块地按它的变体开工（施工中，只有清理工单）或者开了以后在。
 */
export function placeAvailable(s: GameState, w: World, anchor: string): boolean {
  const ref = w.plotAt.get(anchor);
  if (!ref) return true;
  const st = s.plots?.[ref.plot];
  return !!st && ref.variants.includes(st.variant);
}

/** 这个地点开了没有（地块上的岗位要开了才有）；不在地块上的地点一直算开着 */
export function placeOpen(s: GameState, w: World, anchor: string): boolean {
  const ref = w.plotAt.get(anchor);
  if (!ref) return true;
  const st = s.plots?.[ref.plot];
  return st?.state === 'open' && ref.variants.includes(st.variant);
}

/**
 * 地块对一个岗位或工单的限制（没写地块的地图一律 true）：
 * 清理工单只在这块地按它的变体施工时有；opens 里的岗位和工单、放在地块锚点上的岗位和工单要开了才有。
 */
export function plotAllows(s: GameState, w: World, target: string, at: string): boolean {
  if (!w.plots.size) return true;
  const clear = w.plotOrders.get(target);
  if (clear) {
    const st = s.plots?.[clear.plot];
    return st?.state === 'building' && st.variant === clear.variant;
  }
  const op = w.plotOpens.get(target);
  if (op) {
    const st = s.plots?.[op.plot];
    if (st?.state !== 'open' || st.variant !== op.variant) return false;
  }
  return placeOpen(s, w, at);
}

/** 今天是不是接下的主办赛事的比赛日（和 tournaments.ts 的 eventDay 同一个判断；这里不引它，免得循环引用） */
function eventDayToday(s: GameState, w: World): boolean {
  const day = dayOf(s.t);
  for (const [id, run] of Object.entries(s.events ?? {})) {
    if (s.t >= run.end) continue;
    const e = (w.editions.get(id) ?? []).find((x) => s.t < x.end);
    if (e?.days.includes(day)) return true;
  }
  return false;
}

/** 工地停工：地块写了 pause_on_events（默认），今天又是接下的主办赛事的比赛日 */
export function plotPaused(s: GameState, w: World, plot: string): boolean {
  const p = w.plots.get(plot);
  return !!p?.pause_on_events && plotPhase(s, plot) === 'building' && eventDayToday(s, w);
}

/** 清理工单此刻停不停工 */
export function plotOrderPaused(s: GameState, w: World, order: string): boolean {
  const ref = w.plotOrders.get(order);
  return !!ref && plotPaused(s, w, ref.plot);
}

export interface PlotStatus {
  id: string;
  /** 哪一处选路决定它、第几季开 */
  route: string;
  season: 1 | 2;
  state: PlotPhase;
  /** 开工以后才有：按哪个变体、新锚点 */
  variant: string | null;
  anchor: string | null;
  /** 这个变体的清理工单：做完没有、做了多少（0..1） */
  orders: { id: string; done: boolean; progress: number }[];
  done: number;
  total: number;
  /** 按工作量算的总进度 0..1（画面 land(plot, state, variant, progress)） */
  progress: number;
  paused: boolean;
  since: number | null;
  opened: number | null;
}

/** 给界面和画面：每块地的状态（按内容里的顺序） */
export function plotStatus(s: GameState, w: World): PlotStatus[] {
  return [...w.plots.values()].map((p) => {
    const st = s.plots?.[p.id];
    const v = st ? p.variants[st.variant] : undefined;
    let work = 0;
    let doneWork = 0;
    const orders = (v?.orders ?? []).map((id) => {
      const o = w.orders.get(id);
      const total = o ? minutes(o.work) : 1;
      const done = (s.orderLog.done[id] ?? 0) > 0;
      const progress = done ? 1 : Math.min(1, (s.orders[id]?.progress ?? 0) / total);
      work += total;
      doneWork += progress * total;
      return { id, done, progress };
    });
    return {
      id: p.id,
      route: p.route,
      season: p.season,
      state: st?.state ?? 'locked',
      variant: st?.variant ?? null,
      anchor: v?.anchor ?? null,
      orders,
      done: orders.filter((x) => x.done).length,
      total: orders.length,
      progress: st?.state === 'open' ? 1 : work ? doneWork / work : 0,
      paused: plotPaused(s, w, p.id),
      since: st?.since ?? null,
      opened: st?.opened ?? null,
    };
  });
}
