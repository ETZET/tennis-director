import { describe, expect, it } from 'vitest';
import { Group } from '../../core/graph';
import { FORE, resetForeshadow } from './foreshadow';
import { INDIAN_WELLS, SE_GROW, SLAB } from './index';
import { buildIndianWells, createFacilityOverlays, type SiteWorld } from './overlays';

/** 地图长大接进 Site（ADR 0021）：覆盖层的 land / landPreview / week，Site.land 的地点表 */
function fakeWorld() {
  const statics = new Group();
  const scene = new Group();
  const slabs: unknown[] = [];
  const w: SiteWorld = {
    statics,
    scene,
    ground: { paintRect: () => {} },
    addLamp: () => () => {},
    view: { invalidate: () => {} },
    setSlab: (rs) => void slabs.push(rs),
  };
  return { w, statics, slabs };
}
const landGroup = (root: Group) => root.children.find((n) => n.name === 'land');

describe('overlays: land wiring', () => {
  it('locked plots and week 1 do not build the land layer (only the foreshadowing)', () => {
    resetForeshadow();
    const f = fakeWorld();
    buildIndianWells(f.w);
    const ov = createFacilityOverlays(f.w);
    ov.land('golf_west', 'locked', null);
    ov.landPreview('golf_west', null);
    ov.week(1);
    ov.flush();
    expect(landGroup(f.statics)).toBeUndefined();
    expect(f.slabs).toEqual([]);
  });

  it('building and open go to the land layer; the SE corner grows the slab; week drives golf decay', () => {
    resetForeshadow();
    const f = fakeWorld();
    buildIndianWells(f.w);
    const ov = createFacilityOverlays(f.w);
    ov.land('golf_west', 'building', 'south_courts', 0.5);
    ov.flush();
    expect(landGroup(f.statics)).toBeDefined();
    expect(FORE.golf).toBe('building');
    ov.land('se_corner', 'open', 'event_plaza');
    ov.flush();
    expect(f.slabs.at(-1)).toEqual([SLAB, ...SE_GROW]);
    ov.week(6);
    ov.flush();
    expect(FORE.decay).toBeCloseTo(0.5);
    resetForeshadow();
  });

  it('Site.land lists every plot anchor with a centre and a stand, outside the old stands', () => {
    const land = INDIAN_WELLS.land;
    expect(land).toBeDefined();
    for (const vs of Object.values(land?.plots ?? {}))
      for (const a of Object.values(vs)) {
        expect(land?.anchors[a], a).toBeDefined();
        expect(land?.stands[a], a).toBeDefined();
        expect(INDIAN_WELLS.stands[a]).toBeUndefined();
        expect(INDIAN_WELLS.routeLine(a, 'entrance')).not.toBeNull();
      }
    expect(Object.keys(land?.standsWith(['south_courts']) ?? {})).toContain('south_courts');
  });
});
