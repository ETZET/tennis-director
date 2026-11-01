import { CONTENT, type ContentBundle } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, idleBot, randomBot, runGame } from './bots';
import { optionStatus } from './cards';
import { advance, newGame, replay, stateHash, step } from './game';
import { fromSave, SaveError, toSave } from './save';
import { canAssign, orderStatus, postStatus } from './staff';
import { at, dayOf, type GameState, minuteOfDay } from './state';
import { facilityTotals, makeEnv, serviceRate, test } from './vars';
import { shortestRoute } from './walk';
import { worldFor } from './world';

const W = () => worldFor(CONTENT, 'indian_wells');
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
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
}
/** 外场 1 已经能打（跳过开局的扫沙和换网），两个人都站在外场 1 */
function court1(s: GameState): GameState {
  s.facilities.outer_1 = 'playable';
  s.condition.outer_1 = 60;
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
  return s;
}
const assign = (person: string, target: string | null) => ({ type: 'assign', person, target }) as const;
const open = (s: GameState, card: string) => {
  s.cards.scheduled.push({ card, at: s.t, cause: null });
  advance(s, CONTENT, [], 1);
  return openUid(s, card);
};

describe('开局', () => {
  it('按地图配置建好状态：第 1 天 8:00，秋天；总监在大门，Dale 在会所，全都是废弃的', () => {
    const s = fresh();
    expect(dayOf(s.t)).toBe(1);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(s.season).toBe('autumn');
    expect(s.people.director).toMatchObject({ hired: true, at: 'entrance', job: null });
    expect(s.people.dale).toMatchObject({ hired: true, at: 'clubhouse', job: null });
    expect(s.headCoach).toBe('dale');
    expect(s.stats.cash).toBe(3000);
    expect(s.stats.members).toBe(0);
    expect(s.stats.restoration).toBe(0);
    expect(s.facilities).toMatchObject({ outer_1: 'sanded', clubhouse: 'ruined', stadium_1: 'ruined' });
    expect(s.condition.outer_1).toBe(10);
    expect(s.people.jess_park?.hired).toBe(false);
    expect(s.log[0]?.cause.kind).toBe('start');
  });

  it('开局就打开 Dale 的发球机卡，请求暂停；能用的只有扫外场 1 和发传单', () => {
    const s = fresh();
    const r = advance(s, CONTENT, [], 1);
    expect(s.cards.open.map((o) => o.card)).toEqual(['iw_arrival']);
    expect(r.events.some((e) => e.type === 'requestPause')).toBe(true);
    const w = W();
    const visible = [...w.orders.values()].filter((o) => orderStatus(s, w, o).visible).map((o) => o.id);
    expect(visible.sort()).toEqual(['flyers', 'o1_sweep']);
    expect([...w.posts.values()].filter((p) => postStatus(s, w, p).exists)).toEqual([]);
  });
});

describe('走路和指派', () => {
  it('导航图上的最短路：两两之间都有一条边，分钟数按画面里的步道换算；穿过 Stadium 1 去南边的外场更近', () => {
    expect(shortestRoute(W(), 'entrance', 'plaza')).toEqual({ route: ['plaza'], minutes: 13 });
    expect(shortestRoute(W(), 'entrance', 'outer_1')).toEqual({ route: ['stadium_1', 'outer_1'], minutes: 45 });
    expect(shortestRoute(W(), 'clubhouse', 'outer_1')?.minutes).toBe(57);
  });

  it('把总监拖到外场 1 的扫沙工单上：走 45 分钟，到了才开始干', () => {
    const s = quiet(fresh());
    const r = advance(s, CONTENT, [assign('director', 'o1_sweep')], 44);
    expect(r.accepted).toHaveLength(1);
    expect(s.people.director?.walk?.to).toBe('outer_1');
    expect(s.orders.o1_sweep).toBeUndefined();
    advance(s, CONTENT, [], 2);
    expect(s.people.director?.at).toBe('outer_1');
    expect(s.orders.o1_sweep?.progress).toBeGreaterThan(0);
  });

  it('不能指派的：没招的人、还没修好的设施上的岗位、钱不够的工单', () => {
    const s = fresh();
    const w = W();
    expect(canAssign(s, w, 'jess_park', 'o1_sweep')).toBe('person');
    expect(canAssign(s, w, 'director', 'o1_rental')).toBe('gone');
    expect(canAssign(s, w, 'director', 'ch_repair')).toBe('gone');
    s.facilities.outer_1 = 'swept';
    s.stats.cash = 50;
    expect(canAssign(s, w, 'director', 'o1_net')).toBe('cost');
  });
});

