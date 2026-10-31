import type { GameState } from './state';

/**
 * 状态里的种子随机流（mulberry32，和场景构建用的是同一个算法）。
 * 内部状态存在 GameState.rng 里，所以存档、重放之后接着取的数一样。
 */
export function rand(s: GameState): number {
  let a = s.rng | 0;
  a = (a + 0x6d2b79f5) | 0;
  s.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 按权重抽一个；总权重为 0 时返回 null。只消耗一个随机数。 */
export function weightedPick<T>(s: GameState, items: readonly { item: T; weight: number }[]): T | null {
  const total = items.reduce((a, b) => a + Math.max(0, b.weight), 0);
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const it of items) {
    r -= Math.max(0, it.weight);
    if (r < 0) return it.item;
  }
  return items[items.length - 1]?.item ?? null;
}
