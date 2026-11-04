import { CONTENT } from '@td/content';
import { describe, expect, it } from 'vitest';
import { run as runEffects } from './effects';
import { advance, newGame } from './game';
import { fromSave, MIGRATIONS, toSave } from './save';
import { dayDecay } from './staff';
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

describe('效果 decay_mult：一段时间内衰减打折（W3 夜间养护）', () => {
  it('到期之前收盘衰减 × factor，到期以后照旧；写进因果日志；存档往返、12 → 13 迁移', () => {
    const s = quiet(newGame(CONTENT, { seed: 2 }));
    const w = worldFor(CONTENT, s.act, s.directorConfig);
    s.facilities.outer_1 = 'playable';
    const none = new Set<string>();
    const base = dayDecay(s, w, 'outer_1', 1, none);
    expect(base).toBeGreaterThan(0);
    const ctx = { s, w, events: [] };
    const e = runEffects(ctx, { kind: 'debug', what: 'care' }, null, [
      { decay_mult: { facility: 'outer_1', factor: 0.7, days: 7 } },
    ]);
    expect(e.effects).toContainEqual({ kind: 'decay_mult', facility: 'outer_1', factor: 0.7, until: s.t + 7 * 1440 });
    expect(dayDecay(s, w, 'outer_1', 1, none)).toBeCloseTo(base * 0.7);
    // 收盘时真的少掉三成
    s.condition.outer_1 = 90;
    const t0 = s.t;
    while (s.t < t0 + 1440) advance(s, CONTENT, [], 60);
    // 季节倍数可能不是 1：和不打折的同一天比
    expect(90 - (s.condition.outer_1 ?? 0)).toBeLessThan(base * 0.99);
    expect(90 - (s.condition.outer_1 ?? 0)).toBeGreaterThan(0);
    // 存档往返
    const save = toSave(s, []);
    expect(fromSave(JSON.parse(JSON.stringify(save))).save.state.decayMult.outer_1?.factor).toBe(0.7);
    const old = structuredClone(save) as unknown as Record<string, unknown>;
    const st = old.state as Record<string, unknown>;
    delete st.decayMult;
    st.version = 12;
    old.version = 12;
    const m = (MIGRATIONS[12] as NonNullable<(typeof MIGRATIONS)[12]>)(old);
    expect((m.state as GameState).decayMult).toEqual({});
    // 到期
    s.t = (s.decayMult.outer_1?.until ?? 0) + 1;
    expect(dayDecay(s, w, 'outer_1', 1, none)).toBe(base);
  });
});
