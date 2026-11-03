import { clamp, type XYZ } from '@td/shared';
import type { Ball } from '../motion/ball';
import type { Person } from '../people/person';
import { away, chase, fly, intoNet, shot, sideOf, through } from './choreo';
import { PICKLE_GREEN } from './looks';
import { type Act, BR, EAST, WEST } from './runtime';

type Pl = Person & { team: 0 | 1; home: { x: number; z: number } };

/**
 * 匹克球（原型里没有，ADR 0010 新增；游戏里 2 号场租给匹克球队后一直在打）：
 * 网前轻吊（dink）来回，偶尔抽杀，"啪嗒"声很响；一分打完击掌、报分。球网 x=0。
 */
export function pickleball(a: Act) {
  const four = a.num('players') !== 2;
  const homes = four
    ? [
        { x: -2.6, z: -1.5, team: 0 },
        { x: 2.6, z: -1.5, team: 1 },
        { x: -2.6, z: 1.5, team: 0 },
        { x: 2.6, z: 1.5, team: 1 },
      ]
    : [
        { x: -3, z: 0, team: 0 },
        { x: 3, z: 0, team: 1 },
      ];
  const paddles = ['#3a8fd9', '#e8582c', PICKLE_GREEN, '#d63a6a'];
  const cast = a.opts.cast;
  const ps: Pl[] = homes.map((h, i) => {
    const at = { x: h.x, z: h.z, lock: h.team ? WEST : EAST, base: 'pbReady' as const };
    const p = a.cast(cast?.players?.[i], at, () =>
      a.person({
        ...at,
        shirt:
          a.venue === 'hollow'
            ? a.pick([PICKLE_GREEN, '#f2efe6', '#e8b03c'])
            : a.pick(['#e05a8f', '#2fa3a8', '#f0a020', '#8a5ac4']),
        paddle: paddles[i % 4],
        umb: false,
      }),
    ) as Pl;
    p.team = h.team as 0 | 1;
    p.home = { x: h.x, z: h.z };
    return p;
  });
  const team = (t: number) => ps.filter((p) => p.team === t);
  const S = { score: [0, 0], server: 0 as 0 | 1, shots: 0 };

  const rally = () => {
    if (!a.alive) return;
    S.shots = 0;
    for (const p of ps) {
      p.clearMoves();
      p.base = 'pbReady';
      p.lock = p.team ? WEST : EAST;
      p.go(p.home.x, p.home.z, 2);
    }
    const srv = a.pick(team(S.server));
    a.at(1.0, () => {
      const ball = a.pool.get(srv, true);
      const P0 = { x: srv.pos.x + (srv.team ? -0.4 : 0.4), y: 0.55, z: srv.pos.z + 0.3 };
      a.swing(srv, 'dk', a.now + 0.4);
      ball.holdAt(srv.handL);
      a.at(0.4, () => send(srv, P0, ball, false));
    });
  };

  const send = (from: Pl, P0: XYZ, ball: Ball, drive: boolean) => {
    const opp = team(1 - from.team);
    const sx = from.team === 0 ? 1 : -1;
    S.shots++;
    a.pop(a.t('pickleSound'), { x: P0.x, y: P0.y + 0.5, z: P0.z }, { fg: '#b8f08a', h: 0.32, dur: 0.6, rise: 0.3 });
    const err = clamp(0.06 + 0.25 * a.f + (a.wind ? 0.08 : 0) + S.shots * 0.012 + (drive ? 0.12 : 0), 0.04, 0.6);
    if (a.chance(err)) {
      if (a.chance(0.6)) {
        intoNet(a, ball, P0, { x: 0, y: a.rr(0.2, 0.6), z: a.rr(-2, 2) }, a.now, 6);
        a.at(0.4, () => a.pop(a.t('net'), from, { fg: '#ff9a80', h: 0.4 }));
      } else {
        const B = { x: sx * a.rr(7.2, 7.8), y: BR, z: a.rr(-3, 3) };
        away(a, ball, P0, B, a.now, fly(P0, B, drive ? 11 : 7, 0, 0.95));
        a.at(0.8, () => a.pop(a.t('out'), { x: B.x, y: 0.6, z: B.z }, { fg: '#ff8a70', h: 0.45 }));
      }
      ball.fadeOut(a.now + 2);
      a.at(1.4, () => pointEnd((1 - from.team) as 0 | 1));
      return;
    }
    const kitchen = !drive && a.chance(0.7);
    const B = { x: sx * (kitchen ? a.rr(0.6, 1.9) : a.rr(3, 6)), y: BR, z: a.rr(-2.6, 2.6) };
    const sh = shot(
      a,
      ball,
      P0,
      B,
      a.now,
      drive ? 10 : kitchen ? 3.2 : 6,
      kitchen ? 0.45 : 0.7,
      kitchen ? 0.7 : 1.6,
      0,
      0.95,
    );
    const rcv = a.nearest(opp, sh.P2) as Pl;
    const side = sideOf(rcv, sh.P2);
    const ok = chase(rcv, sh.P2, a.now, sh.tC, side, 'dk', drive ? 5 : 4, 0.8);
    if (!ok) {
      rcv.stroke = null;
      a.at(sh.tC - a.now, () => through(a, ball, sh.P2, sh.tC, sh.dir, 2));
      ball.fadeOut(sh.tC + 1.8);
      if (drive)
        a.at(sh.tC - a.now + 0.1, () =>
          a.pop(a.t('winner'), { x: sh.P2.x, y: 1.3, z: sh.P2.z }, { fg: '#ffe45c', h: 0.6 }),
        );
      a.at(sh.tC - a.now + 0.6, () => pointEnd(from.team));
      return;
    }
    if (kitchen && a.chance(0.06))
      a.at(sh.tC - a.now - 0.2, () => a.pop(a.t('kitchen'), rcv, { fg: '#ffcf8a', h: 0.45 }));
    a.at(sh.tC - a.now, () => {
      a.at(0.4, () => {
        if (!rcv.down) {
          rcv.clearMoves();
          rcv.go(rcv.home.x, rcv.home.z * 0.6 + rcv.pos.z * 0.4, 1.6);
        }
      });
      send(rcv, sh.P2, ball, S.shots > 3 && a.chance(0.2));
    });
  };

  const pointEnd = (win: 0 | 1) => {
    S.score[win] = (S.score[win] ?? 0) + 1;
    S.server = win;
    const w = team(win);
    for (const p of w) a.gesture(p, 'cheer', 0.9);
    if (w.length === 2) {
      const [p, q] = w as [Pl, Pl];
      a.at(0.3, () => {
        a.gesture(p, 'hand', 0.6);
        a.gesture(q, 'hand', 0.6);
      });
    }
    for (const p of team(1 - win)) if (a.chance(0.4)) a.emote(p, a.chance(0.5) ? 'sad' : 'anger', 1.2);
    const s0 = S.score[0] ?? 0;
    const s1 = S.score[1] ?? 0;
    a.at(1.2, () =>
      a.pop(
        four ? `${s0}-${s1}-${win === 0 ? 1 : 2}` : `${s0}-${s1}`,
        { x: 0, y: 2.4, z: 0 },
        { fg: '#ffffff', h: 0.55, dur: 1.2 },
      ),
    );
    if (s0 >= 11 || s1 >= 11) {
      S.score = [0, 0];
      a.at(1.8, () => {
        a.pop(a.t('goodGame'), { x: 0, y: 2.8, z: 0 }, { fg: '#b8f08a', h: 0.7, dur: 1.6 });
        for (const p of ps) a.gesture(p, 'wave', 1.2);
      });
      a.at(4.5, rally);
      return;
    }
    if (a.heat && (s0 + s1) % 5 === 0)
      a.at(1.5, () => {
        for (const p of ps) a.gesture(p, 'fan', 1.6);
      });
    a.at(2.6, rally);
  };

  a.at(1, rally);
  return {
    update() {
      for (const p of ps) {
        p.tired = a.f * 0.8;
        p.speedK = 1 - 0.3 * a.f;
      }
    },
  };
}
