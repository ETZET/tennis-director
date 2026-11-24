// 引擎跑一整天，打印报告：每小时在场人数（带条形图）、各地点用了多少、排队、放弃、抽样的人的一天、不变式。
// pnpm simday [--day N] [--seed S] [--director desk|none] [--people id1,id2] [--json] [--rain] [--wind] [--high 40]
import { CAST } from '../../../../apps/sandbox/src/clubsite/cast/index';
import { buildReport, defaultWeather, formatReport, PLACES, POST_OF_SLOT, runDay } from '../../../../apps/sandbox/src/clubsite/sim/index';
import type { SimConfig, Weather } from '../../../../apps/sandbox/src/clubsite/sim/types';

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k: string) => args.includes(`--${k}`);

const day = Number(opt('day') ?? 1);
const seed = Number(opt('seed') ?? 1);
const director = (opt('director') ?? 'desk') === 'none' ? null : 'desk.counter';
const people = opt('people')?.split(',').filter(Boolean);

const cfg: SimConfig = { seed, places: PLACES, cast: CAST, posts: POST_OF_SLOT };
const w0 = defaultWeather(seed, day);
const weather: Weather = {
  high: opt('high') ? Number(opt('high')) : w0.high,
  rain: flag('rain') || (w0.rain && !flag('dry')),
  wind: flag('wind') || (w0.wind && !flag('dry')),
};
const run = runDay(cfg, day, { weather, director });
const rep = buildReport(run, { people });
if (flag('json')) console.log(JSON.stringify(rep, null, 2));
else console.log(formatReport(rep, { samples: people?.length ?? 10 }));
