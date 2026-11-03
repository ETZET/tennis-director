import { clamp, hdist, lerp, type XYZ, type XZ } from '@td/shared';
import type { Node } from '../core/graph';
import type { Ball } from '../motion/ball';
import { arcVelocity, G } from '../motion/ballistics';
import type { Person } from '../people/person';
import type { StrokeName } from '../people/poses';
import { CourtFrame } from '../world/frame';
import { DULL, PICKLE_GREEN } from './looks';
import { mkBottle, mkCap } from './props';
import { type Act, BR, fwd, rgt } from './runtime';

/**
 * 活动之间共用的演出片段：击球轨迹、追球、喘气累倒、教练照看、补水、帽子被吹飞、乌鸦偷东西、路人。
 * 全部是局部坐标（球网在 x=0）。
 */

/** 局部坐标本身（给 Ball.simLocal 用） */
const frames = new WeakMap<Act, CourtFrame>();
function idf(a: Act): CourtFrame {
  let f = frames.get(a);
  if (!f) {
    f = new CourtFrame(0, -0.07, 0, 0, Math.max(-a.b.x0, a.b.x1), Math.max(-a.b.z0, a.b.z1));
    frames.set(a, f);
  }
  return f;
}

/* ---------------- 球 ---------------- */

/** 这一拍能不能过网（网在 x=NX，高 h）。 */
function netOK(P0: XYZ, B: XYZ, T: number, NX: number, h: number): boolean {
  if ((P0.x - NX) * (B.x - NX) >= 0) return true;
  const s = (NX - P0.x) / (B.x - P0.x);
  const t = s * T;
  const vy = (B.y - P0.y + 0.5 * G * T * T) / T;
  return P0.y + vy * t - 0.5 * G * t * t > h;
}

/** 以给定水平速度飞到 B 的时间；过不了网就把弧线抬高。NX 为 null 表示没有网。 */
export function fly(P0: XYZ, B: XYZ, spd: number, NX: number | null = 0, h = 1.12): number {
  let T = Math.max(0.15, hdist(P0, B) / spd);
  if (NX != null) for (let k = 0; k < 12 && !netOK(P0, B, T, NX, h); k++) T *= 1.1;
  return T;
}

/** 落地时下雨或落进水坑就溅水 */
function landFx(a: Act, E: XYZ, t: number): void {
  a.at(t - a.now, () => {
    if (a.rain || a.puddles.some((q) => Math.abs(q.x - E.x) < q.w / 2 && Math.abs(q.z - E.z) < q.d / 2))
      a.fx.splash(E.x, a.gy(E.x, E.z) + 0.02, E.z, 6);
  });
}

export interface Shot {
  /** 弹起后的击球点 */
  P2: XYZ;
  /** 到 P2 的时刻、落地时刻 */
  tC: number;
  tB: number;
  dir: XZ;
  /** 实际落点（有风偏） */
  E: XYZ;
}

/** 一拍好球：飞到 B（有风就偏），弹起来到击球点 P2。Hollow Creek 偶尔坏弹跳。 */
export function shot(
  a: Act,
  ball: Ball,
  P0: XYZ,
  B: XYZ,
  t0: number,
  spd: number,
  cy: number,
  cont: number,
  NX: number | null = 0,
  h = 1.12,
): Shot {
  const T1 = fly(P0, B, spd, NX, h);
  const t1 = ball.arc(P0, B, t0, T1, a.drift());
  const E = ball.lastEnd;
  const d = Math.max(0.01, hdist(P0, E));
  const dir = { x: (E.x - P0.x) / d, z: (E.z - P0.z) / d };
  const P2 = { x: E.x + dir.x * cont, y: cy, z: E.z + dir.z * cont };
  if (a.venue === 'hollow' && a.chance(0.11)) {
    P2.z += a.pick([-1, 1]) * a.rr(1.2, 1.9);
    P2.x -= dir.x * 0.6;
    P2.y = a.rr(0.4, 1.4);
    a.at(t1 - a.now, () => {
      a.fx.dust(E.x, 0.03, E.z, 8);
      a.pop(a.t('badBounce'), { x: E.x, y: 0.7, z: E.z }, { fg: '#ffb070', h: 0.48 });
    });
  }
  landFx(a, E, t1);
  const tC = ball.arc(E, P2, t1, cont / ((d / T1) * 0.68));
  return { P2, tC, tB: t1, dir, E };
}

