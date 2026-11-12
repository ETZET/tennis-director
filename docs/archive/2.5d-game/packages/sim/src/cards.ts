import { type Card, minutes, OPTION_KEYS, type OptionKey } from '@td/content';
import { clamp } from '@td/shared';
import { applyEffects, type Ctx, logEntry } from './effects';
import { rand, weightedPick } from './rng';
import { DIRECTOR, type EffectRecord, type GameState, type OpenCard } from './state';
import { makeEnv, num, test } from './vars';
import { sendErrand } from './walk';
import type { World } from './world';

/**
 * 事件引擎（storylet 模型）：
 * - 里程碑、日历、后果卡按时间表打开；
 * - 阈值卡和随机卡由导演每隔一段时间筛出所有满足前置条件、不在冷却中的卡，按权重抽一张；
 * - 倒计时到了不处理，就执行默认后果。
 */

/** 只出现一次：显式写了就按写的；否则阈值卡和随机卡可重复，其余只一次 */
export const isOnce = (c: Card): boolean => c.once ?? !(c.source === 'random');

export function openCard(ctx: Ctx, cardId: string, cause: number | null): OpenCard | null {
  const { s, w } = ctx;
  const c = w.cards.get(cardId);
  if (!c || s.outcome) return null;
  if (isOnce(c) && ((s.cards.seen[cardId] ?? 0) > 0 || s.cards.shown[cardId])) return null;
  if (s.cards.open.some((o) => o.card === cardId)) return null;
  const o: OpenCard = {
    uid: s.nextUid++,
    card: cardId,
    opened: s.t,
    expires: c.countdown ? s.t + minutes(c.countdown) : null,
    cause,
  };
  s.cards.open.push(o);
  s.cards.shown[cardId] = (s.cards.shown[cardId] ?? 0) + 1;
  s.cards.lastOpened = s.t;
  // 一张卡打开以后，导演至少隔一段时间才抽下一张（日历和后果卡照常按点来）
  s.cards.nextDraw = Math.max(s.cards.nextDraw, s.t + minutes(w.director.gap));
  ctx.events.push({ type: 'cardOpened', uid: o.uid, card: cardId, pause: c.pause });
  if (c.pause) ctx.events.push({ type: 'requestPause', reason: cardId });
  return o;
}

export type OptionBlock = 'busy' | 'cost' | 'requires' | null;

export interface OptionStatus {
  key: OptionKey;
  available: boolean;
  /** 为什么不能选：总监正被别的事叫走、钱不够、前置条件不满足 */
  blocked: OptionBlock;
  cost: number;
  /** 选了以后总监要离开手上的岗位，去 at 待 minutes 分钟 */
  errand: { at: string; minutes: number } | null;
  /** 有判定的选项：成功率 0..1 */
  chance: number | null;
}

/** 一张开着的卡的每个选项现在能不能选（界面和机器人都用它）。 */
export function optionStatus(s: GameState, w: World, uid: number): OptionStatus[] {
  const o = s.cards.open.find((x) => x.uid === uid);
  const c = o && w.cards.get(o.card);
  if (!c) return [];
  return OPTION_KEYS.flatMap((key) => {
    const opt = c.options[key];
    if (!opt) return [];
    const cost = opt.cost ?? 0;
    const blocked: OptionBlock =
      opt.requires && !test(s, w, opt.requires)
        ? 'requires'
        : opt.errand && s.people[DIRECTOR]?.errand
          ? 'busy'
          : cost > 0 && cost > (s.stats.cash ?? 0)
            ? 'cost'
            : null;
    return [
      {
        key,
        available: blocked === null,
        blocked,
        cost,
        errand: opt.errand ? { at: opt.errand.at, minutes: minutes(opt.errand.for) } : null,
        chance: opt.check ? checkChance(s, w, opt.check, false) : null,
      },
    ];
  });
}

/** 判定成功率；peek 为 true 时不消耗随机数（表达式里有 rand() 也只是看一眼） */
function checkChance(
  s: GameState,
  w: World,
  check: NonNullable<Card['options'][OptionKey]>['check'],
  consume = true,
): number {
  if (!check) return 1;
  if ('stat' in check) return clamp(0.5 + ((s.stats[check.stat] ?? 0) - check.vs) / 50, 0.05, 0.95);
  if (!consume) {
    const saved = s.rng;
    const v = clamp(num(s, w, check.chance), 0, 1);
    s.rng = saved;
    return v;
  }
  return clamp(num(s, w, check.chance), 0, 1);
}

