// clubfront：从 desert3d-v2/noise.ts 原样复制（2026-11-08）。只在这里改，不要改 desert3d-v2 的那份。
// 确定性噪声（地形形状用，和种子无关）+ 种子随机流。
function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0..1 二维值噪声 */
export function vnoise(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = hash(x0, z0, seed);
  const b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed);
  const d = hash(x0 + 1, z0 + 1, seed);
  return a + (b - a) * tx + (c - a + (d - c - b + a) * tx) * tz;
}

/** 整数格点白噪声 0..1 */
export const white = (ix: number, iz: number, seed = 0) => hash(ix, iz, seed + 991);

/** mulberry32 + 字符串哈希：每个用途一条独立随机流 */
export function rngFactory(seed: number) {
  return (stream: string) => {
    let h = seed ^ 0x9e3779b9;
    for (let i = 0; i < stream.length; i++) h = Math.imul(h ^ stream.charCodeAt(i), 0x85ebca6b);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
}
