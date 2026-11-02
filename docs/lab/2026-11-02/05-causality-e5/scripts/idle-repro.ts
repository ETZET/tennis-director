// 放置对照：种子 37，开局派两个人扫沙，之后不再操作（卡按默认过期）
import { CONTENT, advance, newGame } from '@td/sim';
const s = newGame(CONTENT, { seed: 37 });
advance(s, CONTENT, [
  { type: 'assign', person: 'director', target: 'o1_sweep' },
  { type: 'assign', person: 'dale', target: 'o1_sweep' },
], 0);
const days = Number(process.argv[2] ?? 35);
const rows: string[] = [];
let lastDay = 0;
const logs: string[] = [];
while (Math.floor(s.t / 1440) + 1 <= days && !s.outcome) {
  const r = advance(s, CONTENT, [], 60);
  for (const e of r.events) {
    if (e.type === 'log' && e.entry.cause.kind !== 'start') logs.push(`d${Math.floor(e.entry.t/1440)+1} ${JSON.stringify(e.entry.cause)} ${JSON.stringify(e.entry.effects.filter(x=>x.kind!=='flag'))}`);
    if (e.type === 'weekSettled') logs.push(`  weekSettled rate=${e.serviceRate}`);
  }
  const d = Math.floor(s.t / 1440) + 1;
  if (d !== lastDay) {
    lastDay = d;
    rows.push(`day ${d} cash ${Math.round(s.stats.cash!)} rep ${s.stats.reputation!.toFixed(2)} q ${s.stats.quality!.toFixed(2)} members ${s.stats.members} svc ${s.stats.service} week ${JSON.stringify(s.week)} fac ${JSON.stringify(s.facilities.outer_1)}`);
  }
}
console.log(rows.join('\n'));
if (process.argv[3] === 'log') console.log(logs.join('\n'));
