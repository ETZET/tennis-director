import { CONTENT } from '@td/content';
import { indianWells } from '@td/iso';
import { describe, expect, it } from 'vitest';
import { plotForRoute, withLand } from './courts';

/**
 * 归档（ADR 0027）：原来在 apps/game/src/wave5.test.ts 的「W5 land in the game」里，查 2.5D 地图的地块
 * （withLand 并进站位、选路卡找地块）。FIX 是 wave5.test.ts 里的 fixture()（补了 golf_west 的内容），这里不再复制。
 */
declare const FIX: typeof CONTENT;

describe('W5 land in the game (2.5D map)', () => {
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
});
