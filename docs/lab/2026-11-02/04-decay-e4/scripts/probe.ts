import {
  advance,
  CONTENT,
  facilityTotals,
  greedyBot,
  HUMAN_TIERS,
  humanBot,
  humanProfile,
  idleBot,
  newGame,
  num,
  worldFor,
} from '@td/sim';

const [botName = 'average', seedS = '23'] = process.argv.slice(2);
const seed = Number(seedS);
const bot =
  botName === 'greedy'
    ? greedyBot()
    : botName === 'idle'
      ? idleBot()
      : humanBot(seed, humanProfile((HUMAN_TIERS as any)[botName]), botName);
const s = newGame(CONTENT, { seed });
const w = worldFor(CONTENT, s.act, s.directorConfig);
let day = 0;
const upkeepCycles: Record<string, number> = {};
while (!s.outcome && s.t < 117 * 1440) {
  const r = advance(s, CONTENT, bot.decide(s, CONTENT), 5);
  for (const e of r.events)
    if (e.type === 'postCycle' && w.posts.get(e.post)?.restore) upkeepCycles[e.post] = (upkeepCycles[e.post] ?? 0) + 1;
  const d = Math.floor(s.t / 1440) + 1;
  if (d !== day) {
    day = d;
    if (d % 7 === 1 || s.outcome) {
      const f = facilityTotals(s, w);
      const cond = Object.entries(s.facilities)
        .map(([id, st]) => `${id.slice(0, 6)}:${st.slice(0, 4)}:${Math.round(s.condition[id] ?? 0)}`)
        .join(' ');
      console.log(
        `d${d} q=${Math.round(s.stats.quality!)} tgt=${Math.round(num(s, w, w.act.rules.quality_target))} fq=${f.quality} m=${s.stats.members} rep=${Math.round(s.stats.reputation!)} $${Math.round(s.stats.cash!)} | ${cond}`,
      );
    }
  }
}
console.log(s.outcome, JSON.stringify(upkeepCycles), JSON.stringify(s.orderLog.done));
