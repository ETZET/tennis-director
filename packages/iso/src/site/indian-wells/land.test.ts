import { describe, expect, it } from 'vitest';
import { FORE, golfDecayForWeek, resetForeshadow } from './foreshadow';
import { SLAB } from './ground';
import { createLand } from './land';
import {
  BRIDGE,
  ISLE_DOCK,
  LAND_ANCHORS,
  LAND_STANDS,
  polylineLength,
  routeLine,
  SE_GROW,
  STANDS,
  standsWith,
  WALK_METERS_PER_MINUTE,
  walkMinutes,
} from './layout';

const inR = (r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) =>
  x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;

/** 地图长大（ADR 0021）：新锚点的步道、新地的画面层 */
describe('land routes', () => {
  it('every new anchor is reachable from every old and new anchor, at the nav walking speed', () => {
    const all = [...Object.keys(STANDS), ...Object.keys(LAND_STANDS)];
    for (const a of Object.keys(LAND_STANDS))
      for (const b of all) {
        if (a === b) continue;
        const l = routeLine(a, b);
        expect(l, `${a}–${b}`).not.toBeNull();
        expect(walkMinutes(a, b)).toBe(Math.max(1, Math.round(polylineLength(l ?? []) / WALK_METERS_PER_MINUTE)));
      }
  });
  it('the two variants of a plot are within ±10% walk of the clubhouse', () => {
    const sc = walkMinutes('south_courts', 'clubhouse') as number;
    const ol = walkMinutes('oasis_lawn', 'clubhouse') as number;
    expect(Math.abs(sc - ol) / sc).toBeLessThanOrEqual(0.1);
  });
  it('new routes stay on land: on the base slab, the grown corner, or the bridge', () => {
    const land = [SLAB, ...SE_GROW, ISLE_DOCK, { x0: BRIDGE.x - 1, x1: BRIDGE.x + 1, z0: BRIDGE.z0, z1: BRIDGE.z1 }];
    for (const a of Object.keys(LAND_STANDS))
      for (const p of routeLine(a, 'entrance') ?? [])
        expect(
          land.some((r) => inR(r, p.x, p.z)),
          `${a} ${p.x},${p.z}`,
        ).toBe(true);
  });
  it('old stands are unchanged; standsWith adds only opened land', () => {
    expect(Object.keys(standsWith([]))).toEqual(Object.keys(STANDS));
    expect(standsWith(['south_courts']).south_courts).toEqual(LAND_STANDS.south_courts);
    for (const a of Object.keys(LAND_ANCHORS)) expect(a in STANDS).toBe(false);
  });
});

describe('land layer', () => {
  const fakeWorld = () => {
    const calls: unknown[][] = [];
    const nodes: unknown[] = [];
    const w = {
      statics: { add: (...n: unknown[]) => nodes.push(...n) },
      scene: { add: () => {} },
      ground: { paintRect: () => {} },
      addLamp: () => () => {},
      view: { invalidate: () => {} },
      setSlab: (rs: unknown, b: unknown) => calls.push([rs, b]),
    };
    return { w, calls };
  };
  it('golf decay follows the week', () => {
    expect(golfDecayForWeek(1)).toBe(0);
    expect(golfDecayForWeek(11)).toBe(1);
  });
  it('event_plaza grows the slab at the SE corner; academy_isle docks the islet once building is a quarter done', () => {
    resetForeshadow();
    const { w, calls } = fakeWorld();
    // biome-ignore lint/suspicious/noExplicitAny: 测试替身只实现用到的部分
    const L = createLand(w as any);
    L.land('se_corner', 'building', 'event_plaza', 0.3);
    L.flush();
    expect(calls.at(-1)?.[0]).toEqual([SLAB, ...SE_GROW]);
    expect(FORE.hide.length).toBeGreaterThan(0);
    L.land('se_corner', 'building', 'academy_isle', 0.1);
    L.flush();
    expect(calls.at(-1)?.[0]).toEqual([SLAB]);
    expect(FORE.isle.show).toBe(true);
    L.land('se_corner', 'open', 'academy_isle');
    L.flush();
    expect(calls.at(-1)?.[0]).toEqual([SLAB, ISLE_DOCK]);
    expect(FORE.isle.show).toBe(false);
    L.land('golf_west', 'building', 'south_courts', 0.1);
    L.flush();
    expect(FORE.golf).toBe('building');
    expect(FORE.gate.bricks).toBeLessThan(1);
    L.land('golf_west', 'open', 'south_courts');
    L.flush();
    expect(FORE.gate).toEqual({ bricks: 0, iron: true, lamps: true });
    // 不认识的地块、变体：什么也不做
    L.land('nowhere', 'open', 'x');
    L.landPreview('golf_west', 'oasis_lawn');
    L.flush();
    resetForeshadow();
  });
});
