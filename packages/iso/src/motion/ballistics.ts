import type { XYZ } from '@td/shared';

/** 重力加速度 m/s² */
export const G = 9.8;
/** 球半径 m */
export const BALL_R = 0.08;

/** 从 p0 出发、dur 秒后正好落到 p1 的初速度（只受重力）。 */
export function arcVelocity(p0: XYZ, p1: XYZ, dur: number): XYZ {
  return { x: (p1.x - p0.x) / dur, y: (p1.y - p0.y + 0.5 * G * dur * dur) / dur, z: (p1.z - p0.z) / dur };
}

/** 场地局部坐标里的矩形边界（围网）。 */
export interface Bounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * 按 60Hz 积分一颗球的弹跳和滚动，直到停下或 9 秒。
 * 返回扁平的坐标数组 [x,y,z, x,y,z, ...]，每 1/60 秒一个点。
 * 碰到边界（围网）会减速反弹。
 */
export function simulateBounce(p: XYZ, v: XYZ, b?: Bounds | null): number[] {
  const dt = 1 / 60;
  const pts: number[] = [];
  let { x, y, z } = p;
  let { x: vx, y: vy, z: vz } = v;
  let rolling = false;
  for (let i = 0; i < 60 * 9; i++) {
    pts.push(x, y, z);
    if (!rolling) vy -= G * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    if (b) {
      if (x > b.x1) {
        x = b.x1;
        vx = -Math.abs(vx) * 0.2;
        vz *= 0.6;
      }
      if (x < b.x0) {
        x = b.x0;
        vx = Math.abs(vx) * 0.2;
        vz *= 0.6;
      }
      if (z > b.z1) {
        z = b.z1;
        vz = -Math.abs(vz) * 0.2;
        vx *= 0.6;
      }
      if (z < b.z0) {
        z = b.z0;
        vz = Math.abs(vz) * 0.2;
        vx *= 0.6;
      }
    }
    if (y <= BALL_R) {
      y = BALL_R;
      if (!rolling && -vy > 1.1) {
        vy = -vy * 0.55;
        vx *= 0.75;
        vz *= 0.75;
      } else {
        rolling = true;
        vy = 0;
      }
    }
    if (rolling) {
      const sp = Math.hypot(vx, vz);
      const ns = Math.max(0, sp - 2.2 * dt);
      if (sp > 1e-4) {
        vx *= ns / sp;
        vz *= ns / sp;
      }
      if (ns < 0.04) {
        pts.push(x, y, z);
        break;
      }
    }
  }
  return pts;
}