describe('修复就是解锁（ADR 0015）', () => {
  it('扫沙 → 换网 → 外场 1 能打，开出三个岗位；会所和外场 2–3 的修复工单冒出来', () => {
    const s = quiet(fresh());
    const w = W();
    advance(s, CONTENT, [assign('director', 'o1_sweep'), assign('dale', 'o1_sweep')], 0);
    expect(until(s, (x) => x.facilities.outer_1 === 'swept')).toBe(true);
    expect(s.condition.outer_1).toBe(40);
    advance(s, CONTENT, [assign('director', 'o1_net')], 0);
    expect(until(s, (x) => x.facilities.outer_1 === 'playable', 600)).toBe(true);
    expect(s.stats.cash).toBe(3000 - 120);
    const posts = [...w.posts.values()].filter((p) => postStatus(s, w, p).exists).map((p) => p.id);
    expect(posts.sort()).toEqual(['o1_lesson', 'o1_rental', 'o1_upkeep']);
    for (const o of ['ch_repair', 'o23_repair', 'o1_resurface'])
      expect(orderStatus(s, w, w.orders.get(o) as never).visible, o).toBe(true);
    advance(s, CONTENT, [], 1);
    expect(s.stats.restoration).toBe(0);
    until(s, (x) => dayOf(x.t) === 2);
    expect(s.stats.restoration).toBe(1);
  });

  it('后面的设施要等前面的修好：Stadium 1 要等 Stadium 2，Stadium 2 要等 Stadium 3', () => {
    const s = fresh();
    const w = W();
    const vis = (o: string) => orderStatus(s, w, w.orders.get(o) as never).visible;
    expect(vis('st1_clear')).toBe(false);
    expect(vis('st2_repair')).toBe(false);
    s.facilities.stadium_3 = 'open';
    expect(vis('st2_repair')).toBe(true);
    expect(vis('st1_clear')).toBe(false);
    s.facilities.stadium_2 = 'open';
    expect(vis('st1_clear')).toBe(true);
    s.facilities.stadium_1 = 'restored';
    expect(vis('st1_exhibition')).toBe(false);
    s.stats.reputation = 50;
    expect(vis('st1_exhibition')).toBe(true);
  });

  it('表演赛办成就通关', () => {
    const s = quiet(court1(fresh()));
    s.facilities.stadium_1 = 'restored';
    s.stats.reputation = 60;
    for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'stadium_1';
    advance(s, CONTENT, [assign('director', 'st1_exhibition'), assign('dale', 'st1_exhibition')], 0);
    expect(until(s, (x) => x.outcome !== null)).toBe(true);
    expect(s.outcome).toMatchObject({ result: 'won', ending: 'exhibition' });
  });
});

