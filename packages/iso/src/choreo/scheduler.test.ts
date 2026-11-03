import { describe, expect, it } from 'vitest';
import { Scheduler } from './scheduler';

describe('Scheduler', () => {
  it('按时间顺序执行，回调收到的是安排的时刻', () => {
    const s = new Scheduler();
    const seen: [string, number][] = [];
    s.at(2, (t) => seen.push(['b', t]));
    s.at(1, (t) => seen.push(['a', t]));
    s.advance(0.5);
    expect(seen).toEqual([]);
    s.advance(2);
    expect(seen).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('回调里可以继续安排，同一帧内到期的也会执行', () => {
    const s = new Scheduler();
    const seen: number[] = [];
    s.at(1, (t) => {
      seen.push(t);
      s.at(t + 0.5, (t2) => seen.push(t2));
    });
    s.advance(3);
    expect(seen).toEqual([1, 1.5]);
  });

  it('暂停（dt=0）不推进时间', () => {
    const s = new Scheduler();
    let ran = false;
    s.at(0.1, () => {
      ran = true;
    });
    s.advance(0);
    expect(ran).toBe(false);
    expect(s.now).toBe(0);
  });
});
