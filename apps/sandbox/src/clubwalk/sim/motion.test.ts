// 演出里不碰画面的那几块：路上第几米在哪、排队往外延、时钟一步推几分钟、doing → 姿势
import { describe, expect, it } from 'vitest';
import { PLACES } from '../../clubsite/sim';
import type { Doing } from '../../clubsite/sim/types';
import { SimClock } from './clock';
import {
  along,
  GAIT,
  type GaitState,
  JUNCTIONS,
  makeRoute,
  queueOf,
  spotOf,
  stepGait,
  TRUNK_MIN,
  trunk,
} from './motion';
import { DOING_NAME, PERIOD, poseSpec } from './pose';
import { SPOTS, seatWay } from './spots';

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

describe('步子：脚不溜（第 2 轮）', () => {
  /** 一具假身子：默认步幅 0.92（成人走路），setStride 给了就用给的 */
  const body = () => {
    let cur: number | undefined;
    return { stride: (s?: number) => (cur = s) ?? 0.92, get: () => cur ?? 0.92 };
  };
  /** 以 v 米 / 秒走 n 帧（每帧 dt 秒）：每帧 phase 推了多少、步幅是多少 */
  const run = (v: number, dt: number, n = 120) => {
    const g: GaitState = { gait: 0, vs: 0, walkPh: 0, lift: 0, hash: 0.3 };
    const b = body();
    const rows: { dph: number; stride: number; gait: number; lift: number; lean: number }[] = [];
    for (let i = 0; i < n; i++) {
      const ph0 = g.walkPh;
      const lean = stepGait(g, v * dt, dt, dt, i * dt, b.stride);
      rows.push({ dph: (g.walkPh - ph0 + 1) % 1, stride: b.get(), gait: g.gait, lift: g.lift, lean });
    }
    return { g, rows };
  };

  it('慢慢走（1.4 米 / 秒）：走路的步幅，phase 推的 = 路程 / 步幅，不腾空', () => {
    const { rows } = run(1.4, 1 / 60);
    for (const r of rows) {
      expect(r.gait).toBe(0);
      expect(r.dph * r.stride).toBeCloseTo((1.4 / 60) % r.stride, 6);
      expect(r.lift).toBe(0);
    }
  });

  it('2× 下的路人（24 米 / 秒、60 帧）：平滑过来以后跑，步幅 RUN_STRIDE，phase 照路程推、不封顶', () => {
    const { rows } = run(24, 1 / 60);
    const late = rows.slice(60);
    for (const r of late) {
      expect(r.gait).toBe(1);
      expect(r.stride).toBe(GAIT.RUN_STRIDE);
      expect(r.dph).toBeCloseTo(24 / 60 / GAIT.RUN_STRIDE, 6);
      expect(r.lean).toBe(GAIT.RUN_LEAN);
    }
  });

  it('跑的时候脚在身子正下方那一刻落地（腾空 = 0），叉得最开时最高', () => {
    const g: GaitState = { gait: 1, vs: 24, walkPh: 0, lift: 0, hash: 0 };
    stepGait(g, 0, 1 / 60, 1 / 60, 0, () => GAIT.RUN_STRIDE);
    expect(g.lift).toBeCloseTo(0);
    g.walkPh = 0.25 - 1e-9;
    stepGait(g, 0, 1 / 60, 1 / 60, 0, () => GAIT.RUN_STRIDE);
    expect(g.lift).toBeCloseTo(GAIT.RUN_HOP);
  });

  it('一帧走的路超过半个跑步周期（2× 下 30 帧、15×、60×）：冲 —— 双脚离地，phase 停在叉开的那两格', () => {
    for (const [v, dt] of [
      [24, 1 / 30],
      [180, 1 / 60],
      [720, 1 / 60],
    ]) {
      const { rows, g } = run(v, dt);
      const late = rows.slice(60);
      for (const r of late) {
        expect(r.gait).toBe(2);
        expect(r.lift).toBe(GAIT.DASH_LIFT);
      }
      expect([0.25, 0.75]).toContain(g.walkPh);
    }
  });

  it('跑 / 走之间有滞回：速度在门槛上下抖，不来回换', () => {
    const g: GaitState = { gait: 0, vs: 0, walkPh: 0, lift: 0, hash: 0 };
    const b = body();
    let flips = 0;
    let last = -1;
    for (let i = 0; i < 600; i++) {
      // 2.2 米 / 秒上下 ±0.25 抖（一帧 0 / 1 / 2 步那种）
      const v = GAIT.RUN_V + 0.1 + (i % 2 ? 0.25 : -0.25);
      stepGait(g, v / 60, 1 / 60, 1 / 60, i / 60, b.stride);
      if (last >= 0 && g.gait !== last) flips++;
      last = g.gait;
    }
    expect(flips).toBeLessThanOrEqual(1);
  });
});

describe('干道（第 2 轮：长路拆成"地点 → 路口 → 路口 → 地点"，路缓存得住）', () => {
  it('近的路不走干道', () => {
    expect(trunk(0, 0, TRUNK_MIN - 1, 0)).toEqual([]);
  });
  it('餐车院子 → 停车场：经过长廊上的路口，绕得不多', () => {
    const js = trunk(-31, -30, 88, 3.6);
    expect(js.length).toBeGreaterThan(0);
    for (const j of js) expect(JUNCTIONS).toContain(j);
    let len = 0;
    let p: [number, number] = [-31, -30];
    for (const q of [...js, [88, 3.6] as [number, number]]) {
      len += Math.hypot(q[0] - p[0], q[1] - p[1]);
      p = q;
    }
    expect(len).toBeLessThan(Math.hypot(88 + 31, 33.6) * 1.45 + 8);
  });
});

describe('看台座位的出口（第 2 轮：散场时座位到路口规划不到，人从座位上消失）', () => {
  it('三面看台每个座位都有出口，出口在看台外面（北看台在走道上），别的地点没有', () => {
    for (const id of ['stadium.stand.n', 'stadium.stand.e', 'stadium.stand.s'] as const) {
      for (const q of SPOTS[id].spots) {
        const w = seatWay(id, q.x, q.z);
        expect(w?.length).toBeGreaterThan(0);
        const [x, z] = w?.at(-1) ?? [0, 0];
        if (id === 'stadium.stand.n') expect([-20.6, -14, -7, 7, 14]).toContain(x);
        else expect(Math.hypot(x - q.x, z - q.z)).toBeGreaterThan(0.5);
      }
    }
    expect(seatWay('food.coffee', 0, 0)).toBeNull();
  });
});