describe('岗位', () => {
  it('持续岗位：有人、在时段里才转圈，每圈结算；收盘时合成一条"因为……所以……"', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('dale', 'o1_lesson')], 0);
    const cash = s.stats.cash ?? 0;
    until(s, (x) => minuteOfDay(x.t) >= 18 * 60);
    expect(s.ledger.o1_lesson?.cycles).toBe(3);
    expect(s.stats.cash).toBeGreaterThan(cash);
    until(s, (x) => dayOf(x.t) === 2);
    const e = s.log.find((x) => x.cause.kind === 'post' && x.cause.post === 'o1_lesson');
    expect(e?.cause).toMatchObject({ person: 'dale', cycles: 4 });
    expect(e?.effects.some((x) => x.kind === 'stat' && x.stat === 'cash')).toBe(true);
  });

  it('中途把人拉走：这一圈作废，已算的服务分钟退回去', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('dale', 'o1_lesson')], 0);
    until(s, (x) => minuteOfDay(x.t) >= 15 * 60 + 40);
    const served = s.week.served;
    const r = advance(s, CONTENT, [assign('dale', 'o1_upkeep')], 0);
    expect(r.events).toContainEqual({ type: 'postInterrupted', post: 'o1_lesson', person: 'dale', lost: 40 });
    expect(s.week.served).toBe(served - 40);
    expect(s.posts.o1_lesson).toBeUndefined();
  });

  it('拖到有人的岗位上：原来的人让出来', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('dale', 'o1_rental')], 0);
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    expect(s.people.dale?.job).toBeNull();
    expect(s.people.director?.job).toBe('o1_rental');
  });

  it('没人服务的需求计入服务率的分母；周日收盘按服务率结算，然后清零', () => {
    const s = quiet(court1(fresh(9)));
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
  it('换网：第一个人到场时扣材料费；拉走进度保留；做满了设施变好、状况加上去', () => {
    const s = quiet(court1(fresh()));
    s.facilities.outer_1 = 'swept';
    s.condition.outer_1 = 40;
    advance(s, CONTENT, [assign('director', 'o1_net')], 20);
    expect(s.stats.cash).toBe(3000 - 120);
    const p = s.orders.o1_net?.progress ?? 0;
    expect(p).toBeGreaterThan(0);
    advance(s, CONTENT, [assign('director', null)], 30);
    expect(s.orders.o1_net?.progress).toBe(p);
    advance(s, CONTENT, [assign('director', 'o1_net')], 0);
    until(s, (x) => x.facilities.outer_1 === 'playable');
    expect(s.condition.outer_1).toBe(60);
    expect(s.people.director?.job).toBeNull();
    expect(s.log.at(-1)?.cause).toMatchObject({ kind: 'order', order: 'o1_net', people: ['director'] });
    expect(orderStatus(s, W(), W().orders.get('o1_net') as never).visible).toBe(false);
  });

  it('几个人一起干更快；人数有上限', () => {
    const one = quiet(court1(fresh()));
    one.facilities.outer_1 = 'sanded';
    advance(one, CONTENT, [assign('director', 'o1_sweep')], 60);
    const two = quiet(court1(fresh()));
    two.facilities.outer_1 = 'sanded';
    advance(two, CONTENT, [assign('director', 'o1_sweep'), assign('dale', 'o1_sweep')], 60);
    expect(two.orders.o1_sweep?.progress ?? 0).toBeGreaterThan(one.orders.o1_sweep?.progress ?? 0);
    const s = quiet(court1(fresh()));
    s.facilities.outer_1 = 'swept';
    advance(s, CONTENT, [assign('director', 'o1_net')], 0);
    expect(canAssign(s, W(), 'dale', 'o1_net')).toBe('crew');
  });
});

describe('习惯（ADR 0014）', () => {
  it('派过一次的班会记住：外场 1 看场 15 点关门后总监自己去上课；第二天 8 点自己回去看场', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_lesson')], 0);
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    expect(s.people.director?.routine).toEqual(['o1_rental', 'o1_lesson']);
    expect(until(s, (x) => x.people.director?.job === 'o1_lesson', 8 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeGreaterThanOrEqual(15 * 60);
    expect(until(s, (x) => dayOf(x.t) === 2 && x.people.director?.job === 'o1_rental', 24 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeLessThan(8 * 60 + 20);
  });
  it('工单不进习惯，也不会被习惯打断；叫停会把那个班从习惯里拿掉；同一个班只记在一个人身上', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_lesson')], 0);
    expect(s.people.director?.routine).toEqual(['o1_lesson']);
    expect(s.people.dale?.routine).toEqual([]);
    advance(s, CONTENT, [assign('director', 'o1_resurface')], 0);
    expect(s.people.director?.routine).toEqual(['o1_lesson']);
    advance(s, CONTENT, [], 60);
    expect(s.people.director?.job).toBe('o1_resurface');
    advance(s, CONTENT, [assign('director', 'o1_rental'), assign('director', null)], 0);
    expect(s.people.director?.routine).toEqual(['o1_lesson']);
    advance(s, CONTENT, [assign('dale', 'o1_lesson')], 0);
    expect(s.people.director?.routine).toEqual([]);
    expect(s.people.dale?.routine).toEqual(['o1_lesson']);
  });
});

describe('习惯：工单和班次（第二轮试玩 S4、S7）', () => {
  it('在做工单的人班一开始就去上班，下了班回去接着做工单；按习惯换班不记"白干了"', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    // 总监白天看场；15 点关门后没别的班，派他去修外场 2–3（12 小时的活）
    expect(until(s, (x) => minuteOfDay(x.t) >= 15 * 60, 8 * 60)).toBe(true);
    advance(s, CONTENT, [assign('director', 'o23_repair')], 0);
    // 第二天 8 点看场开门：放下工单去上班，15 点后回来接着修
    expect(until(s, (x) => dayOf(x.t) === 2 && x.people.director?.job === 'o1_rental', 30 * 60)).toBe(true);
    expect(s.people.director?.resume).toBe('o23_repair');
    expect(until(s, (x) => x.people.director?.job === 'o23_repair', 9 * 60)).toBe(true);
    expect(minuteOfDay(s.t)).toBeGreaterThanOrEqual(15 * 60);
  });
  it('换班时关了门的岗位不发 postInterrupted', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_lesson'), assign('director', 'o1_rental')], 0);
    const r = advance(s, CONTENT, [], 8 * 60);
    expect(s.people.director?.job).toBe('o1_lesson');
    expect(r.events.filter((e) => e.type === 'postInterrupted')).toEqual([]);
  });
});

