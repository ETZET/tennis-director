import { MESS_KINDS, type MessKind, type Surface } from '@td/content';
import type { CareLevel, CourtCare, CourtMess, GameState } from './state';
import type { World } from './world';

/**
 * 场地可用度的叶子模块（docs/design/court-care-contract.md，ADR 0022）：只读内容和状态、不依赖别的模拟模块，
 * vars.ts、effects.ts、staff.ts、care.ts 都从这里取（depcruise 不许循环引用）。
 * 读"场地开没开"（stateDef）的查询在 vars.ts（careActive、usabilityOf、careLevelOf……），系统和命令在 care.ts。
 */

/** 全干净 */
export const CLEAN: Readonly<CourtMess> = Object.freeze({ sand: 0, water: 0, litter: 0, lines: 0, cracks: 0 });

export const freshCare = (): CourtCare => ({
  mess: { ...CLEAN },
  level: 'ok',
  waiting: null,
  walkoutsToday: 0,
  grumbled: null,
});

/** 这张地图的球场（rules.care.courts 的顺序）；没写 rules.care 是空表 */
export const careCourts = (w: World): string[] => Object.keys(w.act.rules.care?.courts ?? {});

/** 补上缺的球场条目（开局、旧存档第一次用到时）：全干净、能打、没人等 */
export function initCare(s: GameState, w: World): void {
  s.care ??= {};
  for (const f of careCourts(w)) s.care[f] ??= freshCare();
}

/** 这块场现在是什么面（修成的变体可以换面）；不是球场是 null */
export function surfaceOf(s: GameState, w: World, f: string): Surface | null {
  const c = w.act.rules.care?.courts[f];
  if (!c) return null;
  const v = s.variants?.[f];
  return (v && c.variants[v]) || c.surface;
}

/** 这块场的脏乱（没有条目时全干净；返回状态里的对象或 CLEAN，别改它） */
export const messOf = (s: GameState, f: string): Readonly<CourtMess> => s.care?.[f]?.mess ?? CLEAN;

/** 可用度 0..100 = clamp(100 − 100 × Σ weights[面][k] × mess[k])（不看场地开没开；那个在 vars.ts 的 usabilityOf） */
export function usabilityFrom(w: World, surface: Surface, mess: Readonly<CourtMess>): number {
  const wt = w.act.rules.care?.weights[surface] ?? {};
  let loss = 0;
  for (const k of MESS_KINDS) loss += (wt[k] ?? 0) * mess[k];
  return Math.max(0, Math.min(100, 100 - 100 * loss));
}

/** 可用度 → 档：≥ ok_at 能打，< no_below 不能打，中间勉强；没写 rules.care 一律能打 */
export function levelFrom(w: World, usability: number): CareLevel {
  const r = w.act.rules.care;
  if (!r) return 'ok';
  return usability >= r.ok_at ? 'ok' : usability < r.no_below ? 'no' : 'meh';
}

/**
 * 给这块场的脏乱各项加 delta（可以是负数），截在 0..1；返回实际变了多少（没变的项不写）。
 * 不是球场（没有条目、也不在 rules.care.courts 里）什么都不做、返回 {}。缺条目的球场先补上。
 */
export function addMess(
  s: GameState,
  w: World,
  f: string,
  delta: Partial<Record<MessKind, number>>,
): Partial<Record<MessKind, number>> {
  if (!w.act.rules.care?.courts[f]) return {};
  s.care ??= {};
  const c = (s.care[f] ??= freshCare());
  const out: Partial<Record<MessKind, number>> = {};
  for (const k of MESS_KINDS) {
    const d = delta[k];
    if (!d) continue;
    const before = c.mess[k];
    const v = Math.max(0, Math.min(1, before + d));
    c.mess[k] = v;
    if (v !== before) out[k] = v - before;
  }
  return out;
}
