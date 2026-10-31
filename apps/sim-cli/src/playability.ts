import {
  advance,
  type Bot,
  type Card,
  type ContentBundle,
  cautiousBot,
  greedyBot,
  newGame,
  type OptionKey,
  randomBot,
  walkerBot,
  worldFor,
} from '@td/sim';

/**
 * 可玩性指标（玩法评审循环用）。和平衡报告互补：不看谁赢，看玩的过程。
 *
 * - 节奏：1× 下每隔多少秒真实时间有一个决定；营业时间里连续多久一张卡都没有；同时最多开几张。
 * - 取舍：每张卡各选项被选的比例（按机器人）；静态分析出的"被压制"选项。
 * - 后果：同一种子不同打法，见过的卡有多不同；结局分布。
 */

const SECONDS_PER_MINUTE = 1 / 4; // 1× 每秒 4 游戏分钟
const BOTS: Record<string, (seed: number) => Bot> = {
  greedy: () => greedyBot(),
  random: (seed) => randomBot(seed * 7919),
  cautious: () => cautiousBot(),
  walker: () => walkerBot(),
};

export interface GameTrace {
  bot: string;
  seed: number;
  ending: string | null;
  decisions: number;
  defaults: number;
  openMinutes: number;
  /** 营业时间里连续没有开着的卡的最长分钟数 */
  maxIdle: number;
  /** 空档超过 6 游戏分钟（1× 下约 90 秒）的次数 */
  longIdles: number;
  maxOpen: number;
  cardsSeen: string[];
  picks: { card: string; option: OptionKey | null; by: 'player' | 'default' }[];
}

export function traceGame(content: ContentBundle, botName: string, seed: number): GameTrace {
  const bot = (BOTS[botName] ?? BOTS.greedy)?.(seed) as Bot;
  const s = newGame(content, { seed });
  const tr: GameTrace = {
    bot: botName,
    seed,
    ending: null,
    decisions: 0,
    defaults: 0,
    openMinutes: 0,
    maxIdle: 0,
    longIdles: 0,
    maxOpen: 0,
    cardsSeen: [],
    picks: [],
  };
  let idle = 0;
  const flushIdle = () => {
    if (idle > tr.maxIdle) tr.maxIdle = idle;
    if (idle * SECONDS_PER_MINUTE > 90) tr.longIdles++;
    idle = 0;
  };
  const limit = 30 * 1440;
  let k = 0;
  while (!s.outcome && s.t < limit) {
    const cmds = k++ % 5 === 0 ? bot.decide(s, content) : [];
    const t0 = s.t;
    const r = advance(s, content, cmds, 1);
    for (const e of r.events) {
      if (e.type === 'cardOpened' && !tr.cardsSeen.includes(e.card)) tr.cardsSeen.push(e.card);
      if (e.type === 'cardResolved') {
        tr.picks.push({ card: e.card, option: e.option, by: e.by });
        if (e.by === 'player') tr.decisions++;
        else tr.defaults++;
      }
    }
    tr.maxOpen = Math.max(tr.maxOpen, s.cards.open.length);
    if (s.t - t0 > 1)
      flushIdle(); // 夜里跳过：空档不跨天
    else {
      tr.openMinutes++;
      if (s.cards.open.length === 0) idle++;
      else flushIdle();
    }
  }
  flushIdle();
  tr.ending = s.outcome?.ending ?? null;
  return tr;
}

