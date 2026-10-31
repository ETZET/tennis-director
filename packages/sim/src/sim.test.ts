import { CONTENT, type ContentBundle } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, randomBot, runGame } from './bots';
import { optionStatus } from './cards';
import { advance, newGame, replay, stateHash, step } from './game';
import { fromSave, SaveError, toSave } from './save';
import { at, dayOf, type GameState, minuteOfDay } from './state';
import { shortestRoute } from './systems';
import { coachAttention, test } from './vars';
import { worldFor } from './world';

const W = () => worldFor(CONTENT, 'hollow_creek');
const fresh = (seed = 1) => newGame(CONTENT, { seed });
const openUid = (s: GameState, card: string) => s.cards.open.find((o) => o.card === card)?.uid ?? -1;
/** 推进直到条件成立（最多 max 分钟） */
function until(s: GameState, f: (s: GameState) => boolean, max = 20000, content: ContentBundle = CONTENT) {
  for (let i = 0; i < max && !f(s); i++) advance(s, content, [], 1);
  return f(s);
}

describe('开局', () => {
  it('按幕配置建好状态：第 1 天 8:00，夏末，公告板打开，总监精力满格在露台', () => {
    const s = fresh();
    expect(dayOf(s.t)).toBe(1);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(s.season).toBe('late_summer');
    expect(s.planning).toBe(true);
    expect(s.director.energy).toBe(100);
    expect(s.plan.pm?.[0]).toBe('junior_lesson');
    expect(s.headCoach).toBe('dale');
    expect(s.director.at).toBe('deck');
    expect(s.stats.cash).toBe(1800);
    expect(s.people.jess_park?.hired).toBe(false);
    expect(s.log[0]?.cause.kind).toBe('start');
  });

  it('周一下午按公告板开课；15:30 Dale 玩手机的卡打开并请求暂停', () => {
    const s = fresh();
    advance(s, CONTENT, [{ type: 'lockPlan' }], 0);
    const r = advance(s, CONTENT, [], 7.5 * 60 + 1);
    expect(s.cards.open.map((o) => o.card)).toEqual(['hc_dale_phone']);
    expect(r.events.some((e) => e.type === 'requestPause')).toBe(true);
    expect(r.events.some((e) => e.type === 'activityStarted' && e.activity === 'junior_lesson')).toBe(true);
  });
});

describe('总监走位', () => {
  it('导航图上的最短路', () => {
    expect(shortestRoute(W(), 'deck', 'clay_court')).toEqual({
      route: ['court_1', 'creek_bridge', 'clay_court'],
      minutes: 63,
    });
  });

  it('走路分钟数 = 导航图分钟 ÷ 精力速度：精力满时跑着去，累了慢慢走', () => {
    const s = fresh();
    advance(s, CONTENT, [{ type: 'moveDirector', to: 'court_1' }], 0);
    expect(s.director.at).toBeNull();
    advance(s, CONTENT, [], 25);
    expect(s.director.at).toBeNull();
    advance(s, CONTENT, [], 1);
    expect(s.director.at).toBe('court_1'); // 39 ÷ 1.5 = 26 分钟
    const t = fresh();
    t.director.energy = 0;
    advance(t, CONTENT, [{ type: 'moveDirector', to: 'court_1' }], 64);
    expect(t.director.at).toBeNull();
    advance(t, CONTENT, [], 1);
    expect(t.director.at).toBe('court_1'); // 39 ÷ 0.6 = 65 分钟
  });

  it('总监在 1 号场时，玩手机的教练专注度回到 1', () => {
    const s = fresh();
    expect(coachAttention(s, W())).toBeCloseTo(0.35);
    s.director.at = 'court_1';
    expect(coachAttention(s, W())).toBe(1);
  });
});

