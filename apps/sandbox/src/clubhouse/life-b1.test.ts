// 负一层（life-b1.ts + play-b1.ts）的无画面测试：5 分钟不出错、来健身的人和洗衣工一直在导航上；每个信号：亮 → 总监干 → 灭。
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Play } from '../clubsite/play';
import { JOB_IDS, type JobId } from './life-b1';
import { loadAssets, stubMake, type TestHouse, testHouse, watchWalkers } from './life-testkit';
import { HOLD } from './play-b1';
import { houseNavMap } from './stage3';
import type { Walker } from './walker';

interface Dbg {
  jobs(): { id: JobId; state: string; count: number }[];
  force(id: JobId): void;
  clear(id: JobId): boolean;
  members(): {
    id: string;
    what: string;
    station: string | null;
    away: boolean;
    visits: number;
    walker: Walker;
    x: number;
    z: number;
  }[];
  stations(): { id: string; user: string | null; usable: boolean; park: [number, number] }[];
  state(): { fault: number; power: boolean; stack: number; level: number; washDone: boolean; classOn: boolean };
  stats: { teleports: number; checkins: number; aborted: number };
  worker(): Walker | null;
}
const dbg = (h: TestHouse) => h.life.debug.b1 as unknown as Dbg;
const job = (h: TestHouse, id: JobId) =>
  dbg(h)
    .jobs()
    .find((j) => j.id === id)!;

/** 总监到负一层的 (x, z) 附近能站的点 */
function goNear(h: TestHouse, x: number, z: number) {
  if (h.floor() !== -1) h.ride(-1);
  const p = houseNavMap(-1).nearestFree(x, z, 1.5)!;
  h.goTo(p[0], p[1]);
  h.run(0.2);
}
function holdUse(h: TestHouse, sec: number) {
  const play = h.play as Play;
  play.setUse(true);
  h.run(sec);
  play.setUse(false);
  h.run(0.1);
}

