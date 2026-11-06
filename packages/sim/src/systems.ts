import { minutes } from '@td/content';
import { directorDraw, expireCards, openScheduled } from './cards';
import { careCloseDay, careSystem } from './care';
import { buildDayReport, forecastWeather, freshDay, seasonOn, settleDay, weatherWeights } from './day';
import { type Ctx, checkEnding, run, setStat } from './effects';
import { checkUnlocks } from './growth';
import { weightedPick } from './rng';
import { closeLedger, decayDay, gradeDrop, overnight, staffSystem } from './staff';
import { checkStars } from './stars';
import { at, dayOf, minuteOfDay, weekdayOf } from './state';
import { rainCheck, tournamentSystem } from './tournaments';
import { num, qualityTarget, test } from './vars';
import { walkSystem } from './walk';
import { bookDay, settleWeek } from './week';
import type { World } from './world';

/**
 * 每个 tick 按固定顺序执行的系统，每个只负责一件事（ADR 0012）：
 * 日历 → 赛事 → 员工走路 → 改造期满 → 放下没了岗位的人 → 岗位和工单 → 场地可用度 → 活动 → 质量 → 星级 → 事件 → 导演。
 * 收盘时：场地可用度（门口的人回家）→ 衰减（读今天的岗位账）→ 今天的岗位账 → 经济（按天记账）→ 特质 → 每日结算（声望、会员，
 * 一条 daily 因果日志，ADR 0024）→（周日）本周回顾（只讲不改）→ 掉档 → … → 抽明天的天气 → 今天的结算报告（daySettled）。
 */

/* ---------------- 活动 ---------------- */

function activitySystem(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const a of s.activities) {
    if (!a.started && a.start <= s.t) {
      a.started = true;
      // 排在夜里（关门后）的活动推到开门时才开始，时长不变
      if (a.start < s.t - 1) {
        a.end = s.t + (a.end - a.start);
        a.start = s.t;
      }
      const def = w.activities.get(a.id);
      ctx.events.push({
        type: 'activityStarted',
        uid: a.uid,
        activity: a.id,
        anchor: a.anchor,
        performance: def?.performance ?? a.id,
        end: a.end,
      });
    }
  }
  const done = s.activities.filter((a) => a.started && a.end <= s.t);
  if (!done.length) return;
  s.activities = s.activities.filter((a) => !(a.started && a.end <= s.t));
  for (const a of done) {
    const def = w.activities.get(a.id);
    // 活动结算：结果由模拟算出，演出只负责演
    run(ctx, { kind: 'activity', activity: a.id }, a.cause, def?.effects ?? []);
    ctx.events.push({ type: 'activityFinished', uid: a.uid, activity: a.id });
  }
}

/* ---------------- 质量（每分钟向目标靠近） ---------------- */

const OPEN_MINUTES = (w: World) => (w.act.hours.close - w.act.hours.open) * 60;

/** 每 10 分钟算一次目标、一次走 10 分钟的量（目标是表达式，每分钟都算太慢） */
const QUALITY_STEP = 10;
function qualitySystem(ctx: Ctx): void {
  const { s, w } = ctx;
  if (minuteOfDay(s.t) % QUALITY_STEP !== 0) return;
  const target = qualityTarget(s, w).total;
  const q = s.stats.quality ?? 0;
  const k = 1 - (1 - w.act.rules.quality_rate / OPEN_MINUTES(w)) ** QUALITY_STEP;
  setStat(ctx, 'quality', q + (target - q) * k);
}

/* ---------------- 收盘：人员、经济、会员、声望、派生量、失败条件 ---------------- */

/**
 * 只读此刻状态的派生量（例如复原 restoration = restored）每分钟同步，HUD 读到的和星级清单里的 restored 永远是同一个数。
 * 读今天服务率（service_rate、service_demand）的派生量照旧只在收盘时算（准则 6：不实时漂移，收盘结算一次）。
 */
const CLOSE_VARS = /\bservice_(rate|demand)\b/;
function liveDerived(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const [stat, src] of Object.entries(w.act.rules.derived))
    if (!CLOSE_VARS.test(src)) setStat(ctx, stat, num(s, w, src));
}

