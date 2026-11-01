import { CONTENT, type ContentBundle } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, idleBot, randomBot, runGame } from './bots';
import { optionStatus } from './cards';
import { advance, newGame, replay, stateHash, step } from './game';
import { fromSave, SaveError, toSave } from './save';
import { canAssign, orderStatus, postStatus } from './staff';
import { at, dayOf, type GameState, minuteOfDay } from './state';
import { coachAttention, facilityTotals, num, serviceRate, test } from './vars';
import { shortestRoute } from './walk';
import { worldFor } from './world';

const W = () => worldFor(CONTENT, 'hollow_creek');
const fresh = (seed = 1) => newGame(CONTENT, { seed });
const openUid = (s: GameState, card: string) => s.cards.open.find((o) => o.card === card)?.uid ?? -1;
/** 推进直到条件成立（最多 max 分钟） */
function until(s: GameState, f: (s: GameState) => boolean, max = 20000, content: ContentBundle = CONTENT) {
  for (let i = 0; i < max && !f(s); i++) advance(s, content, [], 1);
  return f(s);
}
/** 关掉所有卡（只看经营系统） */
function quiet(s: GameState): GameState {
  s.cards.scheduled = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
}
const assign = (person: string, target: string | null) => ({ type: 'assign', person, target }) as const;

describe('开局', () => {
  it('按幕配置建好状态：第 1 天 8:00，夏末；总监在露台闲着，Dale 坐在 1 号场青少年课的位子上', () => {
    const s = fresh();
    expect(dayOf(s.t)).toBe(1);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(s.season).toBe('late_summer');
    expect(s.people.director).toMatchObject({ hired: true, at: 'deck', job: null });
    expect(s.people.dale).toMatchObject({ hired: true, at: 'court_1', job: 'c1_lesson' });
    expect(s.headCoach).toBe('dale');
    expect(s.stats.cash).toBe(1800);
    expect(s.condition.court_1).toBe(70);
    expect(s.people.jess_park?.hired).toBe(false);
    expect(s.log[0]?.cause.kind).toBe('start');
  });

  it('周一 15 点 Dale 的课开始转圈；15:30 Dale 玩手机的卡打开并请求暂停', () => {
    const s = fresh();
    const r = advance(s, CONTENT, [], 7.5 * 60 + 1);
    expect(s.cards.open.map((o) => o.card)).toEqual(['hc_dale_phone']);
    expect(r.events.some((e) => e.type === 'requestPause')).toBe(true);
    expect(postStatus(s, W(), W().posts.get('c1_lesson') as never).active).toBe(true);
  });
});

describe('走路和指派', () => {
  it('导航图上的最短路', () => {
    expect(shortestRoute(W(), 'deck', 'clay_court')).toEqual({
      route: ['court_1', 'creek_bridge', 'clay_court'],
      minutes: 63,
    });
  });

  it('把总监拖到红土场的工单上：按导航图走 63 分钟，到了才开始干', () => {
    const s = quiet(fresh());
    const r = advance(s, CONTENT, [assign('director', 'clay_clear')], 62);
    expect(r.accepted).toHaveLength(1);
    expect(s.people.director?.walk?.to).toBe('clay_court');
    expect(s.orders.clay_clear).toBeUndefined();
    advance(s, CONTENT, [], 2);
    expect(s.people.director?.at).toBe('clay_court');
    expect(s.orders.clay_clear?.progress).toBeGreaterThan(0);
  });

  it('总监和主教练在同一个地点时，玩手机的教练专注度回到 1', () => {
    const s = quiet(fresh());
    expect(coachAttention(s, W())).toBeCloseTo(0.35);
    advance(s, CONTENT, [assign('director', 'c1_upkeep')], 40);
    expect(coachAttention(s, W())).toBe(1);
  });

  it('不能指派的：青少年球员、没招的人、不存在的岗位、钱不够的工单', () => {
    const s = fresh();
    const w = W();
    expect(canAssign(s, w, 'mason', 'c1_upkeep')).toBe('person');
    expect(canAssign(s, w, 'jess_park', 'c1_upkeep')).toBe('person');
    expect(canAssign(s, w, 'director', 'bubble_session')).toBe('gone');
    s.stats.cash = 100;
    expect(canAssign(s, w, 'director', 'patch_court1')).toBe('cost');
  });
});

