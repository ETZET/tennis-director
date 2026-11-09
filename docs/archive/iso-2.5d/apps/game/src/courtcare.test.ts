import { Group, type IsoWorld, indianWells, type PeopleWorld, Person, Scheduler } from '@td/iso';
import {
  type CausalEntry,
  CONTENT,
  careActive,
  careCourts,
  DIRECTOR,
  type GameState,
  newGame,
  type SimEvent,
  worldOf,
} from '@td/sim';
import { describe, expect, it } from 'vitest';
import { createLife } from './life';
import { Projector } from './project';
import { directorSweeping } from './scene';
import { Session } from './session';
import { createText } from './text';

/**
 * 场地可用度在游戏里的那一半（court-care-contract.md，代理 D）：地点牌的三档记号、地点清单的"亲手扫"、
 * 快讯、因果日志和周结算的说法、总监扫场的演出判断、门口等着的会员。数值全由模拟算，这里只看"给玩家看什么"。
 */

const fresh = () => {
  const session = Session.fresh(CONTENT, 7);
  // 开局的球场都是废墟：把会员场直接摆成修好的样子（测试里的局面）
  session.s.facilities.outer_1 = 'playable';
  session.s.condition.outer_1 = 90;
  const zh = createText(CONTENT, 'zh');
  const p = new Projector(CONTENT, zh);
  return { session, p, zh, w: worldOf(session.s, CONTENT) };
};
/** 开局就开着的一块球场（会员场） */
const openCourt = (s: GameState) => {
  const w = worldOf(s, CONTENT);
  const f = careCourts(w).find((x) => careActive(s, w, x));
  if (!f) throw new Error('no open court at start');
  return f;
};
const dirty = (session: Session, court: string, mess: Record<string, number>) => {
  session.send({ type: 'debugMess', court, mess });
  session.frame(0);
};

describe('地点牌和地点清单：三档、不写数', () => {
  it('开着的球场有记号，弄脏了换档', () => {
    const { session, p } = fresh();
    const f = openCourt(session.s);
    const a = worldOf(session.s, CONTENT).facilities.get(f)?.anchor ?? f;
    expect(p.hub(session, a)?.care).toBe('ok');
    dirty(session, f, { sand: 0.6 });
    expect(p.hub(session, a)?.care).toBe('meh');
    dirty(session, f, { water: 1 });
    expect(p.hub(session, a)?.care).toBe('no');
  });

  it('不是球场的地点没有记号', () => {
    const { session, p } = fresh();
    expect(p.hub(session, 'clubhouse')?.care ?? null).toBeNull();
  });

  it('清单里写场上有什么（按影响排、不带数），亲手扫写代价或原因', () => {
    const { session, p, zh } = fresh();
    const f = openCourt(session.s);
    dirty(session, f, { litter: 0.3, water: 0.9 });
    const c = p.placeSheet(session, f).care;
    expect(c?.level).toBe('no');
    expect(c?.label).toBe(zh.tr('ui.care.level.no'));
    expect(c?.kinds[0]).toBe(zh.tr('ui.care.kinds.water'));
    expect(c?.kinds).toContain(zh.tr('ui.care.kinds.litter'));
    expect(c?.kinds.join('')).not.toMatch(/\d/);
    expect(c?.hand.title).toBe(zh.tr('ui.care.hand'));
    if (c?.hand.ok) expect(c.hand.minutes).toBeGreaterThan(0);
    else expect(c?.hand.why).toBeTruthy();
  });

  it('干净的场：亲手扫置灰，原因是场上挺干净（模拟实现了 canCare 以后）', () => {
    const { session, p, zh } = fresh();
    const f = openCourt(session.s);
    const h = p.placeSheet(session, f).care?.hand;
    expect(h?.ok).toBe(false);
    expect([zh.tr('ui.care.why.clean'), zh.tr('ui.care.why.court')]).toContain(h?.why);
  });
});

