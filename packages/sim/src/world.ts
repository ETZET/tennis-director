import type {
  Act,
  Activity,
  Card,
  ContentBundle,
  DirectorConfig,
  Facility,
  Order,
  Person,
  Plot,
  Post,
  Stat,
  Tournament,
  Trait,
} from '@td/content';
import { minutes } from '@td/content';
import { type CompiledExpr, compileExpr } from '@td/shared';

/**
 * 模拟每一步要查的内容索引：按 id 建好表，表达式预先编译好。
 * 同一份内容包和同一幕只建一次（WeakMap 缓存），热更新换了内容包就重建。
 */
export interface World {
  readonly content: ContentBundle;
  readonly act: Act;
  readonly director: DirectorConfig;
  readonly cards: ReadonlyMap<string, Card>;
  readonly activities: ReadonlyMap<string, Activity>;
  /** 本幕的持续岗位和一次性工单 */
  readonly posts: ReadonlyMap<string, Post>;
  readonly orders: ReadonlyMap<string, Order>;
  /** 锚点 → 那儿的设施 id */
  readonly facilityAt: ReadonlyMap<string, string>;
  readonly people: ReadonlyMap<string, Person>;
  readonly traits: ReadonlyMap<string, Trait>;
  readonly stats: ReadonlyMap<string, Stat>;
  readonly facilities: ReadonlyMap<string, Facility>;
  /** 导航图：锚点 → [相邻锚点, 分钟] */
  readonly nav: ReadonlyMap<string, readonly (readonly [string, number])[]>;
  /** 赛事日历（LG-11）：赛事、每一期的时间、报名工单 → 赛事、临时岗位 → 用它的赛事、当天整天不开的岗位 → 赛事 */
  readonly tournaments: ReadonlyMap<string, Tournament>;
  readonly editions: ReadonlyMap<string, readonly Edition[]>;
  readonly tournamentOf: ReadonlyMap<string, Tournament>;
  readonly eventPosts: ReadonlyMap<string, readonly Tournament[]>;
  readonly closedBy: ReadonlyMap<string, readonly Tournament[]>;
  /** 分期筹备（W2）：组 → 这一组的工单 id */
  readonly prep: ReadonlyMap<string, readonly string[]>;
  /**
   * 地块（W5，LG-15）：地块、锚点 → 哪块地的哪些变体、清理工单 → 地块和变体、开地以后才有的岗位和工单 → 地块和变体。
   * 地图没写 plots 时都是空的。
   */
  readonly plots: ReadonlyMap<string, Plot>;
  readonly plotAt: ReadonlyMap<string, PlotRef & { variants: readonly string[] }>;
  readonly plotOrders: ReadonlyMap<string, PlotRef>;
  readonly plotOpens: ReadonlyMap<string, PlotRef>;
  expr(src: string): CompiledExpr;
}

/** 一块地的一个变体 */
export interface PlotRef {
  plot: string;
  variant: string;
}

/** 赛事的一期（LG-11）：报名从 signup 起，start 开赛，end 收赛；days 是开赛的那几天（第几天） */
export interface Edition {
  signup: number;
  start: number;
  end: number;
  days: number[];
}

/** 一局最多排到第几周（16 周一局，留出余量） */
const MAX_WEEK = 30;

function editionsOf(t: Tournament, act: Act): Edition[] {
  const weeks = [...(t.weeks ?? [])];
  if (t.every) for (let wk = t.every.from; wk <= (t.every.until ?? MAX_WEEK); wk += t.every.weeks) weeks.push(wk);
  const days = [...t.days].sort((a, b) => a - b);
  const toMin = (day: number, h: number) => (day - 1) * 1440 + Math.round(h * 60);
  const lead = minutes(t.lead);
  const out = [...new Set(weeks)]
    .sort((a, b) => a - b)
    .map((wk) => {
      const ds = days.map((d) => (wk - 1) * 7 + d + 1);
      const start = toMin(ds[0] as number, t.hours[0]);
      // 报名不早于开局
      const first = toMin(act.start.day, act.start.hour);
      return {
        signup: Math.max(first, start - lead),
        start,
        end: toMin(ds[ds.length - 1] as number, t.hours[1]),
        days: ds,
      };
    });
  return out;
}

const cache = new WeakMap<ContentBundle, Map<string, World>>();

const byId = <T extends { id: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.id, x]));

export function worldFor(content: ContentBundle, actId: string, directorId?: string): World {
  let m = cache.get(content);
  if (!m) cache.set(content, (m = new Map()));
  const key = `${actId}|${directorId ?? ''}`;
  const hit = m.get(key);
  if (hit) return hit;
  const act = content.acts.find((a) => a.id === actId);
  if (!act) throw new Error(`unknown act '${actId}'`);
  const director = content.directors.find((d) => d.id === (directorId ?? act.director_config));
  if (!director) throw new Error(`unknown director '${directorId ?? act.director_config}'`);
  const nav = new Map<string, [string, number][]>();
  for (const [a, b, mins] of act.nav) {
    nav.set(a, [...(nav.get(a) ?? []), [b, mins]]);
    nav.set(b, [...(nav.get(b) ?? []), [a, mins]]);
  }
  const exprs = new Map<string, CompiledExpr>();
  const tournaments = act.tournaments ?? [];
  const eventPosts = new Map<string, Tournament[]>();
  const closedBy = new Map<string, Tournament[]>();
  for (const t of tournaments) {
    for (const p of t.posts) eventPosts.set(p, [...(eventPosts.get(p) ?? []), t]);
    for (const p of t.closes) closedBy.set(p, [...(closedBy.get(p) ?? []), t]);
  }
  const orders = (content.orders ?? []).filter((x) => x.act === act.id);
  const prep = new Map<string, string[]>();
  for (const o of orders) if (o.prep) prep.set(o.prep, [...(prep.get(o.prep) ?? []), o.id]);
  const plots = act.plots ?? [];
  const plotAt = new Map<string, PlotRef & { variants: string[] }>();
  const plotOrders = new Map<string, PlotRef>();
  const plotOpens = new Map<string, PlotRef>();
  for (const p of plots)
    for (const [variant, v] of Object.entries(p.variants)) {
      const hit = plotAt.get(v.anchor);
      if (hit) hit.variants.push(variant);
      else plotAt.set(v.anchor, { plot: p.id, variant, variants: [variant] });
      for (const o of v.orders) plotOrders.set(o, { plot: p.id, variant });
      for (const x of [...v.opens.posts, ...v.opens.orders]) plotOpens.set(x, { plot: p.id, variant });
    }
  const w: World = {
    content,
    act,
    director,
    cards: byId(content.cards),
    activities: byId(content.activities),
    posts: byId((content.posts ?? []).filter((x) => x.act === act.id)),
    orders: byId(orders),
    facilityAt: new Map(content.facilities.map((f) => [f.anchor, f.id])),
    people: byId(content.people),
    traits: byId(content.traits),
    stats: byId(content.stats),
    facilities: byId(content.facilities),
    nav,
    tournaments: byId(tournaments),
    editions: new Map(tournaments.map((t) => [t.id, editionsOf(t, act)])),
    tournamentOf: new Map(tournaments.map((t) => [t.order, t])),
    eventPosts,
    closedBy,
    prep,
    plots: byId(plots),
    plotAt,
    plotOrders,
    plotOpens,
    expr(src) {
      let e = exprs.get(src);
      if (!e) exprs.set(src, (e = compileExpr(src)));
      return e;
    },
  };
  m.set(key, w);
  return w;
}
