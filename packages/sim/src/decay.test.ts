import { CONTENT } from '@td/content';
import { describe, expect, it } from 'vitest';
import { advance, newGame } from './game';
import { dayOf, type GameState, minuteOfDay } from './state';
import { worldFor } from './world';

/**
 * 准则 6"有人守的地方维持住"（W2 复验 P1）：会员场有人看场、上课但没人维护，四周掉得慢（每天 ≤ ~1.2），
 * 有人维护就稳住；没人管的照 decay_day 掉。
 */
const quiet = (s: GameState): GameState => {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};
const assign = (person: string, target: string | null) => ({ type: 'assign' as const, person, target });

/** 会员场能打、状况 90，跑 28 天；每天 8 点前把人派到 jobs 上（早上看场，15 点 Dale 换去上课） */
function run(jobs: { rental?: string; lesson?: string; upkeep?: string }): number[] {
  const s = quiet(newGame(CONTENT, { seed: 2 }));
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 90;
  (s.people.dale as { at: string }).at = 'outer_1';
  (s.people.director as { at: string }).at = 'outer_1';
  const daily: number[] = [];
  const start = dayOf(s.t);
  while (dayOf(s.t) < start + 28) {
    const d = dayOf(s.t);
    const m = minuteOfDay(s.t);
    const cmds = [];
    if (m === 8 * 60) {
      if (jobs.rental) cmds.push(assign(jobs.rental, 'o1_rental'));
      if (jobs.upkeep) cmds.push(assign(jobs.upkeep, 'o1_upkeep'));
    }
    if (m === 15 * 60 && jobs.lesson) cmds.push(assign(jobs.lesson, 'o1_lesson'));
    if (m === 19 * 60 && jobs.lesson && jobs.lesson !== jobs.upkeep) cmds.push(assign(jobs.lesson, null));
    advance(s, CONTENT, cmds, 1);
    if (dayOf(s.t) !== d) daily.push(s.condition.outer_1 ?? 0);
  }
  return daily;
}
const perDay = (xs: number[]) => (90 - (xs.at(-1) ?? 0)) / xs.length;

describe('有人守的地方维持住（准则 6，W2 复验 P1）', () => {
  it('看场 + 上课、没人维护：四周平均每天掉 ≤ 1.2', () => {
    const xs = run({ rental: 'director', lesson: 'dale' });
    console.log('staffed', perDay(xs).toFixed(2), xs.map(Math.round).join(' '));
    expect(perDay(xs)).toBeLessThanOrEqual(1.2);
    expect(perDay(xs)).toBeGreaterThan(0.3);
    // 四周还在画面信号线（60）以上，离掉档（15）还远；春天衰减 × 1.3 也不超过 1.2/天
    expect(xs.at(-1) ?? 0).toBeGreaterThan(55);
    const k = worldFor(CONTENT, 'indian_wells').act.rules.staffed_decay;
    expect(perDay(xs) + 5 * k * 0.3).toBeLessThanOrEqual(1.2);
  });
  it('看场 + 维护：稳住', () => {
    const xs = run({ rental: 'director', upkeep: 'dale' });
    console.log('upkeep', perDay(xs).toFixed(2), xs.map(Math.round).join(' '));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(85);
  });
  it('没人管：照 decay_day 掉', () => {
    const xs = run({});
    console.log('empty', perDay(xs).toFixed(2), xs.map(Math.round).join(' '));
    expect(perDay(xs)).toBeGreaterThan(2.5);
  });
});
