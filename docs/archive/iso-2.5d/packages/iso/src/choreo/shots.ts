import { clamp, hdist, type XYZ, type XZ } from '@td/shared';
import type { Ball } from '../motion/ball';
import { arcVelocity, BALL_R, type Bounds, G } from '../motion/ballistics';
import { worldPos } from '../people/parts';
import type { Person } from '../people/person';
import type { StrokeName } from '../people/poses';
import type { CourtFrame } from '../world/frame';
import type { Scheduler } from './scheduler';

/**
 * 击球演出的原子动作。数学在场地局部坐标里做（L 结尾的函数），输出是世界坐标的轨迹。
 */

export interface ChoreoContext {
  readonly sched: Scheduler;
  groundY(x: number, z: number): number;
}

export const forwardVec = (yaw: number): XZ => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const rightVec = (yaw: number): XZ => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });
export const EAST = Math.PI / 2;
export const WEST = -Math.PI / 2;

/** 这一拍能否过网（网高 h）。 */
export function netClearL(P0: XYZ, B: XYZ, T: number, h: number): boolean {
  if (P0.x > 0 === B.x > 0) return true;
  const s = P0.x / (P0.x - B.x);
  const t = s * T;
  const vy = (B.y - P0.y + 0.5 * G * T * T) / T;
  return P0.y + vy * t - 0.5 * G * t * t > h;
}

/** 以给定水平速度飞行所需时间；过不了网就慢慢抬高弧线。 */
export function flightL(P0: XYZ, B: XYZ, speed: number, h = 1.1): number {
  let T = hdist(P0, B) / speed;
  for (let k = 0; k < 10 && !netClearL(P0, B, T, h); k++) T *= 1.1;
  return T;
}

/** 一拍好球：飞到落点 B，再弹到击球点 P2。返回 P2（局部、世界）和到达 P2 的时刻。 */
export function shotL(
  fr: CourtFrame,
  ball: Ball,
  P0: XYZ,
  B: XYZ,
  t0: number,
  speed: number,
  cy: number,
  cont: number,
  h: number,
): { P2: XYZ; P2w: XYZ; tC: number } {
  const T1 = flightL(P0, B, speed, h);
  const tB = ball.arc(fr.w(P0), fr.w(B), t0, T1);
  const d = hdist(P0, B);
  const P2 = { x: B.x + ((B.x - P0.x) / d) * cont, y: cy, z: B.z + ((B.z - P0.z) / d) * cont };
  return { P2, P2w: fr.w(P2), tC: ball.arc(fr.w(B), fr.w(P2), tB, cont / ((d / T1) * 0.68)) };
}

/** 一拍没人接的球：飞到 B 后自己弹跳滚动。返回落地时刻。 */
export function awayL(fr: CourtFrame, ball: Ball, P0: XYZ, B: XYZ, t0: number, T1: number, b: Bounds): number {
  const tB = ball.arc(fr.w(P0), fr.w(B), t0, T1);
  const v = arcVelocity(P0, B, T1);
  ball.simLocal(fr, B, { x: v.x * 0.72, y: -(v.y - G * T1) * 0.58, z: v.z * 0.72 }, tB, b);
  return tB;
}

/** 下网：飞到网上 N 点，然后掉下滚开。 */
export function netL(fr: CourtFrame, ball: Ball, P0: XYZ, N: XYZ, t0: number, speed: number, b: Bounds): number {
  const tN = ball.arc(fr.w(P0), fr.w(N), t0, hdist(P0, N) / speed);
  const dx = Math.sign(N.x - P0.x);
  ball.simLocal(fr, { x: N.x - dx * 0.1, y: N.y, z: N.z }, { x: -dx * 0.9, y: 0, z: 0 }, tN, b);
  return tN;
}

/** 围网内侧的边界，球碰到会弹回。 */
export const penBounds = (fr: CourtFrame): Bounds => ({
  x0: -fr.hx + 0.12,
  x1: fr.hx - 0.12,
  z0: -fr.hz + 0.12,
  z1: fr.hz - 0.12,
});

