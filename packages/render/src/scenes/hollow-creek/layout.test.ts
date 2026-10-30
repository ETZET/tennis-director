import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  CREEK_OUTFALLS,
  coastDistance,
  DECK,
  EXIT_ROUTE,
  FA,
  FB,
  FRAMES,
  groundY,
  ISLAND,
  MID,
  onIsland,
  ROAD_END_Z,
  terrainY,
  UP,
} from './layout';

describe('Hollow Creek 布局', () => {
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
    expect(groundY(FA.ox, FA.oz)).toBe(FA.oy);
    expect(groundY(FB.ox, FB.oz)).toBe(FB.oy);
  });

  it('三层台地和露台的高度', () => {
    expect(terrainY(-30, -40)).toBe(UP);
    expect(terrainY(-50, 0)).toBe(MID);
    expect(terrainY(-50, 30)).toBe(0);
    expect(terrainY(-10, -19)).toBe(DECK.y);
  });

  it('楼梯是 6 级台阶，从上到下单调下降', () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let z = -17; z <= -13.4; z += 0.3) {
      const y = terrainY(0, z);
      expect(y).toBeLessThanOrEqual(prev);
      prev = y;
    }
  });

  it('锚点与原型里的路径点一致', () => {
    expect(ANCHORS.stairs_top).toEqual({ x: 0, z: -17.4 });
    expect(ANCHORS.lot_path).toEqual({ x: 21, z: -20.6 });
    expect(ANCHORS.court_1_gate_out).toEqual(FA.w({ x: 18.6, z: 0 }));
  });
});

describe('Hollow Creek 浮空岛', () => {
  it('台地、场地四角、所有命名锚点和树都在岛上', () => {
    for (const [x, z] of [
      [-58, -70],
      [42, -70],
      [-58, 9],
      [42, 9],
      // 最外面的几棵树（含树冠半径）
      [60 + 2.5, 0],
      [-58 - 2.5, 40],
      [24, 50 + 2.5],
    ])
      expect(onIsland(x as number, z as number)).toBe(true);
    for (const fr of FRAMES)
      for (const [lx, lz] of [
        [-fr.hx, -fr.hz],
        [fr.hx, -fr.hz],
        [-fr.hx, fr.hz],
        [fr.hx, fr.hz],
      ]) {
        const p = fr.w({ x: lx as number, z: lz as number });
        expect(onIsland(p.x, p.z)).toBe(true);
      }
    for (const a of Object.values(ANCHORS)) expect(onIsland(a.x, a.z)).toBe(true);
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

  it('公路开到岛的南边缘为止，车在路上消失；小溪从东西两边落下', () => {
    const end = EXIT_ROUTE[EXIT_ROUTE.length - 1];
    expect(end?.x).toBe(45);
    expect(end && onIsland(end.x, end.z)).toBe(true);
    expect(onIsland(45, ROAD_END_Z + 2)).toBe(false);
    expect(CREEK_OUTFALLS.map((p) => p.x)).toEqual([ISLAND.x0, ISLAND.x1]);
  });
});
