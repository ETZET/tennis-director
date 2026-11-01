import { hollowCreek } from '@td/render';
import { CONTENT, randomBot } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * 游戏 app 的组装测试：模拟、画面、界面三边对得上。
 */

describe('Hollow Creek map ↔ act nav', () => {
  const act = CONTENT.acts.find((a) => a.id === 'hollow_creek');
  it('every anchor has a stand in the scene', () => {
    for (const a of act?.anchors ?? []) expect(hollowCreek.STANDS[a], a).toBeDefined();
  });
  it('nav minutes match the drawn route length at walking speed (±2 min)', () => {
    for (const [a, b, mins] of act?.nav ?? []) {
      const line = hollowCreek.routeLine(a, b);
      expect(line, `${a}–${b}`).not.toBeNull();
      const want = hollowCreek.polylineLength(line ?? []) / hollowCreek.WALK_METERS_PER_MINUTE;
      expect(Math.abs(mins - want), `${a}–${b}: ${mins} vs ${want.toFixed(1)}`).toBeLessThanOrEqual(2);
    }
  });
});

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

describe('Session', () => {
  it('runs a seeded game through the real-time loop and projects every frame', () => {
    const session = Session.fresh(CONTENT, 42);
    const text = createText(CONTENT, 'en');
    const proj = new Projector(CONTENT, text);
    const bot = randomBot(3);
    session.speedIndex = 2;
    for (let f = 0; f < 60 * 60 * 60 && !session.s.outcome; f++) {
      for (const c of bot.decide(session.s, CONTENT)) session.send(c);
      session.paused = false;
      const ev = session.frame(1 / 60);
      proj.onEvents(session.s, ev);
      if (f % 30 === 0) {
        const snap = proj.snapshot(session);
        expect(snap.club.clock).toMatch(/^Day \d+ · /);
        if (snap.card) expect(snap.card.headline).not.toMatch(/^events\./);
        for (const st of snap.story ?? []) expect(`${st.because} ${st.so}`).not.toMatch(/\b(events|stats|anchors)\./);
      }
    }
    expect(session.s.outcome).not.toBeNull();
    expect(session.log.length).toBeGreaterThan(0);
  });

  it('an errand option is chosen at once and sends the director over', () => {
    const session = Session.fresh(CONTENT, 7);
    session.paused = false;
    // 周一 15:30 Dale 玩手机的卡打开（会请求暂停）
    for (let i = 0; i < 20000 && !session.s.cards.open.some((o) => o.card === 'hc_dale_phone'); i++) {
      session.paused = false;
      session.frame(1 / 60);
    }
    const card = session.s.cards.open.find((o) => o.card === 'hc_dale_phone');
    expect(card).toBeDefined();
    expect(session.choose(card?.uid ?? 0, 'A')).toBe(true);
    session.frame(0);
    expect(session.s.cards.open.some((o) => o.uid === card?.uid)).toBe(false);
    expect(session.s.people.director?.errand?.at).toBe('court_1');
    session.paused = false;
    for (let i = 0; i < 60 * 60 && session.s.people.director?.errand; i++) session.frame(1 / 60);
    expect(session.s.people.director?.at).toBe('court_1');
  });

  it('assigning from the staff bar walks the person over and the snapshot shows it', () => {
    const session = Session.fresh(CONTENT, 3);
    const proj = new Projector(CONTENT, createText(CONTENT, 'zh'));
    session.picked = 'director';
    expect(proj.snapshot(session).hint).toMatch(/总监/);
    session.assign('director', 'patch_court1');
    session.paused = false;
    session.frame(0.2);
    const snap = proj.snapshot(session);
    expect(snap.hint).toBeNull();
    const me = snap.staff?.find((t) => t.id === 'director');
    expect(me?.state).toBe('walking');
    expect(me?.doing).toMatch(/补裂缝/);
    const sheet = proj.sheet(session, 'patch_court1');
    expect(sheet?.people.find((p) => p.id === 'director')?.here).toBe(true);
    expect(JSON.stringify(sheet)).not.toMatch(/\b(ui|posts|orders)\./);
  });
});
