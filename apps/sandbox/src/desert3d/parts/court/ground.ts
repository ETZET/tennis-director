// 地台顶面的高度场和轮廓：纯函数，任何部件都可以查（groundY）。
// 球场铺面和"到达点 → 大门"的步道一带保持 y≈0；越往岛边越起伏（沙丘、风纹），北端有一条干河沟。
import { COURT, ISLAND, PATH } from '../../layout';
import { fbm, sstep, vnoise } from './noise';

/** 到硬地铺面矩形的有符号距离（外正内负） */
export function padDist(x: number, z: number): number {
  const dx = Math.abs(x) - COURT.padHw;
  const dz = Math.abs(z) - COURT.padHl;
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(dx, dz), 0);
}

/** 到步道中线（到达点 → 大门，中间拐一下）的距离 */
const PATH_PTS = [PATH.arrive, { x: 12.6, z: 12 }, { x: 11.2, z: 4 }, PATH.gate];
export function pathDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < PATH_PTS.length - 1; i++) {
    const a = PATH_PTS[i];
    const b = PATH_PTS[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    best = Math.min(best, Math.hypot(x - a.x - abx * t, z - a.z - abz * t));
  }
  return best;
}
export const PATH_POINTS = PATH_PTS;

/** 干河沟中线 z（在岛北端横穿） */
export const washZ = (x: number) => -22.6 + 1.5 * Math.sin(x * 0.27 + 1) + 0.5 * Math.sin(x * 0.71 + 2);

/** 风向（主风，沙丘脊和风纹垂直于它） */
const WX = 0.916;
const WZ = 0.4;

/** 到岛边（矩形）的距离 */
export const edgeDist = (x: number, z: number) => Math.min(x - ISLAND.x0, ISLAND.x1 - x, z - ISLAND.z0, ISLAND.z1 - z);

/** 地台顶面高度 */
export function groundY(x: number, z: number): number {
  const dPad = padDist(x, z);
  const dPath = pathDist(x, z) - 1.2;
  // 铺面边上的沙堆（风吹来的沙贴着铺面边沿堆起来）
  const berm = dPad > 0 ? 0.09 * (dPad / 0.5) * Math.exp(1 - dPad / 0.5) : 0;
  const flat = sstep(0.4, 3.2, Math.min(dPad, dPath));
  if (flat <= 0) return berm;
  let h = (fbm(x * 0.11, z * 0.11, 3) - 0.5) * 0.7;
  // 岛边的沙丘：脊垂直于风
  const edge = edgeDist(x, z);
  const ek = 1 - sstep(1.5, 8, edge);
  const s = x * WX + z * WZ;
  const t = -x * WZ + z * WX;
  const warp = vnoise(t * 0.15, s * 0.05, 5) * 4;
  const ridge = Math.sin(s * 0.75 + warp);
  const dune = (0.5 + 0.5 * ridge) ** 2 * 0.55 * (0.5 + vnoise(t * 0.12, s * 0.1, 9));
  h += ek * dune;
  // 干河沟
  const wd = Math.abs(z - washZ(x));
  h -= 0.38 * (1 - sstep(0.7, 2.0, wd));
  h += 0.06 * sstep(1.6, 2.2, wd) * (1 - sstep(2.2, 3.0, wd));
  return berm + flat * h;
}

/** 岛轮廓：四条边各自往里收的距离（0..~1.3 米），沿边的参数 t 是世界坐标 */
export function edgeInset(side: 0 | 1 | 2 | 3, t: number): number {
  const n = vnoise(t * 0.35, side * 13.7, 21) * 0.8 + vnoise(t * 1.1, side * 7.1, 22) * 0.35;
  // 角上倒一点
  const [lo, hi] = side < 2 ? [ISLAND.z0, ISLAND.z1] : [ISLAND.x0, ISLAND.x1];
  const c = Math.min(t - lo, hi - t);
  const cham = Math.max(0, 2.2 - c) * 0.7;
  return n + cham;
}

/** 把规则网格上的点（矩形内）挤到不规则轮廓里 */
export function warpToOutline(x: number, z: number): [number, number] {
  const fall = (d: number) => {
    const k = Math.max(0, 1 - d / 4);
    return k * k;
  };
  let nx = x;
  let nz = z;
  nx += edgeInset(0, z) * fall(x - ISLAND.x0); // 西
  nx -= edgeInset(1, z) * fall(ISLAND.x1 - x); // 东
  nz += edgeInset(2, x) * fall(z - ISLAND.z0); // 北
  nz -= edgeInset(3, x) * fall(ISLAND.z1 - z); // 南
  return [nx, nz];
}

/** 粗略判断：点是否在不规则轮廓里（留 margin 米） */
export function onIsland(x: number, z: number, margin = 0): boolean {
  return (
    x - ISLAND.x0 > edgeInset(0, z) + margin &&
    ISLAND.x1 - x > edgeInset(1, z) + margin &&
    z - ISLAND.z0 > edgeInset(2, x) + margin &&
    ISLAND.z1 - z > edgeInset(3, x) + margin
  );
}
