import { clamp, type XZ } from '@td/shared';
import { applyMat, Custom, type DrawContext } from '../core/graph';
import type { Person } from '../people/person';
import { away, bounce, chase, fly, shot, through } from './choreo';
import { labelBoard } from './fair';
import { DULL, PICKLE_GREEN } from './looks';
import { line, table } from './props';
import { type Act, BR, EAST, fwd, NORTH, rgt, SOUTH, WEST } from './runtime';

interface Family {
  parent: Person;
  kid: Person;
  spot: XZ;
  kspot: XZ;
  happy: number;
  state: 'arrive' | 'wait' | 'play' | 'done';
  ph: number;
}

/**
 * 迷你网：原来是半透明的薄盒子；像素版不做半透明，改成稀疏的网格线（格子里透出地面），
 * 局部 y ∈ [-0.18, 0.18]、z ∈ [-1.7, 1.7]。
 */
function drawNet(r: DrawContext, self: Custom): void {
  const c = r.col('#1b2521');
  const m = self.matrixWorld;
  const w = (y: number, z: number): [number, number, number] => {
    const v = { x: 0, y, z };
    applyMat(m, v);
    return [v.x, v.y, v.z];
  };
  for (let z = -1.7; z <= 1.701; z += 0.17) r.wline(w(-0.18, z), w(0.18, z), c);
  for (let y = -0.18; y <= 0.181; y += 0.12) r.wline(w(y, -1.7), w(y, 1.7), c);
}

/**
 * 开放日体验课：家长带小朋友来试打红球。打中了家长拍照，空拍会转圈晕倒，偶尔把球打到家长头上。
 * 开心的家庭去报名。区域中心为原点：两块迷你场在 z=±2.6，网在 x=1。
 */
