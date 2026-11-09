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
 *
 * 游戏里跟着模拟的进度演（setParams 实时改）：
 * - crewN：真到场的干活人数（借来的 cast.players 先上，不够的才生成替身），不多生成志愿者；
 *   不到 3 人没有拿喇叭的工头（除非借了教练）；
 * - progress 0..1：地上剩的垃圾 = round(总数 × (1 − progress))，干完（≥1）才欢呼，一次，不再重来。
 * 不给 progress 就是动画库里循环的演示。
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
    g.name = 'junk';
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
  /** 跟着模拟的进度演吗 */
  const prog = (): number | null => {
    const v = a.P.progress;
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
  };
  /** 按进度该剩多少垃圾 */
  const want = (): number => {
    const p = prog();
    return p == null ? 0 : Math.round(nJunk * (1 - p));
  };
  const tracked = prog() != null;
  /** 地上没人认领的垃圾里拿掉一件（不走动画：模拟进度跑得比人快） */
  const drop = () => {
    const j = junk.find((x) => !x.taken);
    if (!j) return false;
    j.g.parent?.remove(j.g);
    junk.splice(junk.indexOf(j), 1);
    return true;
  };
  /** 垃圾比进度多出来、干活的人又追不上时，直接拿掉 */
  const sync = (slack: number) => {
    if (prog() == null) return;
    while (junk.length > want() + slack && drop()) {}
  };
  sync(0);

  const cast = a.opts.cast;
  const crewN = typeof a.P.crewN === 'number' ? Math.max(0, Math.round(a.P.crewN)) : null;
  const hasBoss = !tracked || !!cast?.coach || (crewN ?? 3) >= 3;
  const boss = !hasBoss
    ? null
    : a.cast(cast?.coach, { x: -9.4, z: -4.6, yaw: 0.8 }, () =>
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
  if (boss) {
    boss.idleFace = 0.8;
    if (!pros && (!tracked || (crewN ?? 3) >= 3)) boss.give('L', mkMegaphone());
    a.badge(boss);
  }
  const n = crewN ?? Math.max(a.num('n'), cast?.players?.length ?? 0);
  const crew: Person[] = [];
  const hire = (i: number): Person => {
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
    return p;
  };
  for (let i = 0; i < n; i++) hire(i);
  const S = { done: 0, cheering: false, cheered: false, talkT: 3 };
  /** 谁认领了哪件 */
  const holding = new Map<Person, Junk>();

  const work = (p: Person) => {
    if (!a.alive || S.cheering || p.removed || !crew.includes(p)) return;
    if (!pros && a.f > 0.55 && a.chance(0.18)) {
      pant(a, p, () => work(p));
      return;
    }
    if (a.heat && !pros && a.chance(0.12)) {
      drinkBreak(a, p, { x: -9, z: 4.2 }, () => work(p));
      return;
    }
    const free = junk.filter((j) => !j.taken);
    // 跟着进度：已经认领的加上这一件不能让垃圾少过进度该剩的数
    const claimed = junk.length - free.length;
    const capped = tracked && junk.length - claimed <= want();
    if (!free.length || capped) {
      p.go(a.rr(-6, 4), a.rr(-3, 3), 1.4);
      p.call(() => {
        p.idleFace = SOUTH;
      });
      // 进度往前走了再接着干
      if (tracked) p.wait(a.rr(1.5, 3)).call(() => work(p));
      return;
    }
    let J = free[0] as Junk;
    for (const x of free)
      if (Math.hypot(x.x - p.pos.x, x.z - p.pos.z) < Math.hypot(J.x - p.pos.x, J.z - p.pos.z)) J = x;
    J.taken = true;
    holding.set(p, J);
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
      holding.delete(p);
      const idx = junk.indexOf(J);
      if (idx >= 0) junk.splice(idx, 1);
      if (a.wind && a.chance(0.2)) {
        a.at(0.3, () => {
          for (let i = 0; i < 4; i++) a.fx.paper(DX, 1.3, DZ);
          a.pop(a.t('blownBack'), p, { fg: '#ffcf8a', h: 0.42 });
          // 跟着进度时不加垃圾（剩多少由进度定）
          if (!tracked) junk.push(mkJunk());
        });
      }
      if (!junk.length && (!tracked || (prog() ?? 0) >= 1)) celebrate();
      else work(p);
    });
  };

  const celebrate = () => {
    if (S.cheering || (tracked && S.cheered)) return;
    S.cheering = true;
    S.cheered = true;
    a.pop(a.t('allClean'), { x: 0, y: 3, z: 0 }, { fg: '#ffd84a', h: 1.0, dur: 2.2 });
    a.fx.confetti(0, 2.5, 0, 40, 1.4);
    for (const p of crew) {
      p.clearMoves();
      a.gesture(p, 'cheer', 1.6);
      a.hop(p, 0.35, 0.4);
    }
    if (boss) a.gesture(boss, a.c >= 3 ? 'clap' : 'wave', 1.6);
    a.at(4, () => {
      S.cheering = false;
      // 跟着进度：干完了就站着，不再重来
      if (tracked) {
        for (const p of crew) p.idleFace = SOUTH;
        return;
      }
      fill();
      crew.forEach((p, i) => {
        a.at(i * 0.3, () => work(p));
      });
    });
  };

  crew.forEach((p, i) => {
    a.at(0.8 + i * 0.35, () => work(p));
  });
  /** crewN 变了：多出来的人走进来干活，少了的替身先走（借来的人不动） */
  const restaff = () => {
    const v = a.P.crewN;
    if (typeof v !== 'number') return;
    const want = Math.max(0, Math.round(v));
    while (crew.length < want) {
      const p = hire(crew.length);
      a.at(0.2, () => work(p));
    }
    for (let i = crew.length - 1; i >= 0 && crew.length > want; i--) {
      const p = crew[i] as Person;
      if (a.isBorrowed(p)) continue;
      crew.splice(i, 1);
      p.clearMoves();
      p.take('R');
      p.base = 'relaxed';
      // 认领了还没捡的放回去；已经抱在手里的算带走了
      const J = holding.get(p);
      holding.delete(p);
      if (J) {
        if (J.g.parent) J.taken = false;
        else if (junk.includes(J)) junk.splice(junk.indexOf(J), 1);
      }
      const out = a.entryPath({ x: p.pos.x, z: p.pos.z }).reverse();
      p.path(out.slice(1), 2.2);
      p.call(() => a.remove(p));
    }
  };
  return {
    params(changed: readonly string[]) {
      if (changed.includes('crewN')) restaff();
      if (changed.includes('progress')) {
        sync(crew.length);
        if (!junk.length && (prog() ?? 0) >= 1) celebrate();
      }
    },
    update(dt: number) {
      if (tracked) sync(crew.length);
      if (tracked && !junk.length && (prog() ?? 0) >= 1 && !S.cheered) celebrate();
      for (const p of crew) p.tired = pros ? a.f * 0.5 : a.f;
      S.talkT -= dt;
      if (boss && S.talkT <= 0 && !S.cheering) {
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
        if (!pros && crew.length && a.chance(0.35)) {
          const p = a.pick(crew);
          a.emote(p, a.pick(['note', 'heart', 'sweat'] as const), 1.2);
        }
      }
    },
  };
}
