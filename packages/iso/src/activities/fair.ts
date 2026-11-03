import { clamp, hdist } from '@td/shared';
import { textArt } from '../art/font';
import { bakeArt } from '../core/art';
import { applyMat, type BakedArt, Box, Custom, Group, type Node } from '../core/graph';
import { part } from '../people/parts';
import type { Person } from '../people/person';
import { PICKLE_GREEN } from './looks';
import { AUTUMN, bareTree, canopy, table, tree } from './props';
import { type Act, fwd, NORTH, SOUTH } from './runtime';

type Demo = 'spin' | 'kick' | 'paddle' | 'cheer' | 'yoga';
interface Booth {
  id: 'r1' | 'tn' | 'r2';
  x: number;
  key: string;
  col: string;
  c2: string;
  demo?: Demo;
  /** 摊位吸引力权重、报名率 */
  w?: number;
  sign?: number;
  count: number;
  staff?: Person;
  performer?: Person;
  ball?: Node;
  anchor?: Node;
  bt?: number;
}

const BOOTHS: Record<string, Omit<Booth, 'count'>[]> = {
  generic: [
    { id: 'r1', x: -8, key: 'booth.basketball', col: '#e2762f', c2: '#f4e6d4', demo: 'spin' },
    { id: 'tn', x: 0, key: 'booth.tennis', col: '#2e86a6', c2: '#f2efe6' },
    { id: 'r2', x: 8, key: 'booth.soccer', col: '#3f9a52', c2: '#f2efe6', demo: 'kick' },
  ],
  maple: [
    { id: 'r1', x: -8, key: 'booth.basketballTeam', col: '#24456e', c2: '#f2efe6', demo: 'spin' },
    { id: 'tn', x: 0, key: 'booth.tennisTeam', col: '#7c2232', c2: '#e6b03c' },
    { id: 'r2', x: 8, key: 'booth.cheer', col: '#e86aa0', c2: '#f6f3ea', demo: 'cheer' },
  ],
  hollow: [
    { id: 'r1', x: -8, key: 'booth.pickleball', col: PICKLE_GREEN, c2: '#f2efe6', demo: 'paddle', w: 2.6, sign: 0.4 },
    { id: 'tn', x: 0, key: 'booth.tennisClub', col: '#5b6f8a', c2: '#d8d4cc' },
    { id: 'r2', x: 8, key: 'booth.yoga', col: '#8a6ac4', c2: '#f2efe6', demo: 'yoga' },
  ],
};

/**
 * 写字的立牌（旧版 labelPlane 的像素版，和 tryout 里的同一画法；以后可以挪进 props）：竖直的一块底色面朝 +z，字是烘焙的像素字，
 * 按整数倍放大到放得下为止；牌子在屏幕上小到放不下字时只画底色。背面朝镜头时也只画底色。
 */
