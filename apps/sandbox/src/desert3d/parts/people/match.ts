// 一拨球友的一次来访：走进来 → 放包 → 热身 → 打几分（分与分之间总监扫场）→ 收拾走人。
// 全部写成协程；时间压缩过，一次来访约 60～90 秒。
import * as THREE from 'three';
import { COURT, FENCE, PATH } from '../../layout';
import type { Play, World } from '../../world';
import { type Ball, contactAfterBounce, planShot, R, type Shot, type V3 } from './ball';
import { all, type Co, route, until, wait } from './co';
import { BAGS, randomLook } from './looks';
import { Person, type Pt } from './person';
import { SERVE_CONTACT, SERVE_TOSS } from './pose';
import { buildBag } from './rig';

export interface CourtState {
  phase: Play['phase'];
  /** 每次进入 break 加一；总监扫完、离场后把 doneBreak 设成它 */
  breakId: number;
  breakKind: 'setup' | 'point';
  doneBreak: number;
  now: number;
  ball: Ball;
  /** 总监站哪（球员看他、跟他挥手） */
  director?: Person;
}

interface Player {
  p: Person;
  bag: THREE.Mesh;
  slot: number;
}
interface Team {
  side: 1 | -1;
  ps: Player[];
  back: Person;
  front: Person | null;
  frontHome: Pt;
}

/** 进场 / 离场路线（和 structures 的步道一致） */
const WALK_IN: Pt[] = [
  { x: 13.4, z: 14 },
  { x: 11.6, z: 6 },
];
const SPAWN: Pt = { x: PATH.arrive.x + 0.6, z: PATH.arrive.z + 1.2 };
const faceNet = (side: number) => (side > 0 ? Math.PI : 0);
const benchStand = (i: number): Pt => ({ x: PATH.bench.x - 0.6, z: PATH.bench.z - 0.75 + i * 0.5 });
const benchBag = (i: number) => new THREE.Vector3(PATH.bench.x + 0.3, 0.68, PATH.bench.z - 0.75 + i * 0.5);
const clampIn = (p: Pt): Pt => ({
  x: THREE.MathUtils.clamp(p.x, -FENCE.hw + 0.5, FENCE.hw - 0.5),
  z: THREE.MathUtils.clamp(p.z, -FENCE.hl + 0.5, FENCE.hl - 0.5),
});

export class Match {
  pool: Player[] = [];
  private rnd: () => number;
  private teams: Team[] = [];
  private v = new THREE.Vector3();

  constructor(
    private w: World,
    private cs: CourtState,
  ) {
    this.rnd = w.rng('people:match');
    const lookRnd = w.rng('people:looks');
    for (let i = 0; i < 8; i++) {
      const p = new Person(w, randomLook(lookRnd), { racket: true, seed: i * 1.7 });
      p.visible = false;
      const bag = buildBag(w, BAGS[i % BAGS.length]);
      bag.visible = false;
      w.scene.add(bag);
      this.pool.push({ p, bag, slot: 0 });
    }
  }

  private r(a: number, b: number) {
    return a + (b - a) * this.rnd();
  }

  private *until(t: number): Co {
    while (this.cs.now < t) yield;
  }

  private *arriveAll(ps: Person[], timeout = 30): Co {
    yield* until(() => ps.every((p) => p.arrived), timeout);
  }