describe('事件卡', () => {
  it('需要亲临的选项在总监到场前不能选，到了就能选', () => {
    const s = fresh();
    until(s, (x) => x.cards.open.some((o) => o.card === 'hc_dale_phone'));
    const uid = openUid(s, 'hc_dale_phone');
    expect(optionStatus(s, W(), uid).find((o) => o.key === 'A')).toMatchObject({
      available: false,
      blocked: 'director',
    });
    advance(s, CONTENT, [{ type: 'moveDirector', to: 'court_1' }], 40);
    expect(optionStatus(s, W(), uid).find((o) => o.key === 'A')?.available).toBe(true);
    const q = s.stats.quality ?? 0;
    const r = advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'A' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.flags.dale_warned).toBe(true);
    expect(s.stats.quality).toBeCloseTo(q + 2);
    expect(s.log.at(-1)?.cause).toEqual({ kind: 'option', card: 'hc_dale_phone', option: 'A' });
  });

  it('不能选的选项被拒绝，不进命令日志', () => {
    const s = fresh();
    until(s, (x) => x.cards.open.some((o) => o.card === 'hc_dale_phone'));
    const r = advance(s, CONTENT, [{ type: 'chooseOption', uid: openUid(s, 'hc_dale_phone'), option: 'A' }], 0);
    expect(r.accepted).toHaveLength(0);
  });

  it('倒计时到了执行默认后果，并记成"默认"', () => {
    const s = fresh();
    until(s, (x) => x.cards.open.some((o) => o.card === 'hc_dale_phone'));
    const q = s.stats.quality ?? 0;
    advance(s, CONTENT, [], 61);
    expect(s.cards.open.some((o) => o.card === 'hc_dale_phone')).toBe(false);
    const e = s.log.find((x) => x.cause.kind === 'default' && x.cause.card === 'hc_dale_phone');
    expect(e?.cause).toEqual({ kind: 'default', card: 'hc_dale_phone', option: 'C' });
    expect(e?.effects).toContainEqual({ kind: 'stat', stat: 'quality', delta: -3 });
    expect(s.stats.quality).toBeLessThan(q);
  });

  it('后续事件带着原因链：董事会备忘的日志条目指向安排它的那次选择', () => {
    const s = fresh();
    s.stats.quality = 30;
    s.cards.scheduled = s.cards.scheduled.filter((x) => x.card !== 'hc_board_memo');
    expect(until(s, (x) => x.cards.open.some((o) => o.card === 'hc_parent_complaint'))).toBe(true);
    const uid = openUid(s, 'hc_parent_complaint');
    advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'B' }], 0);
    const chose = s.log.at(-1);
    expect(until(s, (x) => x.cards.open.some((o) => o.card === 'hc_board_memo'))).toBe(true);
    const memo = s.cards.open.find((o) => o.card === 'hc_board_memo');
    expect(memo?.cause).toBe(chose?.id);
  });

  it('只出现一次的卡不会被日历再打开一次', () => {
    const s = fresh();
    s.stats.quality = 30;
    until(s, (x) => (x.cards.seen.hc_board_memo ?? 0) > 0 || x.cards.open.some((o) => o.card === 'hc_board_memo'));
    until(s, (x) => (x.cards.seen.hc_board_memo ?? 0) > 0);
    until(s, (x) => dayOf(x.t) >= 4);
    expect(s.cards.shown.hc_board_memo).toBe(1);
  });

  it('现金不够的选项不能选', () => {
    const s = fresh();
    s.stats.cash = 100;
    s.cards.scheduled.push({ card: 'hc_hire_coach', at: s.t, cause: null });
    advance(s, CONTENT, [], 1);
    expect(optionStatus(s, W(), openUid(s, 'hc_hire_coach')).find((o) => o.key === 'C')?.blocked).toBe('cost');
  });
});

describe('时间', () => {
  it('收盘时结算这一天，夜里跳过，第二天 8 点开门并按公告板排上周二下午的课', () => {
    const s = fresh();
    const cash = s.stats.cash ?? 0;
    const r = advance(s, CONTENT, [{ type: 'lockPlan' }], 12 * 60);
    expect(dayOf(s.t)).toBe(2);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(r.events.some((e) => e.type === 'dayEnded' && e.day === 1)).toBe(true);
    expect(s.stats.cash).not.toBe(cash);
    expect(s.activities.some((a) => a.id === 'junior_lesson' && a.start === at(2, 15))).toBe(true);
  });
});

