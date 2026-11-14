// 演员表的种子随机：FNV-1a 字符串哈希 + mulberry32。同样的种子和键永远得到同样的数列（不用 Math.random）。
// 纯函数；以后搬进 packages/sim 时换成 packages/shared 的种子随机数也行（接口一样窄）。

/** 一个随机流：每调一次给 [0, 1) */
export type Rng = () => number;

/** FNV-1a（32 位）字符串哈希；h 可以接着上一段哈希往下算 */
export function hashStr(s: string, h = 0x811c9dc5): number {
  let x = h >>> 0;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}

/** 种子 + 一串键 → 32 位哈希（键之间插分隔符：'ab','c' 和 'a','bc' 不同） */
export function hashOf(seed: number, ...keys: readonly (string | number)[]): number {
  let h = hashStr(String(seed >>> 0));
  for (const k of keys) h = hashStr(`\u0001${k}`, h);
  return h;
}

/** mulberry32：32 位种子的小随机流 */
export function mulberry32(a: number): Rng {
  let t = a >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 种子 + 键 → 随机流（同样的输入，同样的数列） */
export const rngOf = (seed: number, ...keys: readonly (string | number)[]): Rng => mulberry32(hashOf(seed, ...keys));

/** [a, b] 里的整数 */
export const int = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
/** [a, b) 里的小数 */
export const range = (r: Rng, a: number, b: number) => a + r() * (b - a);
export const chance = (r: Rng, p: number) => r() < p;
export function pick<T>(r: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick: 空数组');
  return arr[Math.floor(r() * arr.length)] as T;
}
/** 按权重挑：[值, 权重][] */
export function weighted<T>(r: Rng, entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  let x = r() * total;
  for (const [v, w] of entries) {
    x -= Math.max(0, w);
    if (x < 0) return v;
  }
  return (entries[entries.length - 1] as readonly [T, number])[0];
}
/** 近似正态（四个均匀数的和，够用，不会出极端值） */
export const normal = (r: Rng, mu: number, sd: number) => mu + (r() + r() + r() + r() - 2) * sd * 1.732;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** 洗牌（返回新数组） */
export function shuffle<T>(r: Rng, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = out[i] as T;
    out[i] = out[j] as T;
    out[j] = t;
  }
  return out;
}
/** 从 arr 里不重复地挑 n 个 */
export const sample = <T>(r: Rng, arr: readonly T[], n: number): T[] => shuffle(r, arr).slice(0, Math.max(0, n));
/** 按哈希从数组里挑一个（不需要随机流的时候） */
export const pickBy = <T>(h: number, arr: readonly T[]): T => arr[(h >>> 0) % arr.length] as T;
