import { CONTENT, type ContentBundle, ending, type Order, type Post, plot } from '@td/content';
import { describe, expect, it } from 'vitest';
import { greedyBot, humanBot, humanProfile } from './bots';
import { type Ctx, run, settle } from './effects';
import { startSeason2 } from './ending';
import type { SimEvent } from './events';
import { advance, newGame } from './game';
import { placeAvailable, placeOpen, plotPaused, plotStatus } from './plots';
import { fromSave, MIGRATIONS, toSave } from './save';
import { canAssign, orderStatus, postExists } from './staff';
import { at, type GameState, SAVE_VERSION } from './state';
import { num, test } from './vars';
import { shortestRoute } from './walk';
import { worldFor } from './world';

/**
 * W5 地块（LG-15）：选路开工 → 清理工单 → 开地；地块上的地点没开时不能用；导航只加不挪；
 * 赛事日停工；第二季按没选的路开另一块；存档迁移。内容还没写地块（W5 内容一路做），这里给 Indian Wells 补一份：
 * - 新锚点 south_courts / oasis_lawn（golf_west，★3 的 s3）、event_plaza / academy_isle（se_corner，第二季、s4），
 *   导航边照画面的步行分钟表；
 * - 南场三张清理工单（gw_clear / gw_fill / gw_pave，免费，2 小时，两人），开地后有 sc_rental（南场租场）；
 *   施工时会员场租场的收入打折（"噪音"，内容用条件写）。
 */
const MIN: Record<string, Record<string, number>> = {
  south_courts: {
    entrance: 105,
    parking: 117,
    plaza: 96,
    clubhouse: 47,
    stadium_1: 71,
    stadium_2: 36,
    stadium_3: 81,
    practice: 54,
    outer_1: 54,
    outer_23: 54,
  },
  oasis_lawn: {
    entrance: 104,
    parking: 116,
    plaza: 95,
    clubhouse: 46,
    stadium_1: 70,
    stadium_2: 35,
    stadium_3: 80,
    practice: 54,
    outer_1: 54,
    outer_23: 54,
    south_courts: 6,
  },
  event_plaza: {
    entrance: 12,
    parking: 12,
    plaza: 37,
    clubhouse: 78,
    stadium_1: 56,
    stadium_2: 85,
    stadium_3: 38,
    practice: 67,
    outer_1: 67,
    outer_23: 67,
    south_courts: 116,
    oasis_lawn: 116,
  },
  academy_isle: {
    entrance: 91,
    parking: 92,
    plaza: 117,
    clubhouse: 158,
    stadium_1: 136,
    stadium_2: 165,
    stadium_3: 118,
    practice: 147,
    outer_1: 147,
    outer_23: 147,
    south_courts: 196,
    oasis_lawn: 196,
    event_plaza: 92,
  },
};
const NEW = Object.keys(MIN);