/** 从 p 点以速度 v 弹跳滚动（局部坐标），返回停下的时刻。 */
export function bounce(a: Act, ball: Ball, p: XYZ, v: XYZ, t0: number): number {
  return ball.simLocal(idf(a), p, v, t0, a.b);
}

/** 没接到：球穿过去，弹两下滚走。 */
export function through(a: Act, ball: Ball, P2: XYZ, tC: number, dir: XZ, len = 3): number {
  const Q = { x: P2.x + dir.x * len, y: BR, z: P2.z + dir.z * len };
  const t = ball.arc(P2, Q, tC, 0.45);
  return ball.simLocal(idf(a), Q, { x: dir.x * 2.2, y: 1.3, z: dir.z * 2.2 }, t, a.b);
}

/** 没人接的一拍：飞到 B 落地后自己弹跳滚动。返回落地时刻。 */
export function away(a: Act, ball: Ball, P0: XYZ, B: XYZ, t0: number, T1: number): number {
  const t1 = ball.arc(P0, B, t0, T1, a.drift());
  const E = ball.lastEnd;
  const v = arcVelocity(P0, B, T1);
  const vyE = v.y - G * T1;
  ball.simLocal(
    idf(a),
    { x: E.x, y: BR, z: E.z },
    { x: v.x * 0.7, y: Math.max(0.5, -vyE * 0.55), z: v.z * 0.7 },
    t1,
    a.b,
  );
  landFx(a, E, t1);
  return t1;
}

/** 下网：撞到网上 N 点，掉下来滚开。 */
export function intoNet(a: Act, ball: Ball, P0: XYZ, N: XYZ, t0: number, spd: number): number {
  const t1 = ball.arc(P0, N, t0, Math.max(0.2, hdist(P0, N) / spd));
  const dx = Math.sign(N.x - P0.x) || 1;
  const Q = { x: N.x - dx * 0.25, y: BR, z: N.z };
  const t2 = ball.arc(N, Q, t1, Math.sqrt((2 * Math.max(0.05, N.y - BR)) / G) + 0.05);
  return ball.simLocal(idf(a), Q, { x: -dx * 0.6, y: 1.0, z: 0 }, t2, a.b);
}

/* ---------------- 追球 ---------------- */

/** 来球在身体哪一侧：1 正手，-1 反手 */
export function sideOf(p: Person, P: XZ): 1 | -1 {
  const r = rgt(p.lock ?? p.yaw);
  return (P.x - p.pos.x) * r.x + (P.z - p.pos.z) * r.z > -0.3 ? 1 : -1;
}

/** 在 P 点击球要站的位置 */
export function standFor(p: Person, P: XZ, side: number, reach = 1): XZ {
  const L = p.lock ?? p.yaw;
  const f = fwd(L);
  const r = rgt(L);
  return { x: P.x - r.x * side * reach - f.x * 0.4, z: P.z - r.z * side * reach - f.z * 0.4 };
}

/** 跑到能在 tC 击中 P2 的位置并排好挥拍；跑不到返回 false。 */
export function chase(
  p: Person,
  P2: XZ,
  t: number,
  tC: number,
  side: number,
  stroke: StrokeName,
  vmax = 7,
  reach = 1,
): boolean {
  const s = standFor(p, P2, side, reach);
  p.clearMoves();
  const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
  const av = Math.max(0.2, tC - t - 0.1);
  p.go(s.x, s.z, clamp(d / av / Math.max(0.2, p.speedK), 0.8, vmax));
  p.setStroke(stroke, tC);
  return d <= vmax * p.speedK * av + 0.1;
}

/* ---------------- 累 ---------------- */

/** 扶膝喘气；疲劳很高时可能直接累倒。 */
export function pant(a: Act, p: Person, done?: (how: 'pant' | 'collapse') => void): 'pant' | 'collapse' {
  const prev = p.base;
  p.clearMoves();
  p.stroke = null;
  p.base = 'handsKnees';
  p.panting = true;
  a.pop(a.t('huff'), p, { fg: '#cfe8ff', h: 0.42 });
  if (a.f > 0.84 && a.chance(0.55)) {
    a.at(1.0, () => {
      p.base = prev;
      p.panting = false;
      a.fall(p, 'back', 3.0);
      a.dizzy(p, 2.8);
      a.pop(a.t('collapse'), p, { fg: '#cfe8ff', h: 0.48 });
    });
    a.at(4.3, () => done?.('collapse'));
    return 'collapse';
  }
  a.at(2.4, () => {
    p.base = prev;
    p.panting = false;
    done?.('pant');
  });
  return 'pant';
}

