import { advance, CONTENT, newGame } from '@td/sim';
import { botFor } from '../src/sweep';

const [spec = 'average', n = '50'] = process.argv.slice(2);
const byFac: Record<string, number> = {};
const byWeek: Record<number, number> = {};
const byFrom: Record<string, number> = {};
let reopenDelay = 0,
  reopenN = 0,
  never = 0;
for (let seed = 1; seed <= Number(n); seed++) {
  const b = botFor(spec, seed);
  const s = newGame(CONTENT, { seed });
  const pending = new Map<string, number>();
  while (!s.outcome && s.t < 117 * 1440) {
    const r = advance(s, CONTENT, b.decide(s, CONTENT), 5);
    for (const e of r.events as any[]) {
      if (e.type === 'facilityWorn') {
        byFac[e.facility] = (byFac[e.facility] ?? 0) + 1;
        const wk = Math.ceil(Math.floor(s.t / 1440) / 7);
        byWeek[wk] = (byWeek[wk] ?? 0) + 1;
        byFrom[`${e.facility}.${e.from}`] = (byFrom[`${e.facility}.${e.from}`] ?? 0) + 1;
        if (e.to === 'worn') pending.set(e.facility, s.t);
      }
      if (e.type === 'orderFinished' && /_reopen$/.test(e.order)) {
        const f = Object.keys(s.facilities).find((x) =>
          e.order.startsWith(
            (
              {
                outer_1: 'o1',
                outer_23: 'o23',
                practice: 'pr',
                clubhouse: 'ch',
                plaza: 'pz',
                stadium_3: 'st3',
                stadium_2: 'st2',
                stadium_1: 'st1',
              } as any
            )[x] + '_',
          ),
        );
        const t0 = f ? pending.get(f) : undefined;
        if (t0 !== undefined) {
          reopenDelay += (s.t - t0) / 1440;
          reopenN++;
          pending.delete(f!);
        }
      }
    }
  }
  never += pending.size;
}
console.log(spec, {
  byFac,
  byFrom,
  byWeek,
  avgDaysClosed: reopenDelay / Math.max(1, reopenN),
  reopened: reopenN,
  neverReopened: never,
});
