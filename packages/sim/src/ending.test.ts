import { type Card, CONTENT, type ContentBundle, ending } from '@td/content';
import { describe, expect, it } from 'vitest';
import type { Ctx } from './effects';
import { run } from './effects';
import { endingStatus, scoreOf } from './ending';
import type { SimEvent } from './events';
import { advance, newGame } from './game';
import { fromSave, MIGRATIONS, toSave } from './save';
import { at, dayOf, type GameState, SAVE_VERSION } from './state';
import { worldFor } from './world';

/**
 * W4 结局方案 A（LG-13）：第 112 天 18 点打分、提前办成表演赛的结局卡、破产照旧、第二季、开关关着时不变。
 * 内容还没打开 ending（W4 内容一路做），这里给 Indian Wells 补一份：ending 用初值，结局卡 iw_ending（A 马上结算、B 接着经营）。
 */
function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-w4-fixture`;
  const a = c.acts.find((x) => x.id === 'indian_wells');
  if (!a) throw new Error('no indian_wells');
  a.ending = ending.parse({ mode: 'score', card: 'iw_ending' });
  const base = c.cards.find((x) => x.id === 'iw_deadline') as Card;
  c.cards.push({
    ...structuredClone(base),
    id: 'iw_ending',
    source: 'consequence',
    countdown: '1d',
    options: {
      A: { effects: [{ settle: true }], onSuccess: [], onFail: [] },
      B: { effects: [], onSuccess: [], onFail: [] },
    },
    // biome-ignore lint/suspicious/noThenProperty: 'then' is the card spec's field name (plain data)
    default: { then: 'B', extra: [] },
  } as Card);
  return c;
}

const FIX = fixture();

/** 跳到第 day 天 hour 点：只留日历卡（期限卡），别的卡和导演都停 */
function jump(c: ContentBundle, day: number, hour: number, seed = 7): GameState {
  const s = newGame(c, { seed });
  s.t = at(day, hour);
  s.cards.open = [];
  s.cards.scheduled = s.cards.scheduled.filter((x) => x.card === 'iw_deadline');
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
}

function ctxOf(s: GameState, c: ContentBundle): Ctx {
  return { s, w: worldFor(c, s.act, s.directorConfig), events: [] };
}

function go(s: GameState, c: ContentBundle, minutes: number): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < minutes && !s.outcome; i++) ev.push(...advance(s, c, [], 1).events);
  return ev;
}

/** 办成表演赛：st1_exhibition 成功时的最后两条效果 */
const exhibition = (s: GameState, c: ContentBundle) =>
  run(ctxOf(s, c), { kind: 'debug', what: 'exhibition' }, null, [
    { flag: 'exhibition_done', set: true },
    { endAct: 'won', ending: 'exhibition' },
  ]);

describe('W4 ending plan A (score)', () => {
  it('switch off: no ending block keeps the old ending (deadline loses, exhibition wins), no status', () => {
    const s = jump(CONTENT, 112, 17);
    expect(endingStatus(s, worldFor(CONTENT, s.act))).toBeNull();
    expect(s.ending).toEqual({ season: 1, exhibition: null, settlement: null, goal: null, land: {} });
    go(s, CONTENT, 3 * 60);
    expect(s.outcome).toMatchObject({ result: 'lost', ending: 'deadline' });
    expect(s.ending.settlement).toBeNull();
    const t = jump(CONTENT, 90, 10);
    exhibition(t, CONTENT);
    expect(t.outcome).toMatchObject({ result: 'won', ending: 'exhibition' });
    expect(advance(t, CONTENT, [{ type: 'startSeason2' }], 0).accepted).toEqual([]);
  });

  it('day 112 18:00 settles with an itemised score and a grade instead of a loss', () => {
    const s = jump(FIX, 112, 17);
    s.stars = 3;
    s.trophies = 2;
    s.stats.members = 40;
    s.stats.reputation = 45;
    s.stats.cash = 4567;
    const ev = go(s, FIX, 3 * 60);
    expect(s.outcome).toEqual({ result: 'settled', ending: 'score', t: at(112, 18) });
    const st = s.ending.settlement;
    expect(st).toMatchObject({ day: 112, reason: 'deadline' });
    const pts = Object.fromEntries((st?.items ?? []).map((x) => [x.id, x.points]));
    expect(pts).toEqual({
      stars: 3000,
      trophies: 600,
      members: 400,
      reputation: 450,
      exhibition: 0,
      early: 0,
      cash: 456,
    });
    expect(st?.total).toBe(4906);
    expect(st?.grade).toBe('C');
    // 结算事件带分项，和状态里的一样；期限卡没打开（不判输）
    const e = ev.find((x) => x.type === 'settlement');
    expect(e).toMatchObject({ type: 'settlement', total: 4906, grade: 'C', reason: 'deadline' });
    expect(ev.some((x) => x.type === 'actEnded' && x.result === 'settled')).toBe(true);
    expect(s.cards.shown.iw_deadline).toBeUndefined();
    expect(s.log.at(-1)?.cause).toMatchObject({ kind: 'settlement', total: 4906, grade: 'C' });
    const w = worldFor(FIX, s.act);
    expect(endingStatus(s, w)).toMatchObject({ season: 1, canStartSeason2: true, preview: { total: 4906 } });
  });

  it('an early exhibition raises the ending card; "settle now" scores the early days', () => {
    const s = jump(FIX, 90, 10);
    s.stars = 4;
    exhibition(s, FIX);
    // 表演赛不再通关：记下来、结局卡排上了
    expect(s.outcome).toBeNull();
    expect(s.ending.exhibition).toBe(at(90, 10));
    const ev = go(s, FIX, 11);
    const opened = s.cards.open.find((o) => o.card === 'iw_ending');
    expect(opened).toBeDefined();
    expect(s.stars).toBe(5);
    const w = worldFor(FIX, s.act);
    expect(endingStatus(s, w)).toMatchObject({ exhibition: 90, deciding: true, deadline: { daysLeft: 22 } });
    expect(ev.some((x) => x.type === 'cardOpened' && x.card === 'iw_ending')).toBe(true);
    const r = advance(s, FIX, [{ type: 'chooseOption', uid: opened?.uid ?? -1, option: 'A' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(s.outcome?.result).toBe('settled');
    const st = s.ending.settlement;
    expect(st?.reason).toBe('early');
    const pts = Object.fromEntries((st?.items ?? []).map((x) => [x.id, x.points]));
    expect(pts.exhibition).toBe(2000);
    expect(pts.early).toBe(22 * 50);
    expect(pts.stars).toBe(5000);
  });

  it('"keep running" goes on to day 112 and settles there without the early bonus', () => {
    const s = jump(FIX, 108, 10);
    s.stars = 4;
    exhibition(s, FIX);
    go(s, FIX, 11);
    const opened = s.cards.open.find((o) => o.card === 'iw_ending');
    advance(s, FIX, [{ type: 'chooseOption', uid: opened?.uid ?? -1, option: 'B' }], 0);
    expect(s.outcome).toBeNull();
    // 再办一次（冷却以后）也不重新来卡
    exhibition(s, FIX);
    go(s, FIX, 5 * 1440);
    expect(s.outcome?.result).toBe('settled');
    expect(dayOf(s.outcome?.t ?? 0)).toBe(112);
    expect(s.cards.shown.iw_ending).toBe(1);
    const pts = Object.fromEntries((s.ending.settlement?.items ?? []).map((x) => [x.id, x.points]));
    expect(s.ending.settlement?.reason).toBe('deadline');
    expect(pts.exhibition).toBe(2000);
    expect(pts.early).toBe(0);
  });

  it('bankruptcy still ends the game as a loss, with no settlement', () => {
    const s = jump(FIX, 50, 19);
    s.stats.cash = -2500;
    go(s, FIX, 120);
    expect(s.outcome).toMatchObject({ result: 'lost', ending: 'bankrupt' });
    expect(s.ending.settlement).toBeNull();
    expect(advance(s, FIX, [{ type: 'startSeason2' }], 0).accepted).toEqual([]);
  });

  it('season two keeps the club, resets the clock, sets the placeholder goal and notes the unchosen land', () => {
    const s = jump(FIX, 112, 17);
    s.stars = 4;
    s.routes = { s2: 'youth', s3: 'oasis_lawn' };
    s.cards.cooldowns.some_card = at(113, 8);
    s.cards.scheduled.push({ card: 'iw_investor_check', at: at(113, 10), cause: null });
    // 还没结算不能开第二季
    expect(advance(s, FIX, [{ type: 'startSeason2' }], 0).accepted).toEqual([]);
    go(s, FIX, 3 * 60);
    const cash = s.stats.cash;
    const r = advance(s, FIX, [{ type: 'startSeason2' }], 0);
    expect(r.accepted).toHaveLength(1);
    expect(r.events.find((e) => e.type === 'season_two')).toMatchObject({ goal: 'official_tournament' });
    expect(s.outcome).toBeNull();
    expect(s.t).toBe(at(1, 8));
    expect(s.ending).toMatchObject({
      season: 2,
      goal: 'official_tournament',
      land: { s2: ['resort'], s3: ['south_courts'], s4: ['event_plaza', 'academy_isle'] },
      settlement: { reason: 'deadline' },
    });
    expect(s.stars).toBe(4);
    expect(s.stats.cash).toBe(cash);
    expect(s.cards.scheduled).toEqual([]);
    // 冷却跟着时钟平移：第 113 天 8 点 → 第 1 天 8 点
    expect(s.cards.cooldowns.some_card).toBe(at(1, 8));
    // 只开一次；第二季不再在第 112 天结算
    expect(advance(s, FIX, [{ type: 'startSeason2' }], 0).accepted).toEqual([]);
    const w = worldFor(FIX, s.act);
    expect(endingStatus(s, w)).toMatchObject({ season: 2, deadline: null, canStartSeason2: false });
    // 一天营业 12 小时（夜里跳过）
    go(s, FIX, 3 * 720);
    expect(s.outcome).toBeNull();
    expect(dayOf(s.t)).toBe(4);
  });

  it('save version bump: a version-10 save migrates to an empty first-season ending', () => {
    expect(SAVE_VERSION).toBe(11);
    const s = newGame(FIX, { seed: 3 });
    const old = toSave(s, []) as unknown as Record<string, unknown>;
    const st = old.state as Record<string, unknown>;
    delete st.ending;
    st.version = 10;
    old.version = 10;
    expect(MIGRATIONS[10]).toBeDefined();
    const { save } = fromSave(old);
    expect(save.version).toBe(11);
    expect(save.state.ending).toEqual({ season: 1, exhibition: null, settlement: null, goal: null, land: {} });
    // 结算后的存档读回来一样
    const t = jump(FIX, 112, 17);
    go(t, FIX, 3 * 60);
    const back = fromSave(JSON.parse(JSON.stringify(toSave(t, [])))).save.state;
    expect(back.ending.settlement).toEqual(t.ending.settlement);
  });

  it('score preview matches the breakdown config (data-driven items and grades)', () => {
    const c = fixture();
    const a = c.acts[0];
    if (!a?.ending) throw new Error('no ending');
    a.ending.score = { stars: { of: 'stars', per: 7 } };
    a.ending.grades = [
      { grade: 'A', gte: 20 },
      { grade: 'D', gte: 0 },
    ];
    const s = jump(c, 30, 10);
    s.stars = 3;
    const w = worldFor(c, s.act);
    expect(scoreOf(s, w)).toEqual({ items: [{ id: 'stars', value: 3, per: 7, points: 21 }], total: 21, grade: 'A' });
    s.stars = 2;
    expect(scoreOf(s, w).grade).toBe('D');
  });
});
