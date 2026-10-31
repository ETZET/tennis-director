import { clamp, hdist } from '@td/shared';
import * as THREE from 'three';
import { labelPlane } from '../fx/sprites';
import { part } from '../people/parts';
import type { Person } from '../people/person';
import { crowGrab } from './choreo';
import { canopy, mkPlate, mkSpatula, table, tree } from './props';
import { type Act, SOUTH } from './runtime';

/**
 * 烧烤野餐：教练掌勺翻肉饼，球员吃饭聊天、扔飞盘。手艺差会烤糊、被熏黑脸；
 * 下雨躲进帐篷，大热天改打水球；Hollow Creek 的乌鸦会偷肉饼。区域中心为原点。
 */
export function bbq(a: Act) {
  const vb = a.vb;
  const tier = a.num('tier');
  const hol = a.venue === 'hollow';
  tree(vb, a.rand, -7.8, -4.6, 0.8, undefined, a.heat);
  const tables: [number, number, number][] =
    tier === 3
      ? [[-0.4, -1.6, 5.6]]
      : tier === 2
        ? [
            [-1.6, -1.6, 2.6],
            [2.2, 1.4, 2.6],
          ]
        : [[-0.6, -1.6, 2.6]];
  if (a.venue === 'maple') {
    vb.box(0.6, 0, -5.9, 0.08, 1.9, 0.08, '#6a4a2e');
    vb.box(4.2, 0, -5.9, 0.08, 1.9, 0.08, '#6a4a2e');
    const bn = a.own(labelPlane(a.t('bbqBanner'), 3.6, 0.6, '#7c2232', '#e6b03c', 22));
    bn.position.set(2.4, 1.55, -5.86);
  }
  for (const [x, z, w] of tables) {
    table(vb, x, z, w, 0.9, hol ? '#e8e6e0' : '#a8774a');
    vb.box(x, 0, z - 0.85, w, hol ? 0.45 : 0.42, hol ? 0.12 : 0.32, hol ? '#9aa0a3' : '#8a5f3a');
    vb.box(x, 0, z + 0.85, w, hol ? 0.45 : 0.42, hol ? 0.12 : 0.32, hol ? '#9aa0a3' : '#8a5f3a');
    for (let i = 0; i < Math.round(w); i++) {
      vb.box(x - w / 2 + 0.5 + i, 0.78, z + a.rr(-0.2, 0.2), 0.34, 0.03, 0.34, '#f6f3ea');
      vb.box(x - w / 2 + 0.5 + i, 0.81, z, 0.18, 0.06, 0.18, a.pick(['#8a4f2a', '#e8b04a', '#6aa84a', '#e05a3a']));
    }
  }
  if (tier === 3) {
    for (let k = 0; k <= 10; k++) {
      const u = (k / 10) * Math.PI;
      vb.box(
        -0.4 + Math.cos(u) * 3.2,
        Math.sin(u) * 2.9,
        -3.0,
        0.7,
        0.7,
        0.7,
        ['#ff7a9a', '#ffd84a', '#5fd1ff', '#8af08a'][k % 4] as string,
      );
    }
    vb.box(4.0, 0, -1.4, 0.6, 1.0, 0.5, '#222');
    vb.box(4.0, 0.3, -1.14, 0.4, 0.4, 0.02, '#555');
  }
  const gx = 5.2;
  const gz = -3.6;
  if (hol) {
    vb.box(gx, 0, gz, 1.0, 0.95, 0.75, '#7a4a2e');
    vb.box(gx - 0.2, 0.3, gz + 0.38, 0.4, 0.3, 0.02, '#5a3420');
    vb.box(gx, 0.95, gz, 0.9, 0.04, 0.66, '#8a8a8a');
  } else if (tier === 1) {
    vb.box(gx, 0, gz, 0.06, 0.6, 0.06, '#333');
    vb.box(gx, 0.6, gz, 0.8, 0.4, 0.8, '#2a2a2a');
    vb.box(gx, 1.0, gz, 0.74, 0.04, 0.74, '#7a7a7a');
  } else {
    for (const [u, v] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const)
      vb.box(gx + u * 0.6, 0, gz + v * 0.3, 0.06, 0.8, 0.06, '#333');
    vb.box(gx, 0.8, gz, 1.5, 0.32, 0.8, '#2a2a2a');
    vb.box(gx, 1.12, gz, 1.4, 0.03, 0.7, '#8a8a8a');
    vb.box(gx, 1.12, gz - 0.5, 1.5, 0.6, 0.08, '#2a2a2a', 0, -0.4);
  }
  if (tier >= 2) {
    vb.box(3.2, 0, -4.8, 0.8, 0.5, 0.5, '#2d6fb0');
    vb.box(3.2, 0.5, -4.8, 0.82, 0.07, 0.52, '#e8e2d0');
  }
  if (a.rain) {
    canopy(vb, -0.4, -1.0, 6.4, 4.4, '#e8e2d0', '#2e86a6', 2.6);
    vb.box(gx, 0, gz - 0.9, 0.05, 2.2, 0.05, '#333');
    vb.box(gx, 2.2, gz, 2.0, 0.08, 2.0, '#d65a5a');
  }
  const cast = a.opts.cast;
  const coach = a.cast(cast?.coach, { x: gx, z: gz - 0.9, yaw: SOUTH, base: 'grill' }, () =>
    a.coachPerson({
      x: gx,
      z: gz - 0.9,
      yaw: SOUTH,
      base: 'grill',
      hairStyle: a.c >= 3 ? 'cap' : undefined,
      cap: '#f6f3ea',
    }),
  );
  coach.idleFace = SOUTH;
  coach.give('R', mkSpatula());
  a.badge(coach);
  const seats: [number, number, number][] =
    tier === 3
      ? [
          [-2.4, -2.45, 0],
          [-0.4, -2.45, 0],
          [1.6, -2.45, 0],
          [-1.4, -0.75, Math.PI],
          [0.6, -0.75, Math.PI],
        ]
      : tables.flatMap(([x, z]) => [
          [x - 0.6, z - 0.85, 0] as [number, number, number],
          [x + 0.6, z + 0.85, Math.PI] as [number, number, number],
        ]);
  const sit: Person[] = seats.map(([x, z, yaw], i) => {
    const at = { x, z, yaw, base: 'seated' as const };
    const p = a.cast(cast?.players?.[i], at, () => a.person({ team: a.chance(0.5), ...at }));
    p.seatY = a.gy(x, z) - 0.43;
    p.idleFace = yaw;
    return p;
  });
  const fr: Person[] = a.rain
    ? []
    : [a.person({ team: true, x: -6.4, z: 4.4 }), a.person({ team: true, x: 4.2, z: 4.6 })];
  const nap: Person[] = [];
  const nN = a.f > 0.75 ? 2 : a.f > 0.45 ? 1 : 0;
  for (let i = 0; i < nN; i++) {
    const p = a.person({ x: [-8.2, 7.6][i] as number, z: [1.0, 1.8][i] as number, yaw: a.rr(0, 6) });
    a.at(0.3 + i * 0.4, () => a.fall(p, 'back', 1e6));
    nap.push(p);
  }
  const tag: Person[] =
    a.f < 0.3 && !a.rain ? [a.person({ team: true, x: -4, z: 1.2 }), a.person({ team: true, x: -2, z: 2.2 })] : [];
  const patty = new THREE.Group();
  part(patty, 0.3, 0.08, 0.3, 0, 0, 0, '#8a4f2a');
  patty.position.set(gx, 1.2, gz);
  a.group.add(patty);
  const disc = new THREE.Group();
  part(disc, 0.34, 0.05, 0.34, 0, 0, 0, '#ff7a2a');
  part(disc, 0.22, 0.055, 0.22, 0, 0, 0, '#ffd84a');
  disc.visible = false;
  a.group.add(disc);
  const S = {
    flips: 0,
    grillT: 2,
    chatT: 1,
    smokeT: 0,
    discT: 2,
    tagA: 0,
    discBusy: false,
    discFrom: null as Person | null,
    pattyGone: false,
  };

  const flip = () => {
    S.flips++;
    a.gesture(coach, 'flip', 0.7);
    const from = { x: gx, y: 1.2, z: gz };
    if (hol && a.chance(0.22) && a.crows.some((k) => !k.busy) && !S.pattyGone) {
      S.pattyGone = true;
      a.tween(patty, from, { x: gx, y: 2.6, z: gz }, 0.5);
      a.at(0.5, () => {
        const ok = crowGrab(
          a,
          patty,
          (beak) => {
            beak.add(patty);
            patty.position.set(0, 0, 0);
          },
          a.t('crowPatty'),
          () => {
            patty.parent?.remove(patty);
            a.group.add(patty);
            patty.position.set(gx, 1.2, gz);
            S.pattyGone = false;
          },
        );
        if (!ok) {
          patty.position.set(gx, 1.2, gz);
          S.pattyGone = false;
        }
      });
      a.at(1.5, () => {
        a.gesture(coach, 'argue', 1.4);
        a.pop(a.t('myPatty'), coach, { fg: '#ff8a70', h: 0.5 });
        sit.slice(0, 2).forEach((p, i) => {
          a.at(0.3 + i * 0.2, () => a.pop(a.t('hahaha'), p, { fg: '#ffe9a8', h: 0.36 }));
        });
      });
      return;
    }
    if (S.pattyGone) return;
    a.tween(patty, from, { x: gx + a.rr(-0.3, 0.3), y: 1.2, z: gz }, 0.8, { h: 1.3, spin: 8 });
    a.at(0.8, () => {
      const burn = a.chance([0.5, 0.32, 0.18, 0.1, 0.04][a.c - 1] ?? 0.2);
      if (burn) {
        a.fx.fire(gx, 1.3, gz, 24);
        a.fx.smoke(gx, 1.6, gz, '#3a3a3a');
        a.fx.smoke(gx, 1.6, gz, '#3a3a3a');
        coach.overlay('soot', true);
        a.pop(a.t('burnt'), coach, { fg: '#ff8a50', h: 0.55 });
        a.icon('fire', { x: gx, y: 1.5, z: gz }, 0.7, 0.8, 0.4);
        a.at(0.5, () =>
          sit.slice(0, 3).forEach((p, i) => {
            a.at(i * 0.2, () => a.pop(a.t('hahaha'), p, { fg: '#ffe9a8', h: 0.36 }));
          }),
        );
        a.at(6, () => coach.overlay('soot', false));
      } else if (a.c >= 4 && a.chance(0.4)) {
        a.fx.sparkle(gx, 1.5, gz, 12);
        a.pop(a.t('perfect'), coach, { fg: '#ffe45c', h: 0.5 });
      }
    });
    if (S.flips % 3 === 0) a.at(1.2, serveFood);
  };

  const serveFood = () => {
    const tb = tables[0] as [number, number, number];
    const home = { x: coach.pos.x, z: coach.pos.z };
    coach.take('R');
    coach.give('R', mkPlate());
    coach.base = 'carry';
    coach.clearMoves();
    coach.go(tb[0] + 1.2, tb[1] + 1.3, 1.8);
    coach.call(() => {
      a.pop(a.t('foodsUp'), coach, { fg: '#ffe45c', h: 0.5 });
      sit.forEach((p, i) => {
        a.at(i * 0.12, () => {
          a.gesture(p, 'cheer', 1.0);
          a.emote(p, 'heart', 1.2);
        });
      });
      coach.take('R');
    });
    coach.wait(1.0);
    coach.go(home.x, home.z, 1.8);
    coach.call(() => {
      coach.base = 'grill';
      coach.give('R', mkSpatula());
      coach.idleFace = SOUTH;
    });
  };

  const frisbee = () => {
    const [A, B] = fr as [Person, Person];
    const thr = S.discFrom === B ? B : A;
    const cat = thr === A ? B : A;
    S.discFrom = cat;
    S.discBusy = true;
    thr.watch = cat;
    cat.watch = thr;
    a.gesture(thr, 'throw', 0.7);
    a.at(0.35, () => {
      const h = a.lp(thr.handR);
      disc.visible = true;
      if (a.wind && a.chance(0.35)) {
        const to = { x: -7.4 + a.rr(-0.6, 0.6), y: 4.2, z: -4.2 };
        a.tween(disc, h, to, 1.4, {
          h: 1.5,
          spin: 20,
          onEnd: () => {
            a.pop(a.t('stuckInTree'), cat, { fg: '#ffcf8a', h: 0.45 });
            a.gesture(thr, 'shrug', 1.2);
            a.gesture(cat, 'shrug', 1.2);
            a.at(1.8, () => {
              disc.visible = false;
              S.discBusy = false;
            });
          },
        });
        return;
      }
      const tgt = {
        x: cat.pos.x + a.rr(-2.2, 2.2) + (a.wind ? 2 : 0),
        y: 1.1,
        z: clamp(cat.pos.z + a.rr(-1.6, 1.6), -5.8, 6),
      };
      const dive = hdist(tgt, cat.pos) > 1.6 && a.chance(0.6);
      a.tween(disc, h, tgt, 1.3, {
        h: 1.0,
        spin: 24,
        onEnd: () => {
          if (dive) {
            cat.clearMoves();
            a.fall(cat, 'face', 1.3, { slide: 2.4 });
            a.pop(a.t('dive'), cat, { fg: '#ffe45c', h: 0.5 });
          }
          disc.visible = false;
          a.at(0.4, () => {
            a.fx.sparkle(tgt.x, 1, tgt.z, 6, '#ffffff');
            S.discBusy = false;
          });
        },
      });
      cat.clearMoves();
      cat.go(tgt.x - 0.3, tgt.z, dive ? 4 : 3);
    });
  };

  const waterBalloon = () => {
    const [A, B] = fr as [Person, Person];
    const thr = a.chance(0.5) ? A : B;
    const tgt = thr === A ? B : A;
    S.discBusy = true;
    thr.watch = tgt;
    tgt.watch = thr;
    a.gesture(thr, 'throw', 0.7);
    const ball = a.pool.get(thr, false, { color: '#5fb8ff', size: 1.6 });
    ball.holdAt(thr.handR);
    a.at(0.35, () => {
      const h = a.lp(thr.handR);
      const dodge = a.chance(0.3);
      const th = a.lp(tgt.headTop);
      ball.arc(h, { x: th.x, y: th.y - 0.3, z: th.z }, a.now, 0.8);
      if (dodge) {
        tgt.clearMoves();
        tgt.go(tgt.pos.x + a.rr(-1.4, 1.4), clamp(tgt.pos.z + a.rr(-1.2, 1.2), -5.5, 5.5), 4);
      }
      a.at(0.8, () => {
        const p = ball.m.position;
        a.fx.splash(p.x, p.y, p.z, 26);
        const hitIt = !dodge && hdist(p, tgt.pos) < 1;
        ball.release();
        if (hitIt) {
          a.pop(a.t('splashed'), tgt, { fg: '#9fdcff', h: 0.5 });
          a.hop(tgt, 0.4, 0.4);
        } else a.pop(a.t('missedMe'), tgt, { fg: '#ffffff', h: 0.4 });
        S.discBusy = false;
      });
    });
  };

  return {
    update(dt: number) {
      S.smokeT -= dt;
      if (S.smokeT <= 0) {
        S.smokeT = 0.18;
        a.fx.smoke(gx + a.rr(-0.4, 0.4), 1.3, gz);
      }
      S.grillT -= dt;
      if (S.grillT <= 0) {
        S.grillT = 3.4;
        flip();
      }
      S.chatT -= dt;
      if (S.chatT <= 0) {
        S.chatT = a.rr(0.9, 1.8);
        const p = sit.length ? a.pick(sit) : null;
        if (p) {
          const r = a.rand();
          if (r < 0.35) a.emote(p, 'note', 1.2);
          else if (r < 0.55) a.emote(p, 'heart', 1.2);
          else if (r < 0.85) a.pop(a.t('chat'), p, { fg: '#ffe9a8', h: 0.36 });
          else a.gesture(p, 'talk', 1.2);
        }
      }
      for (const p of nap) if (a.chance(dt * 0.4)) a.emote(p, 'zzz', 1.6);
      if (tag.length === 2) {
        S.tagA += dt * 1.6;
        const [A, B] = tag as [Person, Person];
        if (!A.busy()) A.go(-1.5 + Math.cos(S.tagA) * 5.2, 1.6 + Math.sin(S.tagA) * 2.4, 4.2);
        if (!B.busy()) B.go(-1.5 + Math.cos(S.tagA - 0.5) * 5.2, 1.6 + Math.sin(S.tagA - 0.5) * 2.4, 4.6);
        if (a.chance(dt * 0.4)) a.pop(a.t('tag'), a.pick(tag), { fg: '#ffffff', h: 0.36 });
      }
      if (fr.length) {
        S.discT -= dt;
        if (S.discT <= 0 && !S.discBusy) {
          S.discT = 1.6;
          if (a.heat) waterBalloon();
          else frisbee();
        }
      }
      if (a.wind && a.chance(dt * 0.5)) {
        const tb = a.pick(tables);
        a.fx.paper(tb[0] + a.rr(-1, 1), 0.85, tb[1]);
        if (a.chance(0.3) && sit.length) a.pop(a.t('platesFly'), a.pick(sit), { fg: '#ffcf8a', h: 0.36 });
      }
    },
  };
}
