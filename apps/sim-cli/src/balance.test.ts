import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { botReport } from './report';

/**
 * 平衡闸口（docs/content-guide.md）：改数值或加卡后，第一幕仍然在目标区间里。
 * 区间比文档里的目标宽一点，这里只防"改坏了"；精调看 pnpm sim bots 的完整报告。
 */
describe('Act 1 balance band', () => {
  const r = botReport(CONTENT, { games: 200, bots: ['greedy', 'random'] });
  const rate = (bot: string) => r.bots.find((b) => b.bot === bot)?.winRate ?? -1;

  it('a careful player usually wins, but not always', () => {
    expect(rate('greedy')).toBeGreaterThanOrEqual(0.7);
    expect(rate('greedy')).toBeLessThanOrEqual(0.95);
  });
  it('random play rarely wins', () => {
    expect(rate('random')).toBeGreaterThanOrEqual(0.03);
    expect(rate('random')).toBeLessThanOrEqual(0.25);
  });
  it('no game gets stuck and every card shows up', () => {
    for (const b of r.bots) expect(b.stuck, b.bot).toBe(0);
    expect(r.neverShown).toEqual([]);
  });
});
