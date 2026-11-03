import type { CourtFrame, Site } from '@td/iso';
import type { ContentBundle, GameState } from '@td/sim';
import { worldOf } from '@td/sim';

/** 地图可选提供：按变体给这个地点的球场（例如匹克球场修成四片小场；wave1 契约） */
type CourtsFor = { courtsFor?(anchor: string, variant: string | null): readonly CourtFrame[] | undefined };

/** 这个地点的设施此刻修成（或锁定要修成）的变体；没选过是 null */
export function variantAt(s: GameState | null, content: ContentBundle, anchor: string): string | null {
  if (!s) return null;
  const f = worldOf(s, content).facilityAt.get(anchor);
  return f ? (s.variants?.[f] ?? null) : null;
}

/**
 * 按当前变体换球场的 Site：`courts[anchor]` 读的时候先问地图的 courtsFor(anchor, 变体)，没有再用原来的。
 * 演出、路人打球、员工站位都读这个，变体定下以后人站到对的场地上（只是画面，不碰模拟状态）。
 */
export function variantSite(site: Site, state: () => GameState | null, content: () => ContentBundle): Site {
  const cf = site as Site & CourtsFor;
  if (!cf.courtsFor) return site;
  const frames = (a: string): readonly CourtFrame[] | undefined =>
    cf.courtsFor?.(a, variantAt(state(), content(), a)) ?? site.courts[a];
  const courts = new Proxy({ ...site.courts } as Record<string, readonly CourtFrame[]>, {
    get: (t, k) => (typeof k === 'string' ? frames(k) : Reflect.get(t, k)),
  });
  // 原型链指回原来的 site：其余字段和方法（routeLine、groundY……）照旧
  return Object.create(site, { courts: { value: courts, enumerable: true } }) as Site;
}