function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-w5-fixture`;
  const a = c.acts.find((x) => x.id === 'indian_wells');
  if (!a) throw new Error('no indian_wells');
  a.anchors.push(...NEW);
  for (const [n, row] of Object.entries(MIN)) for (const [b, m] of Object.entries(row)) a.nav.push([b, n, m]);
  const base: Omit<Order, 'id' | 'at'> = {
    act: 'indian_wells',
    skill: 'upkeep',
    work: '2h',
    cost: 0,
    crew: 2,
    once: false,
    restore: 0,
    effects: [],
    onSuccess: [],
    onFail: [],
  };
  c.orders.push(
    { ...base, id: 'gw_clear', at: 'south_courts' },
    { ...base, id: 'gw_fill', at: 'south_courts' },
    { ...base, id: 'gw_pave', at: 'south_courts' },
    { ...base, id: 'gw_dig', at: 'oasis_lawn' },
    { ...base, id: 'gw_cabins', at: 'oasis_lawn' },
    { ...base, id: 'gw_pool', at: 'oasis_lawn' },
    { ...base, id: 'se_lot', at: 'event_plaza' },
    { ...base, id: 'se_bridge', at: 'academy_isle' },
  );
  const rental = c.posts.find((x) => x.id === 'o1_rental') as Post;
  c.posts.push({ ...rental, id: 'sc_rental', at: 'south_courts', when: undefined } as Post);
  a.plots = [
    plot.parse({
      id: 'golf_west',
      route: 's3',
      variants: {
        south_courts: {
          anchor: 'south_courts',
          orders: ['gw_clear', 'gw_fill', 'gw_pave'],
          start: [{ flag: 'gw_noise', set: true }],
          opens: {
            posts: ['sc_rental'],
            effects: [
              { flag: 'gw_noise', set: false },
              { stat: 'reputation', add: 2 },
            ],
          },
        },
        oasis_lawn: { anchor: 'oasis_lawn', orders: ['gw_dig', 'gw_cabins', 'gw_pool'] },
      },
    }),
    plot.parse({
      id: 'se_corner',
      route: 's4',
      season: 2,
      variants: {
        event_plaza: { anchor: 'event_plaza', orders: ['se_lot'] },
        academy_isle: { anchor: 'academy_isle', orders: ['se_bridge'] },
      },
    }),
  ];
  a.ending = ending.parse({ mode: 'score' });
  return c;
}

const FIX = fixture();
const W = worldFor(FIX, 'indian_wells');

const quiet = (s: GameState): GameState => {
  s.cards.scheduled = [];
  s.cards.open = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};
const ctxOf = (s: GameState, c: ContentBundle = FIX): Ctx => ({
  s,
  w: worldFor(c, s.act, s.directorConfig),
  events: [],
});
const choose = (s: GameState, route: string, c: ContentBundle = FIX) => {
  const ctx = ctxOf(s, c);
  const e = run(ctx, { kind: 'debug', what: 'route' }, null, [{ route: 's3', set: route }]);
  return { entry: e, events: ctx.events };
};
const go = (s: GameState, minutes: number): SimEvent[] => {
  const ev: SimEvent[] = [];
  for (let i = 0; i < minutes; i++) ev.push(...advance(s, FIX, [], 1).events);
  return ev;
};
/** 把总监和 Dale 放到工单上（到场、开干） */
const crew = (s: GameState, order: string, anchor: string) => {
  for (const id of ['director', 'dale']) {
    const p = s.people[id];
    if (!p) continue;
    p.at = anchor;
    p.walk = null;
    p.errand = null;
    p.job = order;
  }
};

describe('W5 land plots (LG-15)', () => {
  it('switch off: no plots in content = no plot state, every place available, routes unchanged', () => {
    const s = quiet(newGame(CONTENT, { seed: 3 }));
    const w = worldFor(CONTENT, 'indian_wells');
    expect(w.plots.size).toBe(0);
    choose(s, 'south_courts', CONTENT);
    expect(s.routes.s3).toBe('south_courts');
    expect(s.plots).toEqual({});
    for (const a of w.act.anchors) expect(placeAvailable(s, w, a)).toBe(true);
    expect(plotStatus(s, w)).toEqual([]);
  });

  it('navigation only adds: routes between old places are the same; plot anchors are only end points', () => {
    const w0 = worldFor(CONTENT, 'indian_wells');
    const old = w0.act.anchors;
    for (const a of old)
      for (const b of old) expect(shortestRoute(W, a, b), `${a}→${b}`).toEqual(shortestRoute(w0, a, b));
    // 南场 → 学院岛不经过别的新地（直连 196 分钟，经过 event_plaza 才 116 + 92 = 208，但别的新地不当中转站）
    for (const n of NEW)
      for (const b of [...old, ...NEW]) {
        const r = shortestRoute(W, b, n);
        expect(
          r?.route.slice(0, -1).some((x) => NEW.includes(x)),
          `${b}→${n}`,
        ).toBe(false);
      }
  });

  it('locked: plot places are hidden, their posts and orders are not there', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    expect(s.plots).toEqual({});
    for (const n of NEW) expect(placeAvailable(s, W, n)).toBe(false);
    expect(placeAvailable(s, W, 'clubhouse')).toBe(true);
    expect(orderStatus(s, W, W.orders.get('gw_clear') as Order).visible).toBe(false);
    expect(postExists(s, W, W.posts.get('sc_rental') as Post)).toBe(false);
    expect(canAssign(s, W, 'director', 'gw_clear')).toBe('gone');
    expect(test(s, W, { plot: 'golf_west', is: 'locked' })).toBe(true);
    expect(num(s, W, 'plot.golf_west == "locked" ? 1 : 0')).toBe(1);
  });

  it('choosing the route starts building: clearance orders show, the place shows, posts wait for open', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    s.t = at(2, 9);
    const { entry, events } = choose(s, 'south_courts');
    expect(s.plots.golf_west).toMatchObject({ state: 'building', variant: 'south_courts', since: s.t, opened: null });
    expect(events).toContainEqual({
      type: 'plot_building',
      plot: 'golf_west',
      variant: 'south_courts',
      anchor: 'south_courts',
      orders: ['gw_clear', 'gw_fill', 'gw_pave'],
    });
    expect(entry.effects).toContainEqual({
      kind: 'plot',
      plot: 'golf_west',
      variant: 'south_courts',
      state: 'building',
    });
    const b = s.log.find((e) => e.cause.kind === 'plot');
    expect(b?.parent).toBe(entry.id);
    expect(s.flags.gw_noise).toBe(true); // 开工效果
    expect(placeAvailable(s, W, 'south_courts')).toBe(true);
    expect(placeOpen(s, W, 'south_courts')).toBe(false);
    expect(placeAvailable(s, W, 'oasis_lawn')).toBe(false);
    for (const o of ['gw_clear', 'gw_fill', 'gw_pave'])
      expect(orderStatus(s, W, W.orders.get(o) as Order)).toMatchObject({
        visible: true,
        plot: 'golf_west',
        paused: false,
      });
    expect(orderStatus(s, W, W.orders.get('gw_dig') as Order).visible).toBe(false);
    expect(canAssign(s, W, 'director', 'gw_clear')).toBeNull();
    expect(canAssign(s, W, 'director', 'sc_rental')).toBe('gone');
    expect(test(s, W, { plot: 'golf_west', is: 'building' })).toBe(true);
    expect(test(s, W, { plot: 'golf_west', is: 'south_courts' })).toBe(true);
    expect(test(s, W, { plot: 'golf_west', is: 'oasis_lawn' })).toBe(false);
    expect(plotStatus(s, W)[0]).toMatchObject({ state: 'building', done: 0, total: 3, progress: 0 });
    // 一处只选一次：再选另一条路，地块不变
    choose(s, 'oasis_lawn');
    expect(s.plots.golf_west?.variant).toBe('south_courts');
  });

  it('finishing the last clearance order opens the plot (plot_open, opens effects, posts appear, log chain)', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    s.t = at(2, 9);
    choose(s, 'south_courts');
    // 前两张直接算做完；第三张两个人干
    s.orderLog.done.gw_clear = 1;
    s.orderLog.done.gw_fill = 1;
    expect(orderStatus(s, W, W.orders.get('gw_clear') as Order).visible).toBe(false); // 只做一次
    crew(s, 'gw_pave', 'south_courts');
    const rep = s.stats.reputation ?? 0;
    const ev = go(s, 90);
    expect(s.plots.golf_west?.state).toBe('open');
    expect(s.plots.golf_west?.opened).not.toBeNull();
    expect(ev).toContainEqual({
      type: 'plot_open',
      plot: 'golf_west',
      variant: 'south_courts',
      anchor: 'south_courts',
    });
    expect(s.flags.gw_noise).toBe(false);
    expect(s.stats.reputation).toBeGreaterThanOrEqual(rep + 2 - 1);
    const open = s.log.find((e) => e.cause.kind === 'plot' && e.cause.state === 'open');
    const build = s.log.find((e) => e.cause.kind === 'plot' && e.cause.state === 'building');
    expect(open?.parent).toBe(build?.id);
    expect(placeOpen(s, W, 'south_courts')).toBe(true);
    expect(postExists(s, W, W.posts.get('sc_rental') as Post)).toBe(true);
    expect(orderStatus(s, W, W.orders.get('gw_pave') as Order).visible).toBe(false);
    expect(plotStatus(s, W)[0]).toMatchObject({ state: 'open', done: 3, progress: 1 });
    expect(num(s, W, 'plot.golf_west == "open" ? 1 : 0')).toBe(1);
  });

  it('tournament days pause the site: people wait, no progress', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    const e = W.editions.get('cup_monthly')?.[0];
    if (!e) throw new Error('no cup edition');
    s.t = e.start + 30;
    choose(s, 'south_courts');
    s.events.cup_monthly = {
      start: e.start,
      end: e.end,
      demand: 0,
      served: 0,
      need: 0,
      staffed: 0,
      skill: 0,
      crew: [],
    };
    expect(plotPaused(s, W, 'golf_west')).toBe(true);
    expect(orderStatus(s, W, W.orders.get('gw_clear') as Order).paused).toBe(true);
    crew(s, 'gw_clear', 'south_courts');
    go(s, 30);
    expect(s.orders.gw_clear).toBeUndefined();
    delete s.events.cup_monthly;
    expect(plotPaused(s, W, 'golf_west')).toBe(false);
    go(s, 5);
    expect(s.orders.gw_clear?.progress).toBeGreaterThan(0);
  });

  it('season two opens the season-2 plot from the land season one left (ending.land)', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    s.t = at(112, 18);
    s.routes.s4 = 'academy_isle';
    const ctx = ctxOf(s);
    expect(settle(ctx, 'deadline')).toBe(true);
    // 第二季的地块在第一季选路时不开工
    expect(s.plots.se_corner).toBeUndefined();
    expect(startSeason2(ctx)).toBe(true);
    expect(s.ending.land.s4).toEqual(['event_plaza']);
    expect(s.plots.se_corner).toMatchObject({ state: 'building', variant: 'event_plaza' });
    expect(ctx.events.some((e) => e.type === 'plot_building' && e.plot === 'se_corner')).toBe(true);
    expect(placeAvailable(s, W, 'event_plaza')).toBe(true);
    expect(placeAvailable(s, W, 'academy_isle')).toBe(false);
  });

  it('effect { plot, build } starts a locked plot; does nothing on a started one', () => {
    const s = quiet(newGame(FIX, { seed: 3 }));
    const ctx = ctxOf(s);
    run(ctx, { kind: 'debug', what: 'build' }, null, [{ plot: 'se_corner', build: 'academy_isle' }]);
    expect(s.plots.se_corner?.variant).toBe('academy_isle');
    run(ctx, { kind: 'debug', what: 'build' }, null, [{ plot: 'se_corner', build: 'event_plaza' }]);
    expect(s.plots.se_corner?.variant).toBe('academy_isle');
  });

  it('save: version bump, 11 → 12 migration adds plots, round trip keeps them', () => {
    expect(SAVE_VERSION).toBe(12);
    const s = quiet(newGame(FIX, { seed: 3 }));
    choose(s, 'oasis_lawn');
    const save = toSave(s, []);
    const old = structuredClone(save) as unknown as Record<string, unknown>;
    const st = old.state as Record<string, unknown>;
    delete st.plots;
    st.version = 11;
    old.version = 11;
    const m = (MIGRATIONS[11] as NonNullable<(typeof MIGRATIONS)[11]>)(old);
    expect((m.state as GameState).plots).toEqual({});
    const back = fromSave(JSON.parse(JSON.stringify(save)));
    expect(back.save.state.plots.golf_west).toMatchObject({ state: 'building', variant: 'oasis_lawn' });
  });

  it('bots take clearance orders and open the plot', () => {
    for (const bot of [greedyBot(), humanBot(5, humanProfile(0.85), 'good')]) {
      const s = newGame(FIX, { seed: 11 });
      choose(s, 'south_courts');
      while (s.t < at(15, 20) && s.plots.golf_west?.state !== 'open') advance(s, FIX, bot.decide(s, FIX), 5);
      expect(s.plots.golf_west?.state, bot.name).toBe('open');
    }
  });
});
