import { clamp, lerp } from '@td/shared';
import { Group } from '../core/graph';
import { part } from '../people/parts';
import type { Person, PersonOptions } from '../people/person';
import { capFly } from './choreo';
import { PICKLE_GREEN, SKIN } from './looks';
import { line, mkMegaphone } from './props';
import { type Act, EAST, SOUTH, WEST } from './runtime';

type Puller = Person & { hx0: number };

/**
 * 拔河：我方 4 人对 4 人。教练喊"一、二!"带节奏；输的一方被拽倒摔成一堆，赢的一方仰面倒下再跳起来庆祝。
 * 雨天中间是泥坑。result=win/lose 时结果由外部决定（游戏里网球这边从来没赢过）。区域中心为原点。
 */
export function tug(a: Act) {
  const vb = a.vb;
  line(vb, a.rand, 0, -2, 0, 2, '#f6f3ea', 0, 0.02, 0.14);
  line(vb, a.rand, -2.2, -1.6, -2.2, 1.6, '#f6f3ea', 0, 0.02, 0.1);
  line(vb, a.rand, 2.2, -1.6, 2.2, 1.6, '#f6f3ea', 0, 0.02, 0.1);
  if (a.rain) {
    vb.box(0, 0.004, 0, 4.2, 0.03, 3.2, '#5a3d22');
    vb.box(0.3, 0.006, 0.2, 2.6, 0.03, 1.6, '#6a4a2e');
  }
  const rope = new Group();
  a.group.add(rope);
  for (let i = 0; i < 34; i++) part(rope, 0.42, 0.09, 0.09, -7 + i * 0.42 + 0.21, 0, 0, i % 2 ? '#d8c48a' : '#c4ae72');
  part(rope, 0.08, 0.4, 0.08, 0, -0.22, 0, '#e05a3a');
  rope.position.y = 0.95;

  const oppLook = (): Partial<PersonOptions> => {
    if (a.venue === 'maple')
      return {
        shirt: a.pick(['#7a6a5a', '#5a6a7a', '#8a5a5a', '#6a7a5a']),
        longSleeve: true,
        pants: true,
        shorts: '#3a3f4a',
        trim: undefined,
        hair: a.pick(['#9a9a96', '#5a3a22', '#3b2a1e']),
        hairStyle: a.pick(['bald', 'short', 'long'] as const),
      };
    if (a.venue === 'hollow')
      return {
        shirt: PICKLE_GREEN,
        trim: '#f2efe6',
        shorts: '#f2efe6',
        hairStyle: a.pick(['visor', 'short'] as const),
        cap: PICKLE_GREEN,
      };
    return {};
  };
  const cast = a.opts.cast;
  const A: Puller[] = [];
  const B: Puller[] = [];
  for (let i = 0; i < 4; i++) {
    const ax = -1.5 - i * 1.05;
    const at = { x: ax, z: i % 2 ? 0.22 : -0.22, lock: EAST, base: 'pull' as const };
    const p = a.cast(cast?.players?.[i], at, () => a.person({ team: true, ...at })) as Puller;
    p.hx0 = ax;
    A.push(p);
    const bx = 1.5 + i * 1.05;
    const q = a.person({ opp: true, x: bx, z: i % 2 ? -0.22 : 0.22, lock: WEST, base: 'pull', ...oppLook() }) as Puller;
    q.hx0 = bx;
    B.push(q);
  }
  const REF = { x: 0, z: -2.6 };
  const ref = a.spawn({
    ...REF,
    yaw: SOUTH,
    shirt: '#1a1a1a',
    shorts: '#1a1a1a',
    pants: true,
    skin: a.pick(SKIN),
    hair: '#3a3a3a',
    hairStyle: 'cap',
    cap: '#1a1a1a',
    shoes: '#2a2a2a',
  });
  ref.idleFace = SOUTH;
  const coach = a.cast(cast?.coach, { x: -4.2, z: -2.6, yaw: 0.4 }, () =>
    a.coachPerson({ x: -4.2, z: -2.6, yaw: 0.4 }),
  );
  coach.idleFace = 0.4;
  coach.give('L', mkMegaphone());
  a.badge(coach);
  const forced = a.str('result');
  const S = { X: 0, v: 0, nz: 0, state: 'idle' as 'idle' | 'ready' | 'pull' | 'end', surge: 0, beat: -1, round: 0 };

  const start = () => {
    S.round++;
    S.X = 0;
    S.v = 0;
    S.state = 'ready';
    if (S.round === 1)
      a.pop(
        a.t('vs', { opp: a.t(`tugOpp.${a.venue}`) }),
        { x: 2.5, y: 2.8, z: 0 },
        { fg: '#ffffff', h: 0.8, dur: 1.6 },
      );
    for (const p of [...A, ...B]) {
      p.clearMoves();
      p.base = 'pull';
      p.lock = p.hx0 < 0 ? EAST : WEST;
      p.pos.x = p.hx0;
      p.overlay('mud', false);
    }
    rope.visible = true;
    a.gesture(ref, 'wave', 1.2);
    a.pop(a.t('ready'), ref, { fg: '#ffffff', h: 0.5 });
    if (a.wind && a.chance(0.5)) a.at(2.4, () => capFly(a, ref, REF));
    a.at(1.4, () => {
      a.pop(a.t('whistle'), ref, { fg: '#ffe45c', h: 0.75 });
      a.gesture(ref, 'whistle', 0.5);
      S.state = 'pull';
    });
  };

  const end = (win: 0 | 1) => {
    S.state = 'end';
    const W = win === 0 ? A : B;
    const L = win === 0 ? B : A;
    const dir = win === 0 ? -1 : 1;
    rope.visible = false;
    L.forEach((p, i) => {
      a.at(i * 0.12, () => {
        p.base = 'relaxed';
        p.lock = null;
        p.yaw = dir > 0 ? WEST : EAST;
        p.clearMoves();
        a.fall(p, 'face', 2.6, { slide: 2.6 });
        if (a.rain) {
          p.overlay('mud', true);
          a.fx.mud(p.pos.x, 0.02, p.pos.z, 16);
        }
      });
    });
    W.forEach((p, i) => {
      a.at(i * 0.08, () => {
        p.base = 'relaxed';
        p.clearMoves();
        a.fall(p, 'back', 1.2, {
          onUp: () => {
            a.gesture(p, 'cheer', 1.8);
            a.hop(p, 0.45, 0.45);
          },
        });
      });
    });
    a.at(1.5, () => {
      a.fx.confetti(dir * -3.4, 2, 0, 40, 1.2);
      a.pop(
        a.t(win === 0 ? 'victory' : `tugLost.${a.venue}`),
        { x: dir * -3, y: 2.6, z: 0 },
        {
          fg: win === 0 ? '#ffd84a' : '#a9b4c0',
          h: 1.0,
          dur: 2,
        },
      );
    });
    a.at(1.0, () => {
      if (win === 0) {
        a.hop(coach, 0.4, 0.4);
        a.gesture(coach, 'cheer', 1.6);
        a.pop(a.t('awesome'), coach, { fg: '#9cf0b4', h: 0.5 });
      } else {
        a.gesture(coach, 'facepalm', 1.8);
        a.emote(coach, 'sad', 1.6);
      }
    });
    if (a.rain && win === 1)
      a.at(1.6, () =>
        L.forEach((p, i) => {
          a.at(i * 0.2, () => a.pop(a.t('mudMouth'), p, { fg: '#c9a874', h: 0.4 }));
        }),
      );
    a.at(4.2, () => {
      for (const p of [...A, ...B]) {
        p.clearMoves();
        p.lock = null;
        p.go(p.hx0, p.pos.z, 2);
      }
    });
    a.at(6.2, start);
  };

  a.at(1, start);
  return {
    update(dt: number) {
      for (const p of A) p.tired = a.f;
      if (S.state === 'pull') {
        const now = a.now;
        const fA0 = 4 * (1 - 0.5 * a.f);
        if (a.c >= 3) {
          const b = Math.floor(now / 1.15);
          if (b !== S.beat) {
            S.beat = b;
            const two = b % 2 === 1;
            a.pop(a.t(two ? 'heave2' : 'heave1'), coach, { fg: '#ffe45c', h: 0.55, dur: 0.8 });
            a.gesture(coach, 'whistle', 0.5);
            if (two) {
              S.surge = 0.4;
              for (const p of A) a.fx.dust(p.pos.x, 0.02, p.pos.z, 2);
            }
          }
        } else if (a.chance(dt * 0.8)) a.pop(a.t('weakChant'), coach, { fg: '#e8e4d8', h: 0.42, dur: 0.9 });
        S.surge = Math.max(0, S.surge - dt);
        const bias = forced === 'win' ? 1.4 : forced === 'lose' ? -1.4 : 0;
        const fA = fA0 + (S.surge > 0 ? (2.4 * (a.c - 2)) / 3 : 0) + (a.c <= 2 ? a.rr(-0.8, 0.8) : 0) + bias;
        const fB = 3.75 + Math.sin(now * 1.7) * 0.5 + a.rr(-0.4, 0.4);
        S.nz = clamp(S.nz + a.rr(-1, 1) * dt * 1.2, -0.6, 0.6);
        S.v = lerp(S.v, (fB - fA) * 0.45 + S.nz + S.X * 0.35, 1 - Math.exp(-dt * 3));
        S.X += S.v * dt;
        // 结果由外部决定时，不让绳子越过"错"的那一边
        if (forced === 'lose' && S.X < -1.6) S.X = -1.6;
        if (forced === 'win' && S.X > 1.6) S.X = 1.6;
        if (a.chance(dt * 3)) {
          const p = a.pick([...A, ...B]);
          if (a.rain) a.fx.mud(p.pos.x, 0.02, p.pos.z, 3);
          else a.fx.dust(p.pos.x, 0.02, p.pos.z, 2);
        }
        if (Math.abs(S.X) > 2.2) end(S.X < 0 ? 0 : 1);
      }
      if (S.state === 'pull' || S.state === 'ready') {
        A.forEach((p, i) => {
          p.pos.x = p.hx0 + S.X;
          p.upper.rotation.x = -0.5 - (S.surge > 0 ? 0.2 : 0) + Math.sin(a.now * 9 + i) * 0.04;
        });
        for (const p of B) p.pos.x = p.hx0 + S.X;
        rope.position.x = S.X;
        rope.position.y = 0.95 + Math.sin(a.now * 20) * 0.02 * (S.state === 'pull' ? 1 : 0);
      }
    },
  };
}
