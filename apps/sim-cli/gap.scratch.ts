import { tournamentStatus, worldFor, advance, CONTENT, greedyBot, humanBot, humanProfile, HUMAN_TIERS, newGame } from '@td/sim';
const N = Number(process.argv[2] ?? 30);
const out: Record<string, number[]> = {};
const weekCover: Record<string, number> = {};
const cards: Record<string, number[]> = {};
const tc: Record<string, Record<string, number>> = {};
const el: Record<string, Record<string, number>> = {};
const gE: Record<string, number[]> = {};
const cc: Record<string, Record<string, number>> = {};
for (const name of ['greedy', 'good', 'average', 'novice']) {
  out[name] = []; cards[name] = []; tc[name] = {}; cc[name] = {}; el[name] = {}; gE[name] = [];
  let covered = 0;
  for (let seed = 1; seed <= N; seed++) {
    const bot = name === 'greedy' ? greedyBot() : humanBot(seed, humanProfile(HUMAN_TIERS[name as 'good']), name);
    const s = newGame(CONTENT, { seed });
    const beats: number[] = [];
    const weeks = new Set<number>();
    let k = 0; let nc = 0; const w = worldFor(CONTENT, s.act); const eb: number[] = []; const seen = new Set<string>();
    while (!s.outcome && s.t < 113 * 1440) {
      const cmds = k++ % 5 === 0 ? bot.decide(s, CONTENT) : [];
      const r = advance(s, CONTENT, cmds, 1);
      for (const t of tournamentStatus(s, w)) { if (s.t >= t.start && s.t < t.end && !seen.has(t.id + t.start)) { seen.add(t.id + t.start); const key = t.id + (t.eligible ? ':elig' : ':no'); el[name]![key] = (el[name]![key] ?? 0) + 1; if (t.eligible || t.entered) eb.push(s.t); } }
      for (const e of r.events) {
        if (e.type === 'cardOpened') { beats.push(s.t); nc++; cc[name]![e.card] = (cc[name]![e.card] ?? 0) + 1; }
        if (e.type === 'tournament_done' || e.type === 'tournament_spoiled') { const key = e.tournament + '@w' + (Math.floor(s.t / 1440 / 7) + 1) + (e.type === 'tournament_spoiled' ? '(rain)' : ''); tc[name]![key] = (tc[name]![key] ?? 0) + 1; }
        if (e.type === 'tournament_live' || e.type === 'tournament_done' || e.type === 'tournament_spoiled' || e.type === 'tournament_entered') { beats.push(s.t); weeks.add(Math.floor(s.t / 1440 / 7) + 1); }
      }
    }
    const from = 51 * 1440, to = Math.min(s.t, 84 * 1440);
    const xs = [from, ...beats.filter((x) => x > from && x < to), to];
    let g = 0; for (let i = 1; i < xs.length; i++) g = Math.max(g, (xs[i]! - xs[i - 1]!) / 1440);
    const ys = [from, ...[...beats, ...eb].sort((a, b) => a - b).filter((x) => x > from && x < to), to];
    let g2 = 0; let at = 0; for (let i = 1; i < ys.length; i++) { const d = (ys[i]! - ys[i - 1]!) / 1440; if (d > g2) { g2 = d; at = ys[i - 1]! / 1440; } }
    if (name === 'average') console.log('avg seed', seed, 'gap', g2.toFixed(1), 'from day', at.toFixed(1));
    gE[name]!.push(g2);
    out[name].push(g); cards[name].push(nc);
    let ok = true; for (let w = 7; w <= 13; w++) if (!weeks.has(w) && s.t > w * 7 * 1440) ok = false;
    if (ok) covered++;
  }
  weekCover[name] = covered / N;
}
for (const n of Object.keys(out)) {
  const g = out[n]!.sort((a, b) => a - b);
  console.log(n, 'gap52-84 median', g[Math.floor(g.length / 2)]?.toFixed(1), 'max', g[g.length - 1]?.toFixed(1), 'avg cards', (cards[n]!.reduce((a, b) => a + b, 0) / N).toFixed(1), 'wk7-13 tournament every week', weekCover[n]);
}

console.log(JSON.stringify(tc, null, 0));
console.log(JSON.stringify(cc.average));
console.log(JSON.stringify(el));
for (const n of Object.keys(gE)) { const g = gE[n]!.sort((a, b) => a - b); console.log(n, 'gap incl. eligible', g[Math.floor(g.length / 2)]?.toFixed(1), 'max', g[g.length - 1]?.toFixed(1)); }
