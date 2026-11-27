// 一个时钟：整个游戏只有一个"现在几点"——天光（clubsite/daylight 的 total：从第 0 天 0 点起的小时数）。
// 演员表的状态（CastState 的 day / minute：人物卡的时间带、选角、互动的"今天第几次"）跟着它走；
// 反过来，互动花掉的时间（act() 推了 CastState 的分钟）也推到天光上（聊了二十分钟，太阳也走二十分钟）。
// 纯函数；谁来调：分图 clubvista/world.ts 和 clubgame/main.ts 每个模拟步调一次 reconcileClock。
//
// 约定：第 d 天 h 点 = total (d − 1) × 24 + h；演员表的 minute 可以落在营业时间外（夜里人都走了，clubsite/cast/presence.ts）。
import { MOOD_REST } from './state';
import type { CastState, PersonMem } from './types';

/** 演员表的时刻 → 从第 1 天 0 点起的分钟 */
export const absMinute = (s: Pick<CastState, 'day' | 'minute'>) => (s.day - 1) * 1440 + s.minute;

/** 把演员表拨到第 day 天的 minute 分（不跳过夜里）；过了夜：今天说话的次数清零，心情往 60 回落一半（同 tick） */
export function setClock(s: CastState, day: number, minute: number): CastState {
  const m = Math.max(0, Math.min(1439, Math.floor(minute)));
  if (day === s.day && m === s.minute) return s;
  if (day <= s.day) return { ...s, day, minute: m };
  const nights = day - s.day;
  const people: Record<string, PersonMem> = {};
  for (const [id, mem] of Object.entries(s.people)) {
    let mood = mem.mood;
    for (let i = 0; i < Math.min(nights, 8); i++) mood += (MOOD_REST - mood) * 0.5;
    people[id] = { ...mem, talksToday: 0, mood: Math.round(mood) };
  }
  return { ...s, day, minute: m, people };
}

/** 开局对表：天数听存档的；时刻——URL 给了 ?hour= 听天光的，没给听存档的（新开一局 = 早上 8 点） */
export function alignClock(s: CastState, total: number, hourGiven: boolean): { state: CastState; total: number } {
  const hour = hourGiven ? ((total % 24) + 24) % 24 : s.minute / 60;
  const t = (s.day - 1) * 24 + hour;
  return { state: setClock(s, s.day, hour * 60), total: t };
}

/** 互动花时间时，演员表会比天光快出这么多分钟以上才算"它往前跳了" */
const JUMP = 1.5;

/**
 * 每个模拟步对一次表。平时天光是主钟：演员表的 day / minute 抄它的。
 * 演员表自己往前跳了（互动花的分钟、"到第二天"）：天光跟过去。
 */
export function reconcileClock(s: CastState, total: number): { state: CastState; total: number } {
  const dAbs = total * 60;
  const cAbs = absMinute(s);
  if (cAbs > dAbs + JUMP) return { state: s, total: cAbs / 60 };
  const day = Math.floor(total / 24) + 1;
  const minute = dAbs - (day - 1) * 1440;
  return { state: setClock(s, day, minute), total };
}

/** 夜里（关门以后到开门以前）时钟走快几倍：夜里没人，不让玩家干等 */
export const NIGHT_FROM = 22.5;
export const NIGHT_TO = 5.5;
export const NIGHT_RATE = 8;
export const isDeepNight = (hour: number) => hour >= NIGHT_FROM || hour < NIGHT_TO;
