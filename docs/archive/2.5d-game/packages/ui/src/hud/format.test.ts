import { describe, expect, it } from 'vitest';
import { grade, mmss, sparkPoints, trend } from './format';

describe('HUD 格式化', () => {
  it('质量 → 等级的分界', () => {
    expect(grade(85)).toBe('A');
    expect(grade(84.9)).toBe('B');
    expect(grade(58)).toBe('C');
    expect(grade(40)).toBe('D');
    expect(grade(39.9)).toBe('F');
  });

  it('走势看最近 10 个采样，结束后是见底', () => {
    expect(trend([58, 57], false)).toBe('flat');
    expect(trend([60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50], false)).toBe('falling');
    expect(trend([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60], false)).toBe('recovering');
    expect(trend([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60], true)).toBe('bottomed');
  });

  it('倒计时显示成分:秒', () => {
    expect(mmss(45)).toBe('0:45');
    expect(mmss(86)).toBe('1:26');
    expect(mmss(-3)).toBe('0:00');
  });

  it('质量曲线：100 在顶、0 在底，按 60 个采样的宽度排开', () => {
    expect(sparkPoints([100, 0], 59, 108, 4)).toBe('0.0,4.0 1.0,104.0');
  });
});
