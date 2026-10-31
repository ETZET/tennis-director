import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  CLUBHOUSE,
  coastDistance,
  creekZ,
  DECK,
  DOG_WAYPOINTS,
  EXIT_ROUTE,
  FA,
  FB,
  FC,
  FD,
  FRAMES,
  groundY,
  ISLAND,
  LOT,
  MID,
  onIsland,
  POOL,
  ROAD_END_X,
  SPINE_X,
  terrainY,
  UP,
  ZL,
  ZU,
} from './layout';

/** 场地四角（含界外）的世界坐标。 */
const corners = (fr: (typeof FRAMES)[number]) =>
  [
    [-fr.hx, -fr.hz],
    [fr.hx, -fr.hz],
    [-fr.hx, fr.hz],
    [fr.hx, fr.hz],
  ].map(([x, z]) => fr.w({ x: x as number, z: z as number }));

describe('Hollow Creek 布局（方案 5 · 溪流分岛）', () => {
  it('场地坐标系：局部 → 世界 → 局部 是恒等变换', () => {
    for (const fr of FRAMES) {
      const p = { x: 3.2, y: 0.5, z: -1.7 };
      const back = fr.l(fr.w(p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
      expect(back.z).toBeCloseTo(p.z);
    }
  });

  it('站在场地上时脚下高度是场地表面', () => {
    for (const fr of FRAMES) expect(groundY(fr.ox, fr.oz)).toBe(fr.oy);
  });

  it('台地高度：北边上层、中层是 1、2 号场、南岸是最低一层；露台高出上层', () => {
    expect(terrainY(-50, -40)).toBe(UP);
    expect(terrainY(-50, 0)).toBe(MID);
    expect(terrainY(-50, 30)).toBe(0);
    expect(terrainY(DECK.x0 + 1, DECK.z0 + 1)).toBe(DECK.y);
  });

  it('两段楼梯都在脊线上，各 6 级，从上到下单调下降', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let z = ZU; z <= ZL + 3.6; z += 0.3) {
      const y = terrainY(SPINE_X, z);
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
    expect(terrainY(SPINE_X, ZU + 3.7)).toBe(MID);
    expect(terrainY(SPINE_X, ZL + 3.7)).toBe(0);
  });

  it('小溪横穿岛的中部：北岸是 1、2 号场，南岸是气膜场和红土场', () => {
    for (const fr of [FA, FB]) for (const p of corners(fr)) expect(p.z).toBeLessThan(ZL);
    for (const fr of [FC, FD]) for (const p of corners(fr)) expect(p.z).toBeGreaterThan(creekZ(p.x) + 2.5);
    for (let x = ISLAND.x0; x <= ISLAND.x1; x += 2) {
      expect(creekZ(x) - 2.5).toBeGreaterThan(ZL + 3.6 - 1.8);
      expect(creekZ(x) + 2.5).toBeLessThan(Math.min(FC.oz - FC.hz, FD.oz - FD.hz) - 1);
    }
  });

  it('场地互不重叠，楼梯从 1、2 号场中间穿过', () => {
    const xs = (fr: (typeof FRAMES)[number]) => corners(fr).map((p) => p.x);
    expect(Math.max(...xs(FA))).toBeLessThan(SPINE_X - 1.1);
    expect(Math.min(...xs(FB))).toBeGreaterThan(SPINE_X + 1.1);
    expect(Math.max(...xs(FC))).toBeLessThan(Math.min(...xs(FD)) - 4);
  });

  it('会所、露台、泳池、停车场都在上层台地上', () => {
    for (const r of [CLUBHOUSE, POOL, LOT]) {
      expect(r.z1).toBeLessThanOrEqual(ZU);
      expect(terrainY((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)).toBe(UP);
    }
    expect(DECK.z1).toBeGreaterThan(ZU);
  });

  it('锚点：1 号场门口在楼梯一侧，人行桥在溪上', () => {
    expect(ANCHORS.court_1_gate_out).toEqual(FA.w({ x: 18.6, z: 0 }));
    expect(ANCHORS.court_1_gate_out.x).toBeLessThan(SPINE_X);
    expect(ANCHORS.creek_bridge.z).toBeCloseTo(creekZ(SPINE_X));
    expect(terrainY(ANCHORS.lot_path.x, ANCHORS.lot_path.z)).toBe(UP);
  });

  it('流浪狗只在南岸转，不穿过场地', () => {
    const pts = DOG_WAYPOINTS.map(([x, z]) => ({ x, z }));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as { x: number; z: number };
      const b = pts[(i + 1) % pts.length] as { x: number; z: number };
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        expect(z).toBeGreaterThan(creekZ(x) + 2.5);
        for (const fr of FRAMES) expect(fr.inside(x, z)).toBe(false);
      }
    }
  });
});

describe('Hollow Creek 浮空岛', () => {
  it('场地四角、所有命名锚点、狗和车的路线都在岛上', () => {
    for (const fr of FRAMES) for (const p of corners(fr)) expect(onIsland(p.x, p.z)).toBe(true);
    for (const a of Object.values(ANCHORS)) expect(onIsland(a.x, a.z)).toBe(true);
    for (const [x, z] of DOG_WAYPOINTS) expect(onIsland(x, z)).toBe(true);
    for (const p of EXIT_ROUTE) expect(onIsland(p.x, p.z)).toBe(true);
  });

  it('边外什么都没有：四个方向和切掉的四角都在岛外', () => {
    for (const [x, z] of [
      [0, ISLAND.z0 - 1],
      [0, ISLAND.z1 + 1],
      [ISLAND.x0 - 1, 0],
      [ISLAND.x1 + 1, 0],
      [ISLAND.x0 + 0.5, ISLAND.z0 + 0.5],
      [ISLAND.x1 - 0.5, ISLAND.z1 - 0.5],
    ])
      expect(onIsland(x as number, z as number)).toBe(false);
  });

  it('有向距离：边上为 0，往里为负，inset 把边界往里收', () => {
    expect(coastDistance(ISLAND.x1, 0)).toBeCloseTo(0);
    expect(coastDistance(ISLAND.x1 - 5, 0)).toBeCloseTo(-5);
    expect(coastDistance(ISLAND.x1 - 5, 0, 5)).toBeCloseTo(0);
  });

  it('公路往东开到岛边为止，车在路上消失', () => {
    const end = EXIT_ROUTE[EXIT_ROUTE.length - 1];
    expect(end && onIsland(end.x, end.z)).toBe(true);
    expect(end?.x).toBeLessThan(ROAD_END_X);
    expect(onIsland(ROAD_END_X + 2, end?.z ?? 0)).toBe(false);
  });
});
