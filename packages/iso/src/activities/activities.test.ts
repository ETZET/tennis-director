import { describe, expect, it } from 'vitest';
import { Scheduler } from '../choreo/scheduler';
import { Group } from '../core/graph';
import { type PeopleWorld, Person } from '../people/person';
import { CourtFrame } from '../world/frame';
import { dioramaArea } from './diorama';
import { ACTIVITY_IMPLS, startActivity } from './index';
import { ACTIVITY_IDS, ACTIVITY_META, activityMeta, resolveParams } from './registry';
import { ACTIVITY_TEXT, textFor } from './text';
import { CATEGORIES, type Conditions, VENUES, WEATHERS } from './types';

/**
 * 不需要画布：活动只建场景图（core/graph），不碰 DOM——这里也不给 document 替身，碰了就会抛错。
 * 每个活动在每种场地、每种天气下跑一段，确认不抛错、停下后清理干净、借来的人物原样还回去。
 */

describe('活动注册表', () => {
  it('每个活动都有演出实现，id 不重复', () => {
    expect(new Set(ACTIVITY_IDS).size).toBe(ACTIVITY_IDS.length);
    expect(Object.keys(ACTIVITY_IMPLS).sort()).toEqual([...ACTIVITY_IDS].sort());
  });

  it('分类合法，四个分类都有活动', () => {
    for (const m of ACTIVITY_META) expect(CATEGORIES).toContain(m.category);
    for (const c of CATEGORIES) expect(ACTIVITY_META.some((m) => m.category === c)).toBe(true);
  });

  it('变量的默认值在范围里 / 在选项里', () => {
    for (const m of ACTIVITY_META)
      for (const p of m.params) {
        if (p.type === 'range') {
          expect(p.min).toBeLessThan(p.max);
          expect(p.def).toBeGreaterThanOrEqual(p.min);
          expect(p.def).toBeLessThanOrEqual(p.max);
          expect(Number.isInteger((p.def - p.min) / p.step)).toBe(true);
        } else expect(p.opts.map((o) => o.v)).toContain(p.def);
      }
  });

  it('resolveParams 收回越界值、丢掉不认识的选项', () => {
    const m = activityMeta('match');
    if (!m) throw new Error('match missing');
    const r = resolveParams(m, { diff: 9, tier: 7, fmt: 'd' });
    expect(r.diff).toBe(2);
    expect(r.tier).toBe(2);
    expect(r.fmt).toBe('d');
    expect(r.finale).toBe('show');
  });

  it('标题、说明、标签、变量名两种语言都有', () => {
    const keys = new Set<string>();
    for (const m of ACTIVITY_META) {
      keys.add(m.titleKey);
      keys.add(m.descKey);
      for (const t of m.tags) keys.add(t);
      for (const p of m.params) {
        keys.add(p.labelKey);
        if (p.type === 'range' && p.valueKey) keys.add(p.valueKey);
        if (p.type === 'seg') for (const o of p.opts) keys.add(o.labelKey);
      }
    }
    for (const k of keys) {
      const e = ACTIVITY_TEXT[k];
      expect(e, k).toBeDefined();
      expect(textFor('zh', k)).not.toBe(k);
      expect(textFor('en', k)).not.toBe(k);
    }
  });
});

function host() {
  const scene = new Group();
  const sched = new Scheduler();
  const world: PeopleWorld = { scene, groundY: () => 0, people: [] };
  const step = (sec: number) => {
    const dt = 1 / 20;
    for (let t = 0; t < sec; t += dt) {
      sched.advance(dt);
      for (const p of [...world.people]) p.update(dt, sched.now);
    }
  };
  return { scene, sched, world, step };
}

const conds = (o: Partial<Conditions> = {}): Conditions => ({
  fatigue: 0.3,
  weather: 'sun',
  coach: 3,
  venue: 'generic',
  ...o,
});

