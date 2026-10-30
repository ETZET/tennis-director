import {
  awayL,
  type Ball,
  type BallPool,
  boxGeo,
  type CameraFocus,
  type ChoreoContext,
  Crow,
  chase,
  collect,
  createCar,
  createDog,
  createRain,
  dropFeed,
  EAST,
  flightL,
  forwardVec,
  hollowCreek,
  material,
  netL,
  type PeopleWorld,
  Person,
  type PersonOptions,
  part,
  penBounds,
  pickSide,
  rightVec,
  type Scheduler,
  type Stage,
  shotL,
  WEST,
} from '@td/render';
import { clamp, lerp, pick, range, type XYZ, type XZ } from '@td/shared';
import * as THREE from 'three';
import type { Hud } from './hud';
import type { LabelLayer } from './labels';

/**
 * Hollow Creek 的写死剧情（原型的时间轴，原样保留在 sandbox 里当演示）。
 *
 * 这里的一切都是"演出"：家长投诉、董事会备忘、开除 Dale、他开车离开。
 * M1 起这些会变成事件卡和活动数据，由模拟核心驱动；这个文件届时只作为动画参考。
 *
 * 创建顺序与原型一致（场景图顺序和 Math.random 的取数顺序都会影响画面）。
 */

const { FA, FB, FC, FD, UP, ANCHORS } = hollowCreek;
const rr = (a: number, b: number) => range(Math.random, a, b);
const SK = ['#f1c7a1', '#e8b896', '#d9a47c', '#c48a62', '#a86f4c', '#7a4a32', '#5f3a28', '#f1d0ae'] as const;
const A = (x: number, z: number) => FA.w({ x, z });
const Bw = (x: number, z: number) => FB.w({ x, z });

export interface DemoEnv {
  readonly stage: Stage;
  readonly sched: Scheduler;
  readonly world: PeopleWorld;
  readonly pool: BallPool;
  readonly hud: Hud;
  readonly labels: LabelLayer;
  readonly bubblePeaks: readonly XYZ[];
  readonly home: { tx: number; tz: number; zoom: number };
}

export interface Demo {
  /** 当前剧情镜头；null 表示自由视角 */
  focus(): CameraFocus | null;
  /** 推进 HUD 状态（质量下滑、曲线采样）。sdt 是演出时间增量。 */
  tickStats(sdt: number): void;
  /** 更新所有演员。ts 是真实时间戳（毫秒），用于头顶标记的浮动。 */
  updateActors(sdt: number, now: number, ts: number): void;
  updateRain(sdt: number, cx: number, cz: number): void;
  /** 1 号场上散落的课程用球 */
  lessonBalls(): number;
}

type PBPerson = Person & { team: 0 | 1; home: XZ };

