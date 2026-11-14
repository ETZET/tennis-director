import { describe, expect, it } from 'vitest';
import { rngOf } from '../../clubsite/cast/rng';
import {
  CLEAN_BONUS,
  fracOf,
  ITEMS,
  maxOrders,
  newStation,
  type Order,
  patienceFor,
  pickOrder,
  READY_KEEP,
  serve,
  settle,
  spawnGap,
  startCook,
  stepStation,
  takeReady,
  tipFor,
  toneOf,
  trayCap,
  unlocked,
  wrongLost,
} from './rules';

const order = (o: Partial<Order> = {}): Order => ({
  id: 1,
  table: 0,
  seat: 'd-0n1',
  item: 'wrap',
  t0: 10,
  patience: 30,
  lost: 0,
  ...o,
});

describe('节奏', () => {
  it('越往后来单越密、同时等的越多、客人越没耐心', () => {
    expect(spawnGap(0)).toBeGreaterThan(spawnGap(60));
    expect(spawnGap(60)).toBeGreaterThan(spawnGap(120));
    expect(maxOrders(0)).toBe(2);
    expect(maxOrders(119)).toBeGreaterThan(maxOrders(30));
    expect(maxOrders(500)).toBe(5);
    expect(patienceFor(0, 'lemon')).toBeGreaterThan(patienceFor(120, 'lemon'));
    expect(patienceFor(60, 'pizza')).toBeGreaterThan(patienceFor(60, 'lemon'));
  });
  it('托盘 30 秒起端两份；冰沙、披萨晚一点才有人点', () => {
    expect(trayCap(29.9)).toBe(1);
    expect(trayCap(30)).toBe(2);
    expect(unlocked(0)).toEqual(['lemon', 'wrap']);
    expect(unlocked(60)).toHaveLength(4);
  });
});

describe('耐心和上菜', () => {
  it('耐心条：绿 → 橙 → 红；送错扣一截', () => {
    const o = order();
    expect(fracOf(o, 10)).toBe(1);
    // patience 30：绿到 13.5 秒、橙到 22.5 秒
    expect(toneOf(fracOf(o, 15))).toBe('green');
    expect(toneOf(fracOf(o, 28))).toBe('orange');
    expect(toneOf(fracOf(o, 35))).toBe('red');
    expect(fracOf(o, 99)).toBe(0);
    const o2 = { ...o, lost: wrongLost(o) };
    expect(fracOf(o2, 10)).toBeCloseTo(0.8);
  });
  it('对的东西、红之前送到 = 准时；红了 = 迟了；不对 = 送错', () => {
    const o = order();
    expect(serve(o, 'wrap', 20)).toBe('ontime');
    expect(serve(o, 'wrap', 34)).toBe('late');
    expect(serve(o, 'lemon', 12)).toBe('wrong');
  });
  it('小费：越快越多，连击加成封顶', () => {
    expect(tipFor('wrap', 1, 1)).toBe(2 * ITEMS.wrap.tip);
    expect(tipFor('wrap', 0.5, 1)).toBeLessThan(tipFor('wrap', 0.9, 1));
    expect(tipFor('lemon', 1, 3)).toBe(2 * ITEMS.lemon.tip + 4);
    expect(tipFor('lemon', 1, 50)).toBe(2 * ITEMS.lemon.tip + 10);
  });
});

describe('窗口', () => {
  it('下单 → 做 prep 秒 → 做好 → 拿走；放太久会凉', () => {
    const s = newStation('pizza');
    expect(takeReady(s)).toBe(false);
    expect(startCook(s)).toBe(true);
    expect(startCook(s)).toBe(false);
    let ev: string | null = null;
    for (let i = 0; i < 60 * ITEMS.pizza.prep + 2 && ev !== 'done'; i++) ev = stepStation(s, 1 / 60);
    expect(ev).toBe('done');
    expect(s.state).toBe('ready');
    expect(takeReady(s)).toBe(true);
    expect(s.state).toBe('idle');
    startCook(s);
    stepStation(s, ITEMS.pizza.prep + 0.01);
    expect(stepStation(s, READY_KEEP)).toBe('stale');
    expect(s.state).toBe('idle');
  });
});

describe('来单', () => {
  it('同一个种子同样的单；只挑空桌和已经解锁的；没空桌 = null', () => {
    const a = pickOrder(rngOf(1, 'foodtruck', 'o'), 5, [0, 3, 5]);
    const b = pickOrder(rngOf(1, 'foodtruck', 'o'), 5, [0, 3, 5]);
    expect(a).toEqual(b);
    const r = rngOf(2, 'foodtruck', 'o');
    for (let i = 0; i < 200; i++) {
      const p = pickOrder(r, 5, [2, 4]);
      expect([2, 4]).toContain(p?.table);
      expect(['lemon', 'wrap']).toContain(p?.item);
    }
    expect(pickOrder(r, 5, [])).toBeNull();
  });
  it('手上 / 窗口上多出来的东西更容易有人点', () => {
    const count = (spare: ('pizza' | 'lemon')[]) => {
      const r = rngOf(3, 'foodtruck', 'spare');
      let n = 0;
      for (let i = 0; i < 2000; i++) if (pickOrder(r, 90, [0], spare)?.item === 'pizza') n++;
      return n;
    };
    expect(count(['pizza'])).toBeGreaterThan(count([]) * 1.8);
  });
});

describe('结算', () => {
  it('零差评、准时够多才有奖励', () => {
    const base = { ontime: 12, late: 1, wrong: 0, walkouts: 0, wasted: 2, bestCombo: 4, tips: 300 };
    expect(settle(base).bonus).toEqual([{ label: '零差评', value: CLEAN_BONUS }]);
    expect(settle({ ...base, walkouts: 1 }).bonus).toEqual([]);
    expect(settle({ ...base, ontime: 3 }).bonus).toEqual([]);
    const lines = settle(base).lines.map((l) => l.label);
    expect(lines).toContain('放凉倒掉');
    expect(lines).not.toContain('送错被退');
  });
});