describe('活动演出（无画布）', () => {
  for (const id of ACTIVITY_IDS) {
    it(`${id}：各场地、各天气跑 40 秒不出错，停下后清理干净`, () => {
      const meta = activityMeta(id);
      if (!meta) throw new Error(id);
      const { area, bounds } = dioramaArea(meta);
      let k = 0;
      for (const venue of VENUES)
        for (const weather of WEATHERS) {
          const H = host();
          const fatigue = [0.05, 0.5, 0.95][k % 3] as number;
          const coach = (k % 5) + 1;
          k++;
          const h = startActivity(
            { scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0, lang: 'zh' },
            id,
            {
              area,
              bounds,
              conditions: conds({ venue, weather, fatigue, coach }),
              seed: k,
              extras: { passers: true, badges: true },
            },
          );
          // 画面在动：大部分时间里有人在走、在挥拍、在做手势或摔倒
          let active = 0;
          for (let i = 0; i < 80; i++) {
            H.step(0.5);
            if (H.world.people.some((p) => p.busy() || p.stroke || p.down || p.speed > 0.2)) active++;
          }
          expect(H.world.people.length, `${id} ${venue} ${weather}`).toBeGreaterThan(1);
          expect(active, `${id} ${venue} ${weather} idle`).toBeGreaterThan(30);
          h.stop();
          expect(H.world.people).toHaveLength(0);
          expect(H.scene.children).toHaveLength(0);
          H.step(2);
        }
    });
  }

  it('借来的教练和球员不瞬移：从原地走过去，停下时在原地还回去，姿势还原', () => {
    const H = host();
    const look = { shirt: '#333', shorts: '#222', skin: '#e8b896', hair: '#222', shoes: '#fff' };
    const coach = new Person({ name: 'Dale', x: 40, z: -5, ...look, phone: true }, H.world);
    const kid = new Person({ name: 'Tyler', x: 33, z: -2, ...look, racket: '#d6362f' }, H.world);
    coach.base = 'phoneStand';
    const area = new CourtFrame(30, 1.2, -6, 0.1, 17, 9.15);
    const worldPos = (p: Person) => (p.root.parent === H.scene ? { x: p.pos.x, z: p.pos.z } : area.w(p.pos));
    const h = startActivity(
      { scene: H.scene, sched: H.sched, world: H.world, groundY: () => 1.2, lang: 'en' },
      'feed',
      {
        area,
        conditions: conds({ venue: 'hollow', weather: 'cloud' }),
        cast: { coach, players: [kid] },
      },
    );
    expect(coach.root.parent).not.toBe(H.scene);
    // 借走那一刻还在原地
    const c0 = worldPos(coach);
    expect(c0.x).toBeCloseTo(40, 6);
    expect(c0.z).toBeCloseTo(-5, 6);
    // 每一步都是走过去的，没有一下子跳很远
    let prev = c0;
    let maxStep = 0;
    for (let i = 0; i < 30 * 20; i++) {
      H.step(1 / 20);
      const q = worldPos(coach);
      maxStep = Math.max(maxStep, Math.hypot(q.x - prev.x, q.z - prev.z));
      prev = q;
    }
    expect(maxStep).toBeLessThan(0.6);
    expect(h.ready).toBe(true);
    const before = worldPos(coach);
    const kidBefore = worldPos(kid);
    h.stop();
    expect(coach.root.parent).toBe(H.scene);
    expect(kid.root.parent).toBe(H.scene);
    expect(coach.pos.x).toBeCloseTo(before.x, 6);
    expect(coach.pos.z).toBeCloseTo(before.z, 6);
    expect(kid.pos.x).toBeCloseTo(kidBefore.x, 6);
    expect(coach.base).toBe('phoneStand');
    expect(h.done).toBe(true);
    expect(H.world.people).toEqual([coach, kid]);
    expect(H.scene.children.filter((c) => c !== coach.root && c !== kid.root)).toHaveLength(0);
  });

  it('生成的人物从场外走进来，到齐了才开演', () => {
    const meta = activityMeta('match');
    if (!meta) throw new Error('match');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'match', {
      area,
      bounds,
      conditions: conds(),
      params: { tier: 1, fmt: 's', finale: 'none' },
    });
    // 一开始所有人都在场外
    const outside = (p: Person) =>
      p.pos.x < bounds.x0 - 1 || p.pos.x > bounds.x1 + 1 || p.pos.z < bounds.z0 - 1 || p.pos.z > bounds.z1 + 1;
    expect(H.world.people.length).toBeGreaterThan(2);
    expect(H.world.people.every(outside)).toBe(true);
    expect(h.ready).toBe(false);
    let t = 0;
    while (!h.ready && t < 25) {
      H.step(0.25);
      t += 0.25;
    }
    expect(h.ready).toBe(true);
    expect(t).toBeGreaterThan(1);
    h.stop();
  });

  it('自定义入场路线：从给的起点走进来，收场时原路走出去再溶解，done 之后什么都不剩', () => {
    const meta = activityMeta('match');
    if (!meta) throw new Error('match');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const gate = { x: 0, z: 40 };
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'match', {
      area,
      bounds,
      conditions: conds(),
      params: { tier: 2, fmt: 'd', finale: 'none' },
      entry: { from: (p) => [gate, { x: p.x, z: 20 }, p] },
    });
    for (const p of H.world.people) {
      const w = area.w(p.pos);
      expect(w.x).toBeCloseTo(gate.x, 6);
      expect(w.z).toBeCloseTo(gate.z, 6);
    }
    H.step(30);
    expect(h.ready).toBe(true);
    const n = H.world.people.length;
    expect(n).toBeGreaterThan(4);
    let z0 = -1e9;
    for (const p of H.world.people) z0 = Math.max(z0, area.w(p.pos).z);
    h.stop({ graceful: true });
    expect(h.done).toBe(false);
    // 刚停下：人还在（往外走），不是一下子没了
    H.step(0.5);
    expect(H.world.people.length).toBe(n);
    expect(H.world.people.some((p) => p.speed > 0.5)).toBe(true);
    let t = 0;
    let far = 0;
    while (!h.done && t < 15) {
      H.step(0.25);
      t += 0.25;
      for (const p of H.world.people) far = Math.max(far, area.w(p.pos).z);
    }
    expect(h.done).toBe(true);
    expect(h.finished).toBe(true);
    // 走回了门口附近（8 秒内没走到的原地溶解）
    expect(far).toBeGreaterThan(z0 + 8);
    expect(H.world.people).toHaveLength(0);
    expect(H.scene.children).toHaveLength(0);
    H.step(2);
  });

  it('收场时没走到的人 8 秒后原地溶解', () => {
    const meta = activityMeta('feed');
    if (!meta) throw new Error('feed');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const far = { x: 0, z: 60 };
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'feed', {
      area,
      bounds,
      conditions: conds(),
      entry: { from: (p) => [far, p] },
    });
    H.step(40);
    expect(h.ready).toBe(true);
    h.stop({ graceful: true });
    H.step(7);
    expect(H.world.people.length).toBeGreaterThan(0);
    H.step(2);
    expect(h.done).toBe(true);
    expect(H.world.people).toHaveLength(0);
    expect(H.scene.children).toHaveLength(0);
  });

  it('劳动日跟着进度：地上的垃圾数随 progress 走，人数按 crewN，干完才欢呼且不再重来', () => {
    const meta = activityMeta('cleanup');
    if (!meta) throw new Error('cleanup');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const junk = () => {
      let n = 0;
      H.scene.traverse((o) => {
        if (o.name === 'junk') n++;
      });
      return n;
    };
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'cleanup', {
      area,
      bounds,
      conditions: conds(),
      params: { crew: 'volunteers', crewN: 2, progress: 0.25 },
    });
    // 2 个干活的，没有拿喇叭的工头
    expect(H.world.people).toHaveLength(2);
    expect(junk()).toBe(Math.round(14 * 0.75));
    H.step(40);
    // 进度不动，垃圾就不会少过进度该剩的数
    expect(junk()).toBeGreaterThanOrEqual(Math.round(14 * 0.75) - 2);
    expect(junk()).toBeLessThanOrEqual(Math.round(14 * 0.75));
    h.setParams({ progress: 0.75 });
    H.step(1);
    expect(junk()).toBeLessThanOrEqual(Math.round(14 * 0.25) + 2);
    h.setParams({ crewN: 3 });
    H.step(0.1);
    expect(H.world.people).toHaveLength(3);
    h.setParams({ progress: 1 });
    H.step(30);
    expect(junk()).toBe(0);
    // 不重来：再过一阵地上也没有新垃圾
    H.step(20);
    expect(junk()).toBe(0);
    h.setParams({ crewN: 1 });
    H.step(15);
    expect(H.world.people).toHaveLength(1);
    h.stop({ graceful: true });
    H.step(10);
    expect(h.done).toBe(true);
    expect(H.world.people).toHaveLength(0);
  });

  it('劳动日不给 progress：照旧循环演示（清完再来一轮）', () => {
    const meta = activityMeta('cleanup');
    if (!meta) throw new Error('cleanup');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'cleanup', {
      area,
      bounds,
      conditions: conds({ fatigue: 0 }),
      params: { crew: 'pros', n: 7 },
    });
    expect(H.world.people).toHaveLength(8);
    h.stop();
  });

  it('拔河可以指定输赢（游戏里结果由模拟决定）', () => {
    const meta = activityMeta('tug');
    if (!meta) throw new Error('tug');
    const { area, bounds } = dioramaArea(meta);
    const H = host();
    const h = startActivity({ scene: H.scene, sched: H.sched, world: H.world, groundY: () => 0 }, 'tug', {
      area,
      bounds,
      conditions: conds({ coach: 5, fatigue: 0 }),
      params: { result: 'lose' },
    });
    // 每一轮都应该是对手赢：我方 4 人摔成脸朝下
    let ourFaceDown = 0;
    for (let i = 0; i < 60 * 20; i++) {
      H.step(1 / 20);
      ourFaceDown = Math.max(ourFaceDown, H.world.people.filter((p) => p.down?.kind === 'face').length);
    }
    expect(ourFaceDown).toBeGreaterThan(0);
    h.stop();
  });
});
