// stage 3 框架的无画面测试：三层的模块建得起来、推 5 分钟不出错；每个 Walker 一直在它那一层的导航上、不卡住、脚不溜；
// Walker 自己的行为（加减速、掉头、楼梯换层、坐电梯、让路不死锁）；一层的 play 只在那一层生效。
// 三层 agent 自己的用例加在各自的 life-<层>.test.ts 里（工具在 life-testkit.ts）。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { player, strideOf } from '../clubsite/people';
import type { AssetCtx } from './ctx';
import { FLOOR_Y, type Floor, LIFT } from './layout';
import { DT, stubCtx, testHouse, watchWalkers } from './life-testkit';
import { ROUTES, SPOTS } from './routes';
import { houseNavMap } from './stage3';
import { createWalker, routeBetween, type Walker, type WalkerWorld } from './walker';

/** 模拟 5 分钟的测试：本机 ≈ 1.3 秒，CI 的机器慢好几倍，默认 5 秒的上限会超时 */
const SIM_TIMEOUT = 30_000;

const route = (id: string) => ROUTES.find((r) => r.id === id)!.pts;

/** 只有 Walker 的小世界（不建会所） */
function world(director: () => { x: number; z: number; floor: Floor } | null = () => null) {
  const ws: Walker[] = [];
  const levels = new Map<THREE.Object3D, Floor>();
  const w: WalkerWorld = {
    navOf: houseNavMap,
    setLevel: (o, f) => void levels.set(o, f),
    walkers: () => ws,
    director,
  };
  const add = (p: readonly number[], v = 0) => {
    const obj = player(stubCtx(v) as unknown as AssetCtx as never);
    obj.position.set(p[0], p[2] ?? 0, p[1]);
    const k = createWalker(w, obj);
    ws.push(k);
    return k;
  };
  const run = (sec: number, each?: () => void) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      for (const k of ws) k.update(DT);
      each?.();
    }
  };
  return { ws, add, run, levels };
}

describe('会所 stage 3：框架', () => {
  it('看图模式：5 分钟不出错，Walker 一直在导航上、不卡住、脚不溜', { timeout: SIM_TIMEOUT }, () => {
    const h = testHouse();
    const probe = watchWalkers(h);
    h.setView(true, 1);
    h.run(300, probe.each);
    const rep = probe.report();
    expect(rep.length).toBeGreaterThan(0);
    for (const r of rep) {
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxDy, r.where).toBeLessThan(0.3);
      expect(r.maxStuck).toBeLessThan(20);
      expect(r.dist).toBeGreaterThan(20);
      expect(r.slip).toBeLessThan(0.001);
    }
  });

  it('玩法模式：5 分钟不出错（总监站在逛街路线上挡着也不死锁）', { timeout: SIM_TIMEOUT }, () => {
    const h = testHouse({ play: true });
    const probe = watchWalkers(h);
    // 站在商店街中间（shopper 路线上）
    h.goTo(-50.5, -22.7);
    expect(h.inside()).toBe(true);
    h.run(300, probe.each);
    for (const r of probe.report()) {
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxStuck).toBeLessThan(20);
      expect(r.dist).toBeGreaterThan(20);
    }
  });

  it('一层的 play 只在那一层生效：钟绳（2F）在 1F、B1 同一个 x、z 上按不到', () => {
    const h = testHouse({ play: true });
    const play = h.play!;
    const [bx, bz] = SPOTS.bellRope.at;
    h.ride(2);
    h.goTo(bx, bz);
    h.run(0.2);
    expect(h.floor()).toBe(2);
    expect(play.get('2f:bell')).toBeDefined();
    expect(play.ui().use).toBe('拉钟');
    // 按住 2 秒 → 敲了一次
    play.setUse(true);
    h.run(2.3);
    play.setUse(false);
    const st = (h.life.debug['2f'] as { state: { rings: number } }).state;
    expect(st.rings).toBe(1);
    // 一层、负一层：同一个 x、z 附近（钟楼门厅 / 前台大厅），没有这个互动点
    for (const f of [1, -1] as Floor[]) {
      h.ride(f);
      h.run(0.2);
      expect(play.get('2f:bell')).toBeUndefined();
      expect(play.ui().use).not.toBe('拉钟');
    }
    h.ride(2);
    h.run(0.1);
    expect(play.get('2f:bell')).toBeDefined();
  });

  it('手里的东西是全局的：放在地上按高度归层，别的层看不见也拿不到', () => {
    const h = testHouse({ play: true });
    const play = h.play!;
    // 框架只管经楼层 play 加的东西（floorPlay 的 addItem 记进 debug.items）；这里没有楼层模块加东西，手工记一件
    const items = h.life.debug.items as unknown[];
    const obj = new THREE.Group();
    const it = play.addItem({ id: 'test-log', name: '木柴', obj });
    items.push(it);
    h.ride(-1);
    h.run(0.1);
    play.give(it);
    h.run(0.1);
    expect(obj.userData.houseViews).toBeUndefined();
    play.drop();
    h.run(0.1);
    expect(it.where).toBe('ground');
    expect(obj.position.y).toBeCloseTo(FLOOR_Y[-1], 1);
    expect(obj.userData.houseViews).toEqual(['b1']);
    // 上到一层：看不见、拿不到
    h.ride(1);
    h.run(0.1);
    expect(obj.visible).toBe(false);
    expect(it.where).toBe('away');
    // 回负一层：又能拿
    h.ride(-1);
    h.run(0.1);
    expect(obj.visible).toBe(true);
    expect(it.where).toBe('ground');
  });
});

