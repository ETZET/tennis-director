// 二层（life-2f.ts）的无画面测试：站位都在导航上；5 分钟不出错、四个走动的人一直在导航上；
// 每个活：出信号 → 总监照玩家的操作干一遍（拿 / 放键、按住动作键）→ 信号消失。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Floor } from './layout';
import { type JobId, type JobState, STANDS_2F } from './life-2f';
import { type TestHouse, testHouse, watchWalkers } from './life-testkit';
import { houseNavMap } from './stage3';
import type { Walker } from './walker';

/** 模拟 5 分钟的测试：本机 ≈ 1.3 秒，CI 的机器慢好几倍，默认 5 秒的上限会超时 */
const SIM_TIMEOUT = 30_000;

interface Dbg {
  state: { rings: number };
  jobs(): { id: JobId; state: JobState; wait: number }[];
  force(id: JobId): boolean;
  walkers: Record<string, Walker>;
  sitters: Map<string, { t: number }>;
}
const dbg = (h: TestHouse) => h.life.debug['2f'] as Dbg;
const stateOf = (h: TestHouse, id: JobId) =>
  dbg(h)
    .jobs()
    .find((j) => j.id === id)!.state;
const slot = (h: TestHouse, id: string) => h.parent.getObjectByName(`slot:${id}`)!;
const at = (h: TestHouse, k: keyof typeof STANDS_2F) => {
  h.goTo(STANDS_2F[k][0], STANDS_2F[k][1]);
  h.run(0.2);
};
const pick = (h: TestHouse) => {
  h.play!.pick();
  h.run(0.8);
};
const hold = (h: TestHouse, sec: number) => {
  h.play!.setUse(true);
  h.run(sec);
  h.play!.setUse(false);
  h.run(0.1);
};
/** 别的层扛来的东西（B1 的柴、1F 的箱子）：测试里直接造一件放到总监手里 */
const bring = (h: TestHouse, id: string, name: string) => {
  const it = h.play!.addItem({ id, name, obj: new THREE.Group() });
  (h.life.debug.items as unknown[]).push(it);
  h.play!.give(it);
  return it;
};
const on2F = () => {
  const h = testHouse({ play: true });
  h.ride(2);
  h.run(0.2);
  return h;
};

describe('会所 2F：演出', () => {
  it('干活的站位都在二层的导航上', () => {
    const nav = houseNavMap(2);
    for (const [k, [x, z]] of Object.entries(STANDS_2F)) expect(nav.clearAt(x, z), k).not.toBeNull();
  });

  it('看图模式 5 分钟：酒保、厨师、服务员、来访的会员一直在导航上、都在走；信号照摆好的样子不动', {
    timeout: SIM_TIMEOUT,
  }, () => {
    const h = testHouse();
    const probe = watchWalkers(h);
    h.setView(true, 2);
    const before = dbg(h).jobs();
    h.run(300, probe.each);
    const mine = new Set(Object.values(dbg(h).walkers));
    expect(Object.keys(dbg(h).walkers).sort()).toEqual(['bartender', 'cook', 'member', 'waiter']);
    for (const r of probe.report()) {
      if (!mine.has(r.w)) continue;
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxDy, r.where).toBeLessThan(0.3);
      expect(r.maxStuck).toBeLessThan(10);
      expect(r.dist).toBeGreaterThan(20);
      expect(r.slip).toBeLessThan(0.001);
    }
    // 来访的会员上过二层
    expect(dbg(h).jobs()).toEqual(before);
    expect(stateOf(h, 'fire')).toBe('idle');
    expect(slot(h, '2f-cups').visible).toBe(true);
  });

  it('来访的会员上到二层又下去；玩法模式 5 分钟（总监站在休息室）不出错', { timeout: SIM_TIMEOUT }, () => {
    const h = on2F();
    at(h, 'cups');
    const probe = watchWalkers(h);
    const floors = new Set<Floor>();
    const m = dbg(h).walkers.member;
    h.run(300, () => {
      probe.each();
      floors.add(m.floor);
    });
    expect([...floors].sort((a, b) => a - b)).toEqual([1, 2]);
    for (const r of probe.report()) {
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxStuck).toBeLessThan(20);
    }
  });
});

