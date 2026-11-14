import { describe, expect, it } from 'vitest';
import { rngOf } from '../../clubsite/cast/rng';
import {
  accuracy,
  arrivalGap,
  CLEAN_BONUS,
  crossPattern,
  GAUGE,
  judgeBeat,
  judgeSweep,
  judgeTension,
  KIND,
  makeCustomer,
  payout,
  phasesOf,
  quality,
  qualityLabel,
  settle,
  sweepPos,
  sweepSpec,
  tensionAt,
  zoneCenter,
} from './rules';

describe('竖线：扫的光标', () => {
  it('三角波：0 → 1 → 0，周期两趟', () => {
    expect(sweepPos(0, 1)).toBe(0);
    expect(sweepPos(0.5, 1)).toBeCloseTo(0.5);
    expect(sweepPos(1, 1)).toBeCloseTo(1);
    expect(sweepPos(1.25, 1)).toBeCloseTo(0.75);
    expect(sweepPos(2, 1)).toBeCloseTo(0);
  });
  it('正中完美、区里还行、区外偏了；越往后区越窄、扫得越快', () => {
    const s = sweepSpec(0);
    expect(judgeSweep(0.5, 0.5, s)).toBe('perfect');
    expect(judgeSweep(0.5 + s.good - 0.001, 0.5, s)).toBe('good');
    expect(judgeSweep(0.5 + s.good + 0.001, 0.5, s)).toBe('miss');
    const hard = sweepSpec(1);
    expect(hard.good).toBeLessThan(s.good);
    expect(hard.period).toBeLessThan(s.period);
  });
  it('目标区不贴边', () => {
    const r = rngOf(1, 'stringing', 'zone');
    const s = sweepSpec(0.5);
    for (let i = 0; i < 200; i++) {
      const z = zoneCenter(r, s);
      expect(z - s.good).toBeGreaterThan(0);
      expect(z + s.good).toBeLessThan(1);
    }
  });
});

describe('拉力', () => {
  it('从最低往上走，先慢后快，到顶封住', () => {
    expect(tensionAt(0, 22)).toBe(GAUGE.min);
    const a = tensionAt(0.5, 22) - tensionAt(0, 22);
    const b = tensionAt(1, 22) - tensionAt(0.5, 22);
    expect(b).toBeGreaterThan(a);
    expect(tensionAt(10, 22)).toBe(GAUGE.max);
  });
  it('±1 磅完美、±2.5 还行', () => {
    expect(judgeTension(52.8, 52)).toBe('perfect');
    expect(judgeTension(49.6, 52)).toBe('good');
    expect(judgeTension(55, 52)).toBe('miss');
  });
});

describe('横线：节拍', () => {
  it('一开始严格左右交替；难了偶尔连着同边', () => {
    const easy = crossPattern(rngOf(1, 'stringing', 'x'), 8, 0);
    for (let i = 1; i < easy.length; i++) expect(easy[i]).not.toBe(easy[i - 1]);
    let repeats = 0;
    for (let k = 0; k < 40; k++) {
      const p = crossPattern(rngOf(k, 'stringing', 'x'), 10, 1);
      for (let i = 1; i < p.length; i++) if (p[i] === p[i - 1]) repeats++;
      // 不会三个连着同边
      for (let i = 2; i < p.length; i++) expect(p[i] === p[i - 1] && p[i] === p[i - 2]).toBe(false);
    }
    expect(repeats).toBeGreaterThan(0);
  });
  it('判定窗', () => {
    expect(judgeBeat(0.05)).toBe('perfect');
    expect(judgeBeat(-0.12)).toBe('good');
    expect(judgeBeat(0.2)).toBeNull();
  });
});

describe('客人', () => {
  it('同一个种子同样的客人；头 15 秒只有普通客人；混穿横线低 2 磅', () => {
    const names = ['甲', '乙'];
    const a = makeCustomer(rngOf(3, 'stringing', 'c'), 40, 0, names);
    const b = makeCustomer(rngOf(3, 'stringing', 'c'), 40, 0, names);
    expect(a).toEqual(b);
    const r = rngOf(5, 'stringing', 'c');
    for (let i = 0; i < 30; i++) expect(makeCustomer(r, 5, i, names).kind).toBe('normal');
    const r2 = rngOf(7, 'stringing', 'c');
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = makeCustomer(r2, 60, i, names);
      kinds.add(c.kind);
      expect(c.crossTension).toBe(c.kind === 'hybrid' ? c.tension - 2 : c.tension);
      expect(c.tension).toBeGreaterThanOrEqual(46);
      expect(c.tension).toBeLessThanOrEqual(62);
    }
    expect(kinds).toEqual(new Set(['normal', 'hybrid', 'pro']));
  });
  it('越往后来得越密；混穿多拉一次线', () => {
    expect(arrivalGap(100)).toBeLessThan(arrivalGap(0));
    expect(phasesOf('hybrid')).toEqual(['mains', 'tension', 'tension2', 'crosses']);
    expect(phasesOf('pro')).toEqual(['mains', 'tension', 'crosses']);
  });
});

describe('质量和小费', () => {
  it('准度加权：全完美 = 1，全偏 = 0', () => {
    expect(accuracy(['perfect', 'good', 'miss'])).toBeCloseTo(1.6 / 3);
    expect(quality(['perfect'], ['perfect'], ['perfect'])).toBeCloseTo(1);
    expect(quality(['miss'], ['miss'], ['miss'])).toBe(0);
    expect(qualityLabel(0.95).grade).toBe('S');
    expect(qualityLabel(0.3).grade).toBe('C');
  });
  it('职业球员小费翻倍；快的 +5；超时减半；分 = 小费 × 质量 × 10', () => {
    expect(KIND.pro.tip).toBe(KIND.normal.tip * 2);
    const fast = payout('normal', 1, 40, 52);
    expect(fast).toMatchObject({ tip: 25, points: 250, fast: true, late: false });
    const slow = payout('normal', 0.5, 10, 52);
    expect(slow).toMatchObject({ tip: 20, points: 100, fast: false });
    const late = payout('pro', 1, -2, 36);
    expect(late).toMatchObject({ tip: 20, late: true });
  });
  it('结算：没人走掉且穿够了才有零流失奖励', () => {
    const base = { done: 6, tips: 150, qualitySum: 5.1, perfects: 40, left: 0, pros: 1, bestCombo: 30 };
    expect(settle(base).bonus).toEqual([{ label: '零流失', value: CLEAN_BONUS }]);
    expect(settle({ ...base, left: 1 }).bonus).toEqual([]);
    expect(settle(base).lines.find((l) => l.label === '平均质量')?.value).toBe('85%');
  });
});