describe('快讯', () => {
  const wire = (p: Projector, session: Session) => p.snapshot(session).wire.map((x) => x.text);
  it('不能打说主要原因；回到能打说一声；勉强一天只说一次', () => {
    const { session, p, zh } = fresh();
    const f = openCourt(session.s);
    dirty(session, f, { water: 1 });
    const s = session.s;
    const place = zh.anchor(f);
    const ev = (from: string, to: string) =>
      ({ type: 'careLevel', court: f, from, to, usability: 20 }) as unknown as SimEvent;
    p.onEvents(s, [ev('ok', 'no')]);
    expect(wire(p, session)[0]).toBe(zh.fmt('ui.care.wire_no', { place, why: zh.tr('ui.care.kinds.water') }));
    p.onEvents(s, [ev('no', 'ok')]);
    expect(wire(p, session)[0]).toBe(zh.fmt('ui.care.wire_ok', { place }));
    p.onEvents(s, [ev('ok', 'meh'), ev('meh', 'ok'), ev('ok', 'meh')]);
    expect(wire(p, session).filter((x) => x === zh.fmt('ui.care.wire_meh', { place }))).toHaveLength(1);
  });

  it('走人、扫完各一条', () => {
    const { session, p, zh } = fresh();
    const f = openCourt(session.s);
    const place = zh.anchor(f);
    p.onEvents(session.s, [
      { type: 'memberWalkedOut', court: f, waited: 90 },
      { type: 'careDone', court: f, before: 30, after: 95, minutes: 81 },
    ] as SimEvent[]);
    const w = wire(p, session);
    expect(w).toContain(zh.fmt('ui.care.wire_walkout', { place, time: zh.duration(90) }));
    expect(w).toContain(zh.fmt('ui.care.wire_done', { place, time: zh.duration(81) }));
  });
});

describe('因果日志和周结算的说法', () => {
  const zh = createText(CONTENT, 'zh');
  const entry = (cause: CausalEntry['cause'], effects: CausalEntry['effects'] = []): CausalEntry => ({
    id: 1,
    t: 600,
    cause,
    parent: null,
    effects,
  });
  it('亲手扫、走人', () => {
    const e = entry({ kind: 'care', court: 'outer_1', minutes: 95, before: 30, after: 96, cleared: { sand: 1 } }, [
      { kind: 'mess', facility: 'outer_1', delta: { sand: -0.5, litter: -0.2 } },
    ]);
    expect(zh.because(e)).toBe(zh.fmt('ui.care.because_care', { place: zh.anchor('outer_1'), time: zh.duration(95) }));
    expect(zh.so(e)).toContain(
      zh.fmt('ui.care.log_mess', {
        place: zh.facility('outer_1'),
        list: `${zh.tr('ui.care.kinds.sand')}、${zh.tr('ui.care.kinds.litter')}`,
      }),
    );
    expect(zh.so(e)).not.toMatch(/\d/);
    const out = entry({ kind: 'walkout', court: 'outer_1', waited: 90 });
    expect(zh.because(out)).toBe(zh.fmt('ui.care.because_walkout', { place: zh.anchor('outer_1') }));
  });
  it('红土上的脏乱用红土的叫法', () => {
    const e = entry({ kind: 'debug', what: 'x' }, [{ kind: 'mess', facility: 'outer_23', delta: { water: 0.3 } }]);
    expect(zh.so(e)).toContain(`+${zh.tr('ui.care.kinds_clay.water')}`);
  });
  it('周结算多两行：走掉的会员、挡掉最多的那块场', () => {
    const e = entry({
      kind: 'week',
      week: 1,
      demand: 100,
      served: 80,
      pass: 0.7,
      missed: null,
      money: { dues: 0, income: 0, upkeep: 0, wages: 0 },
      rep: {},
      members: { gain: 0, cap: null },
      quality: { target: 3, terms: {} },
      walkouts: 4,
      unplayable: { court: 'outer_1', minutes: 300 },
    } as unknown as CausalEntry['cause']);
    const so = zh.so(e) ?? '';
    expect(so).toContain(zh.fmt('ui.care.week_walkouts', { n: 4 }));
    expect(so).toContain(zh.fmt('ui.care.week_unplayable', { place: zh.anchor('outer_1'), time: zh.duration(300) }));
  });
});

