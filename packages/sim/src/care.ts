import { MESS_KINDS, type MessKind, minutes, type Post } from '@td/content';
import { type Ctx, run } from './effects';
import { careCourts, initCare, levelFrom, messOf, surfaceOf } from './mess';
import { grow, postExists, postInHours, speedOf, working, workSkill } from './staff';
import { type CareResult, type CourtCare, DIRECTOR, type GameState, type PersonState } from './state';
import { careActive, careBlocksPost, stateDef, usabilityOf } from './vars';
import { sendErrand, walkEta } from './walk';
import type { World } from './world';

/**
 * 场地可用度（docs/design/court-care-contract.md，ADR 0022）：球场上的短期脏乱（积沙、积水、球和垃圾、线褪色、裂缝），
 * 和设施状况 condition（长期磨损、衰减、周日掉档）分开。天气和使用让它变脏，打扫岗位、打扫工单、总监亲手扫让它变干净。
 * 可用度不给玩家看数，只给三档（能打 / 勉强 / 不能打）。
 *
 * 这里是系统和命令（careSystem、careCloseDay、careFinish、canCare、careMinutes）；叶子工具在 mess.ts，
 * 读"场地开没开"的查询（careActive、usabilityOf、careLevelOf、careWorst、careWaiting、careBlocksPost）在 vars.ts。
 * care.ts 可以引用 staff、walk、effects、vars、mess；它们都不能反过来引用 care.ts（depcruise 不许循环）。
 */

/**
 * 能不能亲手扫这块场（界面在打开小游戏之前问；careFinish 用同一条规则校验）：
 * court 不是球场；inactive 场地没开（废墟、停用、改造）；busy 总监在办事（errand）；rain 正在下雨（扫了也白扫）；
 * clean 没什么可扫（Σ mess < 0.03）；over 这一局结束了。
 */
export type CareBlock = 'court' | 'inactive' | 'busy' | 'rain' | 'clean' | 'over' | null;

/** Σ mess 低于它就算"没什么可扫" */
const CLEAN_ENOUGH = 0.03;

export function canCare(s: GameState, w: World, f: string): CareBlock {
  if (s.outcome) return 'over';
  if (!w.act.rules.care?.courts[f]) return 'court';
  if (!careActive(s, w, f)) return 'inactive';
  const d = s.people[DIRECTOR];
  if (!d?.hired || d.errand) return 'busy';
  if (s.weather === 'rain') return 'rain';
  const m = messOf(s, f);
  let sum = 0;
  for (const k of MESS_KINDS) sum += m[k];
  if (sum < CLEAN_ENOUGH) return 'clean';
  return null;
}

/** 亲手扫要总监离岗多久（游戏分钟）：work 在场上干的、walk 走过去的、total = work + walk */
export interface CareMinutes {
  work: number;
  walk: number;
  total: number;
}

/** 设施的锚点（这五处和设施 id 一样；按内容的 anchor 找） */
const anchorOf = (w: World, f: string): string => w.facilities.get(f)?.anchor ?? f;

/** 清掉的比例截在 0..1，不是有限数当 0 */
const frac = (r: CareResult, k: MessKind): number => {
  const v = r.cleared?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
};

/** 按小游戏的结果算总监离岗的分钟（契约"总监的工时"；careFinish 用同一个函数） */
export function careMinutes(s: GameState, w: World, f: string, r: CareResult): CareMinutes {
  const rules = w.act.rules.care;
  if (!rules?.courts[f]) return { work: 0, walk: 0, total: 0 };
  const m = messOf(s, f);
  let raw = rules.hand.base;
  for (const k of MESS_KINDS) raw += (rules.hand.per[k] ?? 0) * m[k] * frac(r, k);
  const speed = speedOf(workSkill(s, w, DIRECTOR, 'upkeep'));
  const courts = Math.max(1, stateDef(s, w, f)?.courts ?? 1);
  const scaled = (raw / speed) * (1 + 0.5 * (courts - 1));
  const work = Math.round(Math.max(rules.hand.min, Math.min(rules.hand.max, scaled)));
  const walk = s.people[DIRECTOR] ? (walkEta(s, w, DIRECTOR, anchorOf(w, f)) ?? 0) : 0;
  return { work, walk, total: work + walk };
}

/** 全扫干净要多久（地点清单上"亲手扫"按钮的代价提示）= careMinutes(每项都清掉 1) */
export function careEstimate(s: GameState, w: World, f: string): CareMinutes {
  const all = Object.fromEntries(MESS_KINDS.map((k) => [k, 1])) as Record<MessKind, number>;
  return careMinutes(s, w, f, { cleared: all });
}

/** 谁坐在这个岗位上、此刻在干活 */
function workingOn(s: GameState, w: World, post: string): boolean {
  for (const id in s.people) {
    const p = s.people[id] as PersonState;
    if (p.hired && p.job === post) return working(s, w, id);
  }
  return false;
}

/** 换档：和存下的不一样就发 careLevel、存下来；不再是"不能打"而门口有人 → 他们进场（waitingEnded playable） */
function relevel(ctx: Ctx, f: string, c: CourtCare): void {
  const { s, w } = ctx;
  const u = usabilityOf(s, w, f);
  const to = levelFrom(w, u);
  if (to !== c.level) {
    ctx.events.push({ type: 'careLevel', court: f, from: c.level, to, usability: Math.round(u) });
    c.level = to;
  }
  if (to !== 'no') endWaiting(ctx, f, c, 'playable');
}

