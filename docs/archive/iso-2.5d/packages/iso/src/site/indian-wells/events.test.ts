import { describe, expect, it } from 'vitest';
import { Group, type Node } from '../../core/graph';
import { EVENT_KINDS } from './events';
import { SLAB } from './ground';
import { buildIndianWells, createFacilityOverlays, type SiteWorld } from './overlays';
import { PREP_PHASES } from './prep';

/** 不碰画布的假世界：只记节点、灯和地面画了几次 */
function fakeWorld() {
  const statics = new Group();
  const scene = new Group();
  let lamps = 0;
  let paints = 0;
  const w: SiteWorld = {
    statics,
    scene,
    // 整张地面重画一次 = 先铺一遍整块浮空岛的沙漠
    ground: { paintRect: (x0, x1) => void (x0 === SLAB.x0 && x1 === SLAB.x1 && paints++) },
    addLamp: () => {
      lamps++;
      return () => void lamps--;
    },
    view: { invalidate: () => {} },
  };
  return { w, statics, scene, lamps: () => lamps, paints: () => paints };
}

const show = (root: Node, name: string) => root.children.find((n) => n.name === name);

describe('赛事日布置和表演赛筹备（event / prep）', () => {
  it('没设过赛事和筹备时不建这一层', () => {
    const f = fakeWorld();
    buildIndianWells(f.w);
    createFacilityOverlays(f.w).flush();
    expect(show(f.statics, 'indian-wells-show')).toBeUndefined();
    expect(show(f.scene, 'indian-wells-show-anim')).toBeUndefined();
  });

  it('每种赛事在它的地点上都有布置，撤掉以后节点和灯都还回去', () => {
    const at: Record<string, string> = {
      cup_monthly: 'outer_1',
      invitational: 'outer_23',
      regional_open: 'entrance',
      junior_regional: 'entrance',
      exhibition: 'stadium_1',
    };
    for (const kind of EVENT_KINDS) {
      const f = fakeWorld();
      buildIndianWells(f.w);
      const ov = createFacilityOverlays(f.w);
      const lamps0 = f.lamps();
      ov.event(at[kind] as string, kind);
      ov.flush();
      const st = show(f.statics, 'indian-wells-show') as Group;
      const dy = show(f.scene, 'indian-wells-show-anim') as Group;
      expect(st.children.length + dy.children.length, kind).toBeGreaterThan(0);
      ov.event(at[kind] as string, null);
      ov.flush();
      expect(st.children.length + dy.children.length, kind).toBe(0);
      expect(f.lamps(), kind).toBe(lamps0);
    }
  });

  it('布置都在浮空岛上；不认识的赛事和筹备不理', () => {
    const f = fakeWorld();
    buildIndianWells(f.w);
    const ov = createFacilityOverlays(f.w);
    ov.event('outer_23', 'invitational');
    ov.event('stadium_1', 'exhibition');
    ov.event('entrance', 'junior_regional');
    for (const p of PREP_PHASES) ov.prep(p, true);
    ov.event('plaza', 'no_such_event');
    ov.prep('prep_fireworks', true);
    ov.flush();
    const nodes = [
      ...(show(f.statics, 'indian-wells-show') as Group).children,
      ...(show(f.scene, 'indian-wells-show-anim') as Group).children,
    ];
    expect(nodes.length).toBeGreaterThan(20);
    for (const n of nodes) {
      const b = (n as unknown as { bounds: { x0: number; x1: number; z0: number; z1: number } }).bounds;
      expect(b.x0).toBeGreaterThanOrEqual(SLAB.x0);
      expect(b.x1).toBeLessThanOrEqual(SLAB.x1);
      expect(b.z0).toBeGreaterThanOrEqual(SLAB.z0);
      expect(b.z1).toBeLessThanOrEqual(SLAB.z1);
    }
  });

  it('同一轮里几次改动只重建一次', async () => {
    const f = fakeWorld();
    buildIndianWells(f.w);
    const ov = createFacilityOverlays(f.w);
    const p0 = f.paints();
    ov.event('outer_23', 'invitational');
    ov.prep('prep_stands', false);
    ov.prep('prep_lights', true);
    await Promise.resolve();
    expect(f.paints() - p0).toBe(1);
    ov.prep('prep_lights', false);
    ov.event('outer_23', null);
    await Promise.resolve();
    expect(f.paints() - p0).toBe(2);
  });
});