describe('会所 stage 3：负一层', () => {
  it('看图模式 5 分钟：不出错，人一直在导航上、不卡、脚不溜；每个人都走过一趟；没有找不到路的', () => {
    const h = testHouse();
    const probe = watchWalkers(h);
    h.setView(true, -1);
    const d = dbg(h);
    let maxVisible = 0;
    h.run(300, () => {
      probe.each();
      maxVisible = Math.max(maxVisible, d.members().filter((m) => !m.away).length);
    });
    const mine = new Set<Walker>([...d.members().map((m) => m.walker), d.worker()!]);
    expect(mine.size).toBe(8);
    for (const r of probe.report()) {
      if (!mine.has(r.w)) continue;
      expect(r.off, `不在导航上：${r.where}`).toBe(0);
      expect(r.maxDy, r.where).toBeLessThan(0.3);
      expect(r.maxStuck).toBeLessThan(20);
      expect(r.dist).toBeGreaterThan(20);
      expect(r.slip).toBeLessThan(0.001);
    }
    expect(d.stats.teleports).toBe(0);
    expect(d.stats.checkins).toBeGreaterThan(4);
    expect(maxVisible).toBeLessThanOrEqual(7);
    // 一台器械最多一个人；在器械上的人离器械的停脚点不远
    const users = d.stations().filter((s) => s.user);
    expect(new Set(users.map((s) => s.user)).size).toBe(users.length);
    // 信号是错开来的：5 分钟里不会全亮
    const up = d.jobs().filter((j) => j.state === 'signal');
    expect(up.length).toBeGreaterThan(1);
    expect(up.length).toBeLessThan(JOB_IDS.length);
  }, 30000);

  it('每台器械的停脚点都在导航上，从前台走得到', () => {
    const h = testHouse();
    const nav = houseNavMap(-1);
    for (const s of dbg(h).stations()) {
      expect(nav.clearAt(s.park[0], s.park[1]), s.id).not.toBeNull();
      expect(nav.findPath(-51.7, -20.3, s.park[0], s.park[1]), s.id).not.toBeNull();
    }
  }, 30000);

  it('开局只有 3 号跑步机亮红灯；按住修 3 秒 → 灭；只在负一层按得到', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    const d = dbg(h);
    expect(
      d
        .jobs()
        .filter((j) => j.state === 'signal')
        .map((j) => j.id),
    ).toEqual(['treadmill']);
    expect(d.state().fault).toBe(2);
    // 一层同一个 x、z：没有这个互动点
    expect(play.get('b1:treadmill')).toBeUndefined();
    goNear(h, -52.7, -9.6);
    expect(play.ui().use).toBe('修跑步机');
    holdUse(h, HOLD.treadmill - 1);
    expect(job(h, 'treadmill').state).toBe('signal');
    expect(play.ui().use).toBe('修跑步机');
    holdUse(h, HOLD.treadmill + 0.2);
    expect(job(h, 'treadmill').state).toBe('cooldown');
    expect(d.state().fault).toBe(-1);
    expect(play.ui().use).not.toBe('修跑步机');
  }, 30000);

  it('跑步机坏了 / 跳闸：上面的人下来换一台；合闸以后又能用', () => {
    const h = testHouse({ play: true });
    const d = dbg(h);
    h.ride(-1);
    d.clear('treadmill');
    h.run(1);
    expect(d.stations().find((s) => s.id === 'treadmill-2')?.user).toBe('runner');
    d.force('breaker');
    expect(d.state().power).toBe(false);
    expect(
      d
        .stations()
        .filter((s) => s.id.startsWith('treadmill'))
        .every((s) => !s.usable),
    ).toBe(true);
    h.run(3);
    expect(d.stats.aborted).toBe(1);
    expect(d.stations().find((s) => s.id === 'treadmill-2')?.user).toBeNull();
    h.run(30);
    // 换了一台别的器械（不是跑步机）
    const runner = d.members().find((m) => m.id === 'runner')!;
    expect(runner.station === null || !runner.station.startsWith('treadmill')).toBe(true);
    goNear(h, -45.1, -34.3);
    expect((h.play as Play).ui().use).toBe('合闸');
    holdUse(h, HOLD.breaker + 0.2);
    expect(d.state().power).toBe(true);
    expect(job(h, 'breaker').state).toBe('cooldown');
    expect(
      d
        .stations()
        .filter((s) => s.id.startsWith('treadmill'))
        .every((s) => s.usable),
    ).toBe(true);
  }, 30000);

  it('收哑铃、挂杠铃片：亮了才有按钮，按住干完就灭', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    const d = dbg(h);
    for (const [id, label, x, z] of [
      ['dumbbells', '收哑铃', -56.3, -40.3],
      ['plates', '挂杠铃片', -59.4, -37.2],
    ] as [JobId & keyof typeof HOLD, string, number, number][]) {
      goNear(h, x, z);
      expect(play.ui().use, id).not.toBe(label);
      d.force(id);
      h.run(0.1);
      expect(play.ui().use, id).toBe(label);
      holdUse(h, HOLD[id] + 0.2);
      expect(job(h, id).state, id).toBe('cooldown');
      expect(job(h, id).count).toBe(1);
      expect(play.ui().use, id).not.toBe(label);
    }
  }, 30000);

  it('毛巾：签到的人把台面上的毛巾拿完 → 信号；去洗衣房拿一摞送到前台 → 灭', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    const d = dbg(h);
    h.ride(-1);
    // 自己发生：10 分钟里毛巾会发完
    let raised = -1;
    for (let i = 0; i < 60 && raised < 0; i++) {
      h.run(10);
      if (job(h, 'towels').state === 'signal') raised = h.t;
    }
    expect(raised).toBeGreaterThan(20);
    expect(d.state().stack).toBe(0);
    // 信号没亮的时候前台不收：先看拿
    goNear(h, -41.3, -36.3);
    expect(play.ui().pick).toBe('拿毛巾');
    play.pick();
    h.run(0.8);
    expect(play.held()?.id.startsWith('towel')).toBe(true);
    goNear(h, -50.4, -20.3);
    expect(play.ui().pick).toBe('补毛巾');
    play.pick();
    h.run(0.8);
    expect(play.held()).toBeNull();
    expect(job(h, 'towels').state).toBe('cooldown');
    expect(d.state().stack).toBe(3);
  }, 30000);

  it('毛巾：前台没信号时不收（放回毛巾车）', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    goNear(h, -41.3, -36.3);
    play.pick();
    h.run(0.8);
    const it = play.held();
    expect(it?.id.startsWith('towel')).toBe(true);
    goNear(h, -50.4, -20.3);
    expect(play.ui().pick).not.toBe('补毛巾');
    goNear(h, -41.3, -36.3);
    expect(play.ui().pick).toBe('放回去');
    play.pick();
    h.run(0.8);
    expect(play.held()).toBeNull();
    expect(it?.where).toBe('gone');
  }, 30000);

  it('饮水机：一格一格见底 → 信号；储藏扛一桶换上 → 满', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    const d = dbg(h);
    h.ride(-1);
    expect(d.state().level).toBe(2);
    h.run(100);
    expect(d.state().level).toBe(0);
    expect(job(h, 'water').state).toBe('signal');
    goNear(h, -44.3, -29.7);
    expect(play.ui().pick).toBe('扛水桶');
    play.pick();
    h.run(0.8);
    expect(play.held()?.id.startsWith('water-jug')).toBe(true);
    goNear(h, -47.5, -23.3);
    expect(play.ui().pick).toBe('换水桶');
    play.pick();
    h.run(0.8);
    expect(d.state().level).toBe(2);
    expect(job(h, 'water').state).toBe('cooldown');
  }, 30000);

  it('冰浴桶：冰化了才收 ice-bucket…（二楼后厨来的）', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    const d = dbg(h);
    h.ride(-1);
    const bucket = play.addItem({ id: 'ice-bucket-9', name: '冰桶', obj: new THREE.Group() });
    (h.life.debug.items as unknown[]).push(bucket);
    goNear(h, -54.1, -18.7);
    play.give(bucket);
    h.run(0.2);
    expect(play.ui().pick).not.toBe('倒冰');
    d.force('ice');
    h.run(0.1);
    expect(play.ui().pick).toBe('倒冰');
    play.pick();
    h.run(0.8);
    expect(bucket.where).toBe('gone');
    expect(job(h, 'ice').state).toBe('cooldown');
  }, 30000);

  it('储藏的货源：空手随时能拿木柴 firewood…、纸箱 stock-box…，能带上楼', () => {
    const h = testHouse({ play: true });
    const play = h.play as Play;
    goNear(h, -41.7, -29.5);
    expect(play.ui().pick).toBe('扛木柴');
    play.pick();
    h.run(0.8);
    const wood = play.held();
    expect(wood?.id.startsWith('firewood')).toBe(true);
    // 手里有东西：不能再拿
    goNear(h, -45.3, -29.7);
    expect(play.ui().pick).not.toBe('搬纸箱');
    play.drop();
    h.run(0.3);
    goNear(h, -45.3, -29.7);
    expect(play.ui().pick).toBe('搬纸箱');
    play.pick();
    h.run(0.8);
    expect(play.held()?.id.startsWith('stock-box')).toBe(true);
    // 带到二层：还在手里
    h.ride(2);
    h.run(0.3);
    expect(play.held()?.id.startsWith('stock-box')).toBe(true);
    expect(play.held()?.obj.userData.houseViews).toBeUndefined();
  }, 30000);

  it('没人管：信号一直亮着，别的照常（定时的信号最多同时亮 3 个）', () => {
    const h = testHouse();
    const d = dbg(h);
    h.setView(true, -1);
    h.run(420);
    const up = d
      .jobs()
      .filter((j) => j.state === 'signal')
      .map((j) => j.id);
    expect(up).toContain('treadmill');
    expect(up.filter((id) => id !== 'towels' && id !== 'water').length).toBeLessThanOrEqual(3);
    expect(d.stats.checkins).toBeGreaterThan(7);
    expect(d.stats.teleports).toBe(0);
  }, 30000);

  it('资产上的开关：真的资产按状态切（红灯、散哑铃、杠铃片、毛巾、水位、跳闸、冰）', async () => {
    const ids = [
      'gym-treadmill',
      'gym-treadmill-fault',
      'gym-dumbbell-rack',
      'gym-plate-tree',
      'gym-desk',
      'gym-water',
      'gym-panel',
      'ice-bath',
    ];
    await loadAssets(ids);
    // 默认的样子没变
    expect(stubMake('gym-treadmill').userData.fault()).toBe(false);
    expect(stubMake('gym-treadmill-fault').userData.fault()).toBe(true);
    expect(stubMake('gym-dumbbell-rack').userData.loose()).toBe(true);
    expect(stubMake('gym-plate-tree').userData.loose()).toBe(true);
    expect(stubMake('gym-desk').userData.stack()).toBe(3);
    expect(stubMake('gym-desk').userData.binFull()).toBe(true);
    expect(stubMake('gym-water').userData.level()).toBe(0);
    expect(stubMake('gym-panel').userData.tripped()).toBe(true);
    expect(stubMake('ice-bath', 0).userData.melted()).toBe(false);
    expect(stubMake('ice-bath', 1).userData.melted()).toBe(true);
    const h = testHouse();
    const d = dbg(h);
    const ud = (id: string) => h.parent.getObjectByName(`slot:${id}`)!.userData;
    // 开局：只有 3 号跑步机的红灯
    expect([1, 2, 3].map((i) => ud(`gym-treadmill-${i}`).fault())).toEqual([false, false, true]);
    expect(ud('gym-dumbbell-rack').loose()).toBe(false);
    expect(ud('gym-plate-tree').loose()).toBe(false);
    expect(ud('gym-desk').stack()).toBe(3);
    expect(ud('gym-desk').binFull()).toBe(false);
    expect(ud('gym-water').level()).toBe(2);
    expect(ud('gym-panel').tripped()).toBe(false);
    expect(ud('gym-ice-bath').melted()).toBe(false);
    for (const id of ['dumbbells', 'plates', 'towels', 'water', 'breaker', 'ice'] as JobId[]) d.force(id);
    expect(ud('gym-dumbbell-rack').loose()).toBe(true);
    expect(ud('gym-plate-tree').loose()).toBe(true);
    expect(ud('gym-desk').stack()).toBe(0);
    expect(ud('gym-desk').binFull()).toBe(true);
    expect(ud('gym-water').level()).toBe(0);
    expect(ud('gym-panel').tripped()).toBe(true);
    expect(ud('gym-ice-bath').melted()).toBe(true);
    for (const id of JOB_IDS) d.clear(id);
    expect([1, 2, 3].map((i) => ud(`gym-treadmill-${i}`).fault())).toEqual([false, false, false]);
    expect(ud('gym-dumbbell-rack').loose()).toBe(false);
    expect(ud('gym-desk').stack()).toBe(3);
    expect(ud('gym-water').level()).toBe(2);
    expect(ud('gym-panel').tripped()).toBe(false);
    expect(ud('gym-ice-bath').melted()).toBe(false);
  }, 30000);
});