describe('岗位', () => {
  it('持续岗位：有人、在时段里才转圈，每圈结算；收盘时合成一条"因为……所以……"', () => {
    const s = quiet(fresh());
    const cash = s.stats.cash ?? 0;
    until(s, (x) => minuteOfDay(x.t) >= 18 * 60);
    expect(s.ledger.c1_lesson?.cycles).toBe(3);
    expect(s.stats.cash).toBeGreaterThan(cash);
    until(s, (x) => dayOf(x.t) === 2);
    const e = s.log.find((x) => x.cause.kind === 'post' && x.cause.post === 'c1_lesson');
    expect(e?.cause).toMatchObject({ person: 'dale', cycles: 3 });
    expect(e?.effects.some((x) => x.kind === 'stat' && x.stat === 'cash')).toBe(true);
  });

  it('中途把人拉走：这一圈作废，已算的服务分钟退回去', () => {
    const s = quiet(fresh());
    until(s, (x) => minuteOfDay(x.t) >= 15 * 60 + 40);
    const served = s.week.served;
    const r = advance(s, CONTENT, [assign('dale', 'c1_upkeep')], 0);
    expect(r.events).toContainEqual({ type: 'postInterrupted', post: 'c1_lesson', person: 'dale', lost: 40 });
    expect(s.week.served).toBe(served - 40);
    expect(s.posts.c1_lesson).toBeUndefined();
  });

  it('拖到有人的岗位上：原来的人让出来', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'c1_lesson')], 0);
    expect(s.people.dale?.job).toBeNull();
    expect(s.people.director?.job).toBe('c1_lesson');
  });

  it('没人服务的需求计入服务率的分母；周日收盘按服务率结算，然后清零', () => {
    const s = quiet(fresh(9));
    advance(s, CONTENT, [assign('dale', null)], 0);
    until(s, (x) => minuteOfDay(x.t) >= 12 * 60);
    expect(s.week.demand).toBeGreaterThan(0);
    expect(s.week.served).toBe(0);
    expect(serviceRate(s)).toBe(0);
    const r = { settled: false };
    for (let i = 0; i < 8 * 720 && !r.settled; i++)
      r.settled = advance(s, CONTENT, [], 1).events.some((e) => e.type === 'weekSettled');
    expect(r.settled).toBe(true);
    expect(dayOf(s.t)).toBe(8);
    expect(s.week).toMatchObject({ demand: 0, served: 0, last: 0 });
  });
});

describe('工单', () => {
  it('补裂缝：第一个人到场时扣材料费；拉走进度保留；做满了设施变好、状况回满', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'patch_court1')], 60);
    expect(s.stats.cash).toBe(1800 - 300);
    const p = s.orders.patch_court1?.progress ?? 0;
    expect(p).toBeGreaterThan(0);
    advance(s, CONTENT, [assign('director', null)], 30);
    expect(s.orders.patch_court1?.progress).toBe(p);
    advance(s, CONTENT, [assign('director', 'patch_court1')], 0);
    until(s, (x) => x.facilities.court_1 === 'repaired');
    expect(s.condition.court_1).toBe(100);
    expect(s.people.director?.job).toBeNull();
    expect(s.log.at(-1)?.cause).toMatchObject({ kind: 'order', order: 'patch_court1', people: ['director'] });
    expect(orderStatus(s, W(), W().orders.get('patch_court1') as never).visible).toBe(false);
  });

  it('几个人一起干更快；人数有上限', () => {
    const one = quiet(fresh());
    advance(one, CONTENT, [assign('director', 'clay_clear')], 4 * 60);
    const two = quiet(fresh());
    advance(two, CONTENT, [assign('director', 'clay_clear'), assign('dale', 'clay_clear')], 4 * 60);
    expect(two.orders.clay_clear?.progress ?? 0).toBeGreaterThan(one.orders.clay_clear?.progress ?? 0);
    expect(canAssign(two, W(), 'director', 'new_net')).toBeNull();
  });
});

