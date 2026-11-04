import { indianWells } from '@td/iso';
import { advance, CONTENT, newGame, randomBot } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * 游戏 app 的组装测试：模拟、画面、界面三边对得上。
 */

describe('Indian Wells map ↔ content nav', () => {
  const act = CONTENT.acts.find((a) => a.id === 'indian_wells');
  const site = indianWells.INDIAN_WELLS;
  /** 地块（W5）的新锚点：站位和中心在 LAND_STANDS / LAND_ANCHORS（没并进 Site.stands，免得闲逛的人走过去） */
  const land = indianWells.LAND_STANDS as Record<string, { x: number; z: number }>;
  const landCenters = indianWells.LAND_ANCHORS as Record<string, { x: number; z: number }>;
  const plotAnchors = new Set((act?.plots ?? []).flatMap((p) => Object.values(p.variants).map((v) => v.anchor)));
  it('every anchor has a stand and a center in the scene; every facility anchor is an anchor', () => {
    for (const a of act?.anchors ?? []) {
      expect(site.stands[a] ?? (plotAnchors.has(a) ? land[a] : undefined), a).toBeDefined();
      expect(site.anchors[a] ?? (plotAnchors.has(a) ? landCenters[a] : undefined), a).toBeDefined();
    }
    for (const f of CONTENT.facilities) expect(act?.anchors, f.id).toContain(f.anchor);
  });
  it('nav connects every pair, and minutes match the drawn route length at walking speed (±1 min)', () => {
    const n = act?.anchors.length ?? 0;
    expect(act?.nav).toHaveLength((n * (n - 1)) / 2);
    for (const [a, b, mins] of act?.nav ?? []) {
      const line = site.routeLine(a, b);
      expect(line, `${a}–${b}`).not.toBeNull();
      const want = indianWells.polylineLength(line ?? []) / indianWells.WALK_METERS_PER_MINUTE;
      expect(Math.abs(mins - want), `${a}–${b}: ${mins} vs ${want.toFixed(1)}`).toBeLessThanOrEqual(1);
    }
  });
  it("plots: every variant anchor is that plot's place in the scene, and its walks stay on the (grown) slab", () => {
    const B = indianWells.BRIDGE;
    const rects = [
      indianWells.SLAB,
      ...indianWells.SE_GROW,
      indianWells.ISLE_DOCK,
      { x0: B.x - B.w / 2, x1: B.x + B.w / 2, z0: B.z0, z1: B.z1 },
    ];
    // 离地台外沿至少 m 米（路的终点不能落在岛边上）
    const inside = (x: number, z: number, m: number) =>
      rects.some((r) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m);
    for (const p of act?.plots ?? [])
      for (const [variant, v] of Object.entries(p.variants))
        expect(indianWells.PLOT_ANCHORS[p.id]?.[variant], `${p.id}.${variant}`).toBe(v.anchor);
    // 画面里每块地的每个变体（内容还没写地块时也查）：站位不在岛边，从每个地点走过去都在地台上
    const places = [...Object.keys(site.stands), ...Object.keys(land)];
    for (const vs of Object.values(indianWells.PLOT_ANCHORS))
      for (const anchor of Object.values(vs)) {
        const stand = land[anchor];
        expect(stand, anchor).toBeDefined();
        if (stand) expect(inside(stand.x, stand.z, 2), `${anchor} stand is at the island edge`).toBe(true);
        for (const b of places) {
          if (b === anchor) continue;
          const line = site.routeLine(b, anchor) ?? [];
          expect(line.length, `${b}–${anchor}`).toBeGreaterThan(1);
          for (let i = 1; i < line.length; i++) {
            const a0 = line[i - 1] as { x: number; z: number };
            const a1 = line[i] as { x: number; z: number };
            const n = Math.ceil(Math.hypot(a1.x - a0.x, a1.z - a0.z));
            for (let k = 0; k <= n; k++) {
              const x = a0.x + ((a1.x - a0.x) * k) / Math.max(1, n);
              const z = a0.z + ((a1.z - a0.z) * k) / Math.max(1, n);
              expect(inside(x, z, 0), `${b}–${anchor} leaves the slab at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(
                true,
              );
            }
          }
        }
      }
  });
  it('every facility with courts has as many court frames in the scene as its best state', () => {
    for (const f of CONTENT.facilities) {
      const most = Math.max(...Object.values(f.states).map((x) => x.courts));
      expect(site.courts[f.anchor]?.length ?? 0, f.id).toBeGreaterThanOrEqual(most);
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

describe('weekly settlement in the wire and the story (GM-1)', () => {
  it('idle game: one wire line a week instead of a daily "Cash −$21"; the story says why', () => {
    const s = newGame(CONTENT, { seed: 37 });
    const proj = new Projector(CONTENT, createText(CONTENT, 'en'));
    proj.onEvents(s, advance(s, CONTENT, [{ type: 'assign', person: 'director', target: 'o1_sweep' }], 0).events);
    proj.onEvents(s, advance(s, CONTENT, [{ type: 'assign', person: 'dale', target: 'o1_sweep' }], 0).events);
    for (let i = 0; i < 14 * 12; i++) proj.onEvents(s, advance(s, CONTENT, [], 60).events);
    const wire = (proj as unknown as { wire: { text: string }[] }).wire.map((x) => x.text);
    expect(wire.filter((x) => /^Cash −\$21/.test(x))).toEqual([]);
    expect(
      wire.filter((x) => x.startsWith('Week ')),
      wire.join('\n'),
    ).toHaveLength(2);
    expect(wire.join('\n')).toMatch(/Week 2 settled · no customers yet · Cash −\$150/);
    // 废墟不挂"状况跌到"的提醒
    expect(wire.some((x) => x.includes('Stadium condition'))).toBe(false);
    for (const lang of ['en', 'zh'] as const) {
      const T = createText(CONTENT, lang);
      const e = s.log.filter((x) => x.cause.kind === 'week').at(-1);
      expect(e).toBeDefined();
      const line = `${T.because(e as never)} ${T.so(e as never)}`;
      expect(line).not.toMatch(/\bui\.|\{/);
      if (lang === 'en') {
        expect(line).toMatch(/no post open yet/);
        expect(line).toMatch(/Cash −\$150 \(wages −\$150\)/);
        expect(line).toMatch(/Program quality .* \(heading for [\d.]+: /);
      } else expect(line).toMatch(/工资 −\$150/);
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
