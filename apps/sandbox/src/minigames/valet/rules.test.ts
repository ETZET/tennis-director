import { describe, expect, it } from 'vitest';
import { followStick, newFollow } from './bot';
import {
  allBays,
  boxPen,
  boxPolyPen,
  bumpCost,
  type CarState,
  CTRL,
  carBox,
  chooseBay,
  fetchTip,
  firstHit,
  intentFromStick,
  noseOf,
  PICKUP,
  PICKUP_R,
  parkCheck,
  parkTip,
  routeLen,
  routeToBay,
  routeToPickup,
  settle,
  stepCar,
} from './rules';

const car = (o: Partial<CarState> = {}): CarState => ({ x: 0, z: 0, rot: 0, v: 0, steer: 0, gear: 1, ...o });
const run = (s: CarState, sx: number, sy: number, sec: number) => {
  for (let i = 0; i < sec * 60; i++) s = stepCar(s, intentFromStick(sx, sy, s), 1 / 60);
  return s;
};

describe('开车：往哪拖就往哪开', () => {
  it('摇杆朝车头 → 前进，越来越快，封顶', () => {
    const s = run(car(), 0, -1, 4);
    expect(s.z).toBeLessThan(-10);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
    expect(s.v).toBeCloseTo(CTRL.vFwd, 1);
  });
  it('摇杆朝车尾 → 挂倒挡往后退，车头方向不变', () => {
    const s = run(car(), 0, 1, 3);
    expect(s.gear).toBe(-1);
    expect(s.z).toBeGreaterThan(3);
    expect(Math.abs(s.rot)).toBeLessThan(1e-6);
  });
  it('摇杆朝右 → 车头转向右（东），转完就直着开', () => {
    const s = run(car(), 1, 0, 4);
    const [nx, nz] = noseOf(s.rot);
    expect(nx).toBeGreaterThan(0.98);
    expect(Math.abs(nz)).toBeLessThan(0.2);
    expect(s.x).toBeGreaterThan(4);
  });
  it('倒车时摇杆偏右后 → 车尾往右甩', () => {
    const s = run(car(), 0.6, 0.8, 2.5);
    expect(s.gear).toBe(-1);
    expect(s.x).toBeGreaterThan(0.3);
  });
  it('松手 = 刹车停住', () => {
    let s = run(car(), 0, -1, 2);
    s = run(s, 0, 0, 1.5);
    expect(s.v).toBe(0);
  });
  it('转弯半径（后轴）≈ 轴距 / tan(最大转角)', () => {
    // 前进打满方向开一整圈：车心离圆心不变
    let s = car({ v: 2, steer: CTRL.steerMax });
    const pts: [number, number][] = [];
    for (let i = 0; i < 600; i++) {
      s = stepCar(s, { v: 2, steer: CTRL.steerMax, gear: 1 }, 1 / 60);
      pts.push([s.x, s.z]);
    }
    const xs = pts.map((p) => p[0]);
    const width = Math.max(...xs) - Math.min(...xs);
    const R = Math.sqrt((2.8 / Math.tan(CTRL.steerMax)) ** 2 + 1.4 ** 2);
    expect(width).toBeCloseTo(2 * R, 0);
  });
});

describe('碰撞', () => {
  it('两辆车并排隔开不算压上，挤到一起才算', () => {
    const a = carBox({ x: 0, z: 0, rot: 0 }, 'car');
    expect(boxPen(a, carBox({ x: 2.0, z: 0, rot: 0 }, 'car'))).toBe(0);
    expect(boxPen(a, carBox({ x: 1.7, z: 0, rot: 0 }, 'car'))).toBeCloseTo(0.2, 5);
  });
  it('firstHit：越压越深才算撞上，往外挪不算', () => {
    const other = { kind: 'box' as const, b: carBox({ x: 1.85, z: 0, rot: 0 }, 'car'), tag: 'car' as const };
    const cur = carBox({ x: 0, z: 0, rot: 0 }, 'car');
    expect(firstHit(cur, carBox({ x: 0.2, z: 0, rot: 0 }, 'car'), [other])).toBe(other);
    expect(firstHit(cur, carBox({ x: -0.2, z: 0, rot: 0 }, 'car'), [other])).toBeNull();
  });
  it('多边形（花坛）：车头伸进去就压上', () => {
    const berm = [
      [-2, -5],
      [2, -5],
      [2, -3],
      [-2, -3],
    ] as const;
    expect(boxPolyPen(carBox({ x: 0, z: 0, rot: 0 }, 'car'), berm)).toBe(0);
    expect(boxPolyPen(carBox({ x: 0, z: -1.2, rot: 0 }, 'car'), berm)).toBeGreaterThan(0.3);
  });
  it('赔钱按速度，撞人另加', () => {
    expect(bumpCost(1, 'car')).toBe(20);
    expect(bumpCost(10, 'car')).toBe(40);
    expect(bumpCost(1, 'person')).toBe(35);
  });
});

