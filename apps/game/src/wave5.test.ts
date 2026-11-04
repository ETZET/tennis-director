import { CONTENT, type ContentBundle, type Order, type Post, plot } from '@td/content';
import { indianWells } from '@td/iso';
import { at, type GameState, newGame, placeAvailable, placeOpen, worldOf } from '@td/sim';
import { describe, expect, it } from 'vitest';
import { plotForRoute, withLand } from './courts';
import { Projector } from './project';
import { Session } from './session';
import { createText } from './text';

/**
 * W5 地图长大（UI-12 + 地块接进游戏）：新地点的坐标经 Site.land 并进来；地点牌只在 placeAvailable 时有、
 * 施工时只有清理工单、开了才有岗位；没写 anchors.<id> 的新地点借路名。
 * 内容还没写地块，这里在内存里给 Indian Wells 补一块 golf_west（和 sim 的 plots.test.ts 同一套做法）。
 */
const NEW_NAV: Record<string, Record<string, number>> = {
  south_courts: { entrance: 105, clubhouse: 47, stadium_2: 36, plaza: 96 },
  oasis_lawn: { entrance: 104, clubhouse: 46, stadium_2: 35, plaza: 95 },
};

function fixture(): ContentBundle {
  const c = structuredClone(CONTENT) as ContentBundle;
  c.version = `${CONTENT.version}-ui-w5`;
  const a = c.acts.find((x) => x.id === 'indian_wells');
  if (!a) throw new Error('no indian_wells');
  a.anchors.push(...Object.keys(NEW_NAV));
  for (const [n, row] of Object.entries(NEW_NAV)) for (const [b, m] of Object.entries(row)) a.nav.push([b, n, m]);
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
          opens: { posts: ['sc_rental'] },
        },
        oasis_lawn: { anchor: 'oasis_lawn', orders: ['gw_dig', 'gw_cabins', 'gw_pool'] },
      },
    }),
  ];
  return c;
}

const FIX = fixture();
const quiet = (): GameState => {
  const s = newGame(FIX, { seed: 5 });
  s.t = at(3, 10);
  s.cards.open = [];
  s.cards.scheduled = [];
  s.cards.nextDraw = Number.POSITIVE_INFINITY;
  return s;
};
const build = (s: GameState, state: 'building' | 'open') => {
  s.plots = {
    golf_west: { state, variant: 'south_courts', since: s.t, opened: state === 'open' ? s.t : null, cause: 0 },
  };
  if (state === 'open') for (const id of ['gw_clear', 'gw_fill', 'gw_pave']) s.orderLog.done[id] = 1;
};

describe('W5 land in the game', () => {
  const site = withLand(indianWells.INDIAN_WELLS);

  it('withLand adds the plot anchors to anchors and stands without touching the map', () => {
    expect(site.stands.south_courts).toEqual(indianWells.LAND_STANDS.south_courts);
    expect(site.anchors.academy_isle).toEqual(indianWells.LAND_ANCHORS.academy_isle);
    expect(indianWells.INDIAN_WELLS.stands.south_courts).toBeUndefined();
    // 其余字段照旧（routeLine 认新地点）
    expect(site.routeLine('south_courts', 'entrance')).not.toBeNull();
    for (const a of FIX.acts[0]?.anchors ?? []) expect(site.stands[a], a).toBeDefined();
  });

  it('a route card option finds its plot: content plots first, then the map table', () => {
    expect(plotForRoute(site, FIX.acts[0]?.plots, 's3', 'oasis_lawn')).toBe('golf_west');
    expect(plotForRoute(site, CONTENT.acts[0]?.plots, 's4', 'academy_isle')).toBe('se_corner');
    expect(plotForRoute(site, undefined, 's2', 'youth')).toBeNull();
  });

  it('new places are named after their route when anchors.<id> is missing', () => {
    const T = createText(FIX, 'en');
    const own = FIX.i18n.en?.['anchors.south_courts'];
    expect(T.anchor('south_courts')).toBe(own ?? 'South courts');
    expect(T.anchor('clubhouse')).toBe('Clubhouse');
  });

  it('place hubs: nothing before the build, only clearance orders while building, posts once open', () => {
    const s = quiet();
    const w = worldOf(s, FIX);
    const p = new Projector(FIX, createText(FIX, 'en'));
    const session = new Session(FIX, s);
    expect(placeAvailable(s, w, 'south_courts')).toBe(false);
    expect(p.hub(session, 'south_courts')).toBeNull();
    build(s, 'building');
    expect(placeAvailable(s, w, 'south_courts')).toBe(true);
    expect(placeOpen(s, w, 'south_courts')).toBe(false);
    // 另一个变体的地点不出现
    expect(placeAvailable(s, w, 'oasis_lawn')).toBe(false);
    session.picked = 'dale';
    const h = p.hub(session, 'south_courts');
    expect(h?.orders.n).toBe(3);
    expect(h?.posts).toEqual([]);
    build(s, 'open');
    expect(placeOpen(s, w, 'south_courts')).toBe(true);
    const h2 = p.hub(session, 'south_courts');
    expect(h2?.orders.n).toBe(0);
    expect(h2?.posts.length).toBe(1);
  });
});