export function recomputeDerived(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const [stat, src] of Object.entries(w.act.rules.derived)) setStat(ctx, stat, num(s, w, src));
  // 拆成几项的派生量：值 = 各项之和；每项记下来给界面讲"为什么"
  for (const [stat, terms] of Object.entries(w.act.rules.derived_terms)) {
    const parts: Record<string, number> = {};
    let total = 0;
    for (const [k, src] of Object.entries(terms)) {
      const v = num(s, w, src);
      parts[k] = Math.round(v * 10) / 10 || 0; // -0 读档后会变成 0，统一成 0
      total += v;
    }
    s.terms ??= {};
    s.terms[stat] = parts;
    setStat(ctx, stat, total);
  }
}

function closeDay(ctx: Ctx): void {
  const { s, w } = ctx;
  const day = dayOf(s.t);
  // 赛事收赛在关门那一刻的（时段写到关门）：今天就结算，不等明早
  tournamentSystem(ctx);
  // 场地可用度：门口等的人回家、今天走掉的计数清零（court-care-contract.md）
  careCloseDay(ctx);
  // 衰减先看今天的岗位账（有人守着的设施掉得慢），再把账写成日志清掉
  decayDay(ctx, w.act.seasons.find((x) => x.id === s.season)?.decay ?? 1);
  closeLedger(ctx);
  // 钱按天记账、老写法的每日漂移（week.ts，GM-1：不每天各写一条日志）
  bookDay(ctx, day);
  // 在职人员的特质：士气漂移；声望漂移记在今天的账上，和每日结算一起结算（准则 6：声望不实时漂移）
  for (const p of Object.values(s.people)) {
    if (!p.hired) continue;
    for (const t of w.people.get(p.id)?.traits ?? []) {
      const tr = w.traits.get(t);
      if (!tr) continue;
      p.morale = Math.max(0, Math.min(100, p.morale + tr.morale_drift));
      s.today.traitRep += tr.reputation_drift;
    }
    p.fatigue = Math.max(0, p.fatigue - 10);
  }
  // 每日结算（ADR 0024）：声望、会员按今天结算，写一条 daily 日志，把今天卷进本周的账（day.ts）
  settleDay(ctx, day);
  // 周日收盘：本周回顾（七天之和，只讲不改），本周清零（week.ts）
  const sunday = weekdayOf(s.t) === 6;
  if (sunday) settleWeek(ctx, day);
  // 周日收盘：会员声望结算完了，再看哪处设施没撑住、掉一档（准则 6，ADR 0017）
  if (sunday) gradeDrop(ctx);
  recomputeDerived(ctx);
  // 周结算以后会员和声望变了：看一眼星级（LG-10）
  checkStars(ctx);
  // 成长解锁（W3）：招来的人、效果加的能力，收盘时补看一眼（成长关着时什么都不做）
  checkUnlocks(ctx);
  if (sunday) {
    // 拆成几项的派生量：这一周每项变了多少（界面说明董事会信心为什么变）
    const terms: Record<string, { total: number; delta: Record<string, number> }> = {};
    for (const [stat, now] of Object.entries(s.terms ?? {})) {
      const before = s.termsWeek?.[stat] ?? {};
      const delta: Record<string, number> = {};
      for (const [k, v] of Object.entries(now)) delta[k] = Math.round((v - (before[k] ?? v)) * 10) / 10 || 0;
      terms[stat] = { total: s.stats[stat] ?? 0, delta };
    }
    s.termsWeek = structuredClone(s.terms ?? {});
    ctx.events.push({ type: 'weekSettled', serviceRate: s.week.last, terms });
  }
  ctx.events.push({ type: 'dayEnded', day });
  const lose = w.act.rules.lose_if;
  if (lose && !s.outcome && test(s, w, lose.when))
    run(ctx, { kind: 'day', day }, null, [{ endAct: 'lost', ending: lose.ending }]);
  // 明天的天气现在就抽好（随机数的位置和以前在开门时抽一样），结算卡的预告是真的
  forecastWeather(ctx, day);
  // 今天的结算报告（只读、不用随机数；周日带上本周回顾）：留最近 7 份，发给游戏开结算卡
  const report = buildDayReport(s, w, day);
  s.days.push(report);
  if (s.days.length > 7) s.days.splice(0, s.days.length - 7);
  ctx.events.push({ type: 'daySettled', report });
}