/** 有人累倒了：好教练跑过去递水，差教练在原地吼。 */
export function coachHelp(a: Act, coach: Person, p: Person): void {
  const home = { x: coach.pos.x, z: coach.pos.z };
  const lock = coach.lock;
  const watch = coach.watch;
  if (a.c >= 3) {
    coach.clearMoves();
    coach.lock = null;
    coach.watch = null;
    if (coach.phone) coach.phone.visible = false;
    coach.go(p.pos.x + 0.9, p.pos.z + 0.5, 3.4);
    coach.call(() => {
      coach.watch = p;
      coach.give('L', mkBottle());
      a.gesture(coach, 'hand', 1.4);
      a.pop(a.t(a.c >= 5 ? 'coachWaterSoft' : 'coachWater'), coach, { fg: '#9cf0b4', h: 0.45 });
      a.at(0.5, () => a.emote(p, 'heart', 1.2));
    });
    coach.wait(1.6);
    coach.call(() => {
      coach.take('L');
      coach.watch = null;
    });
    coach.go(home.x, home.z, 2.6);
    coach.call(() => {
      coach.lock = lock;
      coach.watch = watch;
    });
  } else {
    a.gesture(coach, 'argue', 1.6);
    a.pop(a.t(a.c === 1 ? 'coachYell1' : 'coachYell2'), coach, { fg: '#ff6b5a', h: 0.48 });
    a.emote(coach, 'anger', 1.5);
  }
}

/** 酷热：走到场边喝水、往头上浇水，再回来。 */
export function drinkBreak(a: Act, p: Person, spot: XZ, done?: () => void): void {
  const home = { x: p.pos.x, z: p.pos.z };
  const lock = p.lock;
  p.clearMoves();
  p.stroke = null;
  p.lock = null;
  p.go(spot.x, spot.z, 2.2);
  p.call(() => {
    p.give('L', mkBottle(a.pick(['#3aa0d8', '#e84a3a', '#8af08a'])));
    a.gesture(p, 'drink', 1.4);
    a.pop(a.t('hot'), p, { fg: '#ffcf8a', h: 0.42 });
  });
  p.wait(1.5);
  p.call(() => {
    a.gesture(p, 'pour', 1.1);
    a.at(0.35, () => {
      const h = a.lp(p.headTop);
      a.fx.splash(h.x, h.y, h.z, 16);
    });
    a.at(0.6, () => a.pop(a.t('cool'), p, { fg: '#9fdcff', h: 0.42 }));
  });
  p.wait(1.3);
  p.call(() => p.take('L'));
  p.go(home.x, home.z, 2.2);
  p.call(() => {
    p.lock = lock;
    done?.();
  });
}

/** 浇水降温（原地） */
export function pourWater(a: Act, p: Person): void {
  if (p.down) return;
  p.give('L', mkBottle());
  a.gesture(p, 'pour', 1.0);
  a.at(0.35, () => {
    const h = a.lp(p.headTop);
    a.fx.splash(h.x, h.y, h.z, 14);
  });
  a.at(1.1, () => p.take('L'));
}

/** 大风把帽子吹飞，追着跑回来。 */
export function capFly(a: Act, p: Person, home: XZ): void {
  const parts = p.cap;
  if (!parts.length || p.down || !parts[0]?.visible) return;
  const p0 = parts[0] as Node;
  const w = a.lp(p0);
  // 帽子颜色：帽子标记节点（CapMark）和方块都带 color
  const col = (p0 as { color?: string }).color ?? p.o.cap ?? '#ffffff';
  for (const m of parts) m.visible = false;
  const cap = a.own(mkCap(col));
  cap.position.set(w.x, w.y, w.z);
  const b = a.b;
  const to = {
    x: clamp(w.x + a.rr(1.5, 3.5), b.x0 + 0.5, b.x1 - 0.5),
    y: 0.02,
    z: clamp(w.z + a.rr(3, 5), b.z0 + 0.5, b.z1 - 0.5),
  };
  a.pop(a.t('myCap'), p, { fg: '#ffcf8a', h: 0.45 });
  a.emote(p, 'excl', 1.0);
  a.tween(cap, { x: w.x, y: w.y, z: w.z }, to, 1.5, { h: 1.6, spin: 9 });
  const lock = p.lock;
  const watch = p.watch;
  p.clearMoves();
  p.lock = null;
  p.watch = null;
  p.wait(0.3);
  p.go(to.x - 0.4, to.z - 0.4, 4.2);
  p.call(() => a.gesture(p, 'hand', 0.6));
  p.wait(0.5);
  p.call(() => {
    cap.parent?.remove(cap);
    for (const m of parts) m.visible = true;
    a.pop(a.t('gotIt'), p, { fg: '#9cf0b4', h: 0.42 });
  });
  p.go(home.x, home.z, 2.4);
  p.call(() => {
    p.lock = lock;
    p.watch = watch;
  });
}

