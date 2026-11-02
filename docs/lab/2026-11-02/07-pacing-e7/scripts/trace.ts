import { CONTENT, newGame, advance, greedyBot, cautiousBot } from '@td/sim';
for (const kind of ['idle_once', 'greedy', 'cautious']) {
  const s = newGame(CONTENT, { seed: 37 });
  const bot = kind === 'greedy' ? greedyBot() : kind === 'cautious' ? cautiousBot() : null;
  let first = true;
  const log: string[] = [];
  while (!s.outcome && s.t < 120 * 1440) {
    let cmds: any[] = [];
    if (bot) cmds = bot.decide(s, CONTENT);
    else if (first) { cmds = [{ type: 'assign', person: 'director', target: 'o1_sweep' }, { type: 'assign', person: 'dale', target: 'o1_sweep' }]; first = false; }
    const r = advance(s, CONTENT, cmds, 5);
    for (const e of r.events) if (e.type === 'cardOpened') log.push(`d${Math.floor(s.t / 1440) + 1} ${e.card}`);
    for (const e of r.events) if (e.type === 'cardResolved') log.push(`   -> ${e.card} ${e.option} ${e.by}`);
  }
  console.log(kind, s.outcome?.ending, 'day', Math.floor(s.t / 1440) + 1, 'restored', s.stats.restoration, 'cash', Math.round(s.stats.cash));
  console.log(log.filter((x) => !x.startsWith('   ')).join(' | '));
}
