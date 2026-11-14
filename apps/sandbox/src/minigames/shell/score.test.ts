import { describe, expect, it } from 'vitest';
import { Combo, clockOf, starsFor } from './score';

describe('starsFor', () => {
  it('按三档阈值给星', () => {
    const t = [100, 200, 300] as const;
    expect(starsFor(0, t)).toBe(0);
    expect(starsFor(99, t)).toBe(0);
    expect(starsFor(100, t)).toBe(1);
    expect(starsFor(250, t)).toBe(2);
    expect(starsFor(300, t)).toBe(3);
    expect(starsFor(9999, t)).toBe(3);
  });
});

describe('clockOf', () => {
  it('倒计时向上取整', () => {
    expect(clockOf(90)).toBe('1:30');
    expect(clockOf(65.2)).toBe('1:06');
    expect(clockOf(0.01)).toBe('0:01');
    expect(clockOf(0)).toBe('0:00');
    expect(clockOf(-3)).toBe('0:00');
  });
});

describe('Combo', () => {
  it('时间窗内连起来，超时从 1 重新数', () => {
    const c = new Combo(1.5);
    expect(c.hit(0)).toBe(1);
    expect(c.hit(1)).toBe(2);
    expect(c.hit(2.4)).toBe(3);
    expect(c.alive(3)).toBe(true);
    expect(c.alive(4)).toBe(false);
    expect(c.hit(5)).toBe(1);
    c.reset();
    expect(c.value).toBe(0);
    expect(c.hit(5.1)).toBe(1);
  });
});
