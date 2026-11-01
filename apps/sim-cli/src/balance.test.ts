import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { botReport } from './report';

/**
 * 平衡闸口（docs/content-guide.md）：改数值或加卡后，Indian Wells 的一局仍然在目标区间里。
 * 区间比文档里的目标宽一点，这里只防"改坏了"；精调看 pnpm sim bots 的完整报告。
 */
describe('Indian Wells balance band', () => {
  // 一局最长 16 周，这里跑 30 局只防"改坏了"
  const r = botReport(CONTENT, { games: 30, bots: ['greedy', 'cautious', 'random', 'idle'] });
  const rate = (bot: string) => r.bots.find((b) => b.bot === bot)?.winRate ?? -1;

  it('a careful player usually wins', () => {
    expect(rate('greedy')).toBeGreaterThanOrEqual(0.6);
  });
  it("a player who never hires can't restore the whole garden in 16 weeks (hiring is the core loop)", () => {
    // 谨慎型机器人从不招人
    expect(rate('cautious')).toBeLessThanOrEqual(0.2);
  });
  it('random play rarely wins', () => {
    expect(rate('random')).toBeLessThanOrEqual(0.2);
  });
  it('leaving the club alone loses (tenet 6: unattended places run down)', () => {
    expect(rate('idle')).toBe(0);
  });
  it('no game gets stuck and every card shows up', () => {
    for (const b of r.bots) expect(b.stuck, b.bot).toBe(0);
    expect(r.neverShown).toEqual([]);
  });
  it('a winning game takes most of the 16 weeks (pacing: the exhibition is the finale, not week 6)', () => {
    const g = r.bots.find((b) => b.bot === 'greedy');
    expect(g?.avgDays ?? 0).toBeGreaterThan(70);
  });
});