  *main(): Co {
    yield* wait(this.r(1.5, 3));
    let lastUsed: Player[] = [];
    for (;;) {
      const doubles = this.rnd() < 0.35;
      const fresh = this.pool.filter((p) => !lastUsed.includes(p));
      // 洗牌挑人
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(this.rnd() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
      const group = fresh.slice(0, doubles ? 4 : 2);
      lastUsed = group;
      yield* this.visit(group);
      yield* wait(this.r(5, 10));
    }
  }

  private carryBag(pl: Player) {
    const b = pl.bag;
    pl.p.rig.torso.add(b);
    b.position.set(0.02, 0.3, -0.2);
    b.rotation.set(0, 0, 0.75);
    b.visible = true;
  }

  private dropBag(pl: Player) {
    const b = pl.bag;
    this.w.scene.add(b);
    b.scale.setScalar(pl.p.rig.scale);
    b.position.copy(benchBag(pl.slot));
    b.rotation.set(0, Math.PI / 2 + this.r(-0.15, 0.15), 0);
  }

  private *visit(group: Player[]): Co {
    const cs = this.cs;
    const doubles = group.length === 4;
    // —— 走进来 ——
    yield* all(
      ...group.map((pl, i) =>
        function* (this: Match): Co {
          pl.slot = i;
          const p = pl.p;
          p.place({ x: SPAWN.x + (i % 2) * 0.5, z: SPAWN.z }, Math.PI);
          p.stance = 'idle';
          p.shuffle = false;
          p.faceYaw = null;
          p.lookAt = null;
          p.act = null;
          p.visible = false;
          this.carryBag(pl);
          pl.bag.visible = false;
          yield* wait(i * 1.1 + this.r(0, 0.4));
          p.visible = true;
          pl.bag.visible = true;
          p.go([...WALK_IN, ...route({ x: PATH.gate.x + 0.5, z: 1 }, benchStand(i))], this.r(2.1, 2.4));
          yield* until(() => p.arrived, 40);
          p.faceYaw = Math.PI / 2;
          yield* wait(0.3);
          p.doAct('bend', 1.1);
          yield* wait(0.55);
          this.dropBag(pl);
          yield* wait(0.6);
        }.call(this),
      ),
    );
    // 跟总监打个招呼
    const first = group[0].p;
    if (cs.director) {
      first.lookAt = cs.director.toWorld(0, 1.5, 0);
      first.doAct('wave', 1.4);
    }

    // —— 分边、走到位置；总监先离场（setup 间歇） ——
    const pick = <T>(a: T[]) => a[Math.floor(this.rnd() * a.length)];
    const sideA = group.filter((_, i) => i % 2 === 0);
    const sideB = group.filter((_, i) => i % 2 === 1);
    const mk = (side: 1 | -1, ps: Player[]): Team => ({
      side,
      ps,
      back: ps[0].p,
      front: ps[1]?.p ?? null,
      frontHome: { x: 2.3 * (pick([1, -1]) as number), z: side * 4.8 },
    });
    this.teams = [mk(1, sideA), mk(-1, sideB)];
    this.beginBreak('setup');
    yield* wait(1.2);
    for (const t of this.teams) {
      t.back.go(route(t.back, { x: this.r(-0.5, 0.5), z: t.side * 11.6 }), 2.6);
      if (t.front) t.front.go(route(t.front, { x: -2.3, z: t.side * 11.6 }), 2.6);
    }
    for (const pl of group) pl.p.lookAt = null;
    yield* this.arriveAll(group.map((g) => g.p));
    for (const t of this.teams) for (const pl of t.ps) pl.p.faceYaw = faceNet(t.side);
    yield* until(() => cs.doneBreak === cs.breakId, 25);
    yield* wait(0.8);

    // —— 热身：底线对打几拍 ——
    this.setRally(true);
    yield* this.rally(this.teams[0], this.teams[1], true, true);
    yield* wait(1.0);
    cs.ball.hide();

    // —— 打分 ——
    const points = 2 + Math.floor(this.rnd() * 2);
    for (let i = 0; i < points; i++) {
      this.beginBreak('point');
      const si = i % 2;
      const st = this.teams[si];
      const rt = this.teams[1 - si];
      const deuce = Math.floor(i / 2) % 2 === 0;
      // 发球方后面的人发球；双打轮换
      if (doubles && i >= 2) {
        for (const t of this.teams) [t.back, t.front] = [t.front!, t.back];
      }
      const sx = st.side * 0.9 * (deuce ? 1 : -1);
      const rx = rt.side * 2.6 * (deuce ? 1 : -1);
      const plan: [Person, Pt][] = [
        [st.back, { x: sx, z: st.side * 12.3 }],
        [rt.back, { x: rx, z: rt.side * 12.0 }],
      ];
      if (st.front) {
        st.frontHome = { x: -Math.sign(sx) * 2.4, z: st.side * 4.6 };
        plan.push([st.front, st.frontHome]);
      }
      if (rt.front) {
        rt.frontHome = { x: -Math.sign(rx) * 2.4, z: rt.side * 6.2 };
        plan.push([rt.front, rt.frontHome]);
      }
      for (const [p, to] of plan) {
        p.stance = 'idle';
        p.shuffle = false;
        p.go(route(p, to), 1.8);
      }
      yield* wait(1.0);
      yield* this.arriveAll(plan.map(([p]) => p));
      for (const [p] of plan) p.faceYaw = faceNet(p.z > 0 ? 1 : -1);
      yield* until(() => cs.doneBreak === cs.breakId, 25);
      yield* wait(0.6);
      this.setRally(false);
      const won = yield* this.rally(st, rt, deuce, false);
      // 赢的挥拳，输的低头
      for (const t of this.teams) {
        for (const pl of t.ps) {
          pl.p.stance = 'idle';
          pl.p.shuffle = false;
          if (t === won) pl.p.doAct(this.rnd() < 0.5 ? 'pump' : 'cheer', this.r(1.1, 1.5));
          else pl.p.doAct('slump', this.r(1.3, 1.7));
        }
      }
      yield* wait(1.7);
      cs.ball.hide();
    }

    // —— 收拾走人 ——
    cs.phase = 'idle';
    for (const pl of group) {
      const p = pl.p;
      p.stance = 'idle';
      p.shuffle = false;
      p.faceYaw = null;
      p.lookAt = null;
    }
    yield* all(
      ...group.map((pl) =>
        function* (this: Match): Co {
          const p = pl.p;
          yield* wait(this.r(0, 1.2));
          p.go(route(p, benchStand(pl.slot)), 1.7);
          yield* until(() => p.arrived, 40);
          p.faceYaw = Math.PI / 2;
          yield* wait(0.3);
          p.doAct('bend', 1.1);
          yield* wait(0.55);
          this.carryBag(pl);
          yield* wait(0.6);
          if (pl.slot === 0 && cs.director) {
            p.lookAt = cs.director.toWorld(0, 1.5, 0);
            p.doAct('wave', 1.3);
            yield* wait(1.3);
            p.lookAt = null;
          }
          p.faceYaw = null;
          p.go([...route(p, { x: PATH.gate.x + 0.5, z: 1 }), ...WALK_IN.slice().reverse(), SPAWN], this.r(2.1, 2.4));
          yield* until(() => p.arrived, 40);
          p.visible = false;
          pl.bag.visible = false;
        }.call(this),
      ),
    );
    this.teams = [];
  }

  private beginBreak(kind: 'setup' | 'point') {
    this.cs.breakId++;
    this.cs.breakKind = kind;
    this.cs.phase = 'break';
  }

  private setRally(warm: boolean) {
    this.cs.phase = 'rally';
    for (const t of this.teams) {
      for (const pl of t.ps) {
        const p = pl.p;
        p.stance = warm && p === t.front ? 'idle' : 'ready';
        p.shuffle = true;
        p.faceYaw = faceNet(t.side);
        p.lookAt = this.cs.ball.pos;
      }
    }
  }

  /** 一分（或热身对打）。返回赢的一方 */
  private *rally(st: Team, rt: Team, deuce: boolean, warm: boolean): Generator<void, Team, number> {
    const cs = this.cs;
    const ball = cs.ball;
    const rnd = this.rnd;
    const n = warm ? 4 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 10);
    const er = rnd();
    const err: 'net' | 'out' | 'winner' = warm ? 'net' : er < 0.35 ? 'net' : er < 0.7 ? 'out' : 'winner';
    let ht = st;
    let hitter = st.back;
    let S: V3;
    let tHit: number;

    if (warm) {
      // 喂球：自己抛一下，正手打过去
      hitter.doAct('forehand', 0.9);
      yield* this.until(cs.now + 0.45);
      S = hitter.toWorld(-0.8, 0.95, 0.35);
      tHit = cs.now;
    } else {
      // 拍两下球，抛球，发
      hitter.stance = 'idle';
      hitter.doAct('bounce', 1.3);
      const t0 = cs.now;
      while (cs.now < t0 + 1.3) {
        const u = (cs.now - t0) / 1.3;
        ball.hold(hitter.toWorld(0.2, R + 0.8 * Math.abs(Math.cos(u * Math.PI * 2)), 0.45, this.v));
        yield;
      }
      const D = 1.5;
      hitter.doAct('serve', D);
      const ts = cs.now;
      while (cs.now < ts + D * SERVE_TOSS) {
        ball.hold(hitter.rig.handL.localToWorld(this.v.set(0, -0.32, 0)));
        yield;
      }
      const tc = D * (SERVE_CONTACT - SERVE_TOSS);
      const y0 = ball.pos.y;
      const yc = 2.25 * hitter.rig.scale;
      const vy = (yc - y0 + 0.5 * 9.8 * tc * tc) / tc;
      const tp = hitter.toWorld(-0.1, y0, 0.3);
      ball.launch(tp, { x: 0, y: vy, z: 0 }, cs.now);
      yield* this.until(ts + D * SERVE_CONTACT);
      S = { x: tp.x, y: yc, z: tp.z };
      tHit = ts + D * SERVE_CONTACT;
      hitter.stance = 'ready';
    }

    for (let k = 0; ; k++) {
      const o = -ht.side as 1 | -1;
      const recvTeam = ht === st ? rt : st;
      const recv = recvTeam.back;
      const kind = k === n - 1 ? err : 'good';
      const shot = this.plan(S, o, kind, k === 0 && !warm, deuce, warm, recv);
      ball.launch(S, shot.v, tHit);
      // 打完回位
      const hb = hitter;
      const home = { x: this.r(-0.6, 0.6), z: ht.side * (warm ? 11.0 : 11.8) };
      if (hb !== recv) hb.go([clampIn(home)], 3.2);

      if (kind === 'good') {
        const hc = this.r(0.95, 1.2);
        const { C, dt } = contactAfterBounce(shot, hc, 14.5);
        const tC = tHit + shot.T + dt;
        const fh = (C.x - recv.x) * o > -0.5 ? this.rnd() < 0.85 : this.rnd() < 0.15;
        const P = clampIn({ x: C.x - o * 0.82 * (fh ? 1 : -1), z: C.z + o * 0.15 });
        const left = Math.max(0.35, tC - cs.now - 0.3);
        const d = Math.hypot(P.x - recv.x, P.z - recv.z);
        recv.go([P], THREE.MathUtils.clamp(d / left, 1.2, 7));
        yield* this.until(tC - 0.45);
        recv.doAct(fh ? 'forehand' : 'backhand', 0.9);
        yield* this.until(tC);
        S = C;
        tHit = tC;
        ht = recvTeam;
        hitter = recv;
        continue;
      }

      // 失误或制胜分：对面不打了
      const tB = tHit + shot.T;
      if (kind === 'winner') {
        const { C } = contactAfterBounce(shot, 0.9, 16);
        const P = clampIn({ x: recv.x + (C.x - recv.x) * 0.6, z: recv.z + (C.z - recv.z) * 0.6 });
        recv.go([P], 5.5);
      } else if (kind === 'out') {
        yield* this.until(tB + 0.15);
        recv.stance = 'idle';
        recv.doAct('wave', 1.0); // 喊出界
      }
      yield* until(() => ball.restT > 0.3 || (ball.netted && ball.bounces >= 2), 3.5);
      yield* wait(0.3);
      return kind === 'winner' ? ht : recvTeam;
    }
  }

