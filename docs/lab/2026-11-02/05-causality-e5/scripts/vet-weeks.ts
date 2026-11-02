import { CONTENT, greedyBot, runGame } from '@td/sim';
import { createText } from './text';
const r = runGame(CONTENT, greedyBot(), Number(process.argv[2] ?? 2));
for (const lang of ['zh', 'en'] as const) {
  const T = createText(CONTENT, lang);
  for (const e of r.state.log.filter((x) => x.cause.kind === 'week' && x.cause.week >= 7 && x.cause.week <= 10))
    console.log(`${T.because(e)} → ${T.so(e)}`);
}
console.log(r.outcome, r.days);