export function openday(a: Act) {
  const vb = a.vb;
  const red = '#e05a3a';
  for (const z of [-2.6, 2.6]) {
    line(vb, a.rand, -5, z - 1.6, 5, z - 1.6, red);
    line(vb, a.rand, -5, z + 1.6, 5, z + 1.6, red);
    line(vb, a.rand, -5, z - 1.6, -5, z + 1.6, red);
    line(vb, a.rand, 5, z - 1.6, 5, z + 1.6, red);
    vb.box(1, 0, z - 1.7, 0.08, 0.55, 0.08, red);
    vb.box(1, 0, z + 1.7, 0.08, 0.55, 0.08, red);
    const n = a.own(new Custom(drawNet, { x0: -0.02, x1: 0.02, y0: -0.18, y1: 0.18, z0: -1.7, z1: 1.7 }));
    n.position.set(1, 0.3, z);
    vb.box(1, 0.5, z, 0.05, 0.05, 3.4, '#f4f2ea');
  }
  for (let x = -8; x <= 4; x += 2) vb.box(x, 0, 5.1, 0.08, 0.8, 0.08, '#e8e2d0');
  vb.box(-2, 0.7, 5.1, 12, 0.05, 0.05, red);
  table(vb, -7.6, -4.6, 2.4, 0.8);
  const SB = { generic: [red, '#ffffff'], maple: ['#7c2232', '#e6b03c'], hollow: ['#c9a874', '#3a2a1a'] }[a.venue] as [
    string,
    string,
  ];
  const s = a.own(labelBoard(a.t(`opendaySign.${a.venue}`), 2.2, 0.5, SB[0], SB[1]));
  s.position.set(-7.6, 0.42, -4.18);
  vb.box(-7.6, 0.78, -4.6, 0.3, 0.03, 0.4, '#f6f3ea');
  vb.box(3.8, 0, -0.1, 0.5, 0.55, 0.5, red);

  const staff = a.person({ x: -7.6, z: -5.3, yaw: SOUTH, shirt: a.style.team?.shirt ?? a.pick(DULL), clipboard: true });
  staff.idleFace = SOUTH;
  const coach = a.cast(a.opts.cast?.coach, { x: 3.4, z: 0, lock: WEST }, () =>
    a.coachPerson({ x: 3.4, z: 0, lock: WEST }),
  );
  a.badge(coach);
  const S = {
    fams: [] as Family[],
    queue: [] as Family[],
    busy: false,
    station: 0,
    arrived: 0,
    poacher: null as Person | null,
    poachT: a.rr(8, 12),
  };

  const spawnFam = () => {
    const i = S.arrived++;
    const spot = { x: -7 + (i % 5) * 1.6, z: 5.9 };
    const kspot = { x: -6.6 + (i % 5) * 1.4, z: 4.0 };
    const parent = a.person({ x: -9.7, z: 6.2, umb: true, pants: a.chance(0.5), longSleeve: a.chance(0.4) });
    const kid = a.person({
      x: -9.4,
      z: 5.6,
      scale: 0.62,
      racket: red,
      shirt: a.pick(['#ff9ab8', '#9fe3ff', '#ffe46a', '#b8f0a0', '#ffb070']),
    });
    const F: Family = { parent, kid, spot, kspot, happy: 0, state: 'arrive', ph: a.rr(0, 6) };
    S.fams.push(F);
    parent.go(spot.x, spot.z, 1.6);
    parent.call(() => {
      parent.idleFace = NORTH;
      parent.watch = kid;
    });
    kid.go(kspot.x, kspot.z, 2.2);
    kid.call(() => {
      F.state = 'wait';
      kid.idleFace = NORTH;
      if (a.f > 0.6) {
        kid.seatY = a.gy(kid.pos.x, kid.pos.z) - 0.62 * 0.85;
        kid.base = 'sitGround';
        a.emote(kid, 'zzz', 2);
      }
      S.queue.push(F);
    });
  };

  const next = () => {
    if (S.busy) return;
    const F = S.queue.shift();
    if (!F) {
      a.at(1.2, next);
      return;
    }
    S.busy = true;
    F.state = 'play';
    const k = F.kid;
    const z = S.station ? 2.6 : -2.6;
    S.station ^= 1;
    k.seatY = null;
    k.base = 'relaxed';
    k.clearMoves();
    k.go(-2.2, z, 2.0);
    k.call(() => {
      k.lock = EAST;
      k.base = 'ready';
      a.at(0.5, () => toss(F, z, 0));
    });
    coach.clearMoves();
    coach.go(3.4, z * 0.6, 2.0);
    coach.call(() => {
      coach.lock = WEST;
    });
  };

  const toss = (F: Family, z: number, n: number) => {
    const k = F.kid;
    const ball = a.pool.get(coach, false, { color: red, size: 1.4 });
    ball.holdAt(coach.handL);
    a.swing(coach, 'toss', a.now + 0.5);
    const L = coach.lock ?? WEST;
    const f = fwd(L);
    const r = rgt(L);
    const C = { x: coach.pos.x + f.x * 0.6 + r.x * 0.4, y: 0.9, z: coach.pos.z + f.z * 0.6 + r.z * 0.4 };
    a.at(0.3, () => ball.arc(a.lp(coach.handL), C, a.now, 0.2));
    a.at(0.5, () => {
      const B = { x: -0.6, y: BR, z: z + a.rr(-0.5, 0.5) };
      const sh = shot(a, ball, C, B, a.now, 4.5, 0.55, 1.0, 1, 0.5);
      chase(k, sh.P2, a.now, sh.tC, 1, 'fh', 3, 0.62);
      a.at(sh.tC - a.now, () => {
        const roll = a.rand();
        const pHit = clamp(0.28 + 0.4 * a.rand() + 0.07 * (a.c - 3), 0.1, 0.9);
        if (roll < 0.07) {
          const ph = a.lp(F.parent.headTop);
          ball.arc(sh.P2, ph, a.now, 0.9);
          a.at(0.9, () => {
            a.emote(F.parent, 'star', 1.3);
            a.dizzy(F.parent, 1.2);
            a.pop(a.t('bonk'), F.parent, { fg: '#ffb070', h: 0.55 });
            a.gesture(F.parent, 'bonk', 1);
            bounce(a, ball, { x: ph.x, y: ph.y, z: ph.z }, { x: 0.5, y: 1.5, z: 0.6 }, a.now);
            ball.fadeOut(a.now + 2);
            a.emote(k, 'excl', 1);
            a.at(0.6, () => {
              a.pop(a.t('hahaha'), coach, { fg: '#ffe9a8', h: 0.42 });
              F.happy++;
            });
          });
        } else if (roll < pHit) {
          const B2 = { x: a.rr(2, 5), y: BR, z: z + a.rr(-1.2, 1.2) };
          away(a, ball, sh.P2, B2, a.now, fly(sh.P2, B2, 5, 1, 0.5));
          ball.fadeOut(a.now + 2.6);
          F.happy++;
          a.at(0.3, () => {
            a.hop(k, 0.35, 0.4);
            a.pop(a.t('yay'), k, { fg: '#ffe45c', h: 0.5 });
          });
          a.at(0.6, () => {
            a.gesture(F.parent, 'photo', 1.0);
            const hp = a.lp(F.parent.handR);
            a.flash({ x: hp.x, y: hp.y + 0.2, z: hp.z }, 0.9);
            a.pop(a.t('click'), F.parent, { fg: '#ffffff', h: 0.36 });
          });
          if (a.c >= 4)
            a.at(0.8, () => {
              a.gesture(coach, 'clap', 1);
              a.pop(a.t('great'), coach, { fg: '#d9ec52', h: 0.42 });
            });
        } else {
          k.stroke = null;
          a.spin(k, 0.55);
          through(a, ball, sh.P2, a.now, sh.dir, 1.5);
          ball.fadeOut(a.now + 2.2);
          a.at(0.6, () => {
            a.fall(k, 'back', 1.2);
            a.dizzy(k, 1.2);
            a.pop(a.t('missed'), k, { fg: '#ffb070', h: 0.45 });
          });
          if (a.c >= 3)
            a.at(1.0, () => a.pop(a.t(a.c >= 4 ? 'tryAgainKind' : 'tryAgain'), coach, { fg: '#9cf0b4', h: 0.42 }));
          else {
            F.happy--;
            a.at(1.0, () => a.emote(coach, 'zzz', 1.4));
            if (F.happy <= -2)
              a.at(1.6, () => {
                a.gesture(k, 'cry', 2);
                a.pop(a.t('waah'), k, { fg: '#9fdcff', h: 0.55 });
                for (let i = 0; i < 8; i++)
                  a.at(i * 0.2, () => {
                    const h = a.lp(k.headTop);
                    a.fx.tears(h.x, h.y - 0.15, h.z);
                  });
                a.emote(F.parent, 'anger', 1.6);
              });
          }
        }
        if (n < 2) a.at(2.4, () => toss(F, z, n + 1));
        else a.at(2.6, () => done(F));
      });
    });
  };

  const done = (F: Family) => {
    const k = F.kid;
    const p = F.parent;
    k.lock = null;
    k.base = 'relaxed';
    F.state = 'done';
    S.busy = false;
    a.at(0.5, next);
    k.clearMoves();
    k.go(p.pos.x + 0.5, p.pos.z - 0.6, 2.6);
    k.call(() => {
      a.hop(k, 0.3, 0.35);
      k.watch = p;
      p.watch = k;
    });
    const sign = F.happy >= 1 || (a.c >= 4 && F.happy >= 0);
    k.wait(0.6);
    k.call(() => {
      if (sign) {
        a.pop(a.t('wantToLearn'), k, { fg: '#ffe45c', h: 0.45 });
        p.clearMoves();
        p.go(-6.2, 4.3, 1.6);
        p.go(-7.6, -3.7, 1.6);
        p.call(() => {
          p.idleFace = NORTH;
          a.gesture(p, 'sign', 1.4);
        });
        p.wait(1.5);
        p.call(() => {
          a.pop(a.t('signUp'), p, { fg: '#9fe3ff', h: 0.5 });
          a.emote(p, 'heart', 1.3);
          a.emote(k, 'heart', 1.3);
          a.fx.sparkle(-7.6, 1, -4.4, 10);
          a.gesture(staff, 'wave', 1);
        });
        k.clearMoves();
        k.go(-6.6, 4.3, 1.8);
        k.go(-7.0, -3.5, 1.8);
        k.wait(2.4);
        p.wait(0.8);
        p.call(() => leave(F));
      } else {
        a.pop(a.t('maybeLater'), p, { fg: '#c9c9c0', h: 0.42 });
        if (F.happy <= -2) a.emote(p, 'anger', 1.2);
        a.at(1.2, () => leave(F));
      }
    });
  };

  const leave = (F: Family) => {
    [F.parent, F.kid].forEach((q, i) => {
      q.watch = null;
      q.go(a.b.x0, a.rr(0, 6), 1.6);
      q.call(() => {
        a.remove(q);
        if (i === 0) {
          S.fams = S.fams.filter((x) => x !== F);
          a.at(1.0, spawnFam);
        }
      });
    });
  };

  /** Hollow Creek：匹克球的人过来把排队的家庭拉走 */
  const poach = (F: Family) => {
    const X = a.b.x1 - 0.2;
    const pr = a.person({
      x: X,
      z: 6.0,
      shirt: PICKLE_GREEN,
      shorts: '#f2efe6',
      paddle: '#3a8fd9',
      hairStyle: 'visor',
      cap: PICKLE_GREEN,
      umb: true,
    });
    S.poacher = pr;
    pr.userData.passer = true;
    const par = F.parent;
    const k = F.kid;
    pr.go(par.pos.x + 0.9, par.pos.z + 0.1, 1.8);
    pr.call(() => {
      pr.watch = par;
      par.watch = pr;
      a.say(pr, a.t('poachPitch'), 2.4, { fg: '#2f6a1a' });
      a.gesture(pr, 'talk', 2.2);
    });
    pr.wait(2.6);
    pr.call(() => {
      const bye = () => {
        pr.go(X, 6.0, 1.6);
        pr.call(() => {
          a.remove(pr);
          S.poacher = null;
        });
      };
      if (F.state !== 'wait') {
        bye();
        return;
      }
      if (a.chance(0.5)) {
        F.state = 'done';
        S.queue = S.queue.filter((x) => x !== F);
        a.pop(a.t('poachYes'), par, { fg: '#c9c9c0', h: 0.42 });
        a.at(0.6, () => a.pop(a.t('poachLost'), coach, { fg: '#ff9a80', h: 0.45 }));
        [pr, par, k].forEach((q, i) => {
          q.clearMoves();
          q.watch = null;
          q.seatY = null;
          if (q.base === 'sitGround') q.base = 'relaxed';
          q.go(X, 6.0 - i * 0.5, 1.5 + i * 0.1);
          q.call(() => {
            a.remove(q);
            if (q === pr) S.poacher = null;
            if (q === par) {
              S.fams = S.fams.filter((x) => x !== F);
              a.at(1.5, spawnFam);
            }
          });
        });
      } else {
        a.pop(a.t('poachNo'), par, { fg: '#e8e4d8', h: 0.42 });
        a.gesture(par, 'shrug', 1.0);
        a.gesture(pr, 'shrug', 1.0);
        par.watch = k;
        pr.watch = null;
        pr.wait(0.8);
        pr.call(bye);
      }
    });
  };

  for (let i = 0; i < a.num('n'); i++) a.at(0.4 + i * 2.2, spawnFam);
  a.at(3.4, next);
  return {
    update(dt: number) {
      for (const F of S.fams) {
        const k = F.kid;
        if (k.removed || F.state !== 'wait') continue;
        if (a.f < 0.3 && !k.busy()) {
          const ang = (a.now * 2 + F.ph) % 6.28;
          k.go(F.kspot.x + Math.cos(ang) * 0.9, F.kspot.z + Math.sin(ang) * 0.6, 3.2);
        }
        if (a.rain && a.chance(dt * 0.3) && !k.busy()) {
          a.hop(k, 0.4, 0.4);
          a.at(0.38, () => a.fx.splash(k.pos.x, 0.02, k.pos.z, 10));
        }
      }
      if (a.heat)
        for (const F of S.fams)
          if (!F.parent.removed && a.chance(dt * 0.3)) {
            a.gesture(F.parent, 'fan', 1.6);
            if (a.chance(0.3)) a.pop(a.t('hot'), F.parent, { fg: '#ffcf8a', h: 0.38 });
          }
      if (a.venue === 'hollow') {
        S.poachT -= dt;
        if (S.poachT <= 0 && !S.poacher) {
          S.poachT = a.rr(16, 24);
          const F = S.fams.find((f) => f.state === 'wait');
          if (F) poach(F);
        }
      }
    },
  };
}