/** 处理一张卡：玩家选的（by='player'）或倒计时到了（by='default'）。 */
export function resolveCard(ctx: Ctx, uid: number, key: OptionKey | null, by: 'player' | 'default'): boolean {
  const { s, w } = ctx;
  const idx = s.cards.open.findIndex((x) => x.uid === uid);
  const o = s.cards.open[idx];
  const c = o && w.cards.get(o.card);
  if (!o || !c) return false;
  const opt = key ? c.options[key] : undefined;
  if (by === 'player') {
    if (!key || !opt) return false;
    const st = optionStatus(s, w, uid).find((x) => x.key === key);
    if (!st?.available) return false;
  }
  s.cards.open.splice(idx, 1);
  const out: EffectRecord[] = [];
  const cause =
    by === 'player'
      ? ({ kind: 'option', card: c.id, option: key as OptionKey } as const)
      : ({ kind: 'default', card: c.id, option: key } as const);
  const entry = logEntry(ctx, { ...cause }, o.cause, out);
  let success: boolean | undefined;
  if (opt) {
    // 默认后果照样扣钱（钱可以变成负数），玩家选的选项已经检查过够不够
    if (opt.cost) {
      s.stats.cash = (s.stats.cash ?? 0) - opt.cost;
      out.push({ kind: 'cost', amount: opt.cost });
    }
    // 要总监亲自去办：他放下手上的岗位走过去（代价是总监的工时）
    if (opt.errand && !s.people[DIRECTOR]?.errand) {
      const m = minutes(opt.errand.for);
      if (sendErrand(ctx, DIRECTOR, opt.errand.at, m))
        out.push({ kind: 'errand', person: DIRECTOR, at: opt.errand.at, minutes: m });
    }
    applyEffects(ctx, opt.effects, entry.id, out);
    if (opt.check) {
      success = rand(s) < checkChance(s, w, opt.check);
      applyEffects(ctx, success ? opt.onSuccess : opt.onFail, entry.id, out);
      (entry.cause as { success?: boolean }).success = success;
    }
  }
  if (by === 'default') applyEffects(ctx, c.default?.extra ?? [], entry.id, out);
  s.cards.seen[c.id] = (s.cards.seen[c.id] ?? 0) + 1;
  if (c.cooldown) s.cards.cooldowns[c.id] = s.t + minutes(c.cooldown);
  ctx.events.push({
    type: 'cardResolved',
    uid,
    card: c.id,
    option: key,
    by,
    ...(success === undefined ? {} : { success }),
  });
  return true;
}

/** 倒计时到了的卡执行默认后果。 */
export function expireCards(ctx: Ctx): void {
  const { s, w } = ctx;
  for (const o of [...s.cards.open]) {
    if (o.expires === null || o.expires > s.t) continue;
    const c = w.cards.get(o.card);
    resolveCard(ctx, o.uid, c?.default?.then ?? null, 'default');
  }
}

/** 到时间的后续事件和日历事件打开。 */
export function openScheduled(ctx: Ctx): void {
  const { s } = ctx;
  if (!s.cards.scheduled.some((x) => x.at <= s.t)) return;
  const due = s.cards.scheduled.filter((x) => x.at <= s.t);
  s.cards.scheduled = s.cards.scheduled.filter((x) => x.at > s.t);
  for (const d of due) openCard(ctx, d.card, d.cause);
}

/** 现在满足条件、可以被导演抽到的阈值卡和随机卡，以及各自的权重（调试面板也用它）。 */
/** 阈值和随机卡一幕里默认最多出现几次 */
export const MAX_SHOWN = 2;

export function eligibleCards(s: GameState, w: World): { card: string; weight: number }[] {
  const pressure = directorPressure(s, w);
  const env = makeEnv(s, w, { pressure });
  const toneWeight = (tone: Card['tone']) => {
    const v = w.director.weights[tone];
    return typeof v === 'number' ? v : Number(w.expr(v).eval(env));
  };
  const saved = s.rng;
  const out: { card: string; weight: number }[] = [];
  for (const c of w.cards.values()) {
    if (c.act !== s.act || (c.source !== 'threshold' && c.source !== 'random')) continue;
    if (isOnce(c) && (s.cards.shown[c.id] ?? 0) > 0) continue;
    if ((s.cards.shown[c.id] ?? 0) >= (c.max_shown ?? MAX_SHOWN)) continue;
    if ((s.cards.cooldowns[c.id] ?? -1) > s.t) continue;
    if (s.cards.open.some((o) => o.card === c.id)) continue;
    if (s.cards.scheduled.some((x) => x.card === c.id)) continue;
    if (!test(s, w, c.when)) continue;
    const weight = typeof c.weight === 'number' ? c.weight : Number(w.expr(c.weight).eval(env));
    out.push({ card: c.id, weight: Math.max(0, weight) * Math.max(0, toneWeight(c.tone)) });
  }
  s.rng = saved;
  return out;
}

export function directorPressure(s: GameState, w: World): number {
  const saved = s.rng;
  const p = clamp(num(s, w, w.director.pressure), 0, 1);
  s.rng = saved;
  return p;
}

/** 导演系统：到点了就抽一张卡。开着的卡太多时先不发。 */
export function directorDraw(ctx: Ctx): void {
  const { s, w } = ctx;
  if (s.t < s.cards.nextDraw) return;
  const interval = minutes(w.director.interval);
  // 开太多，或者有一张要紧的卡（会暂停的那种）还没处理：先不发新卡，免得把它盖住
  if (s.cards.open.length >= w.director.max_open || s.cards.open.some((o) => w.cards.get(o.card)?.pause)) {
    s.cards.nextDraw = s.t + Math.round(interval / 3);
    return;
  }
  const pick = weightedPick(
    s,
    eligibleCards(s, w).map((x) => ({ item: x.card, weight: x.weight })),
  );
  if (pick) openCard(ctx, pick, null);
  // 间隔带一点随机，抽卡不总在一天里的同一个钟点
  const base = pick ? interval : Math.round(interval / 3);
  s.cards.nextDraw = Math.max(s.cards.nextDraw, s.t + Math.round(base * (0.75 + rand(s) * 0.5)));
}
