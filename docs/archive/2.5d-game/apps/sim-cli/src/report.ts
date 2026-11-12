import type { ContentBundle, GameState } from '@td/sim';
import {
  careActive,
  careCourts,
  careLevelOf,
  cautiousBot,
  greedyBot,
  HUMAN_TIERS,
  humanBot,
  humanProfile,
  idleBot,
  type RunResult,
  randomBot,
  replay,
  runGame,
  stateHash,
  worldFor,
} from '@td/sim';

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
  /** 修复变体（LG-14）：'设施.变体' → 局数（GM-13：看有没有被压制的变体） */
  variants: Record<string, number>;
  /** 星级（LG-10）：平均几星、平均奖杯、★n 第一次升上来的天数（中位，没升上来的局不算）和升上来的局数 */
  stars: { avg: number; trophies: number; day: Record<number, { median: number; games: number }> };
  /**
   * 地块（W5）：地块 → 开工的局数、开地的局数、开地的天数（中位，没开的局不算）、开工后到开地的天数（中位）、
   * 各变体开工的局数。地图没写 plots 时是空的
   */
  plots: Record<
    string,
    { started: number; opened: number; openDay: number; buildDays: number; variants: Record<string, number> }
  >;
  /**
   * 结局方案 A（W4）：地图写了 ending（mode: score）才有。总分的平均、分位、评语档的局数比例（破产没结算的局记 bankrupt）、
   * 提前结算（表演赛以后马上结算）的局数比例、结算的局里每一项的平均分
   */
  /**
   * 场地可用度：开着的球场在营业时间里各档的时间占比（每 5 分钟看一眼），
   * 每局平均走掉的会员、亲手扫几次、打扫工单做完几张。地图没写 rules.care 时没有
   */
  care?: { ok: number; meh: number; no: number; walkouts: number; hand: number; orders: number };
  score?: {
    avg: number;
    p10: number;
    median: number;
    p90: number;
    grades: Record<string, number>;
    early: number;
    items: Record<string, number>;
  };
}

export interface Report {
  act: string;
  /** 结局方式：score = 结局方案 A（第 112 天打分）；win = 以前的通关 / 输 */
  mode: 'score' | 'win';
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
  // 普通玩家（LG-9）：三档
  novice: (seed: number) => humanBot(seed, humanProfile(HUMAN_TIERS.novice), 'novice'),
  average: (seed: number) => humanBot(seed, humanProfile(HUMAN_TIERS.average), 'average'),
  good: (seed: number) => humanBot(seed, humanProfile(HUMAN_TIERS.good), 'good'),
} as const;
export type BotName = keyof typeof BOTS;
export const BOT_NAMES = Object.keys(BOTS) as BotName[];
export const makeBot = (name: BotName, seed: number) => BOTS[name](seed);