describe('总监成长（核心玩法决定）', () => {
  it('总监干完一圈或一张工单，那项能力涨一点；Dale 不涨', () => {
    const s = quiet(court1(fresh()));
    const d0 = s.people.director?.service ?? 0;
    const dale0 = s.people.dale?.service ?? 0;
    advance(s, CONTENT, [assign('director', 'o1_rental'), assign('dale', 'o1_upkeep')], 0);
    until(s, (x) => minuteOfDay(x.t) >= 14 * 60);
    expect(s.people.director?.service).toBeCloseTo(d0 + 6 * 0.3);
    expect(s.people.dale?.service).toBe(dale0);
  });
});

describe('衰减（准则 6）', () => {
  it('放一天数字几乎不动；没人管的场一天掉 5，状况低于 30 设施质量贡献减半，低于 40 冒出清理工单', () => {
    const s = quiet(court1(fresh()));
    s.condition.outer_1 = 100;
    const q0 = facilityTotals(s, W()).quality;
    until(s, (x) => dayOf(x.t) === 2);
    expect(s.condition.outer_1).toBe(95);
    expect(facilityTotals(s, W()).quality).toBe(q0);
    s.condition.outer_1 = 25;
    expect(facilityTotals(s, W()).quality).toBe(q0 - 2.5);
    s.condition.outer_1 = 35;
    expect(orderStatus(s, W(), W().orders.get('o1_tidy') as never).visible).toBe(true);
  });

  it('维护岗位每圈修复，修多少看维护能力', () => {
    const s = quiet(court1(fresh()));
    s.condition.outer_1 = 50;
    advance(s, CONTENT, [assign('dale', 'o1_upkeep')], 60);
    expect(s.condition.outer_1).toBeCloseTo(50 + 4 * (0.5 + 40 / 100));
  });
});