/** 静态分析：某个选项在所有看得见的维度上都不比另一个好，而且自己没有独有的后续（安排卡、标记、设施、人事……） */
export function dominatedOptions(content: ContentBundle): { card: string; option: OptionKey; by: OptionKey }[] {
  const out: { card: string; option: OptionKey; by: OptionKey }[] = [];
  const better = (stat: string) => (stat === 'pickleball_pressure' ? -1 : 1);
  for (const c of content.cards) {
    const sum = (k: OptionKey) => {
      const o = c.options[k];
      if (!o) return null;
      const v: Record<string, number> = { cash: -(o.cost ?? 0) };
      let story = !!o.check || !!o.requires;
      for (const e of [...o.effects, ...o.onSuccess, ...o.onFail]) {
        if ('stat' in e && 'add' in e && typeof e.add === 'number')
          v[e.stat] = (v[e.stat] ?? 0) + e.add * better(e.stat) * (typeof e.chance === 'number' ? e.chance : 1);
        else if (!('log' in e)) story = true;
      }
      return { v, walk: !!o.requiresDirectorAt, story };
    };
    const keys = (['A', 'B', 'C'] as const).filter((k) => c.options[k]);
    for (const a of keys)
      for (const b of keys) {
        if (a === b) continue;
        const x = sum(a);
        const y = sum(b);
        if (!x || !y || x.story) continue;
        if (y.walk && !x.walk) continue;
        const stats = new Set([...Object.keys(x.v), ...Object.keys(y.v)]);
        let ge = true;
        let gt = false;
        for (const st of stats) {
          const dx = x.v[st] ?? 0;
          const dy = y.v[st] ?? 0;
          if (dy < dx) ge = false;
          if (dy > dx) gt = true;
        }
        if (ge && gt && !out.some((d) => d.card === c.id && d.option === a)) out.push({ card: c.id, option: a, by: b });
      }
  }
  return out;
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function playabilityReport(content: ContentBundle, games: number): string {
  const lines: string[] = [];
  const bots = Object.keys(BOTS);
  const traces: Record<string, GameTrace[]> = {};
  for (const b of bots) traces[b] = Array.from({ length: games }, (_, i) => traceGame(content, b, i + 1));
  lines.push(`# 可玩性指标 · 内容 ${content.version} · 每种打法 ${games} 局`, '');
  lines.push('## 节奏（1× 速度换算成真实时间）', '');
  lines.push('| 打法 | 每局决定数 | 默认处理 | 平均几秒一个决定 | 最长空档 | 超过 90 秒的空档/局 | 同时最多开着 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const b of bots) {
    const t = traces[b] ?? [];
    const dec = avg(t.map((x) => x.decisions));
    const secs = avg(t.map((x) => (x.openMinutes * SECONDS_PER_MINUTE) / Math.max(1, x.decisions + x.defaults)));
    lines.push(
      `| ${b} | ${dec.toFixed(1)} | ${avg(t.map((x) => x.defaults)).toFixed(1)} | ${secs.toFixed(0)} s | ${Math.round(
        avg(t.map((x) => x.maxIdle)) * SECONDS_PER_MINUTE,
      )} s | ${avg(t.map((x) => x.longIdles)).toFixed(1)} | ${Math.max(...t.map((x) => x.maxOpen))} |`,
    );
  }
  lines.push('', '## 结局', '');
  for (const b of bots) {
    const n: Record<string, number> = {};
    for (const x of traces[b] ?? []) n[x.ending ?? '(none)'] = (n[x.ending ?? '(none)'] ?? 0) + 1;
    lines.push(
      `- ${b}：${Object.entries(n)
        .sort((a, c) => c[1] - a[1])
        .map(([e, k]) => `${e} ${pct(k / games)}`)
        .join('，')}`,
    );
  }
  lines.push('', '## 后果分叉：同一种子、不同打法见过的卡有多不同（Jaccard 距离，0 = 完全一样）', '');
  for (let i = 0; i < bots.length; i++)
    for (let j = i + 1; j < bots.length; j++) {
      const A = traces[bots[i] as string] ?? [];
      const B = traces[bots[j] as string] ?? [];
      const d = avg(
        A.map((a, k) => {
          const x = new Set(a.cardsSeen);
          const y = new Set(B[k]?.cardsSeen ?? []);
          const inter = [...x].filter((c) => y.has(c)).length;
          const uni = new Set([...x, ...y]).size || 1;
          return 1 - inter / uni;
        }),
      );
      lines.push(`- ${bots[i]} vs ${bots[j]}：${d.toFixed(2)}`);
    }
  lines.push('', '## 取舍：各打法在每张卡上选了什么（玩家主动选的）', '');
  const w = worldFor(content, content.acts[0]?.id ?? '');
  lines.push(`| 卡 | ${bots.join(' | ')} |`, `| --- |${bots.map(() => ' --- |').join('')}`);
  for (const c of [...w.cards.values()] as Card[]) {
    const cells = bots.map((b) => {
      const n: Record<string, number> = {};
      let tot = 0;
      for (const x of traces[b] ?? [])
        for (const p of x.picks)
          if (p.card === c.id && p.by === 'player' && p.option) {
            n[p.option] = (n[p.option] ?? 0) + 1;
            tot++;
          }
      return tot
        ? Object.entries(n)
            .sort()
            .map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}%`)
            .join(' ')
        : '—';
    });
    lines.push(`| ${c.id} | ${cells.join(' | ')} |`);
  }
  const dom = dominatedOptions(content);
  lines.push('', `## 被压制的选项（${dom.length}）`, '');
  lines.push(dom.length ? dom.map((d) => `- ${d.card}：${d.option} 不如 ${d.by}`).join('\n') : '没有。');
  return lines.join('\n');
}
