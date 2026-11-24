// 俱乐部的一天（人物模拟）的入口：契约、引擎、日程、报告、地点表。纯数据 + 纯函数（pnpm check:deps 的 clubsim-is-pure）。
// 画面（clubwalk/sim）从这里拿：engine.startDay / step / view、personOf（模拟生成的客人也能换装）、PLACES、POST_OF_SLOT。
export * from './engine';
export { PLACE_BY_ID, PLACES, POST_OF_SLOT } from './places';
export {
  type Calendar,
  CLOSE,
  calendar,
  DAY_END,
  DAY_START,
  defaultWeather,
  H,
  heatAt,
  hm,
  OPEN,
  outdoorPenalty,
  SEASON_ZH,
  type Season,
  tempAt,
  WEEKDAY_ZH,
} from './plan';
export {
  buildReport,
  checkState,
  type DayReport,
  type DayRun,
  formatReport,
  personDay,
  type RunOptions,
  runDay,
} from './report';
export * from './types';