describe('经营循环 v2', () => {
  it('季度日程：排日程时改是免费的；季中改要花精力，当天还没开始的活动跟着重排', () => {
    const s = fresh();
    advance(s, CONTENT, [{ type: 'setPlan', part: 'pm', weekday: 0, activity: 'open_day' }], 0);
    expect(s.director.energy).toBe(100);
    advance(s, CONTENT, [{ type: 'lockPlan' }], 0);
    expect(s.activities.some((a) => a.id === 'open_day' && a.start === at(1, 15))).toBe(true);
    expect(s.activities.some((a) => a.id === 'junior_lesson' && a.start === at(1, 15))).toBe(false);
    const r = advance(s, CONTENT, [{ type: 'setPlan', part: 'pm', weekday: 0, activity: 'junior_lesson' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.director.energy).toBe(96);
    expect(s.activities.some((a) => a.id === 'junior_lesson' && a.start === at(1, 15))).toBe(true);
    // 课只能排在下午
    expect(
      advance(s, CONTENT, [{ type: 'setPlan', part: 'am', weekday: 1, activity: 'junior_lesson' }], 0).accepted,
    ).toHaveLength(0);
  });

  it('动作：不用到场的立刻生效并扣钱；要到场的先走过去、在那儿忙、忙完才结算', () => {
    const s = fresh();
    advance(s, CONTENT, [{ type: 'lockPlan' }], 0);
    advance(s, CONTENT, [{ type: 'act', action: 'patch_court1' }], 0);
    expect(s.facilities.court_1).toBe('repaired');
    expect(s.stats.cash).toBe(1800 - 350);
    const r = advance(s, CONTENT, [{ type: 'act', action: 'clay_workday' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.director.task?.phase).toBe('going');
    until(s, (x) => x.director.task?.phase === 'working');
    expect(s.director.at).toBe('clay_court');
    expect(s.director.energy).toBe(75);
    // 忙的时候走不开
    expect(advance(s, CONTENT, [{ type: 'moveDirector', to: 'deck' }], 0).accepted).toHaveLength(0);
    until(s, (x) => x.director.task === null);
    expect(s.log.at(-1)?.cause).toMatchObject({ kind: 'action', action: 'clay_workday' });
  });

  it('动作在路上时点了别处就取消，不扣精力', () => {
    const s = fresh();
    advance(s, CONTENT, [{ type: 'lockPlan' }, { type: 'act', action: 'clay_workday' }], 5);
    advance(s, CONTENT, [{ type: 'moveDirector', to: 'deck' }], 0);
    expect(s.director.task).toBeNull();
    expect(s.director.energy).toBe(100);
  });

  it('换季：初秋第 22 天精力回满、公告板重新打开；天气按季节的权重抽', () => {
    const s = fresh(5);
    advance(s, CONTENT, [{ type: 'lockPlan' }], 0);
    s.director.energy = 20;
    const seen = new Set<string>();
    for (let i = 0; i < 21 * 720 && dayOf(s.t) < 22; i++) {
      advance(s, CONTENT, [], 1);
      seen.add(s.weather);
      for (const o of [...s.cards.open]) advance(s, CONTENT, [{ type: 'chooseOption', uid: o.uid, option: 'A' }], 0);
    }
    expect(s.season).toBe('early_autumn');
    expect(s.planning).toBe(true);
    expect(s.director.energy).toBe(100);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('不操作时局面基本不动：一周里会员只在周日收盘时小幅变化', () => {
    const s = fresh(9);
    advance(s, CONTENT, [{ type: 'lockPlan' }], 0);
    s.cards.scheduled = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    const m0 = s.stats.members ?? 0;
    advance(s, CONTENT, [], 5 * 720);
    expect(Math.abs((s.stats.members ?? 0) - m0)).toBeLessThanOrEqual(1);
  });
});

describe('条件', () => {
  it('all / any / not / 状态量 / 标记 / 设施 / 主教练', () => {
    const s = fresh();
    const w = W();
    expect(
      test(s, w, {
        all: [
          { stat: 'cash', gte: 1800 },
          { facility: 'court_1', is: 'worn' },
        ],
      }),
    ).toBe(true);
    expect(test(s, w, { any: [{ flag: 'nope' }, { coach: 'dale' }] })).toBe(true);
    expect(test(s, w, { not: { coach: 'none' } })).toBe(true);
    expect(test(s, w, { expr: 'stat.members > 40 && facility.court_2 == "rented_pickleball"' })).toBe(true);
  });
});

describe('确定性', () => {
  it('step 是纯函数：不改动输入状态', () => {
    const s = fresh();
    const before = stateHash(s);
    const r = step(s, CONTENT, [{ type: 'moveDirector', to: 'court_1' }], 30);
    expect(stateHash(s)).toBe(before);
    expect(stateHash(r.state)).not.toBe(before);
  });

  it('同一种子加同一命令日志，重放后状态哈希一致', () => {
    for (const seed of [3, 11, 42]) {
      const r = runGame(CONTENT, randomBot(seed * 7), seed);
      const again = replay(CONTENT, { seed }, r.commands, r.state.t + 1);
      expect(stateHash(again)).toBe(stateHash(r.state));
    }
  });

  it('同一种子跑两次，结果一样；换种子，结果不一样', () => {
    const a = runGame(CONTENT, randomBot(5), 99).state;
    const b = runGame(CONTENT, randomBot(5), 99).state;
    const c = runGame(CONTENT, randomBot(5), 100).state;
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).not.toBe(stateHash(c));
  });

  it('状态能直接 JSON 序列化再读回来', () => {
    const s = runGame(CONTENT, greedyBot(), 7, { maxDays: 4 }).state;
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('存档', () => {
  it('存档往返；读档后接着跑和不存档的结果一样', () => {
    const s = fresh(21);
    advance(s, CONTENT, [{ type: 'moveDirector', to: 'court_1' }], 300);
    const saved = JSON.parse(JSON.stringify(toSave(s, [])));
    const { save, warnings } = fromSave(saved, CONTENT.version);
    expect(warnings).toEqual([]);
    advance(s, CONTENT, [], 600);
    advance(save.state, CONTENT, [], 600);
    expect(stateHash(save.state)).toBe(stateHash(s));
  });

  it('旧版本存档逐级迁移到最新版本', () => {
    const s = fresh();
    const old = JSON.parse(JSON.stringify({ ...toSave(s, []), version: 0 }));
    delete old.state.legacy;
    delete old.state.cards.shown;
    old.state.version = 0;
    delete old.state.actions;
    delete old.state.plan;
    delete old.state.director.energy;
    const { save } = fromSave(old);
    expect(save.version).toBe(2);
    expect(save.state.legacy).toEqual([]);
    expect(save.state.cards.shown).toEqual({});
    expect(save.state.director.energy).toBe(100);
    expect(save.state.actions).toEqual({ cooldowns: {}, done: {} });
  });

  it('不是存档、来自更新版本的存档都报错；内容版本不一致只警告', () => {
    expect(() => fromSave({ hello: 1 })).toThrow(SaveError);
    expect(() => fromSave({ ...toSave(fresh(), []), version: 99 })).toThrow(/newer/);
    expect(fromSave(toSave(fresh(), []), 'other').warnings[0]).toMatch(/content/);
  });
});

describe('整局', () => {
  it('贪心机器人能打完第一幕，结局写进状态，因果日志有原因', () => {
    const r = runGame(CONTENT, greedyBot(), 1);
    expect(r.outcome).not.toBeNull();
    expect(r.state.log.length).toBeGreaterThan(20);
    expect(r.state.log.some((e) => e.parent !== null)).toBe(true);
  });
});