export function botReport(
  content: ContentBundle,
  o: { games: number; bots: BotName[]; act?: string; director?: string; seed0?: number },
): Report {
  const act = o.act ?? content.acts[0]?.id ?? '';
  const director = o.director ?? content.acts.find((a) => a.id === act)?.director_config ?? '';
  const cards = content.cards.filter((c) => c.act === act).map((c) => c.id);
  const ending = content.acts.find((a) => a.id === act)?.ending;
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
      variants: {},
      stars: { avg: 0, trophies: 0, day: {} },
      plots: {},
    };
    const plotDays: Record<string, { open: number[]; build: number[] }> = {};
    const starDays: Record<number, number[]> = {};
    const totals: number[] = [];
    const grades: Record<string, number> = Object.fromEntries((ending?.grades ?? []).map((g) => [g.grade, 0]));
    const items: Record<string, number> = {};
    let early = 0;
    const careOn = !!content.acts.find((a) => a.id === act)?.rules.care;
    const lv = { ok: 0, meh: 0, no: 0 };
    const careSum = { walkouts: 0, hand: 0, orders: 0 };
    const observe = careOn
      ? (s: GameState) => {
          const w = worldFor(content, s.act, s.directorConfig);
          for (const f of careCourts(w)) if (careActive(s, w, f)) lv[careLevelOf(s, w, f)]++;
        }
      : undefined;
    for (let i = 0; i < o.games; i++) {
      const seed = (o.seed0 ?? 1) + i;
      const r = runGame(content, BOTS[name](seed), seed, {
        act,
        director,
        maxDays: 120,
        ...(observe ? { observe } : {}),
      });
      if (careOn) {
        for (const e of r.state.log) {
          if (e.cause.kind === 'walkout') careSum.walkouts++;
          if (e.cause.kind === 'care') careSum.hand++;
        }
        for (const [id, n] of Object.entries(r.state.orderLog.done)) if (id.startsWith('care_')) careSum.orders += n;
      }
      total++;
      if (r.outcome?.result === 'won') sum.wins++;
      const ending = r.outcome?.ending ?? '(none)';
      sum.endings[ending] = (sum.endings[ending] ?? 0) + 1;
      if (!r.outcome) sum.stuck++;
      sum.avgDays += r.days / o.games;
      for (const k of Object.keys(sum.avg)) sum.avg[k] = (sum.avg[k] ?? 0) + (r.state.stats[k] ?? 0) / o.games;
      for (const c of Object.keys(r.state.cards.shown)) if (c in cardGames) cardGames[c] = (cardGames[c] ?? 0) + 1;
      for (const [f, v] of Object.entries(r.state.variants ?? {}))
        sum.variants[`${f}.${v}`] = (sum.variants[`${f}.${v}`] ?? 0) + 1;
      sum.stars.avg += (r.state.stars ?? 0) / o.games;
      sum.stars.trophies += (r.state.trophies ?? 0) / o.games;
      for (const e of r.state.log)
        if (e.cause.kind === 'star') (starDays[e.cause.stars] ??= []).push(Math.floor(e.t / 1440) + 1);
      for (const [id, p] of Object.entries(r.state.plots ?? {})) {
        const x = (sum.plots[id] ??= { started: 0, opened: 0, openDay: 0, buildDays: 0, variants: {} });
        const d = (plotDays[id] ??= { open: [], build: [] });
        x.started++;
        x.variants[p.variant] = (x.variants[p.variant] ?? 0) + 1;
        if (p.opened !== null) {
          x.opened++;
          d.open.push(Math.floor(p.opened / 1440) + 1);
          d.build.push((p.opened - p.since) / 1440);
        }
      }
      const st = r.state.ending?.settlement;
      if (ending && st) {
        totals.push(st.total);
        grades[st.grade] = (grades[st.grade] ?? 0) + 1;
        if (st.reason === 'early') early++;
        for (const it of st.items) items[it.id] = (items[it.id] ?? 0) + it.points;
      }
    }
    if (ending) {
      const d = [...totals].sort((a, b) => a - b);
      const q = (p: number) => d[Math.min(d.length - 1, Math.floor(p * d.length))] ?? 0;
      const bankrupt = o.games - d.length;
      sum.score = {
        avg: d.reduce((a, x) => a + x, 0) / Math.max(1, d.length),
        p10: q(0.1),
        median: d[Math.floor((d.length - 1) / 2)] ?? 0,
        p90: q(0.9),
        grades: bankrupt ? { ...grades, bankrupt } : grades,
        early: early / o.games,
        items: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v / Math.max(1, d.length)])),
      };
    }
    for (const [n, days] of Object.entries(starDays)) {
      const d = [...days].sort((a, b) => a - b);
      sum.stars.day[Number(n)] = { median: d[Math.floor((d.length - 1) / 2)] ?? 0, games: d.length };
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] ?? 0;
    for (const [id, d] of Object.entries(plotDays)) {
      const x = sum.plots[id];
      if (!x) continue;
      x.openDay = median(d.open);
      x.buildDays = Math.round(median(d.build) * 10) / 10;
    }
    if (careOn) {
      const n = Math.max(1, lv.ok + lv.meh + lv.no);
      sum.care = {
        ok: lv.ok / n,
        meh: lv.meh / n,
        no: lv.no / n,
        walkouts: careSum.walkouts / o.games,
        hand: careSum.hand / o.games,
        orders: careSum.orders / o.games,
      };
    }
    sum.winRate = sum.wins / o.games;
    sum.msPerGame = (performance.now() - t0) / o.games;
    bots.push(sum);
  }
  const cardRate = Object.fromEntries(Object.entries(cardGames).map(([c, n]) => [c, n / total]));
  return {
    act,
    mode: ending ? 'score' : 'win',
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
  // 结局方案 A（W4）：打分代替通关率；以前的方式照旧出通关率
  const scored = r.mode === 'score';
  lines.push(
    `| 机器人 | 局数 | ${scored ? '平均分 | 中位分 | 提前结算' : '通关率'} | 平均天数 | 卡死 | 平均质量 | 平均会员 | 平均声望 | 平均现金 | 平均复原 | 每局耗时 |`,
  );
  lines.push(`| --- | --- | ${scored ? '--- | --- | ---' : '---'} | --- | --- | --- | --- | --- | --- | --- | --- |`);
  const head = (b: BotSummary) =>
    scored
      ? `${Math.round(b.score?.avg ?? 0)} | ${b.score?.median ?? 0} | ${pct(b.score?.early ?? 0)}`
      : pct(b.winRate);
  for (const b of r.bots)
    lines.push(
      `| ${b.bot} | ${b.games} | ${head(b)} | ${b.avgDays.toFixed(1)} | ${b.stuck} | ${b.avg.quality?.toFixed(1)} | ${b.avg.members?.toFixed(1)} | ${b.avg.reputation?.toFixed(1)} | $${Math.round(b.avg.cash ?? 0)} | ${b.avg.restoration?.toFixed(1)}/8 | ${b.msPerGame.toFixed(1)} ms |`,
    );
  if (scored) {
    lines.push('', '## 打分（结局方案 A）', '');
    lines.push('| 机器人 | 10% 分位 | 中位 | 90% 分位 | 评语档 | 分项平均 |', '| --- | --- | --- | --- | --- | --- |');
    for (const b of r.bots) {
      const x = b.score;
      if (!x) continue;
      const g = Object.entries(x.grades)
        .map(([k, v]) => `${k} ${pct(v / b.games)}`)
        .join('，');
      const it = Object.entries(x.items)
        .map(([k, v]) => `${k} ${Math.round(v)}`)
        .join('，');
      lines.push(`| ${b.bot} | ${x.p10} | ${x.median} | ${x.p90} | ${g} | ${it} |`);
    }
  }
  lines.push('', '## 结局分布', '');
  for (const b of r.bots)
    lines.push(
      `- ${b.bot}：${Object.entries(b.endings)
        .sort((a, c) => c[1] - a[1])
        .map(([k, v]) => `${k} ${pct(v / b.games)}`)
        .join('，')}`,
    );
  // 修复变体和星级（LG-14、LG-10）：内容里写了才有这两节
  if (r.bots.some((b) => Object.keys(b.variants).length)) {
    lines.push('', '## 修复变体（局数比例）', '');
    for (const b of r.bots)
      lines.push(
        `- ${b.bot}：${
          Object.entries(b.variants)
            .sort(([a], [c]) => a.localeCompare(c))
            .map(([k, v]) => `${k} ${pct(v / b.games)}`)
            .join('，') || '—'
        }`,
      );
  }
  if (r.bots.some((b) => Object.keys(b.stars.day).length)) {
    lines.push('', '## 星级', '');
    for (const b of r.bots)
      lines.push(
        `- ${b.bot}：平均 ${b.stars.avg.toFixed(2)} 星、${b.stars.trophies.toFixed(2)} 座奖杯；${
          Object.entries(b.stars.day)
            .map(([n, x]) => `★${n} 中位第 ${x.median} 天（${pct(x.games / b.games)} 的局升上来）`)
            .join('，') || '没有升星'
        }`,
      );
  }
  if (r.bots.some((b) => Object.keys(b.plots).length)) {
    lines.push('', '## 地块（W5）', '');
    for (const b of r.bots)
      lines.push(
        `- ${b.bot}：${
          Object.entries(b.plots)
            .sort(([a], [c]) => a.localeCompare(c))
            .map(
              ([id, x]) =>
                `${id} 开工 ${pct(x.started / b.games)}（${Object.entries(x.variants)
                  .map(([v, n]) => `${v} ${pct(n / b.games)}`)
                  .join('、')}），开地 ${pct(x.opened / b.games)}${
                  x.opened ? `，中位第 ${x.openDay} 天、施工 ${x.buildDays} 天` : ''
                }`,
            )
            .join('；') || '—'
        }`,
      );
  }
  if (r.bots.some((b) => b.care)) {
    lines.push('', '## 场地可用度（ADR 0022）', '');
    lines.push('开着的球场在营业时间里各档的时间占比；每局平均走掉的会员、亲手扫的次数、做完的打扫工单。', '');
    lines.push('| 机器人 | 能打 | 勉强 | 不能打 | 走掉的会员 / 局 | 亲手扫 / 局 | 打扫工单 / 局 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const b of r.bots) {
      const c = b.care;
      if (!c) continue;
      lines.push(
        `| ${b.bot} | ${pct(c.ok)} | ${pct(c.meh)} | ${pct(c.no)} | ${c.walkouts.toFixed(1)} | ${c.hand.toFixed(1)} | ${c.orders.toFixed(1)} |`,
      );
    }
  }
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
