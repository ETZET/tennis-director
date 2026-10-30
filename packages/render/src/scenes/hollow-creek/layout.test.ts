import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  CAUSEWAY_END_Z,
  causewayStartZ,
  DECK,
  EXIT_ROUTE,
  FA,
  FB,
  FRAMES,
  groundY,
  MID,
  onIsland,
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

describe('Hollow Creek 岛屿', () => {
  it('台地、场地四角和所有命名锚点都在岛上', () => {
    const corners = [
      [-58, -70],
      [42, -70],
      [-58, 9],
      [42, 9],
    ];
    for (const [x, z] of corners) expect(onIsland(x as number, z as number)).toBe(true);
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

  it('岛外是海：远处和四个方向都不在岛上', () => {
    for (const [x, z] of [
      [0, -95],
      [0, 75],
      [-85, 0],
      [90, 0],
      [200, 200],
    ])
      expect(onIsland(x as number, z as number)).toBe(false);
  });

  it('公路从岛的南岸接上堤道，车开出去的终点在堤道上', () => {
    const z = causewayStartZ();
    expect(z).toBeGreaterThan(55);
    expect(z).toBeLessThan(75);
    const end = EXIT_ROUTE[EXIT_ROUTE.length - 1];
    expect(end?.x).toBe(45);
    expect(end?.z).toBeLessThan(CAUSEWAY_END_Z);
  });
});
