import { CONTENT, type ContentBundle, type Growth, type Post } from '@td/content';
import { describe, expect, it } from 'vitest';
import type { Ctx } from './effects';
import { applyEffects } from './effects';
import type { SimEvent } from './events';
import { advance, type Command, newGame } from './game';
import { checkUnlocks } from './growth';
import { potentialOf } from './potential';
import { fromSave, toSave } from './save';
import { canAssign } from './staff';
import { type GameState, SAVE_VERSION } from './state';
import { num, test } from './vars';
import { worldFor } from './world';

/**
 * W3 员工成长（LG-12）：每干完一圈 +0.2 不超过潜力，大器晚成 +25，跨门槛 skill_up、解锁 unlock，
 * 开关关着时什么都不变。
 */

const quiet = (s: GameState): GameState => {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};

const GROWTH: Growth = {
  enabled: true,
  rate: 0.2,
  headroom: 15,
  traits: { late_bloomer: 10 },
  skills: ['teach', 'upkeep', 'service'],
  step: 5,
  unlocks: [
    { key: 'night_care', need: [{ skill: 'upkeep', gte: 42, who: 'coach' }], effects: [{ stat: 'cash', add: 7 }] },
    {
      key: 'combo',
      need: [
        { skill: 'teach', gte: 60, who: 'coach' },
        { skill: 'teach', gte: 60, who: 'trainer' },
      ],
      effects: [],
    },
  ],
};

