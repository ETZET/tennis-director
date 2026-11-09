import { clamp } from '@td/shared';
import { Group } from '../core/graph';
import { type SignText, signBoard } from '../fx/sprites';
import { part } from '../people/parts';
import { away, bounce, coachHelp, drinkBreak, fly, intoNet, pant } from './choreo';
import { basket } from './props';
import { type Act, BR, EAST, fwd, rgt } from './runtime';

interface Target {
  g: Group;
  tubes: Group[];
  home: { x: number; z: number };
  alive: boolean;
}

/**
 * 发球打靶：对角发球，打中球罐会把罐子炸飞。测速牌显示球速；两次失误是双误，脾气差的会摔拍。
 * 球网 x=0，发球手站在左边底线外。
 */
export function serve(a: Act) {
  const vb = a.vb;
  basket(vb, -11.6, 2.4);
  const tube = a.style.tube;
  const mkT = (x: number, z: number): Target => {
    const g = new Group();
    g.position.set(x, 0.02, z);
    a.group.add(g);
    const tubes = (
      [
        [0, 0, -0.15],
        [0, 0, 0.15],
        [0, 0.62, 0],
      ] as const
    ).map(([u, y, v]) => {
      const t = new Group();
      part(t, 0.24, 0.56, 0.24, 0, 0.28, 0, tube[0]);
      part(t, 0.26, 0.07, 0.26, 0, 0.59, 0, tube[1]);
      part(t, 0.25, 0.12, 0.25, 0, 0.3, 0, tube[2]);
      t.position.set(u, y, v);
      t.userData.home = { x: u, y, z: v };
      g.add(t);
      return t;
    });
    return { g, tubes, home: { x, z }, alive: true };
  };
  const targets = [mkT(5.5, -3.4), mkT(5.5, -0.55)];

  // 测速牌
  vb.box(-3.4, 0, -5.85, 0.1, 1.3, 0.1, '#3a3a36');
  vb.box(-3.4, 1.25, -5.86, 2.05, 0.92, 0.06, '#1a1612');
  // 自发光的屏：左边大字球速，右下角单位；单位放不下（远景、手机 1 档）就不写，只留数字
  let face: SignText[] = [];
  const board = a.own(signBoard(1.9, 0.8, () => ({ bg: '#120f0c', glow: true, texts: face })));
  board.position.set(-3.4, 1.7, -5.8);
  const radar = (v: string | number, col = '#ff5a3a') => {
    face = [
      { text: String(v), color: col, u: -0.3, w: 1.2, h: 0.72 },
      { text: 'KM/H', color: '#d9ec52', u: 0.6, v: -0.2, w: 0.6, h: 0.32 },
    ];
  };
  radar('---', '#5a4a40');

  const HOME = { x: -12.1, z: 0.9 };
  const COACH = { x: -10.2, z: 4.6 };
  const cast = a.opts.cast;
  const srv = a.cast(cast?.players?.[0], { ...HOME, lock: EAST, base: 'ready' }, () =>
    a.person({ team: true, ...HOME, lock: EAST, base: 'ready', racket: '#2c5fbf' }),
  );
  const coach = a.cast(cast?.coach, COACH, () =>
    a.coachPerson({ ...COACH, phone: true, racket: a.c >= 4 ? '#d6362f' : undefined }),
  );
  coach.watch = srv;
  a.badge(coach);
  const S = { k: 0, faults: 0, busy: false };

  const blowTubes = (t: Target) => {
    t.alive = false;
    for (const tb of t.tubes) {
      const w = a.lp(tb);
      t.g.remove(tb);
      a.group.add(tb);
      tb.position.set(w.x, w.y, w.z);
      a.fling(
        tb,
        { x: a.rr(1, 4), y: a.rr(3.5, 6), z: a.rr(-2.5, 2.5) },
        { x: a.rr(-14, 14), z: a.rr(-14, 14) },
        { b: 2 },
      );
    }
    a.at(2.8, () => {
      for (const tb of t.tubes) {
        a.unfling(tb);
        a.group.remove(tb);
        t.g.add(tb);
        const h = tb.userData.home as { x: number; y: number; z: number };
        tb.position.set(h.x, h.y, h.z);
        tb.rotation.set(0, 0, 0);
      }
      t.alive = true;
      const t0 = a.now;
      t.g.scale.setScalar(0.01);
      a.onFrame(() => {
        const u = clamp((a.now - t0) / 0.3, 0, 1);
        t.g.scale.setScalar(Math.max(0.01, u + Math.sin(u * Math.PI) * 0.3 * (1 - u)));
        return u >= 1;
      });
      a.fx.sparkle(t.home.x, 0.4, t.home.z, 8, '#ffffff');
    });
  };

  const loop = () => {
    if (S.busy) return;
    S.k++;
    if (a.c <= 2 && a.chance(a.c === 1 ? 0.3 : 0.12) && coach.base !== 'phoneStand') {
      coach.base = 'phoneStand';
      if (coach.phone) coach.phone.visible = true;
      a.emote(coach, 'zzz', 2.6);
      a.at(3, () => {
        coach.base = 'relaxed';
        if (coach.phone) coach.phone.visible = false;
      });
    }
    if (a.heat && S.k % 5 === 0) {
      S.busy = true;
      drinkBreak(a, srv, { x: -11, z: 3.4 }, () => {
        S.busy = false;
        loop();
      });
      return;
    }
    if (a.f > 0.5 && S.k % 4 === 0) {
      S.busy = true;
      const r = pant(a, srv, () => {
        S.busy = false;
        srv.clearMoves();
        srv.go(HOME.x, HOME.z, 2);
        loop();
      });
      if (r === 'collapse') a.at(1.3, () => coachHelp(a, coach, srv));
      return;
    }
    if (a.c >= 4 && S.k % 5 === 0) {
      // 教练亲自示范
      S.busy = true;
      coach.watch = null;
      coach.clearMoves();
      coach.go(-10.8, 3.0, 2);
      coach.call(() => {
        coach.lock = EAST;
        a.swing(coach, 'serve', a.now + 1.6);
        a.pop(a.t('demo'), coach, { fg: '#d9ec52', h: 0.45 });
      });
      coach.wait(2.4);
      coach.call(() => {
        coach.lock = null;
        a.emote(srv, 'bulb', 1.2);
      });
      coach.go(COACH.x, COACH.z, 2);
      coach.call(() => {
        coach.watch = srv;
        S.busy = false;
        loop();
      });
      return;
    }
    one();
    a.at(3.5, loop);
  };

  const one = () => {
    const ball = a.pool.get(srv);
    ball.holdAt(srv.handL);
    a.swing(srv, 'serve', a.now + 1.6);
    const L = srv.lock ?? EAST;
    const f = fwd(L);
    const r = rgt(L);
    const C = { x: srv.pos.x + f.x * 0.45 + r.x * 0.25, y: 2.55, z: srv.pos.z + f.z * 0.45 + r.z * 0.25 };
    a.at(0.75, () => ball.arc(a.lp(srv.handL), C, a.now, 0.85));
    a.at(1.6, () => {
      const acc = clamp(0.42 + 0.07 * (a.c - 1) - 0.35 * a.f - (a.wind ? 0.12 : 0) - (a.rain ? 0.05 : 0), 0.06, 0.92);
      const kmh = Math.round(150 + 9 * (a.c - 1) - 45 * a.f + a.rr(-8, 8));
      const vis = kmh / 6.2;
      radar(kmh, kmh >= 176 ? '#ffd84a' : '#ff5a3a');
      const roll = a.rand();
      const alive = targets.filter((t) => t.alive);
      if (roll < acc * 0.55 && alive.length) {
        const t = a.pick(alive);
        const B = { x: t.home.x, y: 0.45, z: t.home.z };
        const T1 = fly(C, B, vis, 0, 1.0);
        ball.arc(C, B, a.now, T1);
        a.at(T1, () => {
          blowTubes(t);
          bounce(a, ball, B, { x: 2.5, y: 1.4, z: 0.5 }, a.now);
          ball.fadeOut(a.now + 2);
          S.faults = 0;
          a.fx.sparkle(B.x, 0.8, B.z, 16);
          const ace = kmh >= 176;
          a.pop(
            a.t(ace ? 'ace' : 'hitTarget'),
            { x: B.x, y: 1.3, z: B.z },
            { fg: ace ? '#ffd84a' : '#fff27a', h: ace ? 1.0 : 0.7 },
          );
          if (ace) {
            a.flash({ x: B.x, y: 1, z: B.z }, 1.8);
            a.shake = 0.35;
          }
          a.at(0.4, () => {
            a.gesture(srv, 'cheer', 1.0);
            a.hop(srv, 0.25, 0.35);
          });
        });
        return;
      }
      if (roll < acc) {
        const B = { x: a.rr(1.5, 6), y: BR, z: -a.rr(0.4, 3.9) };
        away(a, ball, C, B, a.now, fly(C, B, vis, 0, 1.0));
        ball.fadeOut(a.now + 2.6);
        S.faults = 0;
        return;
      }
      S.faults++;
      if (a.chance(0.6)) intoNet(a, ball, C, { x: 0, y: a.rr(0.4, 0.85), z: -a.rr(0.3, 3) }, a.now, vis);
      else {
        const B = a.chance(0.5)
          ? { x: a.rr(6.9, 8.2), y: BR, z: -a.rr(0.5, 3.5) }
          : { x: a.rr(2, 6), y: BR, z: -a.rr(4.4, 5.3) };
        away(a, ball, C, B, a.now, fly(C, B, vis, 0, 1.0));
      }
      ball.fadeOut(a.now + 2.6);
      if (S.faults >= 2) {
        S.faults = 0;
        a.at(0.6, () => {
          a.pop(a.t('doubleFault'), srv, { fg: '#ff6b5a', h: 0.65 });
          if (a.f > 0.6 && a.c <= 2) {
            a.gesture(srv, 'smash', 0.55);
            a.at(0.3, () => {
              a.fx.debris(srv.pos.x + 0.5, 0.1, srv.pos.z, 12, ['#2c5fbf', '#222', '#f4f1e4']);
              a.pop(a.t('smashSfx'), { x: srv.pos.x + 0.6, y: 0.7, z: srv.pos.z }, { fg: '#ffe45c', h: 0.6 });
              a.shake = 0.2;
            });
          } else a.emote(srv, 'anger', 1.4);
        });
      } else a.at(0.5, () => a.pop(a.t('fault'), srv, { fg: '#ff9a80', h: 0.42 }));
    });
  };

  a.at(1.2, loop);
  return {
    update() {
      srv.tired = a.f;
      srv.speedK = 1 - 0.4 * a.f;
    },
  };
}