/* ---------------- 乌鸦 ---------------- */

/** 一只空闲的乌鸦飞下来叼走 obj，飞出画面，过一会儿回来。 */
export function crowGrab(a: Act, obj: Node, onGrab: (beak: Node) => void, label: string, done?: () => void): boolean {
  const c = a.crows.find((k) => !k.busy);
  if (!c) return false;
  c.busy = true;
  c.fly = true;
  const from = c.home;
  const bp = a.lp(obj);
  c.g.rotation.y = Math.atan2(bp.x - from.x, bp.z - from.z);
  a.tween(c.g, from, { x: bp.x, y: Math.max(0.02, bp.y - 0.2), z: bp.z }, 0.9, { h: 1.2 });
  a.at(0.9, () => {
    onGrab(c.beak);
    a.pop(label, { x: bp.x, y: bp.y + 1.1, z: bp.z }, { fg: '#ffcf8a', h: 0.5 });
    const near = a.nearest(
      a.people.filter((p) => !p.userData.passer),
      bp,
    );
    if (near) {
      a.emote(near, 'anger', 1.4);
      a.at(0.35, () => a.pop(a.t('crowShout'), near, { fg: '#ff8a70', h: 0.42 }));
    }
    const out = { x: bp.x + a.rr(-4, 4), y: 9, z: a.b.z0 - 5 };
    c.g.rotation.y = Math.atan2(out.x - bp.x, out.z - bp.z);
    a.tween(c.g, { x: bp.x, y: bp.y, z: bp.z }, out, 2.2, { h: 1 });
    a.at(2.2, () => {
      done?.();
      c.g.position.set(from.x, from.y, from.z);
      c.g.rotation.y = c.yaw;
      c.fly = false;
      c.g.visible = false;
      a.at(a.rr(4, 7), () => {
        c.g.visible = true;
        c.busy = false;
      });
    });
  });
  return true;
}

/** 地上停着、正在淡出的球被乌鸦叼走。 */
export function crowSteal(a: Act): void {
  const now = a.now;
  const ball = a.pool.balls.find((b) => {
    if (!b.inUse || b.hold || b.fadeT == null || !b.segs.length || stolen.has(b)) return false;
    const last = b.segs[b.segs.length - 1];
    return !!last && now >= last.t1 - 0.05;
  });
  if (!ball) return;
  stolen.add(ball);
  ball.fadeT = null;
  const ok = crowGrab(
    a,
    ball.m,
    (beak) => ball.holdAt(beak),
    a.t('crowBall'),
    () => {
      ball.release();
      stolen.delete(ball);
    },
  );
  if (!ok) {
    stolen.delete(ball);
    ball.fadeOut(now + 0.5);
  }
}
const stolen = new WeakSet<Ball>();

/* ---------------- 路人（动画库小岛） ---------------- */