/** 球员身侧的击球点。side=1 正手，-1 反手。 */
export function contactPt(ctx: ChoreoContext, p: Person, side: number, y: number): XYZ {
  const lock = p.lock ?? 0;
  const f = forwardVec(lock);
  const r = rightVec(lock);
  const R = p.reach;
  return {
    x: p.pos.x + r.x * side * R + f.x * 0.4,
    y: ctx.groundY(p.pos.x, p.pos.z) + y,
    z: p.pos.z + r.z * side * R + f.z * 0.4,
  };
}

/** 来球在身体哪一侧。 */
export function pickSide(p: Person, P2w: XYZ): 1 | -1 {
  const r = rightVec(p.lock ?? 0);
  return (P2w.x - p.pos.x) * r.x + (P2w.z - p.pos.z) * r.z > -0.3 ? 1 : -1;
}

/** 跑到能在 tC 时刻击中 P2w 的位置，并排好挥拍。 */
export function chase(p: Person, P2w: XYZ, t: number, tC: number, side: number, stroke: StrokeName): void {
  const lock = p.lock ?? 0;
  const f = forwardVec(lock);
  const r = rightVec(lock);
  const R = p.reach;
  const sx = P2w.x - r.x * side * R - f.x * 0.4;
  const sz = P2w.z - r.z * side * R - f.z * 0.4;
  p.clearMoves();
  const d = Math.hypot(sx - p.pos.x, sz - p.pos.z);
  const avail = Math.max(0.25, tC - t - 0.12);
  p.go(sx, sz, clamp(d / avail, 0.8, 6.5));
  p.setStroke(stroke, tC);
}

/** 自抛自打：球从左手落地弹起，再挥拍。 */
export function dropFeed(
  ctx: ChoreoContext,
  p: Person,
  ball: Ball,
  t: number,
  stroke: StrokeName,
  onHit: (C: XYZ, t: number) => void,
): void {
  p.clearMoves();
  const C = contactPt(ctx, p, 1, stroke === 'dk' ? 0.55 : 0.88);
  ball.holdAt(p.handL);
  const tD = t + 0.6;
  ctx.sched.at(tD, (tt) => {
    const hp = worldPos(p.handL);
    const Gp = { x: C.x, y: ctx.groundY(C.x, C.z) + BALL_R, z: C.z };
    const t1 = ball.arc(hp, Gp, tt, 0.4);
    ball.arc(Gp, C, t1, 0.38);
  });
  const tc = tD + 0.78;
  p.setStroke(stroke, tc);
  ctx.sched.at(tc, (tt) => onHit(C, tt));
}

/** 捡球：按最近邻顺序把球一个个捡起来，然后回到 home。 */
export function collect(
  ctx: ChoreoContext,
  p: Person,
  list: readonly Ball[],
  home: XZ,
  done?: (t: number) => void,
): void {
  p.clearMoves();
  const lock = p.lock;
  p.lock = null;
  let cx = p.pos.x;
  let cz = p.pos.z;
  const rem = list.filter((b) => b.inUse);
  while (rem.length) {
    let bi = 0;
    let bd = 1e9;
    rem.forEach((b, i) => {
      const d = Math.hypot(b.m.position.x - cx, b.m.position.z - cz);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const b = rem.splice(bi, 1)[0] as Ball;
    const bx = b.m.position.x;
    const bz = b.m.position.z;
    const d = Math.max(0.01, Math.hypot(bx - cx, bz - cz));
    const sx = bx - ((bx - cx) / d) * 0.35;
    const sz = bz - ((bz - cz) / d) * 0.35;
    p.go(sx, sz, 1.6);
    p.call(() => {
      p.gesture('hand', ctx.sched.now, 0.5);
    });
    p.wait(0.5);
    p.call(() => b.release());
    cx = sx;
    cz = sz;
  }
  p.go(home.x, home.z, 1.6);
  p.call((t) => {
    p.lock = lock;
    done?.(t);
  });
}
