import { clamp, lerp, type XYZ } from '@td/shared';
import * as THREE from 'three';
import { labelPlane } from '../fx/sprites';
import type { Ball } from '../motion/ball';
import { boxGeo, material, part } from '../people/parts';
import type { Person } from '../people/person';
import { away, chase, fly, intoNet, type Shot, shot, sideOf, standFor, through } from './choreo';
import { HAIR, SKIN, UMBRELLAS } from './looks';
import { bench, jit, mkBottle, mkCamera, mkFlag, mkTrophy } from './props';
import { type Act, BR, EAST, fwd, NORTH, rgt, SOUTH, WEST } from './runtime';

type Player = Person & { team: 0 | 1; home: { x: number; z: number }; net: boolean };
type FanKind = 'cheer' | 'ooh' | 'clap' | 'wave' | 'sad' | 'stand';

/** 看台上的观众：一个只有上半身的小方块人，按反应摆手臂。 */
class Fan {
  readonly g = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly aL = new THREE.Group();
  private readonly aR = new THREE.Group();
  private t = -9;
  private kind: FanKind | null = null;
  private dur = 0;
  private readonly ph: number;
  constructor(
    a: Act,
    x: number,
    private readonly base: number,
    z: number,
    yaw: number,
    col: string,
    readonly team: 0 | 1,
    o: { umb?: string | null; flag?: boolean } = {},
  ) {
    const g = this.g;
    g.position.set(x, base, z);
    g.rotation.y = yaw;
    a.group.add(g);
    part(g, 0.46, 0.5, 0.28, 0, 0.25, 0, col);
    this.head = part(g, 0.32, 0.32, 0.3, 0, 0.68, 0, a.pick(SKIN));
    part(g, 0.34, 0.1, 0.32, 0, 0.87, -0.02, a.pick(HAIR));
    part(g, 0.42, 0.14, 0.36, 0, 0.02, 0.16, '#2a2f38');
    this.aL.position.set(0.3, 0.45, 0);
    g.add(this.aL);
    part(this.aL, 0.12, 0.4, 0.12, 0, -0.18, 0, col);
    this.aR.position.set(-0.3, 0.45, 0);
    g.add(this.aR);
    part(this.aR, 0.12, 0.4, 0.12, 0, -0.18, 0, col);
    if (o.umb) {
      part(g, 0.04, 0.9, 0.04, 0.25, 0.9, 0, '#333');
      part(g, 1.0, 0.08, 1.0, 0.25, 1.35, 0, o.umb);
    }
    if (o.flag) {
      const f = mkFlag(col);
      f.position.set(0, -0.2, 0);
      this.aR.add(f);
    }
    this.ph = a.rr(0, 6);
  }
  react(kind: FanKind, t0: number, dur: number): void {
    this.kind = kind;
    this.t = t0;
    this.dur = dur;
  }
  update(now: number): void {
    let y = 0;
    let ax = -0.2 + Math.sin(now * 1.3 + this.ph) * 0.05;
    let al = 0.12;
    let ar = -0.12;
    let hx = 0;
    const u = now - this.t;
    if (u >= 0 && u < this.dur) {
      if (this.kind === 'cheer') {
        y = Math.abs(Math.sin(u * 9 + this.ph)) * 0.3;
        ax = -2.85 + Math.sin(u * 14) * 0.3;
      } else if (this.kind === 'ooh') {
        ax = -2.4;
        al = 0.5;
        ar = -0.5;
      } else if (this.kind === 'clap') {
        ax = -1.2;
        al = -0.1 - Math.abs(Math.sin(u * 18)) * 0.3;
        ar = -al;
      } else if (this.kind === 'wave') {
        const k = Math.sin(Math.min(1, u / this.dur) * Math.PI);
        y = k * 0.45;
        ax = -2.9 * k - 0.2;
      } else if (this.kind === 'sad') {
        ax = -0.1;
        hx = 0.45;
      } else if (this.kind === 'stand') {
        y = 0.25;
        ax = -1.0;
      }
    }
    this.g.position.y = this.base + y;
    this.aL.rotation.set(ax, 0, al);
    this.aR.rotation.set(ax, 0, ar);
    this.head.rotation.x = hx;
  }
}

/**
 * 正式比赛（抢七）：发球、多拍、ACE、双误、飞扑、截击。赢了躺地庆祝、领奖、媒体闪光灯；输了毛巾盖头。
 * 级别越高，观众越多、场面越大。finale=none 时打满一盘只把比分清零接着打（游戏里结果由模拟决定）。
 * 球网 x=0，我方在左半场。
 */
