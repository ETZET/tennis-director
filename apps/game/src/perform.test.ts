import { activities, indianWells, type PeopleWorld, Person, Scheduler } from '@td/render';
import { CONTENT } from '@td/sim';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { areaFrame, conditionsFrom, PERFORMANCE_PLANS, perform, planPerformance } from './perform';

beforeAll(() => {
  // 不需要 WebGL：画布换成什么都不画的替身
  const ctx = new Proxy(
    {},
    { get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : () => {}), set: () => true },
  );
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 1, height: 1, getContext: () => ctx }),
  };
});

/**
 * 模拟里出现的每个演出名都要对上动画库里的一个活动（ADR 0010）。
 * 内容是活的：新加一个 performance 而忘了在 perform.ts 里配演出，这里会报出来。
 */

const site = indianWells.INDIAN_WELLS;
const used = () => {
  const out = new Map<string, string>();
  for (const a of CONTENT.activities) out.set(a.performance, `activities/${a.id}.yaml`);
  for (const p of CONTENT.posts) if (p.performance) out.set(p.performance, `posts/${p.id}.yaml`);
  for (const o of CONTENT.orders) if (o.performance) out.set(o.performance, `orders/${o.id}.yaml`);
  for (const c of CONTENT.cards) if (c.stage?.performance) out.set(c.stage.performance, `events/${c.act}/${c.id}.yaml`);
  return out;
};

describe('performance → 活动动画库', () => {
  it('内容里用到的每个 performance 都有演出', () => {
    const names = used();
    expect(names.size).toBeGreaterThan(0);
    for (const [name, where] of names) expect(PERFORMANCE_PLANS[name], `${name}（${where}）`).toBeDefined();
    // 有球场的地点上的岗位和工单都能演（会所、广场上的活由人站着比划，不演）
    for (const x of [...CONTENT.posts, ...CONTENT.orders])
      if (x.performance && PERFORMANCE_PLANS[x.performance]?.area === 'court' && site.courts[x.at])
        expect(planPerformance(x.performance, x.at, site), `${x.id} @ ${x.at}`).not.toBeNull();
  });

  it('映射到的活动都在注册表里，变量合法', () => {
    for (const [name, plan] of Object.entries(PERFORMANCE_PLANS)) {
      const meta = activities.activityMeta(plan.activity);
      expect(meta, name).toBeDefined();
      if (!meta) continue;
      const keys = new Set(meta.params.map((p) => p.key));
      for (const [k, v] of Object.entries(plan.params)) {
        expect(keys.has(k), `${name}.${k}`).toBe(true);
        expect(activities.resolveParams(meta, { [k]: v })[k], `${name}.${k}`).toBe(v);
      }
    }
  });

  it('演出的场地放得下活动的原生大小', () => {
    for (const [name, plan] of Object.entries(PERFORMANCE_PLANS)) {
      const meta = activities.activityMeta(plan.activity);
      if (!meta) continue;
      const anchor = Object.keys(plan.area === 'court' ? site.courts : site.grounds)[0] ?? '';
      const fr = areaFrame(site, plan.area, anchor);
      if (!fr) throw new Error(`${name}: no area`);
      // 球场类以球网为原点、两边各算到原生场地的边；其他活动以区域中心为原点
      const nx = meta.netX ?? 0;
      const half = meta.ground === 'court' ? Math.max(meta.size.W / 2 + nx, meta.size.W / 2 - nx) : meta.size.W / 2;
      expect(fr.hx + 0.5, `${name} 宽`).toBeGreaterThanOrEqual(Math.min(half, 17));
      expect(fr.hz + 0.5, `${name} 深`).toBeGreaterThanOrEqual(Math.min(meta.size.D / 2, 9.15));
    }
  });

  it('比赛不演胜负、拔河固定输：结果属于模拟', () => {
    expect(PERFORMANCE_PLANS.match?.params.finale).toBe('none');
    expect(PERFORMANCE_PLANS.tug_of_war?.params.result).toBe('lose');
  });

  it('游戏输入 → 全局条件', () => {
    expect(conditionsFrom({ weather: 'rain', fatigue: 140, coachSkill: 40 }, 'hollow')).toEqual({
      fatigue: 1,
      weather: 'rain',
      coach: 2,
      venue: 'hollow',
    });
    expect(conditionsFrom({ weather: 'cloud', fatigue: 20, coachSkill: 86 }, 'generic').coach).toBe(5);
    expect(conditionsFrom({ weather: 'cloud', fatigue: 20, coachSkill: 0 }, 'generic').coach).toBe(1);
  });

  it('每个演出在 Indian Wells 上演 20 秒，借来的教练和球员原样还回去', () => {
    const scene = new THREE.Scene();
    const sched = new Scheduler();
    const world: PeopleWorld = { scene, groundY: site.groundY, people: [] };
    const look = { shirt: '#333', shorts: '#222', skin: '#e8b896', hair: '#222', shoes: '#fff' };
    const at = indianWells.F_O1.w({ x: 3.6, z: -1.6 });
    const coach = new Person({ name: 'Dale', x: at.x, z: at.z, ...look, phone: true }, world);
    const kids = [
      new Person({ name: 'Tyler', x: at.x - 10, z: at.z, ...look }, world),
      new Person({ name: 'Mason', x: at.x - 12, z: at.z, ...look }, world),
    ];
    for (const name of Object.keys(PERFORMANCE_PLANS)) {
      const plan = PERFORMANCE_PLANS[name];
      const anchor = plan?.area === 'ground' ? 'plaza' : 'outer_1';
      const p = perform(
        { scene, sched, world, lang: 'en', site },
        name,
        { weather: 'cloud', fatigue: 60, coachSkill: 40 },
        { coach, juniors: kids },
        1,
        anchor,
      );
      for (let t = 0; t < 20; t += 0.05) {
        sched.advance(0.05);
        for (const q of [...world.people]) q.update(0.05, sched.now);
      }
      p.stop();
      expect(world.people, name).toEqual([coach, ...kids]);
      expect(
        scene.children.filter((c) => !world.people.some((q) => q.root === c)),
        name,
      ).toHaveLength(0);
      expect(coach.pos.x, name).toBeCloseTo(at.x);
    }
  });
});