describe('事件卡', () => {
  it('要总监亲自去办的选项：总监放下手上的岗位，走过去待一段时间，期间叫不回来', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_upkeep')], 0);
    const uid = open(s, 'iw_reporter');
    expect(optionStatus(s, W(), uid).find((o) => o.key === 'A')).toMatchObject({
      available: true,
      cost: 60,
      errand: { at: 'plaza', minutes: 120 },
    });
    const rep = s.stats.reputation ?? 0;
    const r = advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'A' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.stats.reputation).toBeCloseTo(rep + 6);
    expect(s.people.director?.job).toBeNull();
    expect(s.people.director?.errand?.at).toBe('plaza');
    expect(canAssign(s, W(), 'director', 'o1_upkeep')).toBe('busy');
    until(s, (x) => x.people.director?.errand === null);
    expect(s.people.director?.at).toBe('plaza');
    expect(s.log.find((x) => x.cause.kind === 'option')?.effects).toContainEqual({
      kind: 'errand',
      person: 'director',
      at: 'plaza',
      minutes: 120,
    });
  });

  it('现金不够的选项不能选', () => {
    const s = quiet(fresh());
    s.stats.cash = 10;
    const uid = open(s, 'iw_reporter');
    expect(optionStatus(s, W(), uid).find((o) => o.key === 'A')?.blocked).toBe('cost');
  });

  it('倒计时到了执行默认后果，并记成"默认"', () => {
    const s = quiet(fresh());
    open(s, 'iw_first_players');
    const cash = s.stats.cash ?? 0;
    advance(s, CONTENT, [], 6 * 60 + 1);
    expect(s.cards.open.some((o) => o.card === 'iw_first_players')).toBe(false);
    const e = s.log.find((x) => x.cause.kind === 'default' && x.cause.card === 'iw_first_players');
    expect(e?.cause).toEqual({ kind: 'default', card: 'iw_first_players', option: 'B' });
    expect(e?.effects).toContainEqual({ kind: 'stat', stat: 'cash', delta: 60 });
    expect(s.stats.cash).toBe(cash + 60);
  });

  it('大风扬沙：不管的话外场状况直接掉', () => {
    const s = quiet(court1(fresh()));
    const c = s.condition.outer_1 ?? 0;
    const uid = open(s, 'iw_sandstorm');
    advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'B' }], 0);
    expect(s.condition.outer_1).toBe(c - 25);
  });

  it('后续事件带着原因链：第二个招聘日指向安排它的那次选择', () => {
    const s = quiet(fresh());
    const uid = open(s, 'iw_hiring_day_1');
    advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'C' }], 0);
    const chose = s.log.at(-1);
    expect(until(s, (x) => x.cards.open.some((o) => o.card === 'iw_hiring_day_2'), 15 * 720)).toBe(true);
    expect(dayOf(s.t)).toBe(15);
    const next = s.cards.open.find((o) => o.card === 'iw_hiring_day_2');
    expect(next?.cause).toBe(chose?.id);
  });

  it('只出现一次的卡不会再打开一次', () => {
    const s = fresh();
    advance(s, CONTENT, [], 1);
    const uid = openUid(s, 'iw_arrival');
    advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'A' }], 0);
    s.cards.scheduled.push({ card: 'iw_arrival', at: s.t, cause: null });
    advance(s, CONTENT, [], 2);
    expect(s.cards.shown.iw_arrival).toBe(1);
    expect(s.flags.ball_machine_kept).toBe(true);
  });

  it('招聘日：招来的人从大门进来，能指派，工资每周扣；招来的教练接主教练，Dale 留下', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [{ type: 'chooseOption', uid: open(s, 'iw_hiring_day_1'), option: 'A' }], 0);
    advance(s, CONTENT, [{ type: 'chooseOption', uid: open(s, 'iw_hiring_day_2'), option: 'A' }], 0);
    expect(s.people.rosa_ortiz).toMatchObject({ hired: true, at: 'entrance', job: null });
    expect(canAssign(s, W(), 'rosa_ortiz', 'o1_upkeep')).toBeNull();
    expect(s.headCoach).toBe('jess_park');
    expect(s.people.dale?.hired).toBe(true);
    expect(Number(W().expr('wages_week').eval(makeEnv(s, W())))).toBe(150 + 180 + 260);
  });
});

describe('时间', () => {
  it('收盘时结算这一天，夜里跳过；人留在原地，第二天 8 点开门接着干', () => {
    const s = quiet(court1(fresh()));
    const cash = s.stats.cash ?? 0;
    const r = advance(s, CONTENT, [assign('director', 'o23_repair')], 12 * 60);
    expect(dayOf(s.t)).toBe(2);
    expect(minuteOfDay(s.t)).toBe(8 * 60);
    expect(r.events.some((e) => e.type === 'dayEnded' && e.day === 1)).toBe(true);
    expect(s.stats.cash).not.toBe(cash);
    expect(s.people.director).toMatchObject({ at: 'outer_23', job: 'o23_repair', walk: null });
    expect(at(2, 8)).toBe(s.t);
  });

  it('换季：冬天从第 36 天开始；天气按季节的权重抽', () => {
    const s = quiet(fresh(5));
    const seen = new Set<string>();
    until(
      s,
      (x) => {
        seen.add(x.weather);
        return dayOf(x.t) >= 36;
      },
      36 * 720,
    );
    expect(s.season).toBe('winter');
    expect(seen.size).toBeGreaterThan(1);
  });

  it('不操作时局面基本不动：一周里会员只在周日收盘时变化', () => {
    const s = quiet(court1(fresh(9)));
    s.stats.members = 10;
    advance(s, CONTENT, [], 5 * 720);
    expect(s.stats.members).toBe(10);
  });

  it('第 112 天收盘前没办成表演赛：期限到了，游戏结束', () => {
    const s = fresh(4);
    s.cards.open = [];
    s.t = at(112, 17);
    expect(until(s, (x) => x.outcome !== null, 4 * 60)).toBe(true);
    expect(s.outcome).toMatchObject({ result: 'lost', ending: 'deadline' });
  });
});

