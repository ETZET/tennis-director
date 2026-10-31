import { clamp, lerp } from '@td/shared';
import type { Ball } from '../motion/ball';
import type { Person } from '../people/person';
import { away, chase, coachHelp, drinkBreak, fly, intoNet, pant, shot, sideOf, standFor, through } from './choreo';
import { basket, bench } from './props';
import { type Act, BR, EAST, fwd, rgt, WEST } from './runtime';
import { type Cone, knockCone, mkCone } from './shared-props';

/**
 * 底线喂球：教练在网前喂球，球员正反手轮换，偶尔打中标志桶。
 * 累了会喘气甚至累倒，酷热时要补水；水平低的教练会玩手机。
 * 局部坐标：球网 x=0，球员在 x≈-12.7 的底线。
 */
export function feed(a: Act) {
  const vb = a.vb;
  const BASE_X = -12.7;
  bench(vb, a.rand, -12.7, 5.5, 2.4, 0);
  vb.box(-13.5, 0.45, 5.5, 0.14, 0.26, 0.14, '#3aa0d8');
  vb.box(-13.2, 0.45, 5.5, 0.14, 0.26, 0.14, '#e84a3a');
  vb.box(-12.3, 0.45, 5.5, 0.5, 0.06, 0.3, '#f4f1e8');
  basket(vb, 2.5, -0.45);
  const cones: Cone[] = [
    [3.9, -3.2],
    [4.3, 0.6],
    [3.7, 3.6],
  ].map(([x, z]) => mkCone(a, x as number, z as number));

  const cast = a.opts.cast;
  const coach = a.cast(cast?.coach, { x: 1.8, z: 0.8, lock: WEST }, () =>
    a.coachPerson({ x: 1.8, z: 0.8, lock: WEST, phone: true }),
  );
  a.badge(coach);
  const nPlayers = Math.max(cast?.players?.length ?? 0, a.num('players'));
  const players: Person[] = [];
  for (let i = 0; i < nPlayers; i++) {
    const at =
      i === 0 ? { x: BASE_X, z: 0, lock: EAST, base: 'ready' as const } : { x: -14.2, z: -2 - i * 1.1, yaw: EAST };
    players.push(
      a.cast(cast?.players?.[i], at, () =>
        a.person({ team: true, ...at, racket: a.pick(['#2c5fbf', '#d6362f', '#1f1f1f']) }),
      ),
    );
  }
  let pl = players[0] as Person;
  const S = { n: 0, busy: false, fh: true };

  const loop = () => {
    if (S.busy) return;
    if (a.c <= 2 && a.chance(a.c === 1 ? 0.22 : 0.08)) {
      S.busy = true;
      coach.base = 'phoneStand';
      if (coach.phone) coach.phone.visible = true;
      a.emote(coach, 'zzz', 2.4);
      a.at(0.8, () => {
        a.emote(pl, 'ques', 1.4);
        a.gesture(pl, 'shrug', 1.2);
      });
      a.at(2.8, () => {
        coach.base = 'relaxed';
        if (coach.phone) coach.phone.visible = false;
        S.busy = false;
        loop();
      });
      return;
    }
    S.n++;
    if (players.length > 1 && S.n % 6 === 0) {
      // 换人：打完的去排队，下一个上来
      S.busy = true;
      const out = pl;
      players.push(players.shift() as Person);
      pl = players[0] as Person;
      out.clearMoves();
      out.stroke = null;
      out.lock = null;
      out.base = 'relaxed';
      players.forEach((p, i) => {
        if (i === 0) return;
        p.go(-14.2, -2 - i * 1.1, 2);
        p.call(() => {
          p.idleFace = EAST;
        });
      });
      pl.clearMoves();
      pl.go(BASE_X, 0, 2.4);
      pl.call(() => {
        pl.lock = EAST;
        pl.base = 'ready';
      });
      a.at(2.6, () => {
        S.busy = false;
        loop();
      });
      return;
    }
    if (a.heat && S.n % 6 === 0) {
      S.busy = true;
      drinkBreak(a, pl, { x: -12.7, z: 4.8 }, () => {
        S.busy = false;
        loop();
      });
      return;
    }
    if (a.f > 0.5 && S.n % 5 === 0) {
      S.busy = true;
      const r = pant(a, pl, () => {
        S.busy = false;
        pl.clearMoves();
        pl.go(BASE_X, 0, 2);
        loop();
      });
      if (r === 'collapse') a.at(1.3, () => coachHelp(a, coach, pl));
      return;
    }
    feedOne();
    a.at(lerp(3.3, 2.5, (a.c - 1) / 4) + a.f * 0.7, loop);
  };

  const feedOne = () => {
    const ball = a.pool.get(coach);
    ball.holdAt(coach.handL);
    const L = coach.lock ?? WEST;
    const f = fwd(L);
    const r = rgt(L);
    const C = { x: coach.pos.x + r.x * 0.6 + f.x * 0.75, y: 0.78, z: coach.pos.z + r.z * 0.6 + f.z * 0.75 };
    a.swing(coach, 'feed', a.now + 0.55);
    a.at(0.25, () => ball.arc(a.lp(coach.handL), C, a.now, 0.3));
    a.at(0.55, () => {
      const fh = S.fh;
      S.fh = !S.fh;
      const wild = a.chance([0.35, 0.2, 0.1, 0.05, 0.02][a.c - 1] ?? 0.1);
      if (wild && a.chance(0.4)) {
        intoNet(a, ball, C, { x: 0, y: a.rr(0.3, 0.7), z: a.rr(-2, 2) }, a.now, 8);
        ball.fadeOut(a.now + 2.4);
        a.pop(a.t('feedNet'), coach, { fg: '#ffb070', h: 0.42 });
        a.at(0.6, () => {
          a.emote(pl, 'ques', 1.4);
          a.gesture(pl, 'shrug', 1.2);
        });
        return;
      }
      const B = wild
        ? { x: a.rr(-10.5, -7), y: BR, z: (fh ? 1 : -1) * a.rr(4.3, 5.3) }
        : { x: a.rr(-9.7, -8.3), y: BR, z: (fh ? 1 : -1) * a.rr(0.8, 2.4) };
      const sh = shot(a, ball, C, B, a.now, a.rr(10.5, 12.5), a.rr(0.82, 1), a.rr(2.6, 3.2), 0);
      const side = sideOf(pl, sh.P2);
      const stroke = side > 0 ? 'fh' : 'bh';
      if (a.rain && a.chance(0.16)) {
        const s = standFor(pl, sh.P2, side);
        pl.clearMoves();
        pl.go(lerp(pl.pos.x, s.x, 0.55), lerp(pl.pos.z, s.z, 0.55), 4.5);
        a.at(0.45, () => {
          pl.clearMoves();
          a.fall(pl, 'face', 1.9, { slide: 3 });
          a.pop(a.t('slip'), pl, { fg: '#9fdcff' });
        });
        a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir));
        ball.fadeOut(sh.tC + 2.5);
        a.at(2.6, () => {
          pl.clearMoves();
          pl.go(BASE_X, 0, 2);
        });
        return;
      }
      const ok = chase(pl, sh.P2, a.now, sh.tC, side, stroke, 6.6);
      if (!ok) {
        pl.stroke = null;
        a.at(Math.max(0, sh.tC - a.now - 0.3), () => {
          pl.clearMoves();
          a.fall(pl, 'face', 1.5, { slide: 2.6 });
          a.pop(a.t('cantReach'), pl, { fg: '#ffb070' });
        });
        a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir));
        ball.fadeOut(sh.tC + 2.5);
        a.at(sh.tC - a.now + 1.9, () => {
          pl.clearMoves();
          pl.go(BASE_X, 0, 2);
        });
        return;
      }
      a.at(sh.tC - a.now, () => hit(ball, sh.P2));
    });
  };

  const hit = (ball: Ball, P0: { x: number; y: number; z: number }) => {
    a.at(0.45, () => {
      if (!pl.down) {
        pl.clearMoves();
        pl.go(BASE_X, P0.z * 0.3, 2.4);
      }
    });
    const err = clamp(0.1 + 0.5 * a.f + (a.wind ? 0.08 : 0) + (a.rain ? 0.05 : 0) - 0.025 * (a.c - 1), 0.03, 0.85);
    if (a.chance(err)) {
      if (a.chance(0.55)) {
        intoNet(a, ball, P0, { x: 0, y: a.rr(0.3, 0.8), z: a.rr(-3, 3) }, a.now, 14);
        a.pop(a.t('net'), pl, { fg: '#ff8a70', h: 0.45 });
      } else {
        const B = { x: Math.min(a.rr(12.2, 13), a.b.x1 - 0.2), y: BR, z: a.rr(-4, 4) };
        away(a, ball, P0, B, a.now, fly(P0, B, 16, 0));
        a.at(0.6, () => a.pop(a.t('out'), { x: B.x - 1.5, y: 0.6, z: clamp(B.z, -4, 4) }, { fg: '#ff8a70' }));
      }
      ball.fadeOut(a.now + 2.6);
      a.at(0.5, () => a.emote(pl, a.f > 0.55 ? 'sweat' : a.chance(0.5) ? 'anger' : 'sad', 1.3));
      if (a.c <= 2 && a.chance(0.4)) a.at(0.8, () => a.emote(coach, 'zzz', 1.6));
      return;
    }
    const free = cones.filter((k) => !k.flying);
    const tgt = free.length && a.chance(0.1 + 0.05 * a.c) ? a.pick(free) : null;
    const B = tgt ? { x: tgt.home.x, y: BR, z: tgt.home.z } : { x: a.rr(2.3, 4.8), y: BR, z: a.rr(-4.6, 4.6) };
    const T1 = fly(P0, B, a.rr(15, 19) * (1 - 0.25 * a.f), 0);
    away(a, ball, P0, B, a.now, T1);
    ball.fadeOut(a.now + T1 + 2.2);
    if (tgt)
      a.at(T1, () => {
        knockCone(a, tgt);
        a.fx.sparkle(tgt.home.x, 0.6, tgt.home.z, 14);
        a.pop(a.t('hitTarget'), { x: tgt.home.x, y: 0.9, z: tgt.home.z }, { fg: '#ffe45c', h: 0.7 });
      });
    if (a.c >= 4 && a.chance(0.4)) {
      a.at(0.7, () => {
        a.gesture(coach, 'clap', 1.1);
        a.pop(a.t('praise'), coach, { fg: '#d9ec52', h: 0.45 });
      });
      if (a.chance(a.c === 5 ? 0.5 : 0.3))
        a.at(1.3, () => {
          a.fx.sparkle(pl.pos.x, 1.3, pl.pos.z, 12);
          a.pop(a.t('progress'), pl, { fg: '#9cf0b4', h: 0.42 });
        });
    } else if (a.c === 3 && a.chance(0.2)) a.at(0.7, () => a.pop(a.t('notBad'), coach, { fg: '#e8e4d8', h: 0.4 }));
  };

  a.at(1, loop);
  return {
    update() {
      for (const p of players) {
        p.tired = a.f;
        p.speedK = 1 - 0.45 * a.f;
      }
    },
  };
}
