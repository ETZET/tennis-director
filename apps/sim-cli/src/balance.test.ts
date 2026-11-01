import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { botReport } from './report';

/**
 * 平衡闸口（docs/content-guide.md）：改数值或加卡后，第一幕仍然在目标区间里。
 * 区间比文档里的目标宽一点，这里只防"改坏了"；精调看 pnpm sim bots 的完整报告。
 */
describe('Act 1 balance band', () => {
  // 新循环每局慢一些（每分钟要推岗位和工单），这里跑 60 局只防"改坏了"
  const r = botReport(CONTENT, { games: 60, bots: ['greedy', 'random', 'idle'] });
  const rate = (bot: string) => r.bots.find((b) => b.bot === bot)?.winRate ?? -1;

  it('a careful player usually wins, but not always', () => {
    expect(rate('greedy')).toBeGreaterThanOrEqual(0.6);
    expect(rate('greedy')).toBeLessThanOrEqual(0.92);
  });
  it('random play rarely wins', () => {
    expect(rate('random')).toBeLessThanOrEqual(0.2);
  });
  it('leaving the club alone loses (tenet 6: unattended places run down)', () => {
    // 表决卡再差也有 8% 的机会，所以对照组偶尔会赢
    expect(rate('idle')).toBeLessThanOrEqual(0.1);
  });
  it('no game gets stuck and every card shows up', () => {
    for (const b of r.bots) expect(b.stuck, b.bot).toBe(0);
    expect(r.neverShown).toEqual([]);
  });
});