describe('车位、停车', () => {
  const bays = allBays();
  it('28 个车位（4 排 × 8，减掉两个进出口各 2 个）', () => {
    expect(bays.length).toBe(28);
  });
  const bay = bays.find((b) => b.id === 's-near-1');
  if (!bay) throw new Error('no bay');
  it('停在正中 = 停好、漂亮；车头朝里朝外都行', () => {
    for (const rot of [0, Math.PI]) {
      const pc = parkCheck(carBox({ x: bay.cx, z: bay.cz, rot }, 'car'), rot, bay);
      expect(pc.ok).toBe(true);
      expect(pc.q).toBeGreaterThan(0.95);
      expect(pc.fill).toBe(1);
    }
  });
  it('歪 15° 不算；压线 0.5 米不算', () => {
    const r = (15 * Math.PI) / 180;
    expect(parkCheck(carBox({ x: bay.cx, z: bay.cz, rot: r }, 'car'), r, bay).ok).toBe(false);
    const pc = parkCheck(carBox({ x: bay.cx + 0.9, z: bay.cz, rot: 0 }, 'car'), 0, bay);
    expect(pc.ok).toBe(false);
    expect(pc.fill).toBeLessThan(1);
  });
  it('派车位：先近的、宽敞的；都占了 = null', () => {
    const free = (id: string) => !['s-near-0', 's-near-1', 'n-near-1', 'n-far-7'].includes(id);
    // 第一辆：n-near-1 离代客台最近，可是夹在两辆车中间 → 给旁边空着的 s-near-0
    expect(chooseBay(bays, free, 0)?.id).toBe('s-near-0');
    // 往后就不管宽不宽敞了
    expect(chooseBay(bays, free, 3)?.id).toBe('n-near-1');
    expect(chooseBay(bays, () => true, 0)).toBeNull();
  });
});

describe('小费', () => {
  it('又快又正又没刮 = 满分 80；慢、歪、刮了、等急了少很多', () => {
    const best = parkTip({ secs: 1, dist: 40, q: 1, bumps: 0, patience: 1, angry: false });
    expect(best.total).toBe(80);
    const bad = parkTip({ secs: 99, dist: 40, q: 0, bumps: 2, patience: 0, angry: true });
    expect(bad.total).toBe(10);
  });
  it('取车：等得少、没刮 = 50', () => {
    expect(fetchTip(1, 0)).toBe(50);
    expect(fetchTip(0, 1)).toBe(20);
  });
  it('结算：零剐蹭停够 3 辆有奖励', () => {
    const t = { parked: 3, fetched: 1, perfect: 1, bumps: 0, damage: 0, angry: 0, tips: 200 };
    expect(settle(t).bonus).toEqual([{ label: '一下都没刮', value: 40 }]);
    expect(settle({ ...t, bumps: 1, damage: 12 }).bonus).toEqual([]);
  });
});

describe('导航线 + 机器人跟线（没有障碍的空地上）', () => {
  const bays = allBays();
  for (const id of ['s-near-0', 's-near-2', 'n-near-1', 'n-far-2', 'n-far-6', 's-far-3']) {
    it(`落客点 → ${id}：跟着导航线能停进去，再开到取车点`, () => {
      const bay = bays.find((b) => b.id === id);
      if (!bay) throw new Error(id);
      const route = routeToBay(bay);
      expect(routeLen(route)).toBeGreaterThan(20);
      let s = car({ x: 67.6, z: -2.0, rot: Math.PI / 2 });
      const f = newFollow();
      let ok = false;
      for (let i = 0; i < 60 * 60 && !ok; i++) {
        const st = followStick(route, f, s, 1 / 60);
        s = stepCar(s, intentFromStick(st.x, st.y, s), 1 / 60);
        ok = parkCheck(carBox(s, 'car'), s.rot, bay).ok && Math.abs(s.v) < 0.15;
      }
      expect(ok).toBe(true);
      const back = routeToPickup(bay, s.rot);
      const f2 = newFollow();
      let there = false;
      for (let i = 0; i < 60 * 60 && !there; i++) {
        const st = followStick(back, f2, s, 1 / 60);
        s = stepCar(s, intentFromStick(st.x, st.y, s), 1 / 60);
        there = Math.hypot(s.x - PICKUP[0], s.z - PICKUP[1]) < PICKUP_R && Math.abs(s.v) < 0.4;
      }
      expect(there).toBe(true);
    });
  }
  it('车位 → 取车点（车头朝里停的先倒出来）', () => {
    const bay = bays.find((b) => b.id === 's-near-0');
    if (!bay) throw new Error('bay');
    const route = routeToPickup(bay, 0);
    expect(route[1].rev).toBe(true);
    const last = route[route.length - 1];
    expect(last.x).toBeGreaterThan(80);
    expect(last.z).toBeCloseTo(2, 5);
  });
});