function fixture(g: Growth | null = GROWTH): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-w3-fixture`;
  const act = c.acts[0];
  if (!act) throw new Error('no act');
  if (g) act.growth = g;
  // 仓库内容已经打开成长（GM-11）：g = null 是"关着"的情形，显式关掉
  else if (act.growth) act.growth = { ...act.growth, enabled: false };
  // 一个只收教学 ≥ 50 的岗位（岗位的 worker 门槛）
  const lesson = c.posts.find((x) => x.id === 'o1_lesson') as Post;
  c.posts.push({ ...lesson, id: 'gated_lesson', worker: { teach: 50 } });
  // 球员式的训练：球技靠效果涨（growth.skills 里没有 play，不另加 rate）
  const upkeep = c.posts.find((x) => x.id === 'o1_upkeep') as Post;
  c.posts.push({
    ...upkeep,
    id: 'drill',
    skill: 'play',
    restore: 0,
    effects: [{ person: 'worker', add: { play: 4 } }],
  });
  return c;
}

/** 会员场能打、总监和 Dale 都站在会员场（sim.test.ts 的 court1） */
function court1(s: GameState): GameState {
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 60;
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
  return s;
}

const assign = (person: string, target: string | null): Command => ({ type: 'assign', person, target });

function upkeepRun(c: ContentBundle, minutes = 600) {
  const s = quiet(court1(newGame(c, { seed: 5 })));
  const events: SimEvent[] = [];
  events.push(...advance(s, c, [assign('dale', 'o1_upkeep')], minutes).events);
  return { s, events };
}

describe('员工成长（W3）', () => {
  it('开关关着（默认）：员工干了一天能力不变，不发 skill_up / unlock', () => {
    const off = fixture(null);
    const { s, events } = upkeepRun(off);
    expect(s.people.dale?.upkeep).toBe(40);
    expect(events.some((e) => e.type === 'skill_up' || e.type === 'unlock')).toBe(false);
    expect(s.unlocks).toEqual({});
    // 仓库内容（GM-11）已经打开成长
    expect(CONTENT.acts[0]?.growth?.enabled ?? false).toBe(true);
  });

  it('每干完一圈 +0.2，跨门槛发 skill_up，满足 need 开出解锁（一次）', () => {
    const c = fixture();
    const { s, events } = upkeepRun(c);
    const cycles = s.log
      .filter((x) => x.cause.kind === 'post' && x.cause.post === 'o1_upkeep')
      .reduce((n, x) => n + (x.cause.kind === 'post' ? x.cause.cycles : 0), 0);
    const live = events.filter((e) => e.type === 'postCycle' && e.post === 'o1_upkeep').length;
    expect(live).toBeGreaterThan(5);
    expect(cycles).toBeLessThanOrEqual(live);
    expect(s.people.dale?.upkeep).toBeCloseTo(40 + 0.2 * live, 5);
    // 小数存两位，不留浮点尾巴
    expect(String(s.people.dale?.upkeep)).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(events).toContainEqual({ type: 'skill_up', person: 'dale', skill: 'upkeep', value: 42 });
    expect(events.filter((e) => e.type === 'unlock')).toEqual([{ type: 'unlock', person: 'dale', key: 'night_care' }]);
    expect(s.unlocks.night_care?.person).toBe('dale');
    const entry = s.log.find((x) => x.cause.kind === 'unlock');
    expect(entry?.cause).toMatchObject({ key: 'night_care', person: 'dale', people: ['dale'] });
    expect(entry?.effects).toContainEqual({ kind: 'stat', stat: 'cash', delta: 7 });
    const w = worldFor(c, s.act);
    expect(test(s, w, { unlocked: 'night_care' })).toBe(true);
    expect(num(s, w, 'unlocked.night_care + unlocked.combo')).toBe(1);
    expect(test(s, w, { skilled: 'upkeep', gte: 42, who: 'coach' })).toBe(true);
    expect(test(s, w, { skilled: 'upkeep', gte: 42, who: 'crew' })).toBe(false);
    expect(num(s, w, 'best.upkeep')).toBe(s.people.dale?.upkeep);
  });

  it('不超过潜力（起始值 +15）；内容写的 potential 优先；大器晚成 +25', () => {
    const c = fixture();
    const dale = c.people.find((p) => p.id === 'dale');
    if (!dale) throw new Error('no dale');
    const w = worldFor(c, 'indian_wells');
    expect(potentialOf(w, 'dale', 'upkeep')).toBe(55);
    const c2 = fixture();
    const d2 = c2.people.find((p) => p.id === 'dale');
    if (!d2) throw new Error('no dale');
    d2.traits = [...d2.traits, 'late_bloomer'];
    expect(potentialOf(worldFor(c2, 'indian_wells'), 'dale', 'upkeep')).toBe(65);
    d2.potential = { upkeep: 41 };
    c2.version += '-b';
    expect(potentialOf(worldFor(c2, 'indian_wells'), 'dale', 'upkeep')).toBe(41);
    // 总监照旧：上限 director_skill_cap
    expect(potentialOf(w, 'director', 'upkeep')).toBe(80);

    const s = quiet(court1(newGame(c, { seed: 5 })));
    (s.people.dale as { upkeep: number }).upkeep = 54.9;
    advance(s, c, [assign('dale', 'o1_upkeep')], 600);
    expect(s.people.dale?.upkeep).toBe(55);
  });

  it('总监不重复算：照旧每圈 +0.3（不另加 0.2）', () => {
    const c = fixture();
    const s = quiet(court1(newGame(c, { seed: 5 })));
    const r = advance(s, c, [assign('director', 'o1_upkeep')], 600);
    const cycles = r.events.filter((e) => e.type === 'postCycle').length;
    expect(cycles).toBeGreaterThan(3);
    expect(s.people.director?.upkeep).toBeCloseTo(35 + 0.3 * cycles, 5);
  });

  it('训练的 person: worker 涨幅截在潜力上（成长开着时）；成长关着时照旧', () => {
    for (const on of [true, false]) {
      const c = fixture(on ? GROWTH : null);
      const s = quiet(court1(newGame(c, { seed: 5 })));
      const w = worldFor(c, s.act);
      (s.people.dale as { play: number }).play = 44.95; // 潜力 30 + 15 = 45
      const ctx: Ctx = { s, w, events: [], worker: 'dale' };
      applyEffects(ctx, [{ person: 'worker', add: { play: 1 } }], -1, []);
      expect(s.people.dale?.play).toBeCloseTo(on ? 45 : 45.95, 5);
    }
  });

  it('训练岗位：球技按效果涨、截在潜力上，跨门槛照样发 skill_up', () => {
    const c = fixture();
    const s = quiet(court1(newGame(c, { seed: 5 })));
    const r = advance(s, c, [assign('dale', 'drill')], 600);
    expect(r.events.filter((e) => e.type === 'postCycle' && e.post === 'drill').length).toBeGreaterThan(4);
    expect(s.people.dale?.play).toBe(45);
    const ups = r.events.filter((e) => e.type === 'skill_up').map((e) => (e.type === 'skill_up' ? e.value : 0));
    expect(ups).toEqual([35, 40, 45]);
  });

  it('组合解锁：need 每条由不同的人满足', () => {
    const c = fixture();
    const s = quiet(court1(newGame(c, { seed: 5 })));
    const w = worldFor(c, s.act);
    const ctx: Ctx = { s, w, events: [] };
    const trainer = c.people.find((p) => p.traits.includes('trainer'));
    if (!trainer) throw new Error('no trainer in content');
    (s.people.dale as { skill: number }).skill = 61;
    checkUnlocks(ctx);
    expect(s.unlocks.combo).toBeUndefined();
    const tp = s.people[trainer.id] as GameState['people'][string];
    tp.hired = true;
    tp.skill = 60;
    checkUnlocks(ctx, trainer.id);
    expect(s.unlocks.combo?.person).toBe(trainer.id);
    expect(ctx.events).toContainEqual({ type: 'unlock', person: trainer.id, key: 'combo' });
  });

  it('岗位的 worker 门槛：能力不够给 skill', () => {
    const c = fixture();
    const s = quiet(court1(newGame(c, { seed: 5 })));
    const w = worldFor(c, s.act);
    expect(canAssign(s, w, 'director', 'gated_lesson')).toBe('skill');
    (s.people.director as { skill: number }).skill = 50;
    expect(canAssign(s, w, 'director', 'gated_lesson')).not.toBe('skill');
  });

  it('v9 存档迁移到最新：补上 unlocks', () => {
    const s = newGame(CONTENT, { seed: 3 });
    const old = JSON.parse(JSON.stringify({ ...toSave(s, []), version: 9 }));
    old.state.version = 9;
    delete old.state.unlocks;
    const { save } = fromSave(old);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.state.unlocks).toEqual({});
  });
});
