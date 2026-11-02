import { writeFileSync } from 'node:fs';
import { CONTENT, SIM_VERSION } from '@td/sim';
import { playabilityReport } from './playability';
import { BOT_NAMES, type BotName, botReport, determinismCheck, reportMarkdown } from './report';
import { runCell, type Variant } from './sweep';

/**
 * 命令行无头跑局。只依赖 @td/sim 和 @td/shared，不碰 three.js 或 DOM。
 *
 *   pnpm sim determinism [--games 1000]        # M1 闸口：同种子重放结果一致
 *   pnpm sim playability [--games 200] [--out playability.md]   # 节奏、取舍、后果分叉
 *   pnpm sim bots [--games 1000] [--bots greedy,random] [--director steady] [--out report.md]
 */

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

export function main(): number {
  const cmd = process.argv[2] ?? 'help';
  if (cmd === 'determinism') {
    const games = Number(arg('games', '1000'));
    const t0 = performance.now();
    const r = determinismCheck(CONTENT, games);
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    if (r.mismatches.length) {
      console.error(`确定性检查失败：${r.mismatches.length} / ${games} 局不一致`);
      for (const m of r.mismatches.slice(0, 10)) console.error(`  seed ${m.seed}: ${m.why}`);
      return 1;
    }
    console.log(`确定性检查通过：${games} 局，每局重放一次、重跑一次，状态哈希全部一致（${secs}s）`);
    return 0;
  }
  if (cmd === 'bots') {
    const games = Number(arg('games', '1000'));
    const bots = arg('bots', 'greedy,random,cautious,idle')
      .split(',')
      .filter((b): b is BotName => (BOT_NAMES as string[]).includes(b));
    const director = arg('director', '');
    const r = botReport(CONTENT, { games, bots, ...(director ? { director } : {}) });
    const md = reportMarkdown(r);
    const out = arg('out', '');
    if (out) {
      writeFileSync(out, `${md}\n`);
      writeFileSync(out.replace(/\.md$/, '.json'), `${JSON.stringify(r, null, 1)}\n`);
      console.log(`报告已写入 ${out}`);
    }
    console.log(md);
    return 0;
  }
  if (cmd === 'sweep') {
    // 一格：pnpm sim sweep --bot average --games 100 --weeks 16 [--cash 3000] [--decay 1] [--work 1] [--costs 1] [--rep 50]
    // 输出一行 JSON（变体、机器人、每局结果），给扫参脚本汇总
    const v: Variant = {};
    for (const k of ['weeks', 'investor', 'cash', 'decay', 'work', 'costs', 'rep'] as const) {
      const x = arg(k, '');
      if (x) v[k] = Number(x);
    }
    const bot = arg('bot', 'average');
    const rows = runCell(CONTENT, v, bot, Number(arg('games', '100')), Number(arg('seed0', '1')));
    console.log(JSON.stringify({ variant: v, bot, rows }));
    return 0;
  }
  if (cmd === 'playability') {
    const md = playabilityReport(CONTENT, Number(arg('games', '200')));
    const out = arg('out', '');
    if (out) writeFileSync(out, `${md}\n`);
    console.log(md);
    return 0;
  }
  console.log(`sim-cli · 模拟核心 v${SIM_VERSION} · 内容 ${CONTENT.version}
  pnpm sim determinism [--games 1000]
  pnpm sim bots [--games 1000] [--bots greedy,random] [--director steady|dramatic|random] [--out report.md]`);
  return 0;
}

process.exitCode = main();
