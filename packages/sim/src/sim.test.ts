import { CONTENT, type ContentBundle } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, idleBot, randomBot, runGame } from './bots';
import { optionStatus } from './cards';
import { run } from './effects';
import { advance, newGame, replay, stateHash, step } from './game';
import { fromSave, SaveError, toSave } from './save';
import { canAssign, orderLead, orderStatus, postStatus, workSkill } from './staff';
import { at, type CausalEntry, dayOf, type GameState, minuteOfDay, SAVE_VERSION, weekdayOf } from './state';
import { facilityTotals, hasDemand, makeEnv, num, qualityTarget, serviceRate, test } from './vars';
import { shortestRoute, walkEta } from './walk';
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
  it('导航图上的最短路：两两之间都有一条边，分钟数按画面里的步道换算（Palm Oasis，ADR 0018）', () => {
    expect(shortestRoute(W(), 'entrance', 'plaza')).toEqual({ route: ['plaza'], minutes: 25 });
    expect(shortestRoute(W(), 'entrance', 'outer_1')).toEqual({ route: ['outer_1'], minutes: 56 });
    expect(shortestRoute(W(), 'clubhouse', 'outer_1')?.minutes).toBe(43);
  });

  it('把总监拖到会员场的扫沙工单上：走 56 分钟，到了才开始干', () => {
    const s = quiet(fresh());
    const r = advance(s, CONTENT, [assign('director', 'o1_sweep')], 55);
    expect(r.accepted).toHaveLength(1);
    expect(s.people.director?.walk?.to).toBe('outer_1');
    expect(s.orders.o1_sweep).toBeUndefined();
    advance(s, CONTENT, [], 2);
    expect(s.people.director?.at).toBe('outer_1');
    expect(s.orders.o1_sweep?.progress).toBeGreaterThan(0);
  });

  it('走在半路改派：哪头近从哪头改道，不先走完整段（12 分钟时改派回大门 → 掉头，12 分钟到）', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 12);
    const t = s.t;
    const r = advance(s, CONTENT, [assign('director', 'flyers')], 0);
    expect(r.accepted).toHaveLength(1);
    // 掉头：这一段从 outer_1 往 entrance，出发时间往前推，此刻正好在原来那一点（离大门 12 分钟）
    expect(s.people.director?.walk).toMatchObject({
      from: 'outer_1',
      to: 'entrance',
      route: ['entrance'],
      end: t + 12,
    });
    expect(s.people.director?.walk?.start).toBe(t - (56 - 12));
    advance(s, CONTENT, [], 12);
    expect(s.people.director).toMatchObject({ at: 'entrance', walk: null, job: 'flyers' });
  });

  it('走在半路改派：往前近就接着往前（44 分钟时改派回大门以外的地方，经过终点更近）', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 44);
    const w = W();
    const t = s.t;
    // 总监现在离 outer_1 还有 12 分钟、离大门 44 分钟；去哪儿都按两头里近的算
    const best = (n: string) =>
      Math.min(
        12 + (shortestRoute(w, 'outer_1', n)?.minutes ?? 1e9),
        44 + (shortestRoute(w, 'entrance', n)?.minutes ?? 1e9),
      );
    expect(walkEta(s, w, 'director', 'outer_1')).toBe(12);
    expect(walkEta(s, w, 'director', 'entrance')).toBe(44);
    expect(walkEta(s, w, 'director', 'clubhouse')).toBe(best('clubhouse'));
    advance(s, CONTENT, [assign('director', 'flyers')], 0);
    expect(s.people.director?.walk).toMatchObject({ from: 'outer_1', route: ['entrance'], start: t - 12, end: t + 44 });
  });

  it('叫停走在路上的人：走到脚下这段路近的那一头站住，不再去原来的地方', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 12);
    let t = s.t;
    advance(s, CONTENT, [assign('director', null)], 0);
    expect(s.people.director).toMatchObject({ job: null, walk: { to: 'entrance', end: t + 12 } });
    advance(s, CONTENT, [], 12);
    expect(s.people.director).toMatchObject({ at: 'entrance', walk: null, job: null });
    expect(s.orders.o1_sweep).toBeUndefined();

    const s2 = quiet(fresh());
    advance(s2, CONTENT, [assign('director', 'o1_sweep')], 40);
    t = s2.t;
    advance(s2, CONTENT, [assign('director', null)], 0);
    expect(s2.people.director).toMatchObject({ job: null, walk: { from: 'entrance', to: 'outer_1', end: t + 16 } });
    advance(s2, CONTENT, [], 16);
    expect(s2.people.director).toMatchObject({ at: 'outer_1', walk: null, job: null });
    expect(s2.orders.o1_sweep).toBeUndefined();
  });

  it('半路掉头的走法能存档往返，接着跑结果一样', () => {
    const s = fresh(5);
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 12);
    advance(s, CONTENT, [assign('director', 'flyers')], 3);
    expect(s.people.director?.walk?.from).toBe('outer_1');
    const { save } = fromSave(JSON.parse(JSON.stringify(toSave(s, []))), CONTENT.version);
    advance(s, CONTENT, [], 60);
    advance(save.state, CONTENT, [], 60);
    expect(stateHash(save.state)).toBe(stateHash(s));
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
    // 复原（HUD）和变量 restored 是同一个数，修好的那一分钟就跟上，不等收盘
    advance(s, CONTENT, [], 1);
    expect(s.stats.restoration).toBe(1);
    expect(num(s, w, 'restored')).toBe(1);
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
    expect(vis('st1_exhibition')).toBe(false);
    // 表演赛要 ★4（GM-9）
    s.stars = 4;
    expect(vis('st1_exhibition')).toBe(true);
  });

  it('表演赛办成就通关', () => {
    const s = quiet(court1(fresh()));
    s.facilities.stadium_1 = 'restored';
    s.stats.reputation = 60;
    s.stars = 4;
    for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'stadium_1';
    advance(s, CONTENT, [assign('director', 'st1_exhibition'), assign('dale', 'st1_exhibition')], 0);
    // 结局方案 A（W4 内容打开了 ending）：办成不再结束这一局，记下表演赛、来结局卡；不写 ending 的旧行为见 ending.test.ts
    expect(until(s, (x) => x.ending.exhibition !== null || x.outcome !== null)).toBe(true);
    expect(s.outcome).toBeNull();
    expect(s.flags.exhibition_done).toBe(true);
    expect(until(s, (x) => x.cards.open.some((o) => o.card === 'iw_ending'), 5)).toBe(true);
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

/** 跑到下一个周日收盘，返回这一次的周结算日志 */
function toSettlement(s: GameState): CausalEntry & { cause: { kind: 'week' } } {
  const n = s.log.length;
  until(s, (x) => x.log.slice(n).some((e) => e.cause.kind === 'week'), 8 * 1440);
  return s.log.slice(n).find((e) => e.cause.kind === 'week') as CausalEntry & { cause: { kind: 'week' } };
}
const statDelta = (e: CausalEntry, stat: string) =>
  e.effects.find((x) => x.kind === 'stat' && x.stat === stat) as { delta: number } | undefined;

describe('周结算（GM-1：放着不管时数字的变化要讲得清）', () => {
  it('还没有开放的岗位：服务率是 0、不是凭空的 50%；周结算不算服务项和质量项（不倒扣）', () => {
    const s = quiet(fresh(37));
    expect(serviceRate(s)).toBe(0);
    expect(hasDemand(s)).toBe(false);
    expect(s.stats.service).toBe(0);
    const rep = s.stats.reputation ?? 0;
    const e = toSettlement(s);
    expect(e.cause).toMatchObject({ week: 1, demand: 0, served: 0, pass: 0.5, missed: null });
    expect(e.cause.rep).toMatchObject({ service: 0, quality: 0 });
    // 只剩修复项（开局什么都没修好：0）
    expect(s.stats.reputation).toBe(rep + (e.cause.rep.restored ?? 0));
    expect(s.week).toMatchObject({ demand: 0, lastDemand: 0, last: 0 });
  });

  it('工资和会费按天记进现金但不各写一条日志；周结算合成一条"本周工资 −$150"', () => {
    const s = quiet(fresh(37));
    const n = s.log.length;
    const e = toSettlement(s);
    expect(s.log.slice(n).filter((x) => x.cause.kind === 'day')).toEqual([]);
    expect(e.cause.money).toEqual({ dues: 0, income: 0, upkeep: 0, wages: 150 });
    expect(statDelta(e, 'cash')?.delta).toBe(-150);
    expect(s.stats.cash).toBeCloseTo(3000 - 150, 6);
  });

  it('质量的目标拆成几项，加起来就是目标；周结算讲这一周质量走了多少、在向哪个目标靠近', () => {
    const s = quiet(fresh(37));
    const q = qualityTarget(s, W());
    expect(Object.values(q.terms).reduce((a, b) => a + b, 0)).toBeCloseTo(q.total);
    expect(q.terms.service).toBe(0);
    const q0 = s.stats.quality ?? 0;
    const e = toSettlement(s);
    expect(e.cause.quality.target).toBeCloseTo(qualityTarget(s, W()).total, 0);
    expect(statDelta(e, 'quality')?.delta).toBeCloseTo((s.stats.quality ?? 0) - q0, 1);
  });

  it('有客人没人管：服务率 0 低于及格线，声望服务项 −1；周结算点名缺人最多的岗位', () => {
    const s = quiet(court1(fresh(9)));
    const e = toSettlement(s);
    expect(e.cause.demand).toBeGreaterThan(0);
    expect(e.cause.served).toBe(0);
    expect(e.cause.rep.service).toBe(-1);
    // 外场 1 看场 8–15 点每天 7 小时，比下午的课（工作日 15–19 点）空得多
    expect(e.cause.missed).toMatchObject({ post: 'o1_rental' });
    expect(s.week.lastDemand).toBe(e.cause.demand);
  });

  it('下雨的周日不会让会员退会：会员上限按修好的场地算，不按今天开着的', () => {
    const s = quiet(court1(fresh(9)));
    s.facilities.outer_23 = 'playable';
    s.facilities.clubhouse = 'open';
    s.stats.members = 40; // 上限 3 块场 × 12 + 会所 15 = 51
    until(s, (x) => weekdayOf(x.t) === 6 && minuteOfDay(x.t) >= 19 * 60);
    s.weather = 'rain';
    expect(facilityTotals(s, W()).courts).toBe(0);
    const e = toSettlement(s);
    expect(e.cause.members.cap).toBe(51);
    expect(s.stats.members ?? 0).toBeGreaterThanOrEqual(40);
  });

  it('超过上限的会员周末不续了：周结算写明场地撑得起多少人', () => {
    const s = quiet(court1(fresh(9)));
    s.stats.members = 30; // 上限 1 块场 × 12
    const e = toSettlement(s);
    expect(e.cause.members.cap).toBe(12);
    // 一周最多走掉 max(8, 30 × 25%) = 8 个（rules.week.member_loss_max），剩下的下周接着走
    expect(statDelta(e, 'members')?.delta).toBe(-8);
    expect(e.cause.members.loss_max).toBe(8);
    expect(s.stats.members).toBe(22);
    const e2 = toSettlement(s);
    expect(statDelta(e2, 'members')?.delta).toBe(-8);
    expect(s.stats.members).toBe(14);
  });

  it('一周最多走掉的会员按规则算（四分之一，至少 8）；没挡住时周结算不写 loss_max', () => {
    const s = quiet(court1(fresh(9)));
    s.stats.members = 80;
    const e = toSettlement(s);
    expect(statDelta(e, 'members')?.delta).toBe(-20);
    expect(e.cause.members.loss_max).toBe(20);
    const t = quiet(court1(fresh(9)));
    t.stats.members = 15;
    const f = toSettlement(t);
    expect(statDelta(f, 'members')?.delta).toBe(-3);
    expect(f.cause.members.loss_max).toBeUndefined();
  });

  it('员工特质的声望不每天漂：记在本周的账上，周日一起结算并写进周结算', () => {
    const s = quiet(court1(fresh(9)));
    const star = Object.values(s.people).find((p) => W().people.get(p.id)?.traits.includes('star'));
    expect(star).toBeDefined();
    (star as { hired: boolean }).hired = true;
    const rep = s.stats.reputation ?? 0;
    until(s, (x) => dayOf(x.t) === 3);
    expect(s.stats.reputation).toBe(rep);
    const e = toSettlement(s);
    expect(e.cause.rep.traits ?? 0).toBeGreaterThan(0);
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
  it('人-13：派去工单的人做完以前不被习惯拉走（第二天看场开门也不去）；做完回到原来的岗位，关着就闲着、第二天照习惯去', () => {
    const s = quiet(court1(fresh()));
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    // 总监白天看场；15 点关门后派他去修外场 2–3（12 小时的活）
    expect(until(s, (x) => minuteOfDay(x.t) >= 15 * 60, 8 * 60)).toBe(true);
    advance(s, CONTENT, [assign('director', 'o23_repair')], 0);
    expect(s.people.director?.back).toBe('o1_rental');
    // 第二天 9 点：看场早就开门了，他还在修
    expect(until(s, (x) => dayOf(x.t) === 2 && minuteOfDay(x.t) >= 9 * 60, 30 * 60)).toBe(true);
    expect(s.people.director?.job).toBe('o23_repair');
    // 修完（第二天傍晚，看场已经关门）：回不去，闲着
    expect(until(s, (x) => (x.orderLog.done.o23_repair ?? 0) > 0, 30 * 60)).toBe(true);
    expect(s.people.director?.job).toBeNull();
    expect(s.people.director?.back).toBeNull();
    // 第三天 8 点照习惯回去看场
    expect(until(s, (x) => x.people.director?.job === 'o1_rental', 24 * 60)).toBe(true);
    expect(dayOf(s.t)).toBe(3);
  });
  it('人-13：从开着的岗位派去一张小工单，做完当场走回原来的岗位（发 returned）', () => {
    const s = quiet(court1(fresh()));
    s.condition.outer_1 = 30; // 冒出清理工单
    advance(s, CONTENT, [assign('director', 'o1_rental')], 60);
    expect(s.people.director?.job).toBe('o1_rental');
    advance(s, CONTENT, [assign('director', 'o1_tidy')], 0);
    const events: string[] = [];
    for (let i = 0; i < 6 * 60 && !(s.orderLog.done.o1_tidy ?? 0); i++)
      events.push(...advance(s, CONTENT, [], 1).events.map((e) => e.type));
    expect(events).toContain('returned');
    expect(s.people.director?.job).toBe('o1_rental');
    expect(minuteOfDay(s.t)).toBeLessThan(15 * 60);
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
  it('能力跨过整十时发一个事件（界面上的快讯）', () => {
    const s = quiet(court1(fresh()));
    (s.people.director as { service: number }).service = 49.9;
    advance(s, CONTENT, [assign('director', 'o1_rental')], 0);
    let grew = null as unknown;
    for (let i = 0; i < 90 && !grew; i++)
      grew = advance(s, CONTENT, [], 1).events.find((e) => e.type === 'directorGrew') ?? null;
    expect(grew).toEqual({ type: 'directorGrew', skill: 'service', value: 50 });
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

  it('掉档：周日收盘时状况低于 15 掉一档，岗位停开，冒出重开工单；做完回到原来那档', () => {
    const s = quiet(court1(fresh()));
    const w = W();
    s.facilities.outer_23 = 'playable';
    s.condition.outer_23 = 30; // 一天掉 5：周日收盘时 30 − 7×5 < 15
    s.condition.outer_1 = 100; // 外场 1 一周掉 35，还在 15 以上：不掉
    const vis = (o: string) => orderStatus(s, w, w.orders.get(o) as never).visible;
    // 周一到周六收盘都不掉，哪怕已经低于 15
    until(s, (x) => dayOf(x.t) === 7);
    expect(s.condition.outer_23).toBeLessThan(15);
    expect(s.facilities.outer_23).toBe('playable');
    const r = advance(s, CONTENT, [], 12 * 60);
    expect(dayOf(s.t)).toBe(8);
    expect(s.facilities.outer_23).toBe('worn');
    expect(s.facilities.outer_1).toBe('playable');
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'facilityWorn', facility: 'outer_23', from: 'playable', to: 'worn' }),
    );
    const entry = s.log.find((e) => e.cause.kind === 'wear');
    expect(entry?.cause).toMatchObject({ kind: 'wear', facility: 'outer_23' });
    expect(entry?.effects).toContainEqual({ kind: 'facility', facility: 'outer_23', state: 'worn' });
    // 停用：岗位不开、不算场地、不再变旧；清理工单换成重开工单
    for (const p of ['o23_rental', 'o23_clinic', 'o23_upkeep'])
      expect(postStatus(s, w, w.posts.get(p) as never).exists).toBe(false);
    expect(facilityTotals(s, w).courts).toBe(1);
    expect(vis('o23_tidy')).toBe(false);
    expect(vis('o23_reopen')).toBe(true);
    const c = s.condition.outer_23 as number;
    until(s, (x) => dayOf(x.t) === 9);
    expect(s.condition.outer_23).toBe(c);
    // 修复主线不倒退：停用的外场 2–3 照样算练习场的前提
    expect(vis('pr_repair')).toBe(true);
    // 重开：扣材料费，做完回到"修好了"，状况 +50
    for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_23';
    const cash = s.stats.cash as number;
    advance(s, CONTENT, [assign('director', 'o23_reopen'), assign('dale', 'o23_reopen')], 0);
    expect(until(s, (x) => x.facilities.outer_23 === 'playable', 600)).toBe(true);
    expect(s.stats.cash).toBe(cash - 75);
    expect(s.condition.outer_23).toBeCloseTo(c + 50);
  });

  it('修好了几处只有一个说法：掉档停用不算、重开当场又算，复原 stat 和变量 restored、星级清单一直一致', () => {
    const s = quiet(court1(fresh()));
    const w = W();
    s.facilities.practice = 'open';
    s.condition.practice = 20; // 一天掉 4：周日收盘时低于 15，掉成停用
    s.condition.outer_1 = 100;
    const same = () => {
      expect(s.stats.restoration).toBe(num(s, w, 'restored'));
      expect(test(s, w, { expr: 'restored >= 2' })).toBe((s.stats.restoration ?? 0) >= 2);
    };
    advance(s, CONTENT, [], 1);
    expect(s.stats.restoration).toBe(2);
    same();
    until(s, (x) => dayOf(x.t) === 8);
    expect(s.facilities.practice).toBe('worn');
    expect(s.stats.restoration).toBe(1);
    same();
    // 白天重开：做完的下一分钟复原就回到 2（不等收盘）
    for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'practice';
    advance(s, CONTENT, [assign('director', 'pr_reopen'), assign('dale', 'pr_reopen')], 0);
    expect(until(s, (x) => x.facilities.practice === 'open', 600)).toBe(true);
    expect(dayOf(s.t)).toBe(8);
    advance(s, CONTENT, [], 1);
    expect(s.stats.restoration).toBe(2);
    same();
    // 改造停用期间也不算，期满又算
    s.remodels.practice = { variant: 'bootcamp', until: s.t + 60 };
    advance(s, CONTENT, [], 1);
    expect(s.stats.restoration).toBe(1);
    same();
    advance(s, CONTENT, [], 60);
    expect(s.stats.restoration).toBe(2);
    same();
  });

  it('掉档一周最多一档：新铺的外场 1 先掉回旧场地（可以补面），再一周才停用；废墟不掉档', () => {
    const s = quiet(fresh());
    const w = W();
    s.facilities.outer_1 = 'resurfaced';
    s.flags.o1_resurfaced = true;
    s.condition.outer_1 = 5;
    s.condition.outer_23 = 0; // 还是废墟
    until(s, (x) => dayOf(x.t) === 8);
    expect(s.facilities.outer_1).toBe('playable');
    expect(orderStatus(s, w, w.orders.get('o1_refinish') as never).visible).toBe(true);
    expect(orderStatus(s, w, w.orders.get('o1_resurface') as never).visible).toBe(true);
    s.orderLog.done.o1_resurface = 1;
    expect(orderStatus(s, w, w.orders.get('o1_resurface') as never).visible).toBe(false);
    until(s, (x) => dayOf(x.t) === 15);
    expect(s.facilities.outer_1).toBe('worn');
    expect(s.facilities.outer_23).toBe('ruined');
  });

  it('幕规则 grade_drop_below 为 0 时不掉档', () => {
    const c = structuredClone(CONTENT) as ContentBundle & { version: string };
    (c.acts[0] as { rules: { grade_drop_below: number } }).rules.grade_drop_below = 0;
    c.version += '+nodrop';
    const s = quiet(court1(newGame(c, { seed: 1 })));
    s.condition.outer_1 = 0;
    until(s, (x) => dayOf(x.t) === 8, 20000, c);
    expect(s.facilities.outer_1).toBe('playable');
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

  it('现金是负的时候，不花钱的选项和工单照样能选、能开工', () => {
    const s = quiet(court1(fresh()));
    s.stats.cash = -500;
    const uid = open(s, 'iw_sponsor');
    expect(optionStatus(s, W(), uid).every((o) => o.available)).toBe(true);
    s.facilities.outer_1 = 'sanded';
    expect(canAssign(s, W(), 'director', 'o1_sweep')).toBeNull();
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 30);
    expect(s.orders.o1_sweep?.progress).toBeGreaterThan(0);
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
    // 第二个招聘日来哪一拨人按种子抽：a 或 b，只来一张
    const second = (o: { card: string }) => o.card.startsWith('iw_hiring_day_2');
    expect(s.cards.scheduled.filter(second)).toHaveLength(1);
    expect(until(s, (x) => x.cards.open.some(second), 15 * 720)).toBe(true);
    expect(dayOf(s.t)).toBe(15);
    const next = s.cards.open.find(second);
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

  it('辞掉接任的主教练：Dale 接回主教练', () => {
    const s = quiet(fresh());
    advance(s, CONTENT, [{ type: 'chooseOption', uid: open(s, 'iw_hiring_day_2'), option: 'A' }], 0);
    expect(s.headCoach).toBe('jess_park');
    run({ s, w: W(), events: [] }, { kind: 'debug', what: 'fire' }, null, [{ fire: 'jess_park' }]);
    expect(s.people.jess_park?.hired).toBe(false);
    expect(s.headCoach).toBe('dale');
  });
});

describe('人物的作用（docs/design/people.md）', () => {
  const hire = (s: GameState, ...ids: string[]) =>
    run(
      { s, w: W(), events: [] },
      { kind: 'debug', what: 'hire' },
      null,
      ids.map((id) => ({ hire: id })),
    );

  it('特质的加成只在条件下生效：沙漠长大的 Rosa 大风天维护更快；双语一直 +10', () => {
    const s = quiet(fresh());
    hire(s, 'rosa_ortiz');
    s.weather = 'sun';
    expect(workSkill(s, W(), 'rosa_ortiz', 'upkeep')).toBe(62);
    expect(workSkill(s, W(), 'rosa_ortiz', 'service')).toBe(38);
    s.weather = 'wind';
    expect(workSkill(s, W(), 'rosa_ortiz', 'upkeep')).toBe(77);
  });

  it('只收特定的人的岗位：没招到穿线师时穿线台不存在；招来以后只有她能坐', () => {
    const s = quiet(fresh());
    s.facilities.clubhouse = 'open';
    const w = W();
    const bench = w.posts.get('ch_stringing');
    if (!bench) throw new Error('no stringing post');
    expect(postStatus(s, w, bench).exists).toBe(false);
    hire(s, 'teo_ilic');
    expect(postStatus(s, w, bench).exists).toBe(true);
    expect(canAssign(s, w, 'teo_ilic', 'ch_stringing')).toBeNull();
    expect(canAssign(s, w, 'director', 'ch_stringing')).toBe('only');
    // 普通岗位谁都能干
    expect(canAssign(s, w, 'teo_ilic', 'ch_desk')).toBeNull();
  });

  it('球员自己练球，球技一圈一圈地涨；总监不能去', () => {
    const s = quiet(fresh());
    s.facilities.practice = 'open';
    hire(s, 'amara_okafor');
    (s.people.amara_okafor as { at: string }).at = 'practice';
    expect(canAssign(s, W(), 'director', 'pr_training')).toBe('only');
    advance(s, CONTENT, [assign('amara_okafor', 'pr_training')], 5 * 60 + 5);
    expect(s.people.amara_okafor?.play).toBeCloseTo(56.5, 5);
  });

  it('出去打比赛：成功率看去的人的球技；打完球技 +1、声望 +1 起', () => {
    const s = quiet(fresh());
    s.stats.cash = 2000;
    const w = W();
    const o = w.orders.get('pl_tournament');
    if (!o) throw new Error('no tournament');
    expect(orderStatus(s, w, o).visible).toBe(false);
    hire(s, 'amara_okafor', 'luca_ferreira');
    // 还没人去：按能去的人里球技最高的估（Luca 66 + 天才少年 8）
    expect(orderLead(s, w, o)).toEqual({ id: 'luca_ferreira', skill: 74 });
    expect(orderStatus(s, w, o).chance).toBeCloseTo(0.1 + 24 / 45, 5);
    const rep = s.stats.reputation ?? 0;
    advance(s, CONTENT, [assign('amara_okafor', 'pl_tournament')], 1);
    expect(orderStatus(s, w, o).chance).toBeCloseTo(0.1 + 6 / 45, 5);
    expect(until(s, (x) => (x.orderLog.done.pl_tournament ?? 0) > 0, 3 * 720)).toBe(true);
    expect(s.people.amara_okafor?.play).toBe(57);
    expect(s.stats.reputation ?? 0).toBeGreaterThanOrEqual(rep + 1);
  });

  it('退役名将在园区，表演赛的成功率 +5%', () => {
    const s = quiet(fresh());
    const w = W();
    const o = w.orders.get('st1_exhibition');
    if (!o) throw new Error('no exhibition');
    s.stats.reputation = 60;
    s.stats.quality = 60;
    const before = orderStatus(s, w, o).chance ?? 0;
    hire(s, 'nadia_volkov');
    expect((orderStatus(s, w, o).chance ?? 0) - before).toBeCloseTo(0.05, 5);
  });

  it('旧档里没有的新候选人，招的时候按内容补上', () => {
    const s = quiet(fresh());
    delete s.people.mateo_salgado;
    hire(s, 'mateo_salgado');
    expect(s.people.mateo_salgado).toMatchObject({ hired: true, at: 'entrance', play: 42, routine: [] });
  });

  it('每个候选人都出现在某个招聘日上，每个招聘日都是两个人', () => {
    const hires = CONTENT.cards
      .filter((c) => c.id.startsWith('iw_hiring_day_'))
      .map((c) => Object.values(c.options).flatMap((o) => o?.effects.filter((e) => 'hire' in e) ?? []));
    for (const h of hires) expect(h).toHaveLength(2);
    const ids = hires.flat().map((e) => ('hire' in e ? e.hire : ''));
    const candidates = CONTENT.people.filter((p) => p.role === 'candidate').map((p) => p.id);
    expect(new Set(ids)).toEqual(new Set(candidates));
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
    const s = fresh(5);
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

  it('第 112 天 18 点没办成表演赛：结算打分（结局方案 A），期限卡不再判输', () => {
    const s = fresh(4);
    s.cards.open = [];
    s.t = at(112, 17);
    expect(until(s, (x) => x.outcome !== null, 4 * 60)).toBe(true);
    expect(s.outcome).toMatchObject({ result: 'settled', ending: 'score', t: at(112, 18) });
    expect(s.ending.settlement?.reason).toBe('deadline');
    expect(s.cards.shown.iw_deadline ?? 0).toBe(0);
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

  it('修好了几处只算给园区加分的状态：扫完沙、挖完沙、清完碎石还不算（e7：扫完沙 HUD 就写"复原 1/8"）', () => {
    const s = fresh();
    const w = W();
    s.facilities.outer_1 = 'swept';
    s.facilities.stadium_3 = 'dug';
    s.facilities.stadium_1 = 'cleared';
    expect(num(s, w, 'restored')).toBe(0);
    s.facilities.stadium_3 = 'open';
    expect(num(s, w, 'restored')).toBe(1);
  });
});

describe('停滞和闲着（e7）', () => {
  it('idle_days：在职的人里闲得最久的那个连续闲了几个营业日；派上活就清零', () => {
    const s = quiet(fresh());
    const w = W();
    expect(num(s, w, 'idle_days')).toBe(0);
    advance(s, CONTENT, [], 360);
    expect(num(s, w, 'idle_days')).toBeCloseTo(0.5, 5);
    advance(s, CONTENT, [assign('director', 'o1_sweep')], 1);
    // Dale 还闲着
    expect(num(s, w, 'idle_days')).toBeCloseTo(361 / 720, 5);
    advance(s, CONTENT, [assign('dale', 'o1_sweep')], 1);
    expect(num(s, w, 'idle_days')).toBe(0);
  });

  it('quiet_days：离上一张卡打开过了几天（任何来源）', () => {
    const s = fresh();
    const w = W();
    advance(s, CONTENT, [], 1);
    expect(s.cards.lastOpened).toBe(s.t - 1);
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    s.cards.scheduled = [];
    until(s, (x) => dayOf(x.t) === 4);
    expect(num(s, w, 'quiet_days')).toBeGreaterThanOrEqual(2.5);
    open(s, 'iw_reporter');
    expect(num(s, w, 'quiet_days')).toBeLessThan(0.01);
  });

  it('开局的发球机卡放着不管一天就按"留着"处理，不会一直开着把导演堵住', () => {
    const s = fresh();
    advance(s, CONTENT, [], 1);
    expect(s.cards.open.map((o) => o.card)).toEqual(['iw_arrival']);
    expect(until(s, (x) => !x.cards.open.some((o) => o.card === 'iw_arrival'), 2000)).toBe(true);
    expect(s.flags.ball_machine_kept).toBe(true);
    expect(s.log.some((e) => e.cause.kind === 'default' && e.cause.card === 'iw_arrival')).toBe(true);
  });

  it('task 效果：把下一件修复交给 Dale，他闲着就自己走过去开工，材料费开工时扣', () => {
    const s = quiet(fresh());
    s.facilities.outer_1 = 'swept';
    const uid = open(s, 'iw_dale_nudge');
    expect(advance(s, CONTENT, [{ type: 'chooseOption', uid, option: 'A' }], 0).accepted).toHaveLength(1);
    expect(s.people.dale?.resume).toBe('o1_net');
    // 习惯系统每 10 分钟看一次
    expect(until(s, (x) => x.people.dale?.job === 'o1_net', 20)).toBe(true);
    expect(until(s, (x) => x.facilities.outer_1 === 'playable', 600)).toBe(true);
    expect(s.stats.cash).toBe(3000 - 120);
    expect(s.log.some((e) => e.effects.some((r) => r.kind === 'task' && r.order === 'o1_net'))).toBe(true);
  });

  it('Dale 来找你：有人闲了一天半、手边有开局的修复才来；不处理就什么都不动（准则 6）', () => {
    const s = fresh();
    const w = W();
    advance(s, CONTENT, [assign('director', 'o1_sweep'), assign('dale', 'o1_sweep')], 0);
    expect(until(s, (x) => x.cards.open.some((o) => o.card === 'iw_dale_nudge'), 6 * 1440)).toBe(true);
    expect(num(s, w, 'idle_days')).toBeGreaterThanOrEqual(1.5);
    expect(s.facilities.outer_1).toBe('swept');
    expect(until(s, (x) => !x.cards.open.some((o) => o.card === 'iw_dale_nudge'), 1440)).toBe(true);
    expect(s.facilities.outer_1).toBe('swept');
    expect(s.people.dale?.resume ?? null).toBeNull();
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
  }, 30_000); // 整局跑四遍，CI 机器慢，给足时间

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
      for (const k of ['upkeep', 'service', 'play', 'job', 'walk', 'errand', 'routine']) delete p[k];
    old.state.director = { at: 'outer_1', leg: null, route: [], task: null };
    const { save } = fromSave(old);
    expect(save.version).toBe(SAVE_VERSION);
    expect('legacy' in save.state).toBe(false);
    expect(save.state.cards.shown).toEqual({});
    expect(save.state.people.director).toMatchObject({ hired: true, at: 'outer_1', job: null });
    expect(save.state.people.dale).toMatchObject({ upkeep: 0, play: 0, job: null, walk: null, routine: [] });
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

  it('放置不管的对照局：打得完（第 112 天结算，最后一档），什么都没修好', () => {
    const r = runGame(CONTENT, idleBot(), 1);
    expect(r.outcome).toMatchObject({ result: 'settled', ending: 'score' });
    expect(r.state.ending.settlement?.grade).toBe('D');
    expect(r.state.stats.restoration).toBe(0);
    expect(r.state.stats.quality ?? 0).toBeLessThan(30);
  }, 20_000);
});
