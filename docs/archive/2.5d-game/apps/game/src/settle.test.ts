import { CONTENT, greedyBot, minuteOfDay, worldOf } from '@td/sim';
import type { SettlementCardData } from '@td/ui';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * 每日结算卡（ADR 0024）：游戏收到 daySettled 就停自己的钟（不管几倍速），
 * 点完才走；投影把 DayReport 翻成结算卡（全部文字拼好，没有漏出来的 i18n 键）。
 */

const RAW = /\b(ui|posts|orders|events|tournaments|seasons|stats)\.[a-z_]/;

/** 跑实时循环直到收盘弹卡（最多 n 帧） */
function untilSettled(session: Session, n = 60 * 60 * 30): void {
  for (let i = 0; i < n && !session.settlement && !session.s.outcome; i++) {
    session.paused = false;
    session.frame(1 / 30);
  }
}

describe('Session: 收盘停钟', () => {
  it('4× 也停在结算卡上：时间不走、paused 不改；ackSettlement 以后接着走', () => {
    const session = Session.fresh(CONTENT, 11);
    session.speedIndex = 2;
    untilSettled(session);
    const r = session.settlement;
    expect(r?.day).toBe(1);
    // 模拟已经跳过了夜里：背后是第二天开门
    const w = worldOf(session.s, CONTENT);
    expect(minuteOfDay(session.s.t)).toBe(w.act.hours.open * 60);
    expect(session.paused).toBe(false);
    const t = session.s.t;
    for (let i = 0; i < 30; i++) session.frame(1);
    expect(session.stepMinute()).toEqual([]);
    expect(session.s.t).toBe(t);
    session.ackSettlement();
    expect(session.settlement).toBeNull();
    session.frame(1);
    expect(session.s.t).toBeGreaterThan(t);
  });

  it('调试一次跳过好几天：只开最后一天的卡，这一帧不再往下走', () => {
    const session = Session.fresh(CONTENT, 12);
    session.send({ type: 'debugSkip', minutes: 3 * 720 + 5 });
    session.frame(1);
    expect(session.settlement?.day).toBe(3);
    const t = session.s.t;
    session.frame(1);
    expect(session.s.t).toBe(t);
  });
});

describe('Projector: 结算卡快照', () => {
  const day1 = (lang: 'en' | 'zh') => {
    const session = Session.fresh(CONTENT, 21);
    const proj = new Projector(CONTENT, createText(CONTENT, lang));
    untilSettled(session);
    return { session, proj, card: proj.snapshot(session).settlement as SettlementCardData };
  };

  it('第 1 天：标题、四节、全部文字拼好；开局没有客人，口碑和会员一节只写一句', () => {
    const { session, card } = day1('en');
    expect(card.id).toBe('day-1');
    expect(card.pages).toHaveLength(1);
    const p = card.pages[0];
    expect(p?.title).toBe('Day 1 · Mon close');
    expect(p?.sections.map((x) => x.id)).toEqual(['money', 'standing', 'people', 'tomorrow']);
    expect(JSON.stringify(card)).not.toMatch(RAW);
    expect(card.continueLabel).toBe('Start the next day');
    const standing = p?.sections.find((x) => x.id === 'standing');
    expect(session.settlement?.reputation.skipped).toBe(true);
    expect(standing?.rows).toEqual([]);
    expect(standing?.empty).toMatch(/customers/i);
    // 明天：第一行是天气（带图标），和模拟抽好的一样
    const tm = p?.sections.find((x) => x.id === 'tomorrow');
    expect(tm?.rows[0]?.icon).toBe(session.s.weather);
  });

  it('钱的各行加起来等于合计（差不过取整的零头），收入绿、花销红', () => {
    const { session, card } = day1('zh');
    const money = card.pages[0]?.sections.find((x) => x.id === 'money');
    const sum = (money?.rows ?? []).reduce((a, r) => a + r.value, 0);
    expect(Math.abs(sum - (money?.total?.value ?? 0))).toBeLessThan(2);
    expect(money?.total?.value).toBe(session.settlement?.money.total);
    for (const r of money?.rows ?? []) expect(r.tone).toBe(r.value > 0 ? 'good' : 'bad');
    expect(money?.rows.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(card)).not.toMatch(RAW);
  });

  it('同一张卡每帧重建 id 不变（动画不打回开头）；点完以后快照里没有卡', () => {
    const { session, proj, card } = day1('en');
    expect(proj.snapshot(session).settlement?.id).toBe(card.id);
    session.ackSettlement();
    expect(proj.snapshot(session).settlement).toBeNull();
  });

  it('有人干活的一天：声望、会员两行大数（两位小数），今天的人带头像', () => {
    const session = Session.fresh(CONTENT, 5);
    const proj = new Projector(CONTENT, createText(CONTENT, 'en'));
    proj.headOf = (id) => `data:image/png;base64,${id}`;
    // 机器人经营，直到有一天有客人（口碑和会员一节有数）
    const bot = greedyBot();
    let card: SettlementCardData | null | undefined = null;
    for (let d = 0; d < 60 && !card?.pages[0]?.sections.find((x) => x.id === 'standing')?.rows.length; d++) {
      for (let i = 0; i < 60 * 60 * 30 && !session.settlement && !session.s.outcome; i++) {
        for (const c of bot.decide(session.s, CONTENT)) session.send(c);
        session.paused = false;
        session.frame(1 / 10);
      }
      card = proj.snapshot(session).settlement;
      session.ackSettlement();
    }
    const standing = card?.pages[0]?.sections.find((x) => x.id === 'standing');
    const rep = standing?.rows.find((x) => x.id === 'reputation');
    expect(rep?.digits).toBe(2);
    expect(rep?.from).toBeDefined();
    expect(rep?.text).toMatch(/^\d+\.\d\d$/);
    expect(standing?.rows.find((x) => x.id === 'members')?.from).toBeDefined();
    const people = card?.pages[0]?.sections.find((x) => x.id === 'people');
    for (const g of people?.groups ?? []) for (const x of g.people) expect(x.head).toMatch(/^data:/);
    expect(JSON.stringify(card)).not.toMatch(RAW);
  }, 30_000);

  it('周日多一页本周回顾：七天的合计等于七张卡各自的合计，七根柱子', () => {
    const session = Session.fresh(CONTENT, 33);
    const proj = new Projector(CONTENT, createText(CONTENT, 'zh'));
    const totals: number[] = [];
    let card: SettlementCardData | null | undefined = null;
    for (let d = 0; d < 7; d++) {
      untilSettled(session);
      totals.push(session.settlement?.money.total ?? 0);
      card = proj.snapshot(session).settlement;
      if (d < 6) expect(card?.pages).toHaveLength(1);
      session.ackSettlement();
    }
    expect(card?.pages.map((x) => x.id)).toEqual(['day', 'week']);
    const wk = card?.pages[1];
    expect(wk?.title).toBe('第 1 周回顾');
    const money = wk?.sections.find((x) => x.id === 'week_money');
    expect(money?.total?.value).toBe(totals.reduce((a, b) => a + b, 0));
    const trend = wk?.sections.find((x) => x.id === 'week_trend');
    expect(trend?.bars).toHaveLength(7);
    expect(trend?.bars?.[6]?.label).toBe('日');
    expect(JSON.stringify(card)).not.toMatch(RAW);
  }, 30_000);
});