export function passer(a: Act): void {
  const v = a.venue;
  const z = a.b.z1 - 0.2;
  const dir = a.chance(0.5) ? 1 : -1;
  const x0 = dir > 0 ? a.b.x0 : a.b.x1;
  const x1 = dir > 0 ? a.b.x1 : a.b.x0;
  let p: Person;
  let kind: 'walk' | 'pickle' | 'old' = 'walk';
  if (v === 'maple') p = a.person({ x: x0, z, umb: true, shirt: a.pick(['#2a4a7a', '#7c2232', '#3a3a3a', '#e6b03c']) });
  else if (v === 'hollow') {
    if (a.chance(0.5)) {
      p = a.person({ x: x0, z, shirt: PICKLE_GREEN, paddle: '#3a8fd9', umb: true });
      kind = 'pickle';
    } else {
      p = a.person({ x: x0, z, pants: true, hair: '#9a9a96', hairStyle: 'bald', umb: true, shirt: a.pick(DULL) });
      kind = 'old';
    }
  } else p = a.person({ x: x0, z, umb: true });
  p.userData.passer = true;
  const spd = kind === 'old' ? 0.8 : 1.25;
  p.go(lerp(x0, x1, 0.45), z, spd);
  p.call(() => {
    const r = a.rand();
    if (v === 'maple') {
      if (r < 0.6) {
        a.gesture(p, 'wave', 1.2);
        a.pop(a.t('passMaple'), p, { fg: '#ffe9a8', h: 0.4 });
      }
    } else if (kind === 'pickle') {
      if (r < 0.7) a.pop(a.t('passPickle'), p, { fg: '#b8f08a', h: 0.38 });
    } else if (kind === 'old') {
      if (r < 0.5) a.pop(a.t('passOld'), p, { fg: '#c9c9c0', h: 0.38 });
    } else if (r < 0.4) a.gesture(p, 'wave', 1.0);
  });
  p.wait(0.5);
  p.go(x1, z, spd);
  p.call(() => a.remove(p));
}

/* ---------------- 场地的专属桥段和天气 ---------------- */

/** 每个活动都有的环境桥段：天气粒子、枫岭的落叶和下课铃、Hollow Creek 的匹克球声和乌鸦、路人。 */
export function ambient(a: Act, kind: 'court' | 'field' | 'plaza'): void {
  const { b } = a;
  const W = b.x1 - b.x0;
  let bell = a.rr(14, 26);
  let pass = a.rr(3, 9);
  let pk = a.rr(3, 7);
  let crowT = a.rr(7, 12);
  if (a.venue === 'hollow' && !a.crows.length) {
    const perches = a.opts.extras?.perches ?? [
      { x: lerp(b.x0, b.x1, 0.3), y: 2.6, z: b.z0 + 0.05 },
      { x: lerp(b.x0, b.x1, 0.7), y: 2.6, z: b.z0 + 0.05 },
    ];
    for (const q of perches) a.addCrow(q.x, q.y, q.z, a.rr(-0.6, 0.6));
  }
  a.onFrame((dt) => {
    if (dt <= 0) return;
    if (a.wind && a.chance(dt * W * 0.4)) a.fx.leaf(a.rr(b.x0, b.x1), a.rr(0.3, 3), b.z0 + 0.2);
    if (a.heat && a.chance(dt * W * 0.5)) a.fx.shimmer(a.rr(b.x0, b.x1), 0.1, a.rr(b.z0, b.z1));
    if (a.venue === 'maple') {
      if (a.chance(dt * W * 0.06)) a.fx.fall(a.rr(b.x0, b.x1), a.rr(3, 5), a.rr(b.z0, b.z1));
      bell -= dt;
      if (bell <= 0) {
        bell = a.rr(28, 40);
        a.pop(a.t('bell'), { x: (b.x0 + b.x1) / 2, y: 4.4, z: b.z0 + 0.5 }, { fg: '#ffe9a8', h: 0.8, dur: 2.2 });
        a.people
          .filter((p) => !p.down)
          .slice(0, 8)
          .forEach((p, i) => {
            if (a.chance(0.45)) a.at(0.3 + i * 0.1, () => a.emote(p, 'note', 1.2));
          });
      }
    }
    if (a.venue === 'hollow') {
      pk -= dt;
      if (pk <= 0) {
        pk = a.rr(5, 9);
        a.pop(
          a.t('pickleSound'),
          { x: b.x1 - 0.3, y: 1.9, z: a.rr(b.z0 + 1, b.z1 - 1) },
          { fg: '#b8f08a', h: 0.42, dur: 1 },
        );
        if (a.chance(0.3)) {
          const c = a.people.filter((q) => !q.down && !q.userData.passer);
          const p = c.length ? a.pick(c) : null;
          if (p)
            a.at(0.4, () => {
              if (a.chance(0.5)) a.emote(p, 'anger', 1.2);
              else a.pop(a.t('noisy'), p, { fg: '#c9c9c0', h: 0.38 });
            });
        }
      }
      crowT -= dt;
      if (crowT <= 0) {
        crowT = a.rr(9, 16);
        crowSteal(a);
      }
    }
    if (kind !== 'plaza' && a.opts.extras?.passers) {
      pass -= dt;
      if (pass <= 0) {
        pass = a.rr(13, 22);
        passer(a);
      }
    }
  });
}

/** 疲劳文案用的百分比 */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;
