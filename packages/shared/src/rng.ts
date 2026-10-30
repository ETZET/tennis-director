/**
 * 种子随机数。
 *
 * 原型用 mulberry32 生成地形、石墙、杂草等细节；同一个种子、同样的调用顺序，
 * 就能逐个体素复现同一个场景。场景构建必须按固定顺序从同一条随机流取数，
 * 调整构建顺序会改变画面。
 */

/** 返回 [0,1) 的随机数函数。 */
export type Rand = () => number;

export function mulberry32(seed: number): Rand {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [a,b) 区间内的随机数。 */
export const range = (rand: Rand, a: number, b: number): number => a + rand() * (b - a);

/** 从数组里随机取一个。数组不能为空。 */
export function pick<T>(arr: readonly T[], rand: Rand = Math.random): T {
  const v = arr[Math.floor(rand() * arr.length)];
  if (v === undefined) throw new Error('pick() on an empty array');
  return v;
}