describe('条件', () => {
  it('all / any / not / 状态量 / 标记 / 设施 / 主教练 / 修好了几处', () => {
    const s = fresh();
    const w = W();
    expect(
      test(s, w, {
        all: [
          { stat: 'cash', gte: 3000 },
          { facility: 'outer_1', is: 'sanded' },
        ],
      }),
    ).toBe(true);
    expect(test(s, w, { any: [{ flag: 'nope' }, { coach: 'dale' }] })).toBe(true);
    expect(test(s, w, { not: { coach: 'none' } })).toBe(true);
    expect(test(s, w, { expr: 'stat.members == 0 && facility.stadium_1 == "ruined" && restored == 0' })).toBe(true);
    s.facilities.outer_1 = 'playable';
    expect(test(s, w, { expr: 'restored == 1' })).toBe(true);
  });
});

describe('确定性', () => {
  it('step 是纯函数：不改动输入状态', () => {
    const s = fresh();
    const before = stateHash(s);
    const r = step(s, CONTENT, [assign('director', 'o1_sweep')], 30);
    expect(stateHash(s)).toBe(before);
    expect(stateHash(r.state)).not.toBe(before);
  });

  it('同一种子加同一命令日志，重放后状态哈希一致', () => {
    for (const seed of [3, 11]) {
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
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 300);
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
    old.state.director = { at: 'outer_1', leg: null, route: [], task: null };
    const { save } = fromSave(old);
    expect(save.version).toBe(5);
    expect('legacy' in save.state).toBe(false);
    expect(save.state.cards.shown).toEqual({});
    expect(save.state.people.director).toMatchObject({ hired: true, at: 'outer_1', job: null });
    expect(save.state.people.dale).toMatchObject({ upkeep: 0, job: null, walk: null, routine: [] });
    expect('director' in save.state).toBe(false);
    expect('plan' in save.state).toBe(false);
    // 迁移后的存档能接着跑
    advance(save.state, CONTENT, [{ type: 'assign', person: 'director', target: 'o1_sweep' }], 120);
    expect(save.state.people.director?.job).toBe('o1_sweep');
  });

  it('不是存档、来自更新版本的存档都报错；内容版本不一致只警告', () => {
    expect(() => fromSave({ hello: 1 })).toThrow(SaveError);
    expect(() => fromSave({ ...toSave(fresh(), []), version: 99 })).toThrow(/newer/);
    expect(fromSave(toSave(fresh(), []), 'other').warnings[0]).toMatch(/content/);
  });
});

describe('整局', () => {
  it('贪心机器人能打完一局，结局写进状态，因果日志有原因', () => {
    const r = runGame(CONTENT, greedyBot(), 1);
    expect(r.outcome).not.toBeNull();
    expect(r.state.log.length).toBeGreaterThan(20);
    expect(r.state.log.some((e) => e.parent !== null)).toBe(true);
    expect(r.state.log.some((e) => e.cause.kind === 'order')).toBe(true);
  }, 20_000);

  it('放置不管的对照局：打得完（期限到了），什么都没修好', () => {
    const r = runGame(CONTENT, idleBot(), 1);
    expect(r.outcome).toMatchObject({ result: 'lost', ending: 'deadline' });
    expect(r.state.stats.restoration).toBe(0);
    expect(r.state.stats.quality ?? 0).toBeLessThan(30);
  }, 20_000);
});
