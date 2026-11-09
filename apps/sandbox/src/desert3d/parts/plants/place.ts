// 植物摆放：飞镖式泊松盘（每株占一个圆），按区域规则过滤。
import { COURT, FENCE, ISLAND, PATH } from '../../layout';
import { pathDist as trailDist } from '../court/ground';
import { onIsland } from '../island';
import type { Rnd } from './kit';

export interface Spot {
  x: number;
  z: number;
  /** 占地半径（根部），用来互相避让 */
  r: number;
  species: string;
  /** 允许贴着围栏/铺面边缘（荒废的长进来） */
  edge?: boolean;
}

const FENCE_CLEAR = 0.8;

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** 到步道中线的距离（岛东南角 → 入口；用地形里的折线，再和直线取近的） */
export function pathDist(x: number, z: number) {
  return Math.min(trailDist(x, z), segDist(x, z, PATH.arrive.x, PATH.arrive.z, PATH.gate.x, PATH.gate.z));
}

/** 到岛边的距离 */
export function edgeDist(x: number, z: number) {
  return Math.min(ISLAND.x1 - Math.abs(x), ISLAND.z1 - Math.abs(z));
}

/** 普通植物能不能长在这里（占地半径 r） */
export function openGround(x: number, z: number, r: number) {
  if (!onIsland(x, z, r + 0.35)) return false;
  // 围栏外留 0.8 米
  if (Math.abs(x) < FENCE.hw + FENCE_CLEAR + r && Math.abs(z) < FENCE.hl + FENCE_CLEAR + r) return false;
  // 步道两边各 0.6 米
  if (pathDist(x, z) < 0.6 + r + 0.15) return false;
  if (Math.hypot(x - PATH.gate.x, z - PATH.gate.z) < 1.6 + r) return false;
  return true;
}

/** 荒废的边缘带：铺面外沿和围栏脚下（不进打球区：双打线外 2 米以上，门口和长椅那里留空） */
export function edgeBand(x: number, z: number, r: number) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax > FENCE.hw + 0.5 || az > FENCE.hl + 0.5) return false;
  const nearSide = ax > COURT.padHw - 0.7;
  const nearEnd = az > COURT.padHl - 0.9;
  if (!nearSide && !nearEnd) return false;
  if (x > 0 && Math.abs(z - FENCE.gateZ) < FENCE.gateW / 2 + 0.8) return false;
  if (x > 0 && z > PATH.bench.z - 1.6 && z < PATH.bench.z + 1.6) return false;
  return true;
}

export class Field {
  spots: Spot[] = [];

  free(x: number, z: number, r: number, k = 1) {
    for (const s of this.spots) {
      const d = (s.r + r) * k;
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < d * d) return false;
    }
    return true;
  }

  /**
   * 撒 n 株：gen 给候选点，ok 判区域，k 是间距系数（>1 更稀）。返回实际撒下的。
   */
  scatter(
    rnd: Rnd,
    species: string,
    n: number,
    r: number,
    gen: () => [number, number],
    opts: { k?: number; ok?: (x: number, z: number, r: number) => boolean; tries?: number; edge?: boolean } = {},
  ): Spot[] {
    const ok = opts.ok ?? openGround;
    const out: Spot[] = [];
    const tries = (opts.tries ?? 40) * n;
    for (let t = 0; t < tries && out.length < n; t++) {
      const [x, z] = gen();
      if (!ok(x, z, r) || !this.free(x, z, r, opts.k ?? 1)) continue;
      const s: Spot = { x, z, r, species, edge: opts.edge };
      this.spots.push(s);
      out.push(s);
    }
    return out;
  }
}

/** 全岛均匀候选 */
export const anywhere = (rnd: Rnd) => (): [number, number] => [
  ISLAND.x0 + rnd() * (ISLAND.x1 - ISLAND.x0),
  ISLAND.z0 + rnd() * (ISLAND.z1 - ISLAND.z0),
];

/** 围绕一点的高斯候选 */
export const around = (rnd: Rnd, cx: number, cz: number, sd: number) => (): [number, number] => {
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * sd;
  return [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
};

/** 靠岛边（多石的坡）的候选：离岛边 band 米以内 */
export const nearEdge = (rnd: Rnd, band: number) => {
  const any = anywhere(rnd);
  return (): [number, number] => {
    for (let i = 0; i < 50; i++) {
      const p = any();
      if (edgeDist(p[0], p[1]) < band) return p;
    }
    return any();
  };
};
