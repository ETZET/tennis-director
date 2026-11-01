import type { ContentBundle } from '@td/sim';
import { cautiousBot, greedyBot, idleBot, type RunResult, randomBot, replay, runGame, stateHash } from '@td/sim';

/**
 * 机器人跑局报告：平衡工具。
 * 例如"贪心机器人通关率 92%"说明太简单；"某张卡在 1000 局里从未出现"说明前置条件写错了。
 */

export interface BotSummary {
  bot: string;
  games: number;
  wins: number;
  winRate: number;
  endings: Record<string, number>;
  avgDays: number;
  avg: Record<string, number>;
  /** 没有结局就跑到天数上限的局（卡死） */
  stuck: number;
  msPerGame: number;
}

export interface Report {
  act: string;
  director: string;
  contentVersion: string;
  games: number;
  bots: BotSummary[];
  /** 卡 → 出现过的局数比例 */
  cardRate: Record<string, number>;
  neverShown: string[];
}

const BOTS = {
  greedy: (_seed: number) => greedyBot(),
  random: (seed: number) => randomBot(seed * 7919),
  cautious: (_seed: number) => cautiousBot(),
  idle: (_seed: number) => idleBot(),
} as const;
export type BotName = keyof typeof BOTS;
export const BOT_NAMES = Object.keys(BOTS) as BotName[];

export function botReport(
  content: ContentBundle,
  o: { games: number; bots: BotName[]; act?: string; director?: string; seed0?: number },
): Report {
  const act = o.act ?? content.acts[0]?.id ?? '';
  const director = o.director ?? content.acts.find((a) => a.id === act)?.director_config ?? '';
  const cards = content.cards.filter((c) => c.act === act).map((c) => c.id);
  const cardGames = Object.fromEntries(cards.map((c) => [c, 0])) as Record<string, number>;
  const bots: BotSummary[] = [];
  let total = 0;
  for (const name of o.bots) {
    const t0 = performance.now();
    const sum: BotSummary = {
      bot: name,
      games: o.games,
      wins: 0,
      winRate: 0,
      endings: {},
      avgDays: 0,
      avg: { quality: 0, members: 0, reputation: 0, cash: 0, restoration: 0 },
      stuck: 0,
      msPerGame: 0,
    };
    for (let i = 0; i < o.games; i++) {
      const seed = (o.seed0 ?? 1) + i;
      const r = runGame(content, BOTS[name](seed), seed, { act, director, maxDays: 120 });
      total++;
      if (r.outcome?.result === 'won') sum.wins++;
      const ending = r.outcome?.ending ?? '(none)';
      sum.endings[ending] = (sum.endings[ending] ?? 0) + 1;
      if (!r.outcome) sum.stuck++;
      sum.avgDays += r.days / o.games;
      for (const k of Object.keys(sum.avg)) sum.avg[k] = (sum.avg[k] ?? 0) + (r.state.stats[k] ?? 0) / o.games;
      for (const c of Object.keys(r.state.cards.shown)) if (c in cardGames) cardGames[c] = (cardGames[c] ?? 0) + 1;
    }
    sum.winRate = sum.wins / o.games;
    sum.msPerGame = (performance.now() - t0) / o.games;
    bots.push(sum);
  }
  const cardRate = Object.fromEntries(Object.entries(cardGames).map(([c, n]) => [c, n / total]));
  return {
    act,
    director,
    contentVersion: content.version,
    games: total,
    bots,
    cardRate,
    neverShown: cards.filter((c) => !cardGames[c]),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function reportMarkdown(r: Report): string {
  const lines: string[] = [];
  lines.push(`# 机器人跑局报告 · ${r.act}`, '');
  lines.push(`导演 ${r.director} · 内容版本 ${r.contentVersion} · 共 ${r.games} 局`, '');
  lines.push(
    '| 机器人 | 局数 | 通关率 | 平均天数 | 卡死 | 平均质量 | 平均会员 | 平均声望 | 平均现金 | 平均复原 | 每局耗时 |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of r.bots)
    lines.push(
      `| ${b.bot} | ${b.games} | ${pct(b.winRate)} | ${b.avgDays.toFixed(1)} | ${b.stuck} | ${b.avg.quality?.toFixed(1)} | ${b.avg.members?.toFixed(1)} | ${b.avg.reputation?.toFixed(1)} | $${Math.round(b.avg.cash ?? 0)} | ${b.avg.restoration?.toFixed(1)}/8 | ${b.msPerGame.toFixed(1)} ms |`,
    );
  lines.push('', '## 结局分布', '');
  for (const b of r.bots)
    lines.push(
      `- ${b.bot}：${Object.entries(b.endings)
        .sort((a, c) => c[1] - a[1])
        .map(([k, v]) => `${k} ${pct(v / b.games)}`)
        .join('，')}`,
    );
  lines.push('', '## 卡出现的局数比例', '');
  lines.push('| 卡 | 出现比例 |', '| --- | --- |');
  for (const [c, v] of Object.entries(r.cardRate).sort((a, b) => a[1] - b[1])) lines.push(`| ${c} | ${pct(v)} |`);
  lines.push('', r.neverShown.length ? `**从未出现的卡：** ${r.neverShown.join('、')}` : '所有卡都出现过。');
  return lines.join('\n');
}

/**
 * 确定性闸口：每一局都用命令日志从种子重放一遍，状态哈希必须和原来那一局一致。
 * 再把同一局原样跑第二遍，也必须一致。
 */
export function determinismCheck(
  content: ContentBundle,
  games: number,
  o: { act?: string } = {},
): { games: number; mismatches: { seed: number; why: string }[] } {
  const mismatches: { seed: number; why: string }[] = [];
  for (let i = 0; i < games; i++) {
    const seed = 1000 + i;
    const bot = i % 2 ? greedyBot() : randomBot(seed);
    const a: RunResult = runGame(content, bot, seed, { ...(o.act ? { act: o.act } : {}) });
    const again = replay(content, { seed, ...(o.act ? { act: o.act } : {}) }, a.commands, a.state.t + 1);
    if (stateHash(again) !== stateHash(a.state)) mismatches.push({ seed, why: 'replay differs' });
    const twice = runGame(content, i % 2 ? greedyBot() : randomBot(seed), seed, { ...(o.act ? { act: o.act } : {}) });
    if (stateHash(twice.state) !== stateHash(a.state)) mismatches.push({ seed, why: 'second run differs' });
  }
  return { games, mismatches };
}
