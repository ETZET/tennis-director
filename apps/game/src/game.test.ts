import { advance, CONTENT, newGame, randomBot } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * 游戏 app 的组装测试：模拟和界面对得上（画面那一半随 2.5D 归档，见 docs/archive/iso-2.5d，ADR 0027）。
 */

describe('text', () => {
  it('every ui.* key the game uses exists in both languages', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('.', import.meta.url).pathname;
    const keys = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts')))
      for (const m of readFileSync(dir + f, 'utf8').matchAll(/['`](ui\.[a-z_.]+)['`]/g)) keys.add(m[1] as string);
    expect(keys.size).toBeGreaterThan(10);
    for (const lang of ['en', 'zh'])
      for (const k of keys) expect(CONTENT.i18n[lang]?.[k], `${lang}: ${k}`).toBeDefined();
  });

  it('every UI key exists in both languages', () => {
    const en = CONTENT.i18n.en ?? {};
    const zh = CONTENT.i18n.zh ?? {};
    const missing = Object.keys(en).filter((k) => !(k in zh));
    expect(missing).toEqual([]);
  });
});

describe('daily settlement in the wire and the story (ADR 0024)', () => {
  it('idle game: one wire line a day (cash · reputation · members), no weekly line; the story keeps only the latest day', () => {
    const s = newGame(CONTENT, { seed: 37 });
    const proj = new Projector(CONTENT, createText(CONTENT, 'en'));
    proj.onEvents(s, advance(s, CONTENT, [{ type: 'assign', person: 'director', target: 'o1_sweep' }], 0).events);
    proj.onEvents(s, advance(s, CONTENT, [{ type: 'assign', person: 'dale', target: 'o1_sweep' }], 0).events);
    for (let i = 0; i < 14 * 12; i++) proj.onEvents(s, advance(s, CONTENT, [], 60).events);
    const wire = (proj as unknown as { wire: { text: string }[] }).wire.map((x) => x.text);
    // 周结算只是回顾，不再发快讯；每天收盘一条
    expect(
      wire.filter((x) => x.startsWith('Week ')),
      wire.join('\n'),
    ).toEqual([]);
    expect(wire.join('\n')).toMatch(/Day 14 close · no customers · Cash −\$21/);
    // 废墟不挂"状况跌到"的提醒
    expect(wire.some((x) => x.includes('Stadium condition'))).toBe(false);
    const story = proj.snapshot(new Session(CONTENT, s)).story ?? [];
    expect(story.filter((x) => /^Day \d+ close/.test(x.because))).toHaveLength(1);
    for (const lang of ['en', 'zh'] as const) {
      const T = createText(CONTENT, lang);
      const e = s.log.filter((x) => x.cause.kind === 'daily').at(-1);
      expect(e).toBeDefined();
      const line = `${T.because(e as never)} ${T.so(e as never)}`;
      expect(line).not.toMatch(/\bui\.|\{/);
      if (lang === 'en') expect(line).toMatch(/Cash −\$21 \(wages −\$21\)/);
      else expect(line).toMatch(/工资 −\$21/);
      // 周日的周结算日志是回顾
      const wk = s.log.filter((x) => x.cause.kind === 'week').at(-1);
      expect(wk && T.because(wk)).not.toMatch(/\bui\.|\{/);
    }
  });
});

describe('Session', () => {
  it('runs a seeded game through the real-time loop and projects every frame', () => {
    const session = Session.fresh(CONTENT, 42);
    const text = createText(CONTENT, 'en');
    const proj = new Projector(CONTENT, text);
    const bot = randomBot(3);
    session.speedIndex = 2;
    // 一局最长 16 周：先快进到最后一周，再用实时循环跑到结局
    session.send({ type: 'debugSkip', minutes: 105 * 720 });
    for (let f = 0; f < 60 * 60 * 60 && !session.s.outcome; f++) {
      for (const c of bot.decide(session.s, CONTENT)) session.send(c);
      session.paused = false;
      // 每天收盘停在结算卡上（ADR 0024）：点过去
      if (session.settlement) session.ackSettlement();
      const ev = session.frame(1 / 60);
      proj.onEvents(session.s, ev);
      if (f % 30 === 0) {
        const snap = proj.snapshot(session);
        expect(snap.club.clock).toMatch(/^Day \d+ · /);
        if (snap.card) expect(snap.card.headline).not.toMatch(/^events\./);
        if (snap.settlement) expect(JSON.stringify(snap.settlement)).not.toMatch(/\b(ui|posts|orders|events)\.[a-z]/);
        for (const st of snap.story ?? []) expect(`${st.because} ${st.so}`).not.toMatch(/\b(events|stats|anchors)\./);
      }
    }
    expect(session.s.outcome).not.toBeNull();
    expect(session.log.length).toBeGreaterThan(0);
  }, 20_000); // 每一帧都投影一遍 HUD（含 W5 的地块查询），并行跑测试时 5 s 不够

  it('an errand option is chosen at once and sends the director over', () => {
    const session = Session.fresh(CONTENT, 7);
    session.s.cards.scheduled.push({ card: 'iw_reporter', at: session.s.t, cause: null });
    for (let i = 0; i < 600 && !session.s.cards.open.some((o) => o.card === 'iw_reporter'); i++) {
      session.paused = false;
      session.frame(1 / 60);
    }
    const card = session.s.cards.open.find((o) => o.card === 'iw_reporter');
    expect(card).toBeDefined();
    expect(session.choose(card?.uid ?? 0, 'A')).toBe(true);
    session.frame(0);
    expect(session.s.cards.open.some((o) => o.uid === card?.uid)).toBe(false);
    expect(session.s.people.director?.errand?.at).toBe('plaza');
    for (let i = 0; i < 60 * 60 * 4 && session.s.people.director?.errand; i++) {
      session.paused = false;
      session.frame(1 / 60);
    }
    expect(session.s.people.director?.at).toBe('plaza');
  });

  it('assigning from the staff bar walks the person over and the snapshot shows it', () => {
    const session = Session.fresh(CONTENT, 3);
    const proj = new Projector(CONTENT, createText(CONTENT, 'zh'));
    session.picked = 'director';
    expect(proj.snapshot(session).hint).toMatch(/总监/);
    session.assign('director', 'o1_sweep');
    session.paused = false;
    session.frame(0.2);
    const snap = proj.snapshot(session);
    expect(snap.hint).toBeNull();
    const me = snap.staff?.find((t) => t.id === 'director');
    expect(me?.state).toBe('walking');
    expect(me?.doing).toMatch(/扫会员场的沙/);
    const sheet = proj.sheet(session, 'o1_sweep');
    expect(sheet?.people.find((p) => p.id === 'director')?.here).toBe(true);
    expect(JSON.stringify(sheet)).not.toMatch(/\b(ui|posts|orders)\./);
  });
});

describe('衰减和掉档的快讯（准则 6；GM-1：废墟天天刷屏）', () => {
  it('废墟不提醒；会掉档的设施跌破 30 提醒一次，周六收盘再提醒"明天掉档"，周日掉档是一条红色快讯', () => {
    const s = newGame(CONTENT, { seed: 5 });
    s.cards.scheduled = [];
    s.cards.open = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    s.facilities.outer_1 = 'playable';
    s.condition.outer_1 = 45;
    const session = new Session(CONTENT, s);
    const proj = new Projector(CONTENT, createText(CONTENT, 'en'));
    const pushed: { day: number; text: string; hot: boolean }[] = [];
    while (s.t < 7 * 1440 + 9 * 60) {
      const before = proj.snapshot(session).wire[0]?.id ?? -1;
      proj.onEvents(s, advance(s, CONTENT, [], 30).events);
      for (const x of proj
        .snapshot(session)
        .wire.filter((x) => x.id > before)
        .reverse())
        pushed.push({ day: Math.floor(s.t / 1440) + 1, text: x.text, hot: !!x.hot });
    }
    const texts = pushed.map((x) => x.text);
    // 开局七处废墟一条都不提醒
    expect(texts.filter((x) => /condition down to/.test(x))).toEqual([
      "Members' court condition down to 25: below 15 at Sunday close it loses a grade and its jobs stop",
    ]);
    expect(texts.filter((x) => /tomorrow \(Sunday\)/.test(x))).toHaveLength(1);
    const drop = pushed.find((x) => /closed/.test(x.text));
    expect(drop?.text).toMatch(/Members' court · closed/);
    expect(drop?.hot).toBe(true);
    expect(s.facilities.outer_1).toBe('worn');
    // 地点清单：停用的设施说清楚为什么岗位没了、怎么回来；重开工单在清单里
    const sheet = proj.placeSheet(session, 'outer_1');
    expect(sheet.condition?.label).toMatch(/Lost a grade/);
    expect(sheet.rows.map((r) => r.id)).toContain('o1_reopen');
    // 废墟的地点清单不挂状况
    expect(proj.placeSheet(session, 'stadium_2').condition).toBeUndefined();
  });
});

describe('路上的人不算在岗（标签、清单、地点牌和模拟的 working() 一致）', () => {
  it('派去远处的工单：走路时说"在路上 · N 分钟"、头像标 coming；到了才说"在干"', () => {
    const s = newGame(CONTENT, { seed: 7 });
    s.cards.scheduled = [];
    s.cards.open = [];
    s.cards.nextDraw = Number.POSITIVE_INFINITY;
    const session = new Session(CONTENT, s);
    const proj = new Projector(CONTENT, createText(CONTENT, 'en'));
    advance(
      s,
      CONTENT,
      [
        { type: 'assign', person: 'director', target: 'o1_sweep' },
        { type: 'assign', person: 'dale', target: 'o1_sweep' },
      ],
      1,
    );
    const row = () => proj.placeSheet(session, 'outer_1').rows.find((r) => r.id === 'o1_sweep');
    expect(row()?.line).toMatch(/^0% · waiting for crew · On the way: /);
    expect(row()?.line).not.toMatch(/working/);
    expect(row()?.faces.every((f) => f.coming)).toBe(true);
    expect(proj.sheet(session, 'o1_sweep')?.people.every((p) => p.coming && /On the way/.test(p.fit))).toBe(true);
    expect(proj.hub(session, 'outer_1')?.orders.crew).toBe(0);
    advance(s, CONTENT, [], 60);
    expect(s.people.dale?.walk).toBeFalsy();
    expect(row()?.line).toMatch(/working · \d+%$/);
    expect(row()?.faces.some((f) => f.coming)).toBe(false);
    expect(proj.hub(session, 'outer_1')?.orders.crew).toBe(2);
  });
});