function endWaiting(ctx: Ctx, f: string, c: CourtCare, reason: 'playable' | 'closed'): void {
  if (!c.waiting) return;
  ctx.events.push({ type: 'waitingEnded', court: f, waited: ctx.s.t - c.waiting.since, reason });
  c.waiting = null;
}

/** 每分钟（systems.ts，staffSystem 之后）：天气和使用加脏乱、换档、门口等人、走人、抱怨 */
export function careSystem(ctx: Ctx): void {
  const { s, w } = ctx;
  const rules = w.act.rules.care;
  if (!rules) return;
  initCare(s, w);
  const weather = rules.weather[s.weather] ?? {};
  const patience = minutes(rules.patience);
  const grumble = minutes(rules.grumble_every);
  for (const f of careCourts(w)) {
    const c = s.care[f] as CourtCare;
    if (!careActive(s, w, f)) {
      // 没开的场：脏乱冻住；场地刚停用而门口还有人 → 散了
      endWaiting(ctx, f, c, 'playable');
      continue;
    }
    const surface = surfaceOf(s, w, f);
    const mult = (surface && rules.surface[surface]) || {};
    const posts: readonly Post[] = w.postsAt.get(anchorOf(w, f)) ?? [];
    // 此刻在用这块场的岗位（有人在干、存在、在时段里、不是打扫岗位、没被挡住），和被挡住的有需求岗位
    let units = 0;
    let blocked = 0;
    for (const p of posts) {
      if (p.care !== undefined || !postInHours(s, p) || !postExists(s, w, p)) continue;
      const stopped = careBlocksPost(s, w, p.id);
      if (stopped) {
        if (p.hours) blocked += 1;
      } else if (workingOn(s, w, p.id)) units += 1;
    }
    // 1. 天气 2. 使用（每营业小时的速率 ÷ 60）
    const delta: Partial<Record<MessKind, number>> = {};
    for (const k of MESS_KINDS) {
      const v = ((weather[k] ?? 0) * (mult[k] ?? 1) + (rules.use[k] ?? 0) * units) / 60;
      if (v) delta[k] = v;
    }
    if (Object.keys(delta).length) {
      const m = c.mess;
      for (const k of MESS_KINDS) {
        const d = delta[k];
        if (d) m[k] = Math.max(0, Math.min(1, m[k] + d));
      }
    }
    // 3. 换档
    relevel(ctx, f, c);
    // 4. 门口等人（不能打）
    if (c.level === 'no') {
      const n = Math.min(rules.waiting_max, blocked * rules.waiting_per_post);
      if (n <= 0) endWaiting(ctx, f, c, 'playable');
      else if (!c.waiting) {
        c.waiting = { since: s.t, n };
        ctx.events.push({ type: 'membersWaiting', court: f, n });
      } else {
        if (c.waiting.n !== n) {
          c.waiting.n = n;
          ctx.events.push({ type: 'membersWaiting', court: f, n });
        }
        const waited = s.t - c.waiting.since;
        if (waited >= patience && c.walkoutsToday < rules.walkout_max_day) {
          c.walkoutsToday += 1;
          s.week.walkouts = (s.week.walkouts ?? 0) + 1;
          run(ctx, { kind: 'walkout', court: f, waited }, null, []);
          ctx.events.push({ type: 'memberWalkedOut', court: f, waited });
          c.waiting.since = s.t;
        }
      }
    }
    // 5. 抱怨（勉强能打、有人在打）
    if (c.level === 'meh' && units > 0 && (c.grumbled === null || s.t - c.grumbled >= grumble)) {
      ctx.events.push({ type: 'careGrumble', court: f });
      c.grumbled = s.t;
    }
  }
}

/** 收盘（closeDay，衰减之前）：门口等的人回家（waitingEnded closed，不算走掉），今天走掉的计数清零 */
export function careCloseDay(ctx: Ctx): void {
  const { s, w } = ctx;
  if (!w.act.rules.care) return;
  initCare(s, w);
  for (const f of careCourts(w)) {
    const c = s.care[f] as CourtCare;
    endWaiting(ctx, f, c, 'closed');
    c.walkoutsToday = 0;
    c.grumbled = null;
  }
}

/** 命令 careFinish：校验、清掉脏乱、把总监派去离岗、写一条 care 因果日志、发 careDone */
export function careFinish(ctx: Ctx, f: string, r: CareResult): boolean {
  const { s, w } = ctx;
  if (canCare(s, w, f) !== null) return false;
  initCare(s, w);
  const c = s.care[f] as CourtCare;
  const { work, total } = careMinutes(s, w, f, r);
  const before = Math.round(usabilityOf(s, w, f));
  const delta: Partial<Record<MessKind, number>> = {};
  const cleared: Partial<Record<MessKind, number>> = {};
  for (const k of MESS_KINDS) {
    const x = frac(r, k);
    if (x <= 0) continue;
    cleared[k] = x;
    const d = -c.mess[k] * x;
    if (!d) continue;
    c.mess[k] = Math.max(0, Math.min(1, c.mess[k] + d));
    delta[k] = Math.round(d * 1e4) / 1e4;
  }
  relevel(ctx, f, c);
  const at = anchorOf(w, f);
  sendErrand(ctx, DIRECTOR, at, work);
  const after = Math.round(usabilityOf(s, w, f));
  const entry = run(ctx, { kind: 'care', court: f, minutes: total, before, after, cleared }, null, []);
  entry.effects.push({ kind: 'errand', person: DIRECTOR, at, minutes: work });
  if (Object.keys(delta).length) entry.effects.push({ kind: 'mess', facility: f, delta });
  grow(ctx, DIRECTOR, 'upkeep');
  ctx.events.push({ type: 'careDone', court: f, before, after, minutes: total });
  return true;
}