describe('会所 2F：总监的活', () => {
  it('开局只有空杯和收着的伞；别的错开着出，没人管就一直在', { timeout: SIM_TIMEOUT }, () => {
    const h = testHouse({ play: true });
    expect(
      dbg(h)
        .jobs()
        .filter((j) => j.state === 'signal')
        .map((j) => j.id)
        .sort(),
    ).toEqual(['cups', 'umbrella']);
    expect(slot(h, '2f-money').userData.houseViews).toEqual([]);
    const rose = new Map<JobId, number>();
    h.run(300, (_dt, t) => {
      for (const j of dbg(h).jobs()) if (j.state === 'signal' && !rose.has(j.id)) rose.set(j.id, t);
    });
    expect(rose.size).toBe(7);
    const times = [...rose.values()].filter((t) => t > 1).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThan(1);
    expect(
      dbg(h)
        .jobs()
        .every((j) => j.state === 'signal'),
    ).toBe(true);
  });

  it('空杯：茶几上拿起 → 吧台放下', () => {
    const h = on2F();
    at(h, 'cups');
    expect(h.play!.ui().pick).toBe('收杯子');
    pick(h);
    expect(h.play!.held()?.id.startsWith('cups-2f')).toBe(true);
    expect(stateOf(h, 'cups')).toBe('carry');
    expect(slot(h, '2f-cups').visible).toBe(false);
    expect(h.play!.ui().pick).toBe('放下 空杯');
    at(h, 'bar');
    expect(h.play!.ui().pick).toBe('放吧台');
    pick(h);
    expect(h.play!.held()).toBeNull();
    expect(stateOf(h, 'cups')).toBe('idle');
    // 冷却完了再出
    h.run(160);
    expect(stateOf(h, 'cups')).toBe('signal');
    expect(slot(h, '2f-cups').visible).toBe(true);
  });

  it('壁炉：凉了才收柴；添柴 → 烧起来，休息室的人鼓掌', () => {
    const h = on2F();
    const lit = slot(h, '2f-fireplace');
    bring(h, 'firewood-test', '木柴');
    at(h, 'fire');
    expect(h.play!.ui().pick).toBe('放下 木柴');
    expect(dbg(h).force('fire')).toBe(true);
    h.run(0.1);
    expect(lit.visible).toBe(false);
    expect(h.play!.ui().pick).toBe('添柴');
    pick(h);
    expect(h.play!.held()).toBeNull();
    expect(h.play!.item('firewood-test')).toBeUndefined();
    expect(stateOf(h, 'fire')).toBe('idle');
    expect(lit.visible).toBe(true);
    expect(dbg(h).sitters.get('2f-lounge-a')!.t).toBeGreaterThan(0);
  });

  it('后吧：空了一格才收箱子', () => {
    const h = on2F();
    const full = slot(h, '2f-back-bar');
    dbg(h).force('backbar');
    bring(h, 'stock-box-test', '箱子');
    at(h, 'backbar');
    expect(full.visible).toBe(false);
    expect(h.play!.ui().pick).toBe('补酒');
    pick(h);
    expect(stateOf(h, 'backbar')).toBe('idle');
    expect(full.visible).toBe(true);
  });

  it('按住的活：撑伞、摆椅子、刷锅（松手早了不算）', () => {
    const h = on2F();
    const cases: [JobId, keyof typeof STANDS_2F, string, string][] = [
      ['umbrella', 'umbrella', '撑伞', '2f-umbrella-closed'],
      ['chairs', 'chairs', '摆椅子', '2f-chairs'],
      ['pans', 'pans', '刷锅', '2f-pans'],
    ];
    for (const [id, where, label, sig] of cases) {
      dbg(h).force(id);
      at(h, where);
      expect(stateOf(h, id), id).toBe('signal');
      expect(slot(h, sig).visible, id).toBe(true);
      expect(h.play!.ui().use, id).toBe(label);
      hold(h, 1);
      expect(stateOf(h, id), id).toBe('signal');
      hold(h, 3.3);
      expect(stateOf(h, id), id).toBe('idle');
      expect(slot(h, sig).visible, id).toBe(false);
      expect(h.play!.ui().use, id).toBe('');
    }
  });

  it('钱袋：桌上拿起 → 保险柜', () => {
    const h = on2F();
    dbg(h).force('money');
    at(h, 'money');
    expect(h.play!.ui().pick).toBe('拿钱袋');
    pick(h);
    expect(h.play!.held()?.id.startsWith('money-2f')).toBe(true);
    at(h, 'safe');
    expect(h.play!.ui().pick).toBe('锁进保险柜');
    pick(h);
    expect(stateOf(h, 'money')).toBe('idle');
    expect(h.play!.held()).toBeNull();
  });

  it('冰桶：后厨空手随时能拿（id ice-bucket…），能放回去；带到别的层还在手里', () => {
    const h = on2F();
    at(h, 'ice');
    expect(h.play!.ui().pick).toBe('拿冰桶');
    pick(h);
    const it = h.play!.held()!;
    expect(it.id.startsWith('ice-bucket')).toBe(true);
    h.ride(-1);
    h.run(0.2);
    expect(h.play!.held()).toBe(it);
    expect(it.obj.userData.houseViews).toBeUndefined();
    h.ride(2);
    at(h, 'ice');
    expect(h.play!.ui().pick).toBe('放回冰桶');
    pick(h);
    expect(h.play!.held()).toBeNull();
    expect(it.where).toBe('gone');
  });

  it('拉钟：会员抬头鼓掌，过一会儿回到原来的姿势；一层同一个地方收不到杯子', () => {
    const h = on2F();
    at(h, 'bell');
    hold(h, 2.2);
    expect(dbg(h).state.rings).toBe(1);
    const ts = [...dbg(h).sitters.values()];
    expect(ts.length).toBe(6);
    expect(ts.every((s) => s.t > 0)).toBe(true);
    h.run(4);
    expect(ts.every((s) => s.t <= 0)).toBe(true);
    h.ride(1);
    h.goTo(STANDS_2F.cups[0], STANDS_2F.cups[1]);
    h.run(0.2);
    expect(h.floor()).toBe(1);
    expect(h.play!.ui().pick).not.toBe('收杯子');
  });
});
