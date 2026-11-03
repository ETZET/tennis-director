import type { Person } from '../people/person';
import { capFly, pourWater } from './choreo';
import { line } from './props';
import { type Act, EAST, WEST } from './runtime';
import { mkCone } from './shared-props';

/**
 * 体能冲刺：三人同时跑绳梯、绕桩、冲刺。有速度线和冲线庆祝；疲劳高会被绳梯绊倒、冲线后直接躺平。
 * 区域中心为原点，起点在 x=-9.9，终点线在 x≈9。
 */
export function sprint(a: Act) {
  const vb = a.vb;
  const lanes = [-3.4, 0, 3.4];
  for (const z of [-5.1, -1.7, 1.7, 5.1]) line(vb, a.rand, -10, z, 9.6, z, '#eef0e6', 0, 0.02);
  line(vb, a.rand, -9.6, -5.1, -9.6, 5.1, '#eef0e6', 0, 0.022, 0.12);
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 2; j++)
      vb.box(8.7 + j * 0.3, 0.012, -5.1 + i * 0.392 + 0.196, 0.3, 0.012, 0.392, (i + j) % 2 ? '#1a1612' : '#f6f3ea');
  if (a.venue === 'hollow')
    for (const z of lanes)
      for (let k = 0; k < 8; k++) {
        const cx = -8.15 + k * 0.55;
        const cz = z + (k % 2 ? 0.18 : -0.18);
        for (let j = 0; j < 8; j++) {
          const an = (j / 8) * Math.PI * 2;
          vb.box(cx + Math.cos(an) * 0.22, 0.012, cz + Math.sin(an) * 0.22, 0.13, 0.14, 0.13, '#1f1f1f', -an);
        }
      }
  else
    for (const z of lanes) {
      vb.box(-6.2, 0.012, z - 0.36, 4.6, 0.025, 0.05, '#2a2a2a');
      vb.box(-6.2, 0.012, z + 0.36, 4.6, 0.025, 0.05, '#2a2a2a');
      for (let k = 0; k <= 8; k++) vb.box(-8.45 + k * 0.55, 0.012, z, 0.07, 0.03, 0.72, '#f2c230');
    }
  const CX = [-2.6, -0.4, 1.8, 4.0];
  for (const z of lanes)
    CX.forEach((x, k) => {
      mkCone(a, x, z + (k % 2 ? 0.75 : -0.75));
    });
  vb.box(10.4, 0, -5.9, 0.08, 1.6, 0.08, '#e8e2d0');
  vb.box(10.4, 1.6, -5.9, 0.5, 0.35, 0.05, '#e05a3a');

  const COACH = { x: 10.0, z: -5.3 };
  const cast = a.opts.cast;
  const coach = a.cast(cast?.coach, { ...COACH, yaw: -2.2 }, () =>
    a.coachPerson({ ...COACH, yaw: -2.2, clipboard: true }),
  );
  coach.idleFace = -2.2;
  a.badge(coach);
  const RS: Record<string, readonly string[]> = {
    generic: ['#2e86a6', '#e8b03c', '#7bc47f'],
    maple: ['#7c2232', '#e6b03c', '#9aa0a3'],
  };
  const rs = RS[a.venue];
  const runners: Person[] = lanes.map((z, i) =>
    a.cast(cast?.players?.[i], { x: -9.9, z, yaw: EAST }, () =>
      a.person({ team: true, x: -9.9, z, yaw: EAST, ...(rs ? { shirt: rs[i] } : {}) }),
    ),
  );
  for (const r of runners) r.idleFace = EAST;
  const S = { finished: [] as Person[], back: 0, running: false, cheerT: 0 };

  const start = () => {
    S.finished = [];
    S.back = 0;
    for (const r of runners) {
      r.base = 'set';
      r.idleFace = EAST;
      r.panting = false;
    }
    let delay = 0.6;
    if (a.c <= 2) {
      delay = a.rr(1.8, 2.8);
      a.at(0.8, () => {
        for (const r of runners) a.emote(r, 'ques', 1.2);
      });
      a.at(1.1, () => a.pop(a.t(a.c === 1 ? 'lateStart1' : 'lateStart2'), coach, { fg: '#e8e4d8', h: 0.42 }));
    }
    a.at(delay, () => a.pop(a.t('ready'), coach, { fg: '#ffffff', h: 0.5 }));
    a.at(delay + 0.9, () => {
      a.pop(a.t('whistle'), coach, { fg: '#ffe45c', h: 0.75 });
      a.gesture(coach, 'whistle', 0.6);
      S.running = true;
      runners.forEach((r, i) => {
        run(r, i);
      });
    });
    if (a.wind && a.chance(0.75)) a.at(delay + 3, () => capFly(a, coach, COACH));
  };

  const run = (r: Person, i: number) => {
    const z = lanes[i] as number;
    r.base = 'relaxed';
    r.speedK = (1 - 0.42 * a.f) * a.rr(0.9, 1.1);
    const trip = a.chance(0.05 + 0.6 * a.f * a.f + (a.venue === 'hollow' ? 0.15 : 0));
    const tripAt = a.ri(2, 6);
    for (let k = 0; k < 8; k++) {
      r.go(-8.15 + k * 0.55, z + (k % 2 ? 0.12 : -0.12), 2.4, { stepMul: 3.2, face: EAST });
      if (trip && k === tripAt)
        r.call(() => {
          a.fall(r, 'face', 1.5, { slide: 1.2 });
          a.pop(a.t(a.venue === 'hollow' ? 'tripTyre' : 'trip'), r, { fg: '#ffb070', h: 0.48 });
        });
    }
    CX.forEach((cx, k) => {
      r.go(cx, z + (k % 2 ? -0.1 : 0.1) + (k % 2 ? 0.85 : -0.85) * -1, 4.6);
      if (a.rain && k === 1 && a.chance(0.35))
        r.call(() => {
          a.fall(r, 'back', 1.4, { slide: 1.6 });
          a.pop(a.t('oops'), r, { fg: '#9fdcff', h: 0.45 });
        });
    });
    r.go(9.4, z, 7.4);
    r.call(() => finish(r));
  };

  const finish = (r: Person) => {
    S.finished.push(r);
    const place = S.finished.length;
    r.idleFace = WEST;
    if (place === 1) {
      a.hop(r, 0.45, 0.45);
      a.gesture(r, 'cheer', 1.6);
      a.pop(a.t('first'), r, { fg: '#ffd84a', h: 0.65 });
      a.fx.confetti(r.pos.x, 1.6, r.pos.z, 26, 0.8);
      if (a.c >= 4)
        a.at(0.6, () => {
          a.gesture(coach, 'clap', 1.2);
          a.pop(
            a.chance(a.c === 5 ? 0.5 : 0.25)
              ? a.t('record')
              : a.t('seconds', { s: (6.2 + a.f * 2.6 + a.rr(-0.2, 0.2)).toFixed(1) }),
            coach,
            { fg: '#d9ec52', h: 0.5 },
          );
        });
      else if (a.c === 1) a.at(0.6, () => a.pop(a.t('whatTime'), coach, { fg: '#e8e4d8', h: 0.42 }));
    } else if (a.f > 0.72) {
      a.fall(r, 'back', 3.4);
      a.at(0.4, () => {
        a.pop(a.t('wiped'), r, { fg: '#cfe8ff', h: 0.48 });
        a.emote(r, 'zzz', 2.6);
      });
    } else {
      r.base = 'handsKnees';
      r.panting = true;
      a.at(2.4, () => {
        r.base = 'relaxed';
        r.panting = false;
      });
    }
    if (a.heat) a.at(1.2, () => pourWater(a, r));
    if (S.finished.length === runners.length) {
      S.running = false;
      a.at(a.f > 0.72 ? 4.2 : 3.2, () =>
        runners.forEach((q, i) => {
          q.base = 'relaxed';
          q.panting = false;
          q.clearMoves();
          q.go(-9.9, lanes[i] as number, 1.6);
          q.call(() => {
            q.idleFace = EAST;
            S.back++;
            if (S.back === runners.length) a.at(1.0, start);
          });
        }),
      );
    }
  };

  a.at(1, start);
  return {
    update(dt: number) {
      for (const r of runners) r.tired = a.f;
      if (a.c >= 4 && S.running) {
        S.cheerT -= dt;
        if (S.cheerT <= 0) {
          S.cheerT = 1.6;
          a.gesture(coach, 'clap', 0.9);
          a.pop(a.t('goGo'), coach, { fg: '#d9ec52', h: 0.42 });
        }
      }
    },
  };
}