export function match(a: Act) {
  const vb = a.vb;
  const tier = a.num('tier');
  const dbl = a.str('fmt') === 'd';
  const finale = a.str('finale') !== 'none';
  const st = a.style;
  bench(vb, a.rand, -2.6, -7.2, 1.8, 0);
  bench(vb, a.rand, 2.6, -7.2, 1.8, 0);
  const fans: Fan[] = [];
  let ump: Person;
  if (tier >= 2) {
    vb.box(0, 0, -7.4, 0.9, 1.6, 0.9, '#2f5a46');
    vb.box(0, 1.6, -7.4, 1.0, 0.1, 1.0, '#264a3a');
    ump = a.spawn({
      x: 0,
      z: -7.4,
      yaw: SOUTH,
      seatY: a.gy(0, -7.4) + 0.9,
      base: 'seated',
      shirt: '#1e2d4a',
      shorts: '#1e2d4a',
      pants: true,
      skin: a.pick(SKIN),
      hair: '#9a9a96',
      hairStyle: 'short',
      shoes: '#2a2a2a',
    });
  } else ump = a.person({ x: 4.6, z: -7.0, yaw: SOUTH, clipboard: true });
  ump.idleFace = SOUTH;

  const umb = () => (a.rain ? a.pick(UMBRELLAS) : null);
  const rowsFar = [0, 3, 4, 6][tier - 1] ?? 0;
  const rowsNear = [0, 0, 1, 2][tier - 1] ?? 0;
  const perRow = [0, 8, 10, 12][tier - 1] ?? 0;
  const stCol = a.venue === 'hollow' ? ['#7d7468', '#857b6e'] : ['#8f969c', '#9ca3a8'];
  const addFan = (x: number, y: number, z: number, yaw: number) => {
    if (a.chance(1 - st.fanMul)) return;
    const team: 0 | 1 = a.chance(a.venue === 'hollow' ? 0.45 : 0.6) ? 0 : 1;
    fans.push(
      new Fan(a, x, y, z, yaw, team === 0 ? a.pick(st.teamFans) : a.pick(st.oppFans), team, {
        umb: umb(),
        flag: tier === 4 && a.chance(0.12),
      }),
    );
  };
  if (tier === 1)
    for (let i = 0; i < 5; i++) {
      const x = -6 + i * 2.6;
      vb.box(x, 0, -9.6, 0.5, 0.45, 0.5, a.pick(['#3a7ad6', '#d65a5a', '#4fb3b3']));
      addFan(x, 0.45, -9.6, 0);
    }
  for (let r = 0; r < rowsFar; r++) {
    const y = 0.45 * (r + 1);
    const z = -9.1 - r * 0.9;
    vb.box(0, 0, z, 26, y, 0.9, jit(a.rand, stCol[r % 2] as string, 0.02));
    for (let i = 0; i < perRow; i++) {
      if (a.chance(tier === 4 ? 0.06 : 0.2)) continue;
      addFan(-12 + i * (24 / (perRow - 1)) + a.rr(-0.3, 0.3), y, z, 0);
    }
  }
  for (let r = 0; r < rowsNear; r++) {
    const y = 0.4 * (r + 1);
    const z = 9.0 + r * 0.9;
    vb.box(0, 0, z, 26, y, 0.9, jit(a.rand, stCol[0] as string, 0.02));
    for (let i = 0; i < perRow; i++) {
      if (a.chance(0.25)) continue;
      addFan(-12 + i * (24 / (perRow - 1)), y, z, Math.PI);
    }
  }
  if (tier >= 2) {
    const cols =
      a.venue === 'maple'
        ? ['#7c2232', '#24456e', '#e6b03c']
        : a.venue === 'hollow'
          ? ['#6a6e68', '#7fcf6a', '#8a7a5a']
          : ['#2e86a6', '#c8553d', '#1d3550', '#e6b03c'];
    for (let x = -14; x <= 14; x += 4) {
      const bd = a.own(labelPlane(a.t(`boards.${a.venue}`), 3.6, 0.5, a.pick(cols), '#ffffff', 18));
      bd.position.set(x, 0.35, -7.86);
    }
  }
  let kids: Person[] | null = null;
  let press: Person[] | null = null;
  let flags: THREE.Mesh[] | null = null;
  if (tier >= 3) {
    vb.box(16, 0, -6.4, 0.1, 1.4, 0.1, '#333');
    vb.box(15.6, 0, -6.4, 0.1, 1.4, 0.1, '#333');
    vb.box(15.8, 1.4, -6.4, 0.7, 0.5, 1.0, '#1d1d1f');
    vb.box(15.8, 1.55, -5.8, 0.3, 0.3, 0.3, '#3a3a3e');
    kids = [
      [0.4, 6.9],
      [0.4, -6.9],
    ].map(([x, z]) => {
      const k = a.spawn({
        x: x as number,
        z: z as number,
        yaw: (z as number) > 0 ? NORTH : SOUTH,
        scale: 0.7,
        base: 'crouchBK',
        shirt: '#6a3fa0',
        shorts: '#2a2f38',
        skin: a.pick(SKIN),
        hair: a.pick(HAIR),
        hairStyle: 'short',
        shoes: '#f3f1ea',
      });
      k.idleFace = (z as number) > 0 ? NORTH : SOUTH;
      return k;
    });
  }
  if (tier === 4) {
    press = [
      [-14.8, 6.4, 2.4],
      [14.8, 6.4, -2.4],
      [-14.8, -6.4, 0.8],
    ].map(([x, z, y]) => {
      const p = a.spawn({
        x: x as number,
        z: z as number,
        yaw: y as number,
        base: 'kneel',
        shirt: '#2a2a2e',
        shorts: '#2a2a2e',
        pants: true,
        skin: a.pick(SKIN),
        hair: a.pick(HAIR),
        hairStyle: 'short',
        shoes: '#2a2a2a',
      });
      p.idleFace = y as number;
      p.give('R', mkCamera());
      return p;
    });
    for (let x = -14; x <= 14; x += 7) vb.box(x, 0, -14.6, 0.08, 5.6, 0.08, '#e8e2d0');
    flags = [-14, -7, 0, 7, 14].map((x, i) => {
      const f = new THREE.Mesh(
        boxGeo(0.04, 0.7, 1.1),
        material(['#2e86a6', '#c8553d', '#e6b03c', '#2e86a6', '#c8553d'][i] as string),
      );
      f.position.set(x, 5.2, -14.05);
      a.group.add(f);
      return f;
    });
  }

  // 记分牌
  const sc = document.createElement('canvas');
  sc.width = 256;
  sc.height = 128;
  const stx = new THREE.CanvasTexture(sc);
  stx.minFilter = THREE.LinearFilter;
  const bw = tier === 4 ? 4.4 : tier >= 2 ? 3.2 : 1.8;
  const bh = bw / 2;
  const brd = a.own(new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: stx })));
  if (tier === 1) {
    brd.position.set(-4.6, 1.1, -7.3);
    vb.box(-4.6, 0, -7.36, 0.08, 0.7, 0.08, '#6a4a2e');
  } else {
    brd.position.set(-16.2, bh / 2 + 1.6, -4.8);
    brd.rotation.y = 0.9;
    vb.box(-16.25, 0, -4.85, 0.12, 1.6, 0.12, '#333');
  }
  const S = {
    score: [0, 0] as [number, number],
    k: 0,
    shots: 0,
    big: false,
    over: false,
    ball: null as Ball | null,
    teams: [[], []] as [Player[], Player[]],
  };
  const board = (lbl?: string) => {
    const x = sc.getContext('2d') as CanvasRenderingContext2D;
    const led = tier > 1;
    x.fillStyle = led ? '#0e0c0a' : '#f6f3ea';
    x.fillRect(0, 0, 256, 128);
    x.font = "700 18px 'Saira Semi Condensed', monospace";
    x.fillStyle = led ? '#d9ec52' : '#3a3a3a';
    x.textAlign = 'center';
    x.fillText(lbl || 'TIEBREAK', 128, 24);
    x.font = "700 62px 'Saira Semi Condensed', monospace";
    x.fillStyle = led ? '#5fd1ff' : '#2e86a6';
    x.fillText(String(S.score[0]), 70, 86);
    x.fillStyle = led ? '#ff7a5a' : '#c8553d';
    x.fillText(String(S.score[1]), 186, 86);
    x.fillStyle = led ? '#666' : '#999';
    x.fillText('-', 128, 82);
    x.font = "600 13px 'Saira Semi Condensed', monospace";
    x.fillStyle = led ? '#9aa0a3' : '#555';
    x.fillText(a.t(`home.${a.venue}`), 70, 118);
    x.fillText(a.t(`away.${a.venue}`), 186, 118);
    stx.needsUpdate = true;
  };
  board();

  // 球员
  const cast = a.opts.cast;
  const homes = dbl
    ? [
        [
          { x: -12.2, z: 2.2 },
          { x: -3.6, z: -2.0 },
        ],
        [
          { x: 12.2, z: -2.2 },
          { x: 3.6, z: 2.0 },
        ],
      ]
    : [[{ x: -12.3, z: 0 }], [{ x: 12.3, z: 0 }]];
  homes.forEach((hs, t) => {
    hs.forEach((h, i) => {
      const at = { x: h.x, z: h.z, lock: t === 0 ? EAST : WEST, base: 'ready' as const };
      const p = (
        t === 0
          ? a.cast(cast?.players?.[i], at, () => a.person({ team: true, ...at, racket: '#2c5fbf' }))
          : a.person({ opp: true, ...at, racket: '#d6362f' })
      ) as Player;
      p.team = t as 0 | 1;
      p.home = h;
      p.net = dbl && i === 1;
      S.teams[t as 0 | 1].push(p);
    });
  });
  const coach = a.borrow(cast?.coach, { x: -4.4, z: -7.8, yaw: 0.3 });
  if (coach) coach.idleFace = 0.6;
  let presenter: Person | null = null;
  if (tier >= 3 && finale) {
    presenter = a.spawn({
      x: -2.5,
      z: -9.6,
      yaw: SOUTH,
      shirt: '#1e2d4a',
      shorts: '#1e2d4a',
      pants: true,
      skin: a.pick(SKIN),
      hair: '#cfcac0',
      hairStyle: 'bald',
      shoes: '#2a2a2a',
    });
    presenter.root.visible = false;
  }

  /* ---------------- 比赛逻辑 ---------------- */
  const server = (): 0 | 1 => (S.k === 0 ? 0 : Math.floor((S.k - 1) / 2) % 2 === 0 ? 1 : 0);
  const skill = (t: number) =>
    t === 0 ? clamp(0.5 + 0.12 * a.num('diff') - 0.28 * a.f + 0.03 * (a.c - 3) - (a.wind ? 0.03 : 0), 0.1, 0.92) : 0.5;
  const pressure = (t: number) => {
    if (!S.big) return 0;
    const tp = 0.03 * tier;
    return t === 0 ? tp * (0.5 + a.f) * (1 + (3 - a.c) * 0.25) : tp * 0.6;
  };
  const reset = () => {
    const tot = S.score[0] + S.score[1];
    const deuce = tot % 2 === 0;
    const sv = server();
    S.teams.forEach((tm, t) => {
      tm.forEach((p) => {
        p.clearMoves();
        p.stroke = null;
        p.base = 'ready';
        p.lock = t === 0 ? EAST : WEST;
        let z: number;
        if (!dbl) z = (t === 0 ? 1 : -1) * (deuce ? 0.8 : -0.8) * (t === sv ? 1 : 2.6);
        else if (!p.net) z = (t === 0 ? 1 : -1) * (deuce ? 0.9 : -0.9) * (t === sv ? 1 : 2.5);
        else z = (t === 0 ? -1 : 1) * (deuce ? 1.8 : -1.8);
        p.go(p.home.x, z, 2.4);
      });
    });
  };
  const point = () => {
    if (S.over || !a.alive) return;
    S.big = false;
    S.shots = 0;
    const lead: 0 | 1 | -1 = S.score[0] > S.score[1] ? 0 : S.score[1] > S.score[0] ? 1 : -1;
    if (lead !== -1 && S.score[lead] >= 6) {
      S.big = true;
      a.pop(
        a.t(lead === 0 ? 'matchPoint' : 'oppMatchPoint'),
        { x: 0, y: 3.2, z: 0 },
        {
          fg: lead === 0 ? '#ffd84a' : '#ff6b5a',
          h: 1.1,
          dur: 1.8,
        },
      );
      for (const f of fans) f.react('stand', a.now, 6);
    }
    reset();
    a.at(1.4, () => serveBall(false));
  };
  const serveBall = (second: boolean) => {
    const t = server();
    const srv = S.teams[t].find((p) => !p.net) as Player;
    const rt = (1 - t) as 0 | 1;
    const rcv = S.teams[rt].find((p) => !p.net) as Player;
    const ball = a.pool.get(srv);
    S.ball = ball;
    ball.holdAt(srv.handL);
    a.swing(srv, 'serve', a.now + 1.6);
    const L = srv.lock ?? EAST;
    const f = fwd(L);
    const r = rgt(L);
    const C = { x: srv.pos.x + f.x * 0.45 + r.x * 0.25, y: 2.55, z: srv.pos.z + f.z * 0.45 + r.z * 0.25 };
    a.at(0.75, () => ball.arc(a.lp(srv.handL), C, a.now, 0.85));
    a.at(1.6, () => {
      const sx = t === 0 ? 1 : -1;
      const boxZ = -Math.sign(srv.pos.z || 1) * a.rr(0.6, 3.6);
      const pF = t === 0 ? clamp(0.18 + 0.25 * a.f + pressure(0) * 2, 0.05, 0.6) : 0.2;
      if (a.chance(pF)) {
        intoNet(a, ball, C, { x: 0, y: a.rr(0.4, 0.85), z: boxZ * 0.5 }, a.now, 20);
        ball.fadeOut(a.now + 1.8);
        if (!second) {
          a.at(0.5, () => a.pop(a.t('firstFault'), srv, { fg: '#ff9a80', h: 0.4 }));
          a.at(1.6, () => serveBall(true));
        } else
          a.at(0.7, () => {
            a.pop(a.t('doubleFault'), srv, { fg: '#ff6b5a', h: 0.65 });
            a.emote(srv, t === 0 && a.f > 0.5 ? 'sweat' : 'anger', 1.4);
            pointEnd(rt, 'df');
          });
        return;
      }
      const B = { x: sx * a.rr(2, 6), y: BR, z: boxZ };
      const ace = a.chance(0.06 + 0.08 * (skill(t) - 0.5) + (second ? -0.04 : 0));
      const sh = shot(a, ball, C, B, a.now, second ? 17 : 24, 0.95, 3.2, 0, 1.0);
      if (ace) {
        const s = standFor(rcv, sh.P2, sideOf(rcv, sh.P2));
        rcv.clearMoves();
        rcv.go(lerp(rcv.pos.x, s.x, 0.5), lerp(rcv.pos.z, s.z, 0.5), 5);
        a.at(sh.tC - a.now - 0.35, () => {
          rcv.clearMoves();
          a.fall(rcv, 'face', 1.4, { slide: 2 });
        });
        a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir, 4));
        ball.fadeOut(sh.tC + 2);
        a.at(sh.tC - a.now + 0.1, () => {
          a.pop(a.t('ace'), { x: sh.P2.x, y: 1.6, z: sh.P2.z }, { fg: '#ffd84a', h: 0.95 });
          a.flash({ x: sh.P2.x, y: 1.2, z: sh.P2.z }, 1.4);
          pointEnd(t, 'ace');
        });
        return;
      }
      receive(rcv, sh, ball);
    });
  };
  const receive = (p: Player, sh: Shot, ball: Ball) => {
    const side = sideOf(p, sh.P2);
    const ok = chase(p, sh.P2, a.now, sh.tC, side, side > 0 ? 'fh' : 'bh', 7.5);
    if (!ok) {
      p.stroke = null;
      a.at(sh.tC - a.now - 0.3, () => {
        p.clearMoves();
        a.fall(p, 'face', 1.4, { slide: 2.6 });
        a.pop(a.t('dive'), p, { fg: '#ffb070', h: 0.5 });
      });
      a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir));
      ball.fadeOut(sh.tC + 2);
      a.at(sh.tC - a.now + 0.2, () => pointEnd((1 - p.team) as 0 | 1, 'winner'));
      return;
    }
    a.at(sh.tC - a.now, () => hit(p, sh.P2, ball, false));
  };
  const hit = (p: Player, P0: XYZ, ball: Ball, volley: boolean) => {
    const t = p.team;
    const ot = (1 - t) as 0 | 1;
    const sx = t === 0 ? 1 : -1;
    S.shots++;
    a.at(0.45, () => {
      if (!p.down && !S.over) {
        p.clearMoves();
        p.go(p.home.x, p.net ? p.pos.z : p.home.z * 0.3 + P0.z * 0.25, 2.6);
      }
    });
    const s = skill(t);
    const pE = clamp(
      0.15 -
        0.16 * (s - 0.5) +
        pressure(t) +
        (a.wind ? 0.03 : 0) +
        (a.rain ? 0.02 : 0) +
        (a.heat && t === 0 ? 0.02 : 0),
      0.03,
      0.6,
    );
    const pW = clamp(0.07 + 0.16 * (s - 0.5) + (volley ? 0.35 : 0) + S.shots * 0.006, 0.02, 0.6);
    const r = a.rand();
    if (r < pE) {
      if (a.chance(0.5)) {
        intoNet(a, ball, P0, { x: 0, y: a.rr(0.3, 0.85), z: a.rr(-4, 4) }, a.now, 18);
        a.at(0.5, () => a.pop(a.t('net'), p, { fg: '#ff9a80', h: 0.42 }));
      } else {
        const B = { x: sx * a.rr(12.2, 13.6), y: BR, z: a.rr(-5, 5) };
        away(a, ball, P0, B, a.now, fly(P0, B, 19, 0));
        a.at(0.9, () => a.say(ump, a.t('out'), 1.4));
      }
      ball.fadeOut(a.now + 2.2);
      if (t === 0 && a.f > 0.55) a.at(0.6, () => a.emote(p, 'sweat', 1.2));
      a.at(1.2, () => pointEnd(ot, 'err'));
      return;
    }
    const opp = S.teams[ot];
    if (r < pE + pW) {
      const B = { x: sx * a.rr(8.5, 11.2), y: BR, z: a.pick([-1, 1]) * a.rr(3.6, 5.2) };
      const sh = shot(a, ball, P0, B, a.now, a.rr(24, 28), 0.9, 3, 0);
      const d = a.nearest(opp, sh.P2) as Player;
      const s2 = standFor(d, sh.P2, sideOf(d, sh.P2));
      d.clearMoves();
      d.go(lerp(d.pos.x, s2.x, 0.6), lerp(d.pos.z, s2.z, 0.6), 6.5);
      a.at(sh.tC - a.now - 0.35, () => {
        d.clearMoves();
        a.fall(d, 'face', 1.4, { slide: 2.6 });
      });
      a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir, 4));
      ball.fadeOut(sh.tC + 2);
      a.at(sh.tC - a.now + 0.1, () => {
        a.pop(a.t(volley ? 'volleyWinner' : 'winner'), { x: sh.P2.x, y: 1.5, z: sh.P2.z }, { fg: '#ffe45c', h: 0.75 });
        pointEnd(t, 'winner');
      });
      return;
    }
    const B = { x: sx * a.rr(6.5, 10.8), y: BR, z: a.rr(-4.6, 4.6) };
    const T1 = fly(P0, B, a.rr(16, 20), 0);
    const netP = opp.find((q) => q.net);
    if (netP && !volley) {
      const xN = netP.pos.x;
      const u = (xN - P0.x) / (B.x - P0.x);
      const zN = P0.z + (B.z - P0.z) * u;
      if (u > 0 && u < 1 && Math.abs(zN - netP.pos.z) < 1.8 && a.chance(0.4)) {
        const VP = { x: xN - sx * 0.4, y: 1.1, z: zN };
        const tv = a.now + T1 * u;
        ball.arc(P0, VP, a.now, Math.max(0.25, T1 * u));
        const side = sideOf(netP, VP);
        netP.clearMoves();
        const sd = standFor(netP, VP, side);
        netP.go(sd.x, sd.z, 6);
        a.swing(netP, 'volley', tv);
        a.at(tv - a.now, () => hit(netP, VP, ball, true));
        return;
      }
    }
    const sh = shot(a, ball, P0, B, a.now, a.rr(16, 20), a.rr(0.85, 1), a.rr(2.6, 3.4), 0);
    const cands = opp.filter((q) => !q.net || Math.abs(sh.P2.x) < 6);
    const rcv = (a.nearest(cands.length ? cands : opp, sh.P2) ?? opp[0]) as Player;
    if (S.shots === 7)
      a.at(0.3, () => {
        a.pop(a.t('longRally'), { x: 0, y: 3, z: 0 }, { fg: '#ffffff', h: 0.6 });
        for (const f of fans) f.react('ooh', a.now + a.rr(0, 0.3), 1.2);
      });
    receive(rcv, sh, ball);
  };
  const pointEnd = (win: 0 | 1, how: 'ace' | 'winner' | 'err' | 'df') => {
    if (S.over) return;
    S.score[win]++;
    S.k++;
    board();
    for (const f of fans) {
      if (f.team === win) f.react('cheer', a.now + a.rr(0, 0.4), 1.5);
      else f.react(tier >= 3 && a.chance(0.4) ? 'clap' : 'sad', a.now + a.rr(0, 0.3), 1.2);
    }
    const winners = fans.filter((q) => q.team === win);
    if (winners.length && a.chance(0.45)) {
      const fp = a.pick(winners).g.position;
      a.at(0.5, () =>
        a.pop(
          a.t(`fanShout.${a.venue}.${win}`),
          { x: fp.x, y: fp.y + 1.3, z: fp.z },
          {
            fg: a.venue === 'maple' && win === 0 ? '#e6b03c' : '#ffffff',
            h: 0.45,
          },
        ),
      );
    }
    if (tier === 4 && win === 0 && a.chance(0.25))
      a.at(1.6, () => {
        for (const f of fans) f.react('wave', a.now + (f.g.position.x + 12) * 0.07, 0.9);
      });
    if (win === 0 && how !== 'err' && how !== 'df')
      a.at(0.3, () => {
        const p = S.teams[0][0] as Player;
        if (!p.down) {
          a.gesture(p, 'cheer', 0.9);
          if (how === 'ace' || how === 'winner') a.pop(a.t(a.c >= 4 ? 'nice' : 'good'), p, { fg: '#9cf0b4', h: 0.42 });
        }
      });
    if (press && (how === 'ace' || how === 'winner'))
      press.forEach((p, i) => {
        a.at(0.15 * i, () => {
          const h = a.lp(p.handR);
          a.flash({ x: h.x, y: h.y + 0.3, z: h.z }, 0.9);
        });
      });
    if (kids && S.ball) {
      const bp = { x: S.ball.m.position.x, z: S.ball.m.position.z };
      const kid = a.nearest(kids, bp) as Person;
      const home = { x: kid.pos.x, z: kid.pos.z };
      a.at(0.8, () => {
        kid.base = 'relaxed';
        kid.clearMoves();
        kid.go(clamp(bp.x, -15, 15), clamp(bp.z, -7.5, 7.5), 5);
        kid.call(() => a.gesture(kid, 'hand', 0.4));
        kid.wait(0.4);
        kid.go(home.x, home.z, 4.5);
        kid.call(() => {
          kid.base = 'crouchBK';
          kid.idleFace = home.z > 0 ? NORTH : SOUTH;
        });
      });
    }
    const [a0, a1] = S.score;
    if ((a0 >= 7 || a1 >= 7) && Math.abs(a0 - a1) >= 2) {
      if (finale) {
        S.over = true;
        a.at(1.2, () => end(a0 > a1 ? 0 : 1));
      } else {
        // 不演胜负：比分清零，接着打下一盘
        a.pop(a.t('nextSet'), { x: 0, y: 2.8, z: 0 }, { fg: '#ffffff', h: 0.7, dur: 1.6 });
        S.score = [0, 0];
        S.k = 0;
        a.at(1.8, () => board());
        a.at(3.2, point);
      }
      return;
    }
    a.pop(`${a0} - ${a1}`, { x: 0, y: 2.6, z: 0 }, { fg: '#ffffff', h: 0.6, dur: 1.2 });
    if (a.rain && S.k % 5 === 0) {
      pause(true);
      return;
    }
    if (a.heat && S.k % 6 === 0) {
      pause(false);
      return;
    }
    a.at(2.4, point);
  };
  const pause = (rain: boolean) => {
    a.pop(
      a.t(rain ? 'rainDelay' : 'changeEnds'),
      { x: 0, y: 3, z: 0 },
      { fg: rain ? '#9fdcff' : '#ffcf8a', h: 0.8, dur: 2 },
    );
    const seats = [
      [-3.1, -7.2],
      [-2.1, -7.2],
      [3.1, -7.2],
      [2.1, -7.2],
    ];
    S.teams.forEach((tm, t) => {
      tm.forEach((p, j) => {
        const s = seats[t * 2 + j] as number[];
        p.clearMoves();
        p.lock = null;
        p.base = 'relaxed';
        p.go(s[0] as number, (s[1] as number) + 0.4, 2.4);
        p.call(() => {
          p.idleFace = SOUTH;
          p.seatY = a.gy(p.pos.x, p.pos.z) - 0.4;
          p.base = 'seated';
          if (rain) p.overlay('towel', true);
          else {
            p.give('L', mkBottle());
            a.gesture(p, 'drink', 1.4);
            a.at(1.6, () => {
              a.gesture(p, 'pour', 1);
              a.at(0.3, () => {
                const h = a.lp(p.headTop);
                a.fx.splash(h.x, h.y, h.z, 12);
              });
            });
          }
        });
      });
    });
    a.at(rain ? 6 : 6.5, () => {
      for (const tm of S.teams)
        for (const p of tm) {
          p.seatY = null;
          p.overlay('towel', false);
          p.take('L');
          p.base = 'ready';
        }
      point();
    });
  };
  const end = (win: 0 | 1) => {
    const lose = (1 - win) as 0 | 1;
    const W = S.teams[win];
    const Lt = S.teams[lose];
    a.pop(
      a.t(win === 0 ? 'victory' : 'defeat'),
      { x: 0, y: 3.4, z: 0 },
      {
        fg: win === 0 ? '#ffd84a' : '#a9b4c0',
        h: 1.3,
        dur: 2.6,
      },
    );
    for (const f of fans) f.react(f.team === win ? 'cheer' : 'sad', a.now + a.rr(0, 0.5), 4);
    for (const p of W) {
      p.clearMoves();
      a.fall(p, 'back', 2.0);
    }
    if (tier >= 2)
      for (let i = 0; i < 5; i++) a.at(i * 0.35, () => a.fx.confetti(a.rr(-10, 10), 3.5, a.rr(-8, -6), 40, 2));
    for (const p of Lt) {
      p.clearMoves();
      p.stroke = null;
      p.base = 'slump';
    }
    const all = [...W, ...Lt];
    a.at(2.2, () =>
      all.forEach((p) => {
        p.clearMoves();
        p.lock = null;
        p.go(p.team === 0 ? -0.6 : 0.6, p.pos.z * 0.3 + (p.net ? 0.6 : 0), 2.4);
        p.call(() => {
          p.lock = p.team === 0 ? EAST : WEST;
          a.gesture(p, 'shake', 1.2);
        });
      }),
    );
    a.at(5.2, () => {
      for (const p of all) p.lock = null;
      if (win === 0) {
        const star = W[0] as Player;
        if (presenter) {
          const pr = presenter;
          pr.root.visible = true;
          pr.give('R', mkTrophy());
          pr.base = 'carry';
          pr.path(
            [
              { x: -2.5, z: -7.9 },
              { x: -1.6, z: -1.2 },
            ],
            2.4,
          );
          star.clearMoves();
          star.go(-1.6, 0.2, 2);
          star.call(() => {
            star.watch = pr;
          });
          pr.call(() => {
            pr.watch = star;
            pr.take('R');
            pr.base = 'relaxed';
            star.give('R', mkTrophy());
            a.gesture(star, 'cheer', 4);
            a.hop(star, 0.4, 0.45);
            a.fx.sparkle(star.pos.x, 2.4, star.pos.z, 24);
            a.pop(a.t('champion'), star, { fg: '#ffd84a', h: 0.8 });
            if (press) {
              for (const p of press) {
                p.clearMoves();
                p.base = 'relaxed';
                p.go(star.pos.x + a.rr(-3, 3), star.pos.z + a.rr(1.8, 3), 4);
                p.call(() => {
                  p.base = 'kneel';
                  p.watch = star;
                });
              }
              for (let i = 0; i < 10; i++)
                a.at(0.8 + i * 0.25, () => {
                  const p = a.pick(press as Person[]);
                  const h = a.lp(p.handR);
                  a.flash({ x: h.x, y: h.y + 0.3, z: h.z }, 0.9);
                });
            }
          });
        } else {
          a.gesture(star, 'cheer', 3);
          a.hop(star, 0.4, 0.45);
          for (const q of W) a.gesture(q, 'cheer', 3);
        }
        a.at(2.4, () =>
          a.pop(
            a.t(`headline.${a.venue}.${tier}`),
            { x: 0, y: 4.2, z: 0 },
            {
              fg: '#ffd84a',
              h: [0.7, 0.85, 1.0, 1.25][tier - 1] ?? 0.8,
              dur: 2.8,
            },
          ),
        );
        for (const p of Lt) {
          p.go(p.team === 0 ? -2.6 : 2.6, -6.8, 1.8);
          p.call(() => {
            p.idleFace = SOUTH;
            p.base = 'slump';
          });
        }
      } else {
        Lt.forEach((p, i) => {
          p.go(-2.6 - i, -6.8, 1.6);
          p.call(() => {
            p.idleFace = SOUTH;
            p.seatY = a.gy(p.pos.x, p.pos.z) - 0.4;
            p.base = 'seated';
            p.overlay('towel', true);
            a.emote(p, 'cloud', 4);
            a.pop(a.t('nextTime'), p, { fg: '#a9b4c0', h: 0.45 });
          });
        });
        for (const p of W) {
          a.gesture(p, 'cheer', 3);
          a.hop(p, 0.4, 0.45);
        }
      }
    });
    a.at(13, () => {
      a.finished = true;
    });
  };

  a.at(0.4, () =>
    a.pop(a.t('vs', { opp: a.t(`oppName.${a.venue}`) }), { x: 0, y: 3.4, z: 0 }, { fg: '#ffffff', h: 0.9, dur: 2 }),
  );
  a.at(1.6, point);
  return {
    update() {
      for (const p of S.teams[0]) {
        p.tired = a.f;
        p.speedK = 1 - 0.4 * a.f;
      }
      for (const f of fans) f.update(a.now);
      if (flags)
        flags.forEach((f, i) => {
          f.rotation.y = Math.sin(a.now * (a.wind ? 8 : 2) + i) * (a.wind ? 0.6 : 0.2);
        });
    },
  };
}