describe('总监扫场的演出', () => {
  it('在球场上办事、最近一条日志是亲手扫了这块场 → 扫场；别的办事不算', () => {
    const s = newGame(CONTENT, { seed: 3 });
    const w = worldOf(s, CONTENT);
    const d = s.people[DIRECTOR];
    if (!d) throw new Error('no director');
    d.at = 'outer_1';
    d.walk = null;
    d.errand = { at: 'outer_1', minutes: 60, until: s.t + 60 };
    expect(directorSweeping(s, w)).toBeNull();
    s.log.push({
      id: 99,
      t: s.t,
      cause: { kind: 'care', court: 'outer_1', minutes: 60, before: 30, after: 90, cleared: {} },
      parent: null,
      effects: [],
    });
    expect(directorSweeping(s, w)).toBe('outer_1');
    s.t += 61;
    expect(directorSweeping(s, w)).toBeNull();
  });
});

describe('门口等着的会员', () => {
  const site = indianWells.INDIAN_WELLS;
  function setup(queue: { anchor: string; n: number }[], level: 'ok' | 'meh' | 'no' = 'no') {
    const pw: PeopleWorld = { scene: new Group(), groundY: (x, z) => site.groundY(x, z), people: [] };
    const sched = new Scheduler();
    let seed = 1;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const people: Person[] = [];
    const life = createLife({
      world: { scene: pw.scene } as unknown as IsoWorld,
      site,
      courtsAt: (_s, a) => site.courts[a]?.length ?? 0,
      sched,
      rnd,
      person: (i) => {
        const p = new Person(
          {
            name: `M${i}`,
            x: 0,
            z: 0,
            base: 'relaxed',
            shirt: '#fff',
            shorts: '#000',
            skin: '#e0b08a',
            hair: '#000',
            shoes: '#fff',
          },
          pw,
        );
        p.root.visible = false;
        people.push(p);
        return p;
      },
      rally: () => ({ stop() {} }),
      busy: () => false,
      careLevel: (_s, a) => (site.courts[a] ? level : null),
      gateQueue: () => queue,
      tr: (k) => k,
    });
    return { life, sched, people };
  }
  const s0 = {
    t: 600,
    weather: 'sun',
    season: 'autumn',
    stats: { members: 20 },
    facilities: {},
  } as unknown as GameState;
  const near = (people: Person[], p: { x: number; z: number }, r: number) =>
    people.filter((q) => q.root.visible && Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < r);

  it('不能打：站 n 个会员在门外，场上没人打', () => {
    const { life, people } = setup([{ anchor: 'outer_1', n: 3 }]);
    life.reset();
    life.update(s0, 0.3);
    const g = site.gates?.outer_1 ?? site.stands.outer_1;
    if (!g) throw new Error('no gate');
    expect(near(people, g, 5)).toHaveLength(3);
  });

  it('小游戏接管时藏起来，还原后又在', () => {
    const { life, people } = setup([{ anchor: 'outer_1', n: 2 }]);
    life.reset();
    life.update(s0, 0.3);
    const g = site.gates?.outer_1 ?? site.stands.outer_1;
    if (!g) throw new Error('no gate');
    expect(near(people, g, 5)).toHaveLength(2);
    life.stage('outer_1');
    life.update(s0, 0.05);
    expect(near(people, g, 5)).toHaveLength(0);
    life.stage(null);
    expect(near(people, g, 5)).toHaveLength(2);
  });

  it('走掉一个：他走向停车场，门口少一个', () => {
    const { life, people, sched } = setup([{ anchor: 'outer_1', n: 3 }]);
    life.reset();
    life.update(s0, 0.3);
    const g = site.gates?.outer_1 ?? site.stands.outer_1;
    if (!g) throw new Error('no gate');
    life.update({ ...s0, t: 601 } as GameState, 0.3);
    life.walkout('outer_1');
    for (let i = 0; i < 400; i++) {
      sched.advance(0.05);
      for (const p of people) p.update(0.05, sched.now);
      life.update({ ...s0, t: 602 } as GameState, 0.05);
    }
    expect(near(people, g, 5)).toHaveLength(2);
  });
});