export function createHollowCreekDemo(env: DemoEnv): Demo {
  const { stage, sched, world, pool, hud, labels } = env;
  const { scene } = stage;
  const S = hud.S;
  const at = (t: number, fn: (t: number) => void) => sched.at(t, fn);
  const ctx: ChoreoContext = { sched, groundY: hollowCreek.groundY };
  const mk = (o: PersonOptions) => new Person(o, world);

  /* ---------- 演员 ---------- */
  const daleSeat = A(3.3, -0.9);
  const dale = mk({
    name: 'Coach Dale',
    x: daleSeat.x,
    z: daleSeat.z,
    lock: FA.yaw(WEST),
    base: 'seatPhone',
    seatY: FA.oy + 0.45 + 0.06 - 0.75,
    wide: true,
    shirt: '#6b2e2a',
    shorts: '#4f5560',
    pants: true,
    skin: SK[0],
    hair: '#6a5a48',
    hairStyle: 'cap',
    cap: '#2b3440',
    beard: '#6a5a48',
    shoes: '#5a4a3a',
    racket: '#8a8f93',
    phone: true,
    box: true,
  });
  const tyH = A(-10.8, 0);
  const tyler = mk({
    name: 'Tyler',
    x: tyH.x,
    z: tyH.z,
    lock: FA.yaw(EAST),
    base: 'ready',
    shirt: '#5b6f8a',
    shorts: '#26262b',
    skin: SK[3],
    hair: '#3b2a1e',
    hairStyle: 'short',
    shoes: '#d0ccc0',
    racket: '#d6362f',
  });
  const msH = A(-13.4, -6.6);
  const mason = mk({
    name: 'Mason',
    x: msH.x,
    z: msH.z,
    yaw: FA.yaw(0.7),
    base: 'sitGround',
    seatY: FA.oy + 0.12 - 0.85,
    shirt: '#9a8a5a',
    shorts: '#3a3f4a',
    skin: SK[1],
    hair: '#a7742f',
    hairStyle: 'short',
    shoes: '#2a2a2a',
    racket: '#1f1f1f',
  });
  const you = mk({
    name: 'Director',
    x: ANCHORS.director_post.x,
    z: ANCHORS.director_post.z,
    base: 'director',
    shirt: '#2f5a55',
    trim: '#e6b03c',
    shorts: '#7d6f55',
    pants: true,
    skin: SK[2],
    hair: '#4a3020',
    hairStyle: 'short',
    shoes: '#3a2a20',
    clipboard: true,
  });
  const carter = mk({
    name: 'Ms. Carter',
    x: 31,
    z: -33,
    base: 'relaxed',
    shirt: '#3c5a7a',
    sleeve: '#3c5a7a',
    longSleeve: true,
    shorts: '#2e2e33',
    pants: true,
    skin: SK[1],
    hair: '#a7742f',
    hairStyle: 'pony',
    shoes: '#2a2a2a',
  });
  carter.root.visible = false;
  const PB_HOMES = [
    { x: -2.5, z: -1.5, team: 0 },
    { x: -2.5, z: 1.5, team: 0 },
    { x: 2.5, z: -1.5, team: 1 },
    { x: 2.5, z: 1.5, team: 1 },
  ] as const;
  const pbLooks = [
    {
      name: 'Bev',
      shirt: '#e05a8f',
      shorts: '#f1ece0',
      skin: SK[0],
      hair: '#d9d3c6',
      hairStyle: 'visor',
      cap: '#e05a8f',
      paddle: '#3a8fd9',
    },
    {
      name: 'Hank',
      shirt: '#2fa3a8',
      shorts: '#3a3f4a',
      skin: SK[3],
      hair: '#9a9a96',
      hairStyle: 'bald',
      paddle: '#e8582c',
      wide: true,
    },
    {
      name: 'Lou',
      shirt: '#f0a020',
      shorts: '#2f3a4f',
      skin: SK[5],
      hair: '#cfcac0',
      hairStyle: 'curly',
      paddle: '#7fcf6a',
    },
    {
      name: 'Marge',
      shirt: '#8a5ac4',
      shorts: '#f1ece0',
      skin: SK[1],
      hair: '#b8b2a6',
      hairStyle: 'visor',
      cap: '#ffffff',
      paddle: '#d63a6a',
    },
  ] as const;
  const pbCast = pbLooks.map((o, i) => {
    const h = PB_HOMES[i] as (typeof PB_HOMES)[number];
    const w = Bw(h.x, h.z);
    const p = mk({
      ...o,
      x: w.x,
      z: w.z,
      lock: FB.yaw(h.team ? WEST : EAST),
      base: 'pbReady',
      shoes: '#f1ece0',
      reach: 0.72,
    }) as PBPerson;
    return p;
  });
  pbCast.forEach((p, i) => {
    const h = PB_HOMES[i] as (typeof PB_HOMES)[number];
    p.team = h.team;
    p.home = h;
  });
  you.idleFace = Math.atan2(FA.ox - you.pos.x, FA.oz - you.pos.z);
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26, 0),
    new THREE.MeshBasicMaterial({ color: '#62e08c' }),
  );
  marker.position.y = 2.55;
  you.root.add(marker);

  /* ---------- 课程道具：球筐、球包 ---------- */
  const basket = (() => {
    const p = A(3.25, -1.75);
    const g = new THREE.Group();
    g.position.set(p.x, FA.oy, p.z);
    g.rotation.y = FA.a;
    scene.add(g);
    for (const [x, z] of [
      [-0.2, -0.2],
      [0.2, -0.2],
      [-0.2, 0.2],
      [0.2, 0.2],
    ] as const)
      part(g, 0.04, 0.55, 0.04, x, 0.27, z, '#3a3631');
    part(g, 0.5, 0.04, 0.5, 0, 0.55, 0, '#3a3631');
    part(g, 0.5, 0.04, 0.5, 0, 0.95, 0, '#5a3d2a');
    const fill = new THREE.Mesh(boxGeo(0.44, 0.36, 0.44), material('#c9d24e'));
    fill.position.y = 0.75;
    g.add(fill);
    return { fill, pos: { x: p.x, y: FA.oy + 1.0, z: p.z } };
  })();
  const bag = (() => {
    const p = A(4.1, 0.6);
    const g = new THREE.Group();
    g.position.set(p.x, FA.oy, p.z);
    g.rotation.y = FA.a;
    scene.add(g);
    part(g, 0.55, 0.38, 0.34, 0, 0.19, 0, '#a9824f');
    part(g, 0.56, 0.06, 0.35, 0, 0.32, 0, '#c9b083');
    return g;
  })();

  /* ---------- 1 号场：Dale 心不在焉地喂球 ---------- */
  const lesson = {
    fr: FA,
    coach: dale,
    A: tyler,
    active: true,
    cap: 30,
    left: 30,
    balls: [] as Ball[],
    emptyLogged: false,
    setBasket() {
      const r = this.left / this.cap;
      basket.fill.visible = r > 0;
      basket.fill.scale.y = Math.max(0.01, r);
      basket.fill.position.y = 0.57 + 0.18 * r;
    },
    tick(t: number) {
      if (!this.active) return;
      if (this.left <= 0) {
        if (!this.emptyLogged) {
          this.emptyLogged = true;
          hud.log('Ball basket empty. Coach Dale does not refill it.');
          hud.hitQ(-3);
        }
        return;
      }
      this.feed(t);
      at(t + rr(4.8, 7.5), (tt) => this.tick(tt));
    },
    feed(t: number) {
      const c = this.coach;
      const fr = this.fr;
      this.left--;
      this.setBasket();
      const ball = pool.get(this);
      this.balls.push(ball);
      while (this.balls.filter((b) => b.inUse && b.owner === this).length > 40) {
        const o = this.balls.shift() as Ball;
        if (o.inUse && o.owner === this) o.fadeOut(sched.now);
      }
      const f = forwardVec(c.lock ?? 0);
      const r = rightVec(c.lock ?? 0);
      const Cw = { x: c.pos.x + r.x * 0.6 + f.x * 0.75, y: fr.oy + 0.75, z: c.pos.z + r.z * 0.6 + f.z * 0.75 };
      const C = fr.l(Cw);
      ball.arc(basket.pos, Cw, t, 0.5);
      const tc = t + 0.5;
      c.setStroke('feed', tc);
      at(tc, (tt) => {
        if (!this.active) {
          ball.simLocal(fr, C, { x: -1, y: 0, z: 0 }, tt, penBounds(fr));
          return;
        }
        S.shots++;
        if (Math.random() < 0.32) {
          hud.hitQ(-0.8);
          if (Math.random() < 0.6) {
            netL(fr, ball, C, { x: 0, y: rr(0.3, 0.7), z: rr(-2, 2) }, tt, 8, penBounds(fr));
            hud.maybeLog('feedNet', 'Coach Dale fed the ball into the net.');
          } else {
            const B = { x: rr(-12, -6), y: 0.08, z: pick([-1, 1]) * rr(4.6, 6) };
            awayL(fr, ball, C, B, tt, flightL(C, B, 10), penBounds(fr));
            hud.maybeLog('feedWide', "Feed sailed wide. Tyler didn't move.");
          }
          return;
        }
        const fh = Math.random() < 0.6;
        const B = { x: rr(-8.4, -6.5), y: 0.08, z: (fh ? 1 : -1) * rr(0.6, 2.6) };
        const sh = shotL(fr, ball, C, B, tt, rr(10, 12), rr(0.8, 1.0), rr(2.8, 3.5), 1.1);
        chase(this.A, sh.P2w, tt, sh.tC, fh ? 1 : -1, fh ? 'fh' : 'bh');
        at(sh.tC, (t3) => this.hitA(ball, sh.P2, t3, fh));
      });
    },
    hitA(ball: Ball, P0: XYZ, t: number, fh: boolean) {
      const A_ = this.A;
      const fr = this.fr;
      at(t + 0.5, () => {
        if (!this.active) return;
        A_.clearMoves();
        const h = fr.w({ x: -10.8, z: P0.z * 0.3 });
        A_.go(h.x, h.z, 1.4);
      });
      S.shots++;
      const r = Math.random();
      if (r < 0.5) {
        hud.hitQ(-0.5);
        if (r < 0.22) {
          netL(fr, ball, P0, { x: 0, y: rr(0.3, 0.75), z: rr(-3, 3) }, t, 13, penBounds(fr));
          hud.maybeLog('aNet', 'Tyler: another ball into the net.', 14);
        } else if (r < 0.38) {
          const B = { x: rr(12.4, 14), y: 0.08, z: rr(-4, 4) };
          awayL(fr, ball, P0, B, t, flightL(P0, B, 15), penBounds(fr));
        } else {
          const B = { x: rr(-4, 6), y: 0.08, z: pick([-1, 1]) * rr(6, 8.5) };
          awayL(fr, ball, P0, B, t, flightL(P0, B, 11), penBounds(fr));
          hud.maybeLog('frame', 'Framed shot into the side fence.', 16);
        }
        return;
      }
      S.ins++;
      hud.hitQ(0.15);
      const B = { x: rr(6.5, 10.8), y: 0.08, z: (fh ? -1 : 1) * rr(0.8, 3.8) };
      awayL(fr, ball, P0, B, t, flightL(P0, B, rr(12.5, 15.5)), penBounds(fr));
    },
  };
  lesson.setBasket();
  at(3, (t) => lesson.tick(t));

  /* ---------- 2 号场：匹克球双打，长回合，大家都很开心。对比就是重点 ---------- */
  const PB_LINES = ['Nice dink!', 'Ohhh, so close!', 'Kitchen!', 'Ha! Got me.', 'Good one, Lou!', 'Again, again!'];
  const pb = {
    fr: FB,
    count: 0,
    ball: null as Ball | null,
    start(t: number) {
      const s = pick(pbCast);
      this.count = 0;
      const ball = pool.get(this, true);
      this.ball = ball;
      dropFeed(ctx, s, ball, t, 'dk', (C, tt) => this.hit(s, C, tt));
    },
    home(p: PBPerson) {
      return this.fr.w(p.home);
    },
    hit(h: PBPerson, P0w: XYZ, t: number) {
      const fr = this.fr;
      const ball = this.ball as Ball;
      const P0 = fr.l(P0w);
      this.count++;
      S.pbBest = Math.max(S.pbBest, this.count);
      const opp = pbCast.filter((p) => p.team !== h.team);
      const r = pick(opp);
      const sx = r.team ? 1 : -1;
      for (const p of pbCast.filter((q) => q.team !== h.team)) p.hopT = t + 0.05;
      at(t + 0.35, () => {
        const H = this.home(h);
        h.clearMoves();
        h.go(H.x, H.z, 2.2);
      });
      const err = Math.random() < 0.045 + this.count * 0.004;
      if (err) {
        if (Math.random() < 0.6)
          netL(fr, ball, P0, { x: 0, y: rr(0.3, 0.6), z: lerp(P0.z, r.home.z, 0.5) }, t, 6, penBounds(fr));
        else {
          const B = { x: sx * rr(7, 8), y: 0.08, z: r.home.z + rr(-1, 1) };
          awayL(fr, ball, P0, B, t, flightL(P0, B, 9, 1.0), penBounds(fr));
        }
        at(t + 1.2, (tt) => {
          const sp = pick(pbCast);
          labels.say(sp, pick(PB_LINES), 2, tt, 'pk');
          sp.gesture(Math.random() < 0.5 ? 'cheer' : 'shrug', tt, 1.4);
          ball.fadeOut(tt + 0.8);
          for (const p of pbCast) {
            const H = this.home(p);
            p.clearMoves();
            p.go(H.x, H.z, 1.6);
          }
          at(tt + 2.6, (t2) => this.start(t2));
        });
        return;
      }
      const drive = Math.random() < 0.14;
      const B = {
        x: sx * (drive ? rr(3, 5.2) : rr(0.6, 1.9)),
        y: 0.08,
        z: clamp(r.home.z + rr(-0.9, 0.9), -2.9, 2.9),
      };
      const sh = shotL(
        fr,
        ball,
        P0,
        B,
        t,
        drive ? rr(9, 11) : rr(4.6, 6),
        drive ? rr(0.6, 0.8) : rr(0.35, 0.5),
        drive ? rr(1, 1.4) : rr(0.5, 0.9),
        1.0,
      );
      const side = pickSide(r, sh.P2w);
      chase(r, sh.P2w, t, sh.tC, side, drive ? (side > 0 ? 'fh' : 'bh') : 'dk');
      at(sh.tC, (tt) => this.hit(r, sh.P2w, tt));
    },
  };
  at(1.4, (t) => pb.start(t));

  // 会员一个接一个退会
  const QUITTERS = ['R. Shaw', 'the Okafor family', 'P. Lindqvist', 'J. Morales', 'the Brennans'];
  let qi = 0;
  const quit = (t: number) => {
    if (S.ended) return;
    if (qi < QUITTERS.length) {
      S.members--;
      hud.hitQ(-2);
      hud.log(`Membership cancelled: ${QUITTERS[qi++]}.`);
    }
    at(t + rr(17, 26), quit);
  };
  at(14, quit);

  /* ---------- 环境：乌鸦、流浪狗、汽车、雨 ---------- */
  const crows: Crow[] = [];
  env.bubblePeaks.forEach((p, i) => {
    crows.push(new Crow(scene, p.x, p.y, p.z, i));
  });
  for (const [x, z] of [
    [0, 6.4],
    [0, -6.4],
  ] as const) {
    const p = FD.w({ x, y: 1.0, z });
    crows.push(new Crow(scene, p.x, p.y, p.z, 1));
  }
  crows.push(new Crow(scene, -10, UP + 5.2, -26, 0.4));
  const dog = createDog(scene, hollowCreek.groundY, hollowCreek.DOG_WAYPOINTS);
  const EXIT = hollowCreek.EXIT_ROUTE;
  const daleCar = createCar(
    scene,
    hollowCreek.carY,
    27,
    -27,
    '#6b7480',
    '#7a4a2e',
    [{ x: 34, z: -27.5 }, ...EXIT],
    true,
  );
  const carterCar = createCar(
    scene,
    hollowCreek.carY,
    30,
    -36.5,
    '#3d4f6a',
    '#3d4f6a',
    [{ x: 36, z: -34 }, ...EXIT],
    true,
  );
  const cars = [daleCar, carterCar];
  const rain = createRain(stage, hollowCreek.HOLLOW_CREEK_RAIN);
  const sky = hollowCreek.createHollowCreekSky(stage);

  /* ---------- 地点标签 ---------- */
  const FL = (fr: typeof FA, x: number, y: number, z: number) => () => fr.w({ x, y, z });
  labels.add('Court 1 · last tennis court', FL(FA, 0, 2.6, -FA.hz));
  labels.add('Court 2 · rented to pickleball', FL(FB, 0, 2.6, -FB.hz), 'pickle');
  labels.add('Bubble court · deflated', FL(FC, 7, 3.2, 2.5), 'dead');
  labels.add('Clay court · overgrown', FL(FD, 0, 2.4, -FD.hz), 'dead');
  labels.add('Pool · drained', () => ({ x: 10, y: UP + 1.6, z: -27 }));
  labels.add('You · Director', () => ({ x: you.pos.x, y: you.root.position.y + 3.2, z: you.pos.z }), 'you');

  /* ---------- 剧情 ---------- */
  let focus: (() => CameraFocus) | null = null;
  const focusOn = (f: (() => CameraFocus) | null) => {
    focus = f;
  };
  const GATE_A_OUT = ANCHORS.court_1_gate_out;
  const GATE_A_IN = ANCHORS.court_1_gate_in;
  const STAIR_TOP = ANCHORS.stairs_top;
  const STAIR_BOT = ANCHORS.stairs_bottom;
  const LOT_PATH = ANCHORS.lot_path;
  const MID_WALK = ANCHORS.mid_walk;
  const UPPER_PATH = ANCHORS.upper_path;
  hud.log('Junior lesson started 25 minutes late.');
  hud.log('Court 2 rented to the pickleball group. $8/hr.');
  hud.log('Bubble court: deflated last winter, never re-inflated.');
  at(6, () => hud.log('Coach Dale is on his phone.'));

  // 第 1 拍：一位家长从坡上走下来投诉
  at(20, () => {
    carter.root.visible = true;
    carter.path(
      [{ x: 24, z: -24 }, LOT_PATH, UPPER_PATH, STAIR_TOP, STAIR_BOT, MID_WALK, GATE_A_OUT, GATE_A_IN, A(1.7, 0.3)],
      2.6,
    );
    carter.call((tt) => arriveCarter(tt));
  });
  at(30, () => focusOn(() => ({ x: carter.pos.x, z: carter.pos.z, zoom: 1.45 })));
  function arriveCarter(t: number) {
    carter.watch = dale;
    focusOn(() => ({ x: A(-2, -2).x, z: A(-2, -2).z, zoom: 1.7 }));
    labels.say(carter, 'My son paid for lessons, not babysitting!', 3.2, t);
    carter.gesture('argue', t, 2.6);
    at(t + 3.4, (tt) => {
      labels.say(dale, "Relax. It's practice.", 2.6, tt);
      dale.gesture('shrug', tt, 2.0);
    });
    at(t + 6.3, (tt) => {
      labels.say(carter, "We're done here. Mason, let's go.", 2.8, tt);
      carter.gesture('point', tt, 2.2);
      S.complaints++;
      S.members -= 2;
      hud.hitQ(-8);
      hud.log('The Carter family quit the club.', true);
    });
    at(t + 8.4, () => {
      carter.watch = null;
      mason.seatY = null;
      mason.base = 'slump';
      const out = [GATE_A_IN, GATE_A_OUT, MID_WALK, STAIR_BOT, STAIR_TOP, UPPER_PATH, LOT_PATH, { x: 28, z: -33 }];
      mason.path([A(-12, -3), A(10, -1.2), ...out], 1.9).call(() => {
        mason.root.visible = false;
      });
      carter.path([A(-10, -4.2), A(10, -0.6), ...out], 1.9).call(() => {
        carter.root.visible = false;
        carterCar.start();
        hud.log('The Carters drove off.');
      });
      focusOn(null);
    });
  }

  // 第 2 拍：董事会备忘；你把 Dale 叫上露台
  at(60, () => {
    hud.toast('Board memo', 'Program quality has collapsed. Members are leaving. Deal with Coach Dale.', 6);
    hud.log('Board memo: "Fix the lesson program."', true);
  });
  at(63, () => {
    you.idleFace = null;
    you.go(ANCHORS.deck_edge.x, ANCHORS.deck_edge.z, 1.6).call((tt) => {
      you.idleFace = Math.atan2(dale.pos.x - you.pos.x, dale.pos.z - you.pos.z);
      labels.say(you, 'Dale! Up here. Now.', 2.6, tt);
      you.gesture('wave', tt, 2.4);
      at(tt + 2.4, (t2) => summon(t2));
    });
    focusOn(() => ({ x: -8, z: -13, zoom: 1.5 }));
  });
  function summon(t: number) {
    lesson.active = false;
    dale.seatY = null;
    dale.base = 'phoneStand';
    dale.lock = null;
    labels.say(dale, '...Ugh. Fine.', 1.8, t);
    tyler.clearMoves();
    tyler.stroke = null;
    tyler.lock = null;
    tyler.base = 'relaxed';
    tyler.watch = dale;
    dale.path(
      [
        A(10, -1.2),
        GATE_A_IN,
        GATE_A_OUT,
        MID_WALK,
        STAIR_BOT,
        STAIR_TOP,
        { x: -2.6, z: -18.6 },
        { x: -5.4, z: -18.8 },
      ],
      1.7,
    );
    dale.call((tt) => firing(tt));
    you.go(-6.6, -19.1, 1.2);
    focusOn(() => ({ x: dale.pos.x * 0.7 - 3, z: dale.pos.z * 0.7 - 6, zoom: 1.6 }));
  }

  // 第 3 拍：在俯瞰球场的露台上开除他
  function firing(t: number) {
    you.watch = dale;
    dale.watch = you;
    focusOn(() => ({ x: -6, z: -18.6, zoom: 2.3 }));
    labels.say(you, 'Parents are walking out, Dale.', 2.6, t);
    you.gesture('talk', t, 2.4);
    at(t + 2.8, (tt) => labels.say(dale, "It's a rec club. What did you expect?", 2.6, tt));
    at(t + 5.6, (tt) => {
      labels.say(you, "More than this. You're done here.", 3.0, tt);
      you.slip.visible = true;
      you.gesture('hand', tt, 3.0);
    });
    at(t + 7.2, () => {
      you.slip.visible = false;
      dale.slip.visible = true;
      S.fired = true;
      hud.hitQ(-2);
      hud.log('Coach Dale Pruitt was let go.', true);
      hud.setVacantCoach();
      rain.start();
    });
    at(t + 8.8, (tt) => {
      labels.say(dale, 'Whatever. This place is dying anyway.', 3.2, tt);
      dale.gesture('shrug', tt, 2.6);
    });
    at(t + 12.2, () => {
      if (dale.phone) dale.phone.visible = false;
      dale.slip.visible = false;
      if (dale.boxMesh) dale.boxMesh.visible = true;
      dale.base = 'carry';
      dale.watch = null;
      dale.path([{ x: -2, z: -19.6 }, UPPER_PATH, LOT_PATH, { x: 26.5, z: -28.4 }], 2.2).call((t3) => driveOff(t3));
      focusOn(() => ({ x: dale.pos.x, z: dale.pos.z, zoom: 1.6 }));
      tyler.watch = null;
      const lw = lesson.balls.filter((b) => b.inUse && b.owner === lesson);
      collect(ctx, tyler, lw.slice(0, 8), A(-10.8, 0), () => {
        tyler.base = 'slump';
        tyler.watch = you;
      });
    });
  }

  // 第 4 拍：他开车下山、过溪，走了
  function driveOff(t: number) {
    dale.root.visible = false;
    dale.clearMoves();
    bag.visible = false;
    daleCar.start();
    crows.forEach((c, i) => {
      c.scare(t + 1 + i * 0.2);
    });
    hud.log('Dale drove off. Nobody waved.');
    focusOn(() => ({ x: daleCar.g.position.x - 6, z: Math.min(daleCar.g.position.z, 30), zoom: 1.3 }));
    at(t + 9, (tt) => {
      const bev = pbCast[0] as PBPerson;
      bev.gesture('wave', tt, 2.4);
      labels.say(bev, 'Hey! Is Court 1 free now?', 3, tt, 'pk');
      focusOn(() => ({ x: 2, z: -8, zoom: 1.3 }));
    });
    at(t + 12.5, (tt) => {
      you.watch = null;
      you.idleFace = Math.atan2(FA.ox - you.pos.x, FA.oz - you.pos.z);
      labels.say(you, '...Back to square one.', 3, tt);
    });
    at(t + 15, () => {
      hud.toast(
        'Stage 2',
        "Dale is gone, and the pickleball group wants Court 1 too. Your job: rebuild Hollow Creek's tennis program.",
        0,
        true,
      );
      S.ended = true;
      hud.showReplay();
      focusOn(() => ({ x: env.home.tx, z: env.home.tz, zoom: env.home.zoom }));
    });
    at(t + 19, () => focusOn(null));
  }

  let histT = 0;
  return {
    focus: () => (focus ? focus() : null),
    tickStats(sdt) {
      if (!S.fired && dale.seatY != null) {
        S.q = clamp(S.q - 0.11 * sdt, 6, 100);
        S.phoneMin += sdt / 4;
      }
      histT += sdt;
      if (histT >= 1) {
        histT = 0;
        S.hist.push(S.q);
        if (S.hist.length > 180) S.hist.shift();
      }
    },
    updateActors(sdt, now, ts) {
      for (const p of world.people) p.update(sdt, now);
      pool.update(now);
      for (const c of crows) c.update(now, sdt);
      dog.update(sdt, now);
      for (const c of cars) c.update(sdt, now);
      marker.position.y = 2.55 + Math.sin(ts / 350) * 0.12;
      marker.rotation.y = ts / 600;
    },
    updateRain(sdt, cx, cz) {
      rain.update(sdt, cx, cz);
      sky.update(sdt, sched.now, rain.amount());
    },
    lessonBalls: () => pool.balls.filter((b) => b.inUse && b.owner === lesson).length,
  };
}
