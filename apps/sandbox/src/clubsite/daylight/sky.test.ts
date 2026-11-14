import { describe, expect, it } from 'vitest';
import { dayLook, sunPos, WEATHERS } from './sky';
import { autoWeather, lookAt, weatherOfBlock } from './weather';

const base = { sky: { top: 0x5c9ed8, horizon: 0xf2d6a8 } };

describe('dayLook', () => {
  it('中午 12 点 = 原来定死的太阳（el ≈ 44～46、az 小正数）和原样的颜色', () => {
    const l = dayLook(12, 'clear', base);
    expect(l.moon).toBe(false);
    expect(l.el).toBeGreaterThan(43);
    expect(l.el).toBeLessThan(47);
    expect(l.az).toBeGreaterThan(0);
    expect(l.az).toBeLessThan(10);
    expect(l.lit).toEqual([1, 1, 1]);
    expect(l.mid).toEqual([1, 1, 1]);
    expect(l.dark).toEqual([1, 1, 1]);
    expect(l.sunK).toBe(1);
    expect(l.skyTop).toBe(base.sky.top);
    expect(l.lamps).toBe(0);
    expect(l.rain + l.dust + l.stars).toBe(0);
  });

  it('早上太阳在东边（影子往左下）、傍晚在西边（影子往右下），都比中午低', () => {
    const am = dayLook(7.5, 'clear', base);
    const pm = dayLook(17, 'clear', base);
    expect(am.az).toBeGreaterThan(30);
    expect(pm.az).toBeLessThan(-30);
    expect(am.el).toBeLessThan(30);
    expect(pm.el).toBeLessThan(30);
    // 投影最低 12°：影子不会长过 ≈ 4.7 倍高
    for (let h = 5; h <= 20; h += 0.05) expect(dayLook(h, 'clear', base).el).toBeGreaterThanOrEqual(12);
  });

  it('夜里换月亮：三档压暗偏蓝，开灯，有星星', () => {
    const n = dayLook(23, 'clear', base);
    expect(n.moon).toBe(true);
    expect(n.lit[2]).toBeGreaterThan(n.lit[0]);
    expect(n.lit[1]).toBeLessThan(0.6);
    expect(n.lamps).toBe(1);
    expect(n.stars).toBeGreaterThan(0.9);
    expect(dayLook(23, 'rain', base).stars).toBe(0);
  });

  it('一天里光方向连续：只在投影完全淡掉（sunK = 0 附近）的时候换太阳 / 月亮', () => {
    let prev = dayLook(0, 'clear', base);
    for (let h = 0.01; h < 24; h += 0.01) {
      const l = dayLook(h, 'clear', base);
      if (l.moon !== prev.moon) {
        expect(Math.min(l.sunK, prev.sunK)).toBeLessThan(0.02);
      } else {
        expect(Math.abs(l.el - prev.el)).toBeLessThan(1);
        expect(Math.abs(l.az - prev.az)).toBeLessThan(1);
      }
      for (let k = 0; k < 3; k++) expect(Math.abs(l.lit[k] - prev.lit[k])).toBeLessThan(0.05);
      prev = l;
    }
  });

  it('阴天、雨天没有投影、亮档全压中档；风沙和多云还有太阳', () => {
    for (const w of ['overcast', 'rain'] as const) {
      const l = dayLook(12, w, base);
      expect(l.sunK).toBe(0);
      expect(l.cloudCut).toBeGreaterThanOrEqual(50);
    }
    expect(dayLook(12, 'rain', base).rain).toBe(1);
    expect(dayLook(12, 'dust', base).dust).toBe(1);
    expect(dayLook(12, 'dust', base).sunK).toBe(1);
    expect(dayLook(12, 'cloudy', base).cloudCut).toBeGreaterThan(1);
  });

  it('日出日落按 sunPos：6 点、18.5 点在地平线上', () => {
    expect(Math.abs(sunPos(6).el)).toBeLessThan(1e-9);
    expect(Math.abs(sunPos(18.5).el)).toBeLessThan(1e-9);
    expect(sunPos(3).el).toBeLessThan(0);
  });
});

describe('自动天气', () => {
  it('同一个种子结果一样；第一天 15 点前是晴', () => {
    for (let b = 0; b < 200; b++) expect(weatherOfBlock(b, 7)).toBe(weatherOfBlock(b, 7));
    for (let h = 0; h < 15; h += 0.25) expect(autoWeather(h, 7).to).toBe('clear');
  });

  it('几天下来五种天气都出现，晴最多', () => {
    const n = new Map<string, number>();
    for (let b = 5; b < 805; b++) {
      const w = weatherOfBlock(b, 7);
      n.set(w, (n.get(w) ?? 0) + 1);
    }
    for (const w of WEATHERS) expect(n.get(w) ?? 0).toBeGreaterThan(10);
    expect(n.get('clear')).toBe(Math.max(...n.values()));
  });

  it('换天气是渐变的（段首 0.4 小时），不跳', () => {
    let prev = lookAt(0, 'auto', 7, base);
    for (let h = 0.01; h < 24 * 6; h += 0.01) {
      const l = lookAt(h, 'auto', 7, base);
      expect(Math.abs(l.rain - prev.rain)).toBeLessThan(0.05);
      expect(Math.abs(l.sunK - prev.sunK)).toBeLessThan(0.06);
      expect(Math.abs(Math.log(l.cloudCut) - Math.log(prev.cloudCut))).toBeLessThan(0.15);
      prev = l;
    }
  });
});