  /** 规划一拍：落点、速度、过网高度 */
  private plan(
    S: V3,
    o: number,
    kind: 'good' | 'net' | 'out' | 'winner',
    serve: boolean,
    deuce: boolean,
    warm: boolean,
    recv: Person,
  ): Shot {
    const r = (a: number, b: number) => this.r(a, b);
    const W = (this.teams[0].front ? COURT.hw : COURT.shw) - 0.5;
    if (serve) {
      const bx = o * r(0.5, 3.6) * (deuce ? 1 : -1);
      return planShot(S, bx, o * r(3.2, 6.0), r(17, 20), 0.22);
    }
    switch (kind) {
      case 'net':
        return planShot(S, r(-3, 3), o * r(0.6, 2.2), r(16, 20), -10);
      case 'out':
        if (this.rnd() < 0.55) return planShot(S, r(-3, 3), o * r(12.4, 13.8), r(15, 18), 0.6);
        return planShot(S, (this.rnd() < 0.5 ? 1 : -1) * r(W + 0.9, W + 1.8), o * r(6, 10.5), r(15, 18), 0.6);
      case 'winner': {
        const sx = recv.x > 0 ? -1 : 1;
        return planShot(S, sx * r(W - 0.6, W), o * r(9, 11.2), r(18, 21), 0.35);
      }
      default:
        if (warm) return planShot(S, r(-2, 2), o * r(8, 10.5), r(11, 13), 1.2);
        return planShot(S, r(-W, W), o * r(6.5, 11.2), r(13, 17), r(0.4, 1.2));
    }
  }

  update(dt: number, t: number) {
    for (const pl of this.pool) if (pl.p.visible || pl.p.path.length) pl.p.update(dt, t);
    // 双打网前的人跟着球横着挪
    const cs = this.cs;
    if (cs.phase !== 'rally') return;
    for (const t of this.teams) {
      const f = t.front;
      if (!f || f.stance !== 'ready' || f.act) continue;
      const tx = t.frontHome.x + (cs.ball.pos.x - t.frontHome.x) * 0.3;
      if (Math.abs(tx - f.x) > 0.35 && f.arrived) f.go([{ x: tx, z: t.frontHome.z }], 2.2);
    }
  }
}
