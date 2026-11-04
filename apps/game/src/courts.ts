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

/**
 * 地图长大（ADR 0021）：把地块上新地点的中心和站位并进 anchors / stands（地图给了 Site.land 时）。
 * 游戏里的地点牌、员工站位、镜头都按这一份找坐标；显示不显示、能不能拖人由模拟的 placeAvailable 决定，
 * 路人只去开了的（life.ts 按 placeOpen 挡）。原来的 site 不动（Site.stands 仍只有旧地点）。
 */
export function withLand(site: Site): Site {
  const land = site.land;
  if (!land) return site;
  return Object.create(site, {
    anchors: { value: { ...site.anchors, ...land.anchors }, enumerable: true },
    stands: { value: { ...site.stands, ...land.stands }, enumerable: true },
  }) as Site;
}

/** 这块地（地块 id）按 slot 这一处选路开：先看内容里的 plots，没写就按地图的地块表（新锚点和路同名） */
export function plotForRoute(
  site: Site,
  plots: readonly { id: string; route: string }[] | undefined,
  slot: string,
  route: string,
): string | null {
  const p = plots?.find((x) => x.route === slot);
  if (p) return p.id;
  for (const [id, vs] of Object.entries(site.land?.plots ?? {})) if (route in vs) return id;
  return null;
}
