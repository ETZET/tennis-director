import { type Card, CONTENT, type ContentBundle, ending, growth, type Post } from '@td/content';
import { advance, at, DIRECTOR, type GameState, newGame, type SimEvent, worldFor } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * Wave 3、Wave 4 的界面投影：
 * - W3 员工成长：招聘卡的"潜力"一行、员工条的潜力和小 ▲、派谁去里的"能力/潜力"、跨门槛和解锁的快讯、岗位的能力门槛。
 * - W4 结局（UI-10）：结局卡的分项打分和评语、"开第二季 / 看总结"、提前结算卡的两个选项、第二季的目标占位。
 * 内容还没打开这两个开关，这里在内存里打开（和 sim 的 growth.test.ts、ending.test.ts 同一套做法）；关着时什么都不变。
 */

function fixture(on: { growth?: boolean; ending?: boolean }): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-ui-w34-${on.growth ? 'g' : ''}${on.ending ? 'e' : ''}`;
  const a = c.acts.find((x) => x.id === 'indian_wells');
  if (!a) throw new Error('no indian_wells');
  // 仓库内容已经打开成长（GM-11）：关着的情形在这里显式关掉
  if (!on.growth && a.growth) a.growth = { ...a.growth, enabled: false };
  if (on.growth)
    a.growth = growth.parse({
      enabled: true,
      unlocks: [{ key: 'night_clay_care', need: [{ skill: 'upkeep', gte: 75 }] }],
    });
  if (on.ending) {
    a.ending = ending.parse({ mode: 'score', card: 'iw_ending' });
    const base = c.cards.find((x) => x.id === 'iw_investor_check') as Card;
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
  }
  // 能力门槛的岗位（成长解锁的那种）：只有教学 ≥ 99 的人能坐
  const lesson = c.posts.find((x) => x.id === 'o1_lesson') as Post;
  c.posts.push({ ...lesson, id: 'gated_lesson', worker: { teach: 99 } });
  return c;
}

/** 没有卡、导演停着 */
function quiet(c: ContentBundle, day = 3, hour = 9): GameState {
  const s = newGame(c, { seed: 7 });
  s.t = at(day, hour);
  s.cards.open = [];
  s.cards.scheduled = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
}

function setup(c: ContentBundle, s: GameState) {
  const session = new Session(c, s);
  const p = new Projector(c, createText(c, 'en'));
  return { session, p };
}

/** 招聘日的卡开着（Jess / Gus） */
function hiring(s: GameState): void {
  s.cards.open = [{ uid: 900, card: 'iw_hiring_day_2', opened: s.t, expires: null, cause: null }];
}

/** 招一个人进来（不走卡）：员工条和派谁去里才有他 */
function hire(s: GameState, id: string): void {
  const p = s.people[id];
  if (!p) throw new Error(`no ${id}`);
  p.hired = true;
}

describe('W3 staff growth in the UI', () => {
  it('switch off: no potential line, no potential bars, no ▲, no "/cap" in the sheet', () => {
    const c = fixture({});
    const s = quiet(c);
    hiring(s);
    const { session, p } = setup(c, s);
    const snap = p.snapshot(session);
    expect(snap.card?.answers?.some((a) => a.potential)).toBe(false);
    expect(snap.staff?.every((t) => !t.potential && !t.rose)).toBe(true);
    const sheet = p.sheet(session, 'o1_lesson');
    expect(sheet?.people.some((x) => /\/\d+/.test(x.fit))).toBe(false);
  });

  it('hiring card: each candidate shows "Potential: skill now → cap" (top two)', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    hiring(s);
    const { session, p } = setup(c, s);
    const answers = p.snapshot(session).card?.answers ?? [];
    const withP = answers.filter((a) => a.potential);
    expect(withP.length).toBe(2);
    for (const a of withP)
      expect(a.potential).toMatch(/^Potential: \w+ \d+ → \d+( · \w+ \d+ → \d+)?( · can reach \w+ \d+ → .+)*$/);
    // Gus 是维护好手：维护排在前面，起始值 +15
    const gus = c.people.find((x) => x.id === 'gus_moreno');
    if (gus) expect(answers.find((a) => a.text.includes('Gus'))?.potential).toContain(`Upkeep ${gus.upkeep} → `);
    // 潜力够得着解锁的门槛（W3 门评审）：Gus 维护 70 → 80 跨过 75
    expect(answers.find((a) => a.text.includes('Gus'))?.potential).toContain('can reach Upkeep 75 → Night clay care');
    // 已经开出来的钥匙不再提
    s.unlocks.night_clay_care = { person: 'dale', t: s.t };
    const again = setup(c, s).p.snapshot(setup(c, s).session).card?.answers ?? [];
    expect(again.find((a) => a.text.includes('Gus'))?.potential).not.toContain('can reach');
  });

  it('staff bar: potential bars and a small ▲ while a skill rose in the last few days', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    hire(s, 'gus_moreno');
    const { session, p } = setup(c, s);
    const first = p.snapshot(session).staff?.find((t) => t.id === 'gus_moreno');
    expect(first?.potential?.upkeep).toBeGreaterThan(first?.skills.upkeep ?? 100);
    expect(first?.rose).toBeUndefined();
    const g = s.people.gus_moreno;
    if (!g) throw new Error('no gus');
    // 一圈 +0.1 也算（W3 门评审：以前要跨过一个整数才亮）
    g.upkeep += 0.1;
    expect(p.snapshot(session).staff?.find((t) => t.id === 'gus_moreno')?.rose).toBe(true);
    // 第二天还亮着（最近三天里涨过）
    s.t += 1440;
    expect(p.snapshot(session).staff?.find((t) => t.id === 'gus_moreno')?.rose).toBe(true);
    // 三天以后没再涨就灭了
    s.t += 3 * 1440;
    expect(p.snapshot(session).staff?.find((t) => t.id === 'gus_moreno')?.rose).toBeUndefined();
    // 派谁去：能力后面带潜力
    const fit = p.sheet(session, 'o1_lesson')?.people.find((x) => x.id === 'gus_moreno')?.fit ?? '';
    expect(fit).toMatch(/Coaching \d+\/\d+/);
  });

  it('"who to send": base/potential, a trait bonus written apart (never "93/78")', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    hire(s, 'rosa_ortiz');
    const r = s.people.rosa_ortiz;
    if (!r) throw new Error('no rosa');
    r.upkeep = 78;
    s.weather = 'wind';
    const { session, p } = setup(c, s);
    const fit = p.sheet(session, 'o1_upkeep')?.people.find((x) => x.id === 'rosa_ortiz')?.fit ?? '';
    expect(fit).toMatch(/^Upkeep 78\/78 \+15 · /);
    for (const x of p.sheet(session, 'o1_upkeep')?.people ?? []) {
      const m = /(\d+)\/(\d+)/.exec(x.fit);
      if (m) expect(Number(m[1])).toBeLessThanOrEqual(Number(m[2]));
    }
  });

  it('unlock effects are visible: members cap, higher division fee and prize, junior coach bonus', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    const { session, p } = setup(c, s);
    const capRow = () => p.snapshot(session).details.find((x) => x.label === 'Members cap')?.value ?? '';
    expect(capRow()).toMatch(/^\d+$/);
    const before = Number(capRow());
    s.unlocks.member_referrals = { person: 'dale', t: s.t };
    expect(capRow()).toBe(`${before + 10} · +10 Member referrals`);

    const chips = () => (p.sheet(session, 'regional_open')?.chips ?? []).map((x) => x.text);
    expect(chips()).toContain('Prize $800');
    expect(chips().some((x) => x.includes('Higher division'))).toBe(false);
    s.unlocks.open_division = { person: 'dale', t: s.t };
    expect(chips()).toContain('−$200 · Higher division ×2');
    expect(chips()).toContain('Prize $1600 · Higher division ×2');

    const junior = () => (p.sheet(session, 'junior_regional')?.chips ?? []).map((x) => x.text);
    expect(junior().some((x) => x.startsWith('Junior coaching'))).toBe(false);
    s.unlocks.junior_coach = { person: 'dale', t: s.t };
    expect(junior()).toContain('Junior coaching: A junior reaches the semifinal +20 pts');
  });

  it('a growth-gated order says who has to get how good; gone for good once the variant rules it out', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    s.facilities.outer_23 = 'playable';
    s.condition.outer_23 = 90;
    const { session, p } = setup(c, s);
    const row = () => p.placeSheet(session, 'outer_23').rows.find((x) => x.id === 'o23_night_care');
    expect(row()?.line).toMatch(/^Opens after “Night clay care” · needs someone with Upkeep 75\+ \(best now \d+\)$/);
    s.unlocks.night_clay_care = { person: 'dale', t: s.t };
    s.variants.outer_23 = 'clay';
    // 开出来了、红土开着：就是一张普通的工单（不再挂锁）
    expect(row()?.locked).toBeFalsy();
    s.variants.outer_23 = 'hard';
    expect(row()).toBeUndefined();
  });

  it('wire: a threshold crossing is one line; with an unlock in the same batch it becomes one combined line', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    const { session, p } = setup(c, s);
    p.onEvents(s, [{ type: 'skill_up', person: 'gus_moreno', skill: 'upkeep', value: 75 } as SimEvent]);
    expect(p.snapshot(session).wire[0]?.text).toBe("Gus Moreno's Upkeep reached 75");
    p.onEvents(s, [
      { type: 'skill_up', person: 'gus_moreno', skill: 'upkeep', value: 75 } as SimEvent,
      { type: 'unlock', person: 'gus_moreno', key: 'night_clay_care' } as SimEvent,
    ]);
    const wire = p.snapshot(session).wire;
    expect(wire[0]?.text).toMatch(/^Gus Moreno reached Upkeep 75 — .+ unlocked$/);
    expect(wire[1]?.text).toBe("Gus Moreno's Upkeep reached 75");
    // 总监的成长已经由 directorGrew 讲
    p.onEvents(s, [{ type: 'skill_up', person: DIRECTOR, skill: 'teach', value: 45 } as SimEvent]);
    expect(p.snapshot(session).wire.length).toBe(2);
  });

  it('wire: head coach changes say who and why; a late sign-up says the club is not entered', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    const { session, p } = setup(c, s);
    p.onEvents(s, [{ type: 'head_coach', person: 'walt_hendricks', from: 'dale', reason: 'hired' } as SimEvent]);
    expect(p.snapshot(session).wire[0]?.text).toMatch(
      /^Walt Hendricks is the new head coach \(just hired\) · Dale.* stays on as staff$/,
    );
    p.onEvents(s, [{ type: 'head_coach', person: null, from: 'walt_hendricks', reason: 'left' } as SimEvent]);
    expect(p.snapshot(session).wire[0]?.text).toBe('Walt Hendricks left · the club has no head coach now');

    const ed = worldFor(c, s.act).editions.get('cup_monthly')?.[0];
    if (!ed) throw new Error('no cup edition');
    s.t = ed.start - 60;
    p.onEvents(s, [{ type: 'orderCancelled', order: 'cup_monthly' } as SimEvent]);
    expect(p.snapshot(session).wire[0]?.text).not.toMatch(/Too late/);
    s.t = ed.start;
    p.onEvents(s, [{ type: 'orderCancelled', order: 'cup_monthly' } as SimEvent]);
    expect(p.snapshot(session).wire[0]?.text).toMatch(
      /^Too late for the Monthly club cup: .* not entered · the \$\d+ spent is lost$/,
    );
  });

  it('a skill-gated post says which skill and how much (like orders)', () => {
    const c = fixture({ growth: true });
    const s = quiet(c);
    const { session, p } = setup(c, s);
    const sheet = p.sheet(session, 'gated_lesson');
    expect(sheet?.chips.some((x) => x.text === 'Coaching 99+')).toBe(true);
    expect(sheet?.people.find((x) => x.id === DIRECTOR)?.disabled).toContain('Coaching 99+');
  });
});

/** 一分钟一分钟走到结算 */
function go(s: GameState, c: ContentBundle, minutes: number): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < minutes && !s.outcome; i++) ev.push(...advance(s, c, [], 1).events);
  return ev;
}

describe('W4 ending card (UI-10)', () => {
  it('switch off: the old ending card with "Play again"', () => {
    const c = fixture({});
    const s = quiet(c, 112, 17);
    s.outcome = { result: 'lost', ending: 'deadline', t: s.t } as GameState['outcome'];
    const { session, p } = setup(c, s);
    const card = p.snapshot(session).card;
    expect(card?.action?.id).toBe('replay');
    expect(card?.score).toBeUndefined();
    expect(card?.actions).toBeUndefined();
  });

  it('day 112 settles: itemised score, total, grade and verdict; "Start season two" / "See summary"', () => {
    const c = fixture({ ending: true });
    const s = quiet(c, 112, 17);
    const ev = go(s, c, 3 * 60);
    expect(s.outcome?.result).toBe('settled');
    const { session, p } = setup(c, s);
    p.onEvents(s, ev);
    const snap = p.snapshot(session);
    const card = snap.card;
    const st = s.ending.settlement;
    if (!st) throw new Error('not settled');
    expect(card?.score?.rows.map((r) => r.id)).toEqual(st.items.map((x) => x.id));
    expect(card?.score?.rows.find((r) => r.id === 'stars')?.label).toBeTruthy();
    expect(card?.score?.grade).toBe(st.grade);
    expect(card?.score?.verdict).toBe(createText(c, 'en').tr(`ui.ending.verdict.${st.grade}`));
    expect(card?.score?.line).toBe('Settled on day 112');
    expect(card?.actions?.map((a) => a.id)).toEqual(['season2', 'summary']);
    expect(snap.wire[0]?.text).toContain(`grade ${st.grade}`);

    // 看总结：只读的大事记，最后一行是结算
    session.endView = 'summary';
    const recap = p.snapshot(session).card;
    expect(recap?.score).toBeUndefined();
    expect(recap?.recap?.lines.at(-1)?.text).toContain(`grade ${st.grade}`);
    expect(recap?.actions?.map((a) => a.id)).toEqual(['season2', 'score']);

    // 开第二季：结局卡收起，季节栏多一行目标占位，星级格不再倒数期限
    session.send({ type: 'startSeason2' });
    p.onEvents(s, session.frame(0));
    expect(s.outcome).toBeNull();
    const s2 = p.snapshot(session);
    expect(s2.card?.score).toBeUndefined();
    expect(s2.season?.goal).toMatch(/^Season 2 · goal: /);
    expect(s2.wire[0]?.text).toMatch(/^Season two begins/);
    expect(s2.stars?.foot ?? '').not.toMatch(/day/i);
    // 第一季的日历（投资方、期限）不再挂在节拍上
    expect(s2.season?.beats?.some((b) => b.id.startsWith('cal:'))).toBeFalsy();
  });

  it('summary lists stars with days, routes, variants and trophies from the causal log', () => {
    const c = fixture({ ending: true });
    const s = quiet(c, 112, 17);
    s.log.push(
      { id: 9001, t: at(20, 18), cause: { kind: 'star', stars: 2, opens: [] }, parent: null, effects: [] },
      {
        id: 9002,
        t: at(21, 9),
        cause: { kind: 'option', card: 'iw_route_s2', option: 'A' },
        parent: null,
        effects: [{ kind: 'route', slot: 's2', route: 'youth' }],
      },
      {
        id: 9003,
        t: at(30, 12),
        cause: { kind: 'order', order: 'o23_repair', people: ['dale'] },
        parent: null,
        effects: [{ kind: 'variant', facility: 'outer_23', variant: 'clay' }],
      },
    );
    go(s, c, 3 * 60);
    const { session, p } = setup(c, s);
    session.endView = 'summary';
    const lines = p.snapshot(session).card?.recap?.lines ?? [];
    expect(lines[0]).toMatchObject({ when: 'Day 20', text: 'Reached ★2' });
    expect(lines[1]?.text).toMatch(/^Chose the road: /);
    expect(lines[2]?.text).toMatch(/^Clay courts rebuilt as /);
  });

  it('early exhibition: the decision card spells out "settle now (+N early bonus)" vs "keep running to day 112"', () => {
    const c = fixture({ ending: true });
    const s = quiet(c, 90, 10);
    s.ending.exhibition = s.t;
    s.flags.exhibition_done = true;
    s.cards.open = [{ uid: 901, card: 'iw_ending', opened: s.t, expires: s.t + 1440, cause: null }];
    const { session, p } = setup(c, s);
    const answers = p.snapshot(session).card?.answers ?? [];
    expect(answers[0]?.chips?.[0]?.text).toBe(`Settle now: +${(112 - 90) * 50} early bonus`);
    expect(answers[0]?.chips?.[1]?.text).toMatch(/^Score if settled now: \d+ \([SABCD]\)$/);
    expect(answers[1]?.chips?.[0]?.text).toBe('Keep running to day 112');
  });
});
