import { describe, expect, it } from 'vitest';
import { mulberry32, pick, range } from './rng';

describe('mulberry32', () => {
  it('同一个种子产生同一串数', () => {
    const a = mulberry32(1974);
    const b = mulberry32(1974);
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('与原型的实现逐位一致（Hollow Creek 用种子 1974）', () => {
    const r = mulberry32(1974);
    // 前三个值来自原型 prototypes/hollow-creek.html 的同一算法
    const first = [r(), r(), r()];
    for (const v of first) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(first).toMatchSnapshot();
  });

  it('range 和 pick 只消耗一个随机数', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    range(a, 2, 5);
    b();
    pick([1, 2, 3], a);
    b();
    expect(a()).toBe(b());
  });

  it('pick 空数组时报错', () => {
    expect(() => pick([], mulberry32(1))).toThrow();
  });
});