/** 今天属于哪个季节（实现在 day.ts，这里照旧导出） */
export { seasonOn };

/** 新的一天开门：换季、今天的天气、每天固定的活动。 */
export function openDay(ctx: Ctx, day: number, fromMinute = 0): void {
  const { s, w } = ctx;
  // 今天的账（每日结算）：昨天有需求就记下昨天的服务率，没有就把更早的带过来
  const y = s.today;
  const prev = y && y.demand > 0 ? { last: y.served / y.demand, lastDemand: y.demand } : y;
  s.today = freshDay(s, day, prev ? { last: prev.last, lastDemand: prev.lastDemand } : undefined);
  const season = seasonOn(w, day);
  if (season !== s.season) {
    s.season = season;
    ctx.events.push({ type: 'seasonStarted', season });
  }
  const weights = w.act.weather[season];
  if (weights) {
    // 昨天收盘已经抽好了（预告是真的）：照它，不再抽；新开局、读旧档、第二季回拨时钟没有预告，照旧抽
    if (s.forecast?.day === day) s.weather = s.forecast.weather;
    else {
      const pick = weightedPick(s, weatherWeights(weights));
      if (pick) s.weather = pick;
    }
    ctx.events.push({ type: 'weather', weather: s.weather });
  }
  s.forecast = null;
  // 赛事（LG-11）：接下的主办赛事今天比赛、又下雨，就办不成
  rainCheck(ctx);
  for (const d of w.act.daily) {
    const start = at(day, d.hour);
    if (start < s.t || minuteOfDay(start) < fromMinute) continue;
    if (d.if && !test(s, w, d.if)) continue;
    const a = w.activities.get(d.activity);
    if (!a) continue;
    s.activities.push({
      uid: s.nextUid++,
      id: a.id,
      anchor: a.anchor,
      start,
      end: start + minutes(a.duration),
      started: false,
      cause: null,
    });
  }
}

/* ---------------- 一个 tick ---------------- */

/** 推进一分钟。到了收盘时间就结算这一天，直接跳到第二天开门（夜里不模拟）。 */
export function tick(ctx: Ctx): void {
  const { s, w } = ctx;
  if (s.outcome) return;
  checkEnding(ctx); // 结局（W4）：到了第一季的期限就结算打分；表演赛刚办成就来结局卡
  if (s.outcome) return;
  openScheduled(ctx); // 日历和后续事件
  tournamentSystem(ctx); // 赛事：开赛、收赛结算（LG-11）
  staffSystem(ctx); // 岗位转圈、工单推进、办事
  careSystem(ctx); // 场地可用度：天气和使用加脏乱、换档、门口等人（court-care-contract.md）
  activitySystem(ctx); // 活动开始、结算
  qualitySystem(ctx); // 项目质量
  liveDerived(ctx); // 复原这类只读此刻状态的派生量
  if (minuteOfDay(s.t) % 10 === 0) {
    checkStars(ctx); // 星级（LG-10）：每 10 分钟看一眼下一星的清单
    checkEnding(ctx);
  }
  expireCards(ctx); // 事件：倒计时到了执行默认后果
  directorDraw(ctx); // 导演：要不要发新卡
  s.t += 1;
  walkSystem(ctx); // 走路：这一分钟走到没有

  if (minuteOfDay(s.t) >= w.act.hours.close * 60 && !s.outcome) {
    closeDay(ctx);
    const next = dayOf(s.t) + 1;
    const open = at(next, w.act.hours.open);
    // 夜里跳过：人留在原地，走到一半的直接到，明早接着干
    overnight(ctx);
    s.t = open;
    openDay(ctx, next);
  }
}
