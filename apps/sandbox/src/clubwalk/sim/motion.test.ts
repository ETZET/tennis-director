// 演出里不碰画面的那几块：路上第几米在哪、排队往外延、时钟一步推几分钟、doing → 姿势
import { describe, expect, it } from 'vitest';
import { PLACES } from '../../clubsite/sim';
import type { Doing } from '../../clubsite/sim/types';
import { SimClock } from './clock';
import { along, makeRoute, queueOf, spotOf } from './motion';
import { DOING_NAME, PERIOD, poseSpec } from './pose';
import { SPOTS } from './spots';

describe('motion', () => {
  it('along：按路程插值，两头夹住', () => {
    const r = makeRoute([
      [0, 0],
      [10, 0],
      [10, 5],
    ]);
    expect(r.len).toBeCloseTo(15);
    const o = { x: 0, z: 0, dx: 0, dz: 0 };
    along(r, 12, o);
    expect(o.x).toBeCloseTo(10);
    expect(o.z).toBeCloseTo(2);
    expect(o.dz).toBeCloseTo(1);
    along(r, 99, o);
    expect([o.x, o.z]).toEqual([10, 5]);
    along(r, -1, o);
    expect([o.x, o.z]).toEqual([0, 0]);
  });

  it('排队超出队列表：沿最后两点往外延 1.1 米一个', () => {
    const ps = {
      spots: [{ x: 0, z: 0, yaw: 0 }],
      queue: [
        { x: 0, z: 1, yaw: Math.PI },
        { x: 0, z: 2, yaw: Math.PI },
      ],
    };
    const q3 = queueOf(undefined, ps, 3);
    expect(q3.x).toBeCloseTo(0);
    expect(q3.z).toBeCloseTo(2 + 2.2);
    // 队头朝站位
    expect(queueOf(undefined, ps, 0).yaw).toBeCloseTo(Math.PI);
  });

  it('站位表里没有的地点：站在地点的估算坐标上', () => {
    const p = PLACES[0];
    expect(spotOf(p, undefined, 3)).toMatchObject({ x: p.x, z: p.z });
  });

  it('每个地点都有站位（演出不会退回估算坐标）', () => {
    const missing = PLACES.filter((p) => !SPOTS[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
  });
});

describe('clock', () => {
  it('60× 时一个 1/60 秒的步长推一分钟；卡了也最多推 3 分钟', () => {
    const c = new SimClock();
    c.speed = 60;
    let n = 0;
    for (let i = 0; i < 60; i++) n += c.tick(1 / 60);
    expect(n).toBeGreaterThanOrEqual(59);
    expect(n).toBeLessThanOrEqual(60);
    expect(c.tick(1)).toBe(3);
    c.paused = true;
    expect(c.tick(1)).toBe(0);
  });
});

describe('pose', () => {
  it('每种 doing 都有姿势，姿势都有一遍几秒、都有中文名', () => {
    for (const d of Object.keys(DOING_NAME) as Doing[]) {
      const sp = poseSpec(
        d,
        PLACES.find((p) => p.doing === d),
        undefined,
        'adult',
      );
      expect(PERIOD[sp.pose], `${d} → ${sp.pose}`).toBeGreaterThan(0);
    }
  });
});
