import { clamp, type XYZ, type XZ } from '@td/shared';
import { textArt } from '../art/font';
import { bakeArt } from '../core/art';
import { applyMat, type BakedArt, Custom } from '../core/graph';
import type { Ball } from '../motion/ball';
import type { Person } from '../people/person';
import { away, chase, fly, intoNet, shot, sideOf, through } from './choreo';
import { DULL, HAIR, SKIN } from './looks';
import { basket, table } from './props';
import { type Act, BR, EAST, fwd, NORTH, rgt, WEST } from './runtime';

type Applicant = Person & { talent?: number; scores?: number[] };

/**
 * 写字的立牌（旧版 labelPlane 的像素版）：竖直的一块底色面朝 +z，字是烘焙的像素字，
 * 按整数倍放大到放得下为止；牌子在屏幕上小到放不下字时只画底色。背面朝镜头时也只画底色。
 */
function labelBoard(text: string, w: number, h: number, bg: string, fg: string): Custom {
  const art = textArt(text, { color: fg });
  let baked: BakedArt | undefined;
  const hw = w / 2;
  const hh = h / 2;
  return new Custom(
    (r, self) => {
      const m = self.matrixWorld;
      const pts = (
        [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ] as const
      ).map(([x, y]) => {
        const v = { x, y, z: 0 };
        applyMat(m, v);
        return [v.x, v.y, v.z] as const;
      });
      const c = { x: 0, y: 0, z: 0 };
      applyMat(m, c);
      const lit = self.lit ?? r.litAt(c.x, c.z);
      r.wpoly(pts, r.col(bg, 1, lit));
      // 正面法线 = 局部 +z 轴的世界方向
      if (!art || !r.vis(m[6] as number, m[8] as number)) return;
      if (baked === undefined) {
        // 字的锚点挪到中心，对准牌子中心
        const b = bakeArt(art);
        baked = { ...b, ox: Math.floor(b.w / 2), oy: Math.floor(b.h / 2) };
      }
      const [x0] = r.P(...(pts[0] as [number, number, number]));
      const [x1] = r.P(...(pts[1] as [number, number, number]));
      const room = Math.abs(x1 - x0) * 0.92;
      const k = Math.min(r.spriteScale, Math.floor(room / baked.w));
      if (k < 1) return;
      const t = { x: 0, y: 0, z: 0.01 };
      applyMat(m, t);
      r.art(baked, t.x, t.y, t.z, { scale: k, lit });
    },
    { x0: -hw, x1: hw, y0: -hh, y1: hh, z0: 0, z1: 0.02 },
  );
}

/**
 * 选拔试训：报名的孩子排队上场，每人打两球，评委举牌打分。偶尔出现天才，全场起立；
 * 教练水平低时评委会打瞌睡、看走眼。球网 x=0，考生在左半场。
 */
