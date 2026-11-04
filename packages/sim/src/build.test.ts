import { CONTENT, type ContentBundle, type Order, type Post } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, humanBot, humanProfile, runGame } from './bots';
import type { SimEvent } from './events';
import { advance, newGame, replay, stateHash } from './game';
import { fromSave, toSave } from './save';
import { canAssign, orderStatus, postStatus } from './staff';
import { starStatus } from './stars';
import { at, type GameState, SAVE_VERSION } from './state';
import { facilityTotals, num, stateDef, test } from './vars';
import { worldFor } from './world';

/**
 * 修复变体、升级、改造、牌匾（LG-14）和星级、奖杯（LG-10）。
 * 内容里还没写这些（GM-13、GM-9 之后才有），这里给 Indian Wells 补一份小小的示例：
 * 红土场 clay / hard 两个变体、一个只给 clay 的升级（要维护 ≥ 75 的人）、改成硬地的改造；
 * 一个只在硬地才开的岗位；两星的清单（第二星带橡皮筋）和一张月度内赛工单。
 */
function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-build-fixture`;
  const f = c.facilities.find((x) => x.id === 'outer_23');
  if (!f) throw new Error('no outer_23');
  f.variants = { clay: {}, hard: { states: { playable: { decay_day: 2, quality: 12 } } } };
  f.upgrades = { tournament_clay: { variant: 'clay', states: { playable: { quality: 3, income_week: 50 } } } };
  const repair = c.orders.find((x) => x.id === 'o23_repair') as Order;
  repair.variants = { clay: {}, hard: { cost: 1200, work: '14h', effects: [{ stat: 'reputation', add: 1 }] } };
  const base: Omit<Order, 'id'> = {
    act: 'indian_wells',
    at: 'outer_23',
    skill: 'upkeep',
    work: '2h',
    cost: 100,
    crew: 2,
    once: false,
    restore: 0,
    effects: [],
    onSuccess: [],
    onFail: [],
    when: { facility: 'outer_23', is: 'playable' },
  };
  c.orders.push(
    { ...base, id: 'o23_pro', upgrade: 'tournament_clay', worker: { upkeep: 75 } },
    { ...base, id: 'o23_remodel', cost: 500, work: '1h', remodel: 'hard', closed_for: '7d' },
    {
      ...base,
      id: 'cup',
      at: 'outer_1',
      skill: 'service',
      cost: 0,
      cooldown: '28d',
      when: { expr: 'stars >= 1' },
      effects: [{ trophy: 1 }, { flag: 'hosted_cup', set: true }],
    },
  );
  const rental = c.posts.find((x) => x.id === 'o23_rental') as Post;
  c.posts.push({
    ...rental,
    id: 'o23_hard_league',
    when: {
      all: [
        { facility: 'outer_23', is: 'playable' },
        { variant: 'outer_23', is: 'hard' },
      ],
    },
  });
  const act = c.acts.find((a) => a.id === 'indian_wells');
  if (!act) throw new Error('no act');
  act.stars = [
    { requires: { members: { stat: 'members', gte: 5 } }, opens: ['internal_cup'] },
    {
      requires: {
        cup: { flag: 'hosted_cup' },
        trophies: { expr: 'trophies >= 1' },
        // 橡皮筋：第 12 周（第 78 天）起会员门槛降两成
        members: { expr: 'stat.members >= (day >= 78 ? 8 : 10)' },
      },
      opens: ['regional'],
    },
  ];
  return c;
}

const FIX = fixture();
const W = () => worldFor(FIX, 'indian_wells');
const assign = (person: string, target: string | null, variant?: string) =>
  ({ type: 'assign', person, target, ...(variant ? { variant } : {}) }) as const;

/** 关掉卡；会员场能打；两个人站在红土场边上 */
function ready(seed = 1): GameState {
  const s = newGame(FIX, { seed });
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  s.facilities.outer_1 = 'playable';
  for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_23';
  return s;
}
function until(s: GameState, f: (s: GameState) => boolean, max = 30000, events?: SimEvent[]) {
  for (let i = 0; i < max && !f(s); i++) {
    const r = advance(s, FIX, [], 1);
    events?.push(...r.events);
  }
  return f(s);
}
const order = (id: string) => W().orders.get(id) as Order;

describe('修复变体（LG-14）', () => {
  it('修复工单列出变体；拖到哪一行就按哪一行算钱；第一个人到场扣材料费、锁定变体', () => {
    const s = ready();
    const w = W();
    let st = orderStatus(s, w, order('o23_repair'));
    expect(st.variants).toEqual(['clay', 'hard']);
    expect(st.variant).toBe('clay');
    expect(st.cost).toBe(900);
    expect(canAssign(s, w, 'director', 'o23_repair', 'grass')).toBe('variant');
    const cash = s.stats.cash ?? 0;
    const r = advance(s, FIX, [assign('director', 'o23_repair', 'hard')], 1);
    st = orderStatus(s, w, order('o23_repair'));
    expect(st.variant).toBe('hard');
    expect(st.cost).toBe(1200);
    expect(st.locked).toBe(true);
    expect(s.stats.cash).toBe(cash - 1200);
    expect(s.variants.outer_23).toBe('hard');
    expect(r.events).toContainEqual({
      type: 'variant_locked',
      facility: 'outer_23',
      variant: 'hard',
      order: 'o23_repair',
    });
    // 锁定以后只能按锁定的那个加人；不写变体就是加入
    expect(canAssign(s, w, 'dale', 'o23_repair', 'clay')).toBe('variant');
    expect(canAssign(s, w, 'dale', 'o23_repair')).toBeNull();
  });

  it('还没开工可以改选：同一个人拖到另一行只换变体', () => {
    const s = ready();
    (s.people.director as { at: string }).at = 'entrance';
    const w = W();
    advance(s, FIX, [assign('director', 'o23_repair', 'hard')], 1);
    expect(s.picks.o23_repair).toBe('hard');
    expect(s.variants.outer_23).toBeUndefined();
    advance(s, FIX, [assign('director', 'o23_repair', 'clay')], 1);
    expect(s.picks.o23_repair).toBe('clay');
    expect(orderStatus(s, w, order('o23_repair')).cost).toBe(900);
    expect(s.people.director?.job).toBe('o23_repair');
  });

  it('修好以后：变体覆盖这一档的数值，变体条件开出只属于它的岗位；牌匾记下带队的人和第几天', () => {
    const s = ready();
    const w = W();
    const events: SimEvent[] = [];
    events.push(...advance(s, FIX, [assign('director', 'o23_repair', 'hard'), assign('dale', 'o23_repair')], 1).events);
    expect(until(s, (x) => x.facilities.outer_23 === 'playable', 30000, events)).toBe(true);
    expect(stateDef(s, w, 'outer_23')).toMatchObject({ courts: 2, quality: 12, decay_day: 2 });
    expect(test(s, w, { variant: 'outer_23', is: 'hard' })).toBe(true);
    expect(test(s, w, { variant: 'outer_3' as string, is: 'none' })).toBe(true);
    expect(num(s, w, 'variant.outer_23 == "hard" ? 1 : 0')).toBe(1);
    expect(postStatus(s, w, w.posts.get('o23_hard_league') as Post).exists).toBe(true);
    // 变体的追加效果（声望 +1）和变体记进这张工单的因果日志
    const entry = s.log.find((e) => e.cause.kind === 'order' && e.cause.order === 'o23_repair');
    expect(entry?.effects).toContainEqual({ kind: 'variant', facility: 'outer_23', variant: 'hard' });
    expect(entry?.effects).toContainEqual({ kind: 'plaque', facility: 'outer_23', leader: expect.any(String) });
    expect(s.plaque).toHaveLength(1);
    const row = s.plaque[0];
    // 总监维护 35、Dale 40：一起干，Dale 做得多，他带队
    expect(row).toMatchObject({ facility: 'outer_23', variant: 'hard', leader: 'dale', order: 'o23_repair' });
    expect(row?.crew.sort()).toEqual(['dale', 'director']);
    expect(row?.work).toBe(14 * 60);
    expect(row?.minutes).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'plaque_added' && e.facility === 'outer_23' && e.leader === 'dale')).toBe(
      true,
    );
  });

  it('牌匾带队按整处设施累计：分两张工单修、中途停工换人接着干，最后到场的人不算带队', () => {
    const s = newGame(FIX, { seed: 2 });
    s.cards.scheduled = [];
    s.cards.open = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    for (const id of ['director', 'dale']) (s.people[id] as { at: string }).at = 'outer_1';
    // 扫沙：Dale 干一会儿就走（停工），总监接着把它扫完
    advance(s, FIX, [assign('dale', 'o1_sweep')], 1);
    advance(s, FIX, [], 90);
    advance(s, FIX, [assign('dale', null)], 1);
    const paused = s.orders.o1_sweep;
    expect(paused?.started).toBe(true);
    const dale = paused?.by?.dale ?? 0;
    expect(dale).toBeGreaterThan(0);
    advance(s, FIX, [], 30);
    expect(s.orders.o1_sweep?.by?.dale).toBe(dale); // 停工期间进度和每人的账都留着
    advance(s, FIX, [assign('dale', 'o1_sweep'), assign('director', 'o1_sweep')], 1);
    expect(until(s, (x) => x.facilities.outer_1 === 'swept')).toBe(true);
    expect(s.plaque).toEqual([]);
    // 换网：只有总监去（最后到场的人），整处设施 Dale 做得多，还是 Dale 带队
    advance(s, FIX, [assign('director', 'o1_net')], 1);
    expect(until(s, (x) => x.facilities.outer_1 === 'playable')).toBe(true);
    const row = s.plaque[0];
    expect(row).toMatchObject({ facility: 'outer_1', order: 'o1_net', leader: 'dale' });
    expect(row?.crew).toEqual(['dale', 'director']);
    expect(row?.work).toBe(orderStatus(s, W(), order('o1_sweep')).work + orderStatus(s, W(), order('o1_net')).work);
    expect(s.repairs?.outer_1).toBeUndefined();
  });

  it('没写变体的工单照旧：修好了也记牌匾（会员场），没有变体', () => {
    const s = newGame(FIX, { seed: 2 });
    s.cards.scheduled = [];
    s.cards.open = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    s.facilities.outer_1 = 'swept';
    (s.people.director as { at: string }).at = 'outer_1';
    advance(s, FIX, [assign('director', 'o1_net')], 1);
    expect(until(s, (x) => x.facilities.outer_1 === 'playable')).toBe(true);
    expect(s.plaque).toEqual([expect.objectContaining({ facility: 'outer_1', leader: 'director', order: 'o1_net' })]);
    expect(s.plaque[0]?.variant).toBeUndefined();
    expect(s.variants).toEqual({});
  });
});

describe('升级和改造（LG-14）', () => {
  /** 红土场已经修成 clay */
  const clay = (seed = 1) => {
    const s = ready(seed);
    s.facilities.outer_23 = 'playable';
    s.variants.outer_23 = 'clay';
    s.condition.outer_23 = 80;
    return s;
  };

  it('升级工单要维护 ≥ 75 的人：不够的人 canAssign 给 skill；只给 clay 的升级在 hard 上不出现', () => {
    const s = clay();
    const w = W();
    expect(orderStatus(s, w, order('o23_pro')).worker).toEqual({ upkeep: 75 });
    expect(canAssign(s, w, 'director', 'o23_pro')).toBe('skill');
    (s.people.dale as { upkeep: number }).upkeep = 80;
    expect(canAssign(s, w, 'dale', 'o23_pro')).toBeNull();
    s.variants.outer_23 = 'hard';
    expect(orderStatus(s, w, order('o23_pro')).visible).toBe(false);
  });

  it('升级做完：装上，数值加在这一档上，工单不再出现', () => {
    const s = clay();
    const w = W();
    (s.people.dale as { upkeep: number }).upkeep = 80;
    const q0 = stateDef(s, w, 'outer_23')?.quality ?? 0;
    const events: SimEvent[] = [];
    events.push(...advance(s, FIX, [assign('dale', 'o23_pro')], 1).events);
    expect(until(s, (x) => (x.upgrades.outer_23 ?? []).length > 0, 30000, events)).toBe(true);
    expect(s.upgrades.outer_23).toEqual(['tournament_clay']);
    expect(stateDef(s, w, 'outer_23')).toMatchObject({ quality: q0 + 3, income_week: 50 });
    expect(test(s, w, { upgrade: 'outer_23', has: 'tournament_clay' })).toBe(true);
    expect(orderStatus(s, w, order('o23_pro')).visible).toBe(false);
    expect(events).toContainEqual({
      type: 'upgrade_done',
      facility: 'outer_23',
      upgrade: 'tournament_clay',
      order: 'o23_pro',
    });
  });

  it('改造：付钱，做完停用一周（没有场地、岗位不开、不掉状况），然后换成硬地；只给红土的升级拆掉', () => {
    const s = clay();
    const w = W();
    s.upgrades.outer_23 = ['tournament_clay'];
    expect(orderStatus(s, w, order('o23_remodel')).visible).toBe(true);
    const cash = s.stats.cash ?? 0;
    const events: SimEvent[] = [];
    events.push(...advance(s, FIX, [assign('director', 'o23_remodel')], 1).events);
    expect(s.stats.cash).toBe(cash - 500);
    expect(until(s, (x) => !!x.remodels.outer_23, 30000, events)).toBe(true);
    const r = s.remodels.outer_23;
    expect(r?.variant).toBe('hard');
    expect(events.some((e) => e.type === 'remodel_started' && e.facility === 'outer_23')).toBe(true);
    // 停用中
    expect(postStatus(s, w, w.posts.get('o23_rental') as Post).exists).toBe(false);
    expect(orderStatus(s, w, order('o23_remodel')).visible).toBe(false);
    const built = facilityTotals(s, w).built;
    s.remodels.outer_23 = { variant: 'hard', until: Number.POSITIVE_INFINITY };
    s.facilities.outer_23 = 'ruined';
    expect(facilityTotals(s, w).built).toBe(built);
    s.facilities.outer_23 = 'playable';
    s.remodels.outer_23 = r as { variant: string; until: number };
    const c = s.condition.outer_23;
    expect(until(s, (x) => !x.remodels.outer_23, 30000, events)).toBe(true);
    expect(s.t - (r?.until ?? 0)).toBeLessThan(13 * 60); // 期满那一刻（或者第二天开门）换
    expect(s.condition.outer_23).toBe(c);
    expect(s.variants.outer_23).toBe('hard');
    expect(s.upgrades.outer_23).toEqual([]);
    expect(events).toContainEqual({ type: 'remodel_done', facility: 'outer_23', variant: 'hard' });
    expect(s.log.some((e) => e.cause.kind === 'remodel' && e.cause.variant === 'hard')).toBe(true);
    expect(postStatus(s, w, w.posts.get('o23_hard_league') as Post).exists).toBe(true);
    // 已经是硬地：改成硬地的改造不再出现
    expect(orderStatus(s, w, order('o23_remodel')).visible).toBe(false);
  });
});

describe('星级和奖杯（LG-10）', () => {
  it('会员到 5 升 ★1：只往上不往回掉；发 star_up、写一条因果日志；开出月度内赛', () => {
    const s = ready();
    const w = W();
    expect(starStatus(s, w)).toMatchObject({ stars: 0, max: 2, next: { level: 1, missing: 1 } });
    expect(orderStatus(s, w, order('cup')).visible).toBe(false);
    s.stats.members = 5;
    const events: SimEvent[] = [];
    expect(until(s, (x) => x.stars === 1, 30, events)).toBe(true);
    expect(events).toContainEqual({ type: 'star_up', stars: 1, opens: ['internal_cup'] });
    expect(s.log.at(-1)?.cause).toEqual({ kind: 'star', stars: 1, opens: ['internal_cup'] });
    expect(num(s, w, 'stars')).toBe(1);
    expect(orderStatus(s, w, order('cup')).visible).toBe(true);
    s.stats.members = 0;
    advance(s, FIX, [], 60);
    expect(s.stars).toBe(1);
  });

  it('内赛办成：奖杯 +1、记下办过；★2 的清单逐条看得见；第 12 周起会员门槛降两成（橡皮筋）', () => {
    const s = ready();
    const w = W();
    s.stars = 1;
    s.stats.members = 9;
    (s.people.director as { at: string }).at = 'outer_1';
    advance(s, FIX, [assign('director', 'cup')], 1);
    expect(until(s, (x) => x.trophies === 1)).toBe(true);
    expect(num(s, w, 'trophies')).toBe(1);
    expect(s.log.some((e) => e.effects.some((x) => x.kind === 'trophy' && x.delta === 1))).toBe(true);
    s.stats.members = 9; // 周结算可能动了会员
    advance(s, FIX, [], 20);
    expect(s.stars).toBe(1);
    expect(starStatus(s, w).next?.items).toEqual([
      { id: 'cup', met: true },
      { id: 'trophies', met: true },
      { id: 'members', met: false },
    ]);
    s.t = at(78, 10);
    s.stats.members = 9;
    advance(s, FIX, [], 20);
    expect(s.stars).toBe(2);
    expect(starStatus(s, w).next).toBeNull();
  });

  it('办成表演赛就结束这一局：★5（exhibition_done）在结束之前升上来，发 star_up、写一条升星日志', () => {
    const s = newGame(CONTENT, { seed: 5 });
    s.cards.scheduled = [];
    s.cards.open = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    s.stars = 4;
    s.facilities.stadium_1 = 'restored';
    (s.people.director as { at: string }).at = 'stadium_1';
    s.stats.cash = 10000;
    const ex = worldFor(CONTENT, 'indian_wells').orders.get('st1_exhibition') as Order;
    // 只看办成的那一支：判定必过、一个人就够
    const c = structuredClone(CONTENT) as ContentBundle;
    c.version = `${CONTENT.version}-ex`;
    const o = c.orders.find((x) => x.id === ex.id) as Order;
    o.check = { chance: '1' };
    o.work = '10m';
    const events: SimEvent[] = [];
    events.push(...advance(s, c, [assign('director', ex.id)], 1).events);
    for (let i = 0; i < 200 && !s.outcome; i++) events.push(...advance(s, c, [], 1).events);
    expect(s.outcome).toMatchObject({ result: 'won', ending: 'exhibition' });
    expect(s.stars).toBe(5);
    const up = events.findIndex((e) => e.type === 'star_up' && e.stars === 5);
    const end = events.findIndex((e) => e.type === 'actEnded');
    expect(up).toBeGreaterThanOrEqual(0);
    expect(up).toBeLessThan(end);
    expect(s.log.some((e) => e.cause.kind === 'star' && e.cause.stars === 5)).toBe(true);
  });

  it('没写 stars 的地图（现在的内容）永远 0 星，什么都不发', () => {
    const s = newGame(CONTENT, { seed: 1 });
    s.stats.members = 99;
    const r = advance(s, CONTENT, [], 60);
    expect(s.stars).toBe(0);
    expect(r.events.some((e) => e.type === 'star_up')).toBe(false);
  });
});

describe('存档和确定性（LG-14、LG-10）', () => {
  it('v7 存档迁移到 v8：补上变体、升级、改造、牌匾、星级和奖杯', () => {
    const s = newGame(CONTENT, { seed: 3 });
    const old = JSON.parse(JSON.stringify({ ...toSave(s, []), version: 7 }));
    old.state.version = 7;
    for (const k of ['variants', 'upgrades', 'remodels', 'picks', 'plaque', 'stars', 'trophies']) delete old.state[k];
    const { save } = fromSave(old);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.state).toMatchObject({
      variants: {},
      upgrades: {},
      remodels: {},
      picks: {},
      plaque: [],
      stars: 0,
      trophies: 0,
    });
    advance(save.state, CONTENT, [], 60);
  });

  it('带变体的内容：机器人会挑变体；同一种子重放哈希一致，状态能 JSON 往返', () => {
    for (const bot of [greedyBot(), humanBot(4, humanProfile(0.5))]) {
      const r = runGame(FIX, bot, 4, { maxDays: 30 });
      expect(['clay', 'hard']).toContain(r.state.variants.outer_23);
      expect(r.state.plaque.some((x) => x.facility === 'outer_23')).toBe(true);
      const again = replay(FIX, { seed: 4 }, r.commands, r.state.t);
      expect(stateHash(again)).toBe(stateHash(r.state));
      expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    }
  }, 60_000);
});
