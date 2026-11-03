import { Group } from '../core/graph';
import { part } from '../people/parts';
import type { Person } from '../people/person';
import { drinkBreak, pant } from './choreo';
import { DULL } from './looks';
import { mkBundle, mkMegaphone, mkRake } from './props';
import { type Act, SOUTH } from './runtime';

interface Junk {
  g: Group;
  x: number;
  z: number;
  /** 被谁认领了 */
  taken: boolean;
  kind: 'branch' | 'weeds' | 'trash';
}

/**
 * 劳动日（原型里没有，ADR 0010 新增）：荒掉的场地上散着断枝、杂草、垃圾，
 * 一群人捡起来、抱到场边的垃圾箱；清干净了大家欢呼，然后再来一轮。
 * crew=pros 是外包施工队：荧光背心、安全帽，干得快、不喘气，也不聊天。区域中心为原点。
 */
export function cleanup(a: Act) {
  const vb = a.vb;
  const pros = a.str('crew') === 'pros';
  const DX = 9.2;
  const DZ = -4.6;
  // 垃圾箱
  vb.box(DX, 0, DZ, 1.8, 1.1, 1.1, pros ? '#e07a1f' : '#3d5a46');
  vb.box(DX, 1.1, DZ, 1.9, 0.08, 1.2, pros ? '#b85f12' : '#2c4433');
  vb.box(DX - 0.9, 0.2, DZ + 0.56, 0.12, 0.12, 0.04, '#222');
  if (pros) {
    // 施工围挡和一辆手推车
    for (let i = 0; i < 4; i++) vb.box(-9.6 + i * 1.3, 0, 5.6, 1.1, 0.5, 0.08, i % 2 ? '#f2efe6' : '#e05a3a');
    vb.box(-6.4, 0.3, -5.2, 0.9, 0.35, 0.6, '#5a6a7a');
    vb.box(-5.9, 0.1, -5.2, 0.2, 0.2, 0.2, '#222');
  }
  const pile = { x: DX - 1.4, z: DZ + 0.2 };

  const junk: Junk[] = [];
  const mkJunk = (): Junk => {
    const g = new Group();
    const kind = a.pick(['branch', 'branch', 'weeds', 'trash'] as const);
    if (kind === 'branch') {
      part(g, 1.2, 0.12, 0.12, 0, 0.06, 0, '#5a4030');
      part(g, 0.5, 0.08, 0.08, 0.2, 0.08, 0.18, '#6a4a32').rotation.y = 0.7;
      part(g, 0.3, 0.2, 0.3, -0.4, 0.12, 0, '#5d7a2e');
    } else if (kind === 'weeds') {
      for (let i = 0; i < 4; i++)
        part(
          g,
          0.08,
          a.rr(0.3, 0.6),
          0.08,
          a.rr(-0.2, 0.2),
          0.2,
          a.rr(-0.2, 0.2),
          a.pick(['#5e7a2e', '#6d7f34', '#4f6a2a']),
        );
    } else {
      part(g, 0.3, 0.12, 0.2, 0, 0.06, 0, a.pick(['#c9c9c2', '#b23a2c', '#3b6ea8']));
      part(g, 0.2, 0.02, 0.24, 0.3, 0.01, 0.1, '#e2ddcf');
    }
    const x = a.rr(-9, 7);
    const z = a.rr(-5, 5);
    g.position.set(x, 0.02, z);
    g.rotation.y = a.rr(0, 6.28);
    a.group.add(g);
    return { g, x, z, taken: false, kind };
  };
  const nJunk = 14;
  const fill = () => {
    for (let i = 0; i < nJunk; i++) junk.push(mkJunk());
  };
  fill();

  const cast = a.opts.cast;
  const boss = a.cast(cast?.coach, { x: -9.4, z: -4.6, yaw: 0.8 }, () =>
    pros
      ? a.person({
          x: -9.4,
          z: -4.6,
          yaw: 0.8,
          shirt: '#e8e2d0',
          hairStyle: 'cap',
          cap: '#f2c230',
          pants: true,
          clipboard: true,
        })
      : a.coachPerson({ x: -9.4, z: -4.6, yaw: 0.8 }),
  );
  boss.idleFace = 0.8;
  if (!pros) boss.give('L', mkMegaphone());
  a.badge(boss);
  const n = Math.max(a.num('n'), cast?.players?.length ?? 0);
  const crew: Person[] = [];
  for (let i = 0; i < n; i++) {
    const at = { x: -8 + (i % 4) * 1.2, z: 5 - Math.floor(i / 4) * 1.2 };
    const p = a.cast(cast?.players?.[i], at, () =>
      pros
        ? a.person({
            ...at,
            shirt: '#f08a24',
            trim: '#f2f26a',
            shorts: '#3a3f4a',
            pants: true,
            hairStyle: 'cap',
            cap: '#f2c230',
          })
        : a.person({ ...at, shirt: a.pick([...DULL, '#d65a5a', '#5a8fd6']), umb: false }),
    );
    p.speedK = pros ? 1.15 : 1;
    crew.push(p);
  }
  const S = { done: 0, cheering: false, talkT: 3 };

  const work = (p: Person) => {
    if (!a.alive || S.cheering) return;
    if (!pros && a.f > 0.55 && a.chance(0.18)) {
      pant(a, p, () => work(p));
      return;
    }
    if (a.heat && !pros && a.chance(0.12)) {
      drinkBreak(a, p, { x: -9, z: 4.2 }, () => work(p));
      return;
    }
    const free = junk.filter((j) => !j.taken);
    if (!free.length) {
      p.go(a.rr(-6, 4), a.rr(-3, 3), 1.4);
      p.call(() => {
        p.idleFace = SOUTH;
      });
      return;
    }
    let J = free[0] as Junk;
    for (const x of free)
      if (Math.hypot(x.x - p.pos.x, x.z - p.pos.z) < Math.hypot(J.x - p.pos.x, J.z - p.pos.z)) J = x;
    J.taken = true;
    const spd = (pros ? 2.6 : 2.0) * (1 - 0.35 * a.f);
    p.go(J.x - 0.5, J.z - 0.3, spd);
    p.call(() => {
      p.base = 'stoop';
      if (J.kind === 'weeds') {
        p.give('R', mkRake());
        a.gesture(p, 'rake', 1.6);
        a.at(0.4, () => a.fx.dust(J.x, 0.05, J.z, 6, a.rain ? '#6a4a2e' : '#b88a5a'));
      }
      if (a.rain && a.chance(0.15))
        a.at(0.6, () => {
          p.base = 'relaxed';
          a.fall(p, 'face', 1.4, { slide: 1.2 });
          p.overlay('mud', true);
          a.pop(a.t('slip'), p, { fg: '#9fdcff', h: 0.45 });
        });
    });
    p.wait(pros ? 1.0 : 1.6 + a.f);
    p.call(() => {
      J.g.parent?.remove(J.g);
      p.take('R');
      p.base = 'carry';
      p.give('R', mkBundle(J.kind === 'trash' ? '#9aa0a3' : '#5a4030'));
      if (!pros && a.chance(0.15)) a.pop(a.t('heavy'), p, { fg: '#ffe9a8', h: 0.38 });
    });
    p.go(pile.x + a.rr(-0.4, 0.4), pile.z + a.rr(-0.4, 0.6), spd * 0.85);
    p.call(() => {
      p.take('R');
      p.base = 'relaxed';
      a.fx.dust(DX, 1.1, DZ, 4, '#8a7a5a');
      S.done++;
      const idx = junk.indexOf(J);
      if (idx >= 0) junk.splice(idx, 1);
      if (a.wind && a.chance(0.2)) {
        a.at(0.3, () => {
          for (let i = 0; i < 4; i++) a.fx.paper(DX, 1.3, DZ);
          a.pop(a.t('blownBack'), p, { fg: '#ffcf8a', h: 0.42 });
          junk.push(mkJunk());
        });
      }
      if (!junk.length) celebrate();
      else work(p);
    });
  };

  const celebrate = () => {
    if (S.cheering) return;
    S.cheering = true;
    a.pop(a.t('allClean'), { x: 0, y: 3, z: 0 }, { fg: '#ffd84a', h: 1.0, dur: 2.2 });
    a.fx.confetti(0, 2.5, 0, 40, 1.4);
    for (const p of crew) {
      p.clearMoves();
      a.gesture(p, 'cheer', 1.6);
      a.hop(p, 0.35, 0.4);
    }
    a.gesture(boss, a.c >= 3 ? 'clap' : 'wave', 1.6);
    a.at(4, () => {
      S.cheering = false;
      fill();
      crew.forEach((p, i) => {
        a.at(i * 0.3, () => work(p));
      });
    });
  };

  crew.forEach((p, i) => {
    a.at(0.8 + i * 0.35, () => work(p));
  });
  return {
    update(dt: number) {
      for (const p of crew) p.tired = pros ? a.f * 0.5 : a.f;
      S.talkT -= dt;
      if (S.talkT <= 0 && !S.cheering) {
        S.talkT = a.rr(3.5, 6);
        if (pros) {
          if (a.chance(0.4)) a.pop(a.t('prosLine'), boss, { fg: '#ffe9a8', h: 0.4 });
        } else if (a.c >= 3) {
          a.gesture(boss, 'point', 1.2);
          a.pop(a.t('bossCheer'), boss, { fg: '#d9ec52', h: 0.42 });
        } else {
          a.gesture(boss, 'shrug', 1.2);
          a.pop(a.t('bossMeh'), boss, { fg: '#e8e4d8', h: 0.4 });
        }
        if (!pros && a.chance(0.35)) {
          const p = a.pick(crew);
          a.emote(p, a.pick(['note', 'heart', 'sweat'] as const), 1.2);
        }
      }
    },
  };
}
