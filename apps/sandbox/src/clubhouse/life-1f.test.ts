// 一层（商店层）的无画面测试：5 分钟不出错、Walker 一直在导航上；每个活：点亮信号 → 总监照玩法的路径干一遍 → 信号灭。
import type * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Play } from '../clubsite/play';
import { loadAssets, type TestHouse, testHouse, watchWalkers } from './life-testkit';
import { type JobState, MOP_HOLD, RESTOCKS, SHAKE_HOLD, type Shop1F, TILL_HOLD } from './play-1f';

/** 模拟 5 分钟的测试：本机 ≈ 1.3 秒，CI 的机器慢好几倍，默认 5 秒的上限会超时 */
const SIM_TIMEOUT = 30_000;

interface Debug1F {
  jobs(): { id: string; state: JobState }[];
  force(id: string): void;
  boxes(): number;
  till: { clerkAt: boolean; waiting: boolean; served: boolean };
  people: Record<string, { obj: THREE.Object3D }>;
  shop: Shop1F;
}
const dbg = (h: TestHouse) => h.life.debug['1f'] as Debug1F;
const state = (h: TestHouse, id: string) =>
  dbg(h)
    .jobs()
    .find((j) => j.id === id)?.state;
const slot = (h: TestHouse, id: string) => h.parent.getObjectByName(`slot:${id}`)!;

/** 走到一个互动点站的地方（传送），等 play 认出来 */
function stand(h: TestHouse, id: string, dz = 0) {
  const shop = dbg(h).shop;
  const s = shop.stand(id);
  const a = shop.at(id);
  if (s) h.goTo(s[0], s[1] + dz);
  else h.goTo(a.x - 0.5, a.z + 0.5);
  h.run(0.2);
}
/** 按一下拿/放键，等动作做完 */
function pick(h: TestHouse) {
  h.play!.pick();
  h.run(0.9);
}
/** 按住动作键 sec 秒 */
function hold(h: TestHouse, sec: number) {
  h.play!.setUse(true);
  h.run(sec);
  h.play!.setUse(false);
  h.run(0.1);
}
function start(): { h: TestHouse; play: Play } {
  const h = testHouse({ play: true });
  h.goTo(-50.5, -22.7);
  h.run(0.1);
  expect(h.inside()).toBe(true);
  return { h, play: h.play! };
}

beforeAll(async () => {
  await loadAssets(['shop-box-stack', 'shop-sand-mat', 'shop-dirty-cups', 'shop-empty-hooks']);
});

