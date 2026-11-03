import { describe, expect, it } from 'vitest';
import { arcVelocity, BALL_R, G, simulateBounce } from './ballistics';

describe('arcVelocity', () => {
  it('按算出的初速度飞行 dur 秒正好落到终点', () => {
    const p0 = { x: 0, y: 1, z: 0 };
    const p1 = { x: 10, y: 0.08, z: 3 };
    const dur = 1.2;
    const v = arcVelocity(p0, p1, dur);
    expect(p0.x + v.x * dur).toBeCloseTo(p1.x);
    expect(p0.y + v.y * dur - 0.5 * G * dur * dur).toBeCloseTo(p1.y);
    expect(p0.z + v.z * dur).toBeCloseTo(p1.z);
  });
});

describe('simulateBounce', () => {
  it('球最终停在地面上', () => {
    const pts = simulateBounce({ x: 0, y: 1, z: 0 }, { x: 4, y: 2, z: 0 });
    const y = pts[pts.length - 2];
    expect(y).toBeCloseTo(BALL_R);
    expect(pts.length % 3).toBe(0);
  });

  it('不会穿出围网边界', () => {
    const b = { x0: -2, x1: 2, z0: -2, z1: 2 };
    const pts = simulateBounce({ x: 0, y: 1, z: 0 }, { x: 30, y: 1, z: 25 }, b);
    for (let i = 0; i < pts.length; i += 3) {
      expect(pts[i]).toBeGreaterThanOrEqual(b.x0);
      expect(pts[i]).toBeLessThanOrEqual(b.x1);
      expect(pts[i + 2]).toBeGreaterThanOrEqual(b.z0);
      expect(pts[i + 2]).toBeLessThanOrEqual(b.z1);
    }
  });

  it('结果是确定的', () => {
    const a = simulateBounce({ x: 1, y: 0.9, z: 2 }, { x: -3, y: 1.5, z: 0.4 });
    const b = simulateBounce({ x: 1, y: 0.9, z: 2 }, { x: -3, y: 1.5, z: 0.4 });
    expect(a).toEqual(b);
  });
});
