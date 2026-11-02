/**
 * 按坐标取值的噪声（不消耗种子随机流）：地面的色块、沙丘和群山的起伏用它，
 * 相邻格子颜色连续，不再是一格一格跳色的棋盘。
 */

/** 整数格点的哈希，0..1 */
export function hash2(x: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 平滑的值噪声，0..1 */
export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 几层值噪声叠加，0..1 */
export function fbm(x: number, z: number, octaves = 3): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** 山脊噪声：尖的山脊、缓的山谷，0..1 */
export function ridged(x: number, z: number): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    let v = 1 - Math.abs(vnoise(x * f + i * 3.1, z * f + i * 7.7) * 2 - 1);
    v *= v;
    s += v * a;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}