describe('会所 1F：演出', () => {
  it('看图模式：5 分钟不出错，Walker 在导航上、不卡、脚不溜；信号都亮着（摆好的样子）、货箱垛满', {
    timeout: SIM_TIMEOUT,
  }, () => {
    const h = testHouse();
    const probe = watchWalkers(h);
    h.setView(true, 1);
    for (const j of dbg(h).jobs()) if (j.id !== 'till' && j.id !== 'boxes') expect(j.state, j.id).toBe('signal');
    h.run(300, probe.each);
    const mine = new Set(Object.values(dbg(h).people).map((p) => p.obj));
    const rep = probe.report().filter((r) => mine.has(r.w.obj));
    expect(rep.length).toBe(5);
    for (const r of rep) {
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxDy, r.where).toBeLessThan(0.3);
      expect(r.maxStuck).toBeLessThan(10);
      expect(r.dist).toBeGreaterThan(20);
      expect(r.slip).toBeLessThan(0.001);
    }
    for (const j of dbg(h).jobs()) if (j.id !== 'till' && j.id !== 'boxes') expect(j.state, j.id).toBe('signal');
    expect(slot(h, 'shop-empty-hooks').userData.signalOn).toBe(true);
    // 没人搬：垛满了以后送货的改送便利店，垛不会超过 5
    expect(dbg(h).boxes()).toBeGreaterThanOrEqual(4);
  });

  it('玩法模式：开局没有信号，之后一个一个亮（错开），没人管就一直亮着；店员会走开又回来', {
    timeout: SIM_TIMEOUT,
  }, () => {
    const { h } = start();
    const auto = ['hooks', 'soldout', 'row', 'kiosk', 'cups', 'prints', 'mat'];
    for (const id of auto) expect(state(h, id), id).toBe('idle');
    expect(slot(h, 'shop-empty-hooks').userData.signalOn).toBe(false);
    expect(slot(h, 'shop-empty-hooks').children.every((c) => !c.visible)).toBe(true);
    expect(dbg(h).boxes()).toBe(3);
    const ups: number[] = [];
    let n = 0;
    let away = false;
    let tillUp = false;
    h.run(300, (_dt, t) => {
      const k = auto.filter((id) => state(h, id) === 'signal').length;
      // 一步里最多亮一个
      expect(k - n).toBeLessThanOrEqual(1);
      if (k > n) ups.push(t);
      n = k;
      if (!dbg(h).till.clerkAt) away = true;
      if (state(h, 'till') === 'signal') tillUp = true;
    });
    expect(ups.length).toBe(auto.length);
    for (let i = 1; i < ups.length; i++) expect(ups[i] - ups[i - 1]).toBeGreaterThan(10);
    for (const id of auto) expect(state(h, id), id).toBe('signal');
    expect(away).toBe(true);
    expect(tillUp).toBe(true);
    // 换层再回来：信号道具的开关不被 houseViews 盖掉
    dbg(h).shop.clear('hooks');
    h.ride(2);
    h.run(0.2);
    h.ride(1);
    h.run(0.2);
    expect(slot(h, 'shop-empty-hooks').visible).toBe(true);
    expect(slot(h, 'shop-empty-hooks').children.every((c) => !c.visible)).toBe(true);
  });
});

