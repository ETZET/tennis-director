// 确定性的值噪声（不走随机流，地形高度要能被任何部件随时查询，和种子无关）。
function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 0..1 的二维值噪声 */
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

/** 0..1 的分形噪声 */
export function fbm(x: number, z: number, seed = 0, oct = 4): number {
  let v = 0;
  let amp = 0.5;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    v += vnoise(x, z, seed + o * 17) * amp;
    tot += amp;
    amp *= 0.5;
    x *= 2.03;
    z *= 2.03;
  }
  return v / tot;
}

/** 整数格点上的白噪声 0..1 */
export const white = (ix: number, iz: number, seed = 0) => hash(ix, iz, seed + 991);

export const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
