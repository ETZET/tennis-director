import { describe, expect, it } from 'vitest';
import { rngOf } from '../../clubsite/cast/rng';
import { BALLS, CLEAR_BONUS, pickPoints, scatterBalls, settle, TRIP_BONUS } from './rules';

describe('pickPoints', () => {
  it('连击越长越多，封顶 +20', () => {
    expect(pickPoints(1)).toBe(10);
    expect(pickPoints(2)).toBe(15);
    expect(pickPoints(5)).toBe(30);
    expect(pickPoints(12)).toBe(30);
  });
});

describe('scatterBalls', () => {
  const area = { x0: -32, x1: -2, z0: 20, z1: 32.5 };
  it('同一个种子同样的球，数够、隔得开、都在能放的地方', () => {
    const ok = (x: number) => Math.abs(x + 17) > 0.45;
    const a = scatterBalls(rngOf(1, 'ballpickup', 'balls:1'), area, ok, BALLS, { netX: -17 });
    const b = scatterBalls(rngOf(1, 'ballpickup', 'balls:1'), area, ok, BALLS, { netX: -17 });
    expect(a).toEqual(b);
    expect(a.length).toBe(BALLS);
    for (const [x, z] of a) {
      expect(ok(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(area.x0);
      expect(z).toBeLessThanOrEqual(area.z1);
    }
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++)
        expect(Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1])).toBeGreaterThan(0.33);
  });
});

describe('settle', () => {
  it('清场才有清场奖励和剩余时间分', () => {
    const full = settle({ picked: 40, delivered: 40, trips: 3, bestCombo: 5, total: 40, timeLeft: 12.4 });
    expect(full.bonus.map((b) => b.value)).toEqual([3 * TRIP_BONUS, CLEAR_BONUS, 60]);
    const part = settle({ picked: 30, delivered: 24, trips: 2, bestCombo: 1, total: 40, timeLeft: 0 });
    expect(part.bonus.map((b) => b.value)).toEqual([2 * TRIP_BONUS]);
    expect(part.lines.at(-1)?.value).toContain('6');
  });
});