describe('习惯（ADR 0014）', () => {
  it('派过一次的班会记住：露台接待 11 点关门后总监自己去泳池；第二天 8 点自己回露台', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'pool_guard')], 0);
    advance(s, CONTENT, [assign('director', 'deck_host')], 0);
    expect(s.people.director?.routine).toEqual(['deck_host', 'pool_guard']);
    expect(until(s, (x) => x.people.director?.job === 'pool_guard', 4 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeGreaterThanOrEqual(11 * 60);
    expect(until(s, (x) => dayOf(x.t) === 2 && x.people.director?.job === 'deck_host', 24 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeLessThan(8 * 60 + 20);
  });
  it('工单不进习惯，也不会被习惯打断；叫停会把那个班从习惯里拿掉；同一个班只记在一个人身上', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'c1_lesson')], 0);
    expect(s.people.director?.routine).toEqual(['c1_lesson']);
    expect(s.people.dale?.routine).toEqual([]);
    advance(s, CONTENT, [assign('director', 'patch_court1')], 0);
    expect(s.people.director?.routine).toEqual(['c1_lesson']);
    advance(s, CONTENT, [], 60);
    expect(s.people.director?.job).toBe('patch_court1');
    advance(s, CONTENT, [assign('director', 'deck_host'), assign('director', null)], 0);
    expect(s.people.director?.routine).toEqual(['c1_lesson']);
  });
});

describe('习惯：工单和班次（第二轮试玩 S4、S7）', () => {
  it('在做工单的人班一开始就去上班，下了班回去接着做工单；按习惯换班不记"白干了"', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('dale', null)], 0);
    advance(s, CONTENT, [assign('director', 'deck_host')], 0);
    // 总监上午做接待；11 点关门后没别的班，派他去清红土场（12 小时的活）
    expect(until(s, (x) => minuteOfDay(x.t) >= 11 * 60, 4 * 60)).toBe(true);
    advance(s, CONTENT, [assign('director', 'clay_clear')], 0);
    // 第二天 8 点露台接待开门：放下工单去上班，11 点后回来接着清
    expect(until(s, (x) => dayOf(x.t) === 2 && x.people.director?.job === 'deck_host', 30 * 60)).toBe(true);
    expect(s.people.director?.resume).toBe('clay_clear');
    expect(until(s, (x) => x.people.director?.job === 'clay_clear', 5 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeGreaterThanOrEqual(11 * 60);
  });
  it('换班时关了门的岗位不发 postInterrupted', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'pool_guard'), assign('director', 'deck_host')], 0);
    const r = advance(s, CONTENT, [], 4 * 60);
    expect(s.people.director?.job).toBe('pool_guard');
    expect(r.events.filter((e) => e.type === 'postInterrupted')).toEqual([]);
  });
});

describe('董事会信心拆成几项（第二轮试玩 S2）', () => {
  // 拆开以前的一条公式：拆开后数必须完全一样（平衡不变）
  const OLD =
    'clamp(40 + (stat.quality - 55) * 0.8 + (stat.members - 50) * 0.5 + (stat.reputation - 40) * 0.4' +
    ' - max(0, day - 7) * 0.6 + (flag.match_won ? 8 : 0) + (flag.match_played ? 2 : 0) - (flag.pickleball_lease ? 3 : 0)' +
    ' + (flag.chair_impressed ? 6 : 0) - (flag.chair_worried ? 6 : 0) - (flag.board_impatient ? 8 : 0)' +
    ' + (flag.open_house_held ? 6 : 0) + (flag.turnaround_promised ? 10 : 0) - (flag.broken_promise ? 18 : 0), 0, 100)';
  it('各项之和等于原来的公式；周日收盘报每项这一周的变化', () => {
    const s = fresh(7);
    const w = W();
    const weeks: unknown[] = [];
    for (let d = 0; d < 20 && !s.outcome; d++) {
      const r = advance(s, CONTENT, [], 24 * 60);
      // 收盘时算的（现在已经是第二天早上）
      expect(s.stats.board_support).toBeCloseTo(num(s, w, OLD, { day: dayOf(s.t) - 1 }), 6);
      const sum = Object.values(s.terms?.board_support ?? {}).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - (s.stats.board_support ?? 0))).toBeLessThan(0.5 + (sum < 0 || sum > 100 ? 999 : 0));
      for (const e of r.events) if (e.type === 'weekSettled') weeks.push(e.terms.board_support);
    }
    expect(weeks.length).toBeGreaterThanOrEqual(2);
    expect(weeks[1]).toMatchObject({ delta: { expectations: -4.2 } });
  });
});

