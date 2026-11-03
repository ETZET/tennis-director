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

  it('借来的教练和球员演完原样还回去', () => {
    const H = host();
    const look = { shirt: '#333', shorts: '#222', skin: '#e8b896', hair: '#222', shoes: '#fff' };
    const coach = new Person({ name: 'Dale', x: 40, z: -5, ...look, phone: true }, H.world);
    const kid = new Person({ name: 'Tyler', x: 33, z: -2, ...look, racket: '#d6362f' }, H.world);
    coach.base = 'phoneStand';
    const area = new CourtFrame(30, 1.2, -6, 0.1, 17, 9.15);
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
    H.step(30);
    h.stop();
    expect(coach.root.parent).toBe(H.scene);
    expect(kid.root.parent).toBe(H.scene);
    expect(coach.pos.x).toBe(40);
    expect(coach.pos.z).toBe(-5);
    expect(coach.base).toBe('phoneStand');
    expect(H.world.people).toEqual([coach, kid]);
    expect(H.scene.children.filter((c) => c !== coach.root && c !== kid.root)).toHaveLength(0);
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
