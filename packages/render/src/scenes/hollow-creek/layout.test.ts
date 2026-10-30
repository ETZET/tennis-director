import { describe, expect, it } from 'vitest';
import { ANCHORS, DECK, FA, FB, FRAMES, groundY, MID, terrainY, UP } from './layout';

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