export function labelBoard(text: string, w: number, h: number, bg: string, fg: string): Custom {
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
        const b: BakedArt = bakeArt(art);
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
 * 社团招新会：几个摊位抢学生。网球摊的花式表演成功会吸引围观和报名，失手会被球砸头，大家哈哈大笑。
 * 区域中心为原点，摊位在北边一排（z≈-4），学生在南边闲逛。
 */
export function fair(a: Act) {
  const vb = a.vb;
  const tier = a.num('tier');
  const v = a.venue;
  for (const [x, z] of [
    [-10.6, 5.8],
    [10.6, 5.8],
  ] as const) {
    vb.box(x, 0, z, 1.6, 0.5, 1.6, '#8a8070');
    if (v === 'hollow') bareTree(vb, a.rand, x, z, 0.6);
    else tree(vb, a.rand, x, z, 0.75, v === 'maple' ? AUTUMN : undefined, a.heat);
  }
  const booths: Booth[] = (BOOTHS[v] ?? BOOTHS.generic ?? []).map((b) => ({ ...b, count: 0 }));
  for (const b of booths) {
    const tn = b.id === 'tn';
    if (!tn || tier >= 2) canopy(vb, b.x, -4.4, 3.4, 2.2, b.col, b.c2);
    table(vb, b.x, -3.6, 2.6, 0.8, tn && tier === 1 ? '#a8875a' : '#efeae0');
    if (!tn || tier >= 2) {
      const s = a.own(labelBoard(a.t(b.key), 2.4, 0.55, b.col, '#ffffff'));
      s.position.set(b.x, 2.0, -3.28);
    } else {
      const s = a.own(labelBoard(a.t('booth.handSign'), 1.5, 0.5, '#c9a874', '#3a2a1a'));
      s.position.set(b.x, 1.15, -3.55);
      s.rotation.x = -0.25;
      vb.box(b.x, 0.75, -3.75, 0.08, 0.4, 0.08, '#8a6a45');
    }
    b.staff = a.person({ x: b.x + 0.4, z: -4.5, yaw: SOUTH, shirt: b.col });
    b.staff.idleFace = SOUTH;
  }
  const tn = booths[1] as Booth;
  if (tier >= 2)
    [
      [-1.7, -3.3],
      [1.7, -3.3],
    ].forEach(([x, z], i) => {
      vb.box(x as number, 0, z as number, 0.02, 2.4, 0.02, '#e8e2d0');
      vb.box(x as number, 2.4, z as number, 0.5, 0.6, 0.5, i ? '#ffd84a' : tn.col);
    });
  let mascot: Person | null = null;
  if (tier === 3) {
    for (let k = 0; k <= 12; k++) {
      const u = (k / 12) * Math.PI;
      vb.box(Math.cos(u) * 3.6, Math.sin(u) * 3.4, -2.6, 0.9, 0.9, 0.9, k % 2 ? tn.col : tn.c2);
    }
    const arch = a.own(labelBoard(a.t('fairArch', { club: a.t(tn.key) }), 3.4, 0.5, tn.col, '#ffffff'));
    arch.position.set(0, 3.95, -2.1);
    vb.box(2.6, 0, -2.9, 0.6, 1.0, 0.5, '#222');
    vb.box(2.6, 0.3, -2.64, 0.4, 0.4, 0.02, '#555');
    mascot = a.spawn({
      x: -1.8,
      z: -1.8,
      yaw: 0.3,
      shirt: tn.col,
      shorts: '#f2efe6',
      skin: '#f6f3ea',
      hair: '#d9ec52',
      shoes: '#f3f1ea',
    });
    // 网球吉祥物：脑袋换成一个大网球。像素版的人是一张精灵，藏不掉脑袋，
    // 所以大网球挂在头顶挂点上、往前排序，把精灵的脑袋盖住
    mascot.head.visible = false;
    const ballHead = new Group();
    part(ballHead, 0.86, 0.86, 0.86, 0, 0.38, 0, '#d9ec52');
    part(ballHead, 0.06, 0.7, 0.88, 0.3, 0.38, 0, '#f6f8df');
    part(ballHead, 0.06, 0.7, 0.88, -0.3, 0.38, 0, '#f6f8df');
    part(ballHead, 0.12, 0.16, 0.02, 0.15, 0.48, 0.44, '#1a1612');
    part(ballHead, 0.12, 0.16, 0.02, -0.15, 0.48, 0.44, '#1a1612');
    part(ballHead, 0.3, 0.06, 0.02, 0, 0.24, 0.44, '#c43a3a');
    ballHead.position.y = -0.5;
    ballHead.traverse((n) => {
      n.renderOrder = 0.4;
    });
    mascot.headTop.add(ballHead);
  }
  if (v === 'hollow')
    [
      [-9.7, -3.3],
      [-6.3, -3.3],
      [-8, -3.2],
    ].forEach(([x, z], i) => {
      vb.box(x as number, 0, z as number, 0.02, 2.6, 0.02, '#e8e2d0');
      vb.box(x as number, 2.6, z as number, 0.5, 0.6, 0.5, [PICKLE_GREEN, '#ffd84a', '#f2efe6'][i] as string);
    });

  // 表演者
  const cast = a.opts.cast;
  const tnDemo = a.cast(cast?.players?.[0], { x: 0.6, z: -1.9, yaw: SOUTH, base: 'juggle' }, () =>
    a.person({ team: true, x: 0.6, z: -1.9, yaw: SOUTH, base: 'juggle', racket: '#2c5fbf' }),
  );
  tnDemo.idleFace = SOUTH;
  tn.performer = tnDemo;
  const tnBall = new Box(0.16, 0.16, 0.16, '#d8e64a');
  a.group.add(tnBall);
  for (const b of booths) {
    if (!b.demo) continue;
    const base =
      b.demo === 'spin' ? 'spinball' : b.demo === 'paddle' ? 'juggle' : b.demo === 'yoga' ? 'yoga' : 'relaxed';
    const d = a.person({
      x: b.x,
      z: -1.9,
      yaw: SOUTH,
      shirt: b.col,
      base,
      paddle: b.demo === 'paddle' ? '#3a8fd9' : undefined,
    });
    d.idleFace = SOUTH;
    b.performer = d;
    if (b.demo === 'spin') {
      b.ball = new Box(0.3, 0.3, 0.3, '#e2762f');
      a.group.add(b.ball);
    }
    if (b.demo === 'kick') {
      const g = new Group();
      part(g, 0.26, 0.26, 0.26, 0, 0, 0, '#f6f3ea');
      part(g, 0.27, 0.1, 0.1, 0, 0, 0, '#222');
      part(g, 0.1, 0.27, 0.1, 0, 0, 0, '#222');
      a.group.add(g);
      b.ball = g;
      d.legHook = (p, now) => {
        const u = (now * 1.6) % 1;
        if (u < 0.3) p.legR.rotation.x = -1.2 * Math.sin((u / 0.3) * Math.PI);
      };
    }
    if (b.demo === 'paddle') {
      b.ball = new Box(0.15, 0.15, 0.15, '#f0d24a');
      a.group.add(b.ball);
      b.anchor = d.handR;
    }
    if (b.demo === 'cheer') {
      part(d.handR, 0.3, 0.3, 0.3, 0, 0.05, 0, '#ff9ac4');
      part(d.handL, 0.3, 0.3, 0.3, 0, 0.05, 0, '#ff9ac4');
    }
    if (b.demo === 'yoga') d.legHook = (p) => p.legR.rotation.set(-0.5, 0, -1.0);
  }
  // 报名板
  const board = a.own(labelBoard('', 1.2, 0.9, '#b88a5a', '#000'));
  board.position.set(1.95, 1.45, -3.3);
  vb.box(1.95, 0, -3.32, 0.06, 1.0, 0.06, '#6a4a2e');
  const boardPos = { x: 1.95, y: 1.45, z: -3.26 };
  const notes: Box[] = [];
  const nStu = Math.round(
    ({ sun: 14, cloud: 12, rain: 6, wind: 11, heat: 8 }[a.wx] + tier) * (v === 'hollow' ? 0.7 : 1),
  );
  const S = { hot: -9, trickT: 4, trick: false, chasing: false, nNote: 0, mh: -1, nt: -1 };

  const addNote = () => {
    const i = S.nNote % 12;
    S.nNote++;
    if (i === 0) for (const n of notes.splice(0)) n.parent?.remove(n);
    const m = new Box(0.24, 0.18, 0.02, a.pick(['#ffe46a', '#ff9ab8', '#9fe3ff', '#b8f0a0']));
    m.position.set(boardPos.x - 0.42 + (i % 4) * 0.28, boardPos.y + 0.26 - Math.floor(i / 4) * 0.26, boardPos.z + 0.02);
    m.rotation.z = a.rr(-0.2, 0.2);
    notes.push(m);
    a.group.add(m);
    a.fx.sparkle(m.position.x, m.position.y, m.position.z + 0.1, 5, '#ffffff');
  };

  const edge = () =>
    a.pick([
      { x: a.b.x0, z: a.rr(0, 6) },
      { x: a.b.x1, z: a.rr(0, 6) },
      { x: a.rr(-10, 10), z: a.b.z1 },
    ]);
  const leave = (p: Person) => {
    const e = edge();
    p.go(e.x, e.z, 1.4);
    p.call(() => {
      a.remove(p);
      a.at(a.rr(0.5, 2.5), () => spawn(false));
    });
  };
  const decide = (p: Person) => {
    if (p.removed) return;
    p.watch = null;
    const r = a.rand();
    if (r < 0.3) {
      p.go(a.rr(-10, 10), a.rr(-0.3, 6), a.rr(1.0, 1.5));
      p.wait(a.rr(0.8, 2.2));
      p.call(() => decide(p));
      return;
    }
    if (r < 0.9) {
      const w = booths.map((b) =>
        b.id === 'tn' ? 0.4 + 0.55 * tier + 0.1 * (a.c - 3) + (S.hot > a.now ? 1.3 : 0) : (b.w ?? 1.1),
      );
      const tot = w.reduce((s, x) => s + x, 0);
      let x = a.rand() * tot;
      let bi = 0;
      while (x > (w[bi] as number) && bi < w.length - 1) {
        x -= w[bi] as number;
        bi++;
      }
      const b = booths[bi] as Booth;
      p.go(b.x + a.rr(-1.7, 1.7), a.rr(-0.6, 1.4), a.rr(1.1, 1.5));
      p.call(() => {
        p.watch = b.performer ?? null;
      });
      p.wait(a.rr(2.4, 4.4));
      p.call(() => {
        p.watch = null;
        const ps =
          b.id === 'tn'
            ? clamp(0.08 + 0.09 * tier + 0.04 * (a.c - 3) + (S.hot > a.now ? 0.18 : 0) - 0.1 * a.f, 0.03, 0.85)
            : (b.sign ?? 0.22);
        if (a.chance(ps)) {
          p.go(b.x + a.rr(-0.9, 0.9), -3.05, 1.3);
          p.call(() => {
            p.idleFace = NORTH;
            a.gesture(p, 'sign', 1.3);
          });
          p.wait(1.4);
          p.call(() => {
            a.pop(a.t('signUp'), p, { fg: b.id === 'tn' ? '#9fe3ff' : '#e8e4d8', h: 0.45 });
            b.count++;
            if (b.id === 'tn') {
              a.emote(p, 'heart', 1.4);
              addNote();
            }
          });
          p.wait(0.5);
          p.call(() => leave(p));
        } else if (a.chance(0.7)) decide(p);
        else leave(p);
      });
      return;
    }
    leave(p);
  };
  const spawn = (initial: boolean) => {
    const e = initial ? { x: a.rr(-10, 10), z: a.rr(-0.5, 6) } : edge();
    const p = a.person({ x: e.x, z: e.z, umb: true, scale: a.rr(0.9, 1) });
    p.userData.student = true;
    p.speedK = a.heat ? 0.75 : 1;
    decide(p);
  };
  for (let i = 0; i < nStu; i++) spawn(true);

  const trick = () => {
    S.trick = true;
    const ok = a.chance(clamp(0.35 + 0.12 * (a.c - 1) - 0.3 * a.f, 0.05, 0.95));
    const rh = a.lp(tnDemo.racketHead);
    const top = { x: rh.x, y: rh.y + 3.2, z: rh.z };
    a.tween(tnBall, { x: rh.x, y: rh.y + 0.1, z: rh.z }, top, 0.6);
    a.at(0.6, () => {
      a.gesture(tnDemo, 'trick', 1.0);
      const watchers = () => a.people.filter((p) => p.userData.student && hdist(p.pos, tnDemo.pos) < 7);
      if (ok) {
        a.tween(tnBall, top, { x: rh.x, y: rh.y + 0.1, z: rh.z }, 0.6, { onEnd: () => (S.trick = false) });
        a.at(0.7, () => {
          a.pop(a.t('trickName'), tnDemo, { fg: '#ffe45c', h: 0.6 });
          a.fx.sparkle(tnDemo.pos.x, 1.6, tnDemo.pos.z, 14);
          S.hot = a.now + 5;
          watchers()
            .slice(0, 4)
            .forEach((p, i) => {
              a.at(i * 0.15, () => {
                a.emote(p, 'excl', 1.1);
                if (i < 2) a.pop(a.t('wow'), p, { fg: '#ffffff', h: 0.4 });
                p.watch = tnDemo;
              });
            });
        });
      } else {
        const hd = a.lp(tnDemo.headTop);
        a.tween(tnBall, top, hd, 0.55);
        a.at(0.55, () => {
          a.emote(tnDemo, 'star', 1.2);
          a.dizzy(tnDemo, 1.2);
          a.pop(a.t('bonk'), tnDemo, { fg: '#ffb070', h: 0.6 });
          a.gesture(tnDemo, 'bonk', 1.0);
          a.tween(tnBall, hd, { x: hd.x + 0.8, y: 0.08, z: hd.z + 0.9 }, 0.5, {
            h: 0.5,
            onEnd: () => a.at(0.8, () => (S.trick = false)),
          });
          watchers()
            .slice(0, 3)
            .forEach((p, i) => {
              a.at(0.2 + i * 0.2, () => a.pop(a.t('haha'), p, { fg: '#ffe9a8', h: 0.38 }));
            });
        });
      }
    });
  };

  const flyers = () => {
    const st = tn.staff as Person;
    S.chasing = true;
    for (let i = 0; i < 4; i++) a.at(i * 0.1, () => a.fx.paper(a.rr(-1, 1), 0.85, -3.6));
    a.pop(a.t('flyers'), st, { fg: '#ffcf8a', h: 0.42 });
    st.clearMoves();
    st.go(1.6, -2.8, 3.2);
    st.go(3.4, 0.6, 3.2);
    st.call(() => a.gesture(st, 'hand', 0.5));
    st.wait(0.6);
    st.go(0.4, -4.5, 2.4);
    st.call(() => {
      st.idleFace = SOUTH;
      S.chasing = false;
    });
  };

  return {
    update(dt: number) {
      const now = a.now;
      for (const b of booths) {
        const d = b.performer;
        if (!d || b.id === 'tn' || !b.ball) {
          if (b.demo === 'cheer' && d && Math.floor(now / 0.6) !== b.bt) {
            b.bt = Math.floor(now / 0.6);
            a.hop(d, 0.45, 0.4);
            a.gesture(d, b.bt % 2 ? 'cheer' : 'wave', 0.55);
          }
          continue;
        }
        if (b.demo === 'spin') {
          const hp = a.lp(d.handR);
          b.ball.position.set(hp.x, hp.y + 0.2, hp.z);
          b.ball.rotation.y = now * 14;
        } else if (b.demo === 'kick') {
          const ff = fwd(d.yaw);
          const u = (now * 1.6) % 1;
          b.ball.position.set(d.pos.x + ff.x * 0.35 - 0.13, 0.35 + Math.sin(u * Math.PI) * 1.0, d.pos.z + ff.z * 0.35);
          b.ball.rotation.x = now * 6;
        } else if (b.demo === 'paddle' && b.anchor) {
          const h = a.lp(b.anchor);
          b.ball.position.set(h.x, h.y + 0.1 + Math.abs(Math.sin(now * 7)) * 0.55, h.z);
        }
      }
      if (!S.trick) {
        const rh = a.lp(tnDemo.racketHead);
        tnBall.position.set(rh.x, rh.y + 0.1 + Math.abs(Math.sin(now * 6)) * 0.7, rh.z);
      }
      tnDemo.tired = a.f;
      S.trickT -= dt;
      if (S.trickT <= 0 && !S.trick) {
        S.trickT = a.rr(5, 7);
        trick();
      }
      if (mascot && Math.floor(now / 0.55) !== S.mh) {
        S.mh = Math.floor(now / 0.55);
        a.hop(mascot, 0.25, 0.3);
        a.gesture(mascot, 'dance', 0.55);
      }
      if (tier === 3 && Math.floor(now / 0.8) !== S.nt) {
        S.nt = Math.floor(now / 0.8);
        a.icon('note', { x: 2.6 + a.rr(-0.2, 0.2), y: 1.2, z: -2.6 }, 0.32, 1.4, 1.2);
      }
      if (a.wind && a.chance(dt * 0.35) && !S.chasing) flyers();
    },
  };
}
