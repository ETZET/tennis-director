/**
 * E4 衰减实验：跑一格机器人，输出一行 JSON 汇总。
 *   npx tsx apps/sim-cli/lab/decaylab.ts <bot> <games> [noupkeep] [seed0]
 * bot: greedy | cautious | idle | random | novice | average | good | human:<skill>
 * noupkeep：把机器人发出的"去维护岗位 / 清理工单 / 重开工单"的指派全部丢掉（消融：维护到底值不值）。
 */
import { advance, CONTENT as BASE, type Bot, type ContentBundle, newGame, worldFor } from '@td/sim';
import { botFor } from '../src/sweep';

const [spec = 'average', gamesS = '100', mode = '', seed0S = '1'] = process.argv.slice(2);
const games = Number(gamesS);
// 变体：DROP=<阈值> 改掉档阈值（0 = 不掉档）；VARIANT=income 岗位现金收入按状况打折（方案 B 的近似）
const CONTENT: ContentBundle = structuredClone(BASE);
if (process.env.DROP !== undefined)
  (CONTENT.acts[0] as { rules: { grade_drop_below: number } }).rules.grade_drop_below = Number(process.env.DROP);
if (process.env.VARIANT === 'income')
  for (const p of CONTENT.posts) {
    const f = CONTENT.facilities.find((x) => x.anchor === p.at)?.id;
    if (!f) continue;
    for (const e of p.effects)
      if ('stat' in e && e.stat === 'cash' && 'add' in e)
        (e as { add: string | number }).add = `round((${e.add}) * clamp(0.25 + condition.${f} / 80, 0.25, 1))`;
  }
if (process.env.VARIANT === 'cheap') for (const o of CONTENT.orders) if (/_(reopen|refinish)$/.test(o.id)) o.cost = Math.round(o.cost / 2);
(CONTENT as { version: string }).version += `+${process.env.DROP ?? ''}${process.env.VARIANT ?? ''}`;
const seed0 = Number(seed0S);
const noUpkeep = mode === 'noupkeep' || mode === 'nomaint';
const w0 = worldFor(CONTENT, CONTENT.acts[0]!.id, 'steady');
const maint = new Set<string>();
for (const p of w0.posts.values()) if (p.restore) maint.add(p.id);
for (const o of w0.orders.values()) if (/_(tidy|fix)$/.test(o.id)) maint.add(o.id);
if (mode === 'nomaint') for (const o of w0.orders.values()) if (/_(reopen|refinish)$/.test(o.id)) maint.add(o.id);

const wrap = (b: Bot): Bot =>
  noUpkeep
    ? {
        name: b.name,
        decide: (s, c) => b.decide(s, c).filter((x) => !(x.type === 'assign' && x.target && maint.has(x.target))),
      }
    : b;

const USABLE: Record<string, string[]> = {
  outer_1: ['playable', 'resurfaced'],
  outer_23: ['playable'],
  practice: ['open'],
  clubhouse: ['open'],
  plaza: ['open'],
  stadium_3: ['open'],
  stadium_2: ['open'],
  stadium_1: ['restored'],
};
const rows: Record<string, number | string | boolean>[] = [];
for (let i = 0; i < games; i++) {
  const seed = seed0 + i;
  const bot = wrap(botFor(spec, seed));
  const s = newGame(CONTENT, { seed });
  const w = worldFor(CONTENT, s.act, s.directorConfig);
  let upkeepCycles = 0,
    tidies = 0,
    reopens = 0,
    drops = 0,
    lowDays = 0,
    usableDays = 0,
    zeroDays = 0;
  let incomeCycles = 0;
  while (!s.outcome && s.t < 117 * 1440) {
    const r = advance(s, CONTENT, bot.decide(s, CONTENT), 5);
    for (const e of r.events) {
      if (e.type === 'postCycle') {
        if (w.posts.get(e.post)?.restore) upkeepCycles++;
        else incomeCycles++;
      }
      if (e.type === 'orderFinished') {
        if (/_(reopen|refinish)$/.test(e.order)) reopens++;
        else if (maint.has(e.order)) tidies++;
      }
      if ((e as { type: string }).type === 'facilityWorn') drops++;
      if (e.type === 'dayEnded') {
        for (const [f, st] of Object.entries(s.facilities)) {
          const dd = w.facilities.get(f)?.states[st]?.decay_day ?? 0;
          if (!dd) continue;
          usableDays++;
          const c = s.condition[f] ?? 100;
          if (c < 30) lowDays++;
          if (c <= 0) zeroDays++;
        }
      }
    }
  }
  const done = Object.entries(USABLE).filter(([f, sts]) => sts.includes(s.facilities[f] ?? '')).length;
  rows.push({
    seed,
    won: s.outcome?.result === 'won',
    ending: s.outcome?.ending ?? '(none)',
    days: Math.floor(s.t / 1440) + 1,
    upkeepCycles,
    tidies,
    reopens,
    drops,
    lowShare: usableDays ? lowDays / usableDays : 0,
    zeroShare: usableDays ? zeroDays / usableDays : 0,
    incomeCycles,
    done,
    members: s.stats.members ?? 0,
    quality: s.stats.quality ?? 0,
    rep: s.stats.reputation ?? 0,
    cash: s.stats.cash ?? 0,
  });
}
const avg = (k: string) => rows.reduce((a, r) => a + Number(r[k]), 0) / rows.length;
const endings: Record<string, number> = {};
for (const r of rows) endings[r.ending as string] = (endings[r.ending as string] ?? 0) + 1;
console.log(
  JSON.stringify({
    bot: spec,
    mode: mode || 'normal',
    games,
    winRate: rows.filter((r) => r.won).length / games,
    winDays:
      rows.filter((r) => r.won).reduce((a, r) => a + Number(r.days), 0) / Math.max(1, rows.filter((r) => r.won).length),
    endings,
    upkeepCycles: avg('upkeepCycles'),
    tidies: avg('tidies'),
    reopens: avg('reopens'),
    drops: avg('drops'),
    lowShare: avg('lowShare'),
    zeroShare: avg('zeroShare'),
    incomeCycles: avg('incomeCycles'),
    done: avg('done'),
    members: avg('members'),
    quality: avg('quality'),
    rep: avg('rep'),
    cash: avg('cash'),
  }),
);