describe('会所 1F：总监的活', () => {
  it('补货：货箱垛搬一只（垛少一只）→ 四个补货点各补一次，信号灭、货箱用掉；信号没亮时不收', () => {
    const { h, play } = start();
    for (const id of RESTOCKS) {
      // 没亮：拿着货箱走到补货点，放不进去（按钮是"放下 货箱"之类，不是补货）
      const before = dbg(h).boxes();
      stand(h, 'boxes');
      expect(play.ui().pick).toBe('搬货箱');
      pick(h);
      expect(play.held()?.id.startsWith('stock-box')).toBe(true);
      expect(dbg(h).boxes()).toBe(Math.max(1, before - 1));
      stand(h, id);
      if (state(h, id) !== 'signal') {
        expect(play.ui().pick).not.toMatch(/^补/);
        dbg(h).force(id);
        h.run(0.1);
      }
      expect(state(h, id)).toBe('signal');
      expect(play.ui().pick).toMatch(/^补/);
      pick(h);
      expect(play.held()).toBeNull();
      expect(state(h, id)).toBe('cooldown');
      const sig = slot(
        h,
        { hooks: 'shop-empty-hooks', soldout: 'shop-soldout', row: 'shop-empty-row', kiosk: 'kiosk-empty' }[id],
      );
      expect(sig.userData.signalOn).toBe(false);
    }
    // 垛上至少留一只，照样搬得动；放回去多一只
    expect(dbg(h).boxes()).toBeGreaterThanOrEqual(1);
    stand(h, 'boxes');
    pick(h);
    const n = dbg(h).boxes();
    expect(play.ui().pick).toBe('放回去');
    pick(h);
    expect(play.held()).toBeNull();
    expect(dbg(h).boxes()).toBe(n + 1);
    // 冷却过了还会再亮
    h.run(120);
    expect(RESTOCKS.some((id) => state(h, id) === 'signal')).toBe(true);
  });

  it('货箱垛：真的资产 setLevel 留几只；堆满 = 信号，搬走一只就灭', () => {
    const { h, play } = start();
    const stack = slot(h, 'shop-box-stack');
    const shown = () => stack.children.slice(1).filter((g) => g.visible).length;
    expect(stack.userData.level()).toBe(3);
    expect(shown()).toBe(3);
    dbg(h).force('boxes');
    h.run(0.1);
    expect(state(h, 'boxes')).toBe('signal');
    expect(shown()).toBe(5);
    stand(h, 'boxes');
    pick(h);
    expect(play.held()?.id.startsWith('stock-box')).toBe(true);
    expect(state(h, 'boxes')).toBe('idle');
    expect(shown()).toBe(4);
  });

  it('脏杯子：收杯子 → 拿到咖啡吧台放下，信号灭', () => {
    const { h, play } = start();
    stand(h, 'cups');
    expect(play.ui().pick).not.toBe('收杯子');
    dbg(h).force('cups');
    h.run(0.1);
    expect(slot(h, 'shop-dirty-cups').userData.signalOn).toBe(true);
    expect(play.ui().pick).toBe('收杯子');
    pick(h);
    expect(play.held()?.id.startsWith('cups-1f')).toBe(true);
    expect(state(h, 'cups')).toBe('doing');
    expect(slot(h, 'shop-dirty-cups').userData.signalOn).toBe(false);
    stand(h, 'cafeBar');
    expect(play.ui().pick).toBe('放吧台');
    pick(h);
    expect(play.held()).toBeNull();
    expect(state(h, 'cups')).toBe('cooldown');
  });

  it('沙脚印按住拖、沙垫按住抖：按够了信号灭；松手早了不算', () => {
    const { h, play } = start();
    for (const [id, label, sec] of [
      ['prints', '拖地', MOP_HOLD],
      ['mat', '抖垫子', SHAKE_HOLD],
    ] as const) {
      stand(h, id);
      expect(play.ui().use).not.toBe(label);
      dbg(h).force(id);
      h.run(0.1);
      expect(play.ui().use).toBe(label);
      hold(h, sec * 0.5);
      expect(state(h, id)).toBe('signal');
      hold(h, sec + 0.2);
      expect(state(h, id)).toBe('cooldown');
      expect(play.ui().use).not.toBe(label);
    }
    // 真的沙垫：沙那几片藏起来了，垫子还在
    const mat = slot(h, 'shop-sand-mat');
    expect(mat.children.some((c) => !c.visible)).toBe(true);
    expect(mat.children.some((c) => c.visible)).toBe(true);
    // 拖完地扫帚收起来
    expect(h.director!.userData.prop?.()).toBeFalsy();
  });

  it('收银：店员走开、有人等 → 站到柜台后面按住，客人走了；不管的话店员回来自己收', () => {
    const { h, play } = start();
    const d = dbg(h);
    d.force('till');
    let t = 0;
    while (state(h, 'till') !== 'signal' && t < 150) {
      h.run(1);
      t++;
    }
    expect(state(h, 'till')).toBe('signal');
    expect(d.till.clerkAt).toBe(false);
    expect(play.ui().bubbles.some((b) => b.text === '有人吗？')).toBe(true);
    stand(h, 'till');
    expect(play.ui().use).toBe('收银');
    hold(h, TILL_HOLD + 0.2);
    expect(state(h, 'till')).not.toBe('signal');
    expect(d.till.served).toBe(true);
    h.run(0.2);
    expect(play.ui().bubbles.some((b) => b.text === '有人吗？')).toBe(false);
    // 客人走开了
    const c = d.people.customer.obj;
    h.run(6);
    expect(Math.hypot(c.position.x + 60.1, c.position.z + 26.3)).toBeGreaterThan(2);
    // 总监让开：店员回来，下一位由店员收
    h.goTo(-50.5, -22.7);
    let served = 0;
    let was = d.till.served;
    h.run(240, () => {
      if (d.till.served && !was && d.till.clerkAt) served++;
      was = d.till.served;
    });
    expect(d.till.clerkAt || served > 0).toBe(true);
    expect(served).toBeGreaterThan(0);
  });
});
