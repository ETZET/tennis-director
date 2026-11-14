// 果岭推杆的场地（纯数据 + 纯函数，测试也用）：clubgolf 第 7 洞的果岭（layout.ts 的 GREEN，椭圆 7.2 × 5.6 米 + 一圈 0.6 米的果岭边）、
// 两个沙坑、东边的水塘、果岭岛的球道草和一圈长草，外面是砂石地（界外）。
// 果岭在 terrain 里是平的：坡是这里定的一整块（九个洞共用一个果岭，打几洞就摸熟了）——
// 整体往东南（水塘那边）低；正中一道南北向的"脊"；西南一个"碗"（球往里溜）；东北一个"鼓包"。
import { BUNKERS, GOLF_POND, GREEN, ISLAND_GREEN, POND_RIM, ROUGH_W } from '../../clubgolf/layout';
import type { Env, Slope, Surface, V2 } from './rules';

export { GREEN };

/** 果岭的形（米：每米升多少；鼓包 h > 0、碗 h < 0） */
export const SLOPE: Slope = {
  cx: GREEN.x,
  cz: GREEN.z,
  // 往东（+x）、往南（+z）低：水塘在东南
  gx: -0.016,
  gz: -0.009,
  bumps: [
    // 脊：果岭正中偏东，南北向
    { x: -42.5, z: 63.0, sx: 0.55, sz: 2.2, h: 0.045 },
    // 碗：西南
    { x: -44.9, z: 63.9, sx: 0.9, sz: 0.8, h: -0.05 },
    // 鼓包：东北
    { x: -40.8, z: 61.5, sx: 0.75, sz: 0.7, h: 0.045 },
  ],
};

export interface HoleDef {
  /** 第几洞的小标题 */
  name: string;
  par: number;
  ball: V2;
  cup: V2;
  /** 建议时间（秒）：这么快推进有快手奖励 */
  soft: number;
  /** 开局提示 */
  tip: string;
}

/** 九个洞：一洞一个杯位、一个开球点，越往后越长、坡越多；第 5、9 洞从果岭外长推（标准杆 3），第 7 洞从球道边推（短，标准杆 2） */
export const HOLES: HoleDef[] = [
  {
    name: '热身',
    par: 2,
    ball: [-44.0, 61.5],
    cup: [-44.7, 63.6],
    soft: 14,
    tip: '往碗里推，球会自己往下溜',
  },
  {
    name: '过脊',
    par: 2,
    ball: [-44.9, 62.2],
    cup: [-41.6, 62.9],
    soft: 15,
    tip: '中间一道脊：上去慢、下来快',
  },
  {
    name: '下坡快',
    par: 2,
    ball: [-41.0, 60.9],
    cup: [-41.5, 64.4],
    soft: 15,
    tip: '一路下坡，轻一点',
  },
  {
    name: '侧坡',
    par: 2,
    ball: [-40.4, 63.4],
    cup: [-44.4, 62.0],
    soft: 16,
    tip: '球会往碗那边拐：瞄高一点',
  },
  {
    name: '果岭外长推',
    par: 3,
    ball: [-43.6, 68.8],
    cup: [-43.0, 61.4],
    soft: 24,
    tip: '球道草和果岭边阻力大，要多给力',
  },
  {
    name: '塘边',
    par: 2,
    ball: [-45.7, 62.9],
    cup: [-40.2, 63.3],
    soft: 17,
    tip: '杯后面就是水塘，别推过头',
  },
  {
    name: '沙坑旁',
    par: 2,
    ball: [-46.4, 58.9],
    cup: [-45.0, 64.3],
    soft: 20,
    tip: '果岭往西沙坑那边低',
  },
  {
    name: '驼峰',
    par: 2,
    ball: [-40.2, 60.9],
    cup: [-43.6, 64.9],
    soft: 18,
    tip: '要翻过鼓包和脊，两道弯',
  },
  {
    name: '最后一洞',
    par: 3,
    ball: [-36.9, 59.9],
    cup: [-45.3, 62.4],
    soft: 26,
    tip: '最长的一推：从东边球道一路过脊',
  },
];

export const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0);

const inEll = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) =>
  ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1;

/** 点在多边形里（射线法） */
export function inPoly(x: number, z: number, poly: readonly V2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 点到多边形边的最近距离 */
function polyDist(x: number, z: number, poly: readonly V2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax;
    const ez = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez)));
    best = Math.min(best, Math.hypot(x - (ax + ex * t), z - (az + ez * t)));
  }
  return best;
}

/** 这一点是什么地面（同 clubgolf/terrain.ts 画的：塘沿的石头算水，长草一圈 1 米，外面是砂石地 = 界外） */
export function surfaceAt(x: number, z: number): Surface {
  if (inEll(x, z, GOLF_POND.x, GOLF_POND.z, GOLF_POND.rx + POND_RIM, GOLF_POND.rz + POND_RIM)) return 'water';
  for (const b of BUNKERS) if (inEll(x, z, b.x, b.z, b.rx, b.rz)) return 'sand';
  if (inEll(x, z, GREEN.x, GREEN.z, GREEN.rx, GREEN.rz)) return 'green';
  if (inEll(x, z, GREEN.x, GREEN.z, GREEN.rx + GREEN.collar, GREEN.rz + GREEN.collar)) return 'fringe';
  if (inPoly(x, z, ISLAND_GREEN)) return 'fairway';
  if (polyDist(x, z, ISLAND_GREEN) <= ROUGH_W) return 'rough';
  return 'out';
}

export const envFor = (h: HoleDef, cup: V2 = h.cup): Env => ({ surface: surfaceAt, slope: SLOPE, cup });
