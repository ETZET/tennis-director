import { CONTENT } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { botReport } from './report';

/**
 * 平衡闸口（docs/content-guide.md）：改数值或加卡后，Indian Wells 的一局仍然在目标区间里。
 * 区间比文档里的目标宽一点，这里只防"改坏了"；精调看 pnpm sim bots 的完整报告。
 * 地图写了 ending（mode: score，结局方案 A）时按分数档检查；没写时按通关率（以前的方式）。
 */
describe('Indian Wells balance band', () => {
  // 一局最长 16 周，这里跑 30 局只防"改坏了"
  const r = botReport(CONTENT, { games: 30, bots: ['greedy', 'cautious', 'random', 'idle'] });
  const bot = (name: string) => r.bots.find((b) => b.bot === name);
  const rate = (name: string) => bot(name)?.winRate ?? -1;
  const scored = r.mode === 'score';
  const grades = CONTENT.acts.find((a) => a.id === r.act)?.ending?.grades.map((g) => g.grade) ?? [];
  /** 这个机器人结算在这几档里的局数比例 */
  const share = (name: string, gs: readonly (string | undefined)[]) => {
    const b = bot(name);
    if (!b?.score) return -1;
    return gs.reduce((a, g) => a + (g ? (b.score?.grades[g] ?? 0) : 0), 0) / b.games;
  };
  const [top, second] = grades;
  const bottom = grades[grades.length - 1];

  describe.runIf(!scored)('win / lose (no ending block)', () => {
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
    it('a winning game takes most of the 16 weeks (pacing: the exhibition is the finale, not week 6)', () => {
      expect(bot('greedy')?.avgDays ?? 0).toBeGreaterThan(70);
    });
  });

  describe.runIf(scored)('score bands (ending mode score, W4)', () => {
    it('a careful player mostly scores in the top two grades', () => {
      expect(share('greedy', [top, second])).toBeGreaterThanOrEqual(0.8);
    });
    it("a player who never hires doesn't reach the top three grades (W4 gate: cautious is C/D)", () => {
      // 分数讲经营得好不好（整季服务率、表演赛提前几天），不招人的局到 ★4 也只在 C、D
      expect(share('cautious', grades.slice(0, 3))).toBe(0);
    });
    it('random play rarely reaches the top two grades', () => {
      expect(share('random', [top, second])).toBeLessThanOrEqual(0.2);
    });
    it('leaving the club alone gets the bottom grade (tenet 6)', () => {
      expect(share('idle', [bottom])).toBe(1);
    });
    it('the exhibition still comes late (pacing: the finale is not week 6)', () => {
      expect(bot('greedy')?.avgDays ?? 0).toBeGreaterThan(70);
    });
  });

  it('no game gets stuck and every card shows up', () => {
    for (const b of r.bots) expect(b.stuck, b.bot).toBe(0);
    // 结局方案 A 下，只会判输的期限卡（每个选项都 endAct: lost）打不开：那一分钟先结算了
    const superseded = new Set(
      scored
        ? CONTENT.cards
            .filter((c) => c.act === r.act)
            .filter((c) =>
              Object.values(c.options).every((o) => o.effects.some((e) => 'endAct' in e && e.endAct === 'lost')),
            )
            .map((c) => c.id)
        : [],
    );
    expect(r.neverShown.filter((c) => !superseded.has(c))).toEqual([]);
  });
});
