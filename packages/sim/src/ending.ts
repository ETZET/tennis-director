import { type Ctx, endingOf, endingState, run, scoreOf, startPlot } from './effects';
import { overnight } from './staff';
import { at, dayOf, type GameState, type ScoreItem, type Settlement } from './state';
import { openDay, recomputeDerived } from './systems';
import type { World } from './world';

/**
 * 结局方案 A（W4，LG-13；wave2-5-contract.md "结局"）。地图写了 ending（mode: score）才打开：
 * - 第 ending.day 天 ending.hour 点结算打分，不判输；破产（rules.lose_if）照旧结束。
 * - 表演赛办成（ending.exhibition 第一次满足）而且还没到期限：记下时刻、打开结局卡（ending.card）——
 *   "马上结算"（效果 { settle: true }，拿提前的天数分）或"接着经营到期限"。两条路都以结算收尾。
 * - 结算以后命令 startSeason2 开第二季：会所照旧，时钟回到第二季开局，目标占位，第一季没选的路记下来留给 W5。
 *
 * 结算、看一眼结局、endAct 的接管在 effects.ts（和升星一样：效果里要用，放这里会绕成环）；这里是第二季和 HUD 的查询。
 */

export { checkEnding, endingOf, gradeOf, scoreOf, settle } from './effects';

/** 第二季能不能开：结局打开着、第一季结算过（没破产）、还在第一季 */
export function canStartSeason2(s: GameState, w: World): boolean {
  const e = endingOf(w);
  const st = s.ending;
  return !!e && !!st?.settlement && st.season === 1 && s.outcome?.result === 'settled';
}

/**
 * 开第二季（命令 startSeason2）：会所、人、设施、星级、奖杯都留着；时钟回到第二季开局。
 * 第一季的事务了结：开着的卡、排着的卡、正在办的活动和赛事都清掉；冷却之类的时刻跟着时钟平移。
 */
export function startSeason2(ctx: Ctx): boolean {
  const { s, w } = ctx;
  const e = endingOf(w);
  if (!e || !canStartSeason2(s, w)) return false;
  const st = endingState(s);
  const start = e.season2.start ?? { day: 1, hour: w.act.hours.open };
  // 整天平移：第一季结算的第二天 0 点 → 第二季开局那天 0 点（星期几对齐要内容自己挑开局日）
  const shift = at(dayOf(s.t) + 1, 0) - at(start.day, 0);
  const back = (t: number) => t - shift;
  const rebase = (m: Record<string, number>) => {
    for (const k of Object.keys(m)) m[k] = back(m[k] as number);
  };
  overnight(ctx);
  for (const p of Object.values(s.people)) p.resume = null;
  rebase(s.cards.cooldowns);
  rebase(s.orderLog.cooldowns);
  for (const r of Object.values(s.remodels)) r.until = back(r.until);
  for (const x of Object.values(s.tournaments)) x.last = back(x.last);
  for (const x of Object.values(s.plots ?? {})) {
    x.since = back(x.since);
    if (x.opened !== null) x.opened = back(x.opened);
  }
  s.cards.open = [];
  s.cards.scheduled = [];
  s.cards.lastOpened = back(s.cards.lastOpened ?? 0);
  s.activities = [];
  s.events = {};
  // 第一季没选的路（W5 的地块用）：选过的处留下没选的那条，没选过的处留下全部
  const land: Record<string, string[]> = {};
  for (const [slot, routes] of Object.entries(w.act.routes ?? {})) {
    const chosen = s.routes?.[slot];
    land[slot] = routes.filter((r) => r !== chosen);
  }
  st.season = 2;
  st.goal = e.season2.goal;
  st.land = land;
  s.outcome = null;
  s.t = at(start.day, start.hour);
  s.cards.nextDraw = s.t + 60;
  const entry = run(ctx, { kind: 'season', season: 2, goal: e.season2.goal }, null, []);
  ctx.events.push({ type: 'season_two', goal: e.season2.goal, land: structuredClone(land) });
  for (const c of e.season2.start_cards) s.cards.scheduled.push({ card: c, at: s.t, cause: entry.id });
  // 地块（W5）：第二季的地块按第一季没选的路开工（这一处留下的路里第一个有变体的）
  for (const p of w.plots.values()) {
    if (p.season !== 2) continue;
    const v = (land[p.route] ?? []).find((r) => p.variants[r]);
    if (v) startPlot(ctx, p.id, v, entry.id, entry.effects);
  }
  openDay(ctx, start.day, Math.round(start.hour * 60));
  recomputeDerived(ctx);
  return true;
}

export interface EndingStatus {
  season: number;
  /** 第一季的期限：第几天几点，还剩几天（第二季是 null） */
  deadline: { day: number; hour: number; daysLeft: number } | null;
  /** 表演赛办成的那天（第几天）；没办成是 null */
  exhibition: number | null;
  /** 结局卡开着（等玩家选"马上结算 / 接着经营"） */
  deciding: boolean;
  /** 第一季的结算（结算以后才有） */
  settlement: Settlement | null;
  /** 现在就结算的话：分项、总分、评语（HUD 预估；结算以后等于 settlement） */
  preview: { items: ScoreItem[]; total: number; grade: string };
  /** 评语档（从高到低） */
  grades: { grade: string; gte: number }[];
  canStartSeason2: boolean;
  /** 第二季的目标（占位）和第一季没选的地 */
  goal: string | null;
  land: Record<string, string[]>;
}

/** HUD 和结局卡用：结局没打开（地图没写 ending）时是 null */
export function endingStatus(s: GameState, w: World): EndingStatus | null {
  const e = endingOf(w);
  if (!e) return null;
  const st = s.ending ?? { season: 1, exhibition: null, settlement: null, goal: null, land: {} };
  const first = st.season === 1;
  return {
    season: st.season,
    deadline: first ? { day: e.day, hour: e.hour, daysLeft: Math.max(0, e.day - dayOf(s.t)) } : null,
    exhibition: st.exhibition === null ? null : dayOf(st.exhibition),
    deciding: !!e.card && s.cards.open.some((o) => o.card === e.card),
    settlement: st.settlement,
    preview: st.settlement ?? scoreOf(s, w),
    grades: e.grades.map((g) => ({ ...g })),
    canStartSeason2: canStartSeason2(s, w),
    goal: st.goal,
    land: st.land,
  };
}