describe('衰减（准则 6）', () => {
  it('放一天数字几乎不动；放一周没人管的场掉下来，状况低于 30 设施质量贡献减半', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'patch_court1')], 0);
    until(s, (x) => x.facilities.court_1 === 'repaired');
    advance(s, CONTENT, [assign('dale', null)], 0);
    const q0 = facilityTotals(s, W()).quality;
    const day = dayOf(s.t);
    until(s, (x) => dayOf(x.t) === day + 1);
    expect(s.condition.court_1).toBe(96);
    expect(facilityTotals(s, W()).quality).toBe(q0);
    s.condition.court_1 = 25;
    expect(facilityTotals(s, W()).quality).toBe(q0 - 4);
    s.condition.court_1 = 35;
    advance(s, CONTENT, [], 1);
    expect(orderStatus(s, W(), W().orders.get('court1_sweep') as never).visible).toBe(true);
  });

  it('维护岗位每圈修复，修多少看维护能力', () => {
    const s = quiet(fresh());
    s.condition.court_1 = 50;
    advance(s, CONTENT, [assign('dale', 'c1_upkeep')], 60);
    expect(s.condition.court_1).toBeCloseTo(50 + 4 * (0.5 + 20 / 100));
  });
});

describe('事件卡', () => {
  it('要总监亲自去办的选项：总监放下手上的岗位，走过去待一段时间，期间叫不回来', () => {
    const s = fresh();
    advance(s, CONTENT, [assign('director', 'deck_host')], 0);
    until(s, (x) => x.cards.open.some((o) => o.card === 'hc_dale_phone'));
    const uid = openUid(s, 'hc_dale_phone');
    expect(optionStatus(s, W(), uid).find((o) => o.key === 'A')).toMatchObject({
      available: true,
      errand: { at: 'court_1', minutes: 30 },
    });
    const q = s.stats.quality ?? 0;
    const r = advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'A' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.flags.dale_warned).toBe(true);
    expect(s.stats.quality).toBeCloseTo(q + 2);
    expect(s.people.director?.job).toBeNull();
    expect(s.people.director?.errand?.at).toBe('court_1');
    expect(canAssign(s, W(), 'director', 'deck_host')).toBe('busy');
    until(s, (x) => x.people.director?.errand === null);
    expect(s.people.director?.at).toBe('court_1');
    expect(s.log.find((x) => x.cause.kind === 'option')?.effects).toContainEqual({
      kind: 'errand',
      person: 'director',
      at: 'court_1',
      minutes: 30,
    });
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

  it('招聘日：招来的人到会所报到，能指派，工资每周扣；招来的教练接主教练，Dale 留下', () => {
    const s = fresh();
    s.cards.scheduled.push({ card: 'hc_hiring_day', at: s.t, cause: null });
    s.cards.scheduled.push({ card: 'hc_hire_coach', at: s.t, cause: null });
    advance(s, CONTENT, [], 1);
    advance(s, CONTENT, [{ type: 'chooseOption', uid: openUid(s, 'hc_hiring_day'), option: 'A' }], 0);
    advance(s, CONTENT, [{ type: 'chooseOption', uid: openUid(s, 'hc_hire_coach'), option: 'A' }], 0);
    expect(s.people.rosa_ortiz).toMatchObject({ hired: true, at: 'deck', job: null });
    expect(canAssign(s, W(), 'rosa_ortiz', 'c1_upkeep')).toBeNull();
    expect(s.headCoach).toBe('jess_park');
    expect(s.people.dale?.hired).toBe(true);
  });
});

describe('时间', () => {
  it('收盘时结算这一天，夜里跳过；人留在原地，第二天 8 点开门接着干', () => {
    const s = fresh();
    const cash = s.stats.cash ?? 0;
    const r = advance(s, CONTENT, [assign('director', 'clay_clear')], 12 * 60);
    expect(dayOf(s.t)).toBe(2);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(r.events.some((e) => e.type === 'dayEnded' && e.day === 1)).toBe(true);
    expect(s.stats.cash).not.toBe(cash);
    expect(s.people.director).toMatchObject({ at: 'clay_court', job: 'clay_clear', walk: null });
    expect(at(2, 8)).toBe(s.t);
  });

  it('换季：初秋第 22 天；天气按季节的权重抽', () => {
    const s = fresh(5);
    const seen = new Set<string>();
    for (let i = 0; i < 21 * 720 && dayOf(s.t) < 22; i++) {
      advance(s, CONTENT, [], 1);
      seen.add(s.weather);
      for (const o of [...s.cards.open]) advance(s, CONTENT, [{ type: 'chooseOption', uid: o.uid, option: 'A' }], 0);
    }
    expect(s.season).toBe('early_autumn');
    expect(seen.size).toBeGreaterThan(1);
  });

  it('不操作时局面基本不动：一周里会员只在周日收盘时变化', () => {
    const s = quiet(fresh(9));
    const m0 = s.stats.members ?? 0;
    advance(s, CONTENT, [], 5 * 720);
    expect(s.stats.members).toBe(m0);
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
    const r = step(s, CONTENT, [assign('director', 'c1_upkeep')], 30);
    expect(stateHash(s)).toBe(before);
    expect(stateHash(r.state)).not.toBe(before);
  });

  it('同一种子加同一命令日志，重放后状态哈希一致', () => {
    for (const seed of [3, 11, 42]) {
      for (const bot of [randomBot(seed * 7), greedyBot()]) {
        const r = runGame(CONTENT, bot, seed);
        const again = replay(CONTENT, { seed }, r.commands, r.state.t + 1);
        expect(stateHash(again)).toBe(stateHash(r.state));
      }
    }
  }, 60_000);

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
    advance(s, CONTENT, [assign('director', 'clay_clear')], 300);
    const saved = JSON.parse(JSON.stringify(toSave(s, [])));
    const { save, warnings } = fromSave(saved, CONTENT.version);
    expect(warnings).toEqual([]);
    advance(s, CONTENT, [], 600);
    advance(save.state, CONTENT, [], 600);
    expect(stateHash(save.state)).toBe(stateHash(s));
  });

  it('旧版本存档逐级迁移到最新版本：v2 的总监走位和精力变成人员表里的总监', () => {
    const s = fresh();
    const old = JSON.parse(JSON.stringify({ ...toSave(s, []), version: 0 }));
    delete old.state.legacy;
    delete old.state.cards.shown;
    old.state.version = 0;
    for (const k of ['posts', 'orders', 'orderLog', 'condition', 'week', 'ledger']) delete old.state[k];
    delete old.state.people.director;
    for (const p of Object.values(old.state.people) as Record<string, unknown>[])
      for (const k of ['upkeep', 'service', 'job', 'walk', 'errand', 'routine']) delete p[k];
    old.state.director = { at: 'court_1', leg: null, route: [], task: null };
    const { save } = fromSave(old);
    expect(save.version).toBe(4);
    expect(save.state.legacy).toEqual([]);
    expect(save.state.cards.shown).toEqual({});
    expect(save.state.people.director).toMatchObject({ hired: true, at: 'court_1', job: null });
    expect(save.state.people.dale).toMatchObject({ upkeep: 0, job: null, walk: null, routine: [] });
    expect('director' in save.state).toBe(false);
    expect('plan' in save.state).toBe(false);
    // 迁移后的存档能接着跑
    advance(save.state, CONTENT, [{ type: 'assign', person: 'director', target: 'c1_upkeep' }], 120);
    expect(save.state.people.director?.job).toBe('c1_upkeep');
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
    expect(r.state.log.some((e) => e.cause.kind === 'order')).toBe(true);
  }, 20_000);

  it('放置不管的对照局：打得完，但会员和质量都往下走', () => {
    const r = runGame(CONTENT, idleBot(), 1);
    expect(r.outcome).not.toBeNull();
    expect(r.state.stats.quality ?? 0).toBeLessThan(44);
  }, 20_000);
});
