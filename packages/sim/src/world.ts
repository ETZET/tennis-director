import type {
  Act,
  Activity,
  Card,
  ContentBundle,
  DirectorConfig,
  Facility,
  Order,
  Person,
  Post,
  Stat,
  Trait,
} from '@td/content';
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
  expr(src: string): CompiledExpr;
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
  const w: World = {
    content,
    act,
    director,
    cards: byId(content.cards),
    activities: byId(content.activities),
    posts: byId((content.posts ?? []).filter((x) => x.act === act.id)),
    orders: byId((content.orders ?? []).filter((x) => x.act === act.id)),
    facilityAt: new Map(content.facilities.map((f) => [f.anchor, f.id])),
    people: byId(content.people),
    traits: byId(content.traits),
    stats: byId(content.stats),
    facilities: byId(content.facilities),
    nav,
    expr(src) {
      let e = exprs.get(src);
      if (!e) exprs.set(src, (e = compileExpr(src)));
      return e;
    },
  };
  m.set(key, w);
  return w;
}