describe('会所 stage 3：Walker', () => {
  it('每条 ROUTES 都走得完：一直在导航上，楼梯上换层，电梯等 1 秒出现在另一层', () => {
    for (const r of ROUTES) {
      const { add, run, levels } = world();
      const w = add(r.pts[0]);
      w.place(r.pts[0]);
      w.walkTo(r.pts);
      let off = '';
      let maxStuck = 0;
      const floors = new Set<Floor>();
      run(400, () => {
        floors.add(w.floor);
        maxStuck = Math.max(maxStuck, w.stuck);
        if (w.riding || off) return;
        const y = houseNavMap(w.floor).clearAt(w.x, w.z);
        if (y === null || Math.abs(y - w.y) > 0.3)
          off = `${r.id}: ${w.floor}F (${w.x.toFixed(2)}, ${w.z.toFixed(2)}, y ${w.y.toFixed(2)}) 导航 ${y}`;
      });
      expect(off).toBe('');
      expect(w.walking, `${r.id} 没走完`).toBe(false);
      const end = r.pts.at(-1)!;
      expect(Math.hypot(w.x - end[0], w.z - end[1])).toBeLessThan(0.01);
      expect(w.y).toBeCloseTo(end[2] ?? 0, 2);
      expect(maxStuck).toBeLessThan(1);
      expect(levels.get(w.obj)).toBe(w.floor);
      expect(Math.abs(w.dist - w.cycles * strideOf(w.obj)) / w.dist).toBeLessThan(1e-6);
      if (r.id === 'memberUp') expect([...floors].sort((a, b) => a - b)).toEqual([1, 2]);
      if (r.id === 'gymGoer') expect([...floors].sort((a, b) => a - b)).toEqual([-1, 1]);
      if (r.id === 'delivery') expect(floors.has(2)).toBe(true);
    }
  });

  it('加减速和转身：速度一步最多变 加速度 × dt，角速度不超过上限，掉头时先停下', () => {
    const { add, run } = world();
    const pts = route('shopper');
    const w = add(pts[0]);
    w.walkTo(pts);
    let pv = 0;
    let pyaw = w.yaw;
    let maxDv = 0;
    let maxW = 0;
    let maxV = 0;
    run(120, () => {
      // 到点的那一步：剩下不到 0.2 米/秒的速度直接归零，不算
      if (!(w.speed === 0 && pv < 0.2)) maxDv = Math.max(maxDv, Math.abs(w.speed - pv) / DT);
      let d = w.yaw - pyaw;
      d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
      maxW = Math.max(maxW, Math.abs(d) / DT);
      maxV = Math.max(maxV, w.speed);
      pv = w.speed;
      pyaw = w.yaw;
    });
    expect(w.walking).toBe(false);
    expect(maxV).toBeGreaterThan(1.1);
    expect(maxV).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(maxDv).toBeLessThanOrEqual(3.5 * 2 + 1e-6);
    expect(maxW).toBeLessThanOrEqual(7 + 1e-6);
  });

  it('让路：两个人对着走，不死锁，都到得了；总监挡在路上，等一会儿穿过去', () => {
    const a: [number, number] = [-47.3, -21.0];
    const b: [number, number] = [-58.0, -21.2];
    {
      const { add, run } = world();
      const w1 = add(a);
      const w2 = add(b, 1);
      w1.walkTo([b]);
      w2.walkTo([a]);
      let waited = 0;
      run(40, () => {
        if (w1.blocked || w2.blocked) waited += DT;
      });
      expect(w1.walking || w2.walking).toBe(false);
      expect(waited).toBeGreaterThan(0.3);
    }
    {
      const { add, run } = world(() => ({ x: -52, z: -21.1, floor: 1 }));
      const w = add(a);
      w.walkTo([b]);
      let maxStuck = 0;
      run(40, () => {
        maxStuck = Math.max(maxStuck, w.stuck);
      });
      expect(w.walking).toBe(false);
      expect(maxStuck).toBeGreaterThan(1);
      expect(maxStuck).toBeLessThan(5);
    }
    {
      // 总监在别的层：不让
      const { add, run } = world(() => ({ x: -52, z: -21.1, floor: 2 }));
      const w = add(a);
      w.walkTo([b]);
      let maxStuck = 0;
      run(40, () => {
        maxStuck = Math.max(maxStuck, w.stuck);
      });
      expect(maxStuck).toBeLessThan(0.1);
    }
  });

  it('routeBetween：同一层两个站位之间找得到路，每个点都站得住', () => {
    const cases: [Floor, string, string][] = [
      [1, 'doorIn', 'cafeCounter'],
      [1, 'proShopTill', 'merchTill'],
      [1, 'lift1', 'stringWindow'],
      [2, 'lift2', 'fireplace'],
      [2, 'bartender', 'terrace'],
      [2, 'goods2', 'banquet'],
      [-1, 'liftB1', 'weights'],
      [-1, 'goodsB1', 'store'],
      [-1, 'gymDeskFront', 'cardio'],
    ];
    for (const [f, from, to] of cases) {
      const nav = houseNavMap(f);
      const r = routeBetween(nav, from, to);
      expect(r, `${f}F ${from} → ${to}`).not.toBeNull();
      const end = r!.at(-1)!;
      expect(Math.hypot(end[0] - SPOTS[to].at[0], end[1] - SPOTS[to].at[1])).toBeLessThan(0.35);
      const { add, run } = world();
      const w = add(r![0]);
      w.place(r![0]);
      w.walkTo(r!);
      let off = 0;
      run(120, () => {
        if (houseNavMap(w.floor).clearAt(w.x, w.z) === null) off++;
      });
      expect(w.walking).toBe(false);
      expect(off, `${f}F ${from} → ${to}`).toBe(0);
      expect(w.floor).toBe(f);
    }
    expect(Math.abs(LIFT.door[0] - SPOTS.lift1.at[0])).toBeLessThan(1e-9);
  });
});
