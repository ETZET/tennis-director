import { advance, CONTENT, humanBot, humanProfile, newGame } from '@td/sim';

let hits = 0,
  sundays = 0,
  lost = 0,
  crashes = 0;
for (let seed = 1; seed <= 100; seed++) {
  const bot = humanBot(seed, humanProfile(0.5), 'average');
  const s = newGame(CONTENT, { seed });
  let wx = s.weather;
  while (!s.outcome && s.t < 113 * 1440) {
    const before = s.stats.members ?? 0;
    const r = advance(s, CONTENT, bot.decide(s, CONTENT), 1);
    for (const e of r.events) {
      if (e.type === 'dayEnded' && e.day % 7 === 0) {
        sundays++;
        const d = (s.stats.members ?? 0) - before;
        if (wx === 'rain') {
          hits++;
          if (d < 0) {
            lost += -d;
            crashes++;
            if (crashes <= 5) console.log('seed', seed, 'day', e.day, before, '->', s.stats.members);
          }
        }
      }
      if (e.type === 'weather') wx = e.weather;
    }
  }
}
console.log({ sundays, rainySundays: hits, crashes, membersLost: lost });