export function tryout(a: Act) {
  const vb = a.vb;
  basket(vb, 2.1, -0.6);
  table(vb, -6.8, -5.5, 4.6, 0.8);
  const BN = {
    generic: ['#2e86a6', '#f6f3ea'],
    maple: ['#7c2232', '#e6b03c'],
    hollow: ['#c9a874', '#3a2a1a'],
  }[a.venue] as [string, string];
  const banner = a.own(labelBoard(a.t(`tryoutBanner.${a.venue}`), 4.4, 0.6, BN[0], BN[1]));
  banner.position.set(-6.8, 0.42, -5.08);
  if (a.rain || a.heat) {
    vb.box(-6.8, 0, -6.6, 0.08, 2.6, 0.08, '#d8d4cc');
    for (let i = 0; i < 6; i++)
      vb.box(-6.8, 2.6 - i * 0.02, -6.0, 3.6 - i * 0.4, 0.08, 3.6 - i * 0.4, i % 2 ? '#f2efe6' : '#e05a3a');
  }
  vb.box(3.7, 0.012, 4.9, 3.0, 0.02, 2.2, '#5fbf6a');
  vb.box(5.0, 0, 5.8, 0.06, 1.8, 0.06, '#e8e2d0');
  const fl = a.own(labelBoard(a.t('accepted'), 0.9, 0.5, '#5fbf6a', '#0f2a14'));
  fl.position.set(5.46, 1.5, 5.8);

  const cast = a.opts.cast;
  const judges: (Person & { isHead?: boolean })[] = [];
  const headIsCast = !!cast?.coach;
  [-8.2, -6.8, -5.4].forEach((x, i) => {
    const z = -6.2;
    if (a.venue === 'hollow' && i !== 1) {
      vb.box(x, 0, z, 0.45, 0.42, 0.45, '#d8d4cc');
      vb.box(x, 0.42, z - 0.22, 0.45, 0.5, 0.05, '#d8d4cc');
      return;
    }
    const side =
      a.venue === 'maple'
        ? {
            shirt: a.pick(['#7a6a5a', '#5a6a7a', '#8a5a5a']),
            longSleeve: true,
            pants: true,
            shorts: '#3a3f4a',
            hair: a.pick(['#9a9a96', '#5a3a22', '#d9c27a']),
          }
        : { shirt: '#5a5f66', pants: true, shorts: '#3a3f4a' };
    const seatY = a.gy(x, z) - 0.4;
    const j: Person & { isHead?: boolean } =
      i === 1 && !headIsCast
        ? a.coachPerson({ x, z, yaw: 0, seatY, clipboard: true })
        : a.person({ x, z, yaw: 0, seatY, clipboard: true, ...side });
    j.base = 'seated';
    j.isHead = i === 1;
    judges.push(j);
  });
  const head = judges.find((j) => j.isHead);
  if (head && !headIsCast) a.badge(head);
  const team = a.style.team;
  const fd = team
    ? { shirt: team.shirt, shorts: team.shorts, cap: team.trim || team.shirt }
    : { shirt: a.pick(DULL), shorts: '#3a3f4a', cap: '#5a5f63' };
  // 游戏里借来的教练当喂球手（坐着当评委会被游戏的"看手机"状态打断）
  const feeder = a.cast(cast?.coach, { x: 1.6, z: 0.3, lock: WEST }, () =>
    a.spawn({
      x: 1.6,
      z: 0.3,
      lock: WEST,
      ...fd,
      skin: a.pick(SKIN),
      hair: a.pick(HAIR),
      hairStyle: 'cap',
      shoes: '#f3f1ea',
    }),
  );
  if (headIsCast) a.badge(feeder);
  const S = { queue: [] as Applicant[], accepted: [] as Applicant[] };

  const qx = (i: number) => -15 + i * 1.15;
  const newBatch = () => {
    const n = a.venue === 'hollow' ? Math.max(2, Math.round(a.num('n') * 0.6)) : a.num('n');
    S.queue = [];
    S.accepted = [];
    const prod = a.chance((a.venue === 'hollow' ? 0.12 : 0.35) + n * 0.06) ? a.ri(0, n - 1) : -1;
    for (let i = 0; i < n; i++) {
      const ex =
        a.venue === 'maple'
          ? { shirt: '#9aa0a3', shorts: '#7c2232' }
          : a.venue === 'hollow' && a.chance(0.45)
            ? {
                pants: true,
                hair: a.pick(['#9a9a96', '#5a3a22']),
                hairStyle: a.pick(['bald', 'short'] as const),
                shirt: a.pick(DULL),
              }
            : {};
      const p: Applicant = a.person({
        x: -15.8,
        z: 5.8,
        scale: a.rr(0.82, 0.95),
        racket: a.pick(['#d6362f', '#2c5fbf', '#1f1f1f', '#e7e7e7', '#f0a020']),
        ...ex,
      });
      p.talent = i === prod ? a.rr(0.92, 1) : a.rr(0.1, 0.85);
      p.scores = [];
      p.speedK = 1 - 0.4 * a.f;
      p.go(qx(i), 5.6, 1.8);
      p.call(() => {
        p.idleFace = NORTH;
      });
      S.queue.push(p);
    }
    a.at(2.4 + n * 0.3, next);
  };

  const next = () => {
    const p = S.queue.shift();
    if (!p) {
      endBatch();
      return;
    }
    S.queue.forEach((q, i) => {
      q.clearMoves();
      q.go(qx(i), 5.6, 1.4);
      q.call(() => {
        q.idleFace = NORTH;
      });
    });
    p.clearMoves();
    p.path(
      [
        { x: -11.6, z: 4.0 },
        { x: -11.1, z: 0 },
      ],
      2.0,
    );
    p.call(() => {
      p.lock = EAST;
      p.base = 'ready';
      if ((p.talent ?? 0) > 0.9 && a.chance(0.5)) a.emote(p, 'note', 1.2);
      else a.emote(p, 'sweat', 1.0);
      a.at(0.7, () => feedTo(p, 0));
    });
  };

  const feedTo = (p: Applicant, k: number) => {
    const ball = a.pool.get(feeder);
    ball.holdAt(feeder.handL);
    a.swing(feeder, 'toss', a.now + 0.5);
    const L = feeder.lock ?? WEST;
    const f = fwd(L);
    const r = rgt(L);
    const C = { x: feeder.pos.x + f.x * 0.6 + r.x * 0.4, y: 0.9, z: feeder.pos.z + f.z * 0.6 + r.z * 0.4 };
    a.at(0.3, () => ball.arc(a.lp(feeder.handL), C, a.now, 0.2));
    a.at(0.5, () => {
      const B = { x: -8.8, y: BR, z: a.rr(-1.0, 1.0) };
      const sh = shot(a, ball, C, B, a.now, 10, 0.9, 2.4, 0);
      const side = sideOf(p, sh.P2);
      chase(p, sh.P2, a.now, sh.tC, side, side > 0 ? 'fh' : 'bh', 5);
      a.at(sh.tC - a.now, () => hit(p, ball, sh.P2, k, sh.dir));
    });
  };

  const hit = (p: Applicant, ball: Ball, P0: XYZ, k: number, dir: XZ) => {
    const talent = p.talent ?? 0.5;
    const q = clamp(talent + a.rr(-0.12, 0.12) - 0.18 * a.f, 0, 1);
    p.scores?.push(q);
    a.at(0.5, () => {
      p.clearMoves();
      p.go(-11.1, 0, 1.8);
    });
    if (q < 0.25) {
      p.stroke = null;
      a.spin(p, 0.55);
      through(a, ball, P0, a.now, dir);
      a.at(0.2, () => {
        a.pop(a.t('whiff'), p, { fg: '#ffb070', h: 0.5 });
        a.dizzy(p, 1.2);
      });
    } else if (q < 0.45) {
      intoNet(a, ball, P0, { x: 0, y: a.rr(0.3, 0.7), z: a.rr(-2, 2) }, a.now, 9);
      a.pop(a.t('net'), p, { fg: '#ff9a80', h: 0.42 });
    } else if (talent < 0.9) {
      const B = { x: a.rr(1.8, 4.8), y: BR, z: a.rr(-4, 4) };
      away(a, ball, P0, B, a.now, fly(P0, B, q > 0.75 ? 17 : 12, 0));
      if (q > 0.75) a.pop(a.t('goodShot'), p, { fg: '#d9ec52', h: 0.45 });
    } else {
      const B = { x: a.rr(4.4, 5.4), y: BR, z: a.rr(-4, 4) };
      away(a, ball, P0, B, a.now, fly(P0, B, 30, 0));
      a.shake = 0.4;
      a.pop(a.t('whoosh'), p, { fg: '#ffe45c', h: 0.75 });
      a.at(0.3, () => {
        a.emote(feeder, 'excl', 1.4);
        for (const j of judges) a.emote(j, 'excl', 1.2);
      });
    }
    ball.fadeOut(a.now + 2.6);
    if (k < 1) a.at(1.6, () => feedTo(p, k + 1));
    else a.at(1.5, () => judge(p));
  };

  const GC: Record<string, string> = { S: '#c9921a', A: '#2f8a4a', B: '#2e6a9a', C: '#8a4a3a', '?': '#6a6a6a' };
  const judge = (p: Applicant) => {
    const sc = p.scores ?? [];
    const avg = sc.reduce((s, v) => s + v, 0) / Math.max(1, sc.length);
    const prod = (p.talent ?? 0) >= 0.9;
    const sleepy = a.c <= 2;
    const miss = prod && sleepy && a.chance(a.c === 1 ? 0.75 : 0.5);
    judges.forEach((j, i) => {
      a.at(0.35 * i, () => {
        let g: string;
        if (sleepy && !j.isHead && a.chance(0.5)) {
          a.emote(j, 'zzz', 2.2);
          g = '?';
        } else {
          const noise = (5 - a.c) * 0.09;
          let v = avg + a.rr(-noise, noise);
          if (prod && !miss) v = 1;
          if (miss) v = a.rr(0.3, 0.5);
          g = v >= 0.95 ? 'S' : v >= 0.7 ? 'A' : v >= 0.52 ? 'B' : 'C';
        }
        a.gesture(j, 'cardUp', 2.2);
        a.card(j, g, GC[g]);
      });
    });
    const pass = !miss && (prod || avg >= 0.55);
    a.at(1.5, () => {
      p.lock = null;
      p.stroke = null;
      if (prod && !miss) {
        a.pop(a.t('prodigy'), p, { fg: '#ffd84a', h: 0.9 });
        a.fx.confetti(p.pos.x, 2, p.pos.z, 50, 1.4);
        a.flash({ x: p.pos.x, y: 1.6, z: p.pos.z }, 2);
        for (const j of judges) {
          const sy = j.seatY;
          j.seatY = null;
          j.base = 'relaxed';
          a.gesture(j, 'clap', 2.2);
          a.hop(j, 0.3, 0.4);
          a.at(2.4, () => {
            j.seatY = sy;
            j.base = 'seated';
          });
        }
      }
      if (miss) a.at(1.0, () => a.pop(a.t('missedIt'), { x: -6.8, y: 2.4, z: -5.6 }, { fg: '#ff9a80', h: 0.55 }));
      if (pass) {
        a.pop(a.t('admitted'), p, { fg: '#9cf0b4', h: 0.6 });
        a.hop(p, 0.35, 0.4);
        p.base = 'relaxed';
        const i = S.accepted.length;
        S.accepted.push(p);
        p.go(-10.2, 2, 2.2);
        p.go(2.8 + (i % 3) * 0.9, 4.4 + Math.floor(i / 3) * 0.9, 2.2);
        p.call(() => {
          p.idleFace = NORTH;
          a.gesture(p, 'cheer', 1.2);
          a.hop(p, 0.3, 0.35);
        });
      } else {
        a.pop(a.t('rejected'), p, { fg: '#a9b4c0', h: 0.5 });
        p.base = 'slump';
        a.emote(p, 'cloud', 4.2);
        p.path(
          [
            { x: -13.7, z: -1.5 },
            { x: -15.9, z: -3 },
          ],
          1.1,
        );
        p.call(() => a.remove(p));
      }
      a.at(2.8, next);
    });
  };

  const endBatch = () => {
    S.accepted.forEach((p, i) => {
      a.at(i * 0.2, () => {
        a.gesture(p, 'wave', 1.4);
        a.at(1.4, () => {
          p.clearMoves();
          p.go(Math.min(5.5, a.b.x1 - 0.2), a.rr(1, 6), 1.8);
          p.call(() => a.remove(p));
        });
      });
    });
    a.at(4.5, newBatch);
  };

  newBatch();
  return {
    update() {
      for (const p of S.queue) p.tired = a.f * 0.8;
      if (a.wind && a.chance(0.01)) a.fx.paper(a.rr(-8.2, -5.2), 0.85, -5.5);
    },
  };
}
