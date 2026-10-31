import { writeFileSync } from 'node:fs';
import { CONTENT, SIM_VERSION } from '@td/sim';
import { BOT_NAMES, type BotName, botReport, determinismCheck, reportMarkdown } from './report';

/**
 * 命令行无头跑局。只依赖 @td/sim 和 @td/shared，不碰 three.js 或 DOM。
 *
 *   pnpm sim determinism [--games 1000]        # M1 闸口：同种子重放结果一致
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
    const bots = arg('bots', BOT_NAMES.join(','))
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
  console.log(`sim-cli · 模拟核心 v${SIM_VERSION} · 内容 ${CONTENT.version}
  pnpm sim determinism [--games 1000]
  pnpm sim bots [--games 1000] [--bots greedy,random] [--director steady|dramatic|random] [--out report.md]`);
  return 0;
}

process.exitCode = main();
