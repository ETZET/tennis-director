// 找周结算里会员大跌的局：看那天的天气和场地数
import { CONTENT, advance, facilityTotals, greedyBot, newGame, worldOf } from '@td/sim';
let found = 0;
for (let seed = 1; seed <= 40 && found < 8; seed++) {
  const s = newGame(CONTENT, { seed });
  const bot = greedyBot();
  const w = worldOf(s, CONTENT);
  let pre: { weather: string; members: number; courts: number; dry: number } | null = null;
  while (!s.outcome && s.t < 120 * 1440) {
    const before = s.log.length;
    const m = s.t % 1440;
    if (m >= 19 * 60 + 55) {
      const rain = s.weather;
      const f = facilityTotals(s, w);
      s.weather = 'sun';
      const dry = facilityTotals(s, w).courts;
      s.weather = rain;
      pre = { weather: rain, members: s.stats.members ?? 0, courts: f.courts, dry };
    }
    advance(s, CONTENT, bot.decide(s, CONTENT), 5);
    for (const e of s.log.slice(before)) {
      if (e.cause.kind !== 'day') continue;
      const md = e.effects.find((x) => x.kind === 'stat' && x.stat === 'members') as { delta: number } | undefined;
      if (md && md.delta <= -20) {
        found++;
        console.log(`seed ${seed} day ${e.cause.day} members ${pre?.members}→${(pre?.members ?? 0) + md.delta} weather=${pre?.weather} courts_open=${pre?.courts} (dry ${pre?.dry})`);
      }
    }
  }
}
